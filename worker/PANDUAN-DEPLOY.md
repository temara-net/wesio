# Panduan Aktivasi WesioBot (Cloudflare Workers + GitHub Actions)

Model: percakapan Telegram dijawab Worker yang selalu-nyala di Cloudflare
(instan, tanpa VPS). Kerja berat (unduhan berkas via yt-dlp) dikerjakan
GitHub Actions, dipicu saat itu juga oleh Worker lewat workflow_dispatch
(input hanya job_id; data job diambil eksekutor dari Cloudflare KV lalu
dihapus). Panggilan AI dikerjakan langsung oleh Worker.

## Gambaran alir

Telegram → (webhook) → Worker (KV: registry pengguna, state percakapan,
  kuota harian, status Premium, job sesaat)
  → AI: Worker memanggil endpoint AI kompatibel-OpenAI (bila AI_* terisi)
  → Unduhan: Worker menulis job:<id> di KV (TTL 15 mnt) → dispatch
    execute.yml → Actions: ambil job → hapus job → yt-dlp → kirim berkas
  → Premium: invoice Telegram Stars (XTR) → successful_payment →
    Worker menulis premium:<uid> (tanggal berakhir) di KV.

## Langkah aktivasi (sekali saja)

### 1. Akun Cloudflare
Memakai akun Cloudflare yang sama dengan proyek sebelumnya (login Google).

### 2. Buat KV namespace
Dashboard Cloudflare → Storage & Databases → KV → Create namespace,
nama: `wesio`. Catat **Namespace ID**-nya.

### 3. Buat GitHub token khusus dispatch (di GitHub)
GitHub → Settings → Developer settings → Personal access tokens →
Fine-grained tokens → Generate:
- Resource owner: temara-net; Repository access: hanya `wesio`
- Permissions → Actions: **Read and write**
Token ini hanya bisa memicu workflow repo wesio. Catat nilainya
(jangan kirim lewat chat — ditempel langsung di langkah 5).

### 4. Buat Worker
Dashboard Cloudflare → Workers & Pages → Create → Worker, nama `wesio`
→ Deploy → Edit code → ganti isinya dengan `worker/worker.js` dari repo
ini → Save and deploy. Catat URL-nya
(bentuk: https://wesio.<subdomain>.workers.dev).

### 5. Isi Variables & Secrets Worker + binding KV
Di Settings → Variables and Secrets, tambahkan:
| Nama | Jenis | Isi |
|---|---|---|
| `TG_BOT_TOKEN` | Secret | token BotFather @wesiobot |
| `ADMIN_ID` | Secret | ID Telegram admin (hanya untuk /admin_stats) |
| `GH_TOKEN` | Secret | token GitHub dari langkah 3 |
| `WEBHOOK_SECRET` | Secret | kata acak panjang (bebas, ciptakan baru) — opsional tapi dianjurkan |
| `AI_API_KEY` | Secret | kunci API dari provider AI pilihan (boleh dikosongkan dulu) |
| `AI_BASE_URL` | Variable | alamat endpoint kompatibel-OpenAI, mis. `https://api.openai.com/v1` atau endpoint provider lain / aggregator |
| `AI_MODEL_FAST` | Variable | nama model cepat (untuk semua pengguna) |
| `AI_MODEL_STRONG` | Variable | nama model kuat (khusus Premium) |
| `AI_IMAGE_MODEL` | Variable | nama model gambar (khusus Premium; kosongkan bila belum ada) |

Catatan AI: bot TIDAK terkunci ke provider mana pun. Selama `AI_API_KEY`,
`AI_BASE_URL`, atau `AI_MODEL_FAST` belum terisi, modul AI menjawab jujur
"AI is not switched on yet" — modul lain tetap jalan normal.

Di Settings → Bindings → Add → KV namespace: variable name `WKV`,
namespace = `wesio` (langkah 2).

### 6. Arahkan webhook Telegram ke Worker
Sekali, dari browser/terminal (ganti isinya):
```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=<URL_WORKER>&secret_token=<WEBHOOK_SECRET>
```
Balasan `{"ok":true,"description":"Webhook was set"}` = berhasil.

### 7. Secret GitHub untuk eksekutor (repo wesio → Settings → Secrets → Actions)
| Nama | Isi |
|---|---|
| `TG_BOT_TOKEN` | token BotFather @wesiobot |
| `CF_ACCOUNT_ID` | ID akun Cloudflare (di dashboard, kolom kanan beranda Workers) |
| `CF_KV_NS_ID` | Namespace ID dari langkah 2 |
| `CF_API_TOKEN` | API token Cloudflare Custom: Permissions: Account → Workers KV Storage → Edit; Account Resources: akun pemilik |

### 8. Uji
1. Buka Worker URL di browser → harus menjawab `wesio webhook aktif`.
2. Chat ke bot: `/start` harus dibalas dalam hitungan detik dengan menu
   6 tombol, tanpa siapa pun memicu apa pun.
3. Ketuk ⬇️ Downloader → tempel tautan TikTok/YouTube → pilih 🎬 Video →
   berkas tiba dari eksekutor Actions (±1 menit).
4. Ketuk ⭐ Premium → tabel Free vs Premium → uji pembayaran Stars
   nominal asli 250 untuk memastikan aktivasi Premium berjalan.
5. `/admin_stats` dari akun admin menampilkan laporan; dari akun lain
   ditolak.

## Yang perlu diketahui
- Bot ini PUBLIK: siapa pun boleh memakai. `ADMIN_ID` hanya membatasi
  perintah /admin_stats, bukan pemakaian bot.
- Kuota harian (UTC, tersimpan di KV): AI Free 15/hari, Premium 300/hari
  + 20 gambar/hari; Downloader Free 5/hari, Premium 100/hari; berkas
  maksimal 50 MB (batas Bot API Telegram).
- Modul My Groups (Phase 2) dan Anonymous Chat (Phase 3) sudah tampil di
  menu dan menjawab jujur "coming in Phase 2/3" — belum berfungsi.
- Tidak ada data pribadi pengguna selain ID Telegram yang disimpan;
  berkas unduhan tidak disimpan sesudah terkirim.
