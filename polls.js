// أوامر التصويت والتسلية 🗳️ — تصويت، اختار، ذكرني، مبارزة (حجرة ورقة مقص بالعملات)، عجلة الحظ، وتصويت يومي تلقائي
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
  ChannelType, PermissionFlagsBits, AttachmentBuilder,
} = require('discord.js');
const ECO = require('./economy');

const P = PermissionFlagsBits;
const DATA_CH = 'bot-polls-data';
const COLOR = 0xd9a441;
const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
let client = null;
let data = { polls: {}, reminders: [], wheel: {}, lastDaily: '' };
let loaded = false; let dirty = false; let saving = false;

const getGuild = () => (process.env.GUILD_ID ? client.guilds.cache.get(process.env.GUILD_ID) : client.guilds.cache.first());
const rid = () => Math.random().toString(36).slice(2, 8);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const mark = () => { dirty = true; };

// ───────── الحفظ (نفس طريقة باقي البوت: ملف JSON في روم مخفية) ─────────
async function dataChannel(g) {
  let ch = g.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === DATA_CH);
  if (!ch) {
    ch = await g.channels.create({
      name: DATA_CH, type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: g.roles.everyone.id, deny: [P.ViewChannel] },
        { id: client.user.id, allow: [P.ViewChannel, P.SendMessages, P.AttachFiles, P.ReadMessageHistory, P.ManageMessages] },
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
    if (m) data = { ...data, ...JSON.parse(await (await fetch(m.attachments.first().url)).text()) };
  } catch (e) { console.error('⚠️ community load:', e.message); }
  loaded = true;
}
async function save() {
  if (!loaded || saving || !dirty) return;
  saving = true;
  try {
    const ch = await dataChannel(getGuild());
    const sent = await ch.send({ content: '💾 بيانات التصويت والتذكير — لا تحذف هذه الروم', files: [new AttachmentBuilder(Buffer.from(JSON.stringify(data)), { name: 'community.json' })] });
    dirty = false;
    const old = await ch.messages.fetch({ limit: 10 });
    for (const m of old.values()) if (m.id !== sent.id && m.author.id === client.user.id) await m.delete().catch(() => {});
  } catch (e) { console.error('⚠️ community save:', e.message); }
  saving = false;
}

// ───────── التصويت ─────────
function bar(pct) { const n = Math.round(pct / 10); return '▰'.repeat(n) + '▱'.repeat(10 - n); }
function pollEmbed(p) {
  const counts = p.options.map((_, k) => Object.values(p.votes).filter((v) => v === k).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const max = Math.max(...counts);
  const lines = p.options.map((o, k) => {
    const pct = total ? Math.round((counts[k] / total) * 100) : 0;
    const win = p.ended && total && counts[k] === max ? ' 🏆' : '';
    return `${NUM[k]} **${o}**${win}\n\`${bar(pct)}\` ${pct}% • ${counts[k]} صوت`;
  });
  const e = new EmbedBuilder().setColor(p.ended ? 0x7f8c8d : COLOR)
    .setTitle(`🗳️ ${p.q}`)
    .setDescription(lines.join('\n\n'))
    .setFooter({ text: p.ended ? `انتهى التصويت • ${total} صوت` : `${total} صوت • تقدر تغيّر صوتك • ${p.anon ? 'الأصوات سرية' : ''}`.replace(/ • $/, '') });
  if (!p.ended) e.addFields({ name: '⏰ ينتهي', value: `<t:${Math.floor(p.ends / 1000)}:R>` });
  if (p.by) e.setAuthor({ name: `تصويت من ${p.byName || 'عضو'}` });
  return e;
}
function pollRows(p) {
  const row = new ActionRowBuilder();
  p.options.forEach((o, k) => row.addComponents(new ButtonBuilder().setCustomId(`pv_${p.id}_${k}`).setEmoji(NUM[k]).setLabel(o.slice(0, 70)).setStyle(ButtonStyle.Secondary).setDisabled(!!p.ended)));
  return [row];
}
async function endPoll(id) {
  const p = data.polls[id]; if (!p || p.ended) return;
  p.ended = true; mark();
  try {
    const ch = await client.channels.fetch(p.ch);
    const msg = await ch.messages.fetch(p.msg);
    await msg.edit({ embeds: [pollEmbed(p)], components: pollRows(p) });
    const counts = p.options.map((_, k) => Object.values(p.votes).filter((v) => v === k).length);
    const total = counts.reduce((a, b) => a + b, 0);
    if (total) {
      const max = Math.max(...counts);
      const winners = p.options.filter((_, k) => counts[k] === max);
      await msg.reply({ content: `🏁 انتهى التصويت على **${p.q}**\n${winners.length > 1 ? '🤝 تعادل بين' : '🏆 الفايز:'} **${winners.join('** و **')}** (${max} من ${total} صوت)`, allowedMentions: { parse: [] } });
    }
  } catch (e) { console.error('⚠️ endPoll:', e.message); }
  setTimeout(() => { delete data.polls[id]; mark(); }, 24 * 3600 * 1000).unref();
}
function schedulePoll(p) { setTimeout(() => endPoll(p.id), Math.max(1000, p.ends - Date.now())).unref(); }
async function postPoll(ch, q, options, minutes, by = null, byName = null, anon = false) {
  const p = { id: rid(), q, options, votes: {}, ends: Date.now() + minutes * 60000, ch: ch.id, by, byName, anon };
  const msg = await ch.send({ embeds: [pollEmbed(p)], components: pollRows(p) });
  p.msg = msg.id; data.polls[p.id] = p; mark(); schedulePoll(p);
  return msg;
}

// أسئلة التصويت اليومي التلقائي (لو خيروك بلهجتنا)
const DAILY = [
  ['قهوة عربية ☕', 'شاي أحمر 🫖'], ['كبسة 🍛', 'مندي 🍗'], ['سهر للفجر 🌙', 'نوم بدري 😴'], ['بر وكشتة 🏕️', 'بحر 🏖️'],
  ['قيمز طول الليل 🎮', 'سوالف بالديوانية 💬'], ['شتاء ❄️', 'صيف ☀️'], ['تمر سكري 🌴', 'تمر خلاص 🌴'], ['تسافر برا ✈️', 'تكشت بالسعودية 🚙'],
  ['مطعم جديد 🍔', 'مطعمك المعتاد 🍕'], ['تقرا كتاب 📖', 'تشوف وثائقي 🎬'], ['جوال بدون نت أسبوع 📵', 'بدون حلا أسبوع 🍫'], ['تطبخ أنت 👨‍🍳', 'توصيل 🛵'],
  ['تصحى 5 الفجر نشيط 🌅', 'تنام لين الظهر 😪'], ['قطو 🐈', 'كلب 🐕'], ['بيبسي 🥤', 'كولا 🥤'], ['تعرف تطير 🕊️', 'تكون غير مرئي 👻'],
  ['سيارة رياضية 🏎️', 'جيب 🚙'], ['تعيش بمدينة كبيرة 🏙️', 'بقرية هادية 🏡'], ['فطور سعودي 🥙', 'فطور أجنبي 🥞'], ['مكيف 18 درجة 🥶', 'مكيف 25 🙂'],
];

// ───────── عجلة الحظ (مرة باليوم) ─────────
const WHEEL = [
  { n: 10, w: 30, t: '🪙 10' }, { n: 25, w: 25, t: '🪙 25' }, { n: 50, w: 18, t: '💰 50' }, { n: 75, w: 10, t: '💰 75' },
  { n: 100, w: 8, t: '💎 100' }, { n: 0, w: 6, t: '💨 ولا شي' }, { n: 250, w: 2.5, t: '🔥 250' }, { n: 500, w: 0.5, t: '👑 500 الجائزة الكبرى!' },
];
function spin() { let r = Math.random() * WHEEL.reduce((a, b) => a + b.w, 0); for (const s of WHEEL) { if ((r -= s.w) <= 0) return s; } return WHEEL[0]; }
const dayKey = (t = Date.now()) => new Date(t + 3 * 3600 * 1000).toISOString().slice(0, 10); // توقيت الرياض

// ───────── المبارزة: حجرة ورقة مقص ─────────
const RPS = { r: '🪨 حجرة', p: '📄 ورقة', s: '✂️ مقص' };
const BEATS = { r: 's', p: 'r', s: 'p' };
const duels = new Map();

// ───────── الأوامر ─────────
const commands = [
  new SlashCommandBuilder().setName('تصويت').setDescription('🗳️ سوّ تصويت بأزرار (لين 5 خيارات)')
    .addStringOption((o) => o.setName('سؤال').setDescription('وش السؤال؟').setRequired(true).setMaxLength(200))
    .addStringOption((o) => o.setName('خيار1').setDescription('الخيار الأول').setRequired(true).setMaxLength(70))
    .addStringOption((o) => o.setName('خيار2').setDescription('الخيار الثاني').setRequired(true).setMaxLength(70))
    .addStringOption((o) => o.setName('خيار3').setDescription('الخيار الثالث').setMaxLength(70))
    .addStringOption((o) => o.setName('خيار4').setDescription('الخيار الرابع').setMaxLength(70))
    .addStringOption((o) => o.setName('خيار5').setDescription('الخيار الخامس').setMaxLength(70))
    .addIntegerOption((o) => o.setName('مدة').setDescription('كم دقيقة؟ (افتراضي 60 — أقصى شي يوم)').setMinValue(1).setMaxValue(1440))
    .toJSON(),
  new SlashCommandBuilder().setName('اختار').setDescription('🎲 خلّ البوت يختار لك من بين خيارات')
    .addStringOption((o) => o.setName('خيارات').setDescription('افصل بينها بفاصلة: كبسة، مندي، برجر').setRequired(true).setMaxLength(300))
    .toJSON(),
  new SlashCommandBuilder().setName('ذكرني').setDescription('⏰ البوت يذكرك بشي بعد وقت')
    .addIntegerOption((o) => o.setName('دقائق').setDescription('بعد كم دقيقة؟ (لين أسبوع)').setRequired(true).setMinValue(1).setMaxValue(10080))
    .addStringOption((o) => o.setName('بإيش').setDescription('وش أذكرك فيه؟').setRequired(true).setMaxLength(200))
    .toJSON(),
  new SlashCommandBuilder().setName('مبارزة').setDescription('⚔️ تحدّى أحد حجرة ورقة مقص على عملات')
    .addUserOption((o) => o.setName('خصم').setDescription('مين تتحدى؟').setRequired(true))
    .addIntegerOption((o) => o.setName('رهان').setDescription('كم عملة؟ (0 = ودّية)').setMinValue(0).setMaxValue(10000))
    .toJSON(),
  new SlashCommandBuilder().setName('عجلة').setDescription('🎡 لف عجلة الحظ مرة كل يوم واربح عملات')
    .toJSON(),
];

async function handle(i) {
  // ── أزرار ──
  if (i.isButton()) {
    const id = i.customId;
    if (id.startsWith('pv_')) {
      const [, pid, k] = id.split('_');
      const p = data.polls[pid];
      if (!p || p.ended) { await i.reply({ content: '⌛ هذا التصويت خلص.', flags: MessageFlags.Ephemeral }); return true; }
      const prev = p.votes[i.user.id];
      p.votes[i.user.id] = Number(k); mark();
      await i.update({ embeds: [pollEmbed(p)], components: pollRows(p) });
      await i.followUp({ content: prev === Number(k) ? `✅ صوتك موجود على **${p.options[k]}**` : `✅ صوّت لـ **${p.options[k]}**`, flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (id.startsWith('du_')) return duelButton(i);
    return false;
  }
  if (!i.isChatInputCommand()) return false;
  const name = i.commandName;

  if (name === 'تصويت') {
    const opts = ['خيار1', 'خيار2', 'خيار3', 'خيار4', 'خيار5'].map((k) => i.options.getString(k)).filter(Boolean);
    const minutes = i.options.getInteger('مدة') || 60;
    await i.reply({ content: '🗳️ تم!', flags: MessageFlags.Ephemeral });
    await postPoll(i.channel, i.options.getString('سؤال'), opts, minutes, i.user.id, i.member?.displayName || i.user.username);
    return true;
  }

  if (name === 'اختار') {
    const opts = i.options.getString('خيارات').split(/[,،\n]|\s+أو\s+/).map((s) => s.trim()).filter(Boolean);
    if (opts.length < 2) { await i.reply({ content: '✋ اكتب خيارين على الأقل وافصل بينهم بفاصلة.', flags: MessageFlags.Ephemeral }); return true; }
    const e = (t, done) => new EmbedBuilder().setColor(done ? 0x2ecc71 : COLOR).setTitle(done ? '🎯 البوت اختار!' : '🎲 قاعد أختار...').setDescription(done ? `## ${t}` : `🔄 ${t}`).setFooter({ text: opts.join(' • ').slice(0, 200) });
    await i.reply({ embeds: [e(pick(opts))] });
    for (let k = 0; k < 4; k++) { await new Promise((r) => setTimeout(r, 450)); await i.editReply({ embeds: [e(pick(opts))] }).catch(() => {}); }
    await new Promise((r) => setTimeout(r, 500));
    await i.editReply({ embeds: [e(pick(opts), true)] });
    return true;
  }

  if (name === 'ذكرني') {
    const min = i.options.getInteger('دقائق');
    const r = { id: rid(), u: i.user.id, ch: i.channelId, t: Date.now() + min * 60000, what: i.options.getString('بإيش') };
    data.reminders.push(r); mark(); scheduleReminder(r);
    await i.reply({ content: `⏰ أبشر! بذكرك <t:${Math.floor(r.t / 1000)}:R>: **${r.what}**`, flags: MessageFlags.Ephemeral });
    return true;
  }

  if (name === 'عجلة') {
    const today = dayKey();
    if (data.wheel[i.user.id] === today) {
      const tomorrow = new Date(`${dayKey(Date.now() + 86400000)}T00:00:00+03:00`).getTime();
      await i.reply({ content: `🎡 لفّيت العجلة اليوم! ارجع <t:${Math.floor(tomorrow / 1000)}:R>`, flags: MessageFlags.Ephemeral });
      return true;
    }
    data.wheel[i.user.id] = today; mark();
    const res = spin();
    const frames = ['🪙 10', '💎 100', '💨 ولا شي', '💰 50', '🔥 250', '🪙 25', '👑 500', '💰 75'];
    const e = (t, done) => new EmbedBuilder().setColor(done ? (res.n >= 250 ? 0xf1c40f : res.n ? 0x2ecc71 : 0x95a5a6) : COLOR)
      .setTitle('🎡 عجلة الديوانية').setDescription(done ? `## ${t}` : `### 🔄 ${t}`);
    await i.reply({ embeds: [e(pick(frames))] });
    for (let k = 0; k < 5; k++) { await new Promise((r) => setTimeout(r, 380 + k * 90)); await i.editReply({ embeds: [e(pick(frames))] }).catch(() => {}); }
    if (res.n) ECO.add(i.user.id, res.n, 'عجلة الحظ');
    await new Promise((r) => setTimeout(r, 600));
    await i.editReply({ embeds: [e(res.t, true).setFooter({ text: res.n ? `انضافت ${res.n} لرصيدك • ارجع بكرة 🎡` : 'حظ أوفر بكرة 😅' })] });
    return true;
  }

  if (name === 'مبارزة') {
    const foe = i.options.getUser('خصم');
    const bet = i.options.getInteger('رهان') || 0;
    if (foe.id === i.user.id || foe.bot) { await i.reply({ content: '😅 اختار عضو ثاني (مب نفسك ولا بوت).', flags: MessageFlags.Ephemeral }); return true; }
    if (bet && ECO.get(i.user.id) < bet) { await i.reply({ content: `💸 ما عندك ${ECO.fmt(bet)} في محفظتك.`, flags: MessageFlags.Ephemeral }); return true; }
    const d = { id: rid(), a: i.user.id, b: foe.id, bet, picks: {}, state: 'wait' };
    duels.set(d.id, d);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`du_ok_${d.id}`).setLabel('أقبل التحدي ⚔️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`du_no_${d.id}`).setLabel('أنسحب').setStyle(ButtonStyle.Secondary),
    );
    await i.reply({
      content: `${foe}`,
      embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('⚔️ مبارزة حجرة ورقة مقص!')
        .setDescription(`${i.user} يتحداك يا ${foe}!\n${bet ? `💰 الرهان: **${ECO.fmt(bet)}** (الفايز ياخذها من الخسران)` : '🤝 مبارزة ودّية بدون رهان'}\n\n⏳ عندك دقيقتين تقبل`)],
      components: [row], allowedMentions: { users: [foe.id] },
    });
    d.msg = await i.fetchReply();
    setTimeout(() => { if (duels.get(d.id)?.state !== 'done') { duels.delete(d.id); d.msg.edit({ components: [], embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle('⌛ المبارزة انتهى وقتها')] }).catch(() => {}); } }, 120000).unref();
    return true;
  }
  return false;
}

async function duelButton(i) {
  const [, act, did] = i.customId.split('_');
  const d = duels.get(did);
  if (!d) { await i.reply({ content: '⌛ هذي المبارزة خلصت.', flags: MessageFlags.Ephemeral }); return true; }
  if (act === 'no') {
    if (i.user.id !== d.b && i.user.id !== d.a) { await i.reply({ content: 'هذي مب مبارزتك 😄', flags: MessageFlags.Ephemeral }); return true; }
    duels.delete(did);
    await i.update({ components: [], embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle('🏳️ انسحب من المبارزة')] });
    return true;
  }
  if (act === 'ok') {
    if (i.user.id !== d.b) { await i.reply({ content: 'التحدي موجّه لغيرك 😄', flags: MessageFlags.Ephemeral }); return true; }
    if (d.bet && (ECO.get(d.a) < d.bet || ECO.get(d.b) < d.bet)) { duels.delete(did); await i.update({ components: [], embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle('💸 واحد منكم ما عنده الرهان في محفظته')] }); return true; }
    d.state = 'pick';
    const row = new ActionRowBuilder().addComponents(...Object.entries(RPS).map(([k, t]) => new ButtonBuilder().setCustomId(`du_p${k}_${did}`).setLabel(t).setStyle(ButtonStyle.Primary)));
    await i.update({ embeds: [new EmbedBuilder().setColor(0xe67e22).setTitle('⚔️ المبارزة بدأت!').setDescription(`<@${d.a}> 🆚 <@${d.b}>\nكل واحد يختار — اختيارك سري لين يختار الثاني 🤫`)], components: [row] });
    return true;
  }
  if (act[0] === 'p') {
    if (i.user.id !== d.a && i.user.id !== d.b) { await i.reply({ content: 'تفرّج بس 👀', flags: MessageFlags.Ephemeral }); return true; }
    if (d.picks[i.user.id]) { await i.reply({ content: 'اخترت خلاص 😄', flags: MessageFlags.Ephemeral }); return true; }
    d.picks[i.user.id] = act[1];
    if (!(d.picks[d.a] && d.picks[d.b])) { await i.reply({ content: `✅ اخترت ${RPS[act[1]]} — ننتظر خصمك...`, flags: MessageFlags.Ephemeral }); return true; }
    d.state = 'done'; duels.delete(did);
    const pa = d.picks[d.a]; const pb = d.picks[d.b];
    let result;
    if (pa === pb) result = '🤝 **تعادل!** ما أحد خسر شي';
    else {
      const [w, l] = BEATS[pa] === pb ? [d.a, d.b] : [d.b, d.a];
      if (d.bet) { ECO.add(l, -d.bet, 'خسارة مبارزة'); ECO.add(w, d.bet, 'فوز مبارزة'); }
      result = `🏆 **الفايز: <@${w}>**${d.bet ? ` وأخذ ${ECO.fmt(d.bet)} من <@${l}>` : ''}`;
    }
    await i.update({ components: [], embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('⚔️ نتيجة المبارزة').setDescription(`<@${d.a}>: ${RPS[pa]}\n<@${d.b}>: ${RPS[pb]}\n\n${result}`)] });
    return true;
  }
  return false;
}

// ───────── التذكير ─────────
function scheduleReminder(r) {
  const fire = async () => {
    data.reminders = data.reminders.filter((x) => x.id !== r.id); mark();
    const text = `⏰ <@${r.u}> تذكير: **${r.what}**`;
    try { const ch = await client.channels.fetch(r.ch); await ch.send({ content: text, allowedMentions: { users: [r.u] } }); } catch {
      try { const u = await client.users.fetch(r.u); await u.send(text); } catch { /* */ }
    }
  };
  const wait = r.t - Date.now();
  if (wait > 2 ** 31 - 1) return; // أكثر من 24 يوم (ما يصير لأن الحد أسبوع)
  setTimeout(fire, Math.max(1000, wait)).unref();
}

// ───────── التصويت اليومي التلقائي 8 مساءً بتوقيت الرياض ─────────
async function dailyPoll() {
  const g = getGuild(); if (!g || !loaded) return;
  const now = new Date(Date.now() + 3 * 3600 * 1000);
  if (now.getUTCHours() < 20 || data.lastDaily === dayKey()) return;
  const LV = require('./live');
  const ch = LV._test?.generalChannel?.(g, null);
  if (!ch) return;
  data.lastDaily = dayKey(); mark();
  const [a, b] = DAILY[Math.floor(Date.now() / 86400000) % DAILY.length];
  await postPoll(ch, '🌙 تصويت الديوانية اليومي: وش تختار؟', [a, b], 180, null, 'الديوانية').catch((e) => console.error('⚠️ daily poll:', e.message));
}

function init(c) {
  client = c;
  client.once('clientReady', async () => {
    const g = getGuild(); if (!g) return;
    await load(g);
    for (const p of Object.values(data.polls)) { if (!p.ended) schedulePoll(p); else setTimeout(() => { delete data.polls[p.id]; mark(); }, 3600000).unref(); }
    for (const r of data.reminders) scheduleReminder(r);
    setInterval(save, 30000).unref();
    setInterval(() => dailyPoll().catch(() => {}), 5 * 60000).unref();
  });
}

module.exports = { init, handle, commands };
