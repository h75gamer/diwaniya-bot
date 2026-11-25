// موقع الديوانية 🌐 — صفحة تعريف + فعاليات بدون تسجيل دخول
// يشتغل على نفس رابط البوت في Render، والرسومات تنحفظ في روم بالديسكورد
const http = require('http');
const fs = require('fs');
const path = require('path');
const { ChannelType, PermissionFlagsBits, AttachmentBuilder, EmbedBuilder } = require('discord.js');
const ED = require('./events-data');
const WD = require('./web-data');

const PORT = process.env.PORT || 3000;
const INVITE = process.env.INVITE_URL || 'https://discord.gg/Jd7PhFDARx';
const GALLERY_CH = '🎨│رسومات-الموقع';
const DATA_CH = 'bot-web-data';
const GAMES = { quiz: 'المسابقة', emoji: 'خمّن الإيموجي', scramble: 'رتّب الحروف', typing: 'أسرع كاتب', math: 'رياضيات سريعة', tf: 'صح ولا خطأ', riddle: 'الألغاز', proverb: 'كمّل المثل', memory: 'لعبة الذاكرة', reaction: 'سرعة رد الفعل', xo: 'إكس أو' };
const MAX_SCORE = { quiz: 100000, emoji: 100000, scramble: 100000, typing: 400, math: 100000, tf: 100000, riddle: 100000, proverb: 100000, memory: 100000, reaction: 100000, xo: 100000 };

let client = null;
let store = { top: {}, wyr: {}, plays: 0 };
let loaded = false;
let dirty = false;
let galleryCache = { at: 0, items: [] };
let countsCache = { at: 0, online: null, members: null };
const rate = new Map();

const CONTENT = JSON.stringify({
  trivia: [...ED.TRIVIA, ...WD.TRIVIA],
  emoji: [...ED.EMOJI, ...WD.EMOJI],
  words: [...ED.WORDS, ...WD.WORDS],
  sentences: [...ED.SENTENCES, ...WD.SENTENCES],
  wyr: [...ED.WYR, ...WD.WYR],
  tf: [...ED.TRUE_FALSE, ...WD.TRUE_FALSE],
  riddles: WD.RIDDLES,
  proverbs: WD.PROVERBS,
  draw: WD.DRAW,
});

function guild() {
  if (!client || !client.isReady()) return null;
  const id = process.env.GUILD_ID;
  return (id && client.guilds.cache.get(id)) || client.guilds.cache.first();
}
const textCh = (g, name) => g.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === name);

function ipOf(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
}
function limited(key, ms, max = 1) {
  const now = Date.now();
  const arr = (rate.get(key) || []).filter((t) => now - t < ms);
  if (arr.length >= max) { rate.set(key, arr); return true; }
  arr.push(now); rate.set(key, arr);
  return false;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of rate) if (!v.some((t) => now - t < 3600000)) rate.delete(k); }, 600000);

function cleanName(s) {
  let n = String(s || '').replace(/[\u0000-\u001f<>@#`*_~|\\]/g, '').replace(/https?:\/\/\S+|discord\.gg\S*|www\.\S+/gi, '').trim().slice(0, 20);
  if (!n) n = 'زائر';
  return n;
}
function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

// ───────── الحفظ في روم مخفية ─────────
async function dataChannel(g) {
  let ch = textCh(g, DATA_CH);
  if (!ch) {
    ch = await g.channels.create({
      name: DATA_CH, type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: g.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages] },
      ],
    });
  }
  return ch;
}
async function load() {
  const g = guild(); if (!g) return;
  try {
    const ch = await dataChannel(g);
    const msgs = await ch.messages.fetch({ limit: 10 });
    const m = msgs.filter((x) => x.author.id === client.user.id && x.attachments.size).first();
    if (m) store = { ...store, ...JSON.parse(await (await fetch(m.attachments.first().url)).text()) };
  } catch (e) { console.error('⚠️ web load:', e.message); }
  loaded = true;
}
async function save() {
  const g = guild(); if (!g || !loaded || !dirty) return;
  try {
    const ch = await dataChannel(g);
    const sent = await ch.send({ content: '💾 بيانات الموقع — لا تحذف هذه الروم', files: [new AttachmentBuilder(Buffer.from(JSON.stringify(store)), { name: 'web.json' })] });
    dirty = false;
    const old = await ch.messages.fetch({ limit: 10 });
    for (const x of old.values()) if (x.id !== sent.id && x.author.id === client.user.id) await x.delete().catch(() => {});
  } catch (e) { console.error('⚠️ web save:', e.message); }
}

// ───────── معرض الرسومات (روم ديسكورد) ─────────
async function galleryChannel(g) {
  let ch = textCh(g, GALLERY_CH);
  if (!ch) {
    const cat = g.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === '🎯 الفعاليات');
    ch = await g.channels.create({
      name: GALLERY_CH, type: ChannelType.GuildText, parent: cat?.id,
      topic: 'رسومات الزوار من موقع الديوانية 🎨 — الإدارة تحذف أي رسمة مخالفة',
      permissionOverwrites: [
        { id: g.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions], deny: [PermissionFlagsBits.SendMessages] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions] },
      ],
    });
  }
  return ch;
}
async function galleryList() {
  if (Date.now() - galleryCache.at < 30000) return galleryCache.items;
  const g = guild(); if (!g) return galleryCache.items;
  const ch = textCh(g, GALLERY_CH);
  if (!ch) return [];
  const msgs = await ch.messages.fetch({ limit: 40 }).catch(() => null);
  const items = [];
  for (const m of (msgs ? msgs.values() : [])) {
    if (m.author.id !== client.user.id) continue;
    const img = m.embeds[0]?.image?.url || m.attachments.first()?.url;
    if (!img) continue;
    const likes = m.reactions.cache.get('❤️')?.count || 0;
    items.push({ url: img, name: m.embeds[0]?.author?.name || 'زائر', prompt: m.embeds[0]?.title?.replace(/^🎨\s*/, '') || '', ts: m.createdTimestamp, likes: Math.max(0, likes - 1) });
  }
  galleryCache = { at: Date.now(), items };
  return items;
}

// ───────── الطلبات ─────────
async function api(req, res, url) {
  const ip = ipOf(req);
  const p = url.pathname;

  if (p === '/api/content') return send(res, 200, CONTENT);

  if (p === '/api/info') {
    const g = guild();
    let online = null;
    if (g) {
      if (Date.now() - countsCache.at > 300000) {
        const full = await g.fetch().catch(() => null);
        countsCache = { at: Date.now(), online: full?.approximatePresenceCount ?? null, members: full?.approximateMemberCount ?? g.memberCount };
      }
      online = countsCache.online;
    }
    return send(res, 200, {
      name: g?.name || 'ديوانية 🌙 | Diwaniya',
      members: g ? g.memberCount : null,
      online,
      icon: g?.iconURL({ size: 256 }) || null,
      invite: INVITE,
      plays: store.plays || 0,
    });
  }

  if (p === '/api/top' && req.method === 'GET') {
    const game = url.searchParams.get('game');
    if (!GAMES[game]) return send(res, 400, { error: 'game' });
    return send(res, 200, { game, top: (store.top[game] || []).slice(0, 10) });
  }

  if (p === '/api/score' && req.method === 'POST') {
    if (limited(`s:${ip}`, 60000, 12)) return send(res, 429, { error: 'هدّي شوي 😅' });
    const b = await readBody(req, 2000).catch(() => null);
    if (!b || !GAMES[b.game]) return send(res, 400, { error: 'bad' });
    const score = Math.floor(Number(b.score));
    if (!Number.isFinite(score) || score <= 0 || score > MAX_SCORE[b.game]) return send(res, 400, { error: 'score' });
    const name = cleanName(b.name);
    const list = store.top[b.game] || [];
    const prev = list.find((x) => x.name === name);
    if (prev) { if (score > prev.score) { prev.score = score; prev.ts = Date.now(); } } else list.push({ name, score, ts: Date.now() });
    list.sort((a, c) => c.score - a.score);
    store.top[b.game] = list.slice(0, 50);
    store.plays = (store.plays || 0) + 1;
    dirty = true;
    const rank = store.top[b.game].findIndex((x) => x.name === name) + 1;
    return send(res, 200, { ok: true, rank });
  }

  if (p === '/api/wyr' && req.method === 'GET') return send(res, 200, store.wyr || {});
  if (p === '/api/wyr' && req.method === 'POST') {
    if (limited(`w:${ip}`, 60000, 30)) return send(res, 429, { error: 'هدّي شوي 😅' });
    const b = await readBody(req, 500).catch(() => null);
    const id = Number(b?.id); const opt = Number(b?.opt);
    if (!Number.isInteger(id) || id < 0 || id > 500 || (opt !== 0 && opt !== 1)) return send(res, 400, { error: 'bad' });
    const v = store.wyr[id] || [0, 0];
    v[opt]++;
    store.wyr[id] = v;
    dirty = true;
    return send(res, 200, { votes: v });
  }

  if (p === '/api/gallery' && req.method === 'GET') return send(res, 200, { items: await galleryList().catch(() => []) });
  if (p === '/api/gallery' && req.method === 'POST') {
    if (limited(`g:${ip}`, 120000, 1)) return send(res, 429, { error: 'تقدر ترسل رسمة وحدة كل دقيقتين ⏳' });
    const b = await readBody(req, 1600000).catch(() => null);
    const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(b?.image || '');
    if (!m) return send(res, 400, { error: 'الصورة ما وصلت صح' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length < 500 || buf.length > 1100000) return send(res, 400, { error: 'حجم الرسمة غير مناسب' });
    const g = guild();
    if (!g) return send(res, 503, { error: 'البوت يصحى، جرّب بعد شوي 🌙' });
    const name = cleanName(b.name);
    const prompt = String(b.prompt || 'رسمة حرّة').replace(/[<>@`]/g, '').slice(0, 60);
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    try {
      const ch = await galleryChannel(g);
      const file = new AttachmentBuilder(buf, { name: `drawing.${ext}` });
      const msg = await ch.send({
        embeds: [new EmbedBuilder().setColor(0xf5b942).setAuthor({ name }).setTitle(`🎨 ${prompt}`)
          .setImage(`attachment://drawing.${ext}`).setFooter({ text: 'من موقع الديوانية 🌐 — حطوا ❤️ للرسمة اللي عجبتكم' }).setTimestamp()],
        files: [file], allowedMentions: { parse: [] },
      });
      await msg.react('❤️').catch(() => {});
      galleryCache.at = 0;
      return send(res, 200, { ok: true });
    } catch (e) {
      console.error('⚠️ gallery post:', e.message);
      return send(res, 500, { error: 'ما قدرت أحفظ الرسمة 😓' });
    }
  }
  return send(res, 404, { error: 'not found' });
}

let pageCache = null;
function page() {
  if (!pageCache || process.env.NODE_ENV === 'development') pageCache = fs.readFileSync(path.join(__dirname, 'web', 'index.html'));
  return pageCache;
}

function start() {
  http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (url.pathname.startsWith('/api/')) return await api(req, res, url);
      if (url.pathname === '/health') return send(res, 200, '🌙 بوت الديوانية شغّال', 'text/plain; charset=utf-8');
      if (url.pathname === '/' || url.pathname === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' });
        return res.end(page());
      }
      res.writeHead(302, { Location: '/' }); res.end();
    } catch (e) {
      console.error('⚠️ web:', e.message);
      if (!res.headersSent) send(res, 500, { error: 'server' });
    }
  }).listen(PORT, () => console.log(`🌐 موقع الديوانية شغّال على ${PORT}`));
}

function init(c) {
  client = c;
  start();
  client.once('clientReady', async () => {
    await load();
    const g = guild();
    if (g) await galleryChannel(g).catch((e) => console.error('⚠️ gallery ch:', e.message));
    setInterval(() => save().catch(() => {}), 2 * 60 * 1000);
    console.log('🎨 الموقع والمعرض جاهزين');
  });
  process.on('SIGTERM', () => { save().catch(() => {}); });
}

module.exports = { init };
