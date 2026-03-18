'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type TouchEvent,
} from 'react';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: number;
}

interface PillChatSheetProps {
  isOpen: boolean;
  title: string;
  messages: ChatMessage[];
  isAssistantTyping: boolean;
  isLoadingConversation?: boolean;
  isResettingConversation?: boolean;
  onClose: () => void;
  onSendMessage: (message: string) => void;
  onResetConversation?: () => void;
}

function formatMessageTime(createdAt: number): string {
  return new Date(createdAt).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function PillChatSheet({
  isOpen,
  title,
  messages,
  isAssistantTyping,
  isLoadingConversation = false,
  isResettingConversation = false,
  onClose,
  onSendMessage,
  onResetConversation,
}: PillChatSheetProps) {
  const [draft, setDraft] = useState('');
  const [dragOffset, setDragOffset] = useState(0);
  const [isMaximized, setIsMaximized] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const focusTimeout = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 60);

    return () => {
      window.clearTimeout(focusTimeout);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isAssistantTyping, isOpen]);

  const handleClose = useCallback(() => {
    setIsMaximized(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, handleClose]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  const handleSubmit = () => {
    const cleaned = draft.trim();
    if (!cleaned || isAssistantTyping || isLoadingConversation || isResettingConversation) {
      return;
    }

    onSendMessage(cleaned);
    setDraft('');
  };

  const handleComposerKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    touchStartYRef.current = event.touches[0]?.clientY ?? null;
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartYRef.current === null) {
      return;
    }

    const currentY = event.touches[0]?.clientY ?? touchStartYRef.current;
    const delta = currentY - touchStartYRef.current;
    if (delta > 0) {
      setDragOffset(delta);
    }
  };

  const onTouchEnd = () => {
    if (dragOffset > 120) {
      handleClose();
    }

    touchStartYRef.current = null;
    setDragOffset(0);
  };

  const transform = isOpen ? `translateY(${dragOffset}px)` : 'translateY(100%)';
  const bodyMaxWidthClass = isMaximized ? 'max-w-4xl' : 'max-w-2xl';
  const messageTextClass = isMaximized ? 'text-base leading-relaxed sm:text-lg' : 'text-sm leading-relaxed';
  const timestampTextClass = isMaximized ? 'text-xs' : 'text-[11px]';
  const typingTextClass = isMaximized ? 'text-base sm:text-lg' : 'text-sm';

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center transition-opacity duration-200 ${
        isOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      } ${isMaximized ? 'items-center p-2 sm:p-3' : 'items-end'}`}
    >
      <button
        type="button"
        aria-label="Cerrar chat"
        onClick={handleClose}
        className={`absolute inset-0 transition-opacity duration-200 ${
          isMaximized ? 'bg-black/30 backdrop-blur-sm' : 'bg-black/40'
        } ${isOpen ? 'opacity-100' : 'opacity-0'}`}
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-label="Chat sobre la píldora"
        className={`relative z-10 flex w-full flex-col border border-gray-200 bg-white shadow-2xl transition-all duration-200 ease-out ${
          isMaximized
            ? 'h-full max-w-[1100px] rounded-2xl'
            : 'h-[88vh] max-w-2xl rounded-t-2xl sm:h-[72vh]'
        }`}
        style={{ transform }}
      >
        <div
          className="flex-shrink-0 border-b border-gray-100 px-4 pb-3 pt-2"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-gray-300" />
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Chat de la píldora</p>
              <p className="truncate text-sm font-medium text-gray-800">{title}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onResetConversation}
                disabled={!onResetConversation || isResettingConversation || isLoadingConversation}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isResettingConversation ? 'Reiniciando...' : 'Reiniciar'}
              </button>
              <button
                type="button"
                onClick={() => setIsMaximized((prev) => !prev)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                aria-label={isMaximized ? 'Restaurar tamaño' : 'Maximizar chat'}
                title={isMaximized ? 'Restaurar tamaño' : 'Maximizar chat'}
              >
                {isMaximized ? (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                    <path
                      d="M3 9h5V4M21 9h-5V4M3 15h5v5M21 15h-5v5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="square"
                      strokeLinejoin="miter"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                    <path
                      d="M3 3h6v2.5H5.5V9H3V3zm18 0v6h-2.5V5.5H15V3h6zM3 21v-6h2.5v3.5H9V21H3zm18 0h-6v-2.5h3.5V15H21v6z"
                      fill="currentColor"
                    />
                  </svg>
                )}
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
                aria-label="Cerrar chat"
                title="Cerrar chat"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path
                    d="M6 6l12 12M18 6L6 18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-50/50 px-4 py-4">
          <div className={`mx-auto flex w-full flex-col gap-3 ${bodyMaxWidthClass}`}>
            {isLoadingConversation && messages.length === 0 && (
              <article className="mr-auto max-w-[85%] rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-700">
                <p className="font-medium text-gray-600">Cargando conversación...</p>
              </article>
            )}

            {messages.map((message) => (
              <article
                key={message.id}
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${messageTextClass} ${
                  message.role === 'user'
                    ? 'ml-auto bg-black text-white'
                    : 'mr-auto border border-gray-200 bg-white text-gray-900'
                }`}
              >
                <p>{message.text}</p>
                <p
                  className={`mt-1 ${timestampTextClass} ${
                    message.role === 'user' ? 'text-gray-300' : 'text-gray-400'
                  }`}
                >
                  {formatMessageTime(message.createdAt)}
                </p>
              </article>
            ))}

            {isAssistantTyping && (
              <article
                className={`mr-auto max-w-[85%] rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-gray-700 ${typingTextClass}`}
              >
                <p className="font-medium text-gray-600">DailyPill está escribiendo...</p>
                <div className="mt-2 flex items-center gap-1.5" aria-hidden="true">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400 [animation-delay:80ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gray-400 [animation-delay:160ms]" />
                </div>
              </article>
            )}

            <div ref={listEndRef} />
          </div>
        </div>

        <footer className="flex-shrink-0 border-t border-gray-100 bg-white p-4">
          <div className={`mx-auto flex w-full items-end gap-3 ${bodyMaxWidthClass}`}>
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              rows={isMaximized ? 3 : 2}
              placeholder="Escribe tu pregunta sobre esta píldora..."
              disabled={isLoadingConversation || isResettingConversation}
              className={`flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-gray-900 outline-none transition focus:border-black focus:ring-1 focus:ring-black ${
                isMaximized ? 'min-h-[64px] text-base' : 'min-h-[48px] text-sm'
              } disabled:cursor-not-allowed disabled:bg-gray-100`}
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={
                isAssistantTyping ||
                isLoadingConversation ||
                isResettingConversation ||
                draft.trim().length === 0
              }
              className={`rounded-xl bg-black px-4 font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300 ${
                isMaximized ? 'h-12 text-base' : 'h-11 text-sm'
              }`}
            >
              Enviar
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
