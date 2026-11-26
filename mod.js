// رقابة الديوانية 🛡️ — Gemini يفحص الرسايل (دفعات كل 20 ثانية) ويحدد المخالف
// متسامح مع المزح والكلام الدارج (انقلع، اسكت، يا ثقيل...) — يتدخل بس مع السب الصريح والكلام القذر
// العقوبات: تحذير ← تايم أوت بالتدريج (بدون طرد ولا باند أبدًا) • وكل شي ينرسل لصاحب السيرفر
const {
  SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits, MessageFlags, AttachmentBuilder,
} = require('discord.js');

const P = PermissionFlagsBits;
const KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.MOD_MODEL || process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const LOG_CH = '🛡️│سجل-الرقابة';
const DATA_CH = 'bot-mod-data';
const BATCH_MS = 20000;
const STRIKE_DAYS = 7;
// مدة التايم أوت حسب عدد المخالفات (بالدقائق) — أقصى شي يوم
const LADDER = { 1: [0, 0, 10, 30, 60, 180], 2: [10, 60, 180, 720, 1440], 3: [1440] };

let client = null;
let data = { on: true, strikes: {}, log: [] }; // strikes[uid] = [{t, lvl}]
let loaded = false; let dirty = false; let saving = false;
let queue = [];
const mark = () => { dirty = true; };
const getGuild = () => (process.env.GUILD_ID ? client.guilds.cache.get(process.env.GUILD_ID) : client.guilds.cache.first());
const isOwnerId = (g, uid) => uid === g.ownerId || String(process.env.OWNER_IDS || '').split(',').map((s) => s.trim()).includes(uid);

// ───────── الحفظ ─────────
async function hidden(g, name, staff = false) {
  let ch = g.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === name);
  if (!ch) {
    const ow = [
      { id: g.roles.everyone.id, deny: [P.ViewChannel] },
      { id: client.user.id, allow: [P.ViewChannel, P.SendMessages, P.AttachFiles, P.ReadMessageHistory, P.ManageMessages, P.EmbedLinks] },
    ];
    if (staff) for (const r of g.roles.cache.values()) if (!r.managed && r.permissions.has(P.Administrator)) ow.push({ id: r.id, allow: [P.ViewChannel, P.ReadMessageHistory] });
    ch = await g.channels.create({ name, type: ChannelType.GuildText, permissionOverwrites: ow });
  }
  return ch;
}
async function load(g) {
  try {
    const ch = await hidden(g, DATA_CH);
    const m = (await ch.messages.fetch({ limit: 10 })).filter((x) => x.author.id === client.user.id && x.attachments.size).first();
    if (m) data = { ...data, ...JSON.parse(await (await fetch(m.attachments.first().url)).text()) };
  } catch (e) { console.error('⚠️ mod load:', e.message); }
  loaded = true;
}
async function save() {
  if (!loaded || saving || !dirty) return;
  saving = true;
  try {
    const ch = await hidden(getGuild(), DATA_CH);
    const sent = await ch.send({ content: '💾 بيانات الرقابة — لا تحذف هذه الروم', files: [new AttachmentBuilder(Buffer.from(JSON.stringify(data)), { name: 'mod.json' })] });
    dirty = false;
    for (const m of (await ch.messages.fetch({ limit: 10 })).values()) if (m.id !== sent.id && m.author.id === client.user.id) await m.delete().catch(() => {});
  } catch (e) { console.error('⚠️ mod save:', e.message); }
  saving = false;
}

// ───────── Gemini ─────────
const RULES = `أنت مشرف رقابة في سيرفر ديسكورد عربي سعودي اسمه «الديوانية». جو السيرفر سوالف ومزح بين ربع.
بتجيك رسايل بصيغة JSON (id، اسم الكاتب، النص، والرسالة اللي قبلها في نفس الروم للسياق).
مهمتك تطلع بس الرسايل المخالفة فعلًا. كن **متسامح جدًا** مع المزح واللهجة.

مستويات المخالفة:
- 0 (تجاهل — هذا الأغلب): المزح، الطقطقة الخفيفة، الكلام الدارج مثل: انقلع، اسكت، وجع، يا ثقيل، يا دب، يا خبل، يا غبي بمزح، تف عليك بمزح، الله ياخذك بمزح، أذبحك/أقتلك بمزح، خلاص بلعتني. التذمر والعصبية بدون سب. أي شي مب واضح إنه سب حقيقي = 0.
- 1 (تحذير): سب صريح موجّه لشخص بنية إهانة (يا كلب، يا حمار، يا حيوان، يا حقير، يا زبالة...)، أو لفظ بذيء خفيف.
- 2 (كتم مؤقت): سب قذر أو جنسي صريح، سب الأهل أو الأم أو الأخت، سب الدين، عنصرية أو طائفية أو احتقار قبيلة/جنسية/مذهب، تهديد جدي، تحرش لفظي.
- 3 (خطير): ابتزاز، نشر معلومات شخصية لأحد، تحريض على إيذاء، محتوى جنسي فاضح أو استدراج قاصر.
لا تعاقب على: كلمات عادية تشبه السب، اقتباس سب لشكوى ("فلان سبني وقال كذا")، نقاش عن السب، أغاني أو أمثال.
رجّع JSON بس: مصفوفة عناصر فيها المخالفات فقط بالشكل {"id":"...","level":1|2|3,"reason":"سبب قصير بالعربي","word":"الكلمة المخالفة"}. إذا ما فيه مخالفات رجّع [].`;

async function judge(batch) {
  const body = {
    systemInstruction: { parts: [{ text: RULES }] },
    contents: [{ role: 'user', parts: [{ text: JSON.stringify(batch.map((m) => ({ id: m.id, author: m.name, text: m.text, before: m.before }))) }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0, maxOutputTokens: 800 },
  };
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  const arr = JSON.parse(text.replace(/^```(json)?|```$/g, '').trim() || '[]');
  return Array.isArray(arr) ? arr : [];
}

// ───────── العقوبة ─────────
function strikes(uid, lvl) {
  const now = Date.now();
  const list = (data.strikes[uid] || []).filter((s) => now - s.t < STRIKE_DAYS * 86400000);
  list.push({ t: now, lvl }); data.strikes[uid] = list; mark();
  return list.filter((s) => s.lvl === lvl).length;
}
async function punish(m, v) {
  const g = m.guild; const lvl = Math.min(3, Math.max(1, Number(v.level) || 1));
  const n = strikes(m.author.id, lvl);
  const ladder = LADDER[lvl]; const mins = ladder[Math.min(n - 1, ladder.length - 1)];
  const member = await g.members.fetch(m.author.id).catch(() => null);
  let action = '⚠️ تحذير';
  let deleted = false;
  if (lvl >= 2) { deleted = await m.delete().then(() => true).catch(() => false); }
  if (mins && member) {
    const ok = await member.timeout(mins * 60000, `رقابة الديوانية: ${v.reason}`).then(() => true).catch((e) => { console.error('⚠️ timeout:', e.message); return false; });
    action = ok ? `🔇 كتم ${mins >= 60 ? `${mins / 60} ساعة` : `${mins} دقيقة`}` : '⚠️ تحذير (ما قدرت أكتم — ناقص صلاحية)';
  }
  // تنبيه في الروم (يختفي بعد 15 ثانية) + خاص للعضو
  const note = lvl === 1 && !mins
    ? `⚠️ ${m.author} انتبه لكلامك — هذا تحذير ${n}/3 🙏 (السب ممنوع حتى لو زعلان)`
    : `🔇 ${m.author} انكتمت ${mins >= 60 ? `${mins / 60} ساعة` : `${mins} دقيقة`} بسبب: ${v.reason}`;
  m.channel.send({ content: note, allowedMentions: { users: [m.author.id] } }).then((x) => setTimeout(() => x.delete().catch(() => {}), 15000)).catch(() => {});
  m.author.send(`🛡️ رقابة الديوانية: ${action}\nالسبب: ${v.reason}\nرسالتك: «${m.content.slice(0, 300)}»\nإذا تشوف إنه غلط كلّم الإدارة من التذاكر 🎫`).catch(() => {});
  // السجل لصاحب السيرفر
  const entry = { t: Date.now(), u: m.author.id, tag: m.author.tag, ch: m.channel.id, text: m.content.slice(0, 500), lvl, reason: v.reason, word: v.word || '', action };
  data.log.push(entry); if (data.log.length > 300) data.log = data.log.slice(-300); mark();
  const color = lvl === 1 ? 0xf1c40f : lvl === 2 ? 0xe67e22 : 0xe74c3c;
  const e = new EmbedBuilder().setColor(color).setTitle(`🛡️ مخالفة مستوى ${lvl} — ${action}`)
    .setDescription(`**العضو:** ${m.author} (${m.author.tag})\n**الروم:** ${m.channel}\n**الرسالة:** ${m.content.slice(0, 900) || '—'}\n**السبب:** ${v.reason}${v.word ? `\n**الكلمة:** ||${v.word}||` : ''}\n**عدد مخالفاته (آخر ${STRIKE_DAYS} أيام):** ${data.strikes[m.author.id].length}${deleted ? '\n🗑️ انحذفت الرسالة' : `\n[🔗 الرسالة](${m.url})`}`)
    .setTimestamp();
  try { const log = await hidden(g, LOG_CH, true); await log.send({ embeds: [e], allowedMentions: { parse: [] } }); } catch (err) { console.error('⚠️ mod log:', err.message); }
  try { const owner = await client.users.fetch(g.ownerId); await owner.send({ embeds: [e] }); } catch { /* الخاص مقفل */ }
}

async function flush() {
  if (!queue.length || !KEY || !data.on) { queue = data.on ? queue : []; return; }
  const batch = queue.splice(0, 40);
  let verdicts;
  try { verdicts = await judge(batch); } catch (e) { console.error('⚠️ mod gemini:', e.message); return; }
  for (const v of verdicts) {
    const item = batch.find((b) => b.id === String(v.id));
    if (!item || !(Number(v.level) >= 1)) continue;
    await punish(item.msg, v).catch((e) => console.error('⚠️ punish:', e.message));
  }
}

const lastByCh = new Map();
function onMessage(m) {
  if (!data.on || !m.guild || m.author.bot || !m.content || m.content.length < 2) return;
  if (m.guild.id !== getGuild()?.id) return;
  if (isOwnerId(m.guild, m.author.id)) return;
  if (/^bot-|سجل-الرقابة/.test(m.channel.name || '')) return;
  const before = lastByCh.get(m.channelId) || '';
  lastByCh.set(m.channelId, `${m.member?.displayName || m.author.username}: ${m.content.slice(0, 160)}`);
  queue.push({ id: m.id, name: m.member?.displayName || m.author.username, text: m.content.slice(0, 400), before, msg: m });
  if (queue.length > 120) queue = queue.slice(-120);
}

// ───────── الأوامر (لصاحب السيرفر) ─────────
const commands = [
  new SlashCommandBuilder().setName('رقابة').setDescription('🛡️ رقابة الذكاء الاصطناعي (لصاحب السيرفر)')
    .setDefaultMemberPermissions(P.Administrator)
    .addSubcommand((s) => s.setName('حالة').setDescription('تشوف الرقابة شغالة ولا لا وآخر المخالفات'))
    .addSubcommand((s) => s.setName('تشغيل').setDescription('تشغّل الرقابة'))
    .addSubcommand((s) => s.setName('ايقاف').setDescription('توقف الرقابة'))
    .addSubcommand((s) => s.setName('سجل').setDescription('مخالفات عضو معين').addUserOption((o) => o.setName('عضو').setDescription('مين؟').setRequired(true)))
    .addSubcommand((s) => s.setName('عفو').setDescription('تمسح مخالفات عضو وتفك كتمه').addUserOption((o) => o.setName('عضو').setDescription('مين؟').setRequired(true)))
    .toJSON(),
];

async function handle(i) {
  if (!i.isChatInputCommand() || i.commandName !== 'رقابة') return false;
  const g = i.guild;
  if (!isOwnerId(g, i.user.id)) { await i.reply({ content: '👑 هذا الأمر لصاحب السيرفر بس.', flags: MessageFlags.Ephemeral }); return true; }
  const sub = i.options.getSubcommand();
  const me = g.members.me;
  if (sub === 'تشغيل' || sub === 'ايقاف') {
    data.on = sub === 'تشغيل'; mark();
    await i.reply({ content: data.on ? '🛡️ الرقابة شغالة' : '⏸️ الرقابة موقفة', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (sub === 'حالة') {
    const perms = [[P.ModerateMembers, 'الكتم (Timeout Members)'], [P.ManageMessages, 'حذف الرسايل (Manage Messages)']].map(([p, n]) => `${me.permissions.has(p) ? '✅' : '❌'} ${n}`).join('\n');
    const last = data.log.slice(-8).reverse().map((x) => `<t:${Math.floor(x.t / 1000)}:R> <@${x.u}> — م${x.lvl} — ${x.action}`).join('\n') || 'ما فيه مخالفات 👌';
    await i.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`🛡️ الرقابة ${data.on ? 'شغالة ✅' : 'موقفة ⏸️'}`)
      .setDescription(`**صلاحيات البوت:**\n${perms}\n${KEY ? '' : '❌ مفتاح Gemini ناقص\n'}\n**آخر المخالفات:**\n${last}\n\nكل مخالفة توصلك بالخاص وفي روم ${LOG_CH}`)], flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    return true;
  }
  const u = i.options.getUser('عضو');
  if (sub === 'سجل') {
    const list = data.log.filter((x) => x.u === u.id).slice(-10).reverse();
    await i.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`🛡️ سجل ${u.username}`)
      .setDescription(list.length ? list.map((x) => `<t:${Math.floor(x.t / 1000)}:R> • م${x.lvl} • ${x.action}\n> ${x.text.slice(0, 150)}\n_${x.reason}_`).join('\n\n') : 'نظيف 👌')], flags: MessageFlags.Ephemeral });
    return true;
  }
  if (sub === 'عفو') {
    delete data.strikes[u.id]; mark();
    const m = await g.members.fetch(u.id).catch(() => null);
    if (m?.isCommunicationDisabled()) await m.timeout(null, 'عفو من صاحب السيرفر').catch(() => {});
    await i.reply({ content: `🤍 عفيت عن ${u} — انمسحت مخالفاته${m?.isCommunicationDisabled?.() ? '' : ' وانفك كتمه'}`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    return true;
  }
  return true;
}

function init(c) {
  client = c;
  client.on('messageCreate', (m) => { try { onMessage(m); } catch { /* */ } });
  client.once('clientReady', async () => {
    const g = getGuild(); if (!g) return;
    await load(g);
    const me = g.members.me;
    if (!me.permissions.has(P.ModerateMembers)) console.log('🛡️ الرقابة: البوت يحتاج صلاحية Timeout Members');
    setInterval(() => flush().catch(() => {}), BATCH_MS).unref();
    setInterval(save, 30000).unref();
    console.log(`🛡️ الرقابة ${data.on ? 'شغالة' : 'موقفة'} (${MODEL})`);
  });
}

module.exports = { init, handle, commands, _test: { judge, RULES } };
