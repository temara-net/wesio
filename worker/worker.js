// WesioBot — public multi-tool Telegram bot (Phase 1: AI + Downloader +
// Premium via Telegram Stars). Runs as a Cloudflare Worker webhook:
// Telegram calls this endpoint on every update; replies are instant.
//
// Division of work (same proven pattern as the botdaftar project):
// - This Worker: conversation, menus, quotas, Premium, AI calls.
//   State lives in KV (binding WKV): user registry, per-user conversation
//   state, daily quotas, premium expiry, short-lived jobs.
// - Heavy work (downloading files) is NOT done here: the Worker writes a
//   short-lived job to KV (job:<id>, TTL 15 minutes) and dispatches the
//   GitHub Actions workflow execute.yml with the job_id ONLY. The Python
//   executor fetches the job, deletes it, downloads, and sends the file
//   straight to the user's chat.
//
// The bot is PUBLIC: anyone may use it. ADMIN_ID (env) is only used for
// admin commands (/admin_stats, /admin_modules, /admin_ban,
// /admin_unban) — it does not lock the bot.
//
// AI keys come in two flavours: the system key (env AI_*, daily quota)
// or the user's own key (BYOK, saved per user in KV apikey:<uid> after a
// live test against their provider; BYOK chats use the provider's
// default model and never consume the system quota).
//
// Worker env/secrets: TG_BOT_TOKEN, ADMIN_ID, GH_TOKEN (fine-grained PAT,
// repo wesio only, Actions read/write), WEBHOOK_SECRET (optional),
// AI_API_KEY, AI_BASE_URL, AI_MODEL_FAST, AI_MODEL_STRONG, AI_IMAGE_MODEL
// (all AI_* optional: until they are set, the AI module answers honestly
// that it is not connected yet — never a raw error).

const GH_REPO = "temara-net/wesio";
const GH_WORKFLOW = "execute.yml";

export const LIMITS = {
  aiFree: 15,        // AI messages / day (free)
  aiPremium: 300,    // AI messages / day (premium)
  imagePremium: 20,  // AI images / day (premium only)
  dlFree: 5,         // downloads / day (free)
  dlPremium: 100,    // downloads / day (premium)
  dlMaxMb: 50,       // Telegram bot send limit
  premiumStars: 250, // Stars / month
  premiumDays: 30,
};

// ---------------- main menu (reply keyboard, always visible) ----------------
export const MENU_BUTTONS = ["🤖 AI Chat", "⬇️ Downloader", "🛡️ My Groups",
  "💬 Anonymous Chat", "⭐ Premium", "❓ Help"];
export const MENU_MARKUP = {
  keyboard: [[MENU_BUTTONS[0], MENU_BUTTONS[1]],
             [MENU_BUTTONS[2], MENU_BUTTONS[3]],
             [MENU_BUTTONS[4], MENU_BUTTONS[5]]],
  resize_keyboard: true,
  is_persistent: true,
};

const GO_PREMIUM_MARKUP = {
  inline_keyboard: [[{ text: "⭐ Go Premium", callback_data: "nav:premium" }]],
};

const AI_KEYBOARD = {
  inline_keyboard: [
    [{ text: "⚡ Fast model", callback_data: "ai:model:fast" },
     { text: "🧠 Strong model ⭐", callback_data: "ai:model:strong" }],
    [{ text: "📝 Summarize", callback_data: "ai:task:summarize" },
     { text: "✏️ Rewrite", callback_data: "ai:task:rewrite" }],
    [{ text: "🌐 Translate", callback_data: "ai:task:translate" },
     { text: "💡 Explain", callback_data: "ai:task:explain" }],
    [{ text: "🖼️ Image ⭐", callback_data: "ai:task:image" },
     { text: "🆕 New Chat", callback_data: "ai:new" }],
    [{ text: "🔑 My API Key", callback_data: "byok:open" }],
  ],
};

// ---------------- BYOK (bring your own key) ----------------
// Users may save their own provider API key: AI calls then run on their
// key with that provider's default model and never touch the Wesio
// system quota. Keys are tested against the provider BEFORE saving and
// are never shown in any message, history entry or log line.
export const BYOK_PROVIDERS = {
  openai: { name: "OpenAI", base: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  openrouter: { name: "OpenRouter", base: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  gemini: { name: "Google Gemini", base: "https://generativelanguage.googleapis.com/v1beta/openai/", model: "gemini-2.0-flash" },
};

const BYOK_PROVIDER_BUTTONS = [
  [{ text: "OpenAI", callback_data: "byok:provider:openai" },
   { text: "OpenRouter", callback_data: "byok:provider:openrouter" }],
  [{ text: "Google Gemini", callback_data: "byok:provider:gemini" }],
];

const BYOK_OFFER_MARKUP = {
  inline_keyboard: [[
    { text: "🔑 Use my own API key", callback_data: "byok:open" }]],
};

const BYOK_REMOVE_MARKUP = {
  inline_keyboard: [[
    { text: "🗑 Remove my key", callback_data: "byok:remove" }]],
};

// ---------------- module switches & bans (admin) ----------------
const MODULE_NAMES = ["ai", "download", "groups", "anon"];
const MODULE_LABELS = {
  ai: "🤖 AI Chat", download: "⬇️ Downloader",
  groups: "🛡️ My Groups", anon: "💬 Anonymous Chat",
};

const TEKS_BAN =
  "Your access to WesioBot has been suspended by the admin. If you " +
  "believe this is a mistake, please contact the admin.";

const DL_FORMAT_MARKUP = {
  inline_keyboard: [[
    { text: "🎬 Video", callback_data: "dl:video" },
    { text: "🎵 Audio only", callback_data: "dl:audio" },
  ]],
};

const TASK_PROMPTS = {
  summarize: "Send me the text you want summarized — or paste a link and I will read it and summarize it for you.",
  rewrite: "Send me the text and I will rewrite it in clearer, more natural words.",
  translate: "Send me the text and I will translate it — to English, or to your message's language if it is already English. Add the target language at the start if you need a specific one, e.g. \"To Spanish: ...\"",
  explain: "Send me the text, term or question and I will explain it in simple words.",
  image: "Describe the picture you want, in one or two sentences, and I will create it.",
};

const TASK_SYSTEM = {
  summarize: "Summarize the user's content briefly and clearly, keeping the key points. Answer in the same language as the content.",
  rewrite: "Rewrite the user's text so it reads clearly and naturally, keeping the same meaning and language.",
  translate: "Translate the user's text. If it is not English, translate it to English. If it is English, translate it to the language the user asks for, or to Indonesian if none is named. Output only the translation.",
  explain: "Explain the user's topic in simple words, with one short example if it helps. Answer in the same language as the user's message.",
};

// ---------------- small helpers ----------------
export function hariIniUTC(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

const DL_HOSTS = ["tiktok.com", "instagram.com", "youtube.com", "youtu.be",
  "x.com", "twitter.com"];

export function cariTautan(text) {
  const m = (text || "").match(/https?:\/\/[^\s]+/i);
  return m ? m[0].replace(/[)\].,]+$/, "") : null;
}

export function tautanDidukung(url) {
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch (e) { return false; }
  return DL_HOSTS.some(h => host === h || host.endsWith("." + h));
}

function teksStrip(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ")
             .replace(/<style[\s\S]*?<\/style>/gi, " ")
             .replace(/<[^>]+>/g, " ")
             .replace(/\s+/g, " ").trim();
}

function potong(s, n) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n) : s;
}

// ---------------- texts ----------------
function teksWelcome(nama) {
  const awal = nama ? `👋 Hi, ${nama}!` : "👋 Hi!";
  return `${awal} I'm Wesio — one bot with several tools inside.\n\n` +
    "🤖 AI Chat — ask questions, write, translate, summarize\n" +
    "⬇️ Downloader — save videos from TikTok, Instagram, YouTube & X\n" +
    "🛡️ Group Moderation — coming in Phase 2\n" +
    "💬 Anonymous Chat — coming in Phase 3\n" +
    "⭐ Premium — bigger quotas and the strongest AI model\n\n" +
    "Just tap a button below to begin. Free to use — Premium is optional.";
}

const TEKS_HELP =
  "❓ How Wesio works\n\n" +
  "🤖 AI Chat — tap it, then just type your question. Use the small buttons " +
  "inside for quick tasks: Summarize, Rewrite, Translate, Explain, and " +
  "(Premium) Image.\n\n" +
  "⬇️ Downloader — tap it, paste a TikTok / Instagram / YouTube / X link, " +
  "choose Video or Audio, and the file arrives here. You can also paste a " +
  "link straight into this chat.\n\n" +
  "⭐ Premium — one subscription raises every quota and unlocks the strong " +
  "AI model. Tap ⭐ Premium to compare Free vs Premium.\n\n" +
  "Quotas reset every day at 00:00 UTC. Commands if you like typing: " +
  "/start /ai /download /premium /help";

const TEKS_GROUPS_SOON =
  "🛡️ Group Moderation — coming in Phase 2\n\n" +
  "Soon you will be able to add me to your group as an admin and I will " +
  "help keep it clean: anti-spam, link control for new members, a " +
  "tap-to-join check, welcome messages and step-by-step warnings — all " +
  "set up with buttons, no commands to memorize.\n\n" +
  "It is not live yet. 🤖 AI Chat and the ⬇️ Downloader already work — " +
  "tap a button below.";

const TEKS_ANON_SOON =
  "💬 Anonymous Chat — coming in Phase 3\n\n" +
  "Soon you will be able to chat with a stranger without sharing your " +
  "name, username or photo. You will always see Next, Stop and Report " +
  "buttons, and it will be text-only and 18+ at launch, for safety.\n\n" +
  "It is not live yet — matching needs many users online at the same " +
  "time, so it launches after the other modules. 🤖 AI Chat and the " +
  "⬇️ Downloader already work — tap a button below.";

const TEKS_AI_OFF =
  "🤖 AI Chat is not switched on yet on my side — the AI service has not " +
  "been connected. Please try again later.\n\n" +
  "The ⬇️ Downloader already works — tap it below to save a video.";

// ---------------- KV-backed state ----------------
async function muatConv(io, uid) {
  try { return JSON.parse((await io.kvGet("conv:" + uid)) || "{}"); }
  catch (e) { return {}; }
}

async function simpanConv(io, uid, c) {
  await io.kvPut("conv:" + uid, JSON.stringify(c));
}

async function catatPengguna(io, uid) {
  const k = "user:" + uid;
  if (!(await io.kvGet(k))) {
    await io.kvPut(k, JSON.stringify({ first: new Date().toISOString() }));
  }
}

export async function premiumAktif(io, uid) {
  const v = await io.kvGet("premium:" + uid);
  if (!v) return false;
  const t = Date.parse(v);
  return !Number.isNaN(t) && t > Date.now();
}

async function premiumSampai(io, uid) {
  const v = await io.kvGet("premium:" + uid);
  return v || null;
}

async function kuotaTerpakai(io, uid, mod) {
  const v = await io.kvGet(`quota:${uid}:${mod}:${hariIniUTC()}`);
  const n = parseInt(v || "0", 10);
  return Number.isNaN(n) ? 0 : n;
}

async function kuotaTambah(io, uid, mod) {
  const k = `quota:${uid}:${mod}:${hariIniUTC()}`;
  const n = (await kuotaTerpakai(io, uid, mod)) + 1;
  await io.kvPut(k, String(n), 172800); // TTL 2 hari
  return n;
}

async function statTambah(io, mod) {
  const k = `stats:${hariIniUTC()}:${mod}`;
  const v = await io.kvGet(k);
  const n = (parseInt(v || "0", 10) || 0) + 1;
  await io.kvPut(k, String(n), 172800);
}

function batasAi(prem) { return prem ? LIMITS.aiPremium : LIMITS.aiFree; }
function batasDl(prem) { return prem ? LIMITS.dlPremium : LIMITS.dlFree; }

async function sisaAi(io, uid, prem) {
  return Math.max(0, batasAi(prem) - (await kuotaTerpakai(io, uid, "ai")));
}
async function sisaDl(io, uid, prem) {
  return Math.max(0, batasDl(prem) - (await kuotaTerpakai(io, uid, "dl")));
}

// ---- user API key (BYOK): {provider, base, key} in KV apikey:<uid> ----
async function muatKunci(io, uid) {
  try {
    const v = await io.kvGet("apikey:" + uid);
    if (!v) return null;
    const r = JSON.parse(v);
    return r && r.key && r.base ? r : null;
  } catch (e) { return null; }
}

// ---- module switches: KV config:modules = {ai, download, groups, anon}
async function modulConfig(io) {
  const cfg = { ai: true, download: true, groups: true, anon: true };
  try {
    const v = await io.kvGet("config:modules");
    if (v) Object.assign(cfg, JSON.parse(v));
  } catch (e) { /* a broken config must never take the bot down */ }
  return cfg;
}

async function modulAktif(io, nama) {
  return !!(await modulConfig(io))[nama];
}

async function pesanModulOff(io, chatId, nama) {
  await io.send(chatId,
    `⏸️ ${MODULE_LABELS[nama]} is temporarily off right now.\n\n` +
    "Please try one of my other tools meanwhile — tap a button below.",
    MENU_MARKUP);
}

// ---- bans: KV ban:<uid> ----
async function terban(io, uid) {
  return !!(await io.kvGet("ban:" + uid));
}

// ---------------- Module: AI ----------------
function aiSiap(io) {
  return !!(io.ai && io.ai.apiKey && io.ai.baseUrl && io.ai.modelFast);
}

async function mulaiAi(io, chatId, uid) {
  if (!(await modulAktif(io, "ai"))) {
    await pesanModulOff(io, chatId, "ai");
    return;
  }
  const kunci = await muatKunci(io, uid);
  if (!aiSiap(io) && !kunci) {
    await io.send(chatId, TEKS_AI_OFF, BYOK_OFFER_MARKUP);
    return;
  }
  const c = await muatConv(io, uid);
  c.mode = "ai";
  if (!c.aiModel) c.aiModel = "fast";
  if (!Array.isArray(c.history)) c.history = [];
  c.aiTask = null;
  await simpanConv(io, uid, c);
  const prem = await premiumAktif(io, uid);
  const sisa = await sisaAi(io, uid, prem);
  const barisKuota = kunci
    ? `🔑 Your own ${(BYOK_PROVIDERS[kunci.provider] || {}).name || "provider"} ` +
      "API key is active — no daily quota applies to you."
    : `Model: ${c.aiModel === "strong" ? "🧠 Strong" : "⚡ Fast"}\n` +
      `AI messages left today: ${sisa} of ${batasAi(prem)}`;
  await io.send(chatId,
    "🤖 AI Chat\n\n" +
    "Ask me anything, or pick a quick task below.\n" +
    "Example: tap 📝 Summarize, then paste a long text — I'll shrink it " +
    "for you.\n\n" +
    barisKuota + "\n\n" +
    "Just type your message to chat.",
    AI_KEYBOARD);
}

async function prosesAi(io, chatId, uid, teks) {
  if (!(await modulAktif(io, "ai"))) {
    await pesanModulOff(io, chatId, "ai");
    return;
  }
  const kunci = await muatKunci(io, uid);
  if (!aiSiap(io) && !kunci) {
    await io.send(chatId, TEKS_AI_OFF, BYOK_OFFER_MARKUP);
    return;
  }
  const prem = await premiumAktif(io, uid);
  const c = await muatConv(io, uid);

  // Image task: Premium only, own daily quota.
  if (c.aiTask === "image") {
    c.aiTask = null;
    await simpanConv(io, uid, c);
    if (!prem) {
      await io.send(chatId,
        "🖼️ Image creation is a Premium feature. Tap ⭐ Premium to see " +
        "what it unlocks.", GO_PREMIUM_MARKUP);
      return;
    }
    if (!io.ai.imageModel) {
      await io.send(chatId,
        "🖼️ Image creation is not switched on yet on my side. Text chat " +
        "works — just send me a message.", AI_KEYBOARD);
      return;
    }
    const usedImg = await kuotaTerpakai(io, uid, "aimg");
    if (usedImg >= LIMITS.imagePremium) {
      await io.send(chatId,
        `You've used all ${LIMITS.imagePremium} image creations for ` +
        "today. They reset tomorrow at 00:00 UTC.", AI_KEYBOARD);
      return;
    }
    await io.send(chatId, "🎨 Creating your picture…");
    try {
      const url = await io.genImage(teks);
      await kuotaTambah(io, uid, "aimg");
      await io.sendPhoto(chatId, url, "Here is your picture 🎨");
      await io.send(chatId,
        `Images left today: ${LIMITS.imagePremium - usedImg - 1} of ` +
        `${LIMITS.imagePremium}`, AI_KEYBOARD);
    } catch (e) {
      await io.send(chatId,
        "The picture maker is busy right now. Please try again in a " +
        "moment.", AI_KEYBOARD);
    }
    return;
  }

  const sisa = await sisaAi(io, uid, prem);
  if (!kunci && sisa <= 0) {
    await io.send(chatId,
      `You've used all ${batasAi(prem)} AI messages for today. Your ` +
      "quota resets tomorrow at 00:00 UTC.\n\n" +
      (prem ? "" : "⭐ Premium raises this to 300 a day and adds the " +
        "strong model — tap below to compare."),
      prem ? AI_KEYBOARD : GO_PREMIUM_MARKUP);
    return;
  }

  // Build the message list: quick task, link reading, or plain chat.
  let messages;
  let riwayatBaru = null;
  if (c.aiTask && TASK_SYSTEM[c.aiTask]) {
    let konten = teks;
    const link = cariTautan(teks);
    if (link && c.aiTask === "summarize") {
      try {
        const r = await io.fetchText(link);
        if (r.status < 400 && r.text) konten = potong(teksStrip(r.text), 12000);
      } catch (e) { /* fall through with the raw text */ }
    }
    messages = [
      { role: "system", content: TASK_SYSTEM[c.aiTask] },
      { role: "user", content: potong(konten, 12000) },
    ];
    c.aiTask = null;
    await simpanConv(io, uid, c);
  } else {
    const history = (Array.isArray(c.history) ? c.history : []).slice(-16);
    messages = [
      { role: "system", content: "You are Wesio, a helpful assistant inside " +
        "a Telegram bot. Answer in the same language as the user's latest " +
        "message. Keep answers clear and not overly long." },
      ...history,
      { role: "user", content: potong(teks, 4000) },
    ];
    riwayatBaru = history.concat([
      { role: "user", content: potong(teks, 4000) },
    ]);
  }

  // With the user's own key: their provider's default model, their
  // credentials, and no Wesio quota. Otherwise the system key + quota.
  const provKunci = kunci ? BYOK_PROVIDERS[kunci.provider] : null;
  const model = kunci
    ? (provKunci ? provKunci.model : io.ai.modelFast)
    : (c.aiModel === "strong" && prem && io.ai.modelStrong
      ? io.ai.modelStrong : io.ai.modelFast);
  let jawaban;
  try {
    jawaban = await io.callAI(messages, model,
      kunci ? { base: kunci.base, key: kunci.key } : null);
  } catch (e) {
    if (kunci && e && [401, 403, 429].includes(e.status)) {
      const namaProv = provKunci ? provKunci.name : "Your provider";
      await io.send(chatId,
        `${namaProv} answered with an error for your own API key ` +
        "(it may be out of credit, over its limit, or no longer valid). " +
        "That's a reply from your provider, not from Wesio.\n\n" +
        "You can remove your key below and return to the Wesio system " +
        "key, or send me a different key via 🔑 My API Key.",
        BYOK_REMOVE_MARKUP);
      return;
    }
    await io.send(chatId,
      "The AI is busy right now. Please try again in a moment.",
      AI_KEYBOARD);
    return;
  }
  if (!jawaban) {
    await io.send(chatId,
      "The AI sent back an empty answer. Please try asking in a " +
      "different way.", AI_KEYBOARD);
    return;
  }
  await statTambah(io, "ai");
  if (riwayatBaru) {
    c.history = riwayatBaru.concat([{ role: "assistant", content: potong(jawaban, 4000) }]).slice(-20);
    await simpanConv(io, uid, c);
  }
  if (kunci) {
    await io.send(chatId,
      `${jawaban}\n\n—\n🔑 Using your own API key — no Wesio quota used`,
      AI_KEYBOARD);
    return;
  }
  const terpakai = await kuotaTambah(io, uid, "ai");
  const sisaNow = Math.max(0, batasAi(prem) - terpakai);
  await io.send(chatId,
    `${jawaban}\n\n—\nAI messages left today: ${sisaNow} of ${batasAi(prem)}`,
    AI_KEYBOARD);
}

// ---------------- BYOK panel & key intake ----------------
async function tampilByok(io, chatId, uid) {
  const kunci = await muatKunci(io, uid);
  if (kunci) {
    const prov = BYOK_PROVIDERS[kunci.provider];
    await io.send(chatId,
      "🔑 My API Key\n\n" +
      `Status: active — your own ${prov ? prov.name : "provider"} key is ` +
      "in use for AI Chat, so the Wesio daily quota does not apply to " +
      "you.\n\n" +
      "Your key value is never shown here or anywhere else. You can " +
      "remove it at any time, or replace it by picking a provider below.",
      { inline_keyboard: [
        [{ text: "🗑 Remove my key", callback_data: "byok:remove" }],
        ...BYOK_PROVIDER_BUTTONS,
      ] });
    return;
  }
  await io.send(chatId,
    "🔑 My API Key\n\n" +
    "Status: no key saved — AI Chat currently runs on the Wesio system " +
    "key with a daily quota.\n\n" +
    "Want unlimited use on your own account? Add your own API key: " +
    "your chats then run on your key and never touch the Wesio quota. " +
    "The key is tested with your provider before it is saved, and it " +
    "is never displayed anywhere.\n\n" +
    "Pick your provider to begin:",
    { inline_keyboard: BYOK_PROVIDER_BUTTONS });
}

async function mulaiPasangKunci(io, chatId, uid, kodeProvider) {
  const prov = BYOK_PROVIDERS[kodeProvider];
  if (!prov) return;
  const c = await muatConv(io, uid);
  c.mode = "ai_await_key";
  c.byokProvider = kodeProvider;
  await simpanConv(io, uid, c);
  await io.send(chatId,
    `🔑 ${prov.name} key\n\n` +
    "Send me your API key as a single message. I will test it with " +
    `${prov.name} first — it is only saved if the test passes.\n\n` +
    "Tip: after the key is saved, you can delete that message from " +
    "this chat. It is never stored in your conversation history here, " +
    "and it never appears in any reply.\n\n" +
    "Changed your mind? Just tap 🤖 AI Chat below instead.");
}

async function prosesKunciByok(io, chatId, uid, teks) {
  const c = await muatConv(io, uid);
  const kode = c.byokProvider || "openai";
  const prov = BYOK_PROVIDERS[kode] || BYOK_PROVIDERS.openai;
  const kandidat = (teks || "").trim();
  let hasil = null;
  try { hasil = await io.testApiKey(prov.base, kandidat); }
  catch (e) { hasil = { ok: false, reason: "unreachable" }; }
  if (!hasil || !hasil.ok) {
    // Stay in awaiting mode so the user can simply send another key.
    if (hasil && hasil.reason === "rejected") {
      await io.send(chatId,
        `❌ ${prov.name} rejected that key, so nothing was saved.\n\n` +
        "Please check the key and send it again — or tap 🤖 AI Chat " +
        "below to cancel and keep using the Wesio system key.");
    } else {
      await io.send(chatId,
        `❌ I couldn't reach ${prov.name} to check that key, so nothing ` +
        "was saved.\n\n" +
        "Please try sending the key again in a moment — or tap " +
        "🤖 AI Chat below to cancel.");
    }
    return;
  }
  await io.kvPut("apikey:" + uid, JSON.stringify({
    provider: kode, base: prov.base, key: kandidat,
  }));
  c.mode = "ai";
  c.byokProvider = null;
  await simpanConv(io, uid, c);
  await io.send(chatId,
    `✅ Your ${prov.name} key passed the test and is now active.\n\n` +
    `Model used with your key: ${prov.model}\n` +
    "Your AI chats now run on your own key — no Wesio quota is used. " +
    "Manage it anytime via 🔑 My API Key.",
    AI_KEYBOARD);
}

async function hapusKunci(io, chatId, uid) {
  const kunci = await muatKunci(io, uid);
  if (!kunci) {
    await io.send(chatId,
      "You don't have a saved API key right now — AI Chat is using the " +
      "Wesio system key.", AI_KEYBOARD);
    return;
  }
  await io.kvDel("apikey:" + uid);
  const c = await muatConv(io, uid);
  if (c.mode === "ai_await_key") { c.mode = "ai"; c.byokProvider = null; }
  await simpanConv(io, uid, c);
  await io.send(chatId,
    "🗑 Your API key has been removed.\n\n" +
    "AI Chat now uses the Wesio system key again, with the normal " +
    "daily quota.", AI_KEYBOARD);
}

// ---------------- Module: Downloader ----------------
async function mulaiDownload(io, chatId, uid) {
  if (!(await modulAktif(io, "download"))) {
    await pesanModulOff(io, chatId, "download");
    return;
  }
  const c = await muatConv(io, uid);
  c.mode = "dl_wait_link";
  c.pendingUrl = null;
  await simpanConv(io, uid, c);
  const prem = await premiumAktif(io, uid);
  const sisa = await sisaDl(io, uid, prem);
  await io.send(chatId,
    "⬇️ Downloader\n\n" +
    "Send me a video link from TikTok, Instagram, YouTube or X, and " +
    "I'll send the file back here.\n" +
    "Example: https://www.tiktok.com/@user/video/123456789\n\n" +
    `${prem ? "Downloads" : "Free downloads"} left today: ${sisa} of ${batasDl(prem)}`,
    MENU_MARKUP);
}

async function terimaTautan(io, chatId, uid, teks) {
  if (!(await modulAktif(io, "download"))) {
    await pesanModulOff(io, chatId, "download");
    return;
  }
  const url = cariTautan(teks);
  if (!url || !tautanDidukung(url)) {
    await io.send(chatId,
      "That link is not from a supported site. I can download from " +
      "TikTok, Instagram, YouTube and X — please send a link from one " +
      "of those.", MENU_MARKUP);
    return;
  }
  const prem = await premiumAktif(io, uid);
  if ((await sisaDl(io, uid, prem)) <= 0) {
    await io.send(chatId,
      `You've used all ${batasDl(prem)} downloads for today. Your quota ` +
      "resets tomorrow at 00:00 UTC.\n\n" +
      (prem ? "" : "⭐ Premium gives you 100 downloads a day — tap below " +
        "to compare."),
      prem ? MENU_MARKUP : GO_PREMIUM_MARKUP);
    return;
  }
  const c = await muatConv(io, uid);
  c.mode = "dl_wait_format";
  c.pendingUrl = url;
  await simpanConv(io, uid, c);
  await io.send(chatId, "Got it 👍 Send it as video or audio?", DL_FORMAT_MARKUP);
}

async function jalankanDownload(io, chatId, uid, format) {
  if (!(await modulAktif(io, "download"))) {
    await pesanModulOff(io, chatId, "download");
    return;
  }
  const c = await muatConv(io, uid);
  const url = c.pendingUrl;
  c.mode = "idle";
  c.pendingUrl = null;
  await simpanConv(io, uid, c);
  if (!url) {
    await io.send(chatId,
      "That download link has expired. Please send the link again.",
      MENU_MARKUP);
    return;
  }
  const prem = await premiumAktif(io, uid);
  if ((await sisaDl(io, uid, prem)) <= 0) {
    await io.send(chatId,
      "Your download quota for today just ran out. It resets tomorrow " +
      "at 00:00 UTC.", prem ? MENU_MARKUP : GO_PREMIUM_MARKUP);
    return;
  }
  const jobId = crypto.randomUUID();
  const job = { type: "download", chat_id: chatId, uid, url, format };
  await io.kvPut("job:" + jobId, JSON.stringify(job), 900); // TTL 15 min
  try {
    await io.dispatch(jobId);
  } catch (e) {
    await io.kvDel("job:" + jobId);
    await io.send(chatId,
      "I couldn't start that download just now. Please send the link " +
      "again in a moment.", MENU_MARKUP);
    return;
  }
  const terpakai = await kuotaTambah(io, uid, "dl");
  await statTambah(io, "dl");
  const sisaNow = Math.max(0, batasDl(prem) - terpakai);
  await io.send(chatId,
    "⏳ Processing your download… I'll send the file right here when " +
    "it's ready (usually under a minute).\n\n" +
    `${prem ? "Downloads" : "Free downloads"} left today: ${sisaNow} of ${batasDl(prem)}`,
    MENU_MARKUP);
}

// ---------------- Module: Premium (Telegram Stars) ----------------
async function tampilPremium(io, chatId, uid) {
  const prem = await premiumAktif(io, uid);
  const sampai = await premiumSampai(io, uid);
  let status;
  let markup;
  if (prem) {
    status = `Your status: ⭐ Premium, active until ${sampai.slice(0, 10)} (UTC)`;
    markup = MENU_MARKUP;
  } else {
    status = "Your status: Free";
    markup = { inline_keyboard: [[
      { text: `⭐ Buy Premium — ${LIMITS.premiumStars} Stars / month`,
        callback_data: "buy:premium" }]] };
  }
  await io.send(chatId,
    "⭐ WesioBot Premium\n\n" +
    status + "\n\n" +
    "Free vs Premium:\n" +
    `🤖 AI: ${LIMITS.aiFree} messages/day → ${LIMITS.aiPremium}/day, ` +
    "strongest model, 20 images/day\n" +
    `⬇️ Downloads: ${LIMITS.dlFree}/day → ${LIMITS.dlPremium}/day, ` +
    "priority queue\n" +
    "💬 Anonymous Chat (Phase 3): standard matching → language/region " +
    "filters\n\n" +
    `Price: ${LIMITS.premiumStars} Stars for ${LIMITS.premiumDays} days, ` +
    "paid inside Telegram — no card, no leaving the app.",
    markup);
}

async function beliPremium(io, chatId, uid) {
  await io.sendInvoice(chatId, {
    title: "WesioBot Premium",
    description: `${LIMITS.premiumDays} days of WesioBot Premium: ` +
      `${LIMITS.aiPremium} AI messages/day, the strong AI model, ` +
      "image creation, and " + `${LIMITS.dlPremium} downloads/day.`,
    payload: "premium:" + uid,
    currency: "XTR",
    prices: [{ label: `Premium — ${LIMITS.premiumDays} days`,
               amount: LIMITS.premiumStars }],
  });
}

async function tanganiPreCheckout(io, q) {
  const uid = q.from && q.from.id;
  const cocok = q.invoice_payload === "premium:" + uid &&
    q.currency === "XTR" && q.total_amount === LIMITS.premiumStars;
  if (cocok) {
    await io.answerPreCheckout(q.id, true);
  } else {
    await io.answerPreCheckout(q.id, false,
      "This checkout doesn't match your account. Please open /premium " +
      "and try again.");
  }
}

async function tanganiPembayaran(io, msg) {
  const chatId = msg.chat && msg.chat.id;
  const uid = msg.from && msg.from.id;
  const sp = msg.successful_payment;
  if (!sp || chatId == null || uid == null) return;
  if (sp.invoice_payload === "premium:" + uid && sp.currency === "XTR") {
    const sampai = new Date(Date.now() + LIMITS.premiumDays * 86400000);
    await io.kvPut("premium:" + uid, sampai.toISOString());
    await io.send(chatId,
      "🎉 Premium is active!\n\n" +
      `Your Premium runs until ${sampai.toISOString().slice(0, 10)} (UTC). ` +
      "Your quotas are already raised — tap 🤖 AI Chat or ⬇️ Downloader " +
      "below and enjoy.", MENU_MARKUP);
  } else {
    await io.send(chatId,
      "I received a payment confirmation that doesn't match your " +
      "account, so I didn't change anything. If you paid and Premium " +
      "is not active, please open /premium and check your status.",
      MENU_MARKUP);
  }
}

// ---------------- Admin ----------------
function adalahAdmin(io, uid) {
  return String(uid) === String(io.adminId);
}

async function tolakBukanAdmin(io, chatId) {
  await io.send(chatId,
    "That command is only available to the bot's admin.", MENU_MARKUP);
}

async function adminStats(io, chatId, uid) {
  if (!adalahAdmin(io, uid)) { await tolakBukanAdmin(io, chatId); return; }
  const users = await io.kvList("user:");
  const premKeys = await io.kvList("premium:");
  let premAktifN = 0;
  for (const k of premKeys) {
    const id = k.slice("premium:".length);
    if (await premiumAktif(io, id)) premAktifN++;
  }
  const bans = await io.kvList("ban:");
  const cfg = await modulConfig(io);
  const statModul = MODULE_NAMES
    .map(m => `${MODULE_LABELS[m]} ${cfg[m] ? "on" : "OFF"}`).join(" · ");
  const aiHariIni = await io.kvGet(`stats:${hariIniUTC()}:ai`);
  const dlHariIni = await io.kvGet(`stats:${hariIniUTC()}:dl`);
  await io.send(chatId,
    "📊 WesioBot stats\n\n" +
    `Registered users: ${users.length}\n` +
    `AI messages today: ${aiHariIni || 0}\n` +
    `Downloads started today: ${dlHariIni || 0}\n` +
    `Premium active: ${premAktifN}\n` +
    `Banned users: ${bans.length}\n` +
    `Modules: ${statModul}`,
    MENU_MARKUP);
}

async function tampilAdminModules(io, chatId, uid) {
  if (!adalahAdmin(io, uid)) { await tolakBukanAdmin(io, chatId); return; }
  const cfg = await modulConfig(io);
  const rows = MODULE_NAMES.map(m => [{
    text: `${MODULE_LABELS[m]}: ${cfg[m] ? "✅ ON" : "⏸ OFF"}`,
    callback_data: "admin:mod:" + m,
  }]);
  await io.send(chatId,
    "🛠️ Module switches\n\n" +
    "Tap a module to switch it on or off. While a module is off, users " +
    "get a friendly note and no quota is used. Group Moderation and " +
    "Anonymous Chat still answer 'coming soon' while they are on — " +
    "their phases are not built yet.",
    { inline_keyboard: rows });
}

async function adminBan(io, chatId, uid, target) {
  if (!adalahAdmin(io, uid)) { await tolakBukanAdmin(io, chatId); return; }
  if (!/^\d+$/.test(target || "")) {
    await io.send(chatId,
      "Usage: /admin_ban <telegram-user-id> — the id must be a number.",
      MENU_MARKUP);
    return;
  }
  if (String(target) === String(io.adminId)) {
    await io.send(chatId,
      "That id belongs to the admin account — the admin cannot be " +
      "banned.", MENU_MARKUP);
    return;
  }
  await io.kvPut("ban:" + target,
    JSON.stringify({ at: new Date().toISOString() }));
  await io.send(chatId,
    `🚫 User ${target} is now banned. Every module will refuse them ` +
    "until you lift it with /admin_unban " + target + ".", MENU_MARKUP);
}

async function adminUnban(io, chatId, uid, target) {
  if (!adalahAdmin(io, uid)) { await tolakBukanAdmin(io, chatId); return; }
  if (!/^\d+$/.test(target || "")) {
    await io.send(chatId,
      "Usage: /admin_unban <telegram-user-id> — the id must be a number.",
      MENU_MARKUP);
    return;
  }
  if (!(await io.kvGet("ban:" + target))) {
    await io.send(chatId, `User ${target} is not banned.`, MENU_MARKUP);
    return;
  }
  await io.kvDel("ban:" + target);
  await io.send(chatId,
    `✅ User ${target} is no longer banned.`, MENU_MARKUP);
}

// ---------------- Callback queries (inline buttons) ----------------
async function handleCallback(io, cq) {
  const uid = cq.from && cq.from.id;
  const chatId = cq.message && cq.message.chat && cq.message.chat.id;
  if (uid == null || chatId == null) return;
  await catatPengguna(io, uid);
  const data = cq.data || "";
  await io.answerCallback(cq.id);
  if (!adalahAdmin(io, uid) && (await terban(io, uid))) {
    await io.send(chatId, TEKS_BAN, MENU_MARKUP);
    return;
  }
  const c = await muatConv(io, uid);

  if (data === "nav:premium") { await tampilPremium(io, chatId, uid); return; }
  if (data === "buy:premium") { await beliPremium(io, chatId, uid); return; }

  if (data === "byok:open") { await tampilByok(io, chatId, uid); return; }
  if (data === "byok:remove") { await hapusKunci(io, chatId, uid); return; }
  if (data.startsWith("byok:provider:")) {
    await mulaiPasangKunci(io, chatId, uid, data.slice("byok:provider:".length));
    return;
  }

  if (data.startsWith("admin:mod:")) {
    const nama = data.slice("admin:mod:".length);
    if (!adalahAdmin(io, uid)) { await tolakBukanAdmin(io, chatId); return; }
    if (MODULE_NAMES.includes(nama)) {
      const cfg = await modulConfig(io);
      cfg[nama] = !cfg[nama];
      await io.kvPut("config:modules", JSON.stringify(cfg));
    }
    await tampilAdminModules(io, chatId, uid);
    return;
  }

  if (data === "dl:video" || data === "dl:audio") {
    await jalankanDownload(io, chatId, uid, data === "dl:video" ? "video" : "audio");
    return;
  }

  if (data.startsWith("ai:")) {
    if (!(await modulAktif(io, "ai"))) {
      await pesanModulOff(io, chatId, "ai");
      return;
    }
    if (!aiSiap(io) && !(await muatKunci(io, uid))) {
      await io.send(chatId, TEKS_AI_OFF, BYOK_OFFER_MARKUP);
      return;
    }
    const prem = await premiumAktif(io, uid);
    if (data === "ai:model:fast" || data === "ai:model:strong") {
      if (data === "ai:model:strong" && !prem) {
        await io.send(chatId,
          "🧠 The strong model is a Premium feature. You're on the ⚡ Fast " +
          "model — tap ⭐ Premium to unlock the strong one.",
          GO_PREMIUM_MARKUP);
        return;
      }
      if (data === "ai:model:strong" && !io.ai.modelStrong) {
        await io.send(chatId,
          "🧠 The strong model is not connected yet on my side. You're " +
          "on the ⚡ Fast model for now.", AI_KEYBOARD);
        return;
      }
      c.mode = "ai";
      c.aiModel = data === "ai:model:strong" ? "strong" : "fast";
      await simpanConv(io, uid, c);
      await io.send(chatId,
        `Model set to ${c.aiModel === "strong" ? "🧠 Strong" : "⚡ Fast"}. ` +
        "Send me your message.", AI_KEYBOARD);
      return;
    }
    if (data === "ai:new") {
      c.mode = "ai";
      c.history = [];
      c.aiTask = null;
      await simpanConv(io, uid, c);
      await io.send(chatId,
        "🆕 Fresh chat started. Send me your message.", AI_KEYBOARD);
      return;
    }
    if (data.startsWith("ai:task:")) {
      const task = data.slice("ai:task:".length);
      if (TASK_PROMPTS[task]) {
        c.mode = "ai";
        c.aiTask = task;
        await simpanConv(io, uid, c);
        await io.send(chatId, TASK_PROMPTS[task], AI_KEYBOARD);
        return;
      }
    }
  }
}

// ---------------- Main update handler ----------------
export async function handleUpdate(io, update) {
  if (update.pre_checkout_query) {
    await tanganiPreCheckout(io, update.pre_checkout_query);
    return;
  }
  if (update.callback_query) {
    await handleCallback(io, update.callback_query);
    return;
  }
  const msg = update.message || {};
  const chatId = msg.chat && msg.chat.id;
  const uid = msg.from && msg.from.id;
  if (chatId == null || uid == null) return;
  const nama = (msg.from && (msg.from.first_name || "")) || "";
  await catatPengguna(io, uid);

  if (msg.successful_payment) {
    await tanganiPembayaran(io, msg);
    return;
  }

  // Banned users are refused by every module (the admin is exempt —
  // the admin account can never be banned in the first place).
  if (!adalahAdmin(io, uid) && (await terban(io, uid))) {
    if ((msg.text || "").trim()) {
      await io.send(chatId, TEKS_BAN, MENU_MARKUP);
    }
    return;
  }

  const text = (msg.text || "").trim();
  if (!text) return;
  const rendah = text.toLowerCase();
  const grup = msg.chat.type && msg.chat.type !== "private";

  // Menu buttons are matched exactly; commands tolerate a @botname suffix.
  const perintah = rendah.split("@")[0];

  if (perintah === "/start") {
    const c = await muatConv(io, uid);
    c.mode = "idle";
    await simpanConv(io, uid, c);
    await io.send(chatId, teksWelcome(nama), MENU_MARKUP);
    return;
  }
  if (perintah === "/help" || text === "❓ Help") {
    await io.send(chatId, TEKS_HELP, MENU_MARKUP);
    return;
  }
  if (perintah === "/admin_stats") { await adminStats(io, chatId, uid); return; }
  if (perintah === "/admin_modules") { await tampilAdminModules(io, chatId, uid); return; }
  if (perintah === "/admin_ban" || perintah.startsWith("/admin_ban ")) {
    await adminBan(io, chatId, uid, perintah.slice("/admin_ban".length).trim());
    return;
  }
  if (perintah === "/admin_unban" || perintah.startsWith("/admin_unban ")) {
    await adminUnban(io, chatId, uid, perintah.slice("/admin_unban".length).trim());
    return;
  }
  if (perintah === "/premium" || text === "⭐ Premium") {
    await tampilPremium(io, chatId, uid);
    return;
  }
  if (perintah === "/ai" || text === "🤖 AI Chat") {
    await mulaiAi(io, chatId, uid);
    return;
  }
  if (perintah === "/download" || text === "⬇️ Downloader") {
    await mulaiDownload(io, chatId, uid);
    return;
  }
  if (text === "🛡️ My Groups") {
    if (!(await modulAktif(io, "groups"))) {
      await pesanModulOff(io, chatId, "groups");
      return;
    }
    await io.send(chatId, TEKS_GROUPS_SOON, MENU_MARKUP);
    return;
  }
  if (text === "💬 Anonymous Chat") {
    if (!(await modulAktif(io, "anon"))) {
      await pesanModulOff(io, chatId, "anon");
      return;
    }
    await io.send(chatId, TEKS_ANON_SOON, MENU_MARKUP);
    return;
  }

  // In group chats, only commands/menu taps are answered (no chatter).
  if (grup) return;

  const c = await muatConv(io, uid);
  // A message sent while installing a BYOK key IS the key: it is tested
  // and stored only as the key record — never written to chat history.
  if (c.mode === "ai_await_key") {
    await prosesKunciByok(io, chatId, uid, text);
    return;
  }
  // A pasted supported link works from anywhere.
  if (cariTautan(text) && tautanDidukung(cariTautan(text))) {
    if (c.mode === "ai" && c.aiTask === "summarize") {
      await prosesAi(io, chatId, uid, text);
      return;
    }
    await terimaTautan(io, chatId, uid, text);
    return;
  }
  if (c.mode === "dl_wait_link" || c.mode === "dl_wait_format") {
    await terimaTautan(io, chatId, uid, text);
    return;
  }
  if (c.mode === "ai") {
    await prosesAi(io, chatId, uid, text);
    return;
  }
  await io.send(chatId,
    "Tap a button below to pick a tool — 🤖 AI Chat for questions, " +
    "⬇️ Downloader to save a video. Or paste a TikTok / Instagram / " +
    "YouTube / X link right here.", MENU_MARKUP);
}

// ---------------- Cloudflare adapter ----------------
function buatIo(env) {
  const base = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/`;
  const tg = async (method, body) => {
    const r = await fetch(base + method, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error("Telegram " + method + " HTTP " + r.status);
    return r;
  };
  const aiBase = (env.AI_BASE_URL || "").replace(/\/+$/, "");
  return {
    adminId: env.ADMIN_ID,
    ai: {
      apiKey: env.AI_API_KEY || "",
      baseUrl: aiBase,
      modelFast: env.AI_MODEL_FAST || "",
      modelStrong: env.AI_MODEL_STRONG || "",
      imageModel: env.AI_IMAGE_MODEL || "",
    },
    kvGet: (k) => env.WKV.get(k),
    kvPut: (k, v, ttl) => env.WKV.put(k, v, ttl ? { expirationTtl: ttl } : undefined),
    kvDel: (k) => env.WKV.delete(k),
    kvList: async (prefix) => {
      const keys = [];
      let cursor;
      do {
        const page = await env.WKV.list({ prefix, cursor });
        for (const k of page.keys) keys.push(k.name);
        cursor = page.list_complete ? undefined : page.cursor;
      } while (cursor);
      return keys;
    },
    send: async (chatId, text, markup) => {
      for (let i = 0; i < text.length; i += 4000) {
        const body = { chat_id: chatId, text: text.slice(i, i + 4000) };
        if (markup && i === 0) body.reply_markup = markup;
        await tg("sendMessage", body);
      }
    },
    sendPhoto: async (chatId, url, caption) => {
      await tg("sendPhoto", { chat_id: chatId, photo: url, caption });
    },
    sendInvoice: async (chatId, inv) => {
      await tg("sendInvoice", {
        chat_id: chatId,
        title: inv.title,
        description: inv.description,
        payload: inv.payload,
        currency: inv.currency,
        prices: inv.prices,
      });
    },
    answerPreCheckout: async (id, ok, errorMessage) => {
      const body = { pre_checkout_query_id: id, ok };
      if (!ok && errorMessage) body.error_message = errorMessage;
      await tg("answerPreCheckoutQuery", body);
    },
    answerCallback: async (id) => {
      try { await tg("answerCallbackQuery", { callback_query_id: id }); }
      catch (e) { /* a stale button tap must not break the flow */ }
    },
    fetchText: async (url) => {
      const r = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36" },
        redirect: "follow",
      });
      return { url: r.url, status: r.status, text: await r.text() };
    },
    // creds (BYOK) overrides the system base+key; the key value is only
    // ever placed in the Authorization header — never logged or echoed.
    // Failures carry .status so the caller can tell a provider's answer
    // about the user's own key apart from a generic outage.
    callAI: async (messages, model, creds) => {
      const base = creds && creds.base
        ? creds.base.replace(/\/+$/, "") : aiBase;
      const key = creds && creds.key ? creds.key : env.AI_API_KEY;
      const r = await fetch(base + "/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, messages }),
      });
      if (!r.ok) {
        const err = new Error("AI HTTP " + r.status);
        err.status = r.status;
        throw err;
      }
      const data = await r.json();
      const choice = data.choices && data.choices[0];
      const content = choice && choice.message && choice.message.content;
      if (!content) throw new Error("AI empty answer");
      return content;
    },
    // Light key check used before a BYOK key is saved: GET /models.
    testApiKey: async (base, key) => {
      let r;
      try {
        r = await fetch(base.replace(/\/+$/, "") + "/models", {
          method: "GET",
          headers: { "Authorization": "Bearer " + key },
        });
      } catch (e) {
        return { ok: false, reason: "unreachable" };
      }
      if (r.ok) return { ok: true };
      if (r.status === 401 || r.status === 403) {
        return { ok: false, reason: "rejected" };
      }
      return { ok: false, reason: "unreachable" };
    },
    genImage: async (prompt) => {
      const r = await fetch(aiBase + "/images/generations", {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + env.AI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: env.AI_IMAGE_MODEL, prompt, n: 1 }),
      });
      if (!r.ok) throw new Error("Image HTTP " + r.status);
      const data = await r.json();
      const item = data.data && data.data[0];
      if (!item || !item.url) throw new Error("Image empty answer");
      return item.url;
    },
    dispatch: async (jobId) => {
      const r = await fetch(
        `https://api.github.com/repos/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`, {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + env.GH_TOKEN,
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "wesio-worker",
          },
          body: JSON.stringify({ ref: "main", inputs: { job_id: jobId } }),
        });
      if (r.status !== 204) throw new Error("GitHub dispatch HTTP " + r.status);
    },
  };
}

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("wesio webhook aktif", { status: 200 });
    }
    if (env.WEBHOOK_SECRET) {
      const h = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (h !== env.WEBHOOK_SECRET) return new Response("forbidden", { status: 403 });
    }
    let update;
    try { update = await request.json(); } catch (e) {
      return new Response("bad json", { status: 400 });
    }
    const io = buatIo(env);
    ctx.waitUntil(handleUpdate(io, update).catch(e =>
      console.log("handleUpdate error:", e && e.message)));
    return new Response("ok", { status: 200 });
  },
};
