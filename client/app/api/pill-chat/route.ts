import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@/lib/supabase/server';

const OPENING_MESSAGE = '¿Qué más quieres saber de esta píldora?';
const RETENTION_DAYS = 90;
const RECENT_CONTEXT_MESSAGES = 8;
const SUMMARY_UPDATE_EVERY = 6;

interface ConversationRow {
  id: string;
  user_id: string;
  pill_id: number;
  summary_text: string | null;
  summary_message_count: number | null;
  updated_at: string;
}

interface MessageRow {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface PillRow {
  id: number;
  title: string;
  content: string;
  category: string;
}

interface PostBody {
  pill_id: number;
  conversation_id: string;
  message: string;
}

interface PillContentRow {
  generated_text: string | null;
}

function parsePillId(raw: string | null): number | null {
  if (!raw) {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function getModelCandidates(): string[] {
  const primary = (process.env.GENAI_MODEL ?? 'gemini-2.5-flash-lite').trim();
  const fallbacks = (process.env.GENAI_FALLBACK_MODELS ?? '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .filter((name) => name !== primary);

  return [primary, ...fallbacks];
}

async function generateWithFallback(prompt: string): Promise<string> {
  const apiKey = process.env.GENAI_API_KEY;
  if (!apiKey) {
    throw new Error('GENAI_API_KEY no configurada en entorno.');
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const candidates = getModelCandidates();
  const errors: string[] = [];

  for (const modelName of candidates) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      if (!text) {
        throw new Error('Respuesta vacía del modelo.');
      }

      return text;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido';
      errors.push(`${modelName}: ${message}`);
    }
  }

  throw new Error(`No se pudo generar respuesta con los modelos configurados: ${errors.join(' | ')}`);
}

async function cleanupExpiredConversations(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from('chat_conversations')
    .delete()
    .eq('user_id', userId)
    .lt('updated_at', cutoffDate);

  if (error) {
    console.warn('[pill-chat] cleanup warning:', error.message);
  }
}

async function touchConversation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  userId: string
) {
  const { error } = await supabase
    .from('chat_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId)
    .eq('user_id', userId);

  if (error) {
    console.warn('[pill-chat] touch warning:', error.message);
  }
}

async function fetchPill(supabase: Awaited<ReturnType<typeof createClient>>, pillId: number): Promise<PillRow | null> {
  const { data, error } = await supabase
    .from('pills')
    .select('id,title,content,category')
    .eq('id', pillId)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo leer la píldora: ${error.message}`);
  }

  return (data as PillRow | null) ?? null;
}

async function fetchReadyPillContent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pillId: number
): Promise<string | null> {
  const { data, error } = await supabase
    .from('pill_contents')
    .select('generated_text')
    .eq('pill_id', pillId)
    .eq('status', 'ready')
    .not('generated_text', 'is', null)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo leer el contenido generado: ${error.message}`);
  }

  const generatedText = (data as PillContentRow | null)?.generated_text?.trim();
  return generatedText || null;
}

async function fetchPreferences(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase
    .from('users')
    .select('preferences')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[pill-chat] preferences warning:', error.message);
    return {};
  }

  const preferences = (data as { preferences?: unknown } | null)?.preferences;
  if (preferences && typeof preferences === 'object' && !Array.isArray(preferences)) {
    return preferences as Record<string, unknown>;
  }

  return {};
}

async function fetchMessages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string
): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id,role,content,created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(`No se pudieron leer mensajes: ${error.message}`);
  }

  return (data ?? []) as MessageRow[];
}

async function fetchRecentMessages(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversationId: string,
  limit: number
): Promise<MessageRow[]> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id,role,content,created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`No se pudo leer historial reciente: ${error.message}`);
  }

  return [...((data ?? []) as MessageRow[])].reverse();
}

function renderHistory(messages: Pick<MessageRow, 'role' | 'content'>[]): string {
  if (messages.length === 0) {
    return '(sin historial reciente)';
  }

  return messages
    .map((message) => `${message.role === 'user' ? 'Usuario' : 'Asistente'}: ${message.content}`)
    .join('\n');
}

function buildAssistantPrompt(params: {
  pill: PillRow;
  generatedText: string;
  preferences: Record<string, unknown>;
  summary: string;
  recentMessages: MessageRow[];
}): string {
  const preferencesText =
    Object.keys(params.preferences).length > 0
      ? JSON.stringify(params.preferences)
      : '(sin preferencias específicas)';

  return `# Rol
Eres el asistente de DailyPill. Explicas con claridad y rigor pedagógico.

# Contexto de la píldora actual
- Tema: ${params.pill.category}
- Título: ${params.pill.title}
- Subtítulo: ${params.pill.content}
- Texto generado de la píldora: ${params.generatedText || '(no disponible)'}

# Preferencias del usuario
${preferencesText}

# Resumen acumulado de conversación
${params.summary || '(sin resumen todavía)'}

# Historial reciente (últimos ${RECENT_CONTEXT_MESSAGES} mensajes)
${renderHistory(params.recentMessages)}

# Restricciones obligatorias
- Responde SOLO sobre la píldora actual y su contenido.
- Si la pregunta está fuera de tema, rechaza brevemente y reconduce con una pregunta o sugerencia sobre la píldora.
- Escribe en español, texto plano, sin Markdown.
- Mantén respuesta breve y didáctica (objetivo 80-140 palabras).
- No inventes datos no respaldados por el contexto cuando no sean necesarios.

# Salida
Devuelve solo la respuesta final para el usuario.`;
}

function buildSummaryPrompt(summary: string, recentMessages: MessageRow[]): string {
  return `Actualiza un resumen de memoria de conversación para uso interno.

Resumen previo:
${summary || '(sin resumen previo)'}

Mensajes recientes:
${renderHistory(recentMessages)}

Reglas:
- Español.
- Texto plano, sin Markdown.
- Máximo 120 palabras.
- Conserva hechos clave, dudas abiertas y preferencias del usuario relacionadas con esta píldora.

Devuelve solo el resumen actualizado.`;
}

async function maybeUpdateSummary(
  supabase: Awaited<ReturnType<typeof createClient>>,
  conversation: ConversationRow,
  userId: string
) {
  try {
    const { count, error: countError } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('conversation_id', conversation.id);

    if (countError || !count) {
      return;
    }

    const lastSummaryCount = conversation.summary_message_count ?? 0;
    if (count - lastSummaryCount < SUMMARY_UPDATE_EVERY) {
      return;
    }

    const recentMessages = await fetchRecentMessages(supabase, conversation.id, 20);
    const summaryPrompt = buildSummaryPrompt(conversation.summary_text ?? '', recentMessages);
    const updatedSummary = await generateWithFallback(summaryPrompt);

    const { error: updateError } = await supabase
      .from('chat_conversations')
      .update({
        summary_text: updatedSummary,
        summary_message_count: count,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation.id)
      .eq('user_id', userId);

    if (updateError) {
      console.warn('[pill-chat] summary update warning:', updateError.message);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn('[pill-chat] summary generation warning:', message);
  }
}

async function createConversationWithOpening(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  pillId: number
): Promise<ConversationRow> {
  const { data: insertedConversation, error: insertConversationError } = await supabase
    .from('chat_conversations')
    .insert({ user_id: userId, pill_id: pillId })
    .select('id,user_id,pill_id,summary_text,summary_message_count,updated_at')
    .single();

  if (insertConversationError) {
    throw new Error(`No se pudo crear conversación: ${insertConversationError.message}`);
  }

  const conversation = insertedConversation as ConversationRow;

  const { error: openingError } = await supabase.from('chat_messages').insert({
    conversation_id: conversation.id,
    role: 'assistant',
    content: OPENING_MESSAGE,
  });

  if (openingError) {
    throw new Error(`No se pudo crear mensaje inicial: ${openingError.message}`);
  }

  await touchConversation(supabase, conversation.id, userId);
  return conversation;
}

async function getOrCreateConversation(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  pillId: number
): Promise<ConversationRow> {
  const { data: existingConversation, error: existingError } = await supabase
    .from('chat_conversations')
    .select('id,user_id,pill_id,summary_text,summary_message_count,updated_at')
    .eq('user_id', userId)
    .eq('pill_id', pillId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`No se pudo leer conversación: ${existingError.message}`);
  }

  if (existingConversation) {
    return existingConversation as ConversationRow;
  }

  try {
    return await createConversationWithOpening(supabase, userId, pillId);
  } catch (error) {
    const { data: afterRace } = await supabase
      .from('chat_conversations')
      .select('id,user_id,pill_id,summary_text,summary_message_count,updated_at')
      .eq('user_id', userId)
      .eq('pill_id', pillId)
      .maybeSingle();

    if (afterRace) {
      return afterRace as ConversationRow;
    }

    throw error;
  }
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  try {
    const pillId = parsePillId(request.nextUrl.searchParams.get('pill_id'));
    if (!pillId) {
      return errorResponse('pill_id inválido.', 400);
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return errorResponse('No autorizado', 401);
    }

    await cleanupExpiredConversations(supabase, user.id);

    const pill = await fetchPill(supabase, pillId);
    if (!pill) {
      return errorResponse('Píldora no encontrada.', 404);
    }

    const conversation = await getOrCreateConversation(supabase, user.id, pillId);
    const messages = await fetchMessages(supabase, conversation.id);
    await touchConversation(supabase, conversation.id, user.id);

    return NextResponse.json({
      conversation_id: conversation.id,
      messages,
    });
  } catch (error) {
    console.error('[pill-chat][GET] Error:', error);
    return errorResponse('Error interno del servidor', 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<PostBody>;
    const pillId = Number(body.pill_id);
    const conversationId = body.conversation_id?.trim();
    const message = body.message?.trim();

    if (!Number.isInteger(pillId) || pillId <= 0) {
      return errorResponse('pill_id inválido.', 400);
    }

    if (!conversationId) {
      return errorResponse('conversation_id es obligatorio.', 400);
    }

    if (!message) {
      return errorResponse('message es obligatorio.', 400);
    }

    if (message.length > 1500) {
      return errorResponse('message excede el máximo permitido.', 400);
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return errorResponse('No autorizado', 401);
    }

    await cleanupExpiredConversations(supabase, user.id);

    const { data: conversationData, error: conversationError } = await supabase
      .from('chat_conversations')
      .select('id,user_id,pill_id,summary_text,summary_message_count,updated_at')
      .eq('id', conversationId)
      .maybeSingle();

    if (conversationError) {
      return errorResponse(`No se pudo leer conversación: ${conversationError.message}`, 500);
    }

    if (!conversationData) {
      return errorResponse('Conversación no encontrada.', 404);
    }

    const conversation = conversationData as ConversationRow;
    if (conversation.user_id !== user.id || conversation.pill_id !== pillId) {
      return errorResponse('Conversación no válida para esta píldora.', 403);
    }

    const pill = await fetchPill(supabase, pillId);
    if (!pill) {
      return errorResponse('Píldora no encontrada.', 404);
    }

    const generatedText = await fetchReadyPillContent(supabase, pillId);
    if (!generatedText) {
      return errorResponse('El contenido de esta pildora no esta disponible todavia.', 409);
    }

    const { error: userInsertError } = await supabase.from('chat_messages').insert({
      conversation_id: conversation.id,
      role: 'user',
      content: message,
    });

    if (userInsertError) {
      return errorResponse(`No se pudo guardar mensaje de usuario: ${userInsertError.message}`, 500);
    }

    const [preferences, recentMessages] = await Promise.all([
      fetchPreferences(supabase, user.id),
      fetchRecentMessages(supabase, conversation.id, RECENT_CONTEXT_MESSAGES),
    ]);

    const prompt = buildAssistantPrompt({
      pill,
      generatedText,
      preferences,
      summary: conversation.summary_text ?? '',
      recentMessages,
    });

    const assistantText = await generateWithFallback(prompt);

    const { data: assistantRow, error: assistantInsertError } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversation.id,
        role: 'assistant',
        content: assistantText,
      })
      .select('id,role,content,created_at')
      .single();

    if (assistantInsertError || !assistantRow) {
      return errorResponse(
        `No se pudo guardar respuesta del asistente: ${assistantInsertError?.message ?? 'Sin datos'}`,
        500
      );
    }

    await touchConversation(supabase, conversation.id, user.id);
    await maybeUpdateSummary(supabase, conversation, user.id);

    return NextResponse.json({
      conversation_id: conversation.id,
      assistant_message: assistantRow,
    });
  } catch (error) {
    console.error('[pill-chat][POST] Error:', error);
    return errorResponse('Error interno del servidor', 500);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const pillId = parsePillId(request.nextUrl.searchParams.get('pill_id'));
    if (!pillId) {
      return errorResponse('pill_id inválido.', 400);
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return errorResponse('No autorizado', 401);
    }

    await cleanupExpiredConversations(supabase, user.id);

    const { data: existingConversation } = await supabase
      .from('chat_conversations')
      .select('id')
      .eq('user_id', user.id)
      .eq('pill_id', pillId)
      .maybeSingle();

    if (existingConversation?.id) {
      const { error: deleteError } = await supabase
        .from('chat_conversations')
        .delete()
        .eq('id', existingConversation.id)
        .eq('user_id', user.id);

      if (deleteError) {
        return errorResponse(`No se pudo reiniciar la conversación: ${deleteError.message}`, 500);
      }
    }

    const conversation = await createConversationWithOpening(supabase, user.id, pillId);
    const messages = await fetchMessages(supabase, conversation.id);

    return NextResponse.json({
      conversation_id: conversation.id,
      messages,
    });
  } catch (error) {
    console.error('[pill-chat][DELETE] Error:', error);
    return errorResponse('Error interno del servidor', 500);
  }
}
