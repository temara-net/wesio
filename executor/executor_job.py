"""Eksekutor job WesioBot — dijalankan GitHub Actions (execute.yml) saat
dipicu Worker webhook lewat workflow_dispatch (input: job_id SAJA).

Alur: ambil job dari Cloudflare KV -> HAPUS job-nya lebih dulu (satu kali
pakai) -> jalankan unduhan (yt-dlp, batas 50 MB) -> kirim berkas langsung
ke chat pengguna. Semua pesan ke pengguna berbahasa Inggris, kalimat
manusia — teks error teknis tidak pernah diteruskan.

Env wajib: JOB_ID, TG_BOT_TOKEN, CF_ACCOUNT_ID, CF_KV_NS_ID, CF_API_TOKEN.
Env opsional: TG_API_BASE & CF_API_BASE (uji lokal), DOWNLOADER_MODE
(ytdlp | dryrun | fail — dua terakhir untuk uji lokal).
"""
import os
import sys
import tempfile

from . import kvjob
from .downloader import unduh
from .telegram import Telegram

PESAN_GAGAL = {
    "too_big": ("That file is bigger than 50 MB even at the lowest quality "
                "I can pick, and Telegram bots cannot send files over "
                "±50 MB. Please try a shorter video."),
    "unavailable": ("I couldn't download that link. The post may be "
                    "private or removed, or the platform refused the "
                    "request. Please check the link and try again."),
}


def _kirim_berkas(tg: Telegram, chat_id, fmt: str, path: str, judul: str) -> None:
    caption = (f"Here's your audio 🎵 — {judul}" if fmt == "audio"
               else f"Here's your video 🎬 — {judul}")
    try:
        if fmt == "audio":
            tg.send_audio(chat_id, path, caption=caption)
        else:
            tg.send_video(chat_id, path, caption=caption)
    except Exception as e:
        # Cadangan: kirim sebagai dokumen; bila itu pun gagal, beri tahu.
        print(f"[executor_job] kirim {fmt} gagal ({e}); coba dokumen")
        tg.send_document(chat_id, path, caption=caption)


def proses_download(tg: Telegram, job: dict) -> None:
    chat_id = job["chat_id"]
    url = job.get("url", "")
    fmt = job.get("format", "video")
    with tempfile.TemporaryDirectory() as folder:
        hasil = unduh(url, fmt, folder)
        if not hasil.get("ok"):
            tg.send_message(chat_id, PESAN_GAGAL.get(
                hasil.get("alasan"), PESAN_GAGAL["unavailable"]))
            print(f"[executor_job] unduh gagal alasan={hasil.get('alasan')}")
            return
        try:
            _kirim_berkas(tg, chat_id, fmt, hasil["path"], hasil.get("title", ""))
        except Exception as e:
            print(f"[executor_job] kirim berkas gagal total: {e}")
            tg.send_message(chat_id,
                            "Your file was downloaded, but sending it "
                            "here failed. Please try again in a moment.")
    print("[executor_job] unduhan terkirim")


def main() -> int:
    job_id = os.environ.get("JOB_ID", "")
    token = os.environ.get("TG_BOT_TOKEN", "")
    if not job_id or not token:
        print("ENV BELUM LENGKAP: JOB_ID / TG_BOT_TOKEN kosong. Berhenti.")
        return 0
    tg = Telegram(token, os.environ.get("TG_API_BASE") or None)

    job = kvjob.ambil_job(job_id)
    if job is None:
        print(f"[executor_job] job {job_id} tidak ditemukan / sudah kedaluwarsa.")
        return 0
    kvjob.hapus_job(job_id)  # hapus SEBELUM diproses: satu kali pakai

    if job.get("type") == "download":
        try:
            proses_download(tg, job)
        except Exception as e:
            print(f"[executor_job] proses download error: {e}")
            try:
                tg.send_message(job["chat_id"], PESAN_GAGAL["unavailable"])
            except Exception:
                pass
    else:
        print(f"[executor_job] tipe job tidak dikenal: {job.get('type')}")
        try:
            tg.send_message(job["chat_id"],
                            "That request could not be processed. Please "
                            "try again from the menu.")
        except Exception:
            pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
