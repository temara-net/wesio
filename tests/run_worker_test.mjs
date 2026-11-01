// Uji Worker WesioBot (worker/worker.js) dengan io tiruan penuh:
// KV Map, Telegram/AI/GitHub tercatat, tanpa jaringan sama sekali.
// Jalankan: node tests/run_worker_test.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { handleUpdate, hariIniUTC, MENU_BUTTONS } =
  await import(pathToFileURL(path.join(ROOT, "worker", "worker.js")).href);

let lulus = 0, gagal = 0;
function cek(nama, ok, detail = "") {
  if (ok) { lulus++; console.log("  LULUS  " + nama); }
  else { gagal++; console.log("  GAGAL  " + nama + " :: " + String(detail).slice(0, 220)); }
}

const AI_ON = { apiKey: "kunci-tiruan", baseUrl: "https://ai.invalid/v1",
  modelFast: "fast-1", modelStrong: "strong-1", imageModel: "" };
const AI_OFF = { apiKey: "", baseUrl: "", modelFast: "", modelStrong: "", imageModel: "" };

function buatIo(opts = {}) {
  const kv = new Map();
  const terkirim = [];
  const invoices = [];
  const prechecks = [];
  const dispatches = [];
  const aiCalls = [];
  const keyTests = [];
  const io = {
    adminId: opts.adminId ?? 111,
    ai: opts.ai ?? AI_OFF,
    kvGet: async (k) => (kv.has(k) ? kv.get(k) : null),
    kvPut: async (k, v) => { kv.set(k, v); },
    kvDel: async (k) => { kv.delete(k); },
    kvList: async (p) => [...kv.keys()].filter(k => k.startsWith(p)),
    send: async (chatId, text, markup) => { terkirim.push({ chatId, text, markup }); },
    sendPhoto: async () => {},
    sendInvoice: async (chatId, inv) => { invoices.push({ chatId, inv }); },
    answerPreCheckout: async (id, ok, err) => { prechecks.push({ id, ok, err }); },
    answerCallback: async () => {},
    fetchText: async (url) => ({ url, status: 200, text: "<html><body>isi artikel</body></html>" }),
    callAI: async (messages, model, creds) => {
      aiCalls.push({ messages, model,
        base: creds ? creds.base : null, key: creds ? creds.key : null });
      if (creds && opts.byokFailStatus) {
        const e = new Error("AI HTTP " + opts.byokFailStatus);
        e.status = opts.byokFailStatus;
        throw e;
      }
      return "Mock AI answer.";
    },
    // Tiruan uji kunci provider: "sk-good*" lulus, "sk-down*" tak
    // terjangkau, selain itu ditolak. opts.testKey menimpa aturan ini.
    testApiKey: async (base, key) => {
      keyTests.push({ base, key });
      if (opts.testKey) return opts.testKey(base, key);
      if (key.includes("down")) return { ok: false, reason: "unreachable" };
      if (key.startsWith("sk-good")) return { ok: true };
      return { ok: false, reason: "rejected" };
    },
    genImage: async () => "https://img.invalid/pic.png",
    dispatch: async (jobId) => { dispatches.push(jobId); },
  };
  return { io, kv, terkirim, invoices, prechecks, dispatches, aiCalls, keyTests };
}

let seq = 0;
const msg = (uid, text) => ({ update_id: ++seq, message: {
  chat: { id: uid, type: "private" }, from: { id: uid, first_name: "Tester" }, text } });
const cb = (uid, data) => ({ update_id: ++seq, callback_query: {
  id: "cb" + seq, from: { id: uid, first_name: "Tester" },
  message: { chat: { id: uid, type: "private" } }, data } });
const pre = (uid, payload, amount = 250) => ({ update_id: ++seq, pre_checkout_query: {
  id: "pq" + seq, from: { id: uid }, invoice_payload: payload,
  currency: "XTR", total_amount: amount } });
const paid = (uid, payload) => ({ update_id: ++seq, message: {
  chat: { id: uid, type: "private" }, from: { id: uid, first_name: "Tester" },
  successful_payment: { currency: "XTR", total_amount: 250, invoice_payload: payload } } });

const semua = (W) => W.terkirim.map(x => x.text).join("\n");
const terakhir = (W) => W.terkirim[W.terkirim.length - 1];

console.log("1) /start menampilkan menu tombol lengkap (bot publik)");
{
  const W = buatIo();
  await handleUpdate(W.io, msg(1001, "/start"));
  const t = terakhir(W);
  cek("sapaan menyebut nama profil pengirim", t.text.startsWith("👋 Hi, Tester!"), t.text.slice(0, 80));
  const tombol = (t.markup?.keyboard || []).flat();
  cek("reply keyboard memuat 6 tombol persis konsep",
      MENU_BUTTONS.every(b => tombol.includes(b)), JSON.stringify(tombol));
  await handleUpdate(W.io, msg(1002, "/start"));
  cek("pengguna kedua (bukan pemilik/admin) tetap dilayani",
      W.terkirim.some(x => x.chatId === 1002 && x.text.includes("I'm Wesio")), "");
  cek("kedua pengguna tercatat di registry",
      W.kv.has("user:1001") && W.kv.has("user:1002"), [...W.kv.keys()].join(","));
}

console.log("2) AI belum terkonfigurasi -> pesan jujur, bukan error mentah");
{
  const W = buatIo({ ai: AI_OFF });
  await handleUpdate(W.io, msg(2001, "🤖 AI Chat"));
  cek("balasan menyatakan AI belum tersambung",
      terakhir(W).text.includes("not switched on yet"), terakhir(W).text.slice(0, 150));
  cek("tidak ada teks teknis (Error/HTTP/stack) di balasan",
      !/error|http \d|undefined|null/.test(terakhir(W).text.toLowerCase().replace("not switched on yet", "")), terakhir(W).text);
}

console.log("3) Kuota AI berkurang tiap pesan dan berhenti tepat di batas");
{
  const W = buatIo({ ai: AI_ON });
  await handleUpdate(W.io, msg(3001, "🤖 AI Chat"));
  cek("intro AI menampilkan sisa kuota 15 of 15",
      terakhir(W).text.includes("left today: 15 of 15"), terakhir(W).text.slice(-200));
  for (let i = 1; i <= 15; i++) {
    await handleUpdate(W.io, msg(3001, "pertanyaan " + i));
  }
  cek("15 pesan dijawab AI", W.aiCalls.length === 15, String(W.aiCalls.length));
  cek("jawaban ke-15 menampilkan sisa 0",
      W.terkirim.some(x => x.text.includes("AI messages left today: 0 of 15")), semua(W).slice(-300));
  await handleUpdate(W.io, msg(3001, "satu lagi"));
  cek("pesan ke-16 ditolak ramah + ditawari Premium",
      terakhir(W).text.includes("used all 15 AI messages") &&
      terakhir(W).text.includes("Premium"), terakhir(W).text.slice(0, 200));
  cek("AI tidak dipanggil sesudah kuota habis", W.aiCalls.length === 15, String(W.aiCalls.length));
  cek("kuota tersimpan di KV sesuai kunci pola",
      W.kv.get(`quota:3001:ai:${hariIniUTC()}`) === "15", [...W.kv.keys()].join(","));
}

console.log("4) Model kuat khusus Premium; tugas cepat Summarize jalan");
{
  const W = buatIo({ ai: AI_ON });
  await handleUpdate(W.io, msg(4001, "/ai"));
  await handleUpdate(W.io, cb(4001, "ai:model:strong"));
  cek("pengguna Free memilih Strong -> ditolak ramah (Premium)",
      terakhir(W).text.includes("Premium feature"), terakhir(W).text.slice(0, 150));
  W.kv.set("premium:4001", new Date(Date.now() + 86400000).toISOString());
  await handleUpdate(W.io, cb(4001, "ai:model:strong"));
  cek("pengguna Premium bisa memilih Strong",
      terakhir(W).text.includes("Model set to 🧠 Strong"), terakhir(W).text);
  await handleUpdate(W.io, msg(4001, "halo"));
  cek("panggilan AI memakai model strong",
      W.aiCalls.length === 1 && W.aiCalls[0].model === "strong-1", JSON.stringify(W.aiCalls.map(a => a.model)));
  await handleUpdate(W.io, cb(4001, "ai:task:summarize"));
  cek("tombol Summarize meminta teks",
      terakhir(W).text.includes("summarized"), terakhir(W).text.slice(0, 120));
  await handleUpdate(W.io, msg(4001, "Teks panjang yang mau diringkas."));
  cek("tugas Summarize dijawab AI dengan prompt tugas",
      W.aiCalls.length === 2 &&
      W.aiCalls[1].messages[0].content.includes("Summarize"), JSON.stringify(W.aiCalls[1]?.messages?.[0]));
}

console.log("5) Alur Downloader: validasi domain, tombol format, job + dispatch, kuota");
{
  const W = buatIo({ ai: AI_ON });
  await handleUpdate(W.io, msg(5001, "⬇️ Downloader"));
  cek("intro Downloader menampilkan sisa 5 of 5",
      terakhir(W).text.includes("left today: 5 of 5"), terakhir(W).text.slice(-150));
  await handleUpdate(W.io, msg(5001, "https://example.com/video/1"));
  cek("tautan di luar platform didukung -> ditolak jelas",
      terakhir(W).text.includes("not from a supported site"), terakhir(W).text.slice(0, 150));
  cek("tidak ada job dari tautan tidak sah", W.dispatches.length === 0, "");
  await handleUpdate(W.io, msg(5001, "https://www.tiktok.com/@user/video/123456"));
  const fmtBtn = (terakhir(W).markup?.inline_keyboard || []).flat().map(b => b.callback_data);
  cek("tautan sah -> tombol Video|Audio tampil",
      fmtBtn.includes("dl:video") && fmtBtn.includes("dl:audio"), JSON.stringify(fmtBtn));
  await handleUpdate(W.io, cb(5001, "dl:video"));
  cek("dispatch ke Actions tepat 1x", W.dispatches.length === 1, JSON.stringify(W.dispatches));
  const jobKey = [...W.kv.keys()].find(k => k.startsWith("job:"));
  const job = jobKey ? JSON.parse(W.kv.get(jobKey)) : null;
  cek("job unduhan tertulis di KV (url+format+chat)",
      !!job && job.type === "download" && job.format === "video" &&
      job.url.includes("tiktok.com") && job.chat_id === 5001, jobKey || "job tidak ada");
  cek("balasan Processing + sisa kuota 4 of 5",
      terakhir(W).text.includes("Processing your download") &&
      terakhir(W).text.includes("left today: 4 of 5"), terakhir(W).text);
  cek("kuota unduh KV = 1", W.kv.get(`quota:5001:dl:${hariIniUTC()}`) === "1", "");
}

console.log("6) Kuota unduh habis -> penjelasan + tanpa job");
{
  const W = buatIo({ ai: AI_ON });
  W.kv.set(`quota:6001:dl:${hariIniUTC()}`, "5");
  await handleUpdate(W.io, msg(6001, "⬇️ Downloader"));
  await handleUpdate(W.io, msg(6001, "https://youtu.be/abc123"));
  cek("kuota habis -> pesan reset besok + Premium",
      terakhir(W).text.includes("used all 5 downloads") &&
      terakhir(W).text.includes("00:00 UTC"), terakhir(W).text.slice(0, 200));
  cek("tidak ada dispatch saat kuota habis", W.dispatches.length === 0, "");
}

console.log("7) Premium Stars: invoice, pre-checkout, pembayaran, aktivasi");
{
  const W = buatIo({ ai: AI_ON });
  await handleUpdate(W.io, msg(7001, "/premium"));
  cek("layar Premium memuat tabel Free vs Premium + harga 250 Stars",
      terakhir(W).text.includes("Free vs Premium") &&
      terakhir(W).text.includes("250 Stars"), terakhir(W).text.slice(0, 200));
  await handleUpdate(W.io, cb(7001, "buy:premium"));
  cek("invoice Stars terkirim (XTR, 250, payload berisi uid)",
      W.invoices.length === 1 && W.invoices[0].inv.currency === "XTR" &&
      W.invoices[0].inv.prices[0].amount === 250 &&
      W.invoices[0].inv.payload === "premium:7001", JSON.stringify(W.invoices));
  await handleUpdate(W.io, pre(7001, "premium:7001", 100));
  cek("pre-checkout nominal salah -> ditolak",
      W.prechecks.length === 1 && W.prechecks[0].ok === false, JSON.stringify(W.prechecks));
  await handleUpdate(W.io, pre(7001, "premium:7001", 250));
  cek("pre-checkout benar -> ok", W.prechecks[1]?.ok === true, JSON.stringify(W.prechecks));
  await handleUpdate(W.io, paid(7001, "premium:7001"));
  const exp = Date.parse(W.kv.get("premium:7001") || "");
  cek("successful_payment -> premium tersimpan ±30 hari",
      exp > Date.now() + 29 * 86400000 && exp < Date.now() + 31 * 86400000,
      W.kv.get("premium:7001") || "tidak ada");
  await handleUpdate(W.io, msg(7001, "/premium"));
  cek("/premium sesudah bayar menampilkan status aktif",
      terakhir(W).text.includes("Premium, active until"), terakhir(W).text.slice(0, 200));
}

console.log("8) Pembayaran dengan payload pengguna lain -> tidak mengaktifkan siapa pun");
{
  const W = buatIo({ ai: AI_ON });
  await handleUpdate(W.io, paid(8002, "premium:8001"));
  cek("payload milik uid lain: pembayar tidak jadi premium",
      !W.kv.has("premium:8002"), [...W.kv.keys()].join(","));
  cek("payload milik uid lain: pemilik payload juga tidak aktif",
      !W.kv.has("premium:8001"), [...W.kv.keys()].join(","));
  cek("pengguna diberi tahu pembayaran tidak cocok",
      terakhir(W).text.includes("doesn't match"), terakhir(W).text.slice(0, 150));
}

console.log("9) Modul Tahap 2/3 menjawab jujur 'coming soon'");
{
  const W = buatIo({ ai: AI_ON });
  await handleUpdate(W.io, msg(9001, "🛡️ My Groups"));
  cek("My Groups -> Phase 2 + ringkasan manfaat",
      terakhir(W).text.includes("coming in Phase 2") &&
      terakhir(W).text.includes("anti-spam"), terakhir(W).text.slice(0, 150));
  await handleUpdate(W.io, msg(9001, "💬 Anonymous Chat"));
  cek("Anonymous Chat -> Phase 3 + catatan keamanan",
      terakhir(W).text.includes("coming in Phase 3") &&
      terakhir(W).text.includes("18+"), terakhir(W).text.slice(0, 150));
}

console.log("10) /admin_stats: non-admin ditolak, admin dapat laporan");
{
  const W = buatIo({ ai: AI_ON, adminId: 111 });
  await handleUpdate(W.io, msg(10001, "/start"));
  await handleUpdate(W.io, msg(10001, "/admin_stats"));
  cek("non-admin ditolak jelas",
      terakhir(W).text.includes("only available to the bot's admin"), terakhir(W).text.slice(0, 120));
  await handleUpdate(W.io, msg(111, "/admin_stats"));
  cek("admin menerima laporan (pengguna terdaftar terhitung)",
      terakhir(W).text.includes("Registered users: 2") &&
      terakhir(W).text.includes("Premium active:"), terakhir(W).text);
}

console.log("11) BYOK: kunci ditolak/tak terjangkau TIDAK disimpan; kunci lulus disimpan");
{
  const W = buatIo({ ai: AI_ON });
  await handleUpdate(W.io, cb(11001, "byok:open"));
  cek("panel BYOK tanpa kunci: status 'no key saved'",
      terakhir(W).text.includes("no key saved"), terakhir(W).text.slice(0, 150));
  await handleUpdate(W.io, cb(11001, "byok:provider:openai"));
  cek("pilih provider -> diminta kirim kunci + janji dites dulu",
      terakhir(W).text.includes("OpenAI") &&
      terakhir(W).text.includes("only saved if the test passes"), terakhir(W).text.slice(0, 200));
  await handleUpdate(W.io, msg(11001, "sk-bad-111"));
  cek("kunci ditolak provider -> pesan manusia 'rejected'",
      terakhir(W).text.includes("rejected that key"), terakhir(W).text.slice(0, 150));
  cek("kunci ditolak -> TIDAK tersimpan di KV", !W.kv.has("apikey:11001"), [...W.kv.keys()].join(","));
  cek("tes kunci benar-benar dipanggil ke base OpenAI",
      W.keyTests.length === 1 && W.keyTests[0].base === "https://api.openai.com/v1",
      JSON.stringify(W.keyTests.map(k => k.base)));
  await handleUpdate(W.io, msg(11001, "sk-down-222"));
  cek("provider tak terjangkau -> pesan beda + tetap tidak tersimpan",
      terakhir(W).text.includes("couldn't reach") && !W.kv.has("apikey:11001"),
      terakhir(W).text.slice(0, 150));
  await handleUpdate(W.io, msg(11001, "sk-good-333"));
  cek("kunci lulus tes -> konfirmasi + model default provider disebut",
      terakhir(W).text.includes("passed the test") &&
      terakhir(W).text.includes("gpt-4o-mini"), terakhir(W).text.slice(0, 250));
  const rec = JSON.parse(W.kv.get("apikey:11001") || "{}");
  cek("record tersimpan {provider, base, key} persis",
      rec.provider === "openai" && rec.base === "https://api.openai.com/v1" &&
      rec.key === "sk-good-333", JSON.stringify(Object.keys(rec)));
  cek("nilai kunci TIDAK PERNAH muncul di pesan keluar mana pun",
      !semua(W).includes("sk-bad-111") && !semua(W).includes("sk-down-222") &&
      !semua(W).includes("sk-good-333"), "");
  cek("nilai kunci TIDAK masuk record percakapan/riwayat",
      !(W.kv.get("conv:11001") || "").includes("sk-good-333"), W.kv.get("conv:11001") || "");
}

console.log("12) BYOK dipakai: model provider, tanpa potong kuota, catatan kaki; jalan walau sistem mati");
{
  const W = buatIo({ ai: AI_ON });
  await handleUpdate(W.io, cb(12001, "byok:provider:openrouter"));
  await handleUpdate(W.io, msg(12001, "sk-good-ort"));
  await handleUpdate(W.io, msg(12001, "🤖 AI Chat"));
  cek("intro AI menyebut kunci sendiri aktif (OpenRouter)",
      terakhir(W).text.includes("Your own OpenRouter API key is active"), terakhir(W).text.slice(-300));
  await handleUpdate(W.io, msg(12001, "halo"));
  const call = W.aiCalls[W.aiCalls.length - 1];
  cek("panggilan AI memakai base+model+kunci pengguna",
      !!call && call.base === "https://openrouter.ai/api/v1" &&
      call.model === "openai/gpt-4o-mini" && call.key === "sk-good-ort",
      JSON.stringify(call && { b: call.base, m: call.model }));
  cek("jawaban memuat catatan kaki BYOK",
      terakhir(W).text.includes("Using your own API key — no Wesio quota used"),
      terakhir(W).text.slice(-200));
  cek("kuota sistem TIDAK terpotong untuk pengguna BYOK",
      !W.kv.has(`quota:12001:ai:${hariIniUTC()}`), [...W.kv.keys()].join(","));
  await handleUpdate(W.io, cb(12001, "byok:open"));
  cek("panel BYOK berkunci: status aktif menyebut provider, bukan nilai kunci",
      terakhir(W).text.includes("Status: active") &&
      terakhir(W).text.includes("OpenRouter") &&
      !terakhir(W).text.includes("sk-good-ort"), terakhir(W).text.slice(0, 200));

  const W2 = buatIo({ ai: AI_OFF });
  W2.kv.set("apikey:12002", JSON.stringify({
    provider: "gemini",
    base: "https://generativelanguage.googleapis.com/v1beta/openai/",
    key: "sk-good-gem" }));
  await handleUpdate(W2.io, msg(12002, "🤖 AI Chat"));
  cek("sistem belum terkonfigurasi TAPI punya kunci -> modul AI tetap terbuka",
      !terakhir(W2).text.includes("not switched on yet") &&
      terakhir(W2).text.includes("Google Gemini"), terakhir(W2).text.slice(0, 200));
  await handleUpdate(W2.io, msg(12002, "tes"));
  cek("chat jalan dengan model default Gemini milik pengguna",
      W2.aiCalls.length === 1 && W2.aiCalls[0].model === "gemini-2.0-flash",
      JSON.stringify(W2.aiCalls.map(a => a.model)));
}

console.log("13) Kunci sendiri gagal saat dipakai (401) -> penjelasan + tawaran hapus; hapus -> jalur sistem");
{
  const W = buatIo({ ai: AI_ON, byokFailStatus: 401 });
  W.kv.set("apikey:13001", JSON.stringify({
    provider: "openai", base: "https://api.openai.com/v1", key: "sk-good-mati" }));
  await handleUpdate(W.io, msg(13001, "/ai"));
  await handleUpdate(W.io, msg(13001, "halo"));
  cek("provider menolak kunci saat dipakai -> pesan manusia menyebut itu jawaban provider",
      terakhir(W).text.includes("answered with an error for your own API key"),
      terakhir(W).text.slice(0, 250));
  const btns = (terakhir(W).markup?.inline_keyboard || []).flat().map(b => b.callback_data);
  cek("pesan gagal menawarkan tombol Remove my key",
      btns.includes("byok:remove"), JSON.stringify(btns));
  await handleUpdate(W.io, cb(13001, "byok:remove"));
  cek("hapus kunci -> konfirmasi penghapusan",
      terakhir(W).text.includes("has been removed"), terakhir(W).text.slice(0, 150));
  cek("record kunci terhapus dari KV", !W.kv.has("apikey:13001"), "");
  await handleUpdate(W.io, msg(13001, "halo lagi"));
  const call = W.aiCalls[W.aiCalls.length - 1];
  cek("sesudah hapus: kembali ke kunci sistem (model fast, tanpa kredensial pengguna)",
      !!call && call.model === "fast-1" && call.key === null, JSON.stringify(call && { m: call.model }));
  cek("kuota sistem kembali terpotong normal",
      W.kv.get(`quota:13001:ai:${hariIniUTC()}`) === "1", "");
}

console.log("14) Saklar modul: non-admin ditolak; modul off -> pesan jujur, kuota utuh");
{
  const W = buatIo({ ai: AI_ON, adminId: 111 });
  await handleUpdate(W.io, msg(14009, "/admin_modules"));
  cek("non-admin /admin_modules ditolak",
      terakhir(W).text.includes("only available to the bot's admin"), terakhir(W).text.slice(0, 120));
  await handleUpdate(W.io, cb(14009, "admin:mod:ai"));
  cek("non-admin menekan saklar ditolak + config tidak berubah",
      terakhir(W).text.includes("only available to the bot's admin") &&
      !W.kv.has("config:modules"), terakhir(W).text.slice(0, 120));
  await handleUpdate(W.io, msg(111, "/admin_modules"));
  const panelBtns = (terakhir(W).markup?.inline_keyboard || []).flat();
  cek("admin menerima panel 4 saklar, semua ON di awal",
      panelBtns.length === 4 &&
      panelBtns.every(b => b.text.includes("✅ ON")), JSON.stringify(panelBtns.map(b => b.text)));
  await handleUpdate(W.io, cb(111, "admin:mod:ai"));
  const panelSesudah = (terakhir(W).markup?.inline_keyboard || []).flat().map(b => b.text);
  cek("saklar AI ditekan -> panel baru menampilkan OFF",
      panelSesudah.some(t => t.includes("AI Chat: ⏸ OFF")) &&
      panelSesudah.filter(t => t.includes("✅ ON")).length === 3,
      JSON.stringify(panelSesudah));
  const cfg = JSON.parse(W.kv.get("config:modules") || "{}");
  cek("config tersimpan di KV config:modules (ai=false, lain tetap true)",
      cfg.ai === false && cfg.download === true && cfg.groups === true && cfg.anon === true,
      JSON.stringify(cfg));
  await handleUpdate(W.io, msg(14001, "🤖 AI Chat"));
  cek("modul AI off -> pengguna menerima pesan 'temporarily off'",
      terakhir(W).text.includes("temporarily off"), terakhir(W).text.slice(0, 150));
  cek("modul off -> AI tidak dipanggil & kuota tidak terpotong",
      W.aiCalls.length === 0 && ![...W.kv.keys()].some(k => k.startsWith("quota:14001")),
      [...W.kv.keys()].join(","));
  await handleUpdate(W.io, cb(111, "admin:mod:download"));
  await handleUpdate(W.io, msg(14001, "https://www.tiktok.com/@user/video/123"));
  cek("modul download off -> tautan pun ditolak jujur, tanpa dispatch",
      terakhir(W).text.includes("temporarily off") && W.dispatches.length === 0,
      terakhir(W).text.slice(0, 150));
  await handleUpdate(W.io, cb(111, "admin:mod:ai"));
  await handleUpdate(W.io, msg(14001, "🤖 AI Chat"));
  cek("modul dinyalakan lagi -> pengguna dilayani kembali",
      terakhir(W).text.includes("AI Chat") &&
      terakhir(W).text.includes("left today: 15 of 15"), terakhir(W).text.slice(-200));
}

console.log("15) Ban: alur penuh, non-admin ditolak, admin tak bisa mem-ban diri sendiri");
{
  const W = buatIo({ ai: AI_ON, adminId: 111 });
  await handleUpdate(W.io, msg(15001, "/start"));
  cek("sebelum ban: pengguna dilayani normal",
      terakhir(W).text.includes("I'm Wesio"), terakhir(W).text.slice(0, 100));
  await handleUpdate(W.io, msg(15001, "/admin_ban 15002"));
  cek("non-admin /admin_ban ditolak + tidak ada record ban",
      terakhir(W).text.includes("only available to the bot's admin") &&
      !W.kv.has("ban:15002"), terakhir(W).text.slice(0, 120));
  await handleUpdate(W.io, msg(111, "/admin_ban 111"));
  cek("admin mem-ban ID admin sendiri -> ditolak jelas",
      terakhir(W).text.includes("admin cannot be") && !W.kv.has("ban:111"),
      terakhir(W).text.slice(0, 150));
  await handleUpdate(W.io, msg(111, "/admin_ban abc"));
  cek("argumen bukan angka -> petunjuk pemakaian, tanpa record",
      terakhir(W).text.includes("Usage: /admin_ban") &&
      ![...W.kv.keys()].some(k => k.startsWith("ban:")), terakhir(W).text.slice(0, 120));
  await handleUpdate(W.io, msg(111, "/admin_ban 15001"));
  cek("admin mem-ban pengguna -> konfirmasi + record ban:<uid>",
      terakhir(W).text.includes("now banned") && W.kv.has("ban:15001"),
      terakhir(W).text.slice(0, 150));
  await handleUpdate(W.io, msg(15001, "/start"));
  cek("pengguna ter-ban: /start ditolak sopan",
      terakhir(W).text.includes("has been suspended"), terakhir(W).text.slice(0, 150));
  await handleUpdate(W.io, msg(15001, "⬇️ Downloader"));
  cek("pengguna ter-ban: modul lain juga ditolak",
      terakhir(W).text.includes("has been suspended") && W.dispatches.length === 0,
      terakhir(W).text.slice(0, 150));
  await handleUpdate(W.io, cb(15001, "nav:premium"));
  cek("pengguna ter-ban: tombol inline pun ditolak",
      terakhir(W).text.includes("has been suspended"), terakhir(W).text.slice(0, 150));
  await handleUpdate(W.io, msg(111, "/admin_stats"));
  cek("statistik admin memuat hitungan ter-ban + status modul",
      terakhir(W).text.includes("Banned users: 1") &&
      terakhir(W).text.includes("Modules:") &&
      terakhir(W).text.includes("AI Chat on"), terakhir(W).text);
  await handleUpdate(W.io, msg(111, "/admin_unban 15001"));
  cek("unban -> konfirmasi + record terhapus",
      terakhir(W).text.includes("no longer banned") && !W.kv.has("ban:15001"),
      terakhir(W).text.slice(0, 150));
  await handleUpdate(W.io, msg(15001, "/start"));
  cek("sesudah unban: pengguna dilayani lagi",
      terakhir(W).text.includes("I'm Wesio"), terakhir(W).text.slice(0, 100));
}

console.log(`\nHASIL: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
