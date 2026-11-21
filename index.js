// بوت ديوانية 🌙 — قرآن وأذكار وسوالف
require('dotenv').config();
const http = require('http');
const { Readable } = require('stream');
const {
  Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, ActivityType, ChannelType,
  PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const {
  joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus,
  NoSubscriberBehavior, VoiceConnectionStatus, entersState, StreamType,
} = require('@discordjs/voice');
const D = require('./data');
const C = require('./community');

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const DEFAULT_RADIO = process.env.DEFAULT_RADIO || 'afasy';
const CITY = process.env.CITY || 'Riyadh';
if (!TOKEN) { console.error('❌ متغير DISCORD_TOKEN غير موجود'); process.exit(1); }

const GOLD = 0xf5b942, PURPLE = 0x6a33b8, GREEN = 0x1f9d55;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const riyadhNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Riyadh' }));
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const nospace = (s) => s.replace(/\s/g, '');

// ───────── خادم ويب صغير (عشان Render) ─────────
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('🌙 بوت الديوانية شغّال');
}).listen(PORT, () => console.log(`🌐 Web on ${PORT}`));
if (process.env.RENDER_EXTERNAL_URL) {
  setInterval(() => fetch(process.env.RENDER_EXTERNAL_URL).catch(() => {}), 10 * 60 * 1000);
}

// ───────── روابط سور القرّاء من mp3quran ─────────
const reciterServers = {};
async function loadReciters() {
  try {
    const r = await fetch('https://www.mp3quran.net/api/v3/reciters?language=ar');
    const j = await r.json();
    for (const [key, rec] of Object.entries(D.RECITERS)) {
      const found = j.reciters.find((x) => nospace(x.name) === nospace(rec.name));
      if (!found) continue;
      const full = found.moshaf.filter((m) => m.surah_total === 114);
      const m = full.find((x) => x.name.includes('حفص عن عاصم - مرتل')) || full[0];
      if (m) reciterServers[key] = m.server.endsWith('/') ? m.server : `${m.server}/`;
    }
    console.log(`📖 تم تحميل ${Object.keys(reciterServers).length} قارئ`);
  } catch (e) { console.error('⚠️ فشل تحميل القرّاء:', e.message); }
}
const surahUrl = (key, n) => reciterServers[key] && `${reciterServers[key]}${String(n).padStart(3, '0')}.mp3`;

// ───────── الصوت ─────────
const voice = new Map(); // guildId -> { connection, player, mode, radioKey, channelId, stopped }

function getState(guild) {
  let s = voice.get(guild.id);
  if (!s) {
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    s = { player, connection: null, mode: null, radioKey: DEFAULT_RADIO, channelId: null, stopped: false };
    player.on(AudioPlayerStatus.Idle, () => onIdle(guild));
    player.on('stateChange', (o, n) => { if (o.status !== n.status) console.log(`🔊 المشغّل: ${o.status} → ${n.status}`); });
    player.on('error', (e) => { console.error('🔊 خطأ صوت:', e.message); setTimeout(() => onIdle(guild), 3000); });
    voice.set(guild.id, s);
  }
  return s;
}

async function connect(guild, channel) {
  const s = getState(guild);
  if (s.connection && s.channelId === channel.id &&
      s.connection.state.status !== VoiceConnectionStatus.Destroyed) return s;
  if (s.connection) { try { s.connection.destroy(); } catch {} }
  const connection = joinVoiceChannel({
    channelId: channel.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true,
  });
  connection.on('stateChange', (o, n) => { if (o.status !== n.status) console.log(`🎧 الاتصال الصوتي: ${o.status} → ${n.status}`); });
  connection.on('error', (e) => console.error('🎧 خطأ الاتصال الصوتي:', e.message));
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch { try { connection.destroy(); } catch {} s.connection = null; if (!s.stopped) setTimeout(() => autoJoin(guild), 5000); }
  });
  await entersState(connection, VoiceConnectionStatus.Ready, 20000);
  connection.subscribe(s.player);
  s.connection = connection; s.channelId = channel.id;
  return s;
}

async function playUrl(s, url) {
  s.startedAt = Date.now();
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (DiwaniyaBot)' }, redirect: 'follow' });
  console.log(`🌐 ${url} → ${r.status} ${r.headers.get('content-type') || ''}`);
  if (!r.ok || !r.body) throw new Error(`الرابط رجّع ${r.status}`);
  const res = createAudioResource(Readable.fromWeb(r.body), { inputType: StreamType.Arbitrary });
  res.playStream.on('error', (e) => console.error('🔊 خطأ البث:', e.message));
  s.player.play(res);
}

async function startRadio(guild, channel, key) {
  const s = await connect(guild, channel);
  const rec = key === 'khashia' ? D.KHASHIA_RADIO : D.RECITERS[key] || D.RECITERS[DEFAULT_RADIO];
  s.mode = 'radio'; s.radioKey = key; s.stopped = false;
  await playUrl(s, rec.radio);
  return rec;
}

function onIdle(guild) {
  const s = voice.get(guild.id);
  if (!s || s.stopped || !s.connection) return;
  const ch = guild.channels.cache.get(s.channelId);
  if (!ch) return;
  // بعد ما تخلص السورة (أو تنقطع الإذاعة) يرجع للإذاعة تلقائيًا
  const quick = Date.now() - (s.startedAt || 0) < 15000;
  if (quick) console.log('⚠️ التشغيل وقف بسرعة، نعيد المحاولة بعد 15 ثانية');
  setTimeout(() => {
    startRadio(guild, ch, s.mode === 'radio' ? s.radioKey : (s.radioKey || DEFAULT_RADIO))
      .catch((e) => console.error('⚠️ فشل تشغيل الإذاعة:', e.message));
  }, quick ? 15000 : 1000);
}

const quranChannel = (guild) => guild.channels.cache.find(
  (c) => c.type === ChannelType.GuildVoice && c.name.includes('القرآن'),
);
async function autoJoin(guild) {
  const ch = quranChannel(guild);
  if (!ch) return;
  try { await startRadio(guild, ch, voice.get(guild.id)?.radioKey || DEFAULT_RADIO); console.log(`📻 الإذاعة شغالة في ${ch.name}`); }
  catch (e) { console.error('⚠️ ما قدرت أدخل روم القرآن:', e.message); }
}

// ───────── مواقيت الصلاة ─────────
const PRAYERS = { Fajr: 'الفجر', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
let todayTimes = null; let jafariTimes = null; let timesDate = '';
// method 4 = تقويم أم القرى، method 0 = التقويم الجعفري
async function fetchTimes(city = CITY, method = 4) {
  const r = await fetch(`https://api.aladhan.com/v1/timingsByCity?city=${encodeURIComponent(city)}&country=Saudi%20Arabia&method=${method}`);
  const j = await r.json();
  const t = {};
  for (const k of Object.keys(PRAYERS)) t[k] = String(j.data.timings[k]).slice(0, 5);
  t.Sunrise = String(j.data.timings.Sunrise).slice(0, 5);
  return { t, hijri: j.data.date?.hijri };
}
async function refreshTimes() {
  try {
    todayTimes = (await fetchTimes(CITY, 4)).t;
    jafariTimes = (await fetchTimes(CITY, 0)).t;
    timesDate = riyadhNow().toDateString();
  }
  catch (e) { console.error('⚠️ فشل جلب المواقيت:', e.message); }
}

// ───────── آية عشوائية ─────────
async function randomAyah() {
  const n = 1 + Math.floor(Math.random() * 6236);
  const r = await fetch(`https://api.alquran.cloud/v1/ayah/${n}/quran-uthmani`);
  const j = await r.json();
  return { text: j.data.text, surah: j.data.surah.name, num: j.data.numberInSurah };
}
const ayahEmbed = (a) => new EmbedBuilder().setColor(GREEN).setTitle('📖 آية')
  .setDescription(`﴿ ${a.text} ﴾`).setFooter({ text: `${a.surah} • آية ${a.num}` });
const ayahRow = () => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('ayah_new').setLabel('آية ثانية').setEmoji('🔁').setStyle(ButtonStyle.Secondary),
);

// ───────── المسبحة ─────────
const tasbihEmbed = (n, k = 0) => new EmbedBuilder().setColor(GOLD).setTitle('📿 المسبحة')
  .setDescription(`## ${D.TASBIH[k % D.TASBIH.length]}\n\nالعدد: **${n}**`)
  .setFooter({ text: 'سبّح بالطريقة اللي تعرفها — زر «ذكر ثاني» يغيّر الذكر' });
const tasbihRow = (n, k = 0) => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`tasbih:${n}:${k}`).setLabel('سبّح').setEmoji('📿').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId(`tasbih_next:${k}`).setLabel('ذكر ثاني').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId(`tasbih_reset:${k}`).setLabel('تصفير').setStyle(ButtonStyle.Secondary),
);

// ───────── الأوامر ─────────
const reciterChoices = Object.entries(D.RECITERS).map(([k, v]) => ({ name: v.name, value: k }));
const commands = [
  new SlashCommandBuilder().setName('قران').setDescription('شغّل سورة في الروم الصوتي 📖')
    .addIntegerOption((o) => o.setName('السورة').setDescription('اختر السورة').setRequired(true).setAutocomplete(true))
    .addStringOption((o) => o.setName('القارئ').setDescription('اختر القارئ').addChoices(...reciterChoices)),
  new SlashCommandBuilder().setName('اذاعة').setDescription('إذاعة قرآن 24 ساعة في الروم الصوتي 📻')
    .addStringOption((o) => o.setName('القارئ').setDescription('اختر القارئ')
      .addChoices({ name: 'تلاوات خاشعة (منوّع)', value: 'khashia' }, ...reciterChoices.slice(0, 24))),
  new SlashCommandBuilder().setName('ايقاف').setDescription('إيقاف التلاوة وخروج البوت من الصوتي ⏹️')
    .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers),
  new SlashCommandBuilder().setName('اية').setDescription('آية عشوائية من القرآن الكريم 📖'),
  new SlashCommandBuilder().setName('ذكر').setDescription('ذكر من الأذكار 📿'),
  new SlashCommandBuilder().setName('دعاء').setDescription('دعاء من القرآن الكريم 🤲'),
  new SlashCommandBuilder().setName('مسبحة').setDescription('مسبحة إلكترونية 📿'),
  new SlashCommandBuilder().setName('مواقيت').setDescription('مواقيت الصلاة اليوم 🕌')
    .addStringOption((o) => o.setName('المدينة').setDescription('اختر المدينة').addChoices(
      { name: 'الرياض', value: 'Riyadh' }, { name: 'مكة المكرمة', value: 'Makkah' }, { name: 'المدينة المنورة', value: 'Madinah' },
      { name: 'جدة', value: 'Jeddah' }, { name: 'الدمام', value: 'Dammam' }, { name: 'بريدة', value: 'Buraydah' },
      { name: 'أبها', value: 'Abha' }, { name: 'تبوك', value: 'Tabuk' }, { name: 'حائل', value: 'Hail' }, { name: 'الطائف', value: 'Taif' },
    )),
  new SlashCommandBuilder().setName('سالفة').setDescription('موضوع سالفة عشوائي 💬'),
  new SlashCommandBuilder().setName('تحدي').setDescription('تحدي عشوائي 🔥'),
  new SlashCommandBuilder().setName('لو-خيروك').setDescription('سؤال لو خيروك مع تصويت 🤔'),
  new SlashCommandBuilder().setName('قهوة').setDescription('قدّم فنجال قهوة لأحد ☕')
    .addUserOption((o) => o.setName('العضو').setDescription('لمين القهوة؟').setRequired(true)),
  new SlashCommandBuilder().setName('اقتراح').setDescription('ارسل اقتراح للسيرفر 💡')
    .addStringOption((o) => o.setName('النص').setDescription('اكتب اقتراحك').setRequired(true).setMaxLength(1000)),
  new SlashCommandBuilder().setName('معلومات-السيرفر').setDescription('معلومات عن ديوانية 🌙'),
  new SlashCommandBuilder().setName('مين').setDescription('معلومات عن عضو 👤')
    .addUserOption((o) => o.setName('العضو').setDescription('اختر العضو')),
  new SlashCommandBuilder().setName('مساعدة').setDescription('قائمة أوامر بوت الديوانية 📜'),
].map((c) => c.toJSON()).concat(C.commands);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
  ],
});
C.init(client);

client.once('clientReady', async () => {
  console.log(`✅ ${client.user.tag} شغّال!`);
  client.user.setActivity('القرآن الكريم 📖', { type: ActivityType.Listening });
  try {
    if (GUILD_ID) await client.application.commands.set(commands, GUILD_ID);
    else await client.application.commands.set(commands);
    console.log('✅ تم تسجيل الأوامر');
  } catch (e) { console.error('❌ فشل تسجيل الأوامر:', e.message); }
  await loadReciters();
  await refreshTimes();
  for (const g of client.guilds.cache.values()) autoJoin(g);
  setInterval(tick, 30 * 1000);
});

const findText = (guild, part) => guild.channels.cache.find(
  (c) => c.type === ChannelType.GuildText && c.name.includes(part),
);

client.on('interactionCreate', async (i) => {
  try {
    if (await C.handle(i)) return;
    // اقتراحات أسماء السور
    if (i.isAutocomplete()) {
      const q = String(i.options.getFocused() || '').trim();
      const list = D.SURAHS.map((n, idx) => ({ name: `${idx + 1}. ${n}`, value: idx + 1 }))
        .filter((x) => !q || x.name.includes(q)).slice(0, 25);
      return i.respond(list);
    }
    if (i.isButton()) {
      if (i.customId === 'ayah_new') return i.update({ embeds: [ayahEmbed(await randomAyah())], components: [ayahRow()] });
      if (i.customId.startsWith('tasbih:')) {
        const [, a, b] = i.customId.split(':');
        const n = Number(a) + 1, k = Number(b || 0);
        return i.update({ embeds: [tasbihEmbed(n, k)], components: [tasbihRow(n, k)] });
      }
      if (i.customId.startsWith('tasbih_next')) {
        const k = (Number(i.customId.split(':')[1] || 0) + 1) % D.TASBIH.length;
        return i.update({ embeds: [tasbihEmbed(0, k)], components: [tasbihRow(0, k)] });
      }
      if (i.customId.startsWith('tasbih_reset')) {
        const k = Number(i.customId.split(':')[1] || 0);
        return i.update({ embeds: [tasbihEmbed(0, k)], components: [tasbihRow(0, k)] });
      }
      return;
    }
    if (!i.isChatInputCommand()) return;

    switch (i.commandName) {
      case 'قران': {
        const n = i.options.getInteger('السورة');
        const key = i.options.getString('القارئ') || DEFAULT_RADIO;
        if (n < 1 || n > 114) return i.reply({ content: 'اختر سورة من القائمة 📖', ephemeral: true });
        const ch = i.member.voice?.channel || quranChannel(i.guild);
        if (!ch) return i.reply({ content: 'ادخل روم صوتي أول 🎧', ephemeral: true });
        if (!Object.keys(reciterServers).length) await loadReciters();
        const url = surahUrl(key, n);
        if (!url) return i.reply({ content: '⚠️ ما قدرت أجيب تلاوة هذا القارئ الحين، جرّب قارئ ثاني.', ephemeral: true });
        await i.deferReply();
        const s = await connect(i.guild, ch);
        s.mode = 'surah'; s.stopped = false;
        await playUrl(s, url);
        const e = new EmbedBuilder().setColor(GREEN).setTitle(`📖 سورة ${D.SURAHS[n - 1]}`)
          .setDescription(`بصوت القارئ **${D.RECITERS[key].name}**\nفي ${ch} 🎧`)
          .setFooter({ text: 'بعد ما تخلص السورة ترجع الإذاعة تلقائيًا' });
        return i.editReply({ embeds: [e] });
      }
      case 'اذاعة': {
        const key = i.options.getString('القارئ') || DEFAULT_RADIO;
        const ch = i.member.voice?.channel || quranChannel(i.guild);
        if (!ch) return i.reply({ content: 'ادخل روم صوتي أول 🎧', ephemeral: true });
        await i.deferReply();
        const rec = await startRadio(i.guild, ch, key);
        return i.editReply(`📻 إذاعة **${rec.name}** شغالة 24 ساعة في ${ch}`);
      }
      case 'ايقاف': {
        const s = voice.get(i.guild.id);
        if (!s?.connection) return i.reply({ content: 'البوت مو في روم صوتي.', ephemeral: true });
        s.stopped = true; s.player.stop(true); s.connection.destroy(); s.connection = null;
        return i.reply('⏹️ تم الإيقاف. شغّل `/اذاعة` متى ما بغيت.');
      }
      case 'اية': {
        await i.deferReply();
        return i.editReply({ embeds: [ayahEmbed(await randomAyah())], components: [ayahRow()] });
      }
      case 'ذكر':
        return i.reply({ embeds: [new EmbedBuilder().setColor(GOLD).setTitle('📿 ذكر').setDescription(`**${pick(D.ADHKAR)}**`)] });
      case 'دعاء': {
        const d = pick(D.DUAS);
        return i.reply({ embeds: [new EmbedBuilder().setColor(GREEN).setTitle('🤲 دعاء من القرآن').setDescription(`﴿ ${d.t} ﴾`).setFooter({ text: d.s })] });
      }
      case 'مسبحة':
        return i.reply({ embeds: [tasbihEmbed(0)], components: [tasbihRow(0)] });
      case 'مواقيت': {
        const city = i.options.getString('المدينة') || CITY;
        await i.deferReply();
        const { t, hijri } = await fetchTimes(city, 4);
        const j = (await fetchTimes(city, 0)).t;
        const both = (k) => (t[k] === j[k] ? t[k] : `${t[k]} • ${j[k]}`);
        const label = { Riyadh: 'الرياض', Makkah: 'مكة المكرمة', Madinah: 'المدينة المنورة', Jeddah: 'جدة', Dammam: 'الدمام', Buraydah: 'بريدة', Abha: 'أبها', Tabuk: 'تبوك', Hail: 'حائل', Taif: 'الطائف' }[city] || city;
        const e = new EmbedBuilder().setColor(GREEN).setTitle(`🕌 مواقيت الصلاة — ${label}`)
          .addFields(
            { name: 'الفجر', value: both('Fajr'), inline: true }, { name: 'الشروق', value: t.Sunrise, inline: true },
            { name: 'الظهر', value: both('Dhuhr'), inline: true }, { name: 'العصر', value: both('Asr'), inline: true },
            { name: 'المغرب', value: both('Maghrib'), inline: true }, { name: 'العشاء', value: both('Isha'), inline: true },
          )
          .setDescription('إذا فيه وقتين: الأول **تقويم أم القرى** والثاني **التقويم الجعفري**');
        if (hijri) e.setFooter({ text: `${hijri.day} ${hijri.month?.ar} ${hijri.year} هـ` });
        return i.editReply({ embeds: [e] });
      }
      case 'سالفة':
        return i.reply({ embeds: [new EmbedBuilder().setColor(PURPLE).setTitle('💬 سالفة').setDescription(`**${pick(D.SAWALIF)}**`).setFooter({ text: 'ردّوا وخلّوا السالفة تولّع 🔥' })] });
      case 'تحدي':
        return i.reply({ embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('🔥 تحدي!').setDescription(`${i.user} تحدّيك:\n**${pick(D.TAHADDI)}**`)] });
      case 'لو-خيروك': {
        const [a, b] = pick(D.KHAYROOK);
        const e = new EmbedBuilder().setColor(GOLD).setTitle('🤔 لو خيروك…').setDescription(`🅰️ ${a}\n\n**أو**\n\n🅱️ ${b}`).setFooter({ text: 'صوّت بالرياكشن 👇' });
        await i.reply({ embeds: [e] });
        const msg = await i.fetchReply();
        await msg.react('🅰️'); await msg.react('🅱️');
        return;
      }
      case 'قهوة': {
        const u = i.options.getUser('العضو');
        if (u.id === i.user.id) return i.reply('تصب لنفسك؟ 😂 قلّط وأنا أصب لك ☕');
        return i.reply(`${i.user} ${pick(D.QAHWA)} لـ ${u} — حيّاك الله 🌙`);
      }
      case 'اقتراح': {
        const text = i.options.getString('النص');
        const ch = findText(i.guild, 'اقتراحات') || i.channel;
        const e = new EmbedBuilder().setColor(0x2ecc71).setTitle('💡 اقتراح جديد').setDescription(text)
          .setAuthor({ name: i.user.displayName, iconURL: i.user.displayAvatarURL() }).setTimestamp();
        const m = await ch.send({ embeds: [e] });
        await m.react('👍'); await m.react('👎');
        return i.reply({ content: `✅ وصل اقتراحك في ${ch}، شكرًا لك!`, ephemeral: true });
      }
      case 'معلومات-السيرفر': {
        const g = i.guild;
        const e = new EmbedBuilder().setColor(PURPLE).setTitle(`🌙 ${g.name}`).setThumbnail(g.iconURL({ size: 256 }))
          .addFields(
            { name: '👥 الأعضاء', value: `${g.memberCount}`, inline: true },
            { name: '💬 الرومات', value: `${g.channels.cache.size}`, inline: true },
            { name: '🎭 الرتب', value: `${g.roles.cache.size - 1}`, inline: true },
            { name: '📅 تأسس', value: `<t:${Math.floor(g.createdTimestamp / 1000)}:D>`, inline: true },
            { name: '👑 المالك', value: `<@${g.ownerId}>`, inline: true },
          );
        return i.reply({ embeds: [e] });
      }
      case 'مين': {
        const u = i.options.getUser('العضو') || i.user;
        const m = await i.guild.members.fetch(u.id).catch(() => null);
        const e = new EmbedBuilder().setColor(m?.displayColor || GOLD).setTitle(`👤 ${u.displayName}`).setThumbnail(u.displayAvatarURL({ size: 256 }))
          .addFields(
            { name: 'دخل ديسكورد', value: `<t:${Math.floor(u.createdTimestamp / 1000)}:R>`, inline: true },
            { name: 'دخل الديوانية', value: m ? `<t:${Math.floor(m.joinedTimestamp / 1000)}:R>` : '—', inline: true },
            { name: 'الرتب', value: m ? (m.roles.cache.filter((r) => r.id !== i.guild.id).map((r) => `${r}`).join(' ') || 'ما عنده') : '—' },
          );
        return i.reply({ embeds: [e] });
      }
      case 'مساعدة': {
        const e = new EmbedBuilder().setColor(GOLD).setTitle('📜 أوامر بوت الديوانية')
          .addFields(
            { name: '📖 القرآن', value: '`/قران` سورة بصوت قارئ تختاره\n`/اذاعة` إذاعة قرآن 24 ساعة\n`/ايقاف` إيقاف (للمشرفين)\n`/اية` آية عشوائية' },
            { name: '📿 أذكار', value: '`/ذكر` • `/دعاء` • `/مسبحة` • `/مواقيت`' },
            { name: '💬 سوالف', value: '`/سالفة` • `/تحدي` • `/لو-خيروك` • `/قهوة`' },
            { name: '🛠️ أخرى', value: '`/اقتراح` • `/معلومات-السيرفر` • `/مين`' },
            { name: '📰 المجتمع', value: '`/دليل` دليل السيرفر • `/ملخص` نشرة اليوم/الأسبوع/الشهر • `/احصائياتي` تفاعلك وترتيبك' },
            { name: '⏰ تلقائي', value: 'إذاعة قرآن دايمة في روم القرآن • تنبيه بكل صلاة (أم القرى والجعفري) • أذكار الصباح والمساء • آية اليوم • سؤال اليوم 9 مساءً • ترحيب ودليل للأعضاء الجدد • نشرة يومية وأسبوعية وشهرية' },
          );
        return i.reply({ embeds: [e] });
      }
    }
  } catch (err) {
    console.error(err);
    const msg = { content: '⚠️ صار خطأ، جرّب مرة ثانية.', ephemeral: true };
    if (i.isRepliable?.()) { if (i.replied || i.deferred) i.followUp(msg).catch(() => {}); else i.reply(msg).catch(() => {}); }
  }
});

// ───────── المهام التلقائية (توقيت الرياض) ─────────
const done = new Set();
async function post(part, payload) {
  for (const g of client.guilds.cache.values()) {
    const ch = findText(g, part);
    if (ch && ch.permissionsFor(g.members.me)?.has(PermissionFlagsBits.SendMessages)) ch.send(payload).catch(() => {});
  }
}
async function tick() {
  const now = riyadhNow(); const t = hhmm(now); const day = now.toDateString();
  const once = (k) => { const key = `${day}|${k}`; if (done.has(key)) return false; done.add(key); return true; };
  if (timesDate !== day && now.getHours() >= 0) await refreshTimes();

  if (todayTimes) {
    for (const [k, ar] of Object.entries(PRAYERS)) {
      const same = !jafariTimes || jafariTimes[k] === todayTimes[k];
      const alert = (label) => post('أذكار', { embeds: [new EmbedBuilder().setColor(GREEN).setTitle(`🕌 حان الآن موعد صلاة ${ar}`)
        .setDescription('﴿ إِنَّ الصَّلَاةَ كَانَتْ عَلَى الْمُؤْمِنِينَ كِتَابًا مَّوْقُوتًا ﴾ 🤍')
        .setFooter({ text: `${ar} ${t}${label} • توقيت الرياض` })] });
      if (todayTimes[k] === t && once(k)) alert(same ? '' : ' • تقويم أم القرى');
      if (!same && jafariTimes[k] === t && once(`j-${k}`)) alert(' • التقويم الجعفري');
    }
  }
  if (t === '06:30' && once('sabah')) {
    post('أذكار', { embeds: [new EmbedBuilder().setColor(GOLD).setTitle('🌅 أذكار الصباح')
      .setDescription(['أصبحنا وأصبح الملك لله، والحمد لله', ...D.ADHKAR.slice(0, 4)].map((x) => `• ${x}`).join('\n'))] });
  }
  if (t === '17:00' && once('masa')) {
    post('أذكار', { embeds: [new EmbedBuilder().setColor(PURPLE).setTitle('🌇 أذكار المساء')
      .setDescription(['أمسينا وأمسى الملك لله، والحمد لله', ...D.ADHKAR.slice(4, 8)].map((x) => `• ${x}`).join('\n'))] });
  }
  if (t === '08:00' && once('ayah')) {
    try { const a = await randomAyah(); post('أذكار', { content: '📖 **آية اليوم**', embeds: [ayahEmbed(a)] }); } catch {}
  }
  if (now.getDay() === 5 && t === '10:00' && once('kahf')) {
    post('أذكار', { embeds: [new EmbedBuilder().setColor(GREEN).setTitle('🕌 جمعة مباركة')
      .setDescription('لا تنسون القرآن والدعاء، والإكثار من الصلاة على محمد وآل محمد 🤍\nاكتب `/قران` واختر السورة اللي تحبها وتسمعها في الروم الصوتي 🎧')] });
  }
  if (t === '21:00' && once('q')) {
    const q = D.DAILY_QUESTIONS[Math.floor(now.getTime() / 86400000) % D.DAILY_QUESTIONS.length];
    post('الدردشة-العامة', { embeds: [new EmbedBuilder().setColor(PURPLE).setTitle('🌙 سؤال اليوم').setDescription(`**${q}**`).setFooter({ text: 'جاوب تحت 👇' })] });
  }
}

process.on('unhandledRejection', (e) => console.error('unhandled:', e?.message || e));
client.login(TOKEN);
