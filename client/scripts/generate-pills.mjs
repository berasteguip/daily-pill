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
const DEFAULT_PROMPT_VERSION = 'v1';
const PAGE_SIZE = 100;

function parseArgs(argv) {
  const options = {
    count: null,
    loop: false,
    intervalMs: DEFAULT_INTERVAL_MS,
    retryFailed: false,
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
  node scripts/generate-pills.mjs [--count N] [--loop] [--interval-ms N] [--retry-failed]

Ejemplos:
  npm run pills:generate -- --count 10
  npm run pills:generate -- --count 20 --retry-failed
  npm run pills:generate -- --loop --interval-ms 3000
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

async function fetchNextCandidate(supabase, retryFailed, attemptedIds) {
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
      .select('pill_id,status')
      .in('pill_id', pillIds);

    if (contentsError) {
      throw new Error(`No se pudo leer public.pill_contents: ${contentsError.message}`);
    }

    const statusByPillId = new Map((contentRows ?? []).map((row) => [row.pill_id, row.status]));

    for (const pill of pills) {
      if (attemptedIds.has(pill.id)) {
        continue;
      }

      const status = statusByPillId.get(pill.id);
      if (!status || (retryFailed && status === 'failed')) {
        return pill;
      }
    }

    cursor = pills[pills.length - 1].id;
  }
}

function buildPrompt(pill) {
  return `# ROL
Actua como un experto divulgador cultural y creador de contenido de micro-learning.

# TAREA
Redacta una "Pildora de Conocimiento Diaria" con estos datos:
- Tema general: ${pill.category}
- Titulo: ${pill.title}
- Subtitulo: ${pill.content}

# INSTRUCCIONES
- Empieza con el dato mas impactante, una pregunta retorica o una afirmacion contraintuitiva.
- Explica el porque o el como con rigor, pero de forma sencilla.
- Cierra con una frase breve que deje reflexion o curiosidad.
- Escribe en espanol.
- Usa texto plano, sin Markdown, sin asteriscos y sin listas.
- Extension objetivo: entre 50 y 75 palabras.

# SALIDA
Devuelve solo el texto final de la pildora.`;
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
  return normalizeGeneratedText(generated);
}

function normalizeGeneratedText(text) {
  return text.replace(/\s+/gu, ' ').trim();
}

function validateGeneratedText(text) {
  if (!text) {
    throw new Error('La respuesta del modelo llego vacia.');
  }

  const wordCount = text.split(/\s+/u).filter(Boolean).length;

  if (wordCount < 20) {
    throw new Error(`La respuesta es demasiado corta (${wordCount} palabras).`);
  }

  if (wordCount > 120) {
    throw new Error(`La respuesta es demasiado larga (${wordCount} palabras).`);
  }
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

async function saveFailedContent(supabase, pill, errorMessage, config) {
  const timestamp = new Date().toISOString();
  const { error } = await supabase.from('pill_contents').upsert(
    {
      pill_id: pill.id,
      status: 'failed',
      generated_text: null,
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
    `Iniciando generador batch con modelo=${config.ollamaModel}, prompt_version=${config.promptVersion}, loop=${options.loop}, retry_failed=${options.retryFailed}, max_attempts=${Number.isFinite(options.maxAttempts) ? options.maxAttempts : 'sin limite'}`
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
  };
  const attemptedIds = new Set();

  while (!stopRequested && stats.processed < options.maxAttempts) {
    const pill = await fetchNextCandidate(supabase, options.retryFailed, attemptedIds);

    if (!pill) {
      console.log('No quedan pildoras pendientes para este modo de ejecucion.');
      break;
    }

    stats.processed += 1;
    attemptedIds.add(pill.id);
    const label = formatLabel(pill);
    console.log(`[${stats.processed}] Procesando ${label}`);

    try {
      const prompt = buildPrompt(pill);
      const generatedText = await generateWithOllama(config, prompt);
      validateGeneratedText(generatedText);
      await saveReadyContent(supabase, pill, generatedText, config);

      const wordCount = generatedText.split(/\s+/u).filter(Boolean).length;
      stats.ready += 1;
      console.log(`  ready: ${wordCount} palabras guardadas`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      stats.failed += 1;
      console.error(`  failed: ${message}`);
      await saveFailedContent(supabase, pill, message, config);
    }

    if (stopRequested || stats.processed >= options.maxAttempts) {
      break;
    }

    if (options.loop) {
      await sleep(options.intervalMs);
    }
  }

  console.log(`Resumen final: processed=${stats.processed}, ready=${stats.ready}, failed=${stats.failed}`);

  if (stats.failed > 0) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : 'Error desconocido';
  console.error(`Error fatal: ${message}`);
  process.exitCode = 1;
});
