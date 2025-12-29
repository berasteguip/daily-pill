import requests

TELEGRAM_BOT_TOKEN = "7887912607:AAHCb_NroXLTYQGiC7phlXSohxRkQsrRTvI"
TELEGRAM_CHAT_ID = "8192002884"

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
