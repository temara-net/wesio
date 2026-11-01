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

# Tambahan 1 Nov 2026 — Pemilik full access (admin = Premium permanen + kuota dilewati)

Koreksi pemilik: akun admin selama ini hanya kebal ban dan bisa
membuka perintah admin, tetapi di modul ia diperlakukan pengguna Free
(kuota berlaku, model Strong terkunci, layar Premium menawarkan
invoice 250 Stars kepadanya). Kini di worker/worker.js:

- `premiumAktif()` mengembalikan true untuk ADMIN_ID — Strong dan
  tugas Image terbuka lewat gerbang yang sama dengan pengguna Premium
  berbayar; tidak ada lagi pembacaan KV premium di luar fungsi ini
  untuk gerbang modul (diverifikasi dengan pemindaian kode).
- Kuota AI, kuota unduh, dan kuota gambar untuk admin DILEWATI
  sepenuhnya: tidak dicek dan tidak dipotong (tidak ada record
  `quota:<admin>:*` yang tertulis). Pemakaian tetap masuk statistik.
- Tampilan sisa kuota untuk admin diganti keterangan "👑 Owner:
  unlimited" (header modul AI + kaki jawaban AI), "👑 Owner:
  unlimited downloads" (header Downloader + balasan Processing), dan
  keterangan unlimited sesudah pembuatan gambar — pilihan ini yang
  paling konsisten dengan teks yang sudah ada.
- Layar Premium untuk admin: status persis "👑 Owner — full access.
  No subscription needed, all limits are lifted for your account.",
  TANPA tombol Buy; callback beli lama dari admin ditolak sopan
  dengan pesan yang sama dan TIDAK membuat invoice.
- /admin_stats dan seluruh perilaku pengguna non-admin tidak berubah.

## Hasil uji putaran ini (dijalankan di mesin ini)

- `node tests/run_worker_test.mjs` → **146 lulus, 0 gagal** = 128 uji
  lama (regresi utuh; dijalankan juga sebelum uji baru ditambah,
  tetap 128/128 sesudah perubahan kode) + 18 uji baru bagian 19:
  admin mengirim 17 pesan AI melewati batas Free 15 tanpa record
  kuota; Strong terkirim sebagai model untuk admin tanpa record
  Premium KV; tugas Image jalan untuk admin tanpa potong kuota
  gambar; 7 unduhan admin ter-dispatch melewati batas Free 5 tanpa
  record kuota; layar Premium admin = status pemilik & nol invoice
  (termasuk lewat callback beli); pengguna biasa tetap status Free,
  tetap ditawari tombol Buy, dan tetap menerima invoice Stars 250.
- `python3 tests/run_executor_test.py` → **12 lulus, 0 gagal**
  (regresi). `node --check worker/worker.js` → OK. Audit nama
  pribadi di worker/ + tests/ → 0 temuan.

## Belum terbukti untuk tambahan ini
- Perilaku di layanan asli (Worker live belum menerima deploy
  putaran ini — di luar lingkup tugas; push/deploy menunggu agen
  induk). Uji di atas adalah bukti lokal dengan io tiruan.

# Tambahan 1 Nov 2026 — Fitur gambar diperbaiki untuk Gemini (endpoint natif + foto multipart)

Temuan dari kode yang lama: (1) `AI_IMAGE_MODEL` belum pernah
terpasang di Worker live sehingga `io.ai.imageModel` kosong dan
fitur Image jalur sistem mati di gerbang "not switched on yet"
(perilaku gerbang itu sendiri sudah benar dan dipertahankan);
(2) lebih mendasar, `genImage` lama POST ke
`{AI_BASE_URL}/images/generations` (bentuk OpenAI) dan mengharap
`data[0].url` — endpoint kompatibel-OpenAI milik Google Gemini
tidak menyediakan jalur itu. Gambar Gemini berjalan lewat endpoint
natif `…/v1beta/models/<model>:generateContent` dan hasilnya
kembali sebagai base64 `inlineData`, bukan URL.

Perubahan di worker/worker.js (adapter `buatIo` + cabang Image):
- `genImage`: bila basis AI Google (baseUrl mengandung
  "googleapis.com") ATAU model gambar diawali "gemini", panggil
  endpoint natif generateContent dengan model dari env
  `AI_IMAGE_MODEL` (tidak di-hardcode), body
  `contents[{parts:[{text: prompt}]}]` +
  `generationConfig.responseModalities ["TEXT","IMAGE"]`, kunci
  sistem yang sama di header `x-goog-api-key`; urai `inlineData`
  pertama → kembalikan `{bytesBase64, mimeType}`. Basis non-Google
  tetap jalur lama `/images/generations` → kini mengembalikan
  `{url}`. Kegagalan HTTP tercatat statusnya di log konsol internal
  (kedua jalur); pesan ke pengguna tetap kalimat manusia yang sudah
  ada, tanpa teks teknis.
- Adapter menambah `io.sendPhotoBytes(chatId, base64, mimeType,
  caption)`: kirim foto sebagai multipart/form-data (FormData:
  chat_id, caption, photo sebagai Blob dari dekode base64, nama
  berkas image.png / image.jpg sesuai mime). Cabang tugas Image di
  `prosesAi` memilih jalur dari bentuk hasil `genImage`:
  `{bytesBase64}` → sendPhotoBytes; `{url}`/string → sendPhoto URL
  yang lama. Kuota gambar, gerbang Premium/admin, dan perilaku lain
  tidak berubah. `buatIo` kini diekspor agar harness bisa menguji
  adapter asli dengan fetch tiruan.

## Hasil uji putaran ini (dijalankan di mesin ini)
- `node tests/run_worker_test.mjs` → **165 lulus, 0 gagal** = 146
  uji lama (regresi utuh; juga dijalankan di tengah perubahan,
  tetap 146/146 sebelum uji baru ditambah) + 19 uji baru bagian 20
  memakai ADAPTER ASLI dengan fetch tiruan dan KV Map:
  (a) basis Google → genImage memanggil URL natif
  `:generateContent` dengan model dari env, body contents +
  responseModalities benar, kunci di header, tanpa panggilan
  /images/generations; inlineData terurai dan cabang Image mengirim
  sendPhoto multipart (FormData berisi berkas PNG 8 byte bertipe
  image/png); kuota gambar admin tidak terpotong, pengguna Premium
  terpotong tepat 1 (sisa tampil 19 of 20); (b) basis non-Google →
  jalur `/images/generations` lama tetap dipakai (model dari env)
  dan foto dikirim via sendPhoto URL (JSON); (c) respons Gemini
  tanpa inlineData → pesan gagal manusiawi "picture maker is busy",
  tanpa sendPhoto, kuota utuh, tanpa teks teknis ke pengguna;
  (d) pemilihan cabang dari bentuk hasil diuji juga pada io tiruan
  ({url} → URL, {bytesBase64} → bytes).
- `python3 tests/run_executor_test.py` → **12 lulus, 0 gagal**
  (regresi). `node --check worker/worker.js` → OK. Audit nama
  pribadi di worker/ + tests/ → 0 temuan.

## Belum terbukti untuk tambahan ini
- Nilai secret `AI_IMAGE_MODEL` di Worker live BELUM terpasang —
  pemasangannya adalah langkah pengelola sesudah putaran ini
  (direncanakan gemini-2.5-flash-image); selama env itu kosong,
  fitur Image jalur sistem tetap menjawab "not switched on yet"
  dengan jujur.
- Perilaku endpoint natif Gemini ASLI (bentuk respons generateContent
  nyata, kuota model gambar) dan pengiriman multipart ke Bot API
  asli — harness lokal memakai fetch tiruan; belum di-push dan
  belum di-deploy (menunggu agen induk).

# Tambahan 1 Nov 2026 — Rantai total lintas kunci + urutan Gemini terbaru dulu

Aturan pemilik yang ditegaskan: prioritas model TERBARU dulu; bila
kuota habis, OTOMATIS beralih — pengguna tidak boleh menabrak jalan
buntu selama masih ada jalur yang hidup. Celah sebelumnya: peralihan
antar-model dalam satu kunci sudah ada, tetapi bila SELURUH model
pada kunci BYOK pengguna habis (e.semuaHabis), bot berhenti dan
menyuruh pengguna melepas kuncinya manual — padahal kunci sistem
masih hidup.

Perubahan di worker/worker.js:
- RANTAI TOTAL lintas kunci (prosesAi): bila rantai BYOK berakhir
  semuaHabis DAN kunci sistem terkonfigurasi (aiSiap), pertanyaan
  yang sama otomatis dilanjutkan ke rantai SISTEM lewat helper baru
  `jawabLewatSistem` (dipakai bersama oleh jalur sistem murni:
  pilihan Strong bagi Premium = panggilan langsung modelStrong;
  selain itu rantai AI_MODEL_FAST). Record kunci pengguna TIDAK
  dihapus dan TIDAK diubah. Jawaban hasil peralihan membawa tepat
  SATU baris catatan kaki "ℹ️ Your own key is out of quota right
  now, so this answer used the Wesio system key. Your key stays
  saved." dan memotong kuota sistem seperti jawaban sistem biasa
  (pemilik tetap bebas kuota); footer "Using your own API key"
  tidak tampil untuk jawaban ini. Bila rantai sistem IKUT habis,
  pesan yang terkirim menyebut kedua jalur sudah dicoba ("I tried
  both your own key and the Wesio system key, but both are out of
  quota…"), tetap manusiawi, tanpa teks teknis. Bila kunci sistem
  TIDAK terkonfigurasi, pesan lama dipertahankan persis.
- Kesalahan kunci BUKAN kuota (401/403 ditolak/ditangguhkan, 402
  tanpa kredit) TIDAK dialihkan ke sistem — panggilRantai melempar
  ulang status itu tanpa .semuaHabis, sehingga penanganan lamanya
  berlaku persis seperti sebelumnya.
- URUTAN GEMINI TERBARU DULU: helper baru `urutkanModelGemini` —
  urai versi "gemini-<mayor>.<minor>" sebagai pasangan angka
  (3.10 > 3.5, bukan parseFloat), urut menurun; model flash
  mempertahankan keunggulan grupnya (pembawa tingkat gratis);
  model tanpa versi yang terurai tetap di ekor dengan urutan
  relatif asal; sort stabil dan idempoten. Dipakai di
  `rantaiModelKunci` (provider gemini — record lama/acak pun dibaca
  terbaru-dulu) dan di `daftarModelDeteksi` (rantai yang disimpan
  saat deteksi kunci), menggantikan skor parseFloat yang lama.
  Provider lain tidak berubah.

Satu assertion uji lama disesuaikan dengan perilaku baru yang
memang diperintahkan: bagian 17(b) "semua model 429" kini berharap
3 panggilan (2 model kunci sendiri + 1 percobaan sistem) sebelum
pesan akhir — sebelumnya 2, karena bot lama berhenti di kunci
sendiri. Assertion pesannya ("out of quota" + "try again later")
tidak berubah dan tetap lulus pada pesan dua-jalur yang baru.

## Hasil uji putaran ini (dijalankan di mesin ini)
- Baseline sebelum perubahan: Worker **165/165**, eksekutor
  **12/12**. Di tengah perubahan (kode baru, sebelum uji baru):
  164/165 — satu-satunya yang berubah adalah 17(b) di atas.
- `node tests/run_worker_test.mjs` → **185 lulus, 0 gagal** = 165
  uji lama (dengan penyesuaian 17(b) itu) + 20 uji baru bagian 21:
  (a) BYOK Gemini semua 429 → jawaban datang dari rantai sistem,
  catatan kaki peralihan tepat 1x, footer kunci sendiri tidak
  tampil, kuota sistem terpotong (sisa 14 of 15), record kunci
  byte-for-byte tidak berubah; (a2) Premium + Strong → peralihan
  memakai model strong sistem; (b) BYOK 403 → TIDAK dialihkan
  (1 panggilan, pesan kunci lama, sistem tak dipanggil);
  (c) BYOK habis + sistem ikut habis → pesan dua jalur, tanpa
  jawaban AI, tanpa catatan kaki, tanpa teks teknis; (c2) BYOK
  habis + sistem tak terkonfigurasi → pesan lama persis;
  (d) urutan rantai dari record tersimpan terbukti dari urutan
  panggilan: 3.10 → 3.5 → 3.1 → 2.5, model tanpa-versi paling
  belakang; (d2) rantai hasil deteksi /models tersimpan dengan
  urutan yang sama; (e) jawaban BYOK normal → tanpa catatan kaki.
- `python3 tests/run_executor_test.py` → **12 lulus, 0 gagal**
  (regresi). `node --check worker/worker.js` → OK. Audit nama
  pribadi di worker/ + tests/ → 0 temuan.

## Belum terbukti untuk tambahan ini
- Perilaku di layanan asli — putaran ini belum di-push dan belum
  di-deploy ke Worker live (menunggu picu agen induk); bukti di
  atas adalah uji lokal dengan io tiruan, termasuk urutan
  panggilan dan isi KV tiruan.
- Peralihan nyata terhadap kuota provider asli (429 sungguhan dari
  Gemini/OpenRouter lalu jawaban dari kunci sistem sungguhan)
  belum teramati di layanan asli.

# Tambahan 1 Nov 2026 — Downloader dibuka ke semua tautan (kunci platform dicabut)

Keputusan pemilik: downloader mendukung SEMUA tautan video, tidak
terkunci ke beberapa platform. Sebelumnya Worker hanya menerima
host dalam whitelist `DL_HOSTS` (tiktok.com, instagram.com,
youtube.com, youtu.be, x.com, twitter.com) dan menolak sisanya di
muka — padahal mesin yt-dlp di eksekutor mendukung 1.000+ situs.

## Perubahan (worker/worker.js)

1. `DL_HOSTS` dihapus; `tautanDidukung()` diganti `tautanSah()`:
   validasi umum URL — lolos bila (a) skema http:// atau https://,
   (b) terurai sebagai URL sah, (c) host terisi dan masuk akal
   (mengandung titik termasuk subdomain, literal IP, atau label
   tunggal yang sah). Skema lain (file:, ftp:, data:, javascript:)
   tidak pernah lolos — `cariTautan()` memang hanya mengekstrak
   http(s), dan `tautanSah()` memeriksa protokol secara eksplisit.
   Router global ("paste a link anywhere") memakai fungsi yang sama.
2. Pesan penolakan `terimaTautan()` dipecah dua:
   - tidak ada tautan sama sekali (teks biasa, file:, dll.) →
     panduan "I couldn't find a link in that message. Please send
     me a video or audio link — it should start with http:// or
     https://. Links from almost any site are welcome."
   - tautan http(s) tapi tidak terurai sah → panduan periksa-ulang
     tautan lengkap. Pesan lama "not from a supported site" hilang.
3. Teks pengguna diselaraskan di semua tempat yang menyebut daftar
   platform: Welcome ("save videos & audio from almost any site"),
   Help (daftar contoh diperluas: Facebook, Dailymotion, Vimeo,
   Reddit, "1,000+ more"), intro Downloader (kalimat kanonis:
   "Send me a video or audio link from almost any site — YouTube,
   TikTok, Instagram, Facebook, X, Dailymotion, Vimeo, Reddit, and
   1,000+ other sites — … If a post is private or a site refuses
   the download, I'll tell you plainly."), dan petunjuk cadangan
   di akhir router ("paste a video link from almost any site").
4. Eksekutor DIPERIKSA: TIDAK ada validasi host di executor/*.py —
   `executor_job.py` meneruskan `job["url"]` apa adanya ke
   `unduh()` → yt-dlp, jadi tidak ada yang perlu diubah di sana.
   Pemetaan alasan gagal ("unavailable" dkk.) tidak disentuh.
5. Kuota, tombol Video/Audio, job, dan dispatch tidak berubah.

## Penyesuaian uji lama (eksplisit)

- Bagian 5: judul "validasi domain" → "validasi tautan". Skenario
  lama "https://example.com/video/1 → ditolak 'not from a
  supported site' + tanpa job" TIDAK berlaku lagi karena perilaku
  itu memang dicabut; diganti 4 assertion baru: teks bukan tautan →
  panduan + tanpa job; skema file:/// → panduan yang sama + tanpa
  job. Sisa bagian 5 (alur TikTok, dispatch, job KV, kuota 4 of 5)
  tidak berubah dan tetap lulus. Penerimaan example.com kini
  diuji positif di bagian 22. Tidak ada assertion lama lain yang
  disentuh.

## Hasil uji putaran ini (dijalankan di mesin ini)

- Baseline sebelum perubahan: Worker **185/185**, eksekutor
  **12/12**.
- `node tests/run_worker_test.mjs` → **199 lulus, 0 gagal** = 185
  uji lama (dengan penyesuaian bagian 5 di atas: −2 assertion lama,
  +4 assertion pengganti) + 12 uji baru bagian 22: intro memuat
  teks terbuka; Facebook diterima + dispatch + job url facebook;
  Vimeo ditempel langsung di chat diterima + job audio; Dailymotion
  diterima + dispatch; domain acak https://example-site.com/watch/1
  diterima + job url utuh; example.com diterima; tautan X (platform
  lama) tetap diterima.
- `python3 tests/run_executor_test.py` → **12 lulus, 0 gagal**
  (tidak disentuh). `node --check worker/worker.js` → OK.

## Belum terbukti untuk tambahan ini

- Perilaku di layanan asli — putaran ini belum di-push dan belum
  di-deploy ke Worker live (menunggu picu agen induk); bukti di
  atas adalah uji lokal dengan io tiruan.
- Unduhan nyata dari platform di luar daftar lama (Facebook,
  Vimeo, Dailymotion, dsb.) belum teramati di layanan asli;
  penerimaan tautan di Worker terbukti lokal, keberhasilan unduh
  per situs tetap bergantung penolakan/pembatasan situs itu
  sendiri dan dilaporkan apa adanya oleh eksekutor.

---

## Penguatan eksekutor unduhan (1 Nov 2026)

Latar terbukti dari diagnostik runner asli (agen induk, 1 Nov):
(1) ffmpeg TIDAK terpasang di runner ubuntu-latest sehingga perintah
produksi bv*+ba + --merge-output-format mp4 tidak bisa menggabungkan
video+audio dengan benar; (2) YouTube menolak IP runner GitHub dengan
stderr persis "Sign in to confirm you're not a bot" pada semua klien
yt-dlp — penolakan per-IP (IP berganti tiap job), penyebab kegagalan
"unavailable" YouTube selama ini, sedangkan TikTok lolos; (3) eksekutor
membuang stderr yt-dlp sehingga kegagalan tak terdiagnosis dari log.

### Perubahan (HANYA executor/*.py + execute.yml; worker.js tidak disentuh)

1. execute.yml: langkah baru "Pasang ffmpeg" (apt-get update -qq &&
   apt-get install -y -qq ffmpeg, dengan sudo sesuai kebutuhan runner)
   SEBELUM langkah eksekutor; `permissions` ditambah `actions: write`;
   langkah eksekutor kini meneruskan GH_TOKEN_JOB (secrets.GITHUB_TOKEN
   bawaan run) + GH_REPO_JOB (github.repository) untuk retry.
2. downloader.py: klasifikasi stderr baru `_alasan_dari_stderr` —
   "sign in to confirm"/"not a bot" → alasan baru "botcheck"; pola
   filesize tetap "too_big"; sisanya "unavailable". Perintah yt-dlp
   yang dibangun TIDAK berubah. Saat gagal, maks 3 baris ekor stderr
   dicetak ke log Actions dengan kemunculan persis URL job disamarkan
   menjadi "[url]" (`_log_stderr_aman`) — cukup untuk diagnosis tanpa
   meneruskan tautan pengguna melebihi teks error provider.
3. kvjob.py: `simpan_job(job_id, job, ttl=900)` (PUT + expiration_ttl)
   untuk menulis kembali job yang akan dicoba ulang.
4. executor_job.py: PESAN_GAGAL["botcheck"] baru, jujur khusus
   YouTube: "YouTube is asking our server to prove it isn't a bot
   right now, so this download was blocked by YouTube itself. Please
   try again in a little while — it often works on a later attempt."
   Retry lintas job: kegagalan "botcheck" pada host youtube.com /
   youtu.be (termasuk subdomain) dengan percobaan < 3 → job disimpan
   kembali ke KV (field `attempts` +1), execute.yml dipicu ulang via
   API GitHub untuk job_id yang sama (IP runner baru), TANPA pesan
   gagal ke pengguna dan TANPA menutup job. Percobaan ke-3 gagal →
   pesan botcheck terkirim, job ditutup seperti alur gagal biasa.
   Bila simpan/picu ulang gagal di tengah, eksekutor kembali ke alur
   gagal biasa (pesan terkirim) — pengguna tidak pernah menggantung.
   Job non-YouTube atau alasan lain tidak di-retry; perilaku sukses
   dan alasan lain tidak berubah.

### Temuan kuota pada retry

Eksekutor TIDAK menyentuh kuota sama sekali — grep "quota|kuota" di
executor/ dan execute.yml = 0 temuan; tidak ada field kuota di record
job yang dibaca eksekutor. Kuota dipotong Worker saat dispatch awal.
Retry memicu ulang execute.yml langsung (bukan lewat Worker) untuk
job_id yang sama, jadi TIDAK ada pemotongan kedua. Aman secara desain,
bukan sekadar dijaga di kode retry.

### Hasil uji putaran ini (dijalankan di mesin ini)

- Baseline: eksekutor 12/12, Worker 199/199.
- `python3 tests/run_executor_test.py` → **38 lulus, 0 gagal** =
  12 lama utuh + 26 baru (bagian 5–10, yt-dlp tiruan via patch
  subprocess.run + KV/GitHub API tiruan): botcheck attempts 0 →
  alasan botcheck, redispatch 1x dengan job_id sama, record attempts
  0→1, nol pesan ke pengguna; attempts 1 → redispatch lagi,
  attempts→2; attempts 2 (percobaan ke-3) → pesan botcheck terkirim,
  tanpa redispatch, job ditutup; botcheck non-YouTube → tanpa retry,
  pesan sesuai pemetaan; unavailable biasa → tanpa retry, pesan lama;
  log diagnostik memuat "[url]", TIDAK memuat URL asli, maks 3 baris;
  perintah yt-dlp terbukti tidak berubah; execute.yml memuat langkah
  ffmpeg sebelum langkah eksekutor + actions: write + GH_TOKEN_JOB.
- `node tests/run_worker_test.mjs` → **199 lulus, 0 gagal** (tidak
  disentuh). YAML execute.yml lolos parse. Grep nama pribadi di
  berkas yang diubah → 0 temuan.

### Belum terbukti untuk tambahan ini

- Perilaku di layanan asli — belum di-push/di-deploy (menunggu picu
  agen induk). Yang belum teramati live: pemasangan ffmpeg di runner
  asli benar-benar membuat merge bv*+ba menghasilkan satu mp4;
  redispatch via GITHUB_TOKEN benar-benar diterima API GitHub dari
  dalam run (izin actions: write pada token bawaan); dan apakah IP
  job berikutnya benar-benar lolos bot-check YouTube (sifatnya
  peluang per-IP, bukan jaminan — pesan botcheck tetap jalan keluar
  jujurnya sesudah 3 percobaan).
- Penyamaran log hanya mengganti kemunculan PERSIS string URL job;
  stderr yt-dlp yang menyebut ID video tanpa URL penuh tetap tampil
  apa adanya di log (sesuai rancangan: cukup untuk diagnosis).

## Tahap 2 — Modul Moderasi Grup (1 Nov 2026)

Dibangun sesuai konsep §6 + prinsip kemudahan §2 (semua lewat tombol
di chat pribadi, bahasa sederhana, tanpa perintah hafalan), di atas
kode Tahap 1 tanpa mengubah perilakunya. Eksekutor TIDAK disentuh.

### Perubahan (worker/worker.js + tests/run_worker_test.mjs)

1. SIKLUS GRUP: handleUpdate merutekan update my_chat_member dan
   chat_member. Bot ditambah BUKAN admin -> satu pesan sopan meminta
   diangkat admin (tanpa admin bot tak menerima semua pesan & tak
   bisa menghapus). Dipromosi -> grup dicatat di KV `group:<gid>`
   (judul, pengangkat sebagai pengelola awal, setelan bawaan),
   pengumuman singkat di grup, arahan membuka My Groups di chat
   pribadi. Bot keluar/dikeluarkan -> record ditandai nonaktif, data
   TIDAK dihapus. Anggota bergabung ditangani dari pesan layanan
   new_chat_members DAN chat_member (gabungan ganda dari dua jalur
   didedupe via record anggota berjangka 1 jam; anggota bot dilewati).
2. PANEL MY GROUPS (chat pribadi): daftar grup tempat penanya adalah
   pengelola tercatat ATAU getChatMember menyatakan admin/creator
   (yang terkonfirmasi dicatat sebagai pengelola — self-healing);
   pemilik bot melihat semua grup aktif. Panel per grup bersaklar
   berstatus terlihat: captcha anggota baru, anti-tautan pendatang
   (tombol pilihan Off/1h/24h), kata terlarang (saklar + daftar:
   tambah lewat mengetik dalam state grp_word, hapus per kata via
   tombol), sambutan (saklar + ubah teks dalam state grp_welcome,
   mendukung {name}/{group}, kata "default" mengembalikan bawaan),
   statistik minggu ini, log 10 tindakan terakhir, status paket +
   tombol upgrade. Teks "coming in Phase 2" DIGANTI panel ini; teks
   sambutan/bantuan/panel saklar modul diselaraskan.
3. CAPTCHA TOMBOL: anggota baru dibatasi total (restrictChatMember)
   + pesan berisi tombol "✅ I'm human" yang callback-nya membawa
   grup+pengguna; ketukan orang lain dijawab penolakan sopan pada
   jawaban callback itu sendiri. Ketukan benar -> batas dibuka,
   pesan captcha dihapus (adapter baru `sendMsgId` mengembalikan
   message_id), sambutan dikirim. Captcha mati -> sambutan langsung.
4. ANTI-TAUTAN & KATA TERLARANG: tautan (entity url/text_link atau
   pola teks) dari anggota yang masa bergabungnya < jendela grup ->
   pelanggaran; kata terlarang dicocokkan case-insensitive pada teks
   huruf kecil terhadap daftar grup. Admin/creator grup (status
   Telegram, di-cache 10 menit), bot lain, dan pemilik bot bebas.
   Anggota tanpa catatan gabung (bergabung sebelum bot masuk)
   dianggap lama.
5. TANGGA PERINGATAN per pengguna per grup di KV `gwarn:*`,
   kedaluwarsa 7 hari: ke-1 hapus + teguran tertulis (menyebut nama
   + ancaman bisu), ke-2 hapus + bisu 1 jam (until_date), ke-3 hapus
   + ban lalu unban (bisa bergabung lagi nanti) + cacah dibersihkan.
   Setiap langkah masuk log grup `glog:*` (maks 50) dan penghitung
   mingguan `gstat:*` (kunci minggu ISO: joined/deleted/muted/kicked).
6. FREE vs PREMIUM PER GRUP: grup tanpa langganan aktif = paket Free
   (anti-tautan + sambutan aktif; captcha, kata terlarang, statistik
   penuh TERKUNCI berlabel "⭐ Premium per group" — mengetuknya tidak
   mengubah setelan). Upgrade = invoice Stars pola yang sama persis
   (250 XTR/30 hari) dengan payload `groupprem:<gid>:<pembeli>`;
   pre-checkout memvalidasi grup+pembeli+nominal, successful_payment
   menulis `groupprem:<gid>` (record terpisah dari premium pribadi —
   pembayaran grup TIDAK mengaktifkan premium pribadi pembeli, dan
   sebaliknya). Pemilik bot: semua grup Premium, tanpa invoice.
7. KETAHANAN: semua aksi admin grup lewat pembungkus aksiGrup —
   kegagalan hak (mis. dicabut diam-diam) tidak pernah meng-crash
   update; tindakan dilewati dan kehilangan hak dicatat ke log grup
   maks sekali sehari (`gnoadmin:*`). Bila pembatasan captcha gagal,
   anggota jatuh ke sambutan biasa (tidak tertahan pending).
   Adapter buatIo bertambah: getChatMember, restrictMember,
   deleteMsg, banMember, unbanMember, sendMsgId; answerCallback
   menerima teks opsional. Update bukan grup tidak terpengaruh.

### Keputusan desain di titik yang konsepnya diam

- Grup ke-2+ seorang pengelola diperlakukan SAMA dengan grup
  pertama (mode dasar Free yang sama + catatan Premium yang sama):
  kalimat tugas "hanya mode dasar + catatan yang sama" dibaca sebagai
  set fitur dasar yang sama, bukan mematikan penjagaan dasar —
  mematikan anti-tautan/sambutan untuk grup ke-2 tidak tertulis di
  konsep §6 maupun tugas. Yang membedakan hanya label paket di panel.
- Log tindakan tetap bisa dibuka di paket Free (ia mencatat tindakan
  fitur Free — anti-tautan); yang terkunci di Free persis yang disebut
  tugas: captcha, kata terlarang, statistik penuh.
- Setelan bawaan grup baru: anti-tautan 24 jam AKTIF + sambutan AKTIF
  (dua fitur Free "aktif" per konsep), captcha MATI, kata terlarang
  MATI dengan daftar kosong.
- Pencocokan kata terlarang = substring pada teks huruf kecil
  (sederhana, dapat diprediksi admin); bukan pencocokan kata utuh.
- Status admin grup untuk pembebasan moderasi di-cache 10 menit di
  KV agar grup ramai tidak memanggil getChatMember per pesan.

### Penyesuaian uji lama (eksplisit)

- Bagian 9: assertion "My Groups -> Phase 2 + ringkasan manfaat"
  DIGANTI — perilaku "coming in Phase 2" memang dihapus oleh tugas
  ini. Assertion baru membuktikan panel sungguhan (daftar kosong +
  langkah menambah bot + TIDAK ada teks "coming in Phase 2"). Judul
  bagian disesuaikan. Assertion Anonymous Chat di bagian yang sama
  tidak berubah.
- Harness buatIo diperluas (bukan diubah perilakunya): answerCallback
  kini MENCATAT {id, text}; ditambah tiruan getChatMember
  (opts.memberStatus), restrictMember, deleteMsg, banMember,
  unbanMember, sendMsgId + pencatat restricts/deletions/bans/unbans/
  memberChecks/cbJawaban + opts.failActions. Tidak ada assertion lama
  yang bergantung pada bentuk lama.

### Hasil uji putaran ini (dijalankan di mesin ini)

- Baseline: Worker 199/199, eksekutor 38/38.
- `node tests/run_worker_test.mjs` -> **271 lulus, 0 gagal** =
  199 lama (dengan 1 penyesuaian bagian 9 di atas) + 72 baru di
  bagian 23: bot ditambah non-admin -> pesan promosi; dipromosi ->
  tercatat + pengumuman; panel tampil untuk pengelola, untuk admin
  grup via getChatMember (self-healing tercatat), ditolak untuk
  bukan pengelola; pemilik melihat semua; captcha menyala ->
  dibatasi + pesan tombol; ketukan orang lain ditolak di jawaban
  callback; ketukan benar -> dibuka + pesan captcha terhapus +
  sambutan; gabungan chat_member + dedupe dua jalur; tangga tautan
  1/2/3 (tegur -> bisu ±1 jam -> ban+unban) + statistik & log
  bertambah; admin grup dan anggota lama kebal; kata terlarang
  case-insensitive di grup Premium + kelola daftar (tambah via
  mengetik, hapus per tombol); kata terlarang TIDAK ditegakkan di
  Free; saklar Free terkunci berlabel Premium (captcha/kata
  terlarang/statistik); invoice upgrade grup terbit (payload
  groupprem) + pre-checkout menolak nominal/pembeli salah +
  pembayaran mengaktifkan groupprem TANPA menyentuh premium
  pribadi; pemilik tanpa invoice; hak admin hilang -> tidak crash +
  log noadmin sekali sehari + anggota tidak tertahan; bot
  dikeluarkan -> nonaktif + moderasi berhenti; modul groups off ->
  panel menolak jujur dan kejadian grup diam.
- `python3 tests/run_executor_test.py` -> **38 lulus, 0 gagal**
  (tidak disentuh). `node --check worker/worker.js` OK. Grep nama
  pribadi di worker/ + tests/ -> 0 temuan.

### Belum terbukti untuk tambahan ini

- Perilaku di layanan asli — belum di-push/di-deploy (menunggu picu
  agen induk). Bukti akhir: pemilik menambahkan bot sebagai admin ke
  grup sungguhan dari HP.
- Update chat_member hanya dikirim Telegram bila webhook dipasang
  dengan allowed_updates yang memuat "chat_member" (dan
  "my_chat_member"); jalur pesan layanan new_chat_members bekerja
  tanpa itu, jadi gabungan tetap tertangani — pemasangan webhook di
  sisi deploy perlu memastikan kedua jenis update itu diizinkan.
- getChatMember/restrict/delete/ban pada adapter asli belum teramati
  live; di uji lokal adapter grup diwakili tiruan tercatat, dan
  perilaku Worker dibuktikan terhadap tiruan itu.
