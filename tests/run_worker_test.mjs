// Uji Worker WesioBot (worker/worker.js) dengan io tiruan penuh:
// KV Map, Telegram/AI/GitHub tercatat, tanpa jaringan sama sekali.
// Jalankan: node tests/run_worker_test.mjs
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const { handleUpdate, hariIniUTC, MENU_BUTTONS, buatIo: buatIoAsli } =
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
  const photos = [];
  const photoBytes = [];
  // Tiruan API grup (Tahap 2): semua panggilan tercatat.
  const restricts = [];
  const deletions = [];
  const bans = [];
  const unbans = [];
  const memberChecks = [];
  const cbJawaban = [];
  let msgSeq = 5000;
  const gagalAksi = () => {
    if (opts.failActions) throw new Error("Forbidden: not enough rights");
  };
  const io = {
    adminId: opts.adminId ?? 111,
    ai: opts.ai ?? AI_OFF,
    kvGet: async (k) => (kv.has(k) ? kv.get(k) : null),
    kvPut: async (k, v) => { kv.set(k, v); },
    kvDel: async (k) => { kv.delete(k); },
    kvList: async (p) => [...kv.keys()].filter(k => k.startsWith(p)),
    send: async (chatId, text, markup) => { terkirim.push({ chatId, text, markup }); },
    sendPhoto: async (chatId, url, caption) => { photos.push({ chatId, url, caption }); },
    sendPhotoBytes: async (chatId, base64, mimeType, caption) => {
      photoBytes.push({ chatId, base64, mimeType, caption }); },
    sendInvoice: async (chatId, inv) => { invoices.push({ chatId, inv }); },
    answerPreCheckout: async (id, ok, err) => { prechecks.push({ id, ok, err }); },
    answerCallback: async (id, text) => { cbJawaban.push({ id, text }); },
    // ---- API grup tiruan ----
    // opts.memberStatus: peta "<gid>:<uid>" -> status Telegram, atau
    // fungsi (gid, uid) -> status. Bawaan "member".
    getChatMember: async (chatId, userId) => {
      memberChecks.push({ chatId, userId });
      const st = typeof opts.memberStatus === "function"
        ? opts.memberStatus(chatId, userId)
        : (opts.memberStatus || {})[`${chatId}:${userId}`] || "member";
      return { status: st, user: { id: userId } };
    },
    restrictMember: async (chatId, userId, permissions, untilDate) => {
      gagalAksi();
      restricts.push({ chatId, userId, permissions, untilDate });
    },
    deleteMsg: async (chatId, messageId) => {
      gagalAksi();
      deletions.push({ chatId, messageId });
    },
    banMember: async (chatId, userId) => {
      gagalAksi();
      bans.push({ chatId, userId });
    },
    unbanMember: async (chatId, userId) => {
      gagalAksi();
      unbans.push({ chatId, userId });
    },
    sendMsgId: async (chatId, text, markup) => {
      const id = ++msgSeq;
      terkirim.push({ chatId, text, markup, msgId: id });
      return id;
    },
    fetchText: async (url) => ({ url, status: 200, text: "<html><body>isi artikel</body></html>" }),
    callAI: async (messages, model, creds) => {
      aiCalls.push({ messages, model,
        base: creds ? creds.base : null, key: creds ? creds.key : null });
      // opts.aiFailFor(model) -> status HTTP untuk model itu saja,
      // untuk menguji rantai model (lompat saat 429/404/503).
      if (opts.aiFailFor) {
        const st = opts.aiFailFor(model, creds);
        if (st) {
          const e = new Error("AI HTTP " + st);
          e.status = st;
          throw e;
        }
      }
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
    genImage: opts.genImage ?? (async () => "https://img.invalid/pic.png"),
    dispatch: async (jobId) => { dispatches.push(jobId); },
  };
  return { io, kv, terkirim, invoices, prechecks, dispatches, aiCalls,
    keyTests, photos, photoBytes, restricts, deletions, bans, unbans,
    memberChecks, cbJawaban };
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

// ---- builder update grup (Tahap 2) ----
const gchat = (gid, title = "Grup Uji") =>
  ({ id: gid, type: "supergroup", title });
const gmsg = (gid, uid, text, extra = {}) => ({ update_id: ++seq, message: {
  message_id: 1000 + seq, chat: gchat(gid),
  from: { id: uid, first_name: "Tester" }, text, ...extra } });
const gjoin = (gid, adder, members) => ({ update_id: ++seq, message: {
  message_id: 1000 + seq, chat: gchat(gid),
  from: { id: adder, first_name: "Tester" },
  new_chat_members: members } });
const botMember = (gid, fromUid, statusLama, statusBaru) => ({
  update_id: ++seq, my_chat_member: {
    chat: gchat(gid), from: { id: fromUid, first_name: "Tester" },
    old_chat_member: { user: { id: 4242, is_bot: true }, status: statusLama },
    new_chat_member: { user: { id: 4242, is_bot: true }, status: statusBaru } } });
const chatMemberJoin = (gid, member) => ({ update_id: ++seq, chat_member: {
  chat: gchat(gid), from: { id: 666, first_name: "Tester" },
  user: member,
  old_chat_member: { user: member, status: "left" },
  new_chat_member: { user: member, status: "member" } } });
const cbg = (gid, uid, data) => ({ update_id: ++seq, callback_query: {
  id: "cbg" + seq, from: { id: uid, first_name: "Tester" },
  message: { chat: gchat(gid), message_id: 55 }, data } });
const keGrup = (W, gid) => W.terkirim.filter(x => x.chatId === gid);
const teksGrup = (W, gid) => keGrup(W, gid).map(x => x.text).join("\n");

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

console.log("5) Alur Downloader: validasi tautan, tombol format, job + dispatch, kuota");
{
  const W = buatIo({ ai: AI_ON });
  await handleUpdate(W.io, msg(5001, "⬇️ Downloader"));
  cek("intro Downloader menampilkan sisa 5 of 5",
      terakhir(W).text.includes("left today: 5 of 5"), terakhir(W).text.slice(-150));
  await handleUpdate(W.io, msg(5001, "tolong unduhkan video yang ini ya"));
  cek("teks bukan tautan -> panduan kirim tautan",
      terakhir(W).text.includes("couldn't find a link") &&
      terakhir(W).text.includes("https://"), terakhir(W).text.slice(0, 150));
  cek("tidak ada job dari teks biasa", W.dispatches.length === 0, "");
  await handleUpdate(W.io, msg(5001, "file:///etc/passwd"));
  cek("skema file: -> ditolak dengan panduan yang sama",
      terakhir(W).text.includes("couldn't find a link"), terakhir(W).text.slice(0, 150));
  cek("tidak ada job dari skema file:", W.dispatches.length === 0, "");
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

console.log("9) My Groups = panel sungguhan Tahap 2; Anonymous Chat tetap 'coming soon' jujur");
{
  const W = buatIo({ ai: AI_ON });
  await handleUpdate(W.io, msg(9001, "🛡️ My Groups"));
  cek("My Groups -> panel sungguhan (bukan 'coming soon'): daftar kosong + langkah menambah bot",
      terakhir(W).text.includes("My Groups") &&
      terakhir(W).text.includes("don't manage any group") &&
      terakhir(W).text.includes("Promote me to admin") &&
      !terakhir(W).text.includes("coming in Phase 2"),
      terakhir(W).text.slice(0, 150));
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

console.log("16) BYOK auto-detect: tempel kunci -> provider ketemu sendiri; model gratis dipilih");
{
  // (a) Panel menonjolkan tombol Paste; tombol manual tetap ada.
  const Wp = buatIo({ ai: AI_ON });
  await handleUpdate(Wp.io, cb(16000, "byok:open"));
  const panelBtns = (terakhir(Wp).markup?.inline_keyboard || []).flat();
  const panelCb = panelBtns.map(b => b.callback_data);
  cek("panel: tombol utama '📋 Paste my API key' tampil pertama",
      panelBtns[0]?.callback_data === "byok:paste" &&
      panelBtns[0]?.text.includes("Paste my API key"),
      JSON.stringify(panelBtns.map(b => b.text)));
  cek("panel: tombol provider manual tetap ada sebagai cadangan",
      panelCb.includes("byok:provider:openai") &&
      panelCb.includes("byok:provider:openrouter") &&
      panelCb.includes("byok:provider:gemini"), JSON.stringify(panelCb));
  cek("panel: teks menjelaskan deteksi otomatis",
      terakhir(Wp).text.includes("detect"), terakhir(Wp).text.slice(0, 200));
  await handleUpdate(Wp.io, cb(16000, "byok:paste"));
  cek("ketuk Paste -> diminta kirim kunci + janji dideteksi otomatis",
      terakhir(Wp).text.includes("detect it from the key"),
      terakhir(Wp).text.slice(0, 200));

  // (b) Kunci "AIza…" gratisan -> terdeteksi Gemini tanpa pilih provider.
  const W = buatIo({ ai: AI_ON, testKey: (base) =>
    base.includes("googleapis")
      ? { ok: true }
      : { ok: false, reason: "rejected" } });
  await handleUpdate(W.io, cb(16001, "byok:paste"));
  await handleUpdate(W.io, msg(16001, "AIzaSy-gratis-123"));
  cek("AIza…: kandidat pertama yang diuji adalah Gemini",
      W.keyTests.length >= 1 &&
      W.keyTests[0].base.includes("googleapis"),
      JSON.stringify(W.keyTests.map(k => k.base)));
  cek("AIza…: konfirmasi menyebut terdeteksi sebagai Google Gemini",
      terakhir(W).text.includes("detected it as a Google Gemini key"),
      terakhir(W).text.slice(0, 250));
  const recG = JSON.parse(W.kv.get("apikey:16001") || "{}");
  cek("AIza…: record menyimpan rantai cadangan Gemini + model aktif",
      recG.provider === "gemini" && recG.base.includes("googleapis") &&
      JSON.stringify(recG.models) ===
        JSON.stringify(["gemini-2.5-flash", "gemini-2.0-flash"]) &&
      recG.active === "gemini-2.5-flash" && recG.key === "AIzaSy-gratis-123",
      JSON.stringify({ p: recG.provider, m: recG.models, a: recG.active }));
  cek("AIza…: konfirmasi menyebut model + tingkat gratis + cadangan otomatis",
      terakhir(W).text.includes("gemini-2.5-flash") &&
      terakhir(W).text.includes("free tier") &&
      terakhir(W).text.includes("switch to the next one automatically"),
      terakhir(W).text.slice(0, 400));
  await handleUpdate(W.io, msg(16001, "🤖 AI Chat"));
  await handleUpdate(W.io, msg(16001, "halo"));
  const callG = W.aiCalls[W.aiCalls.length - 1];
  cek("AIza…: chat jalan memakai model aktif tersimpan, tanpa potong kuota",
      !!callG && callG.model === "gemini-2.5-flash" &&
      callG.key === "AIzaSy-gratis-123" &&
      !W.kv.has(`quota:16001:ai:${hariIniUTC()}`),
      JSON.stringify(callG && { m: callG.model }));
  cek("nilai kunci AIza tidak muncul di pesan keluar",
      !semua(W).includes("AIzaSy-gratis-123"), "");

  // (c) Kunci "sk-or-…" -> OpenRouter + model ":free" pertama dipilih.
  const Wo = buatIo({ ai: AI_ON, testKey: (base) =>
    base.includes("openrouter")
      ? { ok: true, models: ["openai/gpt-4o-mini",
          "meta-llama/llama-3.1-8b:free", "google/gemma-2-9b:free"] }
      : { ok: false, reason: "rejected" } });
  await handleUpdate(Wo.io, cb(16002, "byok:paste"));
  await handleUpdate(Wo.io, msg(16002, "sk-or-v1-gratis"));
  const recO = JSON.parse(Wo.kv.get("apikey:16002") || "{}");
  cek("sk-or-…: terdeteksi OpenRouter (diuji pertama)",
      recO.provider === "openrouter" &&
      Wo.keyTests[0].base.includes("openrouter"),
      JSON.stringify({ p: recO.provider, t: Wo.keyTests.map(k => k.base) }));
  cek("sk-or-…: rantai = semua ':free' (urutan provider) + ekor default",
      JSON.stringify(recO.models) === JSON.stringify([
        "meta-llama/llama-3.1-8b:free", "google/gemma-2-9b:free",
        "openai/gpt-4o-mini"]) &&
      recO.active === "meta-llama/llama-3.1-8b:free",
      JSON.stringify(recO.models));
  cek("sk-or-…: konfirmasi menyebut 'free model' + nama modelnya + cadangan otomatis",
      terakhir(Wo).text.includes("free model") &&
      terakhir(Wo).text.includes("meta-llama/llama-3.1-8b:free") &&
      terakhir(Wo).text.includes("switch to the next one automatically"),
      terakhir(Wo).text.slice(0, 400));
  await handleUpdate(Wo.io, msg(16002, "🤖 AI Chat"));
  await handleUpdate(Wo.io, msg(16002, "halo"));
  const callO = Wo.aiCalls[Wo.aiCalls.length - 1];
  cek("sk-or-…: chat memakai model :free tersimpan via kunci pengguna",
      !!callO && callO.model === "meta-llama/llama-3.1-8b:free" &&
      callO.base === "https://openrouter.ai/api/v1",
      JSON.stringify(callO && { m: callO.model, b: callO.base }));

  // (c2) OpenRouter tanpa model ":free" di daftar -> default provider.
  const Wo2 = buatIo({ ai: AI_ON, testKey: (base) =>
    base.includes("openrouter")
      ? { ok: true, models: ["openai/gpt-4o-mini", "anthropic/claude"] }
      : { ok: false, reason: "rejected" } });
  await handleUpdate(Wo2.io, cb(16003, "byok:paste"));
  await handleUpdate(Wo2.io, msg(16003, "sk-or-v1-bayar"));
  const recO2 = JSON.parse(Wo2.kv.get("apikey:16003") || "{}");
  cek("sk-or-… tanpa ':free': rantai hanya ekor default, tanpa klaim gratis",
      JSON.stringify(recO2.models) === JSON.stringify(["openai/gpt-4o-mini"]) &&
      !terakhir(Wo2).text.includes("free model"),
      JSON.stringify(recO2.models));

  // (d) Kunci "sk-…" yang hanya diterima OpenAI -> OpenAI; bila OpenAI
  // menolak, urutan lanjut ke OpenRouter.
  const Wd = buatIo({ ai: AI_ON, testKey: (base, key) =>
    base.includes("api.openai.com") && key === "sk-plain-openai"
      ? { ok: true } : { ok: false, reason: "rejected" } });
  await handleUpdate(Wd.io, cb(16004, "byok:paste"));
  await handleUpdate(Wd.io, msg(16004, "sk-plain-openai"));
  const recD = JSON.parse(Wd.kv.get("apikey:16004") || "{}");
  cek("sk-…: OpenAI diuji pertama dan terdeteksi sebagai OpenAI",
      recD.provider === "openai" &&
      Wd.keyTests.length === 1 && Wd.keyTests[0].base.includes("api.openai.com"),
      JSON.stringify({ p: recD.provider, t: Wd.keyTests.map(k => k.base) }));
  cek("sk-… OpenAI: rantai hanya [gpt-4o-mini] (tidak ada gratisan dikarang)",
      JSON.stringify(recD.models) === JSON.stringify(["gpt-4o-mini"]) &&
      recD.active === "gpt-4o-mini", JSON.stringify(recD.models));
  cek("sk-… OpenAI: konfirmasi menyebut model + catatan TANPA tingkat gratis",
      terakhir(Wd).text.includes("gpt-4o-mini") &&
      terakhir(Wd).text.includes("no free tier"), terakhir(Wd).text.slice(0, 350));

  const Wd2 = buatIo({ ai: AI_ON, testKey: (base) =>
    base.includes("openrouter")
      ? { ok: true, models: [] }
      : { ok: false, reason: "rejected" } });
  await handleUpdate(Wd2.io, cb(16005, "byok:paste"));
  await handleUpdate(Wd2.io, msg(16005, "sk-hanya-or"));
  const recD2 = JSON.parse(Wd2.kv.get("apikey:16005") || "{}");
  cek("sk-… ditolak OpenAI -> urutan lanjut, terdeteksi OpenRouter",
      recD2.provider === "openrouter" &&
      Wd2.keyTests.length === 2 &&
      Wd2.keyTests[0].base.includes("api.openai.com") &&
      Wd2.keyTests[1].base.includes("openrouter"),
      JSON.stringify(Wd2.keyTests.map(k => k.base)));

  // (e) Kunci ditolak semua provider -> tidak disimpan, urutan default
  // untuk awalan tak dikenal: Gemini, OpenAI, OpenRouter.
  const We = buatIo({ ai: AI_ON });
  await handleUpdate(We.io, cb(16006, "byok:paste"));
  await handleUpdate(We.io, msg(16006, "zzz-tidak-jelas"));
  cek("ditolak semua: pesan 'not accepted by any' + saran pilih manual",
      terakhir(We).text.includes("not accepted by any") &&
      terakhir(We).text.includes("pick your provider manually"),
      terakhir(We).text.slice(0, 250));
  cek("ditolak semua: TIDAK tersimpan di KV", !We.kv.has("apikey:16006"), "");
  cek("awalan tak dikenal: urutan uji Gemini -> OpenAI -> OpenRouter",
      We.keyTests.length === 3 &&
      We.keyTests[0].base.includes("googleapis") &&
      We.keyTests[1].base.includes("api.openai.com") &&
      We.keyTests[2].base.includes("openrouter"),
      JSON.stringify(We.keyTests.map(k => k.base)));

  // (f) Semua kandidat tak terjangkau -> pesan berbeda, tidak disimpan.
  const Wf = buatIo({ ai: AI_ON,
    testKey: () => ({ ok: false, reason: "unreachable" }) });
  await handleUpdate(Wf.io, cb(16007, "byok:paste"));
  await handleUpdate(Wf.io, msg(16007, "sk-or-v1-apa"));
  cek("semua tak terjangkau: pesan 'couldn't reach the providers'",
      terakhir(Wf).text.includes("couldn't reach the providers") &&
      !terakhir(Wf).text.includes("not accepted by any"),
      terakhir(Wf).text.slice(0, 200));
  cek("semua tak terjangkau: TIDAK tersimpan", !Wf.kv.has("apikey:16007"), "");

  // (g) Alur manual tetap berfungsi dari panel baru (regresi eksplisit).
  const Wm = buatIo({ ai: AI_ON });
  await handleUpdate(Wm.io, cb(16008, "byok:open"));
  await handleUpdate(Wm.io, cb(16008, "byok:provider:gemini"));
  await handleUpdate(Wm.io, msg(16008, "sk-good-manual"));
  const recM = JSON.parse(Wm.kv.get("apikey:16008") || "{}");
  cek("manual dari panel baru: provider Gemini dipilih -> record lama {provider, base, key}",
      recM.provider === "gemini" && recM.key === "sk-good-manual" &&
      terakhir(Wm).text.includes("passed the test"),
      terakhir(Wm).text.slice(0, 200));

  // (h) Kunci sendiri kena 402 saat dipakai -> saran pasang ulang agar
  // deteksi memilih model gratis; tanpa teks teknis.
  const Wh = buatIo({ ai: AI_ON, byokFailStatus: 402 });
  Wh.kv.set("apikey:16009", JSON.stringify({
    provider: "openrouter", base: "https://openrouter.ai/api/v1",
    key: "sk-good-habis", model: "openai/gpt-4o-mini" }));
  await handleUpdate(Wh.io, msg(16009, "/ai"));
  await handleUpdate(Wh.io, msg(16009, "halo"));
  const btns402 = (terakhir(Wh).markup?.inline_keyboard || [])
    .flat().map(b => b.callback_data);
  cek("402: pesan menyebut kredit/model berbayar + saran tempel ulang",
      terakhir(Wh).text.includes("no credit for that model") &&
      terakhir(Wh).text.includes("free model"), terakhir(Wh).text.slice(0, 300));
  cek("402: tombol Paste ditawarkan untuk pasang ulang",
      btns402.includes("byok:paste"), JSON.stringify(btns402));
  cek("402: tanpa angka/teks teknis di pesan pengguna",
      !terakhir(Wh).text.includes("402") &&
      !/http|error/i.test(terakhir(Wh).text), terakhir(Wh).text.slice(0, 200));
}

console.log("17) Rantai BYOK saat dipakai: 429/404 lompat otomatis, 401 berhenti, semua habis -> pesan manusia");
{
  // (a) Model pertama 429 -> jawaban dari model kedua, TANPA pesan
  // gagal ke pengguna; model aktif tercatat berpindah; pesan berikutnya
  // mulai dari model yang terakhir berhasil.
  const W = buatIo({ ai: AI_ON,
    aiFailFor: (model) => (model === "m/one:free" ? 429 : null) });
  W.kv.set("apikey:17001", JSON.stringify({
    provider: "openrouter", base: "https://openrouter.ai/api/v1",
    key: "sk-rantai",
    models: ["m/one:free", "m/two:free", "openai/gpt-4o-mini"],
    active: "m/one:free" }));
  await handleUpdate(W.io, msg(17001, "/ai"));
  await handleUpdate(W.io, msg(17001, "halo"));
  cek("model pertama 429: jawaban tetap datang (dari model kedua)",
      terakhir(W).text.includes("Mock AI answer.") &&
      terakhir(W).text.includes("Using your own API key"),
      terakhir(W).text.slice(0, 200));
  cek("model pertama 429: urutan panggilan one -> two",
      W.aiCalls.length === 2 &&
      W.aiCalls[0].model === "m/one:free" &&
      W.aiCalls[1].model === "m/two:free",
      JSON.stringify(W.aiCalls.map(a => a.model)));
  cek("model pertama 429: TIDAK ada pesan gagal/kuota ke pengguna",
      !semua(W).includes("out of quota") &&
      !semua(W).includes("answered with an error"), "");
  const recA = JSON.parse(W.kv.get("apikey:17001") || "{}");
  cek("model aktif tercatat berpindah ke model yang berhasil",
      recA.active === "m/two:free", recA.active || "kosong");
  await handleUpdate(W.io, msg(17001, "lagi"));
  cek("pesan berikutnya MULAI dari model terakhir-berhasil (tanpa coba ulang yang 429)",
      W.aiCalls.length === 3 && W.aiCalls[2].model === "m/two:free",
      JSON.stringify(W.aiCalls.map(a => a.model)));

  // (b) Semua model 429 -> pesan habis kuota yang manusiawi.
  // CATATAN PERUBAHAN PERILAKU (rantai total): kunci sistem di Wb ini
  // TERKONFIGURASI (AI_ON) dan ikut 429, jadi bot kini MENCOBA jalur
  // sistem dulu sebelum menyerah — pesan akhirnya menyebut kedua
  // jalur; cakupan lengkap perilaku baru ada di bagian 21.
  const Wb = buatIo({ ai: AI_ON, aiFailFor: () => 429 });
  Wb.kv.set("apikey:17002", JSON.stringify({
    provider: "openrouter", base: "https://openrouter.ai/api/v1",
    key: "sk-habis", models: ["a:free", "b:free"], active: "a:free" }));
  await handleUpdate(Wb.io, msg(17002, "/ai"));
  await handleUpdate(Wb.io, msg(17002, "halo"));
  cek("semua model 429 -> pesan 'out of quota' + 'try again later'",
      terakhir(Wb).text.includes("out of quota") &&
      terakhir(Wb).text.includes("try again later"),
      terakhir(Wb).text.slice(0, 250));
  cek("semua model 429 -> 2 model kunci sendiri + 1 model sistem dicoba, tanpa jawaban AI",
      Wb.aiCalls.length === 3 &&
      !terakhir(Wb).text.includes("Mock AI answer."), "");

  // (c) 401 -> TIDAK lompat model: langsung jalur error kunci lama.
  const Wc = buatIo({ ai: AI_ON, byokFailStatus: 401 });
  Wc.kv.set("apikey:17003", JSON.stringify({
    provider: "openrouter", base: "https://openrouter.ai/api/v1",
    key: "sk-ditolak", models: ["a:free", "b:free"], active: "a:free" }));
  await handleUpdate(Wc.io, msg(17003, "/ai"));
  await handleUpdate(Wc.io, msg(17003, "halo"));
  cek("401: hanya SATU panggilan (tidak lompat ke model kedua)",
      Wc.aiCalls.length === 1, String(Wc.aiCalls.length));
  cek("401: pesan error kunci seperti aturan lama",
      terakhir(Wc).text.includes("answered with an error for your own API key"),
      terakhir(Wc).text.slice(0, 200));

  // (d) 404 pada model pertama -> lompat juga (model tak tersedia).
  const Wd = buatIo({ ai: AI_ON,
    aiFailFor: (model) => (model === "g-a" ? 404 : null) });
  Wd.kv.set("apikey:17004", JSON.stringify({
    provider: "gemini",
    base: "https://generativelanguage.googleapis.com/v1beta/openai/",
    key: "AIza-rantai", models: ["g-a", "g-b"], active: "g-a" }));
  await handleUpdate(Wd.io, msg(17004, "/ai"));
  await handleUpdate(Wd.io, msg(17004, "halo"));
  cek("404: lompat ke model berikutnya dan jawaban datang",
      Wd.aiCalls.length === 2 && Wd.aiCalls[1].model === "g-b" &&
      terakhir(Wd).text.includes("Mock AI answer."),
      JSON.stringify(Wd.aiCalls.map(a => a.model)));

  // (e) Panel menampilkan model aktif + jumlah cadangan.
  await handleUpdate(W.io, cb(17001, "byok:open"));
  cek("panel: model aktif terakhir-berhasil + 'Backup models ready: 2'",
      terakhir(W).text.includes("Model in use: m/two:free") &&
      terakhir(W).text.includes("Backup models ready: 2"),
      terakhir(W).text.slice(0, 300));

  // (f) Rantai Gemini dari daftar provider: flash terbaru dulu,
  // non-chat tersaring, maks 4.
  const Wf = buatIo({ ai: AI_ON, testKey: (base) =>
    base.includes("googleapis")
      ? { ok: true, models: ["gemini-2.0-flash", "gemini-2.5-flash",
          "gemini-2.5-pro", "gemini-embedding-001",
          "gemini-2.0-flash-lite"] }
      : { ok: false, reason: "rejected" } });
  await handleUpdate(Wf.io, cb(17005, "byok:paste"));
  await handleUpdate(Wf.io, msg(17005, "AIza-daftar-model"));
  const recF = JSON.parse(Wf.kv.get("apikey:17005") || "{}");
  cek("rantai Gemini: flash versi terbaru dulu, embedding tersaring, maks 4",
      JSON.stringify(recF.models) === JSON.stringify([
        "gemini-2.5-flash", "gemini-2.0-flash",
        "gemini-2.0-flash-lite", "gemini-2.5-pro"]),
      JSON.stringify(recF.models));

  // (g) Rantai OpenRouter dibatasi 5 gratisan + ekor.
  const frees = Array.from({ length: 7 }, (_, i) => `p/m${i + 1}:free`);
  const Wg = buatIo({ ai: AI_ON, testKey: (base) =>
    base.includes("openrouter")
      ? { ok: true, models: frees }
      : { ok: false, reason: "rejected" } });
  await handleUpdate(Wg.io, cb(17006, "byok:paste"));
  await handleUpdate(Wg.io, msg(17006, "sk-or-v1-banyak"));
  const recG2 = JSON.parse(Wg.kv.get("apikey:17006") || "{}");
  cek("rantai OpenRouter: maks 5 ':free' + ekor gpt-4o-mini",
      JSON.stringify(recG2.models) === JSON.stringify(
        [...frees.slice(0, 5), "openai/gpt-4o-mini"]),
      JSON.stringify(recG2.models));
}

console.log("18) Rantai jalur SISTEM: AI_MODEL_FAST daftar koma ditelusuri dengan aturan sama");
{
  const AI_CHAIN = { ...AI_ON, modelFast: "fast-a,fast-b" };
  const W = buatIo({ ai: AI_CHAIN,
    aiFailFor: (model) => (model === "fast-a" ? 429 : null) });
  await handleUpdate(W.io, msg(18001, "/ai"));
  await handleUpdate(W.io, msg(18001, "halo"));
  cek("FAST 2 model, pertama 429 -> jawaban dari model kedua",
      W.aiCalls.length === 2 &&
      W.aiCalls[0].model === "fast-a" &&
      W.aiCalls[1].model === "fast-b" &&
      terakhir(W).text.includes("Mock AI answer."),
      JSON.stringify(W.aiCalls.map(a => a.model)));
  cek("jalur sistem: kuota tetap terpotong + sisa tampil (14 of 15)",
      terakhir(W).text.includes("AI messages left today: 14 of 15") &&
      W.kv.get(`quota:18001:ai:${hariIniUTC()}`) === "1",
      terakhir(W).text.slice(-200));

  // 401 pada jalur sistem -> berhenti (tidak lompat), pesan umum.
  const W2 = buatIo({ ai: AI_CHAIN,
    aiFailFor: (model) => (model === "fast-a" ? 401 : null) });
  await handleUpdate(W2.io, msg(18002, "/ai"));
  await handleUpdate(W2.io, msg(18002, "halo"));
  cek("sistem 401 di model pertama -> TIDAK lompat, pesan sibuk umum",
      W2.aiCalls.length === 1 &&
      terakhir(W2).text.includes("busy right now"),
      JSON.stringify(W2.aiCalls.map(a => a.model)));

  // Semua model sistem 503 -> pesan sibuk umum (bukan pesan BYOK).
  const W3 = buatIo({ ai: AI_CHAIN, aiFailFor: () => 503 });
  await handleUpdate(W3.io, msg(18003, "/ai"));
  await handleUpdate(W3.io, msg(18003, "halo"));
  cek("sistem semua model gagal rantai -> pesan sibuk umum, kedua model dicoba",
      W3.aiCalls.length === 2 &&
      terakhir(W3).text.includes("busy right now") &&
      !terakhir(W3).text.includes("your key"),
      terakhir(W3).text.slice(0, 200));
}

console.log("19) Pemilik/admin: full access — kuota dilewati, Strong & Image terbuka, Premium tanpa invoice");
{
  // AI: admin melewati batas Free (15) tanpa terpotong dan tanpa terhenti.
  const W = buatIo({ ai: AI_ON, adminId: 111 });
  await handleUpdate(W.io, msg(111, "🤖 AI Chat"));
  cek("intro AI admin menampilkan '👑 Owner: unlimited', bukan angka sisa",
      terakhir(W).text.includes("👑 Owner: unlimited") &&
      !terakhir(W).text.includes("messages left today"), terakhir(W).text.slice(-250));
  for (let i = 1; i <= 17; i++) {
    await handleUpdate(W.io, msg(111, "tanya " + i));
  }
  cek("admin: 17 pesan AI semua dijawab (melewati batas Free 15)",
      W.aiCalls.length === 17, String(W.aiCalls.length));
  cek("admin: kuota AI TIDAK pernah tercatat terpotong di KV",
      !W.kv.has(`quota:111:ai:${hariIniUTC()}`), [...W.kv.keys()].join(","));
  cek("jawaban AI admin berkaki '👑 Owner: unlimited'",
      W.terkirim.some(x => x.text.includes("Mock AI answer.") &&
        x.text.includes("👑 Owner: unlimited")), "");
  cek("tidak ada pesan admin yang menampilkan sisa kuota angka",
      !semua(W).includes("AI messages left today"), semua(W).slice(-300));

  // Strong terbuka untuk admin tanpa record Premium di KV.
  const W2 = buatIo({ ai: AI_ON, adminId: 111 });
  await handleUpdate(W2.io, msg(111, "/ai"));
  await handleUpdate(W2.io, cb(111, "ai:model:strong"));
  cek("admin memilih Strong -> diterima, tanpa record Premium KV",
      terakhir(W2).text.includes("Model set to 🧠 Strong") &&
      !W2.kv.has("premium:111"), terakhir(W2).text);
  await handleUpdate(W2.io, msg(111, "halo strong"));
  cek("panggilan AI admin benar-benar memakai model strong",
      W2.aiCalls.length === 1 && W2.aiCalls[0].model === "strong-1",
      JSON.stringify(W2.aiCalls.map(a => a.model)));

  // Tugas Image terbuka untuk admin; kuota gambar tidak terpotong.
  const AI_IMG = { ...AI_ON, imageModel: "img-1" };
  const W3 = buatIo({ ai: AI_IMG, adminId: 111 });
  await handleUpdate(W3.io, msg(111, "/ai"));
  await handleUpdate(W3.io, cb(111, "ai:task:image"));
  await handleUpdate(W3.io, msg(111, "a lighthouse at dawn"));
  cek("admin memakai tugas Image tanpa gerbang Premium",
      W3.terkirim.some(x => x.text.includes("Creating your picture")) &&
      !semua(W3).includes("Premium feature"), semua(W3).slice(-300));
  cek("admin: kuota gambar TIDAK terpotong di KV",
      !W3.kv.has(`quota:111:aimg:${hariIniUTC()}`), [...W3.kv.keys()].join(","));
  cek("sesudah gambar, admin melihat keterangan unlimited",
      W3.terkirim.some(x => x.text.includes("Owner: unlimited")), "");

  // Downloader: admin melewati batas Free (5) tanpa terpotong.
  const W4 = buatIo({ ai: AI_ON, adminId: 111 });
  await handleUpdate(W4.io, msg(111, "⬇️ Downloader"));
  cek("intro Downloader admin menampilkan '👑 Owner: unlimited downloads'",
      terakhir(W4).text.includes("👑 Owner: unlimited downloads"),
      terakhir(W4).text.slice(-200));
  for (let i = 1; i <= 7; i++) {
    await handleUpdate(W4.io, msg(111, "https://www.tiktok.com/@user/video/" + (2000 + i)));
    await handleUpdate(W4.io, cb(111, "dl:video"));
  }
  cek("admin: 7 unduhan semua ter-dispatch (melewati batas Free 5)",
      W4.dispatches.length === 7, String(W4.dispatches.length));
  cek("admin: kuota unduh TIDAK pernah tercatat terpotong di KV",
      !W4.kv.has(`quota:111:dl:${hariIniUTC()}`), [...W4.kv.keys()].join(","));

  // Layar Premium admin: status pemilik persis, tanpa tombol Buy;
  // callback beli lama pun ditolak sopan dan TIDAK membuat invoice.
  const W5 = buatIo({ ai: AI_ON, adminId: 111 });
  await handleUpdate(W5.io, msg(111, "/premium"));
  cek("layar Premium admin memuat status pemilik persis",
      terakhir(W5).text.includes("👑 Owner — full access. No subscription needed, all limits are lifted for your account."),
      terakhir(W5).text.slice(0, 250));
  const btnAdmin = (terakhir(W5).markup?.inline_keyboard || []).flat()
    .map(b => b.callback_data);
  cek("layar Premium admin TIDAK memuat tombol Buy",
      !btnAdmin.includes("buy:premium"), JSON.stringify(btnAdmin));
  await handleUpdate(W5.io, cb(111, "buy:premium"));
  cek("alur beli dari admin ditolak sopan + TIDAK ada invoice dibuat",
      W5.invoices.length === 0 &&
      terakhir(W5).text.includes("👑 Owner — full access"), terakhir(W5).text.slice(0, 150));

  // Pengguna biasa di W yang sama: perilaku Premium tidak berubah.
  await handleUpdate(W5.io, msg(222, "/premium"));
  const btnUser = (terakhir(W5).markup?.inline_keyboard || []).flat()
    .map(b => b.callback_data);
  cek("pengguna biasa tetap status Free + tombol Buy tampil",
      terakhir(W5).text.includes("Your status: Free") &&
      btnUser.includes("buy:premium"), terakhir(W5).text.slice(0, 150));
  await handleUpdate(W5.io, cb(222, "buy:premium"));
  cek("pengguna biasa tetap menerima invoice Stars 250",
      W5.invoices.length === 1 &&
      W5.invoices[0].inv.payload === "premium:222" &&
      W5.invoices[0].inv.prices[0].amount === 250, JSON.stringify(W5.invoices));
}

console.log("20) Gambar: jalur Gemini natif (adapter asli + fetch tiruan), jalur OpenAI lama, gagal tanpa inlineData");
{
  const fetchAsli = globalThis.fetch;
  const B64_PNG = "iVBORw0KGgo="; // 8 byte tanda tangan PNG dalam base64

  function kvTiruan() {
    const m = new Map();
    return {
      map: m,
      get: async (k) => (m.has(k) ? m.get(k) : null),
      put: async (k, v) => { m.set(k, v); },
      delete: async (k) => { m.delete(k); },
      list: async ({ prefix }) => ({
        keys: [...m.keys()].filter(k => k.startsWith(prefix))
          .map(name => ({ name })),
        list_complete: true,
      }),
    };
  }
  const okJson = (data) => ({ ok: true, status: 200, json: async () => data });
  function pasangFetch(penangan) {
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
      const u = String(url);
      calls.push({ url: u, init });
      if (u.startsWith("https://api.telegram.org/")) return okJson({ ok: true, result: {} });
      return penangan(u, init);
    };
    return calls;
  }
  const teksTelegram = (calls) => calls
    .filter(c => c.url.endsWith("/sendMessage"))
    .map(c => { try { return JSON.parse(c.init.body).text || ""; } catch (e) { return ""; } })
    .join("\n");
  function envAsli(wkv, over = {}) {
    return {
      TG_BOT_TOKEN: "token-tiruan", ADMIN_ID: "111", GH_TOKEN: "gh-tiruan",
      AI_API_KEY: "kunci-sistem-tiruan",
      AI_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      AI_MODEL_FAST: "gemini-2.5-flash", AI_MODEL_STRONG: "gemini-2.5-pro",
      AI_IMAGE_MODEL: "gemini-2.5-flash-image",
      WKV: wkv, ...over,
    };
  }
  async function alurGambar(io, uid, prompt) {
    await handleUpdate(io, msg(uid, "/ai"));
    await handleUpdate(io, cb(uid, "ai:task:image"));
    await handleUpdate(io, msg(uid, prompt));
  }

  try {
    // (a) Basis Google -> endpoint natif :generateContent, inlineData
    // diurai, foto dikirim multipart; admin tanpa potong kuota gambar,
    // pengguna Premium terpotong tepat 1.
    const genOk = { candidates: [{ content: { parts: [
      { text: "Here you go" },
      { inlineData: { mimeType: "image/png", data: B64_PNG } },
    ] } }] };
    for (const [uid, admin] of [[111, true], [21001, false]]) {
      const label = admin ? "admin" : "Premium";
      const wkv = kvTiruan();
      if (!admin) {
        await wkv.put("premium:" + uid,
          new Date(Date.now() + 86400000).toISOString());
      }
      const calls = pasangFetch(async () => okJson(genOk));
      const io = buatIoAsli(envAsli(wkv));
      await alurGambar(io, uid, "a cat riding a crocodile");
      const genCall = calls.find(c => c.url.includes(":generateContent"));
      cek(`Gemini (${label}): URL natif :generateContent memakai model dari env`,
          !!genCall && genCall.url ===
            "https://generativelanguage.googleapis.com/v1beta/models/" +
            "gemini-2.5-flash-image:generateContent",
          genCall ? genCall.url : "tidak ada panggilan generateContent");
      const genBody = genCall ? JSON.parse(genCall.init.body) : {};
      cek(`Gemini (${label}): body = contents[{parts:[{text}]}] + responseModalities TEXT,IMAGE; kunci di header`,
          genBody.contents?.[0]?.parts?.[0]?.text === "a cat riding a crocodile" &&
          JSON.stringify(genBody.generationConfig?.responseModalities) ===
            JSON.stringify(["TEXT", "IMAGE"]) &&
          genCall.init.headers["x-goog-api-key"] === "kunci-sistem-tiruan",
          JSON.stringify(genBody).slice(0, 200));
      cek(`Gemini (${label}): TIDAK ada panggilan /images/generations`,
          !calls.some(c => c.url.includes("/images/generations")), "");
      const fotoCall = calls.find(c => c.url.endsWith("/sendPhoto"));
      const form = fotoCall && fotoCall.init.body;
      const berkas = form instanceof FormData ? form.get("photo") : null;
      cek(`Gemini (${label}): sendPhoto MULTIPART — FormData berisi berkas PNG hasil urai inlineData`,
          form instanceof FormData &&
          form.get("chat_id") === String(uid) &&
          String(form.get("caption") || "").includes("picture") &&
          !!berkas && berkas.type === "image/png" && berkas.size === 8,
          berkas ? `${berkas.type}/${berkas.size}` : "bukan FormData");
      cek(`Gemini (${label}): kuota gambar ` +
            (admin ? "admin TIDAK terpotong" : "Premium terpotong tepat 1"),
          admin
            ? !wkv.map.has(`quota:${uid}:aimg:${hariIniUTC()}`) &&
              teksTelegram(calls).includes("Owner: unlimited")
            : wkv.map.get(`quota:${uid}:aimg:${hariIniUTC()}`) === "1" &&
              teksTelegram(calls).includes("Images left today: 19 of 20"),
          [...wkv.map.keys()].join(","));
    }

    // (b) Basis non-Google -> jalur lama /images/generations + sendPhoto URL.
    {
      const wkv = kvTiruan();
      await wkv.put("premium:21002",
        new Date(Date.now() + 86400000).toISOString());
      const calls = pasangFetch(async (u) =>
        u.includes("/images/generations")
          ? okJson({ data: [{ url: "https://img.invalid/hasil.png" }] })
          : okJson({}));
      const io = buatIoAsli(envAsli(wkv, {
        AI_BASE_URL: "https://api.openai.com/v1",
        AI_MODEL_FAST: "fast-x", AI_MODEL_STRONG: "strong-x",
        AI_IMAGE_MODEL: "model-gambar-x",
      }));
      await alurGambar(io, 21002, "a lighthouse at dawn");
      const genCall = calls.find(c => c.url.includes("/images/generations"));
      cek("non-Google: /images/generations lama dipakai dengan model dari env",
          !!genCall &&
          genCall.url === "https://api.openai.com/v1/images/generations" &&
          JSON.parse(genCall.init.body).model === "model-gambar-x",
          genCall ? genCall.url : "tidak ada panggilan gambar");
      cek("non-Google: TIDAK ada panggilan :generateContent",
          !calls.some(c => c.url.includes(":generateContent")), "");
      const fotoCall = calls.find(c => c.url.endsWith("/sendPhoto"));
      const fotoBody = fotoCall ? JSON.parse(fotoCall.init.body) : {};
      cek("non-Google: sendPhoto memakai URL hasil (JSON, bukan multipart)",
          fotoBody.photo === "https://img.invalid/hasil.png" &&
          fotoBody.chat_id === 21002, JSON.stringify(fotoBody).slice(0, 150));
      cek("non-Google: kuota gambar Premium terpotong tepat 1",
          wkv.map.get(`quota:21002:aimg:${hariIniUTC()}`) === "1", "");
    }

    // (c) Respons Gemini tanpa inlineData -> pesan gagal manusiawi,
    // tanpa kirim foto, tanpa potong kuota, tanpa teks teknis.
    {
      const wkv = kvTiruan();
      await wkv.put("premium:21003",
        new Date(Date.now() + 86400000).toISOString());
      const genTeksSaja = { candidates: [{ content: { parts: [
        { text: "I cannot draw that." }] } }] };
      const calls = pasangFetch(async () => okJson(genTeksSaja));
      const io = buatIoAsli(envAsli(wkv));
      await alurGambar(io, 21003, "something un-drawable");
      const teks = teksTelegram(calls);
      cek("Gemini tanpa inlineData: pesan gagal manusiawi tampil",
          teks.includes("The picture maker is busy right now"),
          teks.slice(-300));
      cek("Gemini tanpa inlineData: TIDAK ada sendPhoto & kuota utuh",
          !calls.some(c => c.url.endsWith("/sendPhoto")) &&
          !wkv.map.has(`quota:21003:aimg:${hariIniUTC()}`), "");
      cek("Gemini tanpa inlineData: tanpa teks teknis mentah ke pengguna",
          !/Image empty|HTTP \d|inlineData/.test(teks), teks.slice(-200));
    }

    // (d) Cabang Image (io tiruan): bentuk hasil menentukan jalur kirim.
    const AI_IMG20 = { ...AI_ON, imageModel: "img-1" };
    const Wu = buatIo({ ai: AI_IMG20,
      genImage: async () => ({ url: "https://img.invalid/objek.png" }) });
    Wu.kv.set("premium:22001", new Date(Date.now() + 86400000).toISOString());
    await handleUpdate(Wu.io, msg(22001, "/ai"));
    await handleUpdate(Wu.io, cb(22001, "ai:task:image"));
    await handleUpdate(Wu.io, msg(22001, "a red balloon"));
    cek("cabang: hasil {url} -> sendPhoto URL, sendPhotoBytes tidak dipakai",
        Wu.photos.length === 1 &&
        Wu.photos[0].url === "https://img.invalid/objek.png" &&
        Wu.photoBytes.length === 0, JSON.stringify(Wu.photos));
    const Wb2 = buatIo({ ai: AI_IMG20,
      genImage: async () => ({ bytesBase64: B64_PNG, mimeType: "image/jpeg" }) });
    Wb2.kv.set("premium:22002", new Date(Date.now() + 86400000).toISOString());
    await handleUpdate(Wb2.io, msg(22002, "/ai"));
    await handleUpdate(Wb2.io, cb(22002, "ai:task:image"));
    await handleUpdate(Wb2.io, msg(22002, "a blue balloon"));
    cek("cabang: hasil {bytesBase64} -> sendPhotoBytes dengan mime hasil, sendPhoto URL tidak dipakai",
        Wb2.photoBytes.length === 1 &&
        Wb2.photoBytes[0].base64 === B64_PNG &&
        Wb2.photoBytes[0].mimeType === "image/jpeg" &&
        Wb2.photos.length === 0, JSON.stringify(Wb2.photoBytes));
  } finally {
    globalThis.fetch = fetchAsli;
  }
}

console.log("21) Rantai TOTAL: BYOK kering -> otomatis lanjut ke kunci sistem; urutan Gemini terbaru dulu");
{
  const CATATAN = "Your key stays saved";
  const hitungCatatan = (W) =>
    semua(W).split("ℹ️ Your own key is out of quota").length - 1;

  // (a) BYOK Gemini semua model 429 -> jawaban tetap datang dari
  // rantai sistem + catatan kaki peralihan tepat satu kali + record
  // kunci pengguna TIDAK berubah sama sekali.
  const W = buatIo({ ai: AI_ON,
    aiFailFor: (model, creds) => (creds ? 429 : null) });
  const recAwal = JSON.stringify({
    provider: "gemini",
    base: "https://generativelanguage.googleapis.com/v1beta/openai/",
    key: "AIza-kering",
    models: ["gemini-2.5-flash", "gemini-2.0-flash"],
    active: "gemini-2.5-flash" });
  W.kv.set("apikey:21001", recAwal);
  await handleUpdate(W.io, msg(21001, "/ai"));
  await handleUpdate(W.io, msg(21001, "halo"));
  cek("BYOK kering: 2 panggilan kunci sendiri lalu 1 panggilan sistem (creds null)",
      W.aiCalls.length === 3 &&
      W.aiCalls.slice(0, 2).every(a => a.key === "AIza-kering") &&
      W.aiCalls[2].key === null && W.aiCalls[2].model === "fast-1",
      JSON.stringify(W.aiCalls.map(a => [a.model, a.key])));
  cek("BYOK kering: jawaban AI tetap terkirim ke pengguna",
      terakhir(W).text.includes("Mock AI answer."), terakhir(W).text.slice(0, 200));
  cek("BYOK kering: catatan kaki peralihan muncul tepat SATU kali",
      hitungCatatan(W) === 1 &&
      terakhir(W).text.includes("this answer used the Wesio system key"),
      terakhir(W).text.slice(-300));
  cek("BYOK kering: kaki 'Using your own API key' TIDAK tampil (jawaban bukan dari kunci sendiri)",
      !terakhir(W).text.includes("Using your own API key"), terakhir(W).text.slice(-300));
  cek("BYOK kering: jawaban jalur sistem memotong kuota sistem (sisa 14 of 15)",
      terakhir(W).text.includes("AI messages left today: 14 of 15") &&
      W.kv.get(`quota:21001:ai:${hariIniUTC()}`) === "1",
      terakhir(W).text.slice(-300));
  cek("BYOK kering: record kunci TIDAK terhapus dan TIDAK berubah",
      W.kv.get("apikey:21001") === recAwal, W.kv.get("apikey:21001") || "hilang");

  // (a2) Pengguna Premium yang memilih Strong: peralihan menghormati
  // pilihan Strong pada jalur sistem.
  const Wp = buatIo({ ai: AI_ON,
    aiFailFor: (model, creds) => (creds ? 429 : null) });
  Wp.kv.set("premium:21002", new Date(Date.now() + 86400000).toISOString());
  Wp.kv.set("apikey:21002", JSON.stringify({
    provider: "openrouter", base: "https://openrouter.ai/api/v1",
    key: "sk-kering", models: ["a:free"], active: "a:free" }));
  await handleUpdate(Wp.io, msg(21002, "/ai"));
  await handleUpdate(Wp.io, cb(21002, "ai:model:strong"));
  await handleUpdate(Wp.io, msg(21002, "halo strong"));
  cek("BYOK kering + Premium Strong: sistem menjawab memakai model strong",
      Wp.aiCalls.length === 2 &&
      Wp.aiCalls[1].model === "strong-1" && Wp.aiCalls[1].key === null &&
      terakhir(Wp).text.includes("Mock AI answer."),
      JSON.stringify(Wp.aiCalls.map(a => a.model)));
  cek("BYOK kering + Premium Strong: catatan kaki peralihan tampil satu kali",
      hitungCatatan(Wp) === 1, terakhir(Wp).text.slice(-300));

  // (b) BYOK 403 (kunci ditolak) -> TIDAK dialihkan: pesan kunci lama,
  // sistem tidak pernah dipanggil, tidak ada lompatan model.
  const Wb = buatIo({ ai: AI_ON, byokFailStatus: 403 });
  Wb.kv.set("apikey:21003", JSON.stringify({
    provider: "gemini",
    base: "https://generativelanguage.googleapis.com/v1beta/openai/",
    key: "AIza-ditangguhkan", models: ["g-a", "g-b"], active: "g-a" }));
  await handleUpdate(Wb.io, msg(21003, "/ai"));
  await handleUpdate(Wb.io, msg(21003, "halo"));
  cek("403: hanya SATU panggilan, selalu berkunci pengguna (sistem tak dipanggil)",
      Wb.aiCalls.length === 1 &&
      Wb.aiCalls.every(a => a.key === "AIza-ditangguhkan"),
      JSON.stringify(Wb.aiCalls.map(a => [a.model, a.key])));
  cek("403: pesan error kunci seperti sebelumnya, tanpa jawaban AI",
      terakhir(Wb).text.includes("answered with an error for your own API key") &&
      !terakhir(Wb).text.includes("Mock AI answer."),
      terakhir(Wb).text.slice(0, 200));
  cek("403: tanpa catatan kaki peralihan",
      hitungCatatan(Wb) === 0, "");

  // (c) BYOK habis + sistem ikut habis -> pesan habis DUA jalur,
  // tanpa jawaban AI dan tanpa catatan kaki peralihan.
  const Wc = buatIo({ ai: AI_ON, aiFailFor: () => 429 });
  Wc.kv.set("apikey:21004", JSON.stringify({
    provider: "openrouter", base: "https://openrouter.ai/api/v1",
    key: "sk-habis-total", models: ["a:free", "b:free"], active: "a:free" }));
  await handleUpdate(Wc.io, msg(21004, "/ai"));
  await handleUpdate(Wc.io, msg(21004, "halo"));
  cek("dua jalur habis: pesan menyebut kunci sendiri DAN kunci sistem sudah dicoba",
      terakhir(Wc).text.includes("both your own key and the Wesio system key") &&
      terakhir(Wc).text.includes("out of quota") &&
      terakhir(Wc).text.includes(CATATAN),
      terakhir(Wc).text.slice(0, 300));
  cek("dua jalur habis: 2 panggilan kunci sendiri + 1 sistem, tanpa jawaban AI",
      Wc.aiCalls.length === 3 &&
      !semua(Wc).includes("Mock AI answer."), String(Wc.aiCalls.length));
  cek("dua jalur habis: tanpa catatan kaki peralihan, tanpa teks teknis",
      hitungCatatan(Wc) === 0 &&
      !/HTTP \d|Error/.test(terakhir(Wc).text), terakhir(Wc).text.slice(0, 200));

  // (c2) BYOK habis + sistem TIDAK terkonfigurasi -> perilaku lama
  // persis (pesan habis kunci sendiri + tawaran lepas kunci).
  const Wd = buatIo({ ai: AI_OFF,
    aiFailFor: (model, creds) => (creds ? 429 : null) });
  Wd.kv.set("apikey:21005", JSON.stringify({
    provider: "openrouter", base: "https://openrouter.ai/api/v1",
    key: "sk-habis-saja", models: ["a:free", "b:free"], active: "a:free" }));
  await handleUpdate(Wd.io, msg(21005, "/ai"));
  await handleUpdate(Wd.io, msg(21005, "halo"));
  cek("sistem tak terkonfigurasi: pesan lama 'All the models your key can use' dipertahankan",
      terakhir(Wd).text.includes("All the models your key can use are out of quota") &&
      terakhir(Wd).text.includes("remove your key"),
      terakhir(Wd).text.slice(0, 250));
  cek("sistem tak terkonfigurasi: hanya 2 panggilan kunci sendiri (tanpa percobaan sistem)",
      Wd.aiCalls.length === 2 &&
      Wd.aiCalls.every(a => a.key === "sk-habis-saja"),
      String(Wd.aiCalls.length));

  // (d) Urutan rantai Gemini dari record tersimpan: versi numerik
  // menurun, tanpa-versi paling belakang — dibuktikan dari urutan
  // panggilan saat model-model awal kena 429.
  const We = buatIo({ ai: AI_ON, aiFailFor: (model) =>
    ["gemini-3.10-flash", "gemini-3.5-flash", "gemini-3.1-flash"]
      .includes(model) ? 429 : null });
  We.kv.set("apikey:21006", JSON.stringify({
    provider: "gemini",
    base: "https://generativelanguage.googleapis.com/v1beta/openai/",
    key: "AIza-urut",
    models: ["gemini-2.5-flash", "gemini-3.5-flash", "gemini-flash-latest",
      "gemini-3.1-flash", "gemini-3.10-flash"],
    active: "gemini-3.10-flash" }));
  await handleUpdate(We.io, msg(21006, "/ai"));
  await handleUpdate(We.io, msg(21006, "halo"));
  cek("urutan Gemini: 3.10 -> 3.5 -> 3.1 -> 2.5 (minor numerik, bukan parseFloat)",
      JSON.stringify(We.aiCalls.map(a => a.model)) === JSON.stringify(
        ["gemini-3.10-flash", "gemini-3.5-flash", "gemini-3.1-flash",
          "gemini-2.5-flash"]),
      JSON.stringify(We.aiCalls.map(a => a.model)));
  const recE = JSON.parse(We.kv.get("apikey:21006") || "{}");
  cek("urutan Gemini: model aktif tercatat = yang berhasil (2.5), tanpa-versi belum dicoba",
      recE.active === "gemini-2.5-flash" &&
      !We.aiCalls.some(a => a.model === "gemini-flash-latest"),
      recE.active || "kosong");

  // (d2) Urutan yang sama berlaku saat rantai dibangun dari daftar
  // /models pada deteksi kunci: record tersimpan sudah terbaru-dulu.
  const Wf = buatIo({ ai: AI_ON, testKey: (base) =>
    base.includes("googleapis")
      ? { ok: true, models: ["gemini-2.5-flash", "gemini-3.5-flash",
          "gemini-flash-latest", "gemini-3.1-flash"] }
      : { ok: false, reason: "rejected" } });
  await handleUpdate(Wf.io, cb(21007, "byok:paste"));
  await handleUpdate(Wf.io, msg(21007, "AIza-deteksi-urut"));
  const recF = JSON.parse(Wf.kv.get("apikey:21007") || "{}");
  cek("deteksi Gemini: rantai tersimpan 3.5 -> 3.1 -> 2.5 -> tanpa-versi",
      JSON.stringify(recF.models) === JSON.stringify([
        "gemini-3.5-flash", "gemini-3.1-flash", "gemini-2.5-flash",
        "gemini-flash-latest"]) && recF.active === "gemini-3.5-flash",
      JSON.stringify(recF.models));

  // (e) Jawaban BYOK normal -> footer kunci sendiri seperti biasa,
  // TANPA catatan kaki peralihan.
  const Wg = buatIo({ ai: AI_ON });
  Wg.kv.set("apikey:21008", JSON.stringify({
    provider: "openrouter", base: "https://openrouter.ai/api/v1",
    key: "sk-normal", models: ["a:free"], active: "a:free" }));
  await handleUpdate(Wg.io, msg(21008, "/ai"));
  await handleUpdate(Wg.io, msg(21008, "halo"));
  cek("BYOK normal: jawaban + footer kunci sendiri, tanpa catatan peralihan",
      terakhir(Wg).text.includes("Mock AI answer.") &&
      terakhir(Wg).text.includes("Using your own API key") &&
      hitungCatatan(Wg) === 0 &&
      !terakhir(Wg).text.includes("AI messages left today"),
      terakhir(Wg).text.slice(-300));
}

console.log("22) Downloader terbuka: semua tautan http(s) sah diterima, bukan cuma platform lama");
{
  const W0 = buatIo({ ai: AI_ON });
  await handleUpdate(W0.io, msg(22000, "⬇️ Downloader"));
  cek("intro Downloader: teks terbuka 'almost any site' + contoh + kejujuran penolakan",
      terakhir(W0).text.includes("almost any site") &&
      terakhir(W0).text.includes("Facebook") &&
      terakhir(W0).text.includes("1,000+ other sites") &&
      terakhir(W0).text.includes("refuses the download"),
      terakhir(W0).text.slice(0, 300));

  // Facebook lewat mode unduh, format video.
  const W1 = buatIo({ ai: AI_ON });
  await handleUpdate(W1.io, msg(22001, "⬇️ Downloader"));
  await handleUpdate(W1.io, msg(22001, "https://www.facebook.com/watch/?v=123456789"));
  const fmt1 = (terakhir(W1).markup?.inline_keyboard || []).flat().map(b => b.callback_data);
  cek("tautan Facebook -> tombol Video|Audio tampil",
      fmt1.includes("dl:video") && fmt1.includes("dl:audio"), JSON.stringify(fmt1));
  await handleUpdate(W1.io, cb(22001, "dl:video"));
  cek("Facebook: dispatch tepat 1x", W1.dispatches.length === 1, JSON.stringify(W1.dispatches));
  const jobKey1 = [...W1.kv.keys()].find(k => k.startsWith("job:"));
  const job1 = jobKey1 ? JSON.parse(W1.kv.get(jobKey1)) : null;
  cek("Facebook: job tertulis (url facebook + format video)",
      !!job1 && job1.url.includes("facebook.com") && job1.format === "video",
      jobKey1 || "job tidak ada");

  // Vimeo ditempel langsung di chat, tanpa masuk mode unduh dulu.
  const W2 = buatIo({ ai: AI_ON });
  await handleUpdate(W2.io, msg(22002, "https://vimeo.com/123456789"));
  const fmt2 = (terakhir(W2).markup?.inline_keyboard || []).flat().map(b => b.callback_data);
  cek("tautan Vimeo ditempel langsung -> tombol format tampil",
      fmt2.includes("dl:video") && fmt2.includes("dl:audio"), JSON.stringify(fmt2));
  await handleUpdate(W2.io, cb(22002, "dl:audio"));
  const jobKey2 = [...W2.kv.keys()].find(k => k.startsWith("job:"));
  const job2 = jobKey2 ? JSON.parse(W2.kv.get(jobKey2)) : null;
  cek("Vimeo: dispatch 1x + job audio url vimeo",
      W2.dispatches.length === 1 && !!job2 && job2.format === "audio" &&
      job2.url.includes("vimeo.com"), JSON.stringify(W2.dispatches));

  // Dailymotion lewat mode unduh.
  const W3 = buatIo({ ai: AI_ON });
  await handleUpdate(W3.io, msg(22003, "⬇️ Downloader"));
  await handleUpdate(W3.io, msg(22003, "https://www.dailymotion.com/video/x8abcd1"));
  const fmt3 = (terakhir(W3).markup?.inline_keyboard || []).flat().map(b => b.callback_data);
  cek("tautan Dailymotion -> tombol format tampil",
      fmt3.includes("dl:video") && fmt3.includes("dl:audio"), JSON.stringify(fmt3));
  await handleUpdate(W3.io, cb(22003, "dl:video"));
  cek("Dailymotion: dispatch tepat 1x", W3.dispatches.length === 1, JSON.stringify(W3.dispatches));

  // Domain acak bervideo yang dulu pasti ditolak whitelist.
  const W4 = buatIo({ ai: AI_ON });
  await handleUpdate(W4.io, msg(22004, "⬇️ Downloader"));
  await handleUpdate(W4.io, msg(22004, "https://example-site.com/watch/1"));
  const fmt4 = (terakhir(W4).markup?.inline_keyboard || []).flat().map(b => b.callback_data);
  cek("domain acak bervideo -> diterima, tombol format tampil",
      fmt4.includes("dl:video") && fmt4.includes("dl:audio"), JSON.stringify(fmt4));
  await handleUpdate(W4.io, cb(22004, "dl:video"));
  const jobKey4 = [...W4.kv.keys()].find(k => k.startsWith("job:"));
  const job4 = jobKey4 ? JSON.parse(W4.kv.get(jobKey4)) : null;
  cek("domain acak: dispatch 1x + job url utuh",
      W4.dispatches.length === 1 && !!job4 &&
      job4.url === "https://example-site.com/watch/1",
      jobKey4 || "job tidak ada");

  // example.com — dulu contoh penolakan whitelist, kini diterima.
  const W5 = buatIo({ ai: AI_ON });
  await handleUpdate(W5.io, msg(22005, "⬇️ Downloader"));
  await handleUpdate(W5.io, msg(22005, "https://example.com/video/1"));
  const fmt5 = (terakhir(W5).markup?.inline_keyboard || []).flat().map(b => b.callback_data);
  cek("example.com (dulu ditolak whitelist) -> kini diterima",
      fmt5.includes("dl:video") && fmt5.includes("dl:audio"), JSON.stringify(fmt5));

  // Platform lama tetap jalan.
  const W6 = buatIo({ ai: AI_ON });
  await handleUpdate(W6.io, msg(22006, "⬇️ Downloader"));
  await handleUpdate(W6.io, msg(22006, "https://x.com/someuser/status/123456"));
  const fmt6 = (terakhir(W6).markup?.inline_keyboard || []).flat().map(b => b.callback_data);
  cek("tautan X (platform lama) tetap diterima",
      fmt6.includes("dl:video") && fmt6.includes("dl:audio"), JSON.stringify(fmt6));
}

console.log("23) Moderasi Grup Tahap 2: siklus grup, panel, captcha, tangga peringatan, kata terlarang, Premium grup");
{
  const parseKv = (W, k) => { try { return JSON.parse(W.kv.get(k) || "null"); } catch (e) { return null; } };

  // ---- (a) Siklus hidup: ditambah non-admin -> dipromosi -> panel;
  // kunci Free; akses pengelola; bot dikeluarkan ----
  {
    const GID = -100555;
    const W = buatIo({ ai: AI_ON, adminId: 111,
      memberStatus: { "-100555:777": "administrator" } });
    await handleUpdate(W.io, botMember(GID, 666, "left", "member"));
    cek("bot ditambah BUKAN admin -> satu pesan sopan minta dipromosi",
        teksGrup(W, GID).includes("need to be an admin") &&
        teksGrup(W, GID).includes("Promote me") === false &&
        teksGrup(W, GID).includes("promote me"),
        teksGrup(W, GID).slice(0, 200));
    let rec = parseKv(W, "group:" + GID);
    cek("grup tercatat (botAdmin=false, pengangkat=666 sebagai pengelola awal)",
        !!rec && rec.botAdmin === false && rec.addedBy === 666 &&
        rec.active === true, JSON.stringify(rec));
    await handleUpdate(W.io, botMember(GID, 666, "member", "administrator"));
    cek("dipromosi -> pengumuman penjagaan aktif di grup",
        teksGrup(W, GID).includes("Group protection is ON"), teksGrup(W, GID).slice(-300));
    rec = parseKv(W, "group:" + GID);
    cek("record kini botAdmin=true", !!rec && rec.botAdmin === true, "");
    await handleUpdate(W.io, gjoin(GID, 666, [{ id: 999, first_name: "Newbie" }]));
    cek("anggota baru di grup Free (captcha mati) -> langsung disambut",
        teksGrup(W, GID).includes("Welcome, Newbie") &&
        teksGrup(W, GID).includes("Grup Uji") &&
        W.restricts.length === 0, teksGrup(W, GID).slice(-300));
    await handleUpdate(W.io, msg(666, "🛡️ My Groups"));
    const daftarBtn = (terakhir(W).markup?.inline_keyboard || []).flat().map(b => b.callback_data);
    cek("My Groups pengelola memuat tombol grupnya",
        daftarBtn.includes("grp:open:" + GID), JSON.stringify(daftarBtn));
    await handleUpdate(W.io, cb(666, "grp:open:" + GID));
    cek("panel grup: judul + status Free + status admin bot",
        terakhir(W).text.includes("Grup Uji") &&
        terakhir(W).text.includes("Plan: Free") &&
        terakhir(W).text.includes("admin ✅"), terakhir(W).text.slice(0, 300));
    const panelBtn = (terakhir(W).markup?.inline_keyboard || []).flat();
    cek("panel Free: tombol captcha terkunci berlabel Premium + tombol upgrade tampil",
        panelBtn.some(b => b.text.includes("🔒") && b.text.includes("New-member check")) &&
        panelBtn.some(b => b.callback_data === "grp:buy:" + GID),
        JSON.stringify(panelBtn.map(b => b.text)));
    await handleUpdate(W.io, cb(666, "grp:set:cap:" + GID));
    rec = parseKv(W, "group:" + GID);
    cek("grup Free mengetuk saklar captcha -> TIDAK berubah + catatan Premium per group",
        rec.settings.captcha === false &&
        terakhir(W).text.includes("Premium per group"), terakhir(W).text.slice(0, 200));
    await handleUpdate(W.io, cb(666, "grp:set:bw:" + GID));
    rec = parseKv(W, "group:" + GID);
    cek("grup Free mengetuk saklar kata terlarang -> TIDAK berubah",
        rec.settings.badwordsOn === false, "");
    // Akses lewat status admin grup (getChatMember), bukan daftar pengelola.
    await handleUpdate(W.io, msg(777, "🛡️ My Groups"));
    const btn777 = (terakhir(W).markup?.inline_keyboard || []).flat().map(b => b.callback_data);
    cek("admin grup (via getChatMember) melihat grup di My Groups",
        btn777.includes("grp:open:" + GID), JSON.stringify(btn777));
    await handleUpdate(W.io, cb(777, "grp:open:" + GID));
    cek("admin grup bisa membuka panel", terakhir(W).text.includes("Grup Uji"), "");
    rec = parseKv(W, "group:" + GID);
    cek("admin terkonfirmasi tercatat sebagai pengelola (self-healing)",
        rec.managers.includes(777), JSON.stringify(rec.managers));
    // Bukan pengelola -> ditolak.
    await handleUpdate(W.io, msg(888, "🛡️ My Groups"));
    cek("bukan pengelola: daftar kosong sopan",
        terakhir(W).text.includes("don't manage any group"), terakhir(W).text.slice(0, 120));
    await handleUpdate(W.io, cb(888, "grp:open:" + GID));
    cek("bukan pengelola membuka panel langsung -> ditolak",
        terakhir(W).text.includes("don't manage that group"), terakhir(W).text.slice(0, 150));
    // Pemilik bot melihat semua grup + panel berstatus Owner.
    await handleUpdate(W.io, msg(111, "🛡️ My Groups"));
    const btn111 = (terakhir(W).markup?.inline_keyboard || []).flat().map(b => b.callback_data);
    cek("pemilik bot melihat grup terdaftar",
        btn111.includes("grp:open:" + GID), JSON.stringify(btn111));
    await handleUpdate(W.io, cb(111, "grp:open:" + GID));
    cek("panel untuk pemilik: '👑 Owner — all features open', tanpa tombol upgrade",
        terakhir(W).text.includes("👑 Owner") &&
        !(terakhir(W).markup?.inline_keyboard || []).flat()
          .some(b => b.callback_data === "grp:buy:" + GID), terakhir(W).text.slice(0, 200));
    // Bot dikeluarkan -> grup nonaktif; moderasi berhenti; panel hilang.
    await handleUpdate(W.io, botMember(GID, 666, "administrator", "kicked"));
    rec = parseKv(W, "group:" + GID);
    cek("bot dikeluarkan -> record active=false (data tidak dihapus)",
        !!rec && rec.active === false && !!rec.settings, JSON.stringify(rec && rec.active));
    await handleUpdate(W.io, msg(666, "🛡️ My Groups"));
    cek("sesudah bot keluar: grup hilang dari daftar pengelola",
        terakhir(W).text.includes("don't manage any group"), terakhir(W).text.slice(0, 120));
    const delSebelum = W.deletions.length;
    const uLink = gmsg(GID, 999, "klik https://spam.example/x");
    await handleUpdate(W.io, uLink);
    cek("grup nonaktif: pesan bertautan TIDAK dimoderasi",
        W.deletions.length === delSebelum, String(W.deletions.length));
  }

  // ---- (b) Captcha tombol + sambutan + kata terlarang (grup Premium) ----
  {
    const GID = -100777;
    const W = buatIo({ ai: AI_ON, adminId: 111 });
    W.kv.set("groupprem:" + GID,
      new Date(Date.now() + 30 * 86400000).toISOString());
    await handleUpdate(W.io, botMember(GID, 666, "left", "administrator"));
    await handleUpdate(W.io, cb(666, "grp:open:" + GID));
    cek("panel grup Premium: baris paket 'Premium until'",
        terakhir(W).text.includes("Premium until"), terakhir(W).text.slice(0, 250));
    await handleUpdate(W.io, cb(666, "grp:set:cap:" + GID));
    let rec = parseKv(W, "group:" + GID);
    cek("captcha dinyalakan dari panel (Premium) -> settings.captcha=true + tombol panel menampilkan ON",
        rec.settings.captcha === true &&
        (terakhir(W).markup?.inline_keyboard || []).flat()
          .some(b => b.text.includes("New-member check: ✅ ON")), "");
    await handleUpdate(W.io, gjoin(GID, 666, [{ id: 999, first_name: "Newbie" }]));
    cek("anggota baru + captcha menyala -> dibatasi (semua hak kirim mati)",
        W.restricts.length === 1 && W.restricts[0].userId === 999 &&
        W.restricts[0].permissions.can_send_messages === false &&
        W.restricts[0].permissions.can_send_photos === false,
        JSON.stringify(W.restricts));
    const capMsg = keGrup(W, GID).find(x => x.msgId &&
      x.text.includes("prove you're a real person"));
    cek("pesan captcha terkirim berisi tombol khusus anggota itu + penjelasan batasan",
        !!capMsg &&
        (capMsg.markup?.inline_keyboard || []).flat()
          .some(b => b.callback_data === `grp:cap:${GID}:999`) &&
        capMsg.text.includes("can't send messages"),
        capMsg ? capMsg.text.slice(0, 150) : "pesan captcha tidak ada");
    let mrec = parseKv(W, `gmember:${GID}:999`);
    cek("record anggota: captchaPending=true",
        !!mrec && mrec.captchaPending === true, JSON.stringify(mrec));
    await handleUpdate(W.io, cbg(GID, 888, `grp:cap:${GID}:999`));
    cek("ketukan pengguna LAIN -> ditolak sopan di jawaban callback",
        (W.cbJawaban[W.cbJawaban.length - 1]?.text || "").includes("only they can tap"),
        JSON.stringify(W.cbJawaban));
    cek("ketukan orang lain: batas TIDAK dibuka, tetap pending",
        W.restricts.length === 1 &&
        parseKv(W, `gmember:${GID}:999`).captchaPending === true, "");
    await handleUpdate(W.io, cbg(GID, 999, `grp:cap:${GID}:999`));
    cek("ketukan benar -> batas dibuka (hak dasar kembali)",
        W.restricts.length === 2 && W.restricts[1].userId === 999 &&
        W.restricts[1].permissions.can_send_messages === true,
        JSON.stringify(W.restricts[1] || {}));
    cek("ketukan benar -> pesan captcha dihapus",
        W.deletions.some(d => d.chatId === GID && d.messageId === capMsg.msgId),
        JSON.stringify(W.deletions));
    cek("sesudah captcha lolos -> sambutan terkirim menyebut nama + grup",
        teksGrup(W, GID).includes("Welcome,") &&
        teksGrup(W, GID).includes("Grup Uji"), teksGrup(W, GID).slice(-300));
    mrec = parseKv(W, `gmember:${GID}:999`);
    cek("record anggota: captchaPending=false + welcomed=true",
        !!mrec && mrec.captchaPending === false && mrec.welcomed === true,
        JSON.stringify(mrec));
    // Jalur chat_member bekerja, dan gabungan ganda tidak diproses dua kali.
    await handleUpdate(W.io, chatMemberJoin(GID, { id: 998, first_name: "Second" }));
    cek("gabung via chat_member -> captcha juga berlaku (dibatasi)",
        W.restricts.filter(r => r.userId === 998).length === 1,
        JSON.stringify(W.restricts.map(r => r.userId)));
    await handleUpdate(W.io, gjoin(GID, 666, [{ id: 998, first_name: "Second" }]));
    cek("gabungan yang sama via pesan layanan -> TIDAK diproses ulang",
        W.restricts.filter(r => r.userId === 998).length === 1 &&
        keGrup(W, GID).filter(x => x.text.includes("prove you're a real person")).length === 2,
        String(W.restricts.length));
    // Kelola kata terlarang lewat panel + state mengetik.
    await handleUpdate(W.io, cb(666, "grp:bwlist:" + GID));
    cek("daftar kata kosong -> teks 'No banned words yet'",
        terakhir(W).text.includes("No banned words yet"), terakhir(W).text.slice(0, 150));
    await handleUpdate(W.io, cb(666, "grp:bwadd:" + GID));
    cek("ketuk Add a word -> diminta mengetik kata",
        terakhir(W).text.includes("Send me the word or phrase to ban"),
        terakhir(W).text.slice(0, 150));
    await handleUpdate(W.io, msg(666, "Kasino"));
    rec = parseKv(W, "group:" + GID);
    cek("kata tersimpan ternormalisasi huruf kecil + daftar menampilkannya",
        JSON.stringify(rec.settings.badwords) === JSON.stringify(["kasino"]) &&
        terakhir(W).text.includes("kasino"), terakhir(W).text.slice(0, 200));
    await handleUpdate(W.io, cb(666, "grp:bwadd:" + GID));
    await handleUpdate(W.io, msg(666, "judi online"));
    await handleUpdate(W.io, cb(666, "grp:bwdel:" + GID + ":1"));
    rec = parseKv(W, "group:" + GID);
    cek("hapus per kata via tombol -> tersisa kata pertama",
        JSON.stringify(rec.settings.badwords) === JSON.stringify(["kasino"]),
        JSON.stringify(rec.settings.badwords));
    await handleUpdate(W.io, cb(666, "grp:set:bw:" + GID));
    rec = parseKv(W, "group:" + GID);
    cek("kata terlarang dinyalakan -> badwordsOn=true",
        rec.settings.badwordsOn === true, "");
    // Anggota lama melanggar kata terlarang (case-insensitive).
    W.kv.set(`gmember:${GID}:555`, JSON.stringify({
      joinedAt: Date.now() - 3 * 86400000, welcomed: true,
      captchaPending: false, captchaMsgId: null }));
    const uBad = gmsg(GID, 555, "main KASINO sekarang");
    await handleUpdate(W.io, uBad);
    cek("pesan memuat kata terlarang -> dihapus + teguran langkah 1",
        W.deletions.some(d => d.messageId === uBad.message.message_id) &&
        teksGrup(W, GID).includes("first warning"),
        teksGrup(W, GID).slice(-300));
    // Statistik + log dari panel (grup Premium).
    await handleUpdate(W.io, cb(666, "grp:stats:" + GID));
    cek("statistik minggu ini: anggota baru 2, terhapus 1",
        terakhir(W).text.includes("New members: 2") &&
        terakhir(W).text.includes("Messages removed: 1") &&
        terakhir(W).text.includes("Members muted: 0"),
        terakhir(W).text.slice(0, 250));
    await handleUpdate(W.io, cb(666, "grp:log:" + GID));
    cek("log tindakan memuat entri teguran terakhir",
        terakhir(W).text.includes("Recent actions") &&
        terakhir(W).text.includes("Warning issued"),
        terakhir(W).text.slice(0, 250));
  }

  // ---- (c) Tangga peringatan anti-tautan di grup Free ----
  {
    const GID = -100666;
    const W = buatIo({ ai: AI_ON, adminId: 111,
      memberStatus: { "-100666:777": "administrator" } });
    await handleUpdate(W.io, botMember(GID, 777, "left", "administrator"));
    await handleUpdate(W.io, gjoin(GID, 777, [{ id: 999, first_name: "Newbie" }]));
    const u1 = gmsg(GID, 999, "klik https://spam.example/x",
      { entities: [{ type: "url", offset: 5, length: 20 }] });
    await handleUpdate(W.io, u1);
    cek("langkah 1: pesan bertautan pendatang dihapus",
        W.deletions.some(d => d.messageId === u1.message.message_id),
        JSON.stringify(W.deletions));
    cek("langkah 1: teguran tertulis menyebut nama + ancaman bisu berikutnya",
        teksGrup(W, GID).includes("Tester: your message was removed") &&
        teksGrup(W, GID).includes("first warning") &&
        teksGrup(W, GID).includes("muted for 1 hour"),
        teksGrup(W, GID).slice(-350));
    let w = parseKv(W, `gwarn:${GID}:999`);
    cek("langkah 1: cacah peringatan=1 tersimpan",
        !!w && w.count === 1, JSON.stringify(w));
    const statKey = [...W.kv.keys()].find(k => k.startsWith(`gstat:${GID}:`));
    let st = parseKv(W, statKey);
    cek("statistik: joined=1, deleted=1 sesudah langkah 1",
        !!st && st.joined === 1 && st.deleted === 1, JSON.stringify(st));
    const u2 = gmsg(GID, 999, "coba www.spam.example lagi");
    await handleUpdate(W.io, u2);
    const bisu = W.restricts.find(r => r.userId === 999 && r.untilDate > 0);
    cek("langkah 2: terhapus + dibisukan ±1 jam (until_date masa depan)",
        W.deletions.some(d => d.messageId === u2.message.message_id) &&
        !!bisu && bisu.untilDate > Math.floor(Date.now() / 1000) + 3000 &&
        bisu.permissions.can_send_messages === false,
        JSON.stringify(W.restricts));
    cek("langkah 2: pemberitahuan bisu di grup",
        teksGrup(W, GID).includes("muted for 1 hour (second warning)"),
        teksGrup(W, GID).slice(-300));
    const u3 = gmsg(GID, 999, "https://spam.example/terus");
    await handleUpdate(W.io, u3);
    cek("langkah 3: terhapus + dikeluarkan (ban lalu unban agar bisa kembali)",
        W.deletions.some(d => d.messageId === u3.message.message_id) &&
        W.bans.some(b => b.userId === 999) &&
        W.unbans.some(b => b.userId === 999), "");
    cek("langkah 3: cacah peringatan dibersihkan untuk awal baru",
        !W.kv.has(`gwarn:${GID}:999`), "");
    st = parseKv(W, statKey);
    cek("statistik akhir: deleted=3, muted=1, kicked=1",
        !!st && st.deleted === 3 && st.muted === 1 && st.kicked === 1,
        JSON.stringify(st));
    const log = parseKv(W, "glog:" + GID) || [];
    cek("log grup memuat warn + mute + kick",
        ["warn", "mute", "kick"].every(k => log.some(e => e.kind === k)),
        JSON.stringify(log.map(e => e.kind)));
    // Statistik penuh terkunci di Free; log tetap bisa dibuka.
    await handleUpdate(W.io, cb(777, "grp:stats:" + GID));
    cek("grup Free membuka statistik -> catatan Premium per group",
        terakhir(W).text.includes("Premium per group"),
        terakhir(W).text.slice(0, 200));
    await handleUpdate(W.io, cb(777, "grp:log:" + GID));
    cek("grup Free tetap bisa membuka log tindakan",
        terakhir(W).text.includes("Warning issued") &&
        terakhir(W).text.includes("Removed from group"),
        terakhir(W).text.slice(0, 300));
    // Admin grup kebal walau pendatang; anggota lama bebas tautan.
    W.kv.set(`gmember:${GID}:777`, JSON.stringify({
      joinedAt: Date.now(), welcomed: true,
      captchaPending: false, captchaMsgId: null }));
    const delSebelum = W.deletions.length;
    await handleUpdate(W.io, gmsg(GID, 777, "https://contoh.example/aman"));
    cek("admin grup mengirim tautan sebagai pendatang -> kebal, tidak dihapus",
        W.deletions.length === delSebelum, "");
    W.kv.set(`gmember:${GID}:555`, JSON.stringify({
      joinedAt: Date.now() - 3 * 86400000, welcomed: true,
      captchaPending: false, captchaMsgId: null }));
    await handleUpdate(W.io, gmsg(GID, 555, "https://contoh.example/lama"));
    cek("anggota lama (di luar jendela) mengirim tautan -> tidak dihapus",
        W.deletions.length === delSebelum, "");
    // Kata terlarang TIDAK ditegakkan di grup Free walau saklar dipaksa.
    const rec = parseKv(W, "group:" + GID);
    rec.settings.badwordsOn = true;
    rec.settings.badwords = ["kasino"];
    W.kv.set("group:" + GID, JSON.stringify(rec));
    W.kv.set(`gmember:${GID}:444`, JSON.stringify({
      joinedAt: Date.now(), welcomed: true,
      captchaPending: false, captchaMsgId: null }));
    await handleUpdate(W.io, gmsg(GID, 444, "kasino tiap hari"));
    cek("grup Free: kata terlarang tidak ditegakkan (fitur Premium)",
        W.deletions.length === delSebelum, "");
  }

  // ---- (f) Upgrade grup via Stars: invoice, pre-checkout, aktivasi ----
  {
    const GID = -100999;
    const W = buatIo({ ai: AI_ON, adminId: 111 });
    await handleUpdate(W.io, botMember(GID, 777, "left", "administrator"));
    await handleUpdate(W.io, cb(777, "grp:open:" + GID));
    cek("panel Free memuat tombol upgrade grup",
        (terakhir(W).markup?.inline_keyboard || []).flat()
          .some(b => b.callback_data === "grp:buy:" + GID), "");
    await handleUpdate(W.io, cb(777, "grp:buy:" + GID));
    cek("invoice grup terbit: XTR 250, payload groupprem:<gid>:<pembeli>",
        W.invoices.length === 1 && W.invoices[0].inv.currency === "XTR" &&
        W.invoices[0].inv.prices[0].amount === 250 &&
        W.invoices[0].inv.payload === `groupprem:${GID}:777`,
        JSON.stringify(W.invoices));
    await handleUpdate(W.io, pre(777, `groupprem:${GID}:777`, 100));
    cek("pre-checkout grup nominal salah -> ditolak",
        W.prechecks.length === 1 && W.prechecks[0].ok === false, "");
    await handleUpdate(W.io, pre(888, `groupprem:${GID}:777`, 250));
    cek("pre-checkout grup oleh bukan pembeli -> ditolak",
        W.prechecks[1]?.ok === false, JSON.stringify(W.prechecks));
    await handleUpdate(W.io, pre(777, `groupprem:${GID}:777`, 250));
    cek("pre-checkout grup benar -> ok", W.prechecks[2]?.ok === true, "");
    await handleUpdate(W.io, paid(777, `groupprem:${GID}:777`));
    const exp = Date.parse(W.kv.get("groupprem:" + GID) || "");
    cek("pembayaran grup -> groupprem aktif ±30 hari",
        exp > Date.now() + 29 * 86400000 && exp < Date.now() + 31 * 86400000,
        W.kv.get("groupprem:" + GID) || "tidak ada");
    cek("pembayaran grup TIDAK mengaktifkan premium pribadi pembeli",
        !W.kv.has("premium:777"), [...W.kv.keys()].join(","));
    cek("konfirmasi pembayaran menyebut Group Premium aktif",
        terakhir(W).text.includes("Group Premium is active"),
        terakhir(W).text.slice(0, 200));
    await handleUpdate(W.io, cb(777, "grp:set:cap:" + GID));
    const rec = parseKv(W, "group:" + GID);
    cek("sesudah upgrade: saklar captcha terbuka dan berfungsi",
        rec.settings.captcha === true, "");
    await handleUpdate(W.io, cb(111, "grp:buy:" + GID));
    cek("pemilik mengetuk upgrade grup -> TANPA invoice baru + catatan Owner",
        W.invoices.length === 1 &&
        terakhir(W).text.includes("👑 Owner"), terakhir(W).text.slice(0, 150));
  }

  // ---- (h) Ketahanan: hak admin hilang di tengah -> tidak crash,
  // tercatat sekali di log ----
  {
    const GID = -100333;
    const W = buatIo({ ai: AI_ON, adminId: 111, failActions: true });
    W.kv.set("groupprem:" + GID,
      new Date(Date.now() + 30 * 86400000).toISOString());
    await handleUpdate(W.io, botMember(GID, 666, "left", "administrator"));
    await handleUpdate(W.io, cb(666, "grp:set:cap:" + GID));
    let eror = null;
    try {
      await handleUpdate(W.io, gjoin(GID, 666, [{ id: 999, first_name: "Newbie" }]));
    } catch (e) { eror = e; }
    cek("aksi dibatasi gagal (hak kurang) -> update TIDAK crash",
        !eror, eror ? String(eror) : "");
    let log = parseKv(W, "glog:" + GID) || [];
    cek("kegagalan hak tercatat SEKALI sebagai entri noadmin di log grup",
        log.filter(e => e.kind === "noadmin").length === 1,
        JSON.stringify(log.map(e => e.kind)));
    const mrec = parseKv(W, `gmember:${GID}:999`);
    cek("anggota tidak tertahan pending captcha sesudah kegagalan hak",
        !!mrec && mrec.captchaPending === false, JSON.stringify(mrec));
    try {
      await handleUpdate(W.io, gjoin(GID, 666, [{ id: 998, first_name: "Second" }]));
    } catch (e) { eror = e; }
    log = parseKv(W, "glog:" + GID) || [];
    cek("kegagalan kedua di hari sama -> tetap satu entri noadmin, tetap tidak crash",
        !eror && log.filter(e => e.kind === "noadmin").length === 1,
        JSON.stringify(log.map(e => e.kind)));
  }

  // ---- (j) Modul groups mati -> panel menolak jujur, grup diam ----
  {
    const W = buatIo({ ai: AI_ON, adminId: 111 });
    W.kv.set("config:modules", JSON.stringify(
      { ai: true, download: true, groups: false, anon: true }));
    await handleUpdate(W.io, msg(1234, "🛡️ My Groups"));
    cek("modul groups off -> pesan 'temporarily off'",
        terakhir(W).text.includes("temporarily off"),
        terakhir(W).text.slice(0, 120));
    await handleUpdate(W.io, botMember(-100222, 666, "left", "administrator"));
    cek("modul groups off -> kejadian grup tidak dicatat/diumumkan",
        !W.kv.has("group:-100222") &&
        keGrup(W, -100222).length === 0, "");
  }
}

console.log(`\nHASIL: ${lulus} lulus, ${gagal} gagal`);
process.exit(gagal ? 1 : 0);
