// ملصقات الديوانية 🎨 — كلها رسم أصلي (SVG) تتحول PNG وتنرفع للسيرفر بأمر /ملصقات
// • 5 خاصة بالسيرفر (رسم أصلي)  • الباقي مفيدة وميمز من Microsoft Fluent Emoji (MIT — حرة الاستخدام) مع تعليق بلهجتنا
const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require('discord.js');

const INK = '#3b2414';
const FONTS = {
  Lalezar: 'https://raw.githubusercontent.com/google/fonts/main/ofl/lalezar/Lalezar-Regular.ttf',
  Tajawal: 'https://raw.githubusercontent.com/google/fonts/main/ofl/tajawal/Tajawal-ExtraBold.ttf',
};

// ───────── قطع الرسم ─────────
const DEFS = `<defs>
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fde7a8"/><stop offset=".5" stop-color="#e0a840"/><stop offset="1" stop-color="#9a641f"/></linearGradient>
<linearGradient id="cup" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#f6efe2"/><stop offset="1" stop-color="#e3d5bd"/></linearGradient>
<linearGradient id="red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c0392b"/><stop offset="1" stop-color="#7d1a14"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#ffd27a" stop-opacity=".95"/><stop offset=".5" stop-color="#ffb347" stop-opacity=".35"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
<pattern id="sadu" width="28" height="14" patternUnits="userSpaceOnUse"><rect width="28" height="14" fill="#9b1d20"/><rect width="28" height="2" fill="#efe0c4"/><rect y="12" width="28" height="2" fill="#efe0c4"/><path d="M0 12 7 3l7 9zM14 12l7-9 7 9z" fill="#1a0e09"/><circle cx="7" cy="9" r="1.4" fill="#efe0c4"/><circle cx="21" cy="9" r="1.4" fill="#efe0c4"/></pattern>
<filter id="o" x="-10%" y="-10%" width="120%" height="120%"><feMorphology in="SourceAlpha" operator="dilate" radius="7" result="d"/><feFlood flood-color="#ffffff"/><feComposite in2="d" operator="in" result="w"/><feOffset in="d" dy="4" result="s0"/><feFlood flood-color="#000" flood-opacity=".28"/><feComposite in2="s0" operator="in" result="s"/><feMerge><feMergeNode in="s"/><feMergeNode in="w"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>`;

const st = `stroke="${INK}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"`;

// فنجان: شخصية الديوانية — face = عيون/فم حسب التعبير
function finjan(face = '', { x = 0, y = 0, s = 1, extra = '' } = {}) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M78 66 Q86 172 118 202 H202 Q234 172 242 66 Z" fill="url(#cup)" ${st}/>
  <path d="M96 168 Q160 184 224 168" fill="none" stroke="#2fa58f" stroke-width="7"/>
  <path d="M90 150 Q160 166 230 150" fill="none" stroke="url(#gold)" stroke-width="4"/>
  <ellipse cx="160" cy="66" rx="82" ry="17" fill="#8a5521" ${st}/>
  <ellipse cx="160" cy="68" rx="70" ry="11" fill="#c98b3b"/>
  <ellipse cx="160" cy="66" rx="82" ry="17" fill="none" stroke="url(#gold)" stroke-width="4"/>
  ${face}${extra}</g>`;
}
const blush = '<ellipse cx="118" cy="132" rx="13" ry="7" fill="#f28b82" opacity=".7"/><ellipse cx="202" cy="132" rx="13" ry="7" fill="#f28b82" opacity=".7"/>';
const eyesDot = (dx = 0) => `<circle cx="${135 + dx}" cy="112" r="9" fill="${INK}"/><circle cx="${185 + dx}" cy="112" r="9" fill="${INK}"/><circle cx="${138 + dx}" cy="109" r="3" fill="#fff"/><circle cx="${188 + dx}" cy="109" r="3" fill="#fff"/>`;
const FACES = {
  happy: `<path d="M124 114q11-14 22 0M174 114q11-14 22 0" fill="none" ${st}/><path d="M140 130q20 26 40 0z" fill="#7a2418" ${st}/>${blush}`,
  laugh: `<path d="M122 104l18 9-18 9M198 104l-18 9 18 9" fill="none" ${st}/><path d="M132 128q28 46 56 0z" fill="#7a2418" ${st}/><path d="M146 140q14 10 28 0" fill="#f28b82"/><path d="M104 120q-14 18 -4 28q12-4 4-28z" fill="#5ec8f2" stroke="#2b7fa8" stroke-width="3"/><path d="M216 120q14 18 4 28q-12-4-4-28z" fill="#5ec8f2" stroke="#2b7fa8" stroke-width="3"/>`,
  smile: `${eyesDot()}<path d="M140 134q20 20 40 0" fill="none" ${st}/>${blush}`,
  calm: `<path d="M124 112q11 9 22 0M174 112q11 9 22 0" fill="none" ${st}/><path d="M142 136q18 14 36 0" fill="none" ${st}/>${blush}`,
};
const hand = (x, y, r = 0) => `<g transform="translate(${x} ${y}) rotate(${r})"><ellipse cx="0" cy="0" rx="17" ry="20" fill="#fff4e0" ${st}/><path d="M-6 -6v10M4 -7v10" stroke="${INK}" stroke-width="3" stroke-linecap="round"/></g>`;
const steamS = (x, y) => `<path d="M${x} ${y}q-10-12 0-24t0-24" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" opacity=".95"/><path d="M${x} ${y}q-10-12 0-24t0-24" fill="none" stroke="#c8b8a4" stroke-width="2.5" stroke-linecap="round"/>`;
const star = (x, y, r, c = '#f6c544') => `<path d="M${x} ${y - r}l${r * .29} ${r * .6} ${r * .66} ${r * .1}-${r * .48} ${r * .46} ${r * .12} ${r * .65}-${r * .59}-${r * .31}-${r * .59} ${r * .31} ${r * .12}-${r * .65}-${r * .48}-${r * .46} ${r * .66}-${r * .1}z" fill="${c}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
const confetti = `<g stroke="${INK}" stroke-width="2.5"><rect x="34" y="40" width="14" height="8" rx="2" fill="#e74c3c" transform="rotate(30 41 44)"/><rect x="262" y="48" width="14" height="8" rx="2" fill="#2fa58f" transform="rotate(-25 269 52)"/><rect x="48" y="150" width="12" height="7" rx="2" fill="#f6c544" transform="rotate(-40 54 153)"/><rect x="270" y="150" width="12" height="7" rx="2" fill="#8e44ad" transform="rotate(40 276 153)"/><circle cx="90" cy="24" r="6" fill="#3498db"/><circle cx="232" cy="22" r="6" fill="#f6c544"/></g>`;

function dallah(x = 0, y = 0, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M60 120Q30 104 22 64Q20 50 6 44l-4 8q12 5 12 16 4 44 38 66z" fill="url(#gold)" ${st}/>
  <path d="M56 210Q36 166 54 128Q66 104 86 100Q106 104 118 128Q136 166 116 210z" fill="url(#gold)" ${st}/>
  <path d="M72 100l4-30h20l4 30z" fill="url(#gold)" ${st}/>
  <path d="M66 70q20-38 40 0z" fill="url(#gold)" ${st}/><circle cx="86" cy="40" r="7" fill="#fde7a8" ${st}/>
  <path d="M118 116q34 4 30 40-4 26-30 30" fill="none" stroke="${INK}" stroke-width="13" stroke-linecap="round"/>
  <path d="M118 116q34 4 30 40-4 26-30 30" fill="none" stroke="url(#gold)" stroke-width="7" stroke-linecap="round"/>
  <path d="M60 150h52" stroke="#9a641f" stroke-width="3"/><path d="M66 176h42" stroke="#9a641f" stroke-width="3"/></g>`;
}
function lantern(x, y, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="70" r="70" fill="url(#glow)"/>
  <path d="M-18 0h36l9 18h-54z" fill="url(#gold)" ${st}/><rect x="-26" y="18" width="52" height="74" rx="10" fill="#ffd47e" ${st}/>
  <path d="M-9 18v74M9 18v74" stroke="#9a641f" stroke-width="3"/><path d="M-26 92h52l-10 16h-32z" fill="url(#gold)" ${st}/><circle cx="0" cy="-8" r="8" fill="none" stroke="${INK}" stroke-width="4"/></g>`;
}
function trophy(x, y, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-48 10h-26q0 44 34 46M48 10h26q0 44-34 46" fill="none" stroke="${INK}" stroke-width="12"/><path d="M-48 10h-26q0 44 34 46M48 10h26q0 44-34 46" fill="none" stroke="url(#gold)" stroke-width="6"/>
  <path d="M-52 0h104q0 76-52 92q-52-16-52-92z" fill="url(#gold)" ${st}/><rect x="-12" y="90" width="24" height="26" fill="url(#gold)" ${st}/>
  <rect x="-42" y="114" width="84" height="24" rx="6" fill="#5a2a10" ${st}/>${star(0, 40, 22, '#fff4c4')}</g>`;
}

// النص: خط عريض بحد غامق (شكل ملصقات)
function label(text, { y = 288, size = 56, fill = '#ffd56b', font = 'Lalezar', stroke = INK } = {}) {
  return `<text x="160" y="${y}" text-anchor="middle" font-family="${font}" font-size="${size}" fill="${fill}" stroke="${stroke}" stroke-width="${Math.round(size / 5)}" stroke-linejoin="round" paint-order="stroke">\u200F${text}\u200F</text>`;
}
const svg = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320">${DEFS}<g filter="url(#o)">${inner}</g></svg>`;

// ───────── الملصقات ─────────
// kind: server | useful | meme — الترتيب = الأولوية (لو الخانات قليلة ينرفع الأهم أول)
const LIST = [
  // ✦ خاصة بالسيرفر
  { kind: 'server', name: 'حياك بالديوانية', tag: '☕', desc: 'ترحيب الديوانية', art: () => `${dallah(20, 12, .95)}${finjan(FACES.happy, { x: 118, y: 52, s: .62 })}${steamS(218, 78)}${label('حيّاك بالديوانية', { size: 46 })}` },
  { kind: 'server', name: 'يلا فعالية', tag: '🎉', desc: 'يلا كلكم للفعالية', art: () => `${confetti}${lantern(76, 24, .95)}${finjan(FACES.laugh.replace(/<path d="M10[46][^>]*>/g, ''), { x: 88, y: 28, s: .78, extra: hand(250, 70, 20) + hand(70, 70, -20) })}${label('يلا فعالية!', { size: 60, fill: '#ff8a5c' })}` },
  { kind: 'server', name: 'صدر المجلس', tag: '🏆', desc: 'الفايز في صدر المجلس', art: () => `<rect x="40" y="196" width="240" height="36" rx="12" fill="url(#sadu)" ${st}/>${star(64, 56, 18)}${star(258, 74, 14)}${trophy(160, 54, 1)}${label('صدر المجلس', { size: 56 })}` },
  { kind: 'server', name: 'القهوة جاهزة', tag: '☕', desc: 'تفضلوا القهوة', art: () => `<g transform="rotate(28 110 110)"><g transform="translate(176 -6) scale(-1 1)">${dallah(0, 0, 1)}</g></g>${finjan(FACES.smile, { x: 118, y: 96, s: .6 })}<path d="M200 70q14 18 10 64" fill="none" stroke="${INK}" stroke-width="11" stroke-linecap="round"/><path d="M200 70q14 18 10 64" fill="none" stroke="#a0662a" stroke-width="6" stroke-linecap="round"/>${label('القهوة جاهزة', { size: 54 })}` },
  { kind: 'server', name: 'ديوانية', tag: '🌙', desc: 'شعار الديوانية', art: () => `<path d="M60 236V112Q60 26 160 10Q260 26 260 112V236Z" fill="#1b2a4e" ${st}/><path d="M60 236V112Q60 26 160 10Q260 26 260 112V236" fill="none" stroke="url(#gold)" stroke-width="7"/><circle cx="198" cy="70" r="26" fill="#f6dc93"/><circle cx="210" cy="62" r="23" fill="#1b2a4e"/>${star(104, 60, 8, '#fff')}${star(132, 100, 5, '#fff')}<rect x="48" y="200" width="224" height="40" rx="10" fill="url(#sadu)" ${st}/>${finjan(FACES.calm, { x: 102, y: 72, s: .36 })}${label('ديوانية', { size: 72, y: 298 })}` },
  // ✦ مجانية — Microsoft Fluent Emoji (رخصة MIT، مسموح استخدامها) + تعليق بلهجتنا
  ...[
    ['useful', 'السلام عليكم', '👋', 'Waving hand|waving_hand|d', 'السلام عليكم', '#8ee6c9'],
    ['useful', 'وعليكم السلام', '🤝', 'Handshake|handshake', 'وعليكم السلام', '#8ee6c9'],
    ['useful', 'صباح الخير', '☀️', 'Sun with face|sun_with_face', 'صباح الخير', '#ffd56b'],
    ['useful', 'مساء الخير', '🌙', 'Crescent moon|crescent_moon', 'مساء الخير', '#c9b8ff'],
    ['useful', 'تم', '✅', 'Check mark button|check_mark_button', 'تم!', '#b6f5cf'],
    ['useful', 'دقيقة وراجع', '⏳', 'Hourglass not done|hourglass_not_done', 'دقيقة وراجع', '#ffd56b'],
    ['useful', 'يعطيك العافية', '🙏', 'Folded hands|folded_hands|d', 'يعطيك العافية', '#ffb3a7'],
    ['useful', 'ألف مبروك', '🎉', 'Party popper|party_popper', 'ألف مبروك', '#ff8a5c'],
    ['useful', 'أبشر', '👍', 'Thumbs up|thumbs_up|d', 'أبشر بعزك', '#ffd56b'],
    ['useful', 'معليش', '❤️', 'Red heart|red_heart', 'معليش', '#ffb3a7'],
    ['useful', 'تصبحون على خير', '😴', 'Sleeping face|sleeping_face', 'تصبحون على خير', '#c9b8ff'],
    ['meme', 'ههههههه', '😂', 'Face with tears of joy|face_with_tears_of_joy', 'ههههههههه', '#ffd56b'],
    ['meme', 'طيب', '🤨', 'Face with raised eyebrow|face_with_raised_eyebrow', 'طيب؟', '#ffffff'],
    ['meme', 'أفا', '😒', 'Unamused face|unamused_face', 'أفا عليك!', '#ff8a5c'],
    ['meme', 'لااا', '😱', 'Face screaming in fear|face_screaming_in_fear', 'لاااا!', '#ff6b6b'],
    ['meme', 'قول والله', '😳', 'Flushed face|flushed_face', 'قول والله؟', '#ffb3a7'],
    ['meme', 'يا صبر', '🙄', 'Face with rolling eyes|face_with_rolling_eyes', 'يا صبر الأرض', '#c9b8ff'],
    ['meme', 'مالي خلق', '🫠', 'Melting face|melting_face', 'مالي خلق', '#ffd56b'],
    ['meme', 'مت ضحك', '💀', 'Skull|skull', 'متّ ضحك', '#ffffff'],
    ['meme', 'صج', '👀', 'Eyes|eyes', 'صج؟', '#ffffff'],
    ['meme', 'ضحكت علي', '🤡', 'Clown face|clown_face', 'ضحكت علي!', '#ff6b6b'],
    ['meme', 'متى الراتب', '💸', 'Money with wings|money_with_wings', 'متى الراتب؟', '#8ee6c9'],
    ['meme', 'الله يهديك', '🤦', 'Person facepalming|person_facepalming|d', 'الله يهديك', '#ffd56b'],
  ].map(([kind, name, tag, emoji, text, fill]) => ({ kind, name, tag, desc: text, emoji, text, fill })),
];

const LIMIT = { 0: 5, 1: 15, 2: 30, 3: 60 };

// ───────── التحويل لـ PNG ─────────
let fontCache = null;
async function fonts() {
  if (fontCache) return fontCache;
  const fs = require('fs'); const path = require('path'); const os = require('os');
  const dir = path.join(os.tmpdir(), 'diwaniya-fonts'); fs.mkdirSync(dir, { recursive: true });
  const files = [];
  for (const [n, url] of Object.entries(FONTS)) {
    const f = path.join(dir, `${n}.ttf`);
    if (!fs.existsSync(f) || fs.statSync(f).size < 10000) {
      const r = await fetch(url); if (!r.ok) throw new Error(`font ${n} ${r.status}`);
      fs.writeFileSync(f, Buffer.from(await r.arrayBuffer()));
    }
    files.push(f);
  }
  return (fontCache = files);
}
const EMOJI_BASE = 'https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/';
async function emojiPng(spec) {
  const [dir, file, d] = spec.split('|');
  const url = EMOJI_BASE + encodeURIComponent(dir) + (d ? '/Default/3D/' + file + '_3d_default.png' : '/3D/' + file + '_3d.png');
  const r = await fetch(url); if (!r.ok) throw new Error(`emoji ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
async function render(item, fontFiles) {
  const { Resvg } = require('@resvg/resvg-js');
  let inner;
  if (item.emoji) {
    const b64 = (await emojiPng(item.emoji)).toString('base64');
    const size = item.text.length > 10 ? 50 : item.text.length > 7 ? 58 : 66;
    inner = `<image href="data:image/png;base64,${b64}" x="55" y="8" width="210" height="210"/>${label(item.text, { size, fill: item.fill })}`;
  } else inner = item.art();
  const r = new Resvg(svg(inner), { fitTo: { mode: 'width', value: 320 }, font: { fontFiles: fontFiles || await fonts(), loadSystemFonts: false, defaultFontFamily: 'Lalezar' } });
  return r.render().asPng();
}

// ───────── الأمر ─────────
const commands = [
  new SlashCommandBuilder().setName('ملصقات').setDescription('🎨 يضيف ملصقات الديوانية للسيرفر (لصاحب السيرفر)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator).toJSON(),
];

// يضيف الناقص حسب الخانات المتاحة (الأهم أول)
async function sync(g) {
  const me = g.members.me || await g.members.fetchMe();
  const P = PermissionFlagsBits;
  if (!me.permissions.has(P.ManageGuildExpressions) && !(P.CreateGuildExpressions && me.permissions.has(P.CreateGuildExpressions))) return { noPerm: true };
  const existing = await g.stickers.fetch();
  const have = new Set(existing.map((x) => x.name));
  let free = (LIMIT[g.premiumTier] ?? 5) - existing.size;
  const done = []; const skipped = []; const failed = [];
  const ff = await fonts();
  // الترتيب: الخاصة أول، بعدين مفيد وميم بالتناوب عشان لو الخانات قليلة يجي خليط
  const U = LIST.filter((x) => x.kind === 'useful'); const M = LIST.filter((x) => x.kind === 'meme');
  const order = LIST.filter((x) => x.kind === 'server');
  for (let k = 0; k < Math.max(U.length, M.length); k++) { if (U[k]) order.push(U[k]); if (M[k]) order.push(M[k]); }
  for (const it of order) {
    if (have.has(it.name)) continue;
    if (free <= 0) { skipped.push(it); continue; }
    try {
      const png = await render(it, ff);
      await g.stickers.create({ file: png, name: it.name, tags: it.tag, description: it.desc, reason: 'ملصقات الديوانية' });
      done.push(it); free--;
    } catch (e) { failed.push(`${it.name}: ${e.message}`); console.error('⚠️ sticker', it.name, e.message); }
  }
  return { done, skipped, failed, tier: g.premiumTier };
}

async function handle(i) {
  if (!i.isChatInputCommand() || i.commandName !== 'ملصقات') return false;
  const ECO = require('./economy');
  if (!ECO.isOwner(i)) { await i.reply({ content: '👑 هذا الأمر لصاحب السيرفر بس.', flags: MessageFlags.Ephemeral }); return true; }
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  let r;
  try { r = await sync(i.guild); } catch (e) { await i.editReply(`⚠️ صار خطأ: ${e.message}`); return true; }
  if (r.noPerm) { await i.editReply('⚠️ البوت ما عنده صلاحية **إدارة التعبيرات (Manage Expressions)**.\nإعدادات السيرفر ← الرتب ← رتبة البوت ← فعّلها، وبعدين عيد /ملصقات'); return true; }
  const kinds = { server: '🏠 خاصة بالسيرفر', useful: '💬 مفيدة', meme: '😂 ميمز' };
  const list = (arr) => Object.keys(kinds).map((k) => { const a = arr.filter((x) => x.kind === k); return a.length ? `${kinds[k]}: ${a.map((x) => x.name).join('، ')}` : ''; }).filter(Boolean).join('\n');
  const lim = LIMIT[r.tier] ?? 5;
  const e = new EmbedBuilder().setColor(0xd9a441).setTitle('🎨 ملصقات الديوانية')
    .setDescription([
      r.done.length ? `✅ **انضاف ${r.done.length}:**\n${list(r.done)}` : '✅ ما فيه جديد — كل اللي يتسع موجود.',
      r.skipped.length ? `\n🔒 **باقي ${r.skipped.length} ما لها مكان** — مستوى البوست ${r.tier} يسمح بـ ${lim} ملصق بس (لفل 1 = 15، لفل 2 = 30). أول ما يزيد البوست تنضاف لحالها:\n${list(r.skipped)}` : '',
      r.failed.length ? `\n⚠️ **ما انضاف:**\n${r.failed.slice(0, 8).join('\n')}` : '',
    ].join('\n').slice(0, 4000))
    .setFooter({ text: 'الملصقات المفيدة والميمز من Microsoft Fluent Emoji (رخصة MIT)' });
  await i.editReply({ embeds: [e] });
  return true;
}

// تلقائي: بعد التشغيل بشوي، وكل 6 ساعات (لو زاد البوست تنضاف الباقية لحالها)
function init(client) {
  const run = async () => {
    const id = process.env.GUILD_ID; const g = id ? client.guilds.cache.get(id) : client.guilds.cache.first();
    if (!g) return;
    try {
      const r = await sync(g);
      if (r.noPerm) console.log('🎨 الملصقات: البوت يحتاج صلاحية Manage Expressions');
      else if (r.done.length || r.failed.length) console.log(`🎨 الملصقات: انضاف ${r.done.length} • ما له مكان ${r.skipped.length} • فشل ${r.failed.length}`);
    } catch (e) { console.error('⚠️ stickers:', e.message); }
  };
  client.once('clientReady', () => { setTimeout(run, 30000); setInterval(run, 6 * 3600 * 1000); });
}

module.exports = { init, handle, commands, LIST, render, svg };
