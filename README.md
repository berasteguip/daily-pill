# Daily Pill

## Configuration

Secrets and API keys should be stored in environment variables rather than
hardcoded in source.  A template is provided in `.env.example`:

```text
GENAI_API_KEY=your_google_genai_key_here
TELEGRAM_BOT_TOKEN=123456:ABCDEF...
TELEGRAM_CHAT_ID=8192002884
```

Copy the example to `.env` and fill in the values.  The `.env` file is
already listed in `.gitignore` so it will not be committed.

When running from a shell you can either use a library such as
`python-dotenv` to load the `.env` file or export the variables manually:

```bash
export GENAI_API_KEY=...
export TELEGRAM_BOT_TOKEN=...
export TELEGRAM_CHAT_ID=...
```

The Python modules in `src/` read the variables at import time and will raise
an error if they are missing.  The tests also skip themselves when credentials
are absent.
