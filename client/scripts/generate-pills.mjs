import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const DEFAULT_OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
const DEFAULT_INTERVAL_MS = 3000;
const DEFAULT_PROMPT_VERSION = 'v2';
const DEFAULT_CORRECTION_ATTEMPTS = 2;
const PAGE_SIZE = 100;
const MIN_WORD_COUNT = 20;
const MAX_WORD_COUNT = 75;

const EMOJI_REGEX = /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|\uFE0F)/u;
const LEADING_LABEL_REGEX = /^\s*[A-Za-z][A-Za-z\s]{0,24}:\s*/u;
const MARKDOWN_PATTERNS = [
  {
    regex: /[*_`]/u,
    reason: 'No puede contener Markdown ni marcas de formato como asteriscos, guiones bajos o backticks.',
  },
  {
    regex: /^\s{0,3}#{1,6}\s+/mu,
    reason: 'No puede contener encabezados Markdown.',
  },
  {
    regex: /^\s{0,3}>\s+/mu,
    reason: 'No puede contener bloques de cita.',
  },
  {
    regex: /^\s{0,3}[-*+]\s+/mu,
    reason: 'No puede contener listas Markdown.',
  },
  {
    regex: /^\s{0,3}\d+\.\s+/mu,
    reason: 'No puede contener listas numeradas.',
  },
];

const OUTPUT_RULES = [
  `- Un unico parrafo, sin saltos de linea.`,
  `- Solo texto plano.`,
  `- Sin emojis, emoticonos ni simbolos decorativos.`,
  `- Sin Markdown ni formato: nada de asteriscos, guiones bajos, backticks, encabezados, listas o citas.`,
  `- Sin etiquetas ni apartados como "GANCHO:", "EXPLICACION:", "CIERRE:", "HOOK:" o equivalentes.`,
  `- Sin saludos ni despedidas.`,
  `- Entre ${MIN_WORD_COUNT} y ${MAX_WORD_COUNT} palabras.`,
  `- Devuelve exclusivamente el texto final de la pildora.`,
];

function parseArgs(argv) {
  const options = {
    count: null,
    loop: false,
    intervalMs: DEFAULT_INTERVAL_MS,
    retryFailed: false,
    revalidateReady: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--loop') {
      options.loop = true;
      continue;
    }

    if (arg === '--retry-failed') {
      options.retryFailed = true;
      continue;
    }

    if (arg === '--revalidate-ready') {
      options.revalidateReady = true;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--count' || arg.startsWith('--count=')) {
      const rawValue = arg.includes('=') ? arg.split('=')[1] : argv[++index];
      options.count = parsePositiveInt(rawValue, '--count');
      continue;
    }

    if (arg === '--interval-ms' || arg.startsWith('--interval-ms=')) {
      const rawValue = arg.includes('=') ? arg.split('=')[1] : argv[++index];
      options.intervalMs = parseNonNegativeInt(rawValue, '--interval-ms');
      continue;
    }

    throw new Error(`Argumento no soportado: ${arg}`);
  }

  return {
    ...options,
    maxAttempts: options.count ?? (options.loop ? Number.POSITIVE_INFINITY : 1),
  };
}

function parsePositiveInt(rawValue, flagName) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flagName} debe ser un entero positivo.`);
  }

  return parsed;
}

function parseNonNegativeInt(rawValue, flagName) {
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${flagName} debe ser un entero mayor o igual que 0.`);
  }

  return parsed;
}

function printHelp() {
  console.log(`Uso:
  node scripts/generate-pills.mjs [--count N] [--loop] [--interval-ms N] [--retry-failed] [--revalidate-ready]

Ejemplos:
  npm run pills:generate -- --count 10
  npm run pills:generate -- --count 20 --retry-failed
  npm run pills:generate -- --count 50 --revalidate-ready
  npm run pills:generate -- --loop --interval-ms 3000 --retry-failed
  npm run pills:generate:loop
`);
}

function loadEnvFiles() {
  loadEnvFile(path.join(projectRoot, '.env'));
  loadEnvFile(path.join(projectRoot, '.env.local'));
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, 'utf8');
  const lines = contents.split(/\r?\n/u);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

function getConfig() {
  const requiredKeys = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'OLLAMA_MODEL'];

  for (const key of requiredKeys) {
    if (!process.env[key]?.trim()) {
      throw new Error(`Falta la variable de entorno obligatoria: ${key}`);
    }
  }

  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL.trim(),
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY.trim(),
    ollamaBaseUrl: (process.env.OLLAMA_BASE_URL ?? DEFAULT_OLLAMA_BASE_URL).trim().replace(/\/+$/u, ''),
    ollamaModel: process.env.OLLAMA_MODEL.trim(),
    promptVersion: (process.env.PILL_PROMPT_VERSION ?? DEFAULT_PROMPT_VERSION).trim(),
  };
}

function createAdminClient(config) {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function verifyDatabaseShape(supabase) {
  const { error: pillsError } = await supabase
    .from('pills')
    .select('id,title,content,category')
    .limit(1);

  if (pillsError) {
    throw new Error(`No se pudo verificar public.pills: ${pillsError.message}`);
  }

  const { error: contentsError } = await supabase
    .from('pill_contents')
    .select('pill_id', { count: 'exact', head: true });

  if (contentsError) {
    throw new Error(
      `No se pudo verificar public.pill_contents. Ejecuta primero la migracion 003_pill_contents.sql. Detalle: ${contentsError.message}`
    );
  }
}

async function fetchNextCandidate(supabase, options, attemptedIds) {
  let cursor = 0;

  while (true) {
    const { data: pills, error: pillsError } = await supabase
      .from('pills')
      .select('id,title,content,category')
      .gt('id', cursor)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);

    if (pillsError) {
      throw new Error(`No se pudieron leer pildoras base: ${pillsError.message}`);
    }

    if (!pills || pills.length === 0) {
      return null;
    }

    const pillIds = pills.map((pill) => pill.id);
    const { data: contentRows, error: contentsError } = await supabase
      .from('pill_contents')
      .select('pill_id,status,generated_text')
      .in('pill_id', pillIds);

    if (contentsError) {
      throw new Error(`No se pudo leer public.pill_contents: ${contentsError.message}`);
    }

    const contentByPillId = new Map((contentRows ?? []).map((row) => [row.pill_id, row]));

    for (const pill of pills) {
      if (attemptedIds.has(pill.id)) {
        continue;
      }

      const contentRow = contentByPillId.get(pill.id);

      if (!contentRow) {
        return {
          pill,
          mode: 'generate_pending',
          existingContent: null,
        };
      }

      if (options.retryFailed && contentRow.status === 'failed') {
        return {
          pill,
          mode: 'retry_failed',
          existingContent: contentRow,
        };
      }

      if (options.revalidateReady && contentRow.status === 'ready') {
        return {
          pill,
          mode: 'revalidate_ready',
          existingContent: contentRow,
        };
      }
    }

    cursor = pills[pills.length - 1].id;
  }
}

function buildPrompt(pill) {
  return `# ROL
Actua como un experto divulgador cultural.

# TAREA
Redacta una "Pildora de Conocimiento Diaria" basada en:
1. TEMA: ${pill.category}
2. TITULO: ${pill.title}
3. SUBTITULO: ${pill.content}

# OBJETIVO EDITORIAL
- Empieza con un gancho impactante o contraintuitivo.
- Explica el por que o el como de forma sencilla y rigurosa.
- Cierra con una idea que deje curiosidad o reflexion.

# REGLAS OBLIGATORIAS
${OUTPUT_RULES.join('\n')}

# OUTPUT
Solo el texto final de la pildora.`;
}

function buildCorrectionPrompt(pill, invalidText, reasons) {
  return `# ROL
Actua como editor de calidad de un generador de pildoras de conocimiento.

# TAREA
Corrige el texto invalido para que cumpla todas las reglas formales y mantenga el tema original.

# CONTEXTO
TEMA: ${pill.category}
TITULO: ${pill.title}
SUBTITULO: ${pill.content}

# INCUMPLIMIENTOS DETECTADOS
${reasons.map((reason) => `- ${reason}`).join('\n')}

# REGLAS OBLIGATORIAS
${OUTPUT_RULES.join('\n')}

# TEXTO INVALIDO
${invalidText || '[vacio]'}

# OUTPUT
Devuelve solo la version corregida final.`;
}

async function generateWithOllama(config, prompt) {
  const response = await fetch(`${config.ollamaBaseUrl}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.ollamaModel,
      prompt,
      stream: false,
    }),
  });

  const rawText = await response.text();
  let payload = null;

  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail =
      payload && typeof payload.error === 'string'
        ? payload.error
        : rawText || `HTTP ${response.status}`;
    throw new Error(`Ollama devolvio error: ${detail}`);
  }

  const generated = typeof payload?.response === 'string' ? payload.response : '';
  return sanitizeRawGeneratedText(generated);
}

function sanitizeRawGeneratedText(text) {
  return String(text ?? '').replace(/\u00A0/gu, ' ').trim();
}

function normalizeGeneratedText(text) {
  return sanitizeRawGeneratedText(text).replace(/\s+/gu, ' ').trim();
}

function validateGeneratedText(text) {
  const rawText = sanitizeRawGeneratedText(text);
  const normalizedText = normalizeGeneratedText(rawText);
  const reasons = [];

  if (!rawText) {
    reasons.push('La respuesta del modelo llego vacia.');
  }

  if (/[\r\n]/u.test(rawText)) {
    reasons.push('Debe ser un unico parrafo sin saltos de linea.');
  }

  if (EMOJI_REGEX.test(rawText)) {
    reasons.push('No puede contener emojis, emoticonos ni pictogramas.');
  }

  if (LEADING_LABEL_REGEX.test(rawText)) {
    reasons.push('No puede empezar con una etiqueta o encabezado terminado en dos puntos.');
  }

  for (const pattern of MARKDOWN_PATTERNS) {
    if (pattern.regex.test(rawText)) {
      reasons.push(pattern.reason);
    }
  }

  if (normalizedText) {
    const wordCount = normalizedText.split(/\s+/u).filter(Boolean).length;

    if (wordCount < MIN_WORD_COUNT) {
      reasons.push(`La respuesta es demasiado corta (${wordCount} palabras).`);
    }

    if (wordCount > MAX_WORD_COUNT) {
      reasons.push(`La respuesta es demasiado larga (${wordCount} palabras).`);
    }

    if (!/[A-Za-z0-9]/u.test(normalizedText)) {
      reasons.push('Debe contener texto legible.');
    }

    return {
      isValid: reasons.length === 0,
      reasons,
      rawText,
      normalizedText,
      wordCount,
    };
  }

  return {
    isValid: reasons.length === 0,
    reasons,
    rawText,
    normalizedText,
    wordCount: 0,
  };
}

function buildValidationHistoryMessage(history) {
  return history
    .map((entry, index) => {
      const stage = index === 0 ? 'validacion inicial' : `correccion ${index}`;
      return `${stage}: ${entry.reasons.join(' | ')}`;
    })
    .join(' || ');
}

function createValidationError(history, lastAttemptText) {
  const message = `No se pudo obtener una pildora valida tras ${DEFAULT_CORRECTION_ATTEMPTS} correcciones. ${buildValidationHistoryMessage(history)}`;
  const error = new Error(message);
  error.name = 'GeneratedTextValidationError';
  error.lastAttemptText = lastAttemptText;
  error.reasons = history[history.length - 1]?.reasons ?? [];
  return error;
}

async function ensureValidGeneratedText(config, pill, initialText) {
  let candidateText = sanitizeRawGeneratedText(initialText);
  let validation = validateGeneratedText(candidateText);
  const history = [validation];

  if (validation.isValid) {
    return {
      text: validation.normalizedText,
      wordCount: validation.wordCount,
      corrected: false,
      correctionAttempts: 0,
    };
  }

  for (let attempt = 1; attempt <= DEFAULT_CORRECTION_ATTEMPTS; attempt += 1) {
    const correctionPrompt = buildCorrectionPrompt(pill, candidateText, validation.reasons);
    candidateText = await generateWithOllama(config, correctionPrompt);
    validation = validateGeneratedText(candidateText);
    history.push(validation);

    if (validation.isValid) {
      return {
        text: validation.normalizedText,
        wordCount: validation.wordCount,
        corrected: true,
        correctionAttempts: attempt,
      };
    }
  }

  throw createValidationError(history, candidateText);
}

async function saveReadyContent(supabase, pill, text, config) {
  const timestamp = new Date().toISOString();
  const { error } = await supabase.from('pill_contents').upsert(
    {
      pill_id: pill.id,
      status: 'ready',
      generated_text: text,
      generator: 'ollama',
      model: config.ollamaModel,
      prompt_version: config.promptVersion,
      last_error: null,
      last_generated_at: timestamp,
      updated_at: timestamp,
    },
    {
      onConflict: 'pill_id',
    }
  );

  if (error) {
    throw new Error(`No se pudo guardar la pildora generada: ${error.message}`);
  }
}

async function saveFailedContent(supabase, pill, errorMessage, config, lastAttemptText = null) {
  const timestamp = new Date().toISOString();
  const { error } = await supabase.from('pill_contents').upsert(
    {
      pill_id: pill.id,
      status: 'failed',
      generated_text: lastAttemptText,
      generator: 'ollama',
      model: config.ollamaModel,
      prompt_version: config.promptVersion,
      last_error: errorMessage,
      updated_at: timestamp,
    },
    {
      onConflict: 'pill_id',
    }
  );

  if (error) {
    throw new Error(`No se pudo registrar el fallo de generacion: ${error.message}`);
  }
}

function formatLabel(pill) {
  const compactTitle = String(pill.title ?? '')
    .replace(/\s+/gu, ' ')
    .trim();
  return `#${pill.id}${compactTitle ? ` ${compactTitle}` : ''}`;
}

function formatMode(mode) {
  if (mode === 'retry_failed') {
    return 'retry_failed';
  }

  if (mode === 'revalidate_ready') {
    return 'revalidate_ready';
  }

  return 'generate_pending';
}

function sleep(ms) {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function run() {
  loadEnvFiles();
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const config = getConfig();
  const supabase = createAdminClient(config);

  console.log(
    `Iniciando generador batch con modelo=${config.ollamaModel}, prompt_version=${config.promptVersion}, loop=${options.loop}, retry_failed=${options.retryFailed}, revalidate_ready=${options.revalidateReady}, max_attempts=${Number.isFinite(options.maxAttempts) ? options.maxAttempts : 'sin limite'}`
  );

  await verifyDatabaseShape(supabase);

  let stopRequested = false;
  let sigintCount = 0;

  process.on('SIGINT', () => {
    sigintCount += 1;

    if (sigintCount > 1) {
      process.exit(130);
    }

    stopRequested = true;
    console.log('SIGINT recibido. Se detendra tras la iteracion actual.');
  });

  const stats = {
    processed: 0,
    ready: 0,
    failed: 0,
    corrected: 0,
    unchanged: 0,
  };
  const attemptedIds = new Set();

  while (!stopRequested && stats.processed < options.maxAttempts) {
    const candidate = await fetchNextCandidate(supabase, options, attemptedIds);

    if (!candidate) {
      console.log('No quedan pildoras pendientes para este modo de ejecucion.');
      break;
    }

    const { pill, mode, existingContent } = candidate;
    stats.processed += 1;
    attemptedIds.add(pill.id);
    const label = formatLabel(pill);
    console.log(`[${stats.processed}] Procesando ${label} (${formatMode(mode)})`);

    try {
      const initialText =
        mode === 'revalidate_ready'
          ? existingContent?.generated_text ?? ''
          : await generateWithOllama(config, buildPrompt(pill));

      const resolved = await ensureValidGeneratedText(config, pill, initialText);

      if (mode === 'revalidate_ready' && !resolved.corrected) {
        stats.unchanged += 1;
        console.log(`  unchanged: contenido ready ya valido (${resolved.wordCount} palabras)`);
      } else {
        await saveReadyContent(supabase, pill, resolved.text, config);
        stats.ready += 1;

        if (resolved.corrected) {
          stats.corrected += 1;
          console.log(
            `  ready: corregida y guardada (${resolved.wordCount} palabras, ${resolved.correctionAttempts} correcciones)`
          );
        } else {
          console.log(`  ready: ${resolved.wordCount} palabras guardadas`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      const lastAttemptText =
        error instanceof Error && 'lastAttemptText' in error
          ? error.lastAttemptText
          : existingContent?.generated_text ?? null;

      stats.failed += 1;
      console.error(`  failed: ${message}`);
      await saveFailedContent(supabase, pill, message, config, lastAttemptText);
    }

    if (stopRequested || stats.processed >= options.maxAttempts) {
      break;
    }

    if (options.loop) {
      await sleep(options.intervalMs);
    }
  }

  console.log(
    `Resumen final: processed=${stats.processed}, ready=${stats.ready}, failed=${stats.failed}, corrected=${stats.corrected}, unchanged=${stats.unchanged}`
  );

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : 'Error desconocido';
  console.error(`Error fatal: ${message}`);
  process.exitCode = 1;
});
