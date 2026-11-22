// فعاليات الديوانية 🎯 — مستويات (XP) + تحديات يومية تلقائية + لعبة العد + اعترافات مجهولة + المكافأة اليومية
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits,
  SlashCommandBuilder, MessageFlags, AttachmentBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const D = require('./events-data');

const TZ = 'Asia/Riyadh';
const COLOR = 0x9b59b6;
const CATEGORY = '🎯 الفعاليات';
const CH = {
  challenges: '🎯│تحديات',
  levels: '🆙│المستويات',
  counting: '🔢│العد',
  confess: '🤫│اعترافات',
  data: 'bot-events-data',
};
// أوقات التحديات اليومية (بتوقيت الرياض)
const CHALLENGE_HOURS = (process.env.CHALLENGE_HOURS || '13,17,20,22').split(',').map(Number);
const CHALLENGE_MINUTES = 15; // مدة التحدي
const WEEKLY_DAY = 'Fri';
const WEEKLY_HOUR = 21;
// رتب المستويات
const LEVEL_ROLES = [
  [5, '🌱 مستوى 5', 0x2ecc71],
  [10, '🌿 مستوى 10', 0x27ae60],
  [20, '🌳 مستوى 20', 0x16a085],
  [30, '⭐ مستوى 30', 0xf1c40f],
  [50, '🌟 مستوى 50', 0xe67e22],
];
const CHAMP_ROLE = '👑 بطل الأسبوع';
const POINTS = 10;      // نقاط الفوز بالتحدي
const WIN_XP = 50;      // XP إضافي للفايز
const PLAY_XP = 5;      // XP للمشاركة في «لو خيروك»

let client = null;
let data = { xp: {}, week: {}, weekStart: '', daily: {}, count: { n: 0, last: null, best: 0 }, confN: 0, sent: {} };
let loaded = false;
let dirty = false;
let saving = false;
const msgCooldown = new Map();
const confessCooldown = new Map();
let active = null;            // التحدي الحالي
const wyrVotes = new Map();   // messageId -> [Set, Set]

// ───────── أدوات ─────────
function riyadh(date = new Date()) {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(date)) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute), weekday: p.weekday };
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
const AR_DIGITS = '\u0660\u0661\u0662\u0663\u0664\u0665\u0666\u0667\u0668\u0669';
const FA_DIGITS = '\u06f0\u06f1\u06f2\u06f3\u06f4\u06f5\u06f6\u06f7\u06f8\u06f9';
function digits(s) {
  return s.replace(/[\u0660-\u0669]/g, (d) => AR_DIGITS.indexOf(d)).replace(/[\u06f0-\u06f9]/g, (d) => FA_DIGITS.indexOf(d));
}
// توحيد الكتابة العربية عشان المقارنة تكون مرنة
function norm(s) {
  return digits(String(s || '')).normalize('NFKC')
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/[\u0622\u0623\u0625\u0671]/g, '\u0627')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}
const noAl = (s) => s.split(' ').map((w) => (w.startsWith('\u0627\u0644') && w.length > 3 ? w.slice(2) : w)).join(' ');
function matches(input, answers) {
  const a = norm(input);
  if (!a) return false;
  return answers.some((x) => { const b = norm(x); return a === b || noAl(a) === noAl(b); });
}
function getGuild() {
  const id = process.env.GUILD_ID;
  return (id && client.guilds.cache.get(id)) || client.guilds.cache.first();
}
const textCh = (g, name) => g.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === name);
const BOT_PERMS = [
  PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.AddReactions,
];

// ───────── المستويات ─────────
const need = (lvl) => 5 * lvl * lvl + 50 * lvl + 100; // XP المطلوب من مستوى للي بعده
function levelOf(total) {
  let lvl = 0; let rest = total;
  while (rest >= need(lvl)) { rest -= need(lvl); lvl++; }
  return { lvl, cur: rest, next: need(lvl) };
}
function userRec(id) {
  if (!data.xp[id]) data.xp[id] = { xp: 0, msgs: 0 };
  return data.xp[id];
}
function rankOf(id) {
  const sorted = Object.entries(data.xp).sort((a, b) => b[1].xp - a[1].xp);
  return sorted.findIndex(([k]) => k === id) + 1;
}
function bar(cur, max, len = 12) {
  const f = Math.round((cur / max) * len);
  return '🟪'.repeat(f) + '⬛'.repeat(len - f);
}

async function ensureRoles(g) {
  for (const [, name, color] of [...LEVEL_ROLES, [0, CHAMP_ROLE, 0xffd700]]) {
    if (!g.roles.cache.find((r) => r.name === name)) {
      await g.roles.create({ name, color, reason: 'رتب الفعاليات' })
        .catch((e) => console.error('⚠️ role:', name, e.message));
    }
  }
}

async function syncLevelRole(member, lvl) {
  const g = member.guild;
  const earned = LEVEL_ROLES.filter(([l]) => lvl >= l).pop();
  for (const [l, name] of LEVEL_ROLES) {
    const role = g.roles.cache.find((r) => r.name === name);
    if (!role) continue;
    const should = earned && earned[0] === l;
    if (should && !member.roles.cache.has(role.id)) await member.roles.add(role).catch(() => {});
    if (!should && member.roles.cache.has(role.id)) await member.roles.remove(role).catch(() => {});
  }
}

async function addXp(member, amount) {
  if (!member || member.user?.bot) return;
  const rec = userRec(member.id);
  const before = levelOf(rec.xp).lvl;
  rec.xp += amount;
  dirty = true;
  const after = levelOf(rec.xp).lvl;
  if (after > before) {
    const ch = textCh(member.guild, CH.levels);
    const reward = LEVEL_ROLES.find(([l]) => l === after);
    if (ch) {
      await ch.send({
        content: `${member}`,
        embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🆙 ترقية!')
          .setDescription(`مبروك ${member} وصلت **المستوى ${after}** 🎉${reward ? `\nوأخذت رتبة **${reward[1]}** 🏅` : ''}`)
          .setThumbnail(member.user.displayAvatarURL())],
        allowedMentions: { users: [member.id] },
      }).catch(() => {});
    }
    await syncLevelRole(member, after);
  }
}

// ───────── التحديات ─────────
function challengeRow(prefix, labels, style = ButtonStyle.Secondary) {
  return new ActionRowBuilder().addComponents(labels.map((l, idx) =>
    new ButtonBuilder().setCustomId(`${prefix}_${idx}`).setLabel(l.slice(0, 80)).setStyle(style)));
}

function buildChallenge() {
  const type = pick(['trivia', 'trivia', 'emoji', 'scramble', 'typing', 'math', 'tf', 'wyr']);
  const e = new EmbedBuilder().setColor(COLOR);
  const ends = `<t:${Math.floor(Date.now() / 1000) + CHALLENGE_MINUTES * 60}:R>`;
  if (type === 'trivia') {
    const [q, opts, ok] = pick(D.TRIVIA);
    const order = shuffle([0, 1, 2, 3]);
    e.setTitle('🧠 سؤال ثقافي').setDescription(`**${q}**\n\nأول واحد يختار الجواب الصح ياخذ **${POINTS} نقاط** 🏆\nكل واحد له محاولة وحدة بس!\n⏳ ينتهي ${ends}`);
    return { type, embed: e, components: [challengeRow('ev_mc', order.map((k) => opts[k]))], correct: order.indexOf(ok), answerText: opts[ok] };
  }
  if (type === 'tf') {
    const [s, ok] = pick(D.TRUE_FALSE);
    e.setTitle('✅❌ صح ولا خطأ؟').setDescription(`**${s}**\n\nأول واحد يجاوب صح ياخذ **${POINTS} نقاط** 🏆\nمحاولة وحدة لكل واحد!\n⏳ ينتهي ${ends}`);
    return {
      type, embed: e, correct: ok ? 0 : 1, answerText: ok ? 'صح ✅' : 'خطأ ❌',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ev_mc_0').setLabel('صح').setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('ev_mc_1').setLabel('خطأ').setEmoji('❌').setStyle(ButtonStyle.Danger),
      )],
    };
  }
  if (type === 'emoji') {
    const [em, answers] = pick(D.EMOJI);
    e.setTitle('🤔 خمّن الإيموجي').setDescription(`# ${em}\nوش المقصود؟ اكتب جوابك هنا 👇\nأول جواب صح ياخذ **${POINTS} نقاط** 🏆\n⏳ ينتهي ${ends}`);
    return { type, embed: e, answers, answerText: answers[0] };
  }
  if (type === 'scramble') {
    const word = pick(D.WORDS);
    const letters = [...word];
    let mixed = word;
    for (let k = 0; k < 10 && mixed === word; k++) mixed = shuffle(letters).join(' ');
    if (mixed.replace(/ /g, '') === word) mixed = [...letters].reverse().join(' ');
    e.setTitle('🔤 رتّب الحروف').setDescription(`# ${mixed}\nرتّب الحروف وطلّع الكلمة، واكتبها هنا 👇\nأول جواب صح ياخذ **${POINTS} نقاط** 🏆\n⏳ ينتهي ${ends}`);
    return { type, embed: e, answers: [word], answerText: word };
  }
  if (type === 'typing') {
    const s = pick(D.SENTENCES);
    // حروف مخفية بين الكلمات: اللي ينسخ ويلصق ينكشف 😏
    const shown = s.split(' ').join(' \u200b');
    e.setTitle('⌨️ أسرع كاتب').setDescription(`اكتب الجملة هذي بالضبط (بدون نسخ!):\n\n**${shown}**\n\nأول واحد يكتبها صح ياخذ **${POINTS} نقاط** 🏆\n⏳ ينتهي ${ends}`);
    return { type, embed: e, answers: [s], answerText: s, antiCopy: true };
  }
  if (type === 'math') {
    const a = 3 + Math.floor(Math.random() * 17);
    const b = 2 + Math.floor(Math.random() * 12);
    const c = Math.floor(Math.random() * 50);
    const op = pick(['+', '-']);
    const ans = op === '+' ? a * b + c : a * b - c;
    e.setTitle('🧮 تحدي رياضيات').setDescription(`# ${a} × ${b} ${op} ${c} = ؟\nاكتب الجواب هنا 👇\nأول جواب صح ياخذ **${POINTS} نقاط** 🏆\n⏳ ينتهي ${ends}`);
    return { type, embed: e, answers: [String(ans)], answerText: String(ans) };
  }
  // لو خيروك (بدون نقاط — تصويت)
  const [x, y] = pick(D.WYR);
  e.setTitle('🤷 لو خيروك...').setDescription(`🅰️ **${x}**\n\nولا\n\n🅱️ **${y}**\n\nصوّت تحت 👇 (كل مشارك ياخذ ${PLAY_XP} XP)\nالنتيجة تطلع ${ends}`);
  return {
    type, embed: e, options: [x, y],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ev_wyr_0').setLabel('🅰️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ev_wyr_1').setLabel('🅱️').setStyle(ButtonStyle.Primary),
    )],
  };
}

async function endChallenge(reason) {
  const ch = active;
  if (!ch) return;
  active = null;
  clearTimeout(ch.timer);
  const channel = client.channels.cache.get(ch.channelId);
  const msg = await channel?.messages.fetch(ch.msgId).catch(() => null);
  if (msg && ch.components) await msg.edit({ components: [] }).catch(() => {});
  if (!channel) return;
  if (ch.type === 'wyr') {
    const v = wyrVotes.get(ch.msgId) || [new Set(), new Set()];
    const [a, b] = [v[0].size, v[1].size];
    const total = a + b;
    const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
    await channel.send({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('📊 نتيجة «لو خيروك»')
      .setDescription(`🅰️ ${ch.options[0]} — **${a}** (${pct(a)}%)\n🅱️ ${ch.options[1]} — **${b}** (${pct(b)}%)\n\n${total ? `صوّت ${total} 🙌` : 'محد صوّت هالمرة 😅'}`)] }).catch(() => {});
    wyrVotes.delete(ch.msgId);
    return;
  }
  if (reason === 'timeout') {
    await channel.send({ embeds: [new EmbedBuilder().setColor(0x99aab5)
      .setDescription(`⏰ انتهى الوقت ومحد جابها!\nالجواب الصح: **${ch.answerText}**`)] }).catch(() => {});
  }
}

async function winChallenge(member, channel) {
  const ch = active;
  if (!ch) return;
  await endChallenge('win');
  data.week[member.id] = (data.week[member.id] || 0) + POINTS;
  dirty = true;
  await channel.send({
    content: `${member}`,
    embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('🏆 عندنا فايز!')
      .setDescription(`كفو ${member} 👏 الجواب: **${ch.answerText}**\n+${POINTS} نقاط و +${WIN_XP} XP\nنقاطك هالأسبوع: **${data.week[member.id]}**`)],
    allowedMentions: { users: [member.id] },
  }).catch(() => {});
  await addXp(member, WIN_XP);
}

async function postChallenge(g) {
  const channel = textCh(g, CH.challenges);
  if (!channel) return;
  if (active) await endChallenge('timeout');
  const c = buildChallenge();
  const msg = await channel.send({ embeds: [c.embed], components: c.components || [] });
  active = { ...c, embed: undefined, msgId: msg.id, channelId: channel.id, tried: new Set() };
  if (c.type === 'wyr') wyrVotes.set(msg.id, [new Set(), new Set()]);
  active.timer = setTimeout(() => endChallenge('timeout').catch(() => {}), CHALLENGE_MINUTES * 60 * 1000);
}

async function weeklyResults(g) {
  const channel = textCh(g, CH.challenges);
  const top = Object.entries(data.week).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const champRole = g.roles.cache.find((r) => r.name === CHAMP_ROLE);
  if (champRole) for (const m of champRole.members.values()) await m.roles.remove(champRole).catch(() => {});
  if (channel) {
    const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
    const lines = top.map(([id, p], k) => `${medals[k]} <@${id}> — **${p}** نقطة`);
    await channel.send({
      content: top[0] ? `<@${top[0][0]}>` : undefined,
      embeds: [new EmbedBuilder().setColor(0xffd700).setTitle('👑 نتائج تحديات الأسبوع')
        .setDescription(top.length ? `${lines.join('\n')}\n\n🎉 بطل الأسبوع <@${top[0][0]}> وأخذ رتبة **${CHAMP_ROLE}**!\nالنقاط ترجع صفر، والمنافسة تبدأ من جديد 🔥` : 'محد جمع نقاط هالأسبوع 😅 الأسبوع الجاي نبيكم تشاركون!')],
      allowedMentions: { users: top[0] ? [top[0][0]] : [] },
    }).catch(() => {});
  }
  if (top[0] && champRole) {
    const m = await g.members.fetch(top[0][0]).catch(() => null);
    if (m) await m.roles.add(champRole).catch(() => {});
  }
  data.week = {};
  dirty = true;
}

// ───────── لعبة العد ─────────
async function onCount(msg) {
  const raw = digits(msg.content.trim());
  if (!/^\d+$/.test(raw)) return; // أي كلام غير رقم نتجاهله
  const n = Number(raw);
  const c = data.count;
  if (msg.author.id === c.last) {
    await msg.react('❌').catch(() => {});
    await msg.reply({ content: `${msg.author} ما يصير تعد مرتين ورا بعض 😅 خربتها! نرجع من **1**`, allowedMentions: { users: [] } }).catch(() => {});
    c.n = 0; c.last = null; dirty = true;
    return;
  }
  if (n === c.n + 1) {
    c.n = n; c.last = msg.author.id;
    const rec = n > c.best;
    if (rec) c.best = n;
    dirty = true;
    await msg.react(rec && n % 10 === 0 ? '🏆' : '✅').catch(() => {});
    if (n % 100 === 0) await msg.channel.send(`🎉 وصلنا **${n}**! كفو عليكم 🔥`).catch(() => {});
    return;
  }
  await msg.react('❌').catch(() => {});
  await msg.reply({ content: `${msg.author} خربتها 😭 الرقم الصح كان **${c.n + 1}**\nأعلى رقم وصلناه: **${c.best}** — نرجع من **1**`, allowedMentions: { users: [] } }).catch(() => {});
  c.n = 0; c.last = null; dirty = true;
}

// ───────── الحفظ ─────────
async function dataChannel(g) {
  let ch = textCh(g, CH.data);
  if (!ch) {
    ch = await g.channels.create({
      name: CH.data, type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: g.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: client.user.id, allow: BOT_PERMS },
      ],
    });
  }
  return ch;
}
async function load(g) {
  try {
    const ch = await dataChannel(g);
    const msgs = await ch.messages.fetch({ limit: 10 });
    const m = msgs.filter((x) => x.author.id === client.user.id && x.attachments.size).first();
    if (m) {
      const old = JSON.parse(await (await fetch(m.attachments.first().url)).text());
      data = { ...data, ...old, count: { ...data.count, ...(old.count || {}) } };
      console.log(`🎯 تم تحميل بيانات الفعاليات (${Object.keys(data.xp).length} عضو)`);
    }
  } catch (e) { console.error('⚠️ events load:', e.message); }
  loaded = true;
}
async function save(force = false) {
  if (!loaded || saving || (!dirty && !force)) return;
  saving = true;
  try {
    const ch = await dataChannel(getGuild());
    const sent = await ch.send({ content: '💾 بيانات الفعاليات — لا تحذف هذه الروم', files: [new AttachmentBuilder(Buffer.from(JSON.stringify(data)), { name: 'events.json' })] });
    dirty = false;
    const old = await ch.messages.fetch({ limit: 10 });
    for (const m of old.values()) if (m.id !== sent.id && m.author.id === client.user.id) await m.delete().catch(() => {});
  } catch (e) { console.error('⚠️ events save:', e.message); }
  saving = false;
}

// ───────── تجهيز الرومات ─────────
async function ensureChannels(g) {
  let cat = g.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === CATEGORY);
  if (!cat) cat = await g.channels.create({ name: CATEGORY, type: ChannelType.GuildCategory });
  const readOnly = [
    { id: g.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
    { id: client.user.id, allow: BOT_PERMS },
  ];
  const open = [{ id: client.user.id, allow: BOT_PERMS }];
  const specs = [
    [CH.challenges, open, 'تحديات تنزل كل يوم تلقائي 🎯 أول واحد يجاوب صح ياخذ النقاط، وكل جمعة يتتوّج بطل الأسبوع 👑'],
    [CH.counting, open, 'عدّوا مع بعض: كل واحد يكتب الرقم اللي بعده 🔢 ممنوع تعد مرتين ورا بعض، واللي يغلط يرجعنا من 1 😅'],
    [CH.confess, readOnly, 'اعترافات بدون أسماء 🤫 اكتب /اعتراف — خلّوها خفيفة ومحترمة'],
    [CH.levels, readOnly, 'ترقيات المستويات 🆙 كل ما تتفاعل تزيد XP — شوف مستواك بـ /مستواي'],
  ];
  for (const [name, perms, topic] of specs) {
    if (!textCh(g, name)) {
      const ch = await g.channels.create({ name, type: ChannelType.GuildText, parent: cat.id, topic, permissionOverwrites: perms });
      if (name === CH.challenges) {
        await ch.send({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🎯 روم التحديات')
          .setDescription([
            'كل يوم ينزل هنا **4 تحديات** تلقائي (1 الظهر، 5 العصر، 8 و10 بالليل) 🕐',
            '',
            '🧠 أسئلة ثقافية • ✅❌ صح ولا خطأ • 🤔 خمّن الإيموجي',
            '🔤 رتّب الحروف • ⌨️ أسرع كاتب • 🧮 رياضيات • 🤷 لو خيروك',
            '',
            `🏆 الفايز ياخذ **${POINTS} نقاط** + **${WIN_XP} XP**`,
            `👑 كل **جمعة 9 بالليل** يتتوّج صاحب أعلى نقاط بـ رتبة **${CHAMP_ROLE}**`,
            '📊 `/المتصدرين` تشوف الترتيب',
          ].join('\n'))] }).then((m) => m.pin().catch(() => {})).catch(() => {});
      }
      if (name === CH.counting) await ch.send('🔢 يلا نبدأ! اكتبوا **1**').catch(() => {});
    }
  }
}

// ───────── الأوامر ─────────
const commands = [
  new SlashCommandBuilder().setName('مستواي').setDescription('مستواك و XP وترتيبك 🆙')
    .addUserOption((o) => o.setName('عضو').setDescription('تشوف مستوى عضو ثاني').setRequired(false)),
  new SlashCommandBuilder().setName('المتصدرين').setDescription('لوحة الصدارة: المستويات ونقاط التحديات 🏆'),
  new SlashCommandBuilder().setName('يومي').setDescription('مكافأتك اليومية من XP 🎁 (كل يوم تزيد مع الاستمرار)'),
  new SlashCommandBuilder().setName('اعتراف').setDescription('اكتب اعتراف بدون اسمك 🤫'),
  new SlashCommandBuilder().setName('تحدي').setDescription('ينزّل تحدي جديد الحين (للإدارة) 🎯')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
].map((c) => c.toJSON());

async function handle(i) {
  if (i.isChatInputCommand()) {
    const g = i.guild || getGuild();
    if (i.commandName === 'مستواي') {
      const u = i.options.getUser('عضو') || i.user;
      const rec = data.xp[u.id] || { xp: 0, msgs: 0 };
      const L = levelOf(rec.xp);
      const r = rankOf(u.id);
      await i.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setAuthor({ name: u.displayName || u.username, iconURL: u.displayAvatarURL() })
        .setTitle(`🆙 المستوى ${L.lvl}`)
        .setDescription(`${bar(L.cur, L.next)}\n**${L.cur} / ${L.next} XP** للمستوى ${L.lvl + 1}\n\n✨ مجموع XP: **${rec.xp}**\n🏅 الترتيب: **${r ? `#${r}` : '—'}**\n🎯 نقاط التحديات هالأسبوع: **${data.week[u.id] || 0}**`)] });
      return true;
    }
    if (i.commandName === 'المتصدرين') {
      const medals = ['🥇', '🥈', '🥉'];
      const lv = Object.entries(data.xp).sort((a, b) => b[1].xp - a[1].xp).slice(0, 10)
        .map(([id, r], k) => `${medals[k] || `**${k + 1}.**`} <@${id}> — مستوى **${levelOf(r.xp).lvl}** (${r.xp} XP)`);
      const wk = Object.entries(data.week).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([id, p], k) => `${medals[k] || `**${k + 1}.**`} <@${id}> — **${p}** نقطة`);
      await i.reply({ embeds: [new EmbedBuilder().setColor(0xffd700).setTitle(`🏆 متصدرين ${g.name}`)
        .addFields(
          { name: '🆙 المستويات', value: lv.join('\n') || 'ما فيه أحد للحين — تفاعلوا! 💬' },
          { name: '🎯 تحديات هالأسبوع', value: wk.join('\n') || 'محد فاز بتحدي هالأسبوع للحين' },
        )], allowedMentions: { parse: [] } });
      return true;
    }
    if (i.commandName === 'يومي') {
      const today = riyadh().date;
      const yesterday = riyadh(new Date(Date.now() - 86400000)).date;
      const d = data.daily[i.user.id] || { last: '', streak: 0 };
      if (d.last === today) {
        await i.reply({ content: '🎁 أخذت مكافأتك اليوم! ارجع بكرة 😉', flags: MessageFlags.Ephemeral });
        return true;
      }
      d.streak = d.last === yesterday ? d.streak + 1 : 1;
      d.last = today;
      data.daily[i.user.id] = d;
      const amount = Math.min(50 + (d.streak - 1) * 10, 150);
      dirty = true;
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('🎁 المكافأة اليومية')
        .setDescription(`أخذت **+${amount} XP** ✨\n🔥 سلسلتك: **${d.streak}** يوم${d.streak > 1 ? ' ورا بعض' : ''}\nكل يوم تستمر تزيد المكافأة (لين 150 XP)`)] });
      const member = await g.members.fetch(i.user.id).catch(() => null);
      await addXp(member, amount);
      return true;
    }
    if (i.commandName === 'اعتراف') {
      const left = (confessCooldown.get(i.user.id) || 0) - Date.now();
      if (left > 0) {
        await i.reply({ content: `⏳ استنى ${Math.ceil(left / 60000)} دقيقة قبل اعتراف ثاني.`, flags: MessageFlags.Ephemeral });
        return true;
      }
      const modal = new ModalBuilder().setCustomId('ev_confess').setTitle('🤫 اعتراف بدون اسم')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('text')
          .setLabel('اعترافك (خفيف ومحترم 🙏)').setStyle(TextInputStyle.Paragraph).setMinLength(5).setMaxLength(500).setRequired(true)));
      await i.showModal(modal);
      return true;
    }
    if (i.commandName === 'تحدي') {
      await i.reply({ content: '🎯 نزّلت تحدي جديد!', flags: MessageFlags.Ephemeral });
      await postChallenge(g);
      return true;
    }
    return false;
  }

  if (i.isModalSubmit() && i.customId === 'ev_confess') {
    const text = i.fields.getTextInputValue('text').trim();
    if (/https?:\/\/|discord\.gg|discord\.com\/invite|@everyone|@here|<@/i.test(text)) {
      await i.reply({ content: '🚫 ممنوع روابط أو منشن في الاعترافات.', flags: MessageFlags.Ephemeral });
      return true;
    }
    const ch = textCh(i.guild, CH.confess);
    if (!ch) { await i.reply({ content: 'روم الاعترافات مو موجود 😅', flags: MessageFlags.Ephemeral }); return true; }
    data.confN = (data.confN || 0) + 1;
    dirty = true;
    const n = data.confN;
    await ch.send({ embeds: [new EmbedBuilder().setColor(0x34495e).setTitle(`🤫 اعتراف #${n}`).setDescription(text)
      .setFooter({ text: 'اعتراف بدون اسم • اكتب /اعتراف عشان تعترف' })], allowedMentions: { parse: [] } });
    // نسخة للإدارة فقط (للحماية من الإساءة)
    const log = i.guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name.includes('سجل-التذاكر'));
    if (log) await log.send({ content: `🤫 اعتراف #${n} كتبه <@${i.user.id}>`, allowedMentions: { parse: [] } }).catch(() => {});
    confessCooldown.set(i.user.id, Date.now() + 10 * 60 * 1000);
    await i.reply({ content: `✅ نزل اعترافك (#${n}) بدون اسمك في <#${ch.id}> 🤫\nملاحظة: الإدارة بس تقدر تعرف صاحبه إذا خالف القوانين.`, flags: MessageFlags.Ephemeral });
    return true;
  }

  if (i.isButton() && (i.customId.startsWith('ev_mc_') || i.customId.startsWith('ev_wyr_'))) {
    if (i.customId.startsWith('ev_wyr_')) {
      const v = wyrVotes.get(i.message.id);
      if (!v) { await i.reply({ content: 'التصويت انتهى ⏰', flags: MessageFlags.Ephemeral }); return true; }
      const k = Number(i.customId.slice(-1));
      const first = !v[0].has(i.user.id) && !v[1].has(i.user.id);
      v[1 - k].delete(i.user.id);
      v[k].add(i.user.id);
      await i.reply({ content: `✅ صوّتت لـ ${k === 0 ? '🅰️' : '🅱️'}${first ? ` (+${PLAY_XP} XP)` : ''}`, flags: MessageFlags.Ephemeral });
      if (first) addXp(await i.guild.members.fetch(i.user.id).catch(() => null), PLAY_XP).catch(() => {});
      return true;
    }
    if (!active || active.msgId !== i.message.id) {
      await i.reply({ content: 'هذا التحدي خلص ⏰ استنى اللي بعده!', flags: MessageFlags.Ephemeral });
      return true;
    }
    if (active.tried.has(i.user.id)) {
      await i.reply({ content: 'جاوبت قبل 😅 محاولة وحدة بس!', flags: MessageFlags.Ephemeral });
      return true;
    }
    active.tried.add(i.user.id);
    const k = Number(i.customId.slice(-1));
    if (k === active.correct) {
      await i.deferUpdate().catch(() => {});
      await winChallenge(i.member, i.channel);
    } else {
      await i.reply({ content: '❌ غلط! حظ أوفر المرة الجاية', flags: MessageFlags.Ephemeral });
    }
    return true;
  }
  return false;
}

// ───────── الرسائل ─────────
async function onMessage(msg) {
  if (!msg.guild || msg.author.bot || !loaded) return;
  const name = msg.channel?.name;
  if (name === CH.counting) { await onCount(msg); return; }

  // تحديات الكتابة
  if (active && active.answers && msg.channelId === active.channelId) {
    if (active.antiCopy && /[\u200b-\u200f\u2060\ufeff]/.test(msg.content)) {
      await msg.react('😏').catch(() => {});
      await msg.reply({ content: 'نسخ ولصق؟ 😏 اكتبها بيدك!', allowedMentions: { repliedUser: false } }).catch(() => {});
      return;
    }
    if (matches(msg.content, active.answers)) {
      await msg.react('🏆').catch(() => {});
      await winChallenge(msg.member, msg.channel);
      return;
    }
  }

  // XP للرسائل: مرة كل دقيقة لكل عضو
  const now = Date.now();
  if ((msgCooldown.get(msg.author.id) || 0) > now) return;
  if (msg.content.trim().length < 2 && !msg.attachments.size) return;
  msgCooldown.set(msg.author.id, now + 60 * 1000);
  userRec(msg.author.id).msgs++;
  await addXp(msg.member, 15 + Math.floor(Math.random() * 11));
}

// ───────── المؤقت ─────────
async function tick() {
  const g = getGuild();
  if (!g || !loaded) return;
  const t = riyadh();
  const slot = `${t.date}-${t.hour}`;
  if (CHALLENGE_HOURS.includes(t.hour) && t.minute < 5 && data.sent.challenge !== slot) {
    data.sent.challenge = slot; dirty = true;
    await postChallenge(g).catch((e) => console.error('⚠️ challenge:', e.message));
  }
  if (t.weekday === WEEKLY_DAY && t.hour === WEEKLY_HOUR && data.sent.weekly !== t.date) {
    data.sent.weekly = t.date; dirty = true;
    await weeklyResults(g).catch((e) => console.error('⚠️ weekly:', e.message));
  }
}

function init(c) {
  client = c;
  client.once('clientReady', async () => {
    const g = getGuild();
    if (!g) return;
    try {
      await load(g);
      await ensureChannels(g);
      await ensureRoles(g);
      console.log(`🎯 الفعاليات والمستويات جاهزة (تحديات الساعة ${CHALLENGE_HOURS.join('، ')})`);
    } catch (e) { console.error('⚠️ events init:', e.message); }
    setInterval(() => tick().catch((e) => console.error('⚠️ events tick:', e.message)), 30 * 1000);
    setInterval(() => save().catch(() => {}), 2 * 60 * 1000);
  });
  client.on('messageCreate', (m) => onMessage(m).catch((e) => console.error('⚠️ events msg:', e.message)));
  process.on('SIGTERM', () => { save(true).catch(() => {}); });
}

module.exports = { init, handle, commands, _test: { norm, matches, levelOf, buildChallenge, digits } };
