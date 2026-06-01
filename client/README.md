# DailyPill Client

Frontend en Next.js con Supabase para autenticacion, entrega de pildoras y chat contextual. Tambien incluye el script batch local que genera contenido de pildoras con Ollama y lo persiste en `public.pill_contents`.

## Entorno

Crea `client/.env.local` a partir de [`.env.local.example`](.env.local.example).

Variables principales:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GENAI_API_KEY`
- `GENAI_MODEL`
- `GENAI_FALLBACK_MODELS`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`
- `PILL_PROMPT_VERSION`

## Supabase Auth redirects

El registro envia el enlace de confirmacion a `/auth/callback` en el mismo origen desde el que el usuario se registra. En Supabase Dashboard, configura:

- Authentication > URL Configuration > Site URL: URL publica de produccion, por ejemplo `https://tu-dominio.com`
- Authentication > URL Configuration > Redirect URLs: `https://tu-dominio.com/auth/callback`
- Para desarrollo local, anade tambien `http://localhost:3000/auth/callback`

## Frontend

```bash
npm install
npm run dev
```

## SQL recomendado

1. Ejecuta la auditoria previa:
   - [`supabase/audit/001_pill_generation_audit.sql`](supabase/audit/001_pill_generation_audit.sql)
2. Aplica migraciones:
   - [`supabase/migrations/001_auth_users.sql`](supabase/migrations/001_auth_users.sql)
   - [`supabase/migrations/002_chat_llm.sql`](supabase/migrations/002_chat_llm.sql)
   - [`supabase/migrations/003_pill_contents.sql`](supabase/migrations/003_pill_contents.sql)

## Batch con Ollama

Genera una cantidad fija:

```bash
npm run pills:generate -- --count 10
```

Reintenta fallidas:

```bash
npm run pills:generate -- --count 20 --retry-failed
```

Modo loop:

```bash
npm run pills:generate -- --loop --interval-ms 3000
```

Atajo equivalente:

```bash
npm run pills:generate:loop
```

El script:

- lee `public.pills` en orden por `id`
- considera pendiente toda pildora sin fila en `public.pill_contents`
- opcionalmente reprocesa filas con `status='failed'`
- guarda una unica version vigente por `pill_id`
