import os
import pytest
import requests

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
    pytest.skip("Telegram credentials not set, skipping sender test", allow_module_level=True)

def send(text: str) -> None:
    token = TELEGRAM_BOT_TOKEN
    chat_id = TELEGRAM_CHAT_ID

    url = f"https://api.telegram.org/bot{token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "disable_web_page_preview": True,
    }

    r = requests.post(url, data=payload, timeout=10)
    r.raise_for_status()

    data = r.json()
    if not data.get("ok"):
        raise RuntimeError(data)

if __name__ == "__main__":
    send("Píldora diaria: prueba mínima funcionando.")
