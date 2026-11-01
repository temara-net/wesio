"""Unduhan berkas via yt-dlp dengan batas ukuran Telegram (50 MB).

Hasil selalu berbentuk dict:
  {"ok": True, "path": ..., "title": ..., "size_mb": ...}
  {"ok": False, "alasan": "too_big" | "unavailable"}

Pesan untuk pengguna disusun oleh executor_job dari kode alasan ini —
teks error mentah yt-dlp TIDAK pernah diteruskan ke pengguna.

Mode uji lokal (env DOWNLOADER_MODE):
  "ytdlp"  (bawaan) — unduh sungguhan memakai yt-dlp.
  "dryrun" — buat berkas contoh kecil, tanpa jaringan (uji eksekutor).
  "fail"   — selalu gagal 'unavailable' (uji jalur kegagalan).
"""
import os
import subprocess
import sys

MAX_BYTES = 50 * 1024 * 1024  # batas kirim berkas Bot API Telegram


def _berkas_hasil(folder: str) -> str | None:
    calon = [os.path.join(folder, f) for f in os.listdir(folder)
             if os.path.isfile(os.path.join(folder, f))]
    if not calon:
        return None
    return max(calon, key=os.path.getsize)


def _unduh_dryrun(fmt: str, folder: str) -> dict:
    if fmt == "audio":
        nama = "Sample Audio.mp3"
        isi = b"ID3" + b"\x00" * 2048
    else:
        nama = "Sample Video.mp4"
        isi = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 2048
    path = os.path.join(folder, nama)
    with open(path, "wb") as f:
        f.write(isi)
    return {"ok": True, "path": path, "title": nama.rsplit(".", 1)[0],
            "size_mb": round(len(isi) / 1048576, 3)}


def _unduh_ytdlp(url: str, fmt: str, folder: str) -> dict:
    pola = os.path.join(folder, "%(title).80s.%(ext)s")
    if fmt == "audio":
        args = ["-f", "ba/b", "-x", "--audio-format", "mp3"]
    else:
        args = ["-f", "bv*[height<=720]+ba/b[height<=720]/bv*+ba/b",
                "--merge-output-format", "mp4"]
    cmd = [sys.executable, "-m", "yt_dlp", *args,
           "--max-filesize", "50M", "--no-playlist",
           "--no-warnings", "-o", pola, url]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    except Exception as e:
        print(f"[downloader] yt-dlp tidak bisa dijalankan: {e}")
        return {"ok": False, "alasan": "unavailable"}
    path = _berkas_hasil(folder)
    if path is None:
        err = (p.stderr or "").lower()
        alasan = "too_big" if "file is larger" in err or "max-filesize" in err \
            else "unavailable"
        print(f"[downloader] gagal rc={p.returncode} alasan={alasan}")
        return {"ok": False, "alasan": alasan}
    ukuran = os.path.getsize(path)
    if ukuran > MAX_BYTES:
        return {"ok": False, "alasan": "too_big"}
    judul = os.path.splitext(os.path.basename(path))[0]
    return {"ok": True, "path": path, "title": judul,
            "size_mb": round(ukuran / 1048576, 2)}


def unduh(url: str, fmt: str, folder: str) -> dict:
    mode = os.environ.get("DOWNLOADER_MODE", "ytdlp")
    if mode == "dryrun":
        return _unduh_dryrun(fmt, folder)
    if mode == "fail":
        return {"ok": False, "alasan": "unavailable"}
    return _unduh_ytdlp(url, fmt, folder)
