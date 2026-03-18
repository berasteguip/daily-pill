# DailyPill

Aplicación web en Next.js (carpeta `client/`) con Supabase y Gemini.

## Estructura actual

- `client/`: frontend + API routes de Next.js
- `client/supabase/migrations/`: migraciones SQL activas
  - `001_auth_users.sql`
  - `002_chat_llm.sql`

## Puesta en marcha (frontend)

1. Configura variables de entorno en `client/.env.local` (puedes partir de `client/.env.local.example`).
2. Instala dependencias y arranca:

```bash
cd client
npm install
npm run dev
```

## Base de datos

Ejecuta las migraciones SQL en Supabase SQL Editor en este orden:

1. `client/supabase/migrations/001_auth_users.sql`
2. `client/supabase/migrations/002_chat_llm.sql`
