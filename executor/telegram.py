"""Klien Telegram Bot API minimal (requests) untuk eksekutor: kirim
pesan teks dan berkas (video/audio/dokumen). Alamat API bisa dioverride
lewat TG_API_BASE untuk pengujian lokal dengan server tiruan."""
import os

import requests


class Telegram:
    def __init__(self, token: str, api_base: str | None = None):
        self.base = api_base or f"https://api.telegram.org/bot{token}/"
        self.session = requests.Session()

    def call(self, method: str, **params):
        r = self.session.post(self.base + method, json=params, timeout=40)
        r.raise_for_status()
        data = r.json()
        if not data.get("ok"):
            raise RuntimeError(f"Telegram {method}: {data.get('description')}")
        return data["result"]

    def send_message(self, chat_id, text: str):
        # Telegram membatasi 4096 karakter per pesan
        for i in range(0, len(text), 4000):
            self.call("sendMessage", chat_id=chat_id, text=text[i:i + 4000])

    def _send_file(self, method: str, field: str, chat_id, path: str, caption: str = ""):
        url = self.base + method
        with open(path, "rb") as f:
            r = self.session.post(
                url,
                data={"chat_id": chat_id, "caption": caption[:1000]},
                files={field: (os.path.basename(path), f)},
                timeout=300,
            )
        r.raise_for_status()
        data = r.json()
        if not data.get("ok"):
            raise RuntimeError(f"Telegram {method}: {data.get('description')}")
        return data["result"]

    def send_video(self, chat_id, path: str, caption: str = ""):
        return self._send_file("sendVideo", "video", chat_id, path, caption)

    def send_audio(self, chat_id, path: str, caption: str = ""):
        return self._send_file("sendAudio", "audio", chat_id, path, caption)

    def send_document(self, chat_id, path: str, caption: str = ""):
        return self._send_file("sendDocument", "document", chat_id, path, caption)
