"""Klien Cloudflare KV (REST API) untuk mengambil JOB WesioBot —
plus menulisnya kembali bila job perlu dicoba ulang (retry bot-check).

Job ditulis Worker webhook sebagai kunci 'job:<id>' berisi JSON
{type, chat_id, uid, url, format}. Job ber-TTL 15 menit di KV dan
eksekutor menghapusnya segera sesudah diambil (satu kali pakai).

Env wajib: CF_ACCOUNT_ID, CF_KV_NS_ID, CF_API_TOKEN.
Env opsional: CF_API_BASE (uji lokal dengan server tiruan).
"""
import json
import os

import requests


def _basis() -> str:
    base = os.environ.get("CF_API_BASE", "https://api.cloudflare.com/client/v4")
    return (f"{base}/accounts/{os.environ['CF_ACCOUNT_ID']}"
            f"/storage/kv/namespaces/{os.environ['CF_KV_NS_ID']}/values/")


def _headers() -> dict:
    return {"Authorization": f"Bearer {os.environ['CF_API_TOKEN']}"}


def ambil_job(job_id: str) -> dict | None:
    r = requests.get(_basis() + "job:" + job_id, headers=_headers(), timeout=30)
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return json.loads(r.text)


def simpan_job(job_id: str, job: dict, ttl: int = 900) -> None:
    """Tulis (kembali) sebuah job ke KV — dipakai jalur retry lintas
    job: job yang gagal bot-check disimpan lagi dengan cacah percobaan
    bertambah, lalu workflow dipicu ulang untuk job_id yang sama."""
    r = requests.put(_basis() + "job:" + job_id,
                     params={"expiration_ttl": ttl},
                     headers={**_headers(),
                              "Content-Type": "application/json"},
                     data=json.dumps(job), timeout=30)
    r.raise_for_status()


def hapus_job(job_id: str) -> None:
    try:
        requests.delete(_basis() + "job:" + job_id, headers=_headers(), timeout=30)
    except Exception as e:
        print(f"[kvjob] hapus job gagal (TTL tetap berlaku): {e}")
