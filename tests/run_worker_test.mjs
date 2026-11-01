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
    callAI: async (messages, model) => { aiCalls.push({ messages, model }); return "Mock AI answer."; },
    genImage: async () => "https://img.invalid/pic.png",
    dispatch: async (jobId) => { dispatches.push(jobId); },
  };
  return { io, kv, terkirim, invoices, prechecks, dispatches, aiCalls };
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

console.log(`\nHASIL: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
