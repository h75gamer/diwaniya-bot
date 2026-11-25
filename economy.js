// عملات الديوانية 🪙 — رصيد، تحويل، أغنى الأعضاء، متجر رتب، وتحكم كامل لصاحب السيرفر
const {
  EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ChannelType, PermissionFlagsBits,
  SlashCommandBuilder, MessageFlags, AttachmentBuilder,
} = require('discord.js');

const COIN = '🪙';
const COIN_NAME = 'كوينز';
const DATA_CH = 'bot-economy-data';
const MAX = 1000000;
const COLOR = 0xf1c40f;

let client = null;
let data = { bal: {}, bank: {}, work: {}, shop: [], log: [], lastInterest: null };
let loaded = false;
let dirty = false;
let saving = false;

const fmt = (n) => `**${Number(n || 0).toLocaleString('en-US')}** ${COIN}`;
function getGuild() {
  const id = process.env.GUILD_ID;
  return (id && client.guilds.cache.get(id)) || client.guilds.cache.first();
}
// صاحب السيرفر (ومن تحطهم في OWNER_IDS) بس
function isOwner(i) {
  const extra = String(process.env.OWNER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const g = i.guild || getGuild();
  return (g && i.user.id === g.ownerId) || extra.includes(i.user.id);
}

function get(id) { return data.bal[id] || 0; }
function add(id, n, reason = '') {
  if (!id || !Number.isFinite(n) || n === 0) return get(id);
  data.bal[id] = Math.max(0, Math.min(MAX * 100, get(id) + Math.round(n)));
  if (reason) {
    data.log.push({ id, n: Math.round(n), r: String(reason).slice(0, 60), t: Date.now() });
    if (data.log.length > 200) data.log = data.log.slice(-200);
  }
  dirty = true;
  return data.bal[id];
}
function set(id, n) { data.bal[id] = Math.max(0, Math.round(n)); dirty = true; return data.bal[id]; }
const bankOf = (id) => data.bank[id] || 0;
const total = (id) => get(id) + bankOf(id);
function top(n = 10) {
  const ids = new Set([...Object.keys(data.bal), ...Object.keys(data.bank)]);
  return [...ids].map((id) => [id, total(id)]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n);
}
// ───────── البنك 🏦 ─────────
const INTEREST = 0.02;      // 2% يوميًا
const INTEREST_MAX = 100;   // حد أقصى للفايدة اليومية
const WORK_CD = 60 * 60000; // /عمل كل ساعة
const JOBS = [
  ['☕', 'سويت قهوة للديوانية'], ['🚗', 'غسلت سيارات الحارة'], ['📦', 'وصّلت طلبات'], ['💻', 'برمجت موقع لعميل'],
  ['🎨', 'صممت شعار لمتجر'], ['🍔', 'اشتغلت في مطعم برقر'], ['📚', 'درّست طالب رياضيات'], ['🛒', 'رتبت رفوف السوبرماركت'],
  ['🎮', 'جربت لعبة جديدة لشركة'], ['🌴', 'سقيت نخل المزرعة'], ['🔧', 'صلّحت مكيف'], ['🎤', 'قدّمت حفل'],
  ['📸', 'صوّرت مناسبة'], ['🧵', 'خيّطت ثوب'], ['🐪', 'رعيت الإبل'], ['🏗️', 'ساعدت في بناء بيت'],
];
const dayKey = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
function payInterest() {
  if (!loaded) return;
  const d = dayKey();
  if (data.lastInterest === d) return;
  let paid = 0;
  if (data.lastInterest) {
    for (const [id, b] of Object.entries(data.bank)) {
      const x = Math.min(INTEREST_MAX, Math.floor(b * INTEREST));
      if (x > 0) { data.bank[id] = b + x; paid += x; }
    }
  }
  data.lastInterest = d; dirty = true;
  if (paid) console.log(`🏦 فوايد البنك اليوم: ${paid}`);
}

// ───────── الحفظ ─────────
async function dataChannel(g) {
  let ch = g.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === DATA_CH);
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
async function load(g) {
  try {
    const ch = await dataChannel(g);
    const msgs = await ch.messages.fetch({ limit: 10 });
    const m = msgs.filter((x) => x.author.id === client.user.id && x.attachments.size).first();
    if (m) {
      const old = JSON.parse(await (await fetch(m.attachments.first().url)).text());
      data = { ...data, ...old };
      console.log(`🪙 تم تحميل العملات (${Object.keys(data.bal).length} عضو)`);
    }
  } catch (e) { console.error('⚠️ economy load:', e.message); }
  loaded = true;
}
async function save(force = false) {
  if (!loaded || saving || (!dirty && !force)) return;
  saving = true;
  try {
    const ch = await dataChannel(getGuild());
    const sent = await ch.send({ content: '💾 بيانات العملات — لا تحذف هذه الروم', files: [new AttachmentBuilder(Buffer.from(JSON.stringify(data)), { name: 'economy.json' })] });
    dirty = false;
    const old = await ch.messages.fetch({ limit: 10 });
    for (const m of old.values()) if (m.id !== sent.id && m.author.id === client.user.id) await m.delete().catch(() => {});
  } catch (e) { console.error('⚠️ economy save:', e.message); }
  saving = false;
}

// ───────── الأوامر ─────────
const commands = [
  new SlashCommandBuilder().setName('رصيدي').setDescription(`رصيدك من ${COIN_NAME} ${COIN}`)
    .addUserOption((o) => o.setName('عضو').setDescription('تشوف رصيد عضو ثاني').setRequired(false)),
  new SlashCommandBuilder().setName('الأغنى').setDescription(`أغنى أعضاء السيرفر بالـ${COIN_NAME} ${COIN}`),
  new SlashCommandBuilder().setName('تحويل').setDescription(`حوّل ${COIN_NAME} لعضو ثاني 💸`)
    .addUserOption((o) => o.setName('عضو').setDescription('لمين؟').setRequired(true))
    .addIntegerOption((o) => o.setName('كمية').setDescription('كم؟').setRequired(true).setMinValue(1).setMaxValue(MAX)),
  new SlashCommandBuilder().setName('متجر').setDescription(`متجر الديوانية — اشترِ رتب بالـ${COIN_NAME} 🛒`),
  new SlashCommandBuilder().setName('بنك').setDescription('🏦 بنك الديوانية — إيداع وسحب وفوايد يومية')
    .addSubcommand((s) => s.setName('كشف').setDescription('كشف حسابك في البنك'))
    .addSubcommand((s) => s.setName('ايداع').setDescription('تودع من محفظتك للبنك (فاضي = الكل)')
      .addIntegerOption((o) => o.setName('كمية').setDescription('كم؟ (اتركه فاضي تودع الكل)').setMinValue(1).setMaxValue(MAX * 100)))
    .addSubcommand((s) => s.setName('سحب').setDescription('تسحب من البنك لمحفظتك (فاضي = الكل)')
      .addIntegerOption((o) => o.setName('كمية').setDescription('كم؟ (اتركه فاضي تسحب الكل)').setMinValue(1).setMaxValue(MAX * 100))),
  new SlashCommandBuilder().setName('عمل').setDescription(`💼 اشتغل واكسب ${COIN_NAME} (كل ساعة)`),
  new SlashCommandBuilder().setName('عملات').setDescription('التحكم بعملات السيرفر (لصاحب السيرفر بس) 👑')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => s.setName('اعط').setDescription('تعطي عضو كوينز')
      .addUserOption((o) => o.setName('عضو').setDescription('العضو').setRequired(true))
      .addIntegerOption((o) => o.setName('كمية').setDescription('الكمية').setRequired(true).setMinValue(1).setMaxValue(MAX))
      .addStringOption((o) => o.setName('سبب').setDescription('السبب (اختياري)').setRequired(false)))
    .addSubcommand((s) => s.setName('خذ').setDescription('تخصم كوينز من عضو')
      .addUserOption((o) => o.setName('عضو').setDescription('العضو').setRequired(true))
      .addIntegerOption((o) => o.setName('كمية').setDescription('الكمية').setRequired(true).setMinValue(1).setMaxValue(MAX))
      .addStringOption((o) => o.setName('سبب').setDescription('السبب (اختياري)').setRequired(false)))
    .addSubcommand((s) => s.setName('حدد').setDescription('تحدد رصيد عضو برقم معيّن')
      .addUserOption((o) => o.setName('عضو').setDescription('العضو').setRequired(true))
      .addIntegerOption((o) => o.setName('كمية').setDescription('الرصيد الجديد').setRequired(true).setMinValue(0).setMaxValue(MAX)))
    .addSubcommand((s) => s.setName('اعط-الكل').setDescription('توزّع كوينز على كل أعضاء السيرفر 🎁')
      .addIntegerOption((o) => o.setName('كمية').setDescription('لكل عضو').setRequired(true).setMinValue(1).setMaxValue(10000)))
    .addSubcommand((s) => s.setName('متجر-اضف').setDescription('تضيف رتبة للمتجر بسعر')
      .addRoleOption((o) => o.setName('رتبة').setDescription('الرتبة').setRequired(true))
      .addIntegerOption((o) => o.setName('سعر').setDescription('السعر').setRequired(true).setMinValue(1).setMaxValue(MAX)))
    .addSubcommand((s) => s.setName('متجر-احذف').setDescription('تشيل رتبة من المتجر')
      .addRoleOption((o) => o.setName('رتبة').setDescription('الرتبة').setRequired(true)))
    .addSubcommand((s) => s.setName('سجل').setDescription('آخر حركات العملات 📜')),
].map((c) => c.toJSON());

function shopEmbed(g) {
  const items = data.shop.filter((x) => g.roles.cache.has(x.roleId));
  const e = new EmbedBuilder().setColor(COLOR).setTitle('🛒 متجر الديوانية')
    .setDescription(items.length
      ? `${items.map((x, k) => `**${k + 1}.** <@&${x.roleId}> — ${fmt(x.price)}`).join('\n')}\n\nاختار من القائمة تحت عشان تشتري 👇\nتجمع ${COIN_NAME} من الفعاليات والتحديات و \`/يومي\``
      : 'المتجر فاضي للحين 😅 صاحب السيرفر يضيف رتب قريب!');
  const rows = items.length ? [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('eco_buy')
    .setPlaceholder('🛍️ اختار الرتبة اللي تبي تشتريها')
    .addOptions(items.slice(0, 25).map((x) => ({ label: (g.roles.cache.get(x.roleId)?.name || 'رتبة').slice(0, 90), description: `${x.price} ${COIN_NAME}`, value: x.roleId, emoji: '🏷️' }))))] : [];
  return { embeds: [e], components: rows };
}

async function handle(i) {
  if (i.isStringSelectMenu() && i.customId === 'eco_buy') {
    const g = i.guild;
    const item = data.shop.find((x) => x.roleId === i.values[0]);
    const role = item && g.roles.cache.get(item.roleId);
    if (!role) return i.reply({ content: 'هالرتبة ما عادت موجودة 😅', flags: MessageFlags.Ephemeral }).then(() => true);
    const member = await g.members.fetch(i.user.id).catch(() => null);
    if (!member) return true;
    if (member.roles.cache.has(role.id)) return i.reply({ content: `عندك رتبة ${role} من قبل 😉`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } }).then(() => true);
    if (get(i.user.id) < item.price) return i.reply({ content: `محفظتك ${fmt(get(i.user.id))} وما تكفي 😅 تحتاج ${fmt(item.price)}${bankOf(i.user.id) ? `\n🏦 عندك ${fmt(bankOf(i.user.id))} بالبنك — اسحب بـ \`/بنك سحب\`` : ''}`, flags: MessageFlags.Ephemeral }).then(() => true);
    try {
      await member.roles.add(role, 'شراء من المتجر');
    } catch {
      return i.reply({ content: '⚠️ ما قدرت أعطيك الرتبة — رتبة البوت لازم تكون فوقها. بلّغ الإدارة 🙏', flags: MessageFlags.Ephemeral }).then(() => true);
    }
    add(i.user.id, -item.price, `شراء رتبة ${role.name}`);
    await i.reply({ content: `🎉 مبروك! اشتريت ${role} بـ ${fmt(item.price)}\nرصيدك الحين: ${fmt(get(i.user.id))}`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    return true;
  }
  if (!i.isChatInputCommand()) return false;
  const g = i.guild || getGuild();
  const n = i.commandName;

  if (n === 'رصيدي') {
    const u = i.options.getUser('عضو') || i.user;
    const rank = top(100000).findIndex(([id]) => id === u.id) + 1;
    await i.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setAuthor({ name: u.displayName || u.username, iconURL: u.displayAvatarURL() })
      .setTitle(`${COIN} الرصيد`).setDescription(`👛 المحفظة: ${fmt(get(u.id))}\n🏦 البنك: ${fmt(bankOf(u.id))}\n💰 المجموع: ${fmt(total(u.id))}\n🏅 الترتيب: **${rank ? `#${rank}` : '—'}**\n\nتجمع ${COIN_NAME} من \`/عمل\` والفعاليات 🎯 والتحديات و \`/يومي\`\nحطها في \`/بنك\` تزيد ${Math.round(INTEREST * 100)}% كل يوم 📈 • واصرفها في \`/متجر\` 🛒`)] });
    return true;
  }
  if (n === 'الأغنى') {
    const medals = ['🥇', '🥈', '🥉'];
    const lines = top(10).map(([id, v], k) => `${medals[k] || `**${k + 1}.**`} <@${id}> — ${fmt(v)}`);
    await i.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle(`💰 أغنى أعضاء ${g.name}`)
      .setDescription(lines.join('\n') || 'محد عنده كوينز للحين — شاركوا في الفعاليات! 🎯')], allowedMentions: { parse: [] } });
    return true;
  }
  if (n === 'تحويل') {
    const u = i.options.getUser('عضو');
    const amt = i.options.getInteger('كمية');
    if (u.bot || u.id === i.user.id) return i.reply({ content: 'ما يصير 😅 اختار عضو ثاني', flags: MessageFlags.Ephemeral }).then(() => true);
    if (get(i.user.id) < amt) return i.reply({ content: `محفظتك ${fmt(get(i.user.id))} وما تكفي 😅${bankOf(i.user.id) ? ' — اسحب من البنك أول بـ `/بنك سحب`' : ''}`, flags: MessageFlags.Ephemeral }).then(() => true);
    add(i.user.id, -amt, `تحويل لـ ${u.id}`);
    add(u.id, amt, `تحويل من ${i.user.id}`);
    await i.reply({ content: `💸 ${i.user} حوّل ${fmt(amt)} لـ ${u}`, allowedMentions: { users: [u.id] } });
    return true;
  }
  if (n === 'متجر') {
    await i.reply(shopEmbed(g));
    return true;
  }
  if (n === 'عمل') {
    const last = data.work[i.user.id] || 0;
    const left = last + WORK_CD - Date.now();
    if (left > 0) return i.reply({ content: `😮‍💨 تعبان! ارتاح شوي وارجع اشتغل <t:${Math.floor((last + WORK_CD) / 1000)}:R>`, flags: MessageFlags.Ephemeral }).then(() => true);
    const [em, job] = JOBS[Math.floor(Math.random() * JOBS.length)];
    const pay = 20 + Math.floor(Math.random() * 41);
    data.work[i.user.id] = Date.now();
    add(i.user.id, pay);
    await i.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setDescription(`${em} ${i.user} ${job} وأخذ ${fmt(pay)}\n👛 محفظتك: ${fmt(get(i.user.id))}\n\n💡 أودعها بـ \`/بنك ايداع\` عشان تزيد كل يوم 📈`)] });
    return true;
  }
  if (n === 'بنك') {
    const sub = i.options.getSubcommand();
    const id = i.user.id;
    if (sub === 'كشف') {
      const daily = Math.min(INTEREST_MAX, Math.floor(bankOf(id) * INTEREST));
      await i.reply({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('🏦 بنك الديوانية — كشف حساب')
        .setDescription(`👛 المحفظة: ${fmt(get(id))}\n🏦 رصيد البنك: ${fmt(bankOf(id))}\n💰 المجموع: ${fmt(total(id))}\n\n📈 الفايدة: **${Math.round(INTEREST * 100)}%** يوميًا (حدها ${INTEREST_MAX} ${COIN})\nفايدتك بكرة: ${fmt(daily)}\n\n\`/بنك ايداع\` • \`/بنك سحب\``)], flags: MessageFlags.Ephemeral });
      return true;
    }
    const want = i.options.getInteger('كمية');
    if (sub === 'ايداع') {
      const amt = want ?? get(id);
      if (amt <= 0 || get(id) < amt) return i.reply({ content: `محفظتك ${fmt(get(id))} — ما تكفي 😅`, flags: MessageFlags.Ephemeral }).then(() => true);
      data.bal[id] = get(id) - amt; data.bank[id] = bankOf(id) + amt; dirty = true;
      await i.reply({ content: `🏦 أودعت ${fmt(amt)}\n👛 المحفظة: ${fmt(get(id))} • 🏦 البنك: ${fmt(bankOf(id))}`, flags: MessageFlags.Ephemeral });
      return true;
    }
    if (sub === 'سحب') {
      const amt = want ?? bankOf(id);
      if (amt <= 0 || bankOf(id) < amt) return i.reply({ content: `رصيد البنك ${fmt(bankOf(id))} — ما يكفي 😅`, flags: MessageFlags.Ephemeral }).then(() => true);
      data.bank[id] = bankOf(id) - amt; data.bal[id] = get(id) + amt; dirty = true;
      await i.reply({ content: `💸 سحبت ${fmt(amt)}\n👛 المحفظة: ${fmt(get(id))} • 🏦 البنك: ${fmt(bankOf(id))}`, flags: MessageFlags.Ephemeral });
      return true;
    }
  }
  if (n === 'عملات') {
    if (!isOwner(i)) return i.reply({ content: '👑 هذا الأمر لصاحب السيرفر بس.', flags: MessageFlags.Ephemeral }).then(() => true);
    const sub = i.options.getSubcommand();
    const u = i.options.getUser('عضو');
    const amt = i.options.getInteger('كمية');
    const why = i.options.getString('سبب');
    if (sub === 'اعط') {
      add(u.id, amt, `من الإدارة${why ? `: ${why}` : ''}`);
      await i.reply({ content: `✅ ${u} أخذ ${fmt(amt)}${why ? ` — ${why}` : ''} 🎉\nرصيده الحين: ${fmt(get(u.id))}`, allowedMentions: { users: [u.id] } });
      return true;
    }
    if (sub === 'خذ') {
      const taken = Math.min(amt, get(u.id));
      add(u.id, -taken, `خصم من الإدارة${why ? `: ${why}` : ''}`);
      await i.reply({ content: `➖ انخصم ${fmt(taken)} من ${u}${why ? ` — ${why}` : ''}\nرصيده الحين: ${fmt(get(u.id))}`, flags: MessageFlags.Ephemeral });
      return true;
    }
    if (sub === 'حدد') {
      set(u.id, amt);
      data.log.push({ id: u.id, n: amt, r: 'تحديد الرصيد من الإدارة', t: Date.now() });
      await i.reply({ content: `✏️ صار رصيد ${u} ${fmt(amt)}`, flags: MessageFlags.Ephemeral });
      return true;
    }
    if (sub === 'اعط-الكل') {
      await i.deferReply();
      const members = await g.members.fetch().catch(() => g.members.cache);
      let c = 0;
      for (const m of members.values()) { if (m.user.bot) continue; add(m.id, amt); c++; }
      data.log.push({ id: 'all', n: amt, r: `توزيع على ${c} عضو`, t: Date.now() });
      await i.editReply(`🎁 وزّعت ${fmt(amt)} على **${c}** عضو! شوفوا رصيدكم بـ \`/رصيدي\``);
      return true;
    }
    if (sub === 'متجر-اضف') {
      const role = i.options.getRole('رتبة');
      const price = i.options.getInteger('سعر');
      const me = g.members.me;
      if (role.managed || role.id === g.id) return i.reply({ content: 'هالرتبة ما تنفع للمتجر 😅', flags: MessageFlags.Ephemeral }).then(() => true);
      const warn = me && role.position >= me.roles.highest.position ? '\n⚠️ انتبه: رتبة البوت لازم تكون **فوق** هالرتبة عشان يقدر يعطيها — ارفع رتبة البوت من الإعدادات.' : '';
      data.shop = data.shop.filter((x) => x.roleId !== role.id);
      data.shop.push({ roleId: role.id, price });
      data.shop.sort((a, b) => a.price - b.price);
      dirty = true;
      await i.reply({ content: `🛒 انضافت ${role} للمتجر بسعر ${fmt(price)}${warn}`, flags: MessageFlags.Ephemeral });
      return true;
    }
    if (sub === 'متجر-احذف') {
      const role = i.options.getRole('رتبة');
      data.shop = data.shop.filter((x) => x.roleId !== role.id);
      dirty = true;
      await i.reply({ content: `🗑️ انشالت ${role} من المتجر`, flags: MessageFlags.Ephemeral });
      return true;
    }
    if (sub === 'سجل') {
      const lines = data.log.slice(-15).reverse().map((x) => `${x.n >= 0 ? '➕' : '➖'} ${x.id === 'all' ? 'الكل' : `<@${x.id}>`} ${Math.abs(x.n)} ${COIN} — ${x.r} <t:${Math.floor(x.t / 1000)}:R>`);
      await i.reply({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('📜 آخر حركات العملات').setDescription(lines.join('\n') || 'ما فيه حركات للحين')], flags: MessageFlags.Ephemeral });
      return true;
    }
  }
  return false;
}

function init(c) {
  client = c;
  client.once('clientReady', async () => {
    const g = getGuild();
    if (g) await load(g);
    payInterest();
    setInterval(() => { payInterest(); save().catch(() => {}); }, 60 * 1000);
    console.log('🪙 نظام العملات جاهز');
  });
  process.on('SIGTERM', () => { save(true).catch(() => {}); });
}

module.exports = { init, handle, commands, get, add, set, top, fmt, isOwner, bankOf, total, COIN, COIN_NAME };
