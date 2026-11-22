// نمو الديوانية 🌱 — روم الشراكات + سهرة الألعاب الأسبوعية
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  PermissionFlagsBits, SlashCommandBuilder, MessageFlags,
} = require('discord.js');

const COLOR = 0xf5b942;
const TZ = 'Asia/Riyadh';
const PARTNERS_CHANNEL = '🤝│شراكات';
const GN_ROLE = '🎮 سهرة الألعاب';
// موعد سهرة الألعاب (توقيت الرياض) — يتغير من Environment في Render إذا حبيت
const GN_DAY = process.env.GAME_NIGHT_DAY || 'Thu';      // Sun Mon Tue Wed Thu Fri Sat
const GN_TIME = process.env.GAME_NIGHT_TIME || '21:30';  // HH:MM
const DAY_AR = { Sun: 'الأحد', Mon: 'الاثنين', Tue: 'الثلاثاء', Wed: 'الأربعاء', Thu: 'الخميس', Fri: 'الجمعة', Sat: 'السبت' };
let client = null;
const sentOnce = new Set();

function riyadh() {
  const p = {};
  for (const x of new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(new Date())) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hm: `${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}`, weekday: p.weekday };
}
function minusHour(hm) {
  const [h, m] = hm.split(':').map(Number);
  return `${String((h + 23) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
function to12(hm) {
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'صباحًا' : 'مساءً'}`;
}
const WHEN = () => `كل **${DAY_AR[GN_DAY] || GN_DAY}** الساعة **${to12(GN_TIME)}** بتوقيت الرياض`;

function getGuild() {
  const id = process.env.GUILD_ID;
  return (id && client.guilds.cache.get(id)) || client.guilds.cache.first();
}
const textCh = (g, part) => g.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name.includes(part));
function gameTextChannel(g) { return textCh(g, 'نقاش-الألعاب') || textCh(g, 'الألعاب') || textCh(g, 'الإعلانات') || textCh(g, 'الدردشة'); }
function gameVoiceChannel(g) {
  const v = g.channels.cache.filter((c) => c.type === ChannelType.GuildVoice && !c.name.includes('القرآن') && c.id !== g.afkChannelId);
  return v.find((c) => c.name.includes('ألعاب') || c.name.includes('العاب')) || v.find((c) => c.name.includes('السوالف')) || v.first();
}

// ───────── روم الشراكات ─────────
function partnersEmbed() {
  return new EmbedBuilder().setColor(COLOR).setTitle('🤝 شراكات ديوانية')
    .setDescription([
      'هنا سيرفرات صديقة نتبادل معها الإعلان 🌙',
      '',
      '**شروط الشراكة:**',
      '• سيرفر عربي ونظيف — لا محتوى مخالف ولا طائفية ولا عنصرية',
      '• إعلاننا ينزل عندكم في روم شراكات، وإعلانكم ينزل هنا',
      '• تبي شراكة؟ افتح تذكرة **🤝 طلب شراكة** من روم 🎫│فتح-تذكرة',
    ].join('\n'));
}

async function ensurePartners(g) {
  const existing = textCh(g, 'شراكات');
  if (existing) {
    // تحديث رسالة الشروط القديمة إذا كانت تقول «كلّم الإدارة بالخاص»
    const pins = await Promise.resolve().then(() => (existing.messages.fetchPins ? existing.messages.fetchPins().then((r) => r.items?.map((x) => x.message) ?? r) : existing.messages.fetchPinned())).catch(() => null);
    const old = pins?.find((m) => m.author.id === client.user.id && m.embeds[0]?.description?.includes('كلّم الإدارة بالخاص'));
    if (old) await old.edit({ embeds: [partnersEmbed()] }).catch(() => {});
    return;
  }
  const near = textCh(g, 'الإعلانات');
  const ch = await g.channels.create({
    name: PARTNERS_CHANNEL,
    type: ChannelType.GuildText,
    parent: near?.parentId || undefined,
    topic: 'سيرفرات صديقة ندعمها وتدعمنا 🤝',
    permissionOverwrites: [
      { id: g.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ManageMessages] },
    ],
  });
  const msg = await ch.send({ embeds: [partnersEmbed()] });
  await msg.pin().catch(() => {});
}

// ───────── سهرة الألعاب ─────────
async function ensureRole(g) {
  let role = g.roles.cache.find((r) => r.name === GN_ROLE);
  if (!role) role = await g.roles.create({ name: GN_ROLE, color: 0x57f287, mentionable: true, reason: 'تنبيهات سهرة الألعاب' });
  return role;
}

const toggleRow = () => new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('gn_toggle').setLabel('نبّهني بالسهرة').setEmoji('🔔').setStyle(ButtonStyle.Success),
);

async function announce(kind) {
  const g = getGuild();
  if (!g) return;
  const ch = gameTextChannel(g);
  if (!ch) return;
  const role = await ensureRole(g).catch(() => null);
  const vc = gameVoiceChannel(g);
  const e = new EmbedBuilder().setColor(0x57f287);
  if (kind === 'soon') {
    e.setTitle('🎮 بعد ساعة: سهرة الألعاب!')
      .setDescription(`جهّزوا أنفسكم يا شباب 🔥\nالسهرة تبدأ الساعة **${to12(GN_TIME)}**${vc ? ` في <#${vc.id}>` : ''}\n\nاقترحوا اللعبة اللي تبون نلعبها هنا 👇`);
  } else {
    e.setTitle('🎮 بدأت سهرة الألعاب!')
      .setDescription(`يلا ادخلوا${vc ? ` <#${vc.id}>` : ' الروم الصوتي'} 🎧\nاللي يحب يلعب يحيّاه، واللي يحب يسولف بعد يحيّاه 😄`);
  }
  e.setFooter({ text: `سهرة الألعاب ${WHEN().replace(/\*\*/g, '')} • اضغط 🔔 عشان يوصلك تنبيه` });
  await ch.send({
    content: role ? `<@&${role.id}>` : undefined,
    embeds: [e],
    components: [toggleRow()],
    allowedMentions: { roles: role ? [role.id] : [] },
  }).catch((er) => console.error('⚠️ game night:', er.message));
}

function tick() {
  const t = riyadh();
  if (t.weekday !== GN_DAY) return;
  const key = (k) => `${t.date}-${k}`;
  if (t.hm === minusHour(GN_TIME) && !sentOnce.has(key('soon'))) { sentOnce.add(key('soon')); announce('soon'); }
  if (t.hm === GN_TIME && !sentOnce.has(key('start'))) { sentOnce.add(key('start')); announce('start'); }
}

// ───────── الأوامر ─────────
const commands = [
  new SlashCommandBuilder().setName('سهرة').setDescription('موعد سهرة الألعاب الأسبوعية وتفعيل التنبيه 🎮'),
].map((c) => c.toJSON());

async function handle(i) {
  if (i.isChatInputCommand() && i.commandName === 'سهرة') {
    await i.reply({
      embeds: [new EmbedBuilder().setColor(0x57f287).setTitle('🎮 سهرة الألعاب الأسبوعية')
        .setDescription(`${WHEN()}\n\nقبلها بساعة ينزل تنبيه، ووقت البداية ينزل تنبيه ثاني.\nاضغط 🔔 عشان يوصلك منشن — واضغطه مرة ثانية إذا تبي توقفه.`)],
      components: [toggleRow()],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  if (i.isButton() && i.customId === 'gn_toggle') {
    const g = i.guild || getGuild();
    const role = await ensureRole(g);
    const member = await g.members.fetch(i.user.id);
    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role);
      await i.reply({ content: '🔕 وقّفنا تنبيهات سهرة الألعاب عنك.', flags: MessageFlags.Ephemeral });
    } else {
      await member.roles.add(role);
      await i.reply({ content: `🔔 أبشر! بيوصلك تنبيه قبل السهرة (${WHEN().replace(/\*\*/g, '')}).`, flags: MessageFlags.Ephemeral });
    }
    return true;
  }
  return false;
}

function init(c) {
  client = c;
  client.once('clientReady', async () => {
    const g = getGuild();
    if (!g) return;
    await ensurePartners(g).catch((e) => console.error('⚠️ partners:', e.message));
    await ensureRole(g).catch((e) => console.error('⚠️ gn role:', e.message));
    console.log(`🌱 الشراكات وسهرة الألعاب جاهزة (${GN_DAY} ${GN_TIME})`);
    setInterval(tick, 30 * 1000);
  });
}

module.exports = { init, handle, commands };
