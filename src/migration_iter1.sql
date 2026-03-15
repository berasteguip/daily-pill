-- ============================================================
-- DailyPill — Migración para Iteración 1 (Auth)
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Añadir columna de preferencias a la tabla pública de usuarios
--    (Se usará en Iteración 2; la creamos ya para no hacer otra migración)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}';

-- 2. (Opcional) Si quieres sincronizar automáticamente los usuarios de auth.users
--    con tu tabla public.users al registrarse, crea este trigger:
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (new.id, new.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Eliminar trigger si ya existe (para poder recrearlo limpio)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Crear el trigger que se dispara al registrar un nuevo usuario
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================
-- VERIFICACIÓN: tras ejecutar, registra un usuario en la app
-- y comprueba que aparece en public.users automáticamente.
-- ============================================================
