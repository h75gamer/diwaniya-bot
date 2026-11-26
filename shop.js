// متجر الخدمات 🛍️ — روم خاص، روم فويس خاص، رتبة باسمك ولونك — بعملات الديوانية
// صاحب الروم يدعو ويطرد ويغيّر الاسم بأمر /روم • الرومات تنتهي بعد المدة إذا ما تجددت
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, ChannelType, PermissionFlagsBits, MessageFlags, AttachmentBuilder,
} = require('discord.js');
const ECO = require('./economy');

const P = PermissionFlagsBits;
const COLOR = 0xd9a441;
const DATA_CH = 'bot-shop-data';
const CATEGORY = '🏠 الرومات الخاصة';
const DAYS = 7;
const MAX_GUESTS = 15;
const BOY = '👦 أولاد'; const GIRL = '👧 بنات';
// الأسعار (تتغير من Environment في Render إذا حبيت)
const PRICE = {
  text: Number(process.env.PRICE_TEXT_ROOM) || 1500,
  voice: Number(process.env.PRICE_VOICE_ROOM) || 2000,
  role: Number(process.env.PRICE_CUSTOM_ROLE) || 2500,
};
const ITEMS = {
  text: { label: 'روم خاص (كتابي)', emoji: '🏠', desc: `${DAYS} أيام • تدعو فيه اللي تبي` },
  voice: { label: 'روم فويس خاص', emoji: '🎙️', desc: `${DAYS} أيام • تدعو فيه اللي تبي` },
  role: { label: 'رتبة باسمك ولونك', emoji: '🎨', desc: 'دايمة • تختار الاسم واللون' },
};

let client = null;
let data = { rooms: {}, roles: {} }; // rooms[uid] = { text:{id,exp,warned}, voice:{id,exp,warned}, guests:[] } • roles[uid] = roleId
let loaded = false; let dirty = false; let saving = false;
const mark = () => { dirty = true; };
const getGuild = () => (process.env.GUILD_ID ? client.guilds.cache.get(process.env.GUILD_ID) : client.guilds.cache.first());
const fmt = (n) => ECO.fmt(n);

// ───────── الحفظ ─────────
async function dataChannel(g) {
  let ch = g.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === DATA_CH);
  if (!ch) {
    ch = await g.channels.create({ name: DATA_CH, type: ChannelType.GuildText, permissionOverwrites: [
      { id: g.roles.everyone.id, deny: [P.ViewChannel] },
      { id: client.user.id, allow: [P.ViewChannel, P.SendMessages, P.AttachFiles, P.ReadMessageHistory, P.ManageMessages] },
    ] });
  }
  return ch;
}
async function load(g) {
  try {
    const ch = await dataChannel(g);
    const m = (await ch.messages.fetch({ limit: 10 })).filter((x) => x.author.id === client.user.id && x.attachments.size).first();
    if (m) data = { ...data, ...JSON.parse(await (await fetch(m.attachments.first().url)).text()) };
  } catch (e) { console.error('⚠️ shop load:', e.message); }
  loaded = true;
}
async function save() {
  if (!loaded || saving || !dirty) return;
  saving = true;
  try {
    const ch = await dataChannel(getGuild());
    const sent = await ch.send({ content: '💾 بيانات الرومات الخاصة — لا تحذف هذه الروم', files: [new AttachmentBuilder(Buffer.from(JSON.stringify(data)), { name: 'shop.json' })] });
    dirty = false;
    for (const m of (await ch.messages.fetch({ limit: 10 })).values()) if (m.id !== sent.id && m.author.id === client.user.id) await m.delete().catch(() => {});
  } catch (e) { console.error('⚠️ shop save:', e.message); }
  saving = false;
}

// ───────── أدوات ─────────
async function category(g) {
  let cat = g.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === CATEGORY);
  if (!cat) {
    cat = await g.channels.create({ name: CATEGORY, type: ChannelType.GuildCategory, permissionOverwrites: [
      { id: g.roles.everyone.id, deny: [P.ViewChannel] },
      botOw(g),
    ] });
  }
  return cat;
}
function genderOf(member) {
  if (!member) return null;
  if (member.roles.cache.some((r) => r.name === BOY)) return 'boy';
  if (member.roles.cache.some((r) => r.name === GIRL)) return 'girl';
  return null;
}
const ownerPerms = (type) => (type === 'voice'
  ? [P.ViewChannel, P.Connect, P.Speak, P.Stream, P.UseVAD, P.MuteMembers, P.MoveMembers, P.SendMessages, P.ReadMessageHistory]
  : [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks, P.AddReactions, P.ManageMessages]);
const guestPerms = (type) => (type === 'voice'
  ? [P.ViewChannel, P.Connect, P.Speak, P.Stream, P.UseVAD, P.SendMessages, P.ReadMessageHistory]
  : [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks, P.AddReactions]);
const rel = (t) => `<t:${Math.floor(t / 1000)}:R>`;
// ديسكورد يرفض إن البوت يعطي صلاحية ما يملكها — نفلتر حسب صلاحياته
const safe = (g, arr) => arr.filter((p) => g.members.me.permissions.has(p));
const botOw = (g) => ({ id: client.user.id, allow: safe(g, [P.ViewChannel, P.ManageChannels, P.Connect, P.SendMessages, P.ReadMessageHistory, P.EmbedLinks]) });

async function createRoom(g, member, type) {
  const cat = await category(g);
  const rec = data.rooms[member.id] || (data.rooms[member.id] = { guests: [] });
  const name = type === 'voice' ? `🎙️ فويس ${member.displayName}`.slice(0, 90) : `🏠│${member.displayName}`.slice(0, 90);
  const ow = [
    { id: g.roles.everyone.id, deny: [P.ViewChannel] },
    botOw(g),
    { id: member.id, allow: safe(g, ownerPerms(type)) },
    ...rec.guests.filter((id) => g.members.cache.has(id)).map((id) => ({ id, allow: safe(g, guestPerms(type)) })),
  ];
  const ch = await g.channels.create({ name, type: type === 'voice' ? ChannelType.GuildVoice : ChannelType.GuildText, parent: cat.id, permissionOverwrites: ow, reason: `روم خاص لـ ${member.user.tag}` });
  rec[type] = { id: ch.id, exp: Date.now() + DAYS * 86400000, warned: false };
  mark();
  return ch;
}

// ───────── المتجر (يتعرض داخل /متجر) ─────────
function serviceRow() {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sh_buy').setPlaceholder('🛍️ الخدمات: روم خاص • فويس خاص • رتبة باسمك')
    .addOptions(Object.entries(ITEMS).map(([k, v]) => ({ label: `${v.label} — ${PRICE[k]}`, description: v.desc, value: k, emoji: v.emoji }))));
}
function serviceText() {
  return `\n\n**🛍️ الخدمات:**\n${Object.entries(ITEMS).map(([k, v]) => `${v.emoji} **${v.label}** — ${fmt(PRICE[k])} • ${v.desc}`).join('\n')}\n_تتحكم في رومك بأمر_ \`/روم\``;
}

async function buy(i, kind) {
  const g = i.guild; const member = await g.members.fetch(i.user.id).catch(() => null);
  if (!member) return;
  const price = PRICE[kind];
  if (ECO.get(i.user.id) < price) {
    return i.reply({ content: `محفظتك ${fmt(ECO.get(i.user.id))} وما تكفي 😅 تحتاج ${fmt(price)}${ECO.bankOf(i.user.id) ? `\n🏦 عندك ${fmt(ECO.bankOf(i.user.id))} بالبنك — اسحب بـ \`/بنك سحب\`` : ''}`, flags: MessageFlags.Ephemeral });
  }
  if (kind === 'role') {
    const modal = new ModalBuilder().setCustomId('sh_role').setTitle('🎨 رتبتك الخاصة').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('اسم الرتبة').setStyle(TextInputStyle.Short).setMaxLength(24).setMinLength(2).setRequired(true).setPlaceholder('مثال: 👑 أسطورة الديوانية')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('color').setLabel('اللون (كود مثل #ff5a8a أو اسم: أحمر، أزرق...)').setStyle(TextInputStyle.Short).setMaxLength(12).setRequired(true).setPlaceholder('#d9a441')),
    );
    return i.showModal(modal);
  }
  const rec = data.rooms[i.user.id];
  const cur = rec?.[kind] && g.channels.cache.get(rec[kind].id);
  if (cur) {
    // عنده روم: نمدد المدة
    ECO.add(i.user.id, -price, `تمديد ${ITEMS[kind].label}`);
    rec[kind].exp = Math.max(rec[kind].exp, Date.now()) + DAYS * 86400000; rec[kind].warned = false; mark();
    return i.reply({ content: `⏫ تمدد ${cur} ${DAYS} أيام زيادة — ينتهي ${rel(rec[kind].exp)}\nرصيدك: ${fmt(ECO.get(i.user.id))}`, flags: MessageFlags.Ephemeral });
  }
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  let ch;
  try { ch = await createRoom(g, member, kind); } catch (e) {
    console.error('⚠️ room create:', e.message, e.rawError?.errors ? JSON.stringify(e.rawError.errors).slice(0, 300) : '');
    return i.editReply('⚠️ ما قدرت أسوي الروم — البوت يحتاج صلاحية **إدارة الرومات (Manage Channels)**. بلّغ الإدارة 🙏 (ما انخصم منك شي)');
  }
  ECO.add(i.user.id, -price, `شراء ${ITEMS[kind].label}`);
  await i.editReply(`🎉 مبروك! رومك جاهز: ${ch}\n⏰ ينتهي ${rel(data.rooms[i.user.id][kind].exp)} (تقدر تمدده من المتجر)\n\n**تحكم فيه:**\n\`/روم دعوة\` تدعو أحد • \`/روم طرد\` تشيل أحد • \`/روم اسم\` تغيّر الاسم • \`/روم معلومات\``);
  if (kind === 'text') ch.send({ content: `🏠 حيّاك في رومك يا ${member}! هنا محد يشوف إلا اللي تدعوه بـ \`/روم دعوة\``, allowedMentions: { users: [member.id] } }).catch(() => {});
}

const COLORS = { أحمر: '#e74c3c', أزرق: '#3498db', أخضر: '#2ecc71', أصفر: '#f1c40f', ذهبي: '#d9a441', بنفسجي: '#9b59b6', وردي: '#ff6fae', برتقالي: '#e67e22', أسود: '#23272a', أبيض: '#f5f5f5', سماوي: '#5ec8f2', رمادي: '#95a5a6' };
async function roleModal(i) {
  const g = i.guild; const member = await g.members.fetch(i.user.id);
  let name = i.fields.getTextInputValue('name').replace(/@|<|>|https?:\S+|discord\.gg\S*/gi, '').trim();
  let color = i.fields.getTextInputValue('color').trim();
  color = COLORS[color] || color;
  if (!/^#?[0-9a-f]{6}$/i.test(color)) return i.reply({ content: '🎨 اللون لازم يكون كود مثل `#ff5a8a` أو اسم مثل: أحمر، أزرق، ذهبي، وردي...', flags: MessageFlags.Ephemeral });
  if (name.length < 2) return i.reply({ content: '✋ اكتب اسم للرتبة (حرفين أو أكثر).', flags: MessageFlags.Ephemeral });
  if (g.roles.cache.some((r) => r.name === name && r.id !== data.roles[i.user.id])) return i.reply({ content: '😅 فيه رتبة بنفس الاسم، اختار اسم ثاني.', flags: MessageFlags.Ephemeral });
  if (ECO.get(i.user.id) < PRICE.role) return i.reply({ content: `محفظتك ما تكفي 😅 تحتاج ${fmt(PRICE.role)}`, flags: MessageFlags.Ephemeral });
  const hex = color.startsWith('#') ? color : `#${color}`;
  try {
    let role = data.roles[i.user.id] && g.roles.cache.get(data.roles[i.user.id]);
    if (role) await role.edit({ name, color: hex, reason: 'تعديل رتبة مشتراة' });
    else {
      const me = g.members.me;
      role = await g.roles.create({ name, color: hex, permissions: [], hoist: false, mentionable: false, reason: `رتبة مشتراة لـ ${i.user.tag}` });
      await role.setPosition(Math.max(1, me.roles.highest.position - 1)).catch(() => {});
      data.roles[i.user.id] = role.id; mark();
    }
    await member.roles.add(role);
    ECO.add(i.user.id, -PRICE.role, 'شراء رتبة مخصصة');
    return i.reply({ content: `🎨 مبروك! رتبتك ${role} جاهزة\nتبي تغيّر الاسم أو اللون؟ اشترها مرة ثانية من المتجر وتتعدل نفس الرتبة`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  } catch (e) {
    console.error('⚠️ custom role:', e.message);
    return i.reply({ content: '⚠️ ما قدرت أسوي الرتبة — البوت يحتاج صلاحية **إدارة الرتب**. (ما انخصم منك شي)', flags: MessageFlags.Ephemeral });
  }
}

// ───────── أمر /روم ─────────
const commands = [
  new SlashCommandBuilder().setName('روم').setDescription('🏠 تحكم في رومك الخاص (تشتريه من /متجر)')
    .addSubcommand((s) => s.setName('دعوة').setDescription('تدعو أحد لرومك').addUserOption((o) => o.setName('عضو').setDescription('مين؟').setRequired(true)))
    .addSubcommand((s) => s.setName('طرد').setDescription('تشيل أحد من رومك').addUserOption((o) => o.setName('عضو').setDescription('مين؟').setRequired(true)))
    .addSubcommand((s) => s.setName('اسم').setDescription('تغيّر اسم رومك')
      .addStringOption((o) => o.setName('النوع').setDescription('أي روم؟').setRequired(true).addChoices({ name: '🏠 الكتابي', value: 'text' }, { name: '🎙️ الفويس', value: 'voice' }))
      .addStringOption((o) => o.setName('الاسم').setDescription('الاسم الجديد').setRequired(true).setMaxLength(40)))
    .addSubcommand((s) => s.setName('معلومات').setDescription('تشوف رومك ومين فيه ومتى ينتهي'))
    .toJSON(),
];

async function applyGuest(g, rec, uid, allow) {
  for (const type of ['text', 'voice']) {
    const ch = rec[type] && g.channels.cache.get(rec[type].id);
    if (!ch) continue;
    if (allow) await ch.permissionOverwrites.edit(uid, Object.fromEntries(safe(g, guestPerms(type)).map((p) => [Object.keys(P).find((k) => P[k] === p), true])));
    else {
      await ch.permissionOverwrites.delete(uid).catch(() => {});
      if (type === 'voice') { const m = g.members.cache.get(uid); if (m?.voice?.channelId === ch.id) await m.voice.disconnect('انطرد من روم خاص').catch(() => {}); }
    }
  }
}

async function roomCmd(i) {
  const g = i.guild; const sub = i.options.getSubcommand();
  const rec = data.rooms[i.user.id];
  const has = rec && ['text', 'voice'].some((t) => rec[t] && g.channels.cache.get(rec[t].id));
  if (!has) return i.reply({ content: '🏠 ما عندك روم خاص — اشترِ واحد من `/متجر` 🛍️', flags: MessageFlags.Ephemeral });
  if (sub === 'معلومات') {
    const lines = ['text', 'voice'].filter((t) => rec[t] && g.channels.cache.get(rec[t].id)).map((t) => `${ITEMS[t].emoji} <#${rec[t].id}> — ينتهي ${rel(rec[t].exp)}`);
    return i.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🏠 رومك الخاص').setDescription(`${lines.join('\n')}\n\n👥 المدعوين (${rec.guests.length}/${MAX_GUESTS}): ${rec.guests.length ? rec.guests.map((id) => `<@${id}>`).join(' ') : 'ما فيه أحد'}`)], flags: MessageFlags.Ephemeral });
  }
  if (sub === 'دعوة' || sub === 'طرد') {
    const u = i.options.getUser('عضو');
    if (u.bot || u.id === i.user.id) return i.reply({ content: '😅 اختار عضو ثاني.', flags: MessageFlags.Ephemeral });
    if (sub === 'دعوة') {
      if (rec.guests.includes(u.id)) return i.reply({ content: `${u} مدعو من قبل 😉`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
      if (rec.guests.length >= MAX_GUESTS) return i.reply({ content: `👥 وصلت الحد (${MAX_GUESTS} مدعو). اطرد أحد أول.`, flags: MessageFlags.Ephemeral });
      const me = await g.members.fetch(i.user.id); const them = await g.members.fetch(u.id).catch(() => null);
      if (!them) return i.reply({ content: 'هالعضو مب في السيرفر 🤔', flags: MessageFlags.Ephemeral });
      // احترام نظام الأقسام: الدعوة لنفس القسم بس
      const ga = genderOf(me); const gb = genderOf(them);
      if (ga && gb && ga !== gb) return i.reply({ content: '🚻 الرومات الخاصة لنفس القسم بس (أولاد مع أولاد وبنات مع بنات) — حسب قوانين السيرفر.', flags: MessageFlags.Ephemeral });
      rec.guests.push(u.id); mark();
      await applyGuest(g, rec, u.id, true);
      return i.reply({ content: `✅ دعيت ${u} لرومك 🏠`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }
    if (!rec.guests.includes(u.id)) return i.reply({ content: `${u} مب مدعو أصلًا`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    rec.guests = rec.guests.filter((x) => x !== u.id); mark();
    await applyGuest(g, rec, u.id, false);
    return i.reply({ content: `🚪 شلت ${u} من رومك`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
  }
  if (sub === 'اسم') {
    const type = i.options.getString('النوع');
    const ch = rec[type] && g.channels.cache.get(rec[type].id);
    if (!ch) return i.reply({ content: `ما عندك ${ITEMS[type].label} 😅`, flags: MessageFlags.Ephemeral });
    const name = i.options.getString('الاسم').replace(/@|https?:\S+|discord\.gg\S*/gi, '').trim().slice(0, 40);
    if (!name) return i.reply({ content: 'اكتب اسم صالح 🙏', flags: MessageFlags.Ephemeral });
    await ch.setName(type === 'voice' ? `🎙️ ${name}` : `🏠│${name}`).catch(() => {});
    return i.reply({ content: `✏️ صار اسم رومك ${ch}`, flags: MessageFlags.Ephemeral });
  }
  return true;
}

async function handle(i) {
  if (i.isStringSelectMenu() && i.customId === 'sh_buy') { await buy(i, i.values[0]); return true; }
  if (i.isModalSubmit() && i.customId === 'sh_role') { await roleModal(i); return true; }
  if (i.isChatInputCommand() && i.commandName === 'روم') { await roomCmd(i); return true; }
  return false;
}

// ───────── انتهاء الرومات ─────────
async function checkExpiry() {
  const g = getGuild(); if (!g || !loaded) return;
  for (const [uid, rec] of Object.entries(data.rooms)) {
    for (const type of ['text', 'voice']) {
      const r = rec[type]; if (!r) continue;
      const ch = g.channels.cache.get(r.id);
      if (!ch) { delete rec[type]; mark(); continue; }
      if (!r.warned && r.exp - Date.now() < 86400000) {
        r.warned = true; mark();
        client.users.fetch(uid).then((u) => u.send(`⏰ ${ITEMS[type].emoji} رومك **${ch.name}** في الديوانية ينتهي ${rel(r.exp)} — مدده من \`/متجر\` بـ ${PRICE[type]} عملة`)).catch(() => {});
      }
      if (Date.now() > r.exp) {
        await ch.delete('انتهت مدة الروم الخاص').catch(() => {});
        delete rec[type]; mark();
        client.users.fetch(uid).then((u) => u.send(`🏠 انتهت مدة رومك (${ITEMS[type].label}) وانحذف. تقدر تشتري واحد جديد من \`/متجر\` 🛍️`)).catch(() => {});
      }
    }
    if (!rec.text && !rec.voice) { delete data.rooms[uid]; mark(); }
  }
}

function init(c) {
  client = c;
  client.once('clientReady', async () => {
    const g = getGuild(); if (!g) return;
    await load(g);
    setInterval(save, 30000).unref();
    setInterval(() => checkExpiry().catch((e) => console.error('⚠️ shop expiry:', e.message)), 10 * 60000).unref();
    setTimeout(() => checkExpiry().catch(() => {}), 60000).unref();
  });
}

module.exports = { init, handle, commands, serviceRow, serviceText, PRICE };
