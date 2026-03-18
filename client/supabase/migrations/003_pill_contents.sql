-- ============================================================
-- DailyPill - Migracion Iteracion 3 (contenido batch de pildoras)
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pill_contents (
  pill_id INTEGER PRIMARY KEY REFERENCES public.pills(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('ready', 'failed')),
  generated_text TEXT,
  generator TEXT NOT NULL DEFAULT 'ollama',
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_generated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pill_contents_status
  ON public.pill_contents(status);

ALTER TABLE public.pill_contents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pill_contents_read_visible_pills ON public.pill_contents;
CREATE POLICY pill_contents_read_visible_pills
  ON public.pill_contents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.pills p
      WHERE p.id = pill_id
    )
  );

-- ============================================================
-- Verificacion rapida:
-- 1. Confirmar que public.pill_contents existe
-- 2. Confirmar FK hacia public.pills(id)
-- 3. Confirmar que solo hay policy de SELECT
-- ============================================================
