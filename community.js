// مجتمع الديوانية 🌙 — دليل الزوار + إحصائيات + النشرة اليومية والأسبوعية والشهرية
const {
  EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, PermissionFlagsBits, SlashCommandBuilder, AttachmentBuilder, MessageFlags,
} = require('discord.js');

const TZ = 'Asia/Riyadh';
const COLOR = 0xf5b942;
const DATA_CHANNEL = 'bot-data';
const NEWS_CHANNEL = '📰・نشرة-ديوانية';
let client = null;

// ───────── الوقت بتوقيت الرياض ─────────
function riyadh(date = new Date()) {
  const p = {};
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  });
  for (const x of fmt.formatToParts(date)) p[x.type] = x.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`, month: `${p.year}-${p.month}`,
    hour: Number(p.hour) % 24, minute: Number(p.minute), weekday: p.weekday,
  };
}
const dayKey = (offset = 0) => riyadh(new Date(Date.now() + offset * 86400000)).date;

// ───────── البيانات (تُحفظ في روم bot-data المخفية) ─────────
let data = { days: {}, sent: {} };
let dirty = false;
let saving = false;
let loaded = false;

function today() {
  const k = dayKey();
  if (!data.days[k]) data.days[k] = { messages: 0, users: {}, channels: {}, voice: {}, joins: 0, leaves: 0 };
  return data.days[k];
}
function prune() {
  const keep = new Set();
  for (let i = 0; i < 70; i++) keep.add(dayKey(-i));
  for (const k of Object.keys(data.days)) if (!keep.has(k)) delete data.days[k];
}
function getGuild() {
  const id = process.env.GUILD_ID;
  return (id && client.guilds.cache.get(id)) || client.guilds.cache.first();
}

async function findOrCreateText(guild, matchFn, createOpts) {
  let ch = guild.channels.cache.find((c) => c.type === ChannelType.GuildText && matchFn(c.name));
  if (!ch && createOpts) ch = await guild.channels.create({ type: ChannelType.GuildText, ...createOpts });
  return ch;
}
function dataChannel(guild) {
  return findOrCreateText(guild, (n) => n === DATA_CHANNEL, {
    name: DATA_CHANNEL,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages,
        ],
      },
    ],
  });
}
function newsChannel(guild) {
  return findOrCreateText(guild, (n) => n.includes('نشرة') || n.includes('ملخص'), {
    name: NEWS_CHANNEL,
    permissionOverwrites: [
      { id: guild.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks] },
    ],
  });
}
function welcomeChannel(guild) {
  return guild.channels.cache.find((c) =>
    c.type === ChannelType.GuildText && (c.name.includes('ترحيب') || c.name.includes('welcome')),
  ) || guild.systemChannel;
}

async function loadData(guild) {
  try {
    const ch = await dataChannel(guild);
    const msgs = await ch.messages.fetch({ limit: 20 });
    const m = msgs.filter((x) => x.author.id === client.user.id && x.attachments.size).first();
    if (m) {
      const txt = await (await fetch(m.attachments.first().url)).text();
      const old = JSON.parse(txt);
      // دمج مع أي شيء انحسب قبل التحميل
      data = { days: { ...(old.days || {}), ...data.days }, sent: old.sent || {} };
      console.log('📂 تم تحميل بيانات الإحصائيات');
    } else {
      console.log('📂 لا توجد إحصائيات سابقة، نبدأ من جديد');
    }
  } catch (e) {
    console.error('⚠️ loadData:', e.message);
  }
  loaded = true;
}

async function saveData(force = false) {
  if (!loaded || (!dirty && !force) || saving) return;
  saving = true;
  try {
    const ch = await dataChannel(getGuild());
    prune();
    const file = new AttachmentBuilder(Buffer.from(JSON.stringify(data)), { name: 'data.json' });
    const sent = await ch.send({ content: '💾 نسخة بيانات البوت — لا تحذف هذه الروم', files: [file] });
    dirty = false;
    const old = await ch.messages.fetch({ limit: 20 });
    for (const m of old.values()) {
      if (m.id !== sent.id && m.author.id === client.user.id) await m.delete().catch(() => {});
    }
  } catch (e) {
    console.error('⚠️ saveData:', e.message);
  }
  saving = false;
}

// ───────── الإحصائيات ─────────
function aggregate(keys) {
  const t = { messages: 0, users: {}, channels: {}, voice: {}, invites: {}, joins: 0, leaves: 0 };
  for (const k of keys) {
    const d = data.days[k];
    if (!d) continue;
    t.messages += d.messages; t.joins += d.joins; t.leaves += d.leaves;
    for (const [id, v] of Object.entries(d.users)) t.users[id] = (t.users[id] || 0) + v;
    for (const [id, v] of Object.entries(d.channels)) t.channels[id] = (t.channels[id] || 0) + v;
    for (const [id, v] of Object.entries(d.voice)) t.voice[id] = (t.voice[id] || 0) + v;
    for (const [id, v] of Object.entries(d.invites || {})) t.invites[id] = (t.invites[id] || 0) + v;
  }
  t.active = new Set([...Object.keys(t.users), ...Object.keys(t.voice)]).size;
  t.voiceMin = Object.values(t.voice).reduce((a, b) => a + b, 0);
  return t;
}
function periodKeys(period, shift = 0) {
  if (period === 'day') return [dayKey(-shift)];
  if (period === 'week') return Array.from({ length: 7 }, (_, i) => dayKey(-(i + shift * 7)));
  let [y, m] = riyadh().month.split('-').map(Number);
  m -= shift;
  while (m < 1) { m += 12; y--; }
  const prefix = `${y}-${String(m).padStart(2, '0')}`;
  return Object.keys(data.days).filter((k) => k.startsWith(prefix));
}

const medals = ['🥇', '🥈', '🥉'];
const topList = (map, n, fmt) => {
  const arr = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, n);
  return arr.length ? arr.map(([id, v], i) => `${medals[i] || '▫️'} ${fmt(id, v)}`).join('\n') : 'لا يوجد بعد';
};
const hours = (min) => (min < 60 ? `${min} دقيقة` : `${(min / 60).toFixed(1)} ساعة`);
const change = (now, prev) => {
  if (!prev) return '';
  const p = Math.round(((now - prev) / prev) * 100);
  return p >= 0 ? ` (⬆️ ${p}%)` : ` (⬇️ ${Math.abs(p)}%)`;
};
const rankOf = (map, id) => {
  const i = Object.entries(map).sort((a, b) => b[1] - a[1]).findIndex(([k]) => k === id);
  return i === -1 ? '—' : `#${i + 1}`;
};

const TITLES = { day: 'النشرة اليومية', week: 'النشرة الأسبوعية', month: 'النشرة الشهرية' };
const PREV = { day: 'أمس', week: 'الأسبوع الماضي', month: 'الشهر الماضي' };

function buildSummary(guild, period) {
  const cur = aggregate(periodKeys(period, 0));
  const prev = aggregate(periodKeys(period, 1));
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`📰 ${TITLES[period]} — ${guild.name}`)
    .setDescription(`📅 ${riyadh().date}\nالنسبة بين القوسين مقارنة بـ${PREV[period]}`)
    .addFields(
      { name: '💬 الرسائل', value: `${cur.messages}${change(cur.messages, prev.messages)}`, inline: true },
      { name: '👥 الأعضاء النشطون', value: `${cur.active}${change(cur.active, prev.active)}`, inline: true },
      { name: '🎙️ وقت الصوت', value: `${hours(cur.voiceMin)}${change(cur.voiceMin, prev.voiceMin)}`, inline: true },
      { name: '📥 انضموا', value: `${cur.joins}`, inline: true },
      { name: '📤 غادروا', value: `${cur.leaves}`, inline: true },
      { name: '👨‍👩‍👦 عدد الأعضاء', value: `${guild.memberCount}`, inline: true },
      { name: '🏆 الأكثر تفاعلًا', value: topList(cur.users, 3, (id, v) => `<@${id}> — ${v} رسالة`) },
      { name: '📍 أنشط الرومات', value: topList(cur.channels, 3, (id, v) => `<#${id}> — ${v} رسالة`) },
      { name: '🎧 نجوم الصوت', value: topList(cur.voice, 3, (id, v) => `<@${id}> — ${hours(v)}`) },
      { name: '📨 أكثر من جاب أعضاء', value: topList(cur.invites, 3, (id, v) => `<@${id}> — ${v} عضو`) },
    )
    .setFooter({ text: 'بوت الديوانية 🌙' })
    .setTimestamp();
}

function myStats(user) {
  const w = aggregate(periodKeys('week'));
  const m = aggregate(periodKeys('month'));
  const id = user.id;
  return new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`📊 إحصائيات ${user.displayName || user.username}`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: '📅 هذا الأسبوع', value: `💬 ${w.users[id] || 0} رسالة (${rankOf(w.users, id)})\n🎙️ ${hours(w.voice[id] || 0)} (${rankOf(w.voice, id)})`, inline: true },
      { name: '🗓️ هذا الشهر', value: `💬 ${m.users[id] || 0} رسالة (${rankOf(m.users, id)})\n🎙️ ${hours(m.voice[id] || 0)} (${rankOf(m.voice, id)})`, inline: true },
    )
    .setFooter({ text: 'الرقم بين القوسين = ترتيبك في السيرفر' });
}

async function sendSummary(guild, period) {
  try {
    const ch = await newsChannel(guild);
    await ch.send({ embeds: [buildSummary(guild, period)] });
    const t = riyadh();
    data.sent[period] = period === 'month' ? t.month : t.date;
    dirty = true;
    await saveData(true);
    console.log('📰 أُرسلت النشرة:', period);
  } catch (e) {
    console.error('⚠️ sendSummary:', e.message);
  }
}

// ───────── دليل الزوار ─────────
const SECTION_LABELS = {
  home: '🏠 الرئيسية',
  rules: '📜 القوانين',
  rooms: '🗺️ خريطة الرومات',
  quran: '🕌 القرآن والأذكار',
  commands: '🤖 أوامر البوت',
};

function guideEmbed(guild, section) {
  const e = new EmbedBuilder().setColor(COLOR).setFooter({ text: guild.name });
  if (section === 'rules') {
    e.setTitle('📜 القوانين').setDescription([
      '1️⃣ الاحترام أولًا — لا سب ولا تنمّر ولا عنصرية.',
      '2️⃣ ممنوع السبام والإعلانات بدون إذن الإدارة.',
      '3️⃣ لا محتوى مخالف أو غير لائق.',
      '4️⃣ كل موضوع في رومه المخصص.',
      '5️⃣ ممنوع النقاشات الطائفية والمذهبية والعنصرية — كلنا إخوان هنا 🤝',
      '6️⃣ روم القرآن للاستماع بهدوء.',
      '7️⃣ قرارات الإدارة تُحترم، وللاعتراض أو أي طلب افتح تذكرة من روم «فتح-تذكرة» 🎫',
    ].join('\n'));
  } else if (section === 'rooms') {
    const cats = [...guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).values()]
      .sort((a, b) => a.rawPosition - b.rawPosition);
    let txt = '';
    for (const cat of cats) {
      const kids = [...guild.channels.cache.filter((c) =>
        c.parentId === cat.id && c.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel),
      ).values()].sort((a, b) => a.rawPosition - b.rawPosition);
      if (!kids.length) continue;
      txt += `**${cat.name}**\n${kids.map((c) => `<#${c.id}>`).join('  ')}\n\n`;
    }
    e.setTitle('🗺️ خريطة الرومات').setDescription(txt.slice(0, 4000) || 'لا توجد رومات');
  } else if (section === 'quran') {
    e.setTitle('🕌 القرآن والأذكار').setDescription([
      '📻 روم **القرآن الكريم** الصوتي فيه إذاعة قرآن شغّالة 24 ساعة — ادخل واستمع بهدوء 🤍',
      '📖 `/قران` تختار سورة وقارئ وتسمعها',
      '📿 تنبيه بكل صلاة (تقويم أم القرى والتقويم الجعفري)، وأذكار الصباح والمساء تنزل تلقائيًا في روم الأذكار',
      '🤝 السيرفر للجميع بدون تفرقة — احترم غيرك واحترم اختلافه',
    ].join('\n'));
  } else if (section === 'commands') {
    e.setTitle('🤖 أوامر البوت').setDescription([
      '`/دليل` — هذا الدليل',
      '`/ملخص` — نشرة اليوم أو الأسبوع أو الشهر',
      '`/احصائياتي` — تفاعلك وترتيبك',
      '`/سهرة` — موعد سهرة الألعاب الأسبوعية وتفعيل التنبيه 🎮',
      '`/مساعدة` — كل أوامر البوت',
      '🤖 **ذكاء الديوانية**: اكتب في روم «سولف-مع-الذكاء» أو منشن البوت ويسولف معك',
      '🎫 **التذاكر**: تحتاج الإدارة؟ افتح تذكرة من روم «فتح-تذكرة» (استفسار، دعم، شكوى، شراكة)',
    ].join('\n'));
  } else {
    e.setTitle(`📖 دليل ${guild.name}`)
      .setDescription('حيّاك في ديوانيتنا: سوالف، ألعاب، وقرآن 🌙\n\nاختر من القائمة تحت لتتعرف على السيرفر 👇')
      .setThumbnail(guild.iconURL());
  }
  return e;
}

function guidePayload(guild, section = 'home') {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('guide_section')
    .setPlaceholder('اختر قسمًا')
    .addOptions(Object.entries(SECTION_LABELS).map(([value, label]) => ({ label, value, default: value === section })));
  return { embeds: [guideEmbed(guild, section)], components: [new ActionRowBuilder().addComponents(menu)] };
}

// ───────── الأوامر ─────────
const commands = [
  new SlashCommandBuilder().setName('دليل').setDescription('دليل السيرفر للأعضاء الجدد 📖'),
  new SlashCommandBuilder().setName('ملخص').setDescription('نشرة السيرفر 📰')
    .addStringOption((o) => o.setName('الفترة').setDescription('اختر الفترة').setRequired(true)
      .addChoices({ name: 'اليوم', value: 'day' }, { name: 'الأسبوع', value: 'week' }, { name: 'الشهر', value: 'month' })),
  new SlashCommandBuilder().setName('احصائياتي').setDescription('تفاعلك وترتيبك في السيرفر 📊'),
].map((c) => c.toJSON());

// يرجع true إذا تعامل مع التفاعل
async function handle(i) {
  const guild = i.guild || getGuild();
  if (i.isChatInputCommand()) {
    if (i.commandName === 'دليل') { await i.reply({ ...guidePayload(guild), flags: MessageFlags.Ephemeral }); return true; }
    if (i.commandName === 'ملخص') { await i.reply({ embeds: [buildSummary(guild, i.options.getString('الفترة'))] }); return true; }
    if (i.commandName === 'احصائياتي') { await i.reply({ embeds: [myStats(i.user)], flags: MessageFlags.Ephemeral }); return true; }
    return false;
  }
  if (i.isButton() && i.customId === 'dm_tour_yes') {
    await i.update(guidePayload(guild, 'home'));
    return true;
  }
  if (i.isButton() && i.customId === 'dm_tour_no') {
    await i.update({
      embeds: [new EmbedBuilder().setColor(COLOR).setDescription('ولا يهمك 🤍 إذا احتجت شي بأي وقت اكتب `/دليل` في السيرفر، أو سولف مع **ذكاء الديوانية** في روم «سولف-مع-الذكاء» 🤖')],
      components: [],
    });
    return true;
  }
  if (i.isButton() && i.customId === 'guide_open') {
    await i.reply({ ...guidePayload(guild), flags: MessageFlags.Ephemeral });
    return true;
  }
  if (i.isStringSelectMenu() && i.customId === 'guide_section') {
    await i.update(guidePayload(guild, i.values[0]));
    return true;
  }
  return false;
}

// ───────── كل دقيقة ─────────
async function tick() {
  const guild = getGuild();
  if (!guild) return;
  const d = today();
  for (const vs of guild.voiceStates.cache.values()) {
    if (!vs.channelId || vs.member?.user.bot || vs.channelId === guild.afkChannelId) continue;
    d.voice[vs.id] = (d.voice[vs.id] || 0) + 1;
    dirty = true;
  }
  const t = riyadh();
  if (loaded && t.hour === 23 && t.minute >= 55) {
    if (data.sent.day !== t.date) await sendSummary(guild, 'day');
    if (t.weekday === 'Thu' && data.sent.week !== t.date) await sendSummary(guild, 'week');
    if (dayKey(1).slice(0, 7) !== t.month && data.sent.month !== t.month) await sendSummary(guild, 'month');
  }
  if (t.minute % 10 === 0) await saveData();
}

// ───────── تتبّع الدعوات (مين جاب مين) ─────────
const inviteUses = new Map(); // code -> uses
async function cacheInvites(guild) {
  const invs = await guild.invites.fetch();
  inviteUses.clear();
  for (const inv of invs.values()) inviteUses.set(inv.code, inv.uses || 0);
}
async function findInviter(guild) {
  try {
    const invs = await guild.invites.fetch();
    let inviter = null;
    for (const inv of invs.values()) {
      if ((inv.uses || 0) > (inviteUses.get(inv.code) || 0)) inviter = inv.inviter;
      inviteUses.set(inv.code, inv.uses || 0);
    }
    return inviter;
  } catch (e) {
    console.error('⚠\ufe0f invites:', e.message);
    return null;
  }
}

// ───────── رسالة التعريف الخاصة ─────────
async function sendTour(member) {
  const dm = new EmbedBuilder()
    .setColor(COLOR)
    .setTitle(`🌙 حيّاك الله في ${member.guild.name}!`)
    .setDescription('نورتنا يا الغالي 🤍\n\n**تبي تتعرف على السيرفر؟**')
    .setThumbnail(member.guild.iconURL());
  const dmRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dm_tour_yes').setLabel('إيه، عرّفني').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('dm_tour_no').setLabel('لا، شكرًا').setEmoji('❌').setStyle(ButtonStyle.Secondary),
  );
  try {
    await member.send({ embeds: [dm], components: [dmRow] });
    return true;
  } catch {
    return false; // العضو قافل الخاص
  }
}

// يرسل التعريف مرة وحدة بس لكل الأعضاء اللي كانوا موجودين قبل التحديث
async function tourExistingMembers(guild) {
  if (data.sent.tourAll) return;
  data.sent.tourAll = new Date().toISOString();
  dirty = true;
  await saveData(true);
  const members = await guild.members.fetch().catch(() => null);
  if (!members) return;
  let ok = 0, fail = 0;
  for (const m of members.values()) {
    if (m.user.bot) continue;
    if (await sendTour(m)) ok++; else fail++;
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(`📨 أُرسل التعريف لـ ${ok} عضو (${fail} قافلين الخاص)`);
}

// ───────── التشغيل ─────────
function init(c) {
  client = c;

  client.once('clientReady', async () => {
    const guild = getGuild();
    if (!guild) return console.error('⚠️ community: البوت ليس في أي سيرفر');
    await loadData(guild);
    await newsChannel(guild).catch((e) => console.error('⚠️ newsChannel:', e.message));
    console.log('✅ الدليل والنشرة جاهزين');
    tourExistingMembers(guild).catch((e) => console.error('⚠\ufe0f tourAll:', e.message));
    cacheInvites(guild).catch((e) => console.error('⚠\ufe0f invites (يحتاج صلاحية Manage Server):', e.message));
    setInterval(() => tick().catch((e) => console.error('⚠️ community tick:', e.message)), 60 * 1000);
  });

  client.on('messageCreate', (msg) => {
    if (!msg.guild || msg.author.bot) return;
    const d = today();
    d.messages++;
    d.users[msg.author.id] = (d.users[msg.author.id] || 0) + 1;
    d.channels[msg.channelId] = (d.channels[msg.channelId] || 0) + 1;
    dirty = true;
  });

  client.on('inviteCreate', (inv) => inviteUses.set(inv.code, inv.uses || 0));
  client.on('inviteDelete', (inv) => inviteUses.delete(inv.code));

  client.on('guildMemberAdd', async (member) => {
    if (member.user.bot) return;
    const d0 = today();
    d0.joins++;
    const inviter = await findInviter(member.guild);
    if (inviter && !inviter.bot && inviter.id !== member.id) {
      d0.invites = d0.invites || {};
      d0.invites[inviter.id] = (d0.invites[inviter.id] || 0) + 1;
    }
    dirty = true;
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('guide_open').setLabel('دليل السيرفر').setEmoji('📖').setStyle(ButtonStyle.Primary),
    );
    const e = new EmbedBuilder()
      .setColor(COLOR)
      .setTitle('🎉 حيّاك في الديوانية!')
      .setDescription(`أهلًا ${member}! نوّرت **${member.guild.name}** 🤍\nأنت العضو رقم **${member.guild.memberCount}**\n\nاضغط الزر تحت عشان تعرف السيرفر في دقيقة 👇`)
      .setThumbnail(member.user.displayAvatarURL());
    const ch = welcomeChannel(member.guild);
    if (ch) await ch.send({ content: `${member}`, embeds: [e], components: [row] }).catch((er) => console.error('⚠️ welcome:', er.message));
    await sendTour(member);
  });

  client.on('guildMemberRemove', (member) => {
    if (member.user?.bot) return;
    today().leaves++;
    dirty = true;
  });

  process.on('SIGTERM', async () => {
    await saveData(true);
    process.exit(0);
  });
}

module.exports = { init, handle, commands };
