// نظام التذاكر 🎫 — استفسار / دعم / شكوى / طلب شراكة
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder,
  ChannelType, PermissionFlagsBits, MessageFlags, AttachmentBuilder,
} = require('discord.js');

const COLOR = 0xf5b942;
const PANEL_CHANNEL = '🎫│فتح-تذكرة';
const CATEGORY = '📂 التذاكر';
const LOG_CHANNEL = '📁│سجل-التذاكر';

const TYPES = {
  ask: { label: 'استفسار', emoji: '❓', desc: 'سؤال عن السيرفر أو القوانين أو البوت' },
  help: { label: 'دعم فني', emoji: '🛠️', desc: 'مشكلة في روم أو رتبة أو البوت' },
  report: { label: 'شكوى', emoji: '⚠️', desc: 'بلاغ عن عضو أو تصرف مخالف' },
  partner: { label: 'طلب شراكة', emoji: '🤝', desc: 'تبي شراكة بين سيرفرك وديوانية' },
};

let client = null;
const busy = new Set(); // يمنع فتح تذكرتين بنفس اللحظة

function getGuild() {
  const id = process.env.GUILD_ID;
  return (id && client.guilds.cache.get(id)) || client.guilds.cache.first();
}
const textCh = (g, part) => g.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name.includes(part));

// الإدارة = أي رتبة (مو رتبة بوت) عندها صلاحية إدارة الرسائل أو أعلى
function staffRoles(g) {
  return g.roles.cache.filter((r) => !r.managed && r.id !== g.roles.everyone.id && (
    r.permissions.has(PermissionFlagsBits.Administrator)
    || r.permissions.has(PermissionFlagsBits.ManageGuild)
    || r.permissions.has(PermissionFlagsBits.ManageMessages)));
}
function isStaff(member) {
  if (!member) return false;
  if (member.id === member.guild.ownerId) return true;
  return member.permissions.has(PermissionFlagsBits.ManageMessages) || member.permissions.has(PermissionFlagsBits.Administrator);
}
const BOT_PERMS = [
  PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageMessages,
];
const MEMBER_PERMS = [
  PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles, PermissionFlagsBits.EmbedLinks,
];
function privateOverwrites(g) {
  return [
    { id: g.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: client.user.id, allow: BOT_PERMS },
    ...staffRoles(g).map((r) => ({ id: r.id, allow: MEMBER_PERMS })),
  ];
}

// ───────── التجهيز ─────────
async function ensureCategory(g) {
  let cat = g.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === CATEGORY);
  if (!cat) cat = await g.channels.create({ name: CATEGORY, type: ChannelType.GuildCategory, permissionOverwrites: privateOverwrites(g) });
  return cat;
}
async function ensureLog(g) {
  let ch = textCh(g, 'سجل-التذاكر');
  if (!ch) {
    const cat = await ensureCategory(g);
    ch = await g.channels.create({
      name: LOG_CHANNEL, type: ChannelType.GuildText, parent: cat.id,
      topic: 'نسخة من كل تذكرة تنقفل 📁 (للإدارة فقط)', permissionOverwrites: privateOverwrites(g),
    });
  }
  return ch;
}

function panelPayload() {
  const menu = new StringSelectMenuBuilder().setCustomId('tk_open').setPlaceholder('اختر نوع التذكرة 👇')
    .addOptions(Object.entries(TYPES).map(([value, t]) => ({ label: t.label, value, emoji: t.emoji, description: t.desc })));
  return {
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🎫 تذاكر ديوانية')
      .setDescription([
        'تحتاج الإدارة؟ افتح تذكرة وننتبه لك بأسرع وقت 🌙',
        '',
        ...Object.values(TYPES).map((t) => `${t.emoji} **${t.label}** — ${t.desc}`),
        '',
        '• التذكرة روم خاص بينك وبين الإدارة بس',
        '• تذكرة وحدة مفتوحة لكل عضو',
        '• لا تفتح تذكرة للمزح 🙏',
      ].join('\n'))],
    components: [new ActionRowBuilder().addComponents(menu)],
  };
}

async function ensurePanel(g) {
  let ch = textCh(g, 'فتح-تذكرة');
  if (!ch) {
    const near = textCh(g, 'شراكات') || textCh(g, 'الإعلانات');
    ch = await g.channels.create({
      name: PANEL_CHANNEL, type: ChannelType.GuildText, parent: near?.parentId || undefined,
      topic: 'افتح تذكرة للإدارة: استفسار، دعم، شكوى، أو طلب شراكة 🎫',
      permissionOverwrites: [
        { id: g.roles.everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], deny: [PermissionFlagsBits.SendMessages] },
        { id: client.user.id, allow: BOT_PERMS },
      ],
    });
  }
  const recent = await ch.messages.fetch({ limit: 20 }).catch(() => null);
  const old = recent?.find((m) => m.author.id === client.user.id && m.components?.[0]?.components?.[0]?.customId === 'tk_open');
  if (old) await old.edit(panelPayload()).catch(() => {});
  else await ch.send(panelPayload());
  return ch;
}

// ───────── فتح تذكرة ─────────
const ownerOf = (ch) => (ch.topic || '').match(/uid:(\d+)/)?.[1];
const typeOf = (ch) => (ch.topic || '').match(/type:(\w+)/)?.[1];
const isTicket = (ch) => ch?.type === ChannelType.GuildText && /uid:\d+/.test(ch.topic || '') && ch.parent?.name === CATEGORY;

function slug(s) {
  return (s || 'عضو').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'عضو';
}

async function sendWelcome(ch, uid, key) {
  const g = ch.guild;
  const t = TYPES[key] || TYPES.ask;
  const lines = [`هلا <@${uid}> 🌙 هذي تذكرتك الخاصة، الإدارة بترد عليك قريب.`, ''];
  if (key === 'partner') {
    lines.push(
      '**🤝 عشان نمشي الشراكة بسرعة، أرسل هنا:**',
      '1️⃣ إعلان سيرفرك جاهز (نص الإعلان + الرابط)',
      '2️⃣ وين بتنزلون إعلاننا عندكم (اسم الروم)',
      '',
      '**الشروط:** سيرفر عربي ونظيف — بدون محتوى مخالف ولا طائفية ولا عنصرية.',
      'بعد الموافقة ينزل إعلانكم في روم الشراكات، وإعلاننا ينزل عندكم 🤍',
    );
  } else if (key === 'report') {
    lines.push('اكتب **مين** و**وش صار** و**وين**، وأرفق صورة إذا عندك 📸', 'بلاغك سري ومحد يشوفه غير الإدارة.');
  } else {
    lines.push('اكتب طلبك بالتفصيل، وأرفق صورة إذا تساعد 📸');
  }
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('tk_claim').setLabel('استلام').setEmoji('🙋').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('tk_close').setLabel('إغلاق').setEmoji('🔒').setStyle(ButtonStyle.Danger),
  );
  await ch.send({
    content: [...new Set([uid, g.ownerId])].map((x) => `<@${x}>`).join(' '),
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle(`${t.emoji} تذكرة ${t.label}`).setDescription(lines.join('\n'))
      .setFooter({ text: 'الإدارة تستلم التذكرة • أي واحد منكم يقدر يقفلها لما تخلص' })],
    components: [row],
    allowedMentions: { users: [...new Set([uid, g.ownerId])] },
  });
}

async function openTicket(i, key) {
  const g = i.guild;
  const t = TYPES[key];
  if (!t) return;
  if (busy.has(i.user.id)) return i.reply({ content: 'لحظة، تذكرتك قاعدة تنفتح ⏳', flags: MessageFlags.Ephemeral });
  const existing = g.channels.cache.find((c) => isTicket(c) && ownerOf(c) === i.user.id);
  if (existing) return i.reply({ content: `عندك تذكرة مفتوحة: <#${existing.id}> 👈`, flags: MessageFlags.Ephemeral });

  busy.add(i.user.id);
  try {
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    const cat = await ensureCategory(g);
    const ch = await g.channels.create({
      name: `${t.emoji}・${slug(t.label)}-${slug(i.user.username)}`,
      type: ChannelType.GuildText,
      parent: cat.id,
      topic: `تذكرة ${t.label} | uid:${i.user.id} | type:${key}`,
      permissionOverwrites: [...privateOverwrites(g), { id: i.user.id, allow: MEMBER_PERMS }],
    });

    try {
      await sendWelcome(ch, i.user.id, key);
    } catch (e) {
      await ch.delete('فشل فتح التذكرة').catch(() => {});
      throw e;
    }
    await i.editReply({ content: `✅ انفتحت تذكرتك: <#${ch.id}>` });
  } catch (e) {
    console.error('⚠️ ticket open:', e.message);
    await i.editReply({ content: 'صار خطأ وما قدرت أفتح التذكرة 😓 جرّب بعد شوي أو كلّم الإدارة.' }).catch(() => {});
  } finally {
    busy.delete(i.user.id);
  }
}

// ───────── إغلاق + سجل ─────────
async function transcript(ch) {
  const all = [];
  let before;
  for (let k = 0; k < 5; k++) {
    const batch = await ch.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || !batch.size) break;
    all.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  all.reverse();
  const fmt = (d) => new Intl.DateTimeFormat('ar-SA-u-nu-latn', { timeZone: 'Asia/Riyadh', dateStyle: 'short', timeStyle: 'short' }).format(d);
  return all.map((m) => {
    const parts = [m.content];
    for (const e of m.embeds) parts.push([e.title, e.description].filter(Boolean).join(' — '));
    for (const a of m.attachments.values()) parts.push(`[مرفق] ${a.url}`);
    return `[${fmt(m.createdAt)}] ${m.author.tag}: ${parts.filter(Boolean).join(' | ')}`;
  }).join('\n');
}

async function closeTicket(i) {
  const ch = i.channel;
  const g = i.guild;
  await i.update({ content: '🔒 تنقفل التذكرة خلال 5 ثواني...', components: [] }).catch(() => {});
  const uid = ownerOf(ch);
  const t = TYPES[typeOf(ch)] || { label: 'تذكرة', emoji: '🎫' };
  try {
    const log = await ensureLog(g);
    const text = await transcript(ch);
    await log.send({
      embeds: [new EmbedBuilder().setColor(0x99aab5).setTitle(`${t.emoji} انقفلت تذكرة ${t.label}`)
        .setDescription(`صاحب التذكرة: <@${uid}>\nقفلها: <@${i.user.id}>\nالروم: \`${ch.name}\``).setTimestamp()],
      files: [new AttachmentBuilder(Buffer.from('\ufeff' + (text || '(فاضية)'), 'utf8'), { name: `${ch.name}.txt` })],
      allowedMentions: { parse: [] },
    });
  } catch (e) { console.error('⚠️ ticket log:', e.message); }
  if (uid && uid !== i.user.id) {
    client.users.fetch(uid).then((u) => u.send(`🎫 انقفلت تذكرتك (${t.label}) في ديوانية. إذا تحتاج شيء ثاني افتح تذكرة جديدة 🤍`)).catch(() => {});
  }
  setTimeout(() => ch.delete('إغلاق تذكرة').catch((e) => console.error('⚠️ ticket delete:', e.message)), 5000);
}

// ───────── التفاعلات ─────────
async function handle(i) {
  if (i.isStringSelectMenu() && i.customId === 'tk_open') {
    await openTicket(i, i.values[0]);
    // نرجّع القائمة فاضية عشان يقدر يختار مرة ثانية
    await i.message.edit(panelPayload()).catch(() => {});
    return true;
  }
  if (!i.isButton() || !i.customId.startsWith('tk_')) return false;
  const ch = i.channel;
  if (!isTicket(ch)) { await i.reply({ content: 'هذا الزر يشتغل داخل التذاكر بس.', flags: MessageFlags.Ephemeral }); return true; }
  const staff = isStaff(i.member);
  const owner = ownerOf(ch) === i.user.id;

  if (i.customId === 'tk_claim') {
    if (!staff) { await i.reply({ content: 'الاستلام للإدارة بس 🙏', flags: MessageFlags.Ephemeral }); return true; }
    await i.reply({ content: `🙋 <@${i.user.id}> استلم التذكرة وبيساعدك.`, allowedMentions: { parse: [] } });
    return true;
  }
  if (i.customId === 'tk_close') {
    if (!staff && !owner) { await i.reply({ content: 'ما تقدر تقفل هذي التذكرة.', flags: MessageFlags.Ephemeral }); return true; }
    await i.reply({
      content: 'متأكد تبي تقفل التذكرة؟ بتنحذف وتنحفظ نسخة منها عند الإدارة.',
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tk_close_yes').setLabel('إيه، اقفلها').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('tk_close_no').setLabel('لا').setStyle(ButtonStyle.Secondary),
      )],
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  if (i.customId === 'tk_close_yes') {
    if (!staff && !owner) return true;
    await closeTicket(i);
    return true;
  }
  if (i.customId === 'tk_close_no') {
    await i.update({ content: 'تمام، التذكرة باقية مفتوحة 👍', components: [] }).catch(() => {});
    return true;
  }
  return false;
}

function init(c) {
  client = c;
  client.once('clientReady', async () => {
    const g = getGuild();
    if (!g) return;
    try {
      await ensureCategory(g);
      await ensureLog(g);
      await ensurePanel(g);
      // إصلاح أي تذكرة انفتحت بدون رسالة البوت (أزرار الإغلاق)
      for (const ch of g.channels.cache.filter(isTicket).values()) {
        const msgs = await ch.messages.fetch({ limit: 10 }).catch(() => null);
        if (msgs && !msgs.some((m) => m.author.id === client.user.id)) {
          await sendWelcome(ch, ownerOf(ch), typeOf(ch)).catch((e) => console.error('⚠️ ticket repair:', e.message));
        }
      }
      console.log('🎫 نظام التذاكر جاهز');
    } catch (e) { console.error('⚠️ tickets:', e.message); }
  });
}

module.exports = { init, handle, commands: [] };
