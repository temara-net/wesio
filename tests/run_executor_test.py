"""Uji eksekutor job WesioBot (executor/executor_job.py): ambil job dari
KV tiruan, hapus job, unduh (mode dryrun/fail), kirim berkas/pesan ke
Telegram tiruan. Jalankan: python3 tests/run_executor_test.py
"""
import json
import os
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
KV_PORT, TG_PORT = 18094, 18095
CHAT = 5150

lulus = gagal = 0


def cek(nama, ok, detail=""):
    global lulus, gagal
    if ok:
        lulus += 1
        print(f"  LULUS  {nama}")
    else:
        gagal += 1
        print(f"  GAGAL  {nama} :: {str(detail)[:220]}")


# ---- KV tiruan (bentuk API Cloudflare) ----
KV = {}
KV_HAPUS = []


class KVH(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _key(self):
        return self.path.split("/values/", 1)[-1]

    def do_GET(self):
        k = self._key()
        if k in KV:
            b = KV[k].encode()
            self.send_response(200)
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)
        else:
            self.send_response(404)
            self.end_headers()

    def do_DELETE(self):
        KV_HAPUS.append(self._key())
        KV.pop(self._key(), None)
        self.send_response(200)
        self.end_headers()


# ---- Telegram tiruan ----
TG = []


class TGH(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(n).decode("utf-8", "replace")
        TG.append((self.path, body))
        b = json.dumps({"ok": True, "result": {}}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)


def jalankan(job_id):
    os.environ["JOB_ID"] = job_id
    from executor import executor_job
    return executor_job.main()


def main():
    kv_srv = ThreadingHTTPServer(("127.0.0.1", KV_PORT), KVH)
    tg_srv = ThreadingHTTPServer(("127.0.0.1", TG_PORT), TGH)
    threading.Thread(target=kv_srv.serve_forever, daemon=True).start()
    threading.Thread(target=tg_srv.serve_forever, daemon=True).start()

    os.environ.update({
        "TG_BOT_TOKEN": "token-tiruan",
        "TG_API_BASE": f"http://127.0.0.1:{TG_PORT}/bot-token/",
        "CF_API_BASE": f"http://127.0.0.1:{KV_PORT}/client/v4",
        "CF_ACCOUNT_ID": "ACC", "CF_KV_NS_ID": "NS", "CF_API_TOKEN": "tok",
    })

    print("1) Job unduh video (dryrun): berkas terkirim via sendVideo")
    os.environ["DOWNLOADER_MODE"] = "dryrun"
    KV["job:v1"] = json.dumps({"type": "download", "chat_id": CHAT,
                               "uid": CHAT, "format": "video",
                               "url": "https://www.tiktok.com/@u/video/1"})
    n0 = len(TG)
    rc = jalankan("v1")
    baru = TG[n0:]
    cek("main() rc=0", rc == 0)
    cek("job DIHAPUS dari KV sebelum/sesudah proses",
        "job:v1" in KV_HAPUS and "job:v1" not in KV, str(KV_HAPUS))
    cek("sendVideo terpanggil dengan berkas contoh",
        any("sendVideo" in p and "Sample Video.mp4" in b for p, b in baru),
        str([(p, b[:80]) for p, b in baru]))
    cek("chat tujuan benar di payload",
        any(str(CHAT) in b for _, b in baru), "")

    print("2) Job unduh audio (dryrun): berkas terkirim via sendAudio")
    KV["job:a1"] = json.dumps({"type": "download", "chat_id": CHAT,
                               "uid": CHAT, "format": "audio",
                               "url": "https://youtu.be/xyz"})
    n0 = len(TG)
    rc = jalankan("a1")
    baru = TG[n0:]
    cek("main() rc=0", rc == 0)
    cek("sendAudio terpanggil dengan berkas contoh",
        any("sendAudio" in p and "Sample Audio.mp3" in b for p, b in baru),
        str([(p, b[:80]) for p, b in baru]))

    print("3) Unduhan gagal (mode fail): pesan manusia, tanpa teks teknis")
    os.environ["DOWNLOADER_MODE"] = "fail"
    KV["job:g1"] = json.dumps({"type": "download", "chat_id": CHAT,
                               "uid": CHAT, "format": "video",
                               "url": "https://www.instagram.com/reel/xyz"})
    n0 = len(TG)
    rc = jalankan("g1")
    baru = TG[n0:]
    teks = "\n".join(b for _, b in baru)
    cek("main() rc=0", rc == 0)
    cek("pesan gagal ramah terkirim ke pengguna",
        any("sendMessage" in p for p, _ in baru) and
        "couldn't download that link" in teks, teks[:200])
    cek("tidak ada teks teknis mentah (yt-dlp/traceback) ke pengguna",
        "yt-dlp" not in teks and "Traceback" not in teks, teks[:200])
    cek("job gagal tetap dihapus (satu kali pakai)",
        "job:g1" in KV_HAPUS and "job:g1" not in KV, str(KV_HAPUS))

    print("4) Job tidak ditemukan: ditangani tenang, tidak ada kiriman")
    n0 = len(TG)
    rc = jalankan("tidak-ada")
    cek("main() rc=0 untuk job hilang", rc == 0)
    cek("tidak ada pesan apa pun ke Telegram", len(TG) == n0,
        str(TG[n0:]))

    print(f"\nHASIL: {lulus} lulus, {gagal} gagal")
    return 1 if gagal else 0


if __name__ == "__main__":
    sys.exit(main())
