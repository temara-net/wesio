# PROGRESS — WesioBot Tahap 1 (AI + Downloader + Premium Stars)

Catatan kerja pembangunan lokal. Status jujur: angka uji diisi hanya dari
hasil uji yang benar-benar dijalankan di mesin ini.

## Selesai (terbukti uji lokal — lihat angka di bawah)
- worker/worker.js — Worker percakapan bot publik: menu Reply Keyboard
  6 tombol persis konsep §2, perintah /start /ai /download /premium
  /help /admin_stats, modul AI (riwayat per pengguna di KV, model
  Fast/Strong via tombol, tugas cepat Summarize/Rewrite/Translate/
  Explain/Image, pesan jujur bila AI belum terkonfigurasi), modul
  Downloader (validasi domain TikTok/Instagram/YouTube/X, tombol
  Video|Audio, job KV TTL 15 mnt + dispatch execute.yml), kuota harian
  per pengguna per modul di KV (selalu tampil sisa), Premium Telegram
  Stars (invoice XTR 250, pre-checkout, successful_payment → premium
  30 hari), modul My Groups & Anonymous Chat menjawab "coming in
  Phase 2/3", /admin_stats khusus ADMIN_ID.
- executor/ — kvjob.py (ambil/hapus job KV via REST), telegram.py
  (kirim pesan/video/audio/dokumen), downloader.py (yt-dlp, batas
  50 MB, kode alasan too_big/unavailable; mode dryrun/fail untuk uji),
  executor_job.py (ambil job → hapus → unduh → kirim berkas; pesan
  gagal selalu kalimat manusia).
- .github/workflows/execute.yml — workflow_dispatch input job_id saja.
- tests/ — harness uji lokal Worker (node, io tiruan) dan eksekutor
  (python, server KV + Telegram tiruan).
- worker/PANDUAN-DEPLOY.md — langkah aktivasi penuh (KV wesio, Worker
  wesio, binding WKV, secrets Worker & repo, PAT dispatch repo wesio,
  setWebhook, daftar uji).
- worker/package.json, worker/wrangler.toml.

## Sedang dikerjakan
- Tidak ada. Kode Tahap 1 sudah ter-commit lokal (2 commit); menunggu
  peninjauan dan tahap aktivasi.

## Belum dikerjakan
- Aktivasi produksi (di luar lingkup tugas bangun lokal ini): buat KV
  `wesio` + Worker `wesio` di Cloudflare, binding WKV, isi secrets,
  PAT dispatch, setWebhook — ikuti worker/PANDUAN-DEPLOY.md.
- Uji nyata sesudah aktivasi: pembayaran Stars transaksi asli, unduhan
  yt-dlp dari 4 platform asli, panggilan AI ke provider asli.
- Phase 2 (Group Moderation) & Phase 3 (Anonymous Chat) — belum
  dibangun; di Tahap 1 tombolnya menjawab "coming soon" dengan jujur.

## Hasil uji (dijalankan di mesin ini)
- `node tests/run_worker_test.mjs` → **40 lulus, 0 gagal**.
  Cakupan: /start + menu 6 tombol; bot publik (pengguna non-admin
  dilayani); AI tak terkonfigurasi → pesan jujur; kuota AI 15 pesan
  berkurang lalu berhenti + tawaran Premium; model Strong ditolak
  untuk Free, jalan untuk Premium (model benar-benar terkirim ke
  panggilan AI); tugas Summarize; validasi domain unduhan; tombol
  Video|Audio; job KV + dispatch 1x; kuota unduh tampil & habis;
  invoice Stars (XTR 250, payload uid); pre-checkout nominal salah
  ditolak; successful_payment mengaktifkan premium ±30 hari;
  pembayaran payload pengguna lain tidak mengaktifkan siapa pun;
  My Groups/Anonymous Chat "coming in Phase 2/3"; /admin_stats
  ditolak untuk non-admin, jalan untuk admin.
- `python3 tests/run_executor_test.py` → **12 lulus, 0 gagal**.
  Cakupan: job video dryrun → sendVideo; job audio dryrun →
  sendAudio; job dihapus dari KV; mode fail → pesan manusia tanpa
  teks teknis; job tidak ditemukan → tenang, tanpa kiriman.
- `node --check worker/worker.js` → OK. `python3 -m py_compile
  executor/*.py` → OK.
- Audit netralitas: grep nama pribadi di worker/ executor/ .github/
  tests/ → nol temuan.

## Belum terbukti (di luar jangkauan lokal)
- Deploy Cloudflare (Worker wesio + KV wesio + binding WKV),
  setWebhook, dispatch GitHub Actions nyata, pembayaran Stars
  transaksi asli, unduhan yt-dlp dari platform asli, panggilan AI ke
  provider asli — semua menunggu tahap aktivasi sesudah kode ini
  diterima. Angka di atas adalah bukti uji lokal dengan tiruan,
  bukan bukti layanan asli.

---

# Tambahan 1 Nov 2026 — BYOK + Admin lengkap (konsep §10: saklar per modul)

Keputusan pemilik yang diterapkan: model kunci AI dua jalur — kunci
sistem (env AI_*, kuota harian) dan BYOK (pengguna membawa API key
sendiri untuk memakai bebas tanpa kuota sistem).

## Selesai (terbukti uji lokal — angka di bawah)
- BYOK di `worker/worker.js`: tombol "🔑 My API Key" di papan AI;
  panel status (belum ada kunci / aktif + nama provider saja); alur
  pasang via preset OpenAI / OpenRouter / Gemini (endpoint
  kompatibel-OpenAI) — kunci WAJIB lulus tes langsung ke provider
  (GET /models) SEBELUM disimpan ke KV `apikey:<uid>`
  {provider, base, key}; tes gagal → tidak disimpan + pesan manusia
  (ditolak vs tak terjangkau dibedakan) + boleh coba lagi. Model BYOK
  = default per provider (gpt-4o-mini / openai/gpt-4o-mini /
  gemini-2.0-flash), disebut di konfirmasi. Pemakaian: panggilan AI
  memakai base+kunci pengguna, kuota sistem tidak dipotong, jawaban
  berkaki "🔑 Using your own API key — no Wesio quota used"; modul AI
  tetap terbuka bagi pemegang kunci walau kunci sistem belum
  terkonfigurasi. Gagal pakai (401/403/429) → pesan manusia bahwa itu
  jawaban provider kunci pengguna + tombol "🗑 Remove my key";
  tombol hapus juga ada di panel. Pesan berisi kunci tidak masuk
  riwayat chat KV; nilai kunci tidak muncul di pesan keluar mana pun
  (diuji), tidak masuk log.
- Admin lengkap: /admin_modules (panel 4 saklar inline, KV
  `config:modules`, default semua on) — modul off → pesan jujur
  "temporarily off", kuota tidak dipotong; /admin_ban <uid> &
  /admin_unban <uid> (KV `ban:<uid>`; pengguna ter-ban ditolak semua
  modul termasuk tombol inline; admin tidak bisa mem-ban dirinya);
  /admin_stats ditambah hitungan pengguna ter-ban + status modul.

## Hasil uji (dijalankan di mesin ini, sesudah perubahan)
- `node tests/run_worker_test.mjs` → **83 lulus, 0 gagal**
  (40 uji lama regresi tetap lulus + 43 uji baru). Cakupan baru:
  kunci ditolak provider tiruan → tidak tersimpan; provider tak
  terjangkau → pesan beda + tidak tersimpan; kunci lulus → tersimpan
  & dipakai (base/model/kunci benar) tanpa potong kuota + catatan
  kaki; BYOK jalan saat kunci sistem kosong; panel status hanya
  menyebut provider; kunci gagal 401 saat dipakai → penjelasan +
  tawaran hapus; hapus kunci → kembali ke jalur sistem + kuota;
  nilai kunci tidak muncul di pesan keluar/riwayat; saklar modul
  non-admin ditolak, admin bisa on/off dan persisten, modul off
  menolak AI & unduhan tanpa kuota/dispatch; ban alur penuh
  (ditolak semua modul), non-admin ditolak /admin_ban &
  /admin_modules, admin mem-ban diri sendiri ditolak, unban
  memulihkan; statistik memuat ter-ban & status modul.
- `python3 tests/run_executor_test.py` → **12 lulus, 0 gagal**
  (tidak berubah; regresi bersih). `node --check worker/worker.js`
  → OK. Audit nama pribadi di worker/ tests/ → nol temuan.

## Putaran koreksi pemilik (1 Nov 2026 — auto-detect + rantai model)

Dua koreksi pemilik atas tambahan di atas, digabung dengan satu
tambahan sejalan untuk jalur sistem:

1. **Kunci gratisan harus benar-benar bisa dipakai + provider
   AUTO-DETECT.** Panel 🔑 My API Key kini menonjolkan satu tindakan
   utama "📋 Paste my API key": pengguna cukup menempel kunci sebagai
   pesan, TANPA memilih provider (tombol manual per provider tetap
   ada di bawahnya sebagai cadangan, alurnya tidak berubah). Saat
   kunci diterima, urutan uji ditentukan dari petunjuk awalan —
   "AIza…" Gemini dulu; "sk-or-…" OpenRouter dulu; "sk-…" OpenAI
   lalu OpenRouter; selain itu Gemini → OpenAI → OpenRouter — dan
   provider pertama yang menerima (GET /models) adalah pemilik
   kunci itu. Semua menolak → tidak disimpan + pesan "tidak dikenali
   provider mana pun" + saran pilih manual; semua tak terjangkau →
   pesan berbeda (coba lagi nanti), tidak disimpan. `testApiKey`
   produksi kini juga mengembalikan daftar id model dari /models.
2. **Rantai model cadangan otomatis (BYOK + sistem).** Record
   `apikey:<uid>` hasil deteksi kini menyimpan `models: [...]`
   berurutan + `active` (model terakhir yang berhasil):
   - Gemini: model chat dari /models berkunci itu, keluarga "flash"
     versi terbaru dulu, maks 4; daftar kosong → cadangan tetap
     ["gemini-2.5-flash", "gemini-2.0-flash"].
   - OpenRouter: semua id ":free" (maks 5, urutan provider) +
     "openai/gpt-4o-mini" sebagai ekor terakhir.
   - OpenAI: ["gpt-4o-mini"] saja — tidak ada tingkat gratis, tidak
     dikarang.
   Konfirmasi pasang menyebut model pertama (+ kata "free model"
   bila memang ":free"; catatan tingkat gratis Gemini; catatan
   OpenAI TANPA tingkat gratis) dan bahwa cadangan otomatis aktif
   ("if its quota runs out, I'll switch to the next one
   automatically"). Saat dipakai, panggilan menelusuri rantai mulai
   dari model terakhir-berhasil (membungkus sekali): kegagalan
   429/404/503 → lompat ke model berikutnya tanpa pesan gagal ke
   pengguna; 401/403 TIDAK lompat (masalah kunci, jalur error lama);
   402 → pesan saran pasang ulang agar deteksi memilih model gratis;
   semua model gagal rantai → pesan manusia bahwa semua model
   (termasuk yang gratis) sedang habis kuota, coba lagi nanti.
   Panel menampilkan model aktif + jumlah model cadangan.
   Jalur SISTEM ikut memakai rantai yang sama: `AI_MODEL_FAST`
   boleh berisi daftar model dipisah koma (mis.
   "gemini-2.5-flash,gemini-2.0-flash"); `AI_MODEL_STRONG` tetap
   satu model; FAST satu model tanpa koma = perilaku lama persis.
   Catatan: bullet "Model BYOK = default per provider" pada bagian
   sebelumnya digantikan oleh mekanisme deteksi + rantai ini untuk
   pasang via tempel; pasang manual tetap menyimpan model default
   provider seperti sebelumnya.

## Hasil uji putaran koreksi (dijalankan di mesin ini)
- `node tests/run_worker_test.mjs` → **128 lulus, 0 gagal**
  (83 uji lama regresi utuh + 28 uji di bagian 16 (auto-detect;
  sebagian asersi model disesuaikan ke semantik rantai baru) +
  13 uji rantai BYOK di bagian 17 + 4 uji rantai sistem di
  bagian 18 — total 45 uji baru dari basis 83). Cakupan baru:
  panel menonjolkan Paste + manual tetap ada; "AIza…" terdeteksi
  Gemini tanpa pilih provider; "sk-or-…" terdeteksi OpenRouter +
  rantai ":free" + ekor tersimpan; "sk-…" hanya diterima OpenAI →
  OpenAI (+ catatan tanpa tingkat gratis), ditolak OpenAI → lanjut
  OpenRouter; ditolak semua → tidak disimpan + urutan uji awalan
  tak dikenal; semua tak terjangkau → pesan berbeda; rantai Gemini
  dari daftar provider (flash terbaru dulu, embedding tersaring,
  maks 4); rantai OpenRouter dibatasi 5 + ekor; model pertama 429
  → jawaban dari model kedua tanpa pesan gagal + model aktif
  tercatat berpindah + panggilan berikutnya mulai dari pemenang;
  404 ikut lompat; semua model 429 → pesan habis kuota; 401 →
  tidak lompat; kunci kena 402 saat dipakai → saran pasang ulang
  tanpa teks teknis; panel memuat model aktif + jumlah cadangan;
  FAST sistem 2 model dengan 429 di pertama → jawaban model kedua
  + kuota tetap terpotong; sistem 401 → tidak lompat.
- `python3 tests/run_executor_test.py` → **12 lulus, 0 gagal**
  (regresi). `node --check worker/worker.js` → OK. Audit nama
  pribadi di worker/ tests/ → nol temuan.

## Belum terbukti untuk tambahan ini
- Tes kunci BYOK terhadap provider ASLI (OpenAI/OpenRouter/Gemini
  nyata) dan panggilan AI BYOK nyata — harness lokal memakai tiruan;
  perilaku header/endpoint/bentuk daftar /models provider asli baru
  terbukti saat aktivasi. Hal yang sama berlaku untuk rantai model
  (lompat 429 asli) dan daftar FAST sistem berkoma di env produksi.
- Deploy tambahan ini ke Worker live — di luar lingkup tugas lokal
  ini (belum di-push, belum di-deploy).
