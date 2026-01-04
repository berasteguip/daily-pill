import requests
import socket
import urllib3.util.connection as urllib3_cn

# Patch urllib3 to force IPv4. This fixes "Network is unreachable" errors
# that occur in some GitHub Actions environments with Telegram.
def allowed_gai_family():
    return socket.AF_INET

urllib3_cn.allowed_gai_family = allowed_gai_family

TELEGRAM_BOT_TOKEN = "7887912607:AAHCb_NroXLTYQGiC7phlXSohxRkQsrRTvI"
TELEGRAM_CHAT_ID = "8192002884"

class Sender:
    def __init__(self):
        self.token = TELEGRAM_BOT_TOKEN
        self.chat_id = TELEGRAM_CHAT_ID
        self.url = f"https://api.telegram.org/bot{self.token}/sendMessage"

    def send(self, text: str) -> None:
        payload = {
            "chat_id": self.chat_id,
            "text": text,
            "disable_web_page_preview": True,
        }

        r = requests.post(self.url, data=payload, timeout=10)
        r.raise_for_status()

        data = r.json()
        if not data.get("ok"):
            raise RuntimeError(data)

if __name__ == "__main__":
    sender = Sender()
    sender.send("Píldora diaria: prueba mínima funcionando.")