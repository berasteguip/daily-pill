-- ============================================================
-- DailyPill - Auditoria previa para generacion batch
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1) Tablas relevantes
SELECT table_schema, table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('pills', 'pill_contents', 'user_progress', 'users')
ORDER BY table_name;

-- 2) Columnas de trabajo
SELECT
  table_name,
  ordinal_position,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('pills', 'pill_contents', 'user_progress', 'users')
ORDER BY table_name, ordinal_position;

-- 3) Foreign keys relevantes
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('pills', 'pill_contents', 'user_progress')
ORDER BY tc.table_name, kcu.column_name;

-- 4) RLS y policies actuales
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('pills', 'pill_contents', 'user_progress', 'users')
ORDER BY tablename, policyname;

-- 5) Muestreo rapido de pills
SELECT id, title, content, category
FROM public.pills
ORDER BY id
LIMIT 10;
