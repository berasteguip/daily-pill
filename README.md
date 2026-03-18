# DailyPill

Aplicacion web en Next.js (carpeta `client/`) con Supabase. La web actual sirve pildoras desde `public.pills` y mantiene el chat persistente; ademas incluye un generador batch local con Ollama para precalcular contenido en `public.pill_contents`.

## Estructura

- `client/`: frontend + API routes de Next.js + scripts batch
- `client/supabase/migrations/`: migraciones SQL activas
- `client/supabase/audit/`: consultas SQL para auditar el esquema real de Supabase
- `material/`: material auxiliar y datasets base

## Puesta en marcha

1. Configura variables de entorno en `client/.env.local` usando [`client/.env.local.example`](client/.env.local.example).
2. Instala dependencias y arranca el frontend:

```bash
cd client
npm install
npm run dev
```

## Base de datos

Antes de tocar el flujo batch, ejecuta la auditoria en Supabase SQL Editor:

1. [`client/supabase/audit/001_pill_generation_audit.sql`](client/supabase/audit/001_pill_generation_audit.sql)

Despues aplica las migraciones en este orden:

1. [`client/supabase/migrations/001_auth_users.sql`](client/supabase/migrations/001_auth_users.sql)
2. [`client/supabase/migrations/002_chat_llm.sql`](client/supabase/migrations/002_chat_llm.sql)
3. [`client/supabase/migrations/003_pill_contents.sql`](client/supabase/migrations/003_pill_contents.sql)

## Generador batch local

El batch no cambia todavia la API web. Solo lee temas pendientes desde `public.pills`, genera contenido con Ollama y guarda una fila unica por `pill_id` en `public.pill_contents`.

Comandos:

```bash
cd client
npm run pills:generate -- --count 10
npm run pills:generate -- --count 20 --retry-failed
npm run pills:generate:loop
```

Variables necesarias para el batch:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OLLAMA_MODEL`
- `OLLAMA_BASE_URL` opcional, default `http://127.0.0.1:11434`
- `PILL_PROMPT_VERSION` opcional, default `v1`
