-- ============================================================
-- DailyPill — Migración Iteración 2 (Chat LLM persistente)
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- Asegura soporte para gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) Conversaciones (1 conversación por usuario y píldora)
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  pill_id INTEGER NOT NULL REFERENCES public.pills(id) ON DELETE CASCADE,
  summary_text TEXT NOT NULL DEFAULT '',
  summary_message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, pill_id)
);

-- 2) Mensajes del chat
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) Índices
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_pill
  ON public.chat_conversations(user_id, pill_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
  ON public.chat_messages(conversation_id, created_at);

-- 4) RLS
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_conversations_owner_all ON public.chat_conversations;
CREATE POLICY chat_conversations_owner_all
  ON public.chat_conversations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS chat_messages_owner_all ON public.chat_messages;
CREATE POLICY chat_messages_owner_all
  ON public.chat_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_conversations c
      WHERE c.id = conversation_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.chat_conversations c
      WHERE c.id = conversation_id
        AND c.user_id = auth.uid()
    )
  );

-- ============================================================
-- Verificación rápida:
-- 1. Abrir app y entrar con usuario autenticado
-- 2. Abrir chat de una píldora
-- 3. Confirmar filas en chat_conversations y chat_messages
-- ============================================================
