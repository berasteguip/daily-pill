'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PILL_EMOJI } from '@/lib/branding';
import { useRouter } from 'next/navigation';
import PillChatSheet, { ChatMessage } from '@/app/components/PillChatSheet';

type PillId = string | number;

interface Pill {
  pill_id: PillId;
  topic: string;
  title: string;
  content: string;
  generated_text: string;
  remaining_pills: number;
}

interface ServerChatMessage {
  id: string | number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface PillChatGetResponse {
  conversation_id: string;
  messages: ServerChatMessage[];
}

interface PillChatPostResponse {
  conversation_id: string;
  assistant_message: ServerChatMessage;
}

interface PillChatResetResponse {
  conversation_id: string;
  messages: ServerChatMessage[];
}

type ChatSessions = Record<string, ChatMessage[]>;
type ConversationMap = Record<string, string>;

const CATEGORY_STYLES: Record<string, { label: string; emoji: string }> = {
  history: { label: 'Historia', emoji: '📜' },
  science_tech: { label: 'Ciencia y Tecnología', emoji: '🔬' },
  art_culture: { label: 'Arte y Cultura', emoji: '🎨' },
  nature: { label: 'Naturaleza', emoji: '🌿' },
  geography: { label: 'Geografía', emoji: '🌍' },
  politics_econ: { label: 'Política y Economía', emoji: '💰' },
  sayings: { label: 'Refranes', emoji: '💬' },
};

const CHAT_FALLBACK_ERROR = 'No he podido responder ahora. Inténtalo de nuevo en unos segundos.';

function getCategoryStyle(topic: string) {
  return CATEGORY_STYLES[topic] ?? { label: topic, emoji: '💡' };
}

function getPillKey(pillId: PillId): string {
  return String(pillId);
}

function createChatMessage(role: ChatMessage['role'], text: string): ChatMessage {
  const hasRandomUUID = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function';

  return {
    id: hasRandomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    text,
    createdAt: Date.now(),
  };
}

function mapServerMessage(message: ServerChatMessage): ChatMessage {
  const timestamp = new Date(message.created_at).getTime();

  return {
    id: String(message.id),
    role: message.role,
    text: message.content,
    createdAt: Number.isFinite(timestamp) ? timestamp : Date.now(),
  };
}

async function readApiError(res: Response): Promise<string | null> {
  try {
    const json = await res.json();
    if (json && typeof json.error === 'string') {
      return json.error;
    }

    return null;
  } catch {
    return null;
  }
}

export default function Home() {
  const [pill, setPill] = useState<Pill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAssistantTyping, setIsAssistantTyping] = useState(false);
  const [isHydratingChat, setIsHydratingChat] = useState(false);
  const [isResettingConversation, setIsResettingConversation] = useState(false);
  const [chatSessions, setChatSessions] = useState<ChatSessions>({});
  const [conversationByPill, setConversationByPill] = useState<ConversationMap>({});

  const chatSessionTokenRef = useRef(0);

  const router = useRouter();
  const supabase = createClient();

  const resetChatState = () => {
    chatSessionTokenRef.current += 1;
    setIsAssistantTyping(false);
    setIsHydratingChat(false);
    setIsResettingConversation(false);
    setIsChatOpen(false);
    setChatSessions({});
    setConversationByPill({});
  };

  const pushMessage = (pillKey: string, message: ChatMessage) => {
    setChatSessions((prev) => ({
      ...prev,
      [pillKey]: [...(prev[pillKey] ?? []), message],
    }));
  };

  const hydrateConversation = async (targetPill: Pill, force = false): Promise<string | null> => {
    const pillKey = getPillKey(targetPill.pill_id);
    const existingConversationId = conversationByPill[pillKey];
    const existingMessages = chatSessions[pillKey] ?? [];

    if (!force && existingConversationId && existingMessages.length > 0) {
      return existingConversationId;
    }

    setIsHydratingChat(true);

    try {
      const res = await fetch(`/api/pill-chat?pill_id=${encodeURIComponent(String(targetPill.pill_id))}`);

      if (!res.ok) {
        if (res.status === 401) {
          router.push('/auth/login');
          return null;
        }

        const apiError = await readApiError(res);
        throw new Error(apiError ?? 'No se pudo cargar la conversación.');
      }

      const data = (await res.json()) as PillChatGetResponse;
      const mappedMessages = data.messages.map(mapServerMessage);

      setConversationByPill((prev) => ({
        ...prev,
        [pillKey]: data.conversation_id,
      }));

      setChatSessions((prev) => ({
        ...prev,
        [pillKey]: mappedMessages,
      }));

      return data.conversation_id;
    } catch (err) {
      console.error('[chat] hydrate error:', err);
      return null;
    } finally {
      setIsHydratingChat(false);
    }
  };

  const sendMessage = async (rawText: string) => {
    if (!pill || isAssistantTyping || isHydratingChat || isResettingConversation) {
      return;
    }

    const text = rawText.trim();
    if (!text) {
      return;
    }

    const token = chatSessionTokenRef.current;
    const pillKey = getPillKey(pill.pill_id);

    let conversationId = conversationByPill[pillKey] ?? null;
    if (!conversationId) {
      conversationId = await hydrateConversation(pill);
      if (!conversationId || chatSessionTokenRef.current !== token) {
        return;
      }
    }

    pushMessage(pillKey, createChatMessage('user', text));
    setIsAssistantTyping(true);

    try {
      const res = await fetch('/api/pill-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          pill_id: Number(pill.pill_id),
          conversation_id: conversationId,
          message: text,
          pill_generated_text: pill.generated_text,
        }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push('/auth/login');
          return;
        }

        const apiError = await readApiError(res);
        throw new Error(apiError ?? 'No se pudo obtener respuesta del asistente.');
      }

      const data = (await res.json()) as PillChatPostResponse;

      if (chatSessionTokenRef.current !== token) {
        return;
      }

      setConversationByPill((prev) => ({
        ...prev,
        [pillKey]: data.conversation_id,
      }));
      pushMessage(pillKey, mapServerMessage(data.assistant_message));
    } catch (err) {
      console.error('[chat] send error:', err);

      if (chatSessionTokenRef.current !== token) {
        return;
      }

      pushMessage(pillKey, createChatMessage('assistant', CHAT_FALLBACK_ERROR));
    } finally {
      if (chatSessionTokenRef.current === token) {
        setIsAssistantTyping(false);
      }
    }
  };

  const handleResetConversation = async () => {
    if (!pill || isHydratingChat || isResettingConversation) {
      return;
    }

    const token = chatSessionTokenRef.current + 1;
    chatSessionTokenRef.current = token;
    setIsAssistantTyping(false);
    setIsResettingConversation(true);

    try {
      const res = await fetch(`/api/pill-chat?pill_id=${encodeURIComponent(String(pill.pill_id))}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        if (res.status === 401) {
          router.push('/auth/login');
          return;
        }

        const apiError = await readApiError(res);
        throw new Error(apiError ?? 'No se pudo reiniciar la conversación.');
      }

      const data = (await res.json()) as PillChatResetResponse;

      if (chatSessionTokenRef.current !== token) {
        return;
      }

      const pillKey = getPillKey(pill.pill_id);
      setConversationByPill((prev) => ({
        ...prev,
        [pillKey]: data.conversation_id,
      }));
      setChatSessions((prev) => ({
        ...prev,
        [pillKey]: data.messages.map(mapServerMessage),
      }));
      setIsChatOpen(true);
    } catch (err) {
      console.error('[chat] reset error:', err);
    } finally {
      if (chatSessionTokenRef.current === token) {
        setIsResettingConversation(false);
      }
    }
  };

  const handleOpenChat = async () => {
    if (!pill) {
      return;
    }

    setIsChatOpen(true);
    await hydrateConversation(pill);
  };

  const fetchPill = async () => {
    setLoading(true);
    setError(null);
    setPill(null);
    resetChatState();

    try {
      const res = await fetch('/api/daily-pill');
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/auth/login');
          return;
        }

        const data = await res.json();
        throw new Error(data.error || 'Error al obtener la píldora');
      }

      const data = await res.json();
      setPill(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push('/auth/login');
        return;
      }

      setUserEmail(user.email ?? null);
      fetchPill();
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/auth/login');
  };

  if (loading)
    return (
      <div className="flex h-screen items-center justify-center bg-white font-sans text-gray-900">
        <div className="text-center">
          <div className="mb-4 animate-bounce text-4xl">{PILL_EMOJI}</div>
          <p className="animate-pulse text-sm font-medium text-gray-500">Generando nueva píldora...</p>
        </div>
      </div>
    );

  if (error)
    return (
      <div className="flex h-screen items-center justify-center bg-white p-4 font-sans">
        <div className="max-w-sm text-center">
          <div className="mb-4 text-4xl">{error.includes('completado') ? '🎉' : '⚠️'}</div>
          <h2 className="mb-2 text-xl font-bold text-gray-900">{error}</h2>
          {!error.includes('completado') && (
            <button
              onClick={fetchPill}
              className="mt-6 rounded-md bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
            >
              Reintentar
            </button>
          )}
        </div>
      </div>
    );

  if (!pill) {
    return null;
  }

  const style = getCategoryStyle(pill.topic);
  const currentMessages = chatSessions[getPillKey(pill.pill_id)] ?? [];

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-gray-900">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between border-b border-gray-100 px-6 py-4">
        <span className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <span>{PILL_EMOJI}</span> DailyPill
        </span>
        <div className="flex items-center gap-4">
          {userEmail && <span className="hidden text-sm text-gray-500 sm:block">{userEmail}</span>}
          <button
            id="btn-logout"
            onClick={handleLogout}
            className="text-sm font-medium text-gray-400 transition hover:text-black"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="mx-auto w-full max-w-2xl">
          <div className="rounded-2xl border border-gray-200 bg-white px-4 py-10 shadow-sm sm:px-8">
            <div className="mb-6 flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-gray-500">
              <span>{style.emoji}</span>
              <span>{style.label}</span>
            </div>

            <h1 className="mb-2 text-3xl font-bold leading-tight text-gray-900">{pill.title}</h1>

            <h2 className="mb-8 text-base font-medium text-gray-500">{pill.content}</h2>

            <div className="mb-8 h-1 w-12 rounded-full bg-gray-200" />

            <div className="prose prose-gray max-w-none text-justify text-lg leading-relaxed text-gray-800">
              <p>{pill.generated_text}</p>
            </div>

            <div className="mt-12 flex flex-col justify-center gap-3 border-t border-gray-100 pt-8 sm:flex-row">
              <button
                id="btn-next-pill"
                onClick={fetchPill}
                className="w-full rounded-lg bg-black px-8 py-3.5 text-base font-semibold text-white shadow-md transition-colors hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-2 sm:w-auto"
              >
                Siguiente píldora
              </button>
            </div>
          </div>
        </div>
      </main>

      {!isChatOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-4">
          <div className="mx-auto w-full max-w-2xl">
            <button
              id="btn-chat-peek"
              type="button"
              onClick={handleOpenChat}
              className="w-full overflow-hidden rounded-t-2xl border border-b-0 border-gray-200 bg-white px-4 pb-4 pt-2 text-center shadow-sm"
              aria-label="Abrir chat de DailyPill"
            >
              <span className="mx-auto mb-2 block h-1.5 w-12 rounded-full bg-gray-300" />
              <span className="mt-1 block text-lg font-semibold text-gray-800 sm:text-xl">
                Habla con DailyPill
              </span>
            </button>
          </div>
        </div>
      )}

      <PillChatSheet
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        title={pill.title}
        messages={currentMessages}
        isAssistantTyping={isAssistantTyping}
        isLoadingConversation={isHydratingChat}
        isResettingConversation={isResettingConversation}
        onSendMessage={sendMessage}
        onResetConversation={handleResetConversation}
      />
    </div>
  );
}
