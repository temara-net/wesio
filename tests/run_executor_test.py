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
KV_PORT, TG_PORT, GH_PORT = 18094, 18095, 18096
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
KV_PUT = []


class KVH(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _key(self):
        return self.path.split("/values/", 1)[-1].split("?", 1)[0]

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

    def do_PUT(self):
        n = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(n).decode("utf-8", "replace")
        KV_PUT.append(self._key())
        KV[self._key()] = body
        self.send_response(200)
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


# ---- GitHub API tiruan (workflow_dispatch untuk retry) ----
GH = []


class GHH(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(n).decode("utf-8", "replace")
        GH.append((self.path, body))
        self.send_response(204)
        self.end_headers()


def jalankan(job_id):
    os.environ["JOB_ID"] = job_id
    from executor import executor_job
    return executor_job.main()


def main():
    kv_srv = ThreadingHTTPServer(("127.0.0.1", KV_PORT), KVH)
    tg_srv = ThreadingHTTPServer(("127.0.0.1", TG_PORT), TGH)
    gh_srv = ThreadingHTTPServer(("127.0.0.1", GH_PORT), GHH)
    threading.Thread(target=kv_srv.serve_forever, daemon=True).start()
    threading.Thread(target=tg_srv.serve_forever, daemon=True).start()
    threading.Thread(target=gh_srv.serve_forever, daemon=True).start()

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

    # ---- Uji botcheck + retry: yt-dlp tiruan lewat patch subprocess ----
    import contextlib
    import io
    from executor import downloader

    os.environ.update({
        "DOWNLOADER_MODE": "ytdlp",
        "GH_API_BASE": f"http://127.0.0.1:{GH_PORT}",
        "GH_TOKEN_JOB": "gh-token-tiruan",
        "GH_REPO_JOB": "pemilik/repo",
    })
    cmd_tercatat = []
    stderr_saat_ini = [""]
    run_asli = downloader.subprocess.run

    class HasilPalsu:
        def __init__(self, rc_, stderr_):
            self.returncode = rc_
            self.stderr = stderr_
            self.stdout = ""

    def run_palsu(cmd, **kw):
        cmd_tercatat.append(cmd)
        return HasilPalsu(1, stderr_saat_ini[0])

    downloader.subprocess.run = run_palsu
    try:
        print("5) Botcheck YouTube attempts=0: klasifikasi botcheck, "
              "retry terpicu, tanpa pesan, log stderr tersamar")
        url_yt = "https://www.youtube.com/watch?v=UNIK98765"
        stderr_saat_ini[0] = (
            "WARNING: baris awal yang tidak ikut tercetak\n"
            f"ERROR: [youtube] gagal mengambil {url_yt}\n"
            "Sign in to confirm you're not a bot. "
            "Use --cookies-from-browser or --cookies.\n"
            f"baris ekor terakhir menyebut lagi {url_yt}\n")
        KV["job:r1"] = json.dumps({"type": "download", "chat_id": CHAT,
                                   "uid": CHAT, "format": "video",
                                   "url": url_yt})
        n_tg, n_gh = len(TG), len(GH)
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = jalankan("r1")
        keluaran = buf.getvalue()
        cek("main() rc=0 (retry)", rc == 0)
        cek("workflow terpicu ulang 1x untuk job yang sama",
            len(GH) == n_gh + 1 and '"job_id": "r1"' in GH[-1][1]
            and "execute.yml/dispatches" in GH[-1][0], str(GH[n_gh:]))
        job_r1 = json.loads(KV.get("job:r1", "{}"))
        cek("job tersimpan kembali dengan attempts=1",
            job_r1.get("attempts") == 1 and "job:r1" in KV_PUT,
            KV.get("job:r1", ""))
        cek("TANPA pesan apa pun ke pengguna saat retry dijadwalkan",
            len(TG) == n_tg, str(TG[n_tg:]))
        cek("log diagnostik memuat stderr tersamar '[url]'",
            "[url]" in keluaran, keluaran[-400:])
        cek("log diagnostik TIDAK memuat URL asli job",
            url_yt not in keluaran, keluaran[-400:])
        cek("log diagnostik maks 3 baris stderr",
            1 <= keluaran.count("[downloader] stderr:") <= 3,
            keluaran[-400:])
        cmd = cmd_tercatat[-1] if cmd_tercatat else []
        cek("perintah yt-dlp tidak berubah (modul, format gabungan, "
            "batas 50M, URL terakhir)",
            cmd[1:3] == ["-m", "yt_dlp"]
            and "bv*[height<=720]+ba/b[height<=720]/bv*+ba/b" in cmd
            and "--merge-output-format" in cmd and "mp4" in cmd
            and "--max-filesize" in cmd and "50M" in cmd
            and cmd[-1] == url_yt, str(cmd))

        print("6) Botcheck YouTube attempts=1: retry kedua terpicu, "
              "attempts menjadi 2, tetap tanpa pesan")
        n_tg, n_gh = len(TG), len(GH)
        rc = jalankan("r1")
        job_r1 = json.loads(KV.get("job:r1", "{}"))
        cek("main() rc=0 (retry kedua)", rc == 0)
        cek("workflow terpicu ulang lagi + attempts=2",
            len(GH) == n_gh + 1 and job_r1.get("attempts") == 2,
            f"GH={len(GH) - n_gh} job={KV.get('job:r1', '')}")
        cek("tetap TANPA pesan ke pengguna", len(TG) == n_tg,
            str(TG[n_tg:]))

        print("7) Botcheck YouTube attempts=2 (percobaan ke-3): pesan "
              "botcheck terkirim, tanpa redispatch, job ditutup")
        KV["job:r3"] = json.dumps({"type": "download", "chat_id": CHAT,
                                   "uid": CHAT, "format": "video",
                                   "url": url_yt, "attempts": 2})
        n_tg, n_gh = len(TG), len(GH)
        rc = jalankan("r3")
        baru = TG[n_tg:]
        teks = "\n".join(b for _, b in baru)
        cek("main() rc=0 (percobaan terakhir)", rc == 0)
        cek("pesan botcheck jujur terkirim ke pengguna",
            any("sendMessage" in p for p, _ in baru)
            and "prove it isn't a bot" in teks
            and "blocked by YouTube" in teks, teks[:240])
        cek("TANPA redispatch pada percobaan ke-3", len(GH) == n_gh,
            str(GH[n_gh:]))
        cek("job ditutup (tidak tersimpan kembali)",
            "job:r3" not in KV, str(list(KV.keys())))

        print("8) Botcheck NON-YouTube: tanpa retry, pesan sesuai "
              "pemetaan alasan")
        KV["job:t1"] = json.dumps({"type": "download", "chat_id": CHAT,
                                   "uid": CHAT, "format": "video",
                                   "url": "https://www.tiktok.com/@u/video/9"})
        n_tg, n_gh = len(TG), len(GH)
        rc = jalankan("t1")
        teks = "\n".join(b for _, b in TG[n_tg:])
        cek("main() rc=0 (botcheck non-YouTube)", rc == 0)
        cek("TANPA redispatch untuk host non-YouTube", len(GH) == n_gh,
            str(GH[n_gh:]))
        cek("pesan alasan botcheck tetap terkirim",
            "prove it isn't a bot" in teks, teks[:240])
        cek("job non-YouTube ditutup", "job:t1" not in KV,
            str(list(KV.keys())))

        print("9) Unavailable biasa di YouTube: tanpa retry, pesan "
              "unavailable seperti sebelumnya")
        stderr_saat_ini[0] = ("ERROR: [youtube] abc123: "
                              "Video unavailable\n")
        KV["job:u1"] = json.dumps({"type": "download", "chat_id": CHAT,
                                   "uid": CHAT, "format": "video",
                                   "url": url_yt})
        n_tg, n_gh = len(TG), len(GH)
        rc = jalankan("u1")
        teks = "\n".join(b for _, b in TG[n_tg:])
        cek("main() rc=0 (unavailable)", rc == 0)
        cek("TANPA redispatch untuk alasan unavailable",
            len(GH) == n_gh, str(GH[n_gh:]))
        cek("pesan unavailable lama terkirim",
            "couldn't download that link" in teks, teks[:240])
    finally:
        downloader.subprocess.run = run_asli

    print("10) execute.yml: ffmpeg terpasang sebelum eksekutor + izin "
          "actions untuk retry")
    yml = open(os.path.join(ROOT, ".github/workflows/execute.yml"),
               encoding="utf-8").read()
    cek("execute.yml memuat langkah pasang ffmpeg",
        "apt-get install -y -qq ffmpeg" in yml, "")
    cek("langkah ffmpeg SEBELUM langkah eksekutor",
        yml.index("ffmpeg") < yml.index("Jalankan eksekutor job"), "")
    cek("execute.yml memberi permissions actions: write",
        "actions: write" in yml, "")
    cek("execute.yml meneruskan token bawaan run ke eksekutor",
        "GH_TOKEN_JOB" in yml and "GITHUB_TOKEN" in yml, "")

    print(f"\nHASIL: {lulus} lulus, {gagal} gagal")
    return 1 if gagal else 0


if __name__ == "__main__":
    sys.exit(main())
