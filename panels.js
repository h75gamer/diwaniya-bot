// لوحات الاقتصاد 🏦🛒 — رومات ثابتة فيها رسالة من البوت بأزرار: المتجر، البنك، الشغل والمكافآت
// الأزرار تشغّل نفس الأوامر (/متجر /بنك /عمل /يومي /عجلة...) والرد يطلع لك بس (مخفي عن الباقين)
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  ChannelType, PermissionFlagsBits, MessageFlags,
} = require('discord.js');
const ECO = require('./economy');

const P = PermissionFlagsBits;
const COLOR = 0xd9a441;
const CATEGORY = '💰 اقتصاد الديوانية';
const CH = { shop: '🛒│المتجر', bank: '🏦│البنك', earn: '💼│الشغل-والمكافآت' };
const BOY = '👦 أولاد'; const GIRL = '👧 بنات';
let client = null;
const getGuild = () => (process.env.GUILD_ID ? client.guilds.cache.get(process.env.GUILD_ID) : client.guilds.cache.first());
const C = () => ECO.COIN_NAME;

// ───────── تحويل الزر لأمر (نعيد استخدام نفس منطق الأوامر) ─────────
const eph = (x) => (typeof x === 'string' ? { content: x, flags: MessageFlags.Ephemeral } : { ...x, flags: (typeof x.flags === 'number' ? x.flags : 0) | MessageFlags.Ephemeral });
function asCommand(i, name, { sub = null, opts = {} } = {}) {
  const options = {
    getSubcommand: () => sub, getSubcommandGroup: () => null,
    getInteger: (k) => opts[k] ?? null, getNumber: (k) => opts[k] ?? null, getString: (k) => opts[k] ?? null,
    getUser: (k) => opts[k] ?? null, getMember: (k) => opts[k] ?? null, getRole: () => null, getChannel: () => null, getBoolean: (k) => opts[k] ?? null,
  };
  return new Proxy(i, {
    get(t, p) {
      if (p === 'isChatInputCommand' || p === 'isCommand') return () => true;
      if (['isButton', 'isStringSelectMenu', 'isModalSubmit', 'isAutocomplete', 'isAnySelectMenu', 'isMessageComponent'].includes(p)) return () => false;
      if (p === 'commandName') return name;
      if (p === 'options') return options;
      if (p === 'reply') return (x) => t.reply(eph(x));
      if (p === 'deferReply') return (x = {}) => t.deferReply({ ...x, flags: MessageFlags.Ephemeral });
      if (p === 'followUp') return (x) => t.followUp(eph(x));
      const v = Reflect.get(t, p, t);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
}
async function run(i, name, extra) {
  const px = asCommand(i, name, extra);
  for (const mod of ['./economy', './events', './polls']) {
    try { if (await require(mod).handle(px)) return; } catch (e) { console.error(`⚠️ panel ${name}:`, e.message); }
  }
}

// ───────── اللوحات ─────────
function shopPanel(g) {
  const base = ECO.shopEmbed ? ECO.shopEmbed(g) : { embeds: [], components: [] };
  const e = EmbedBuilder.from(base.embeds[0] || new EmbedBuilder()).setTitle('🛒 متجر الديوانية')
    .setFooter({ text: 'اختار من القوائم تحت — الشراء يطلع لك بس 🤫 • رصيدك من روم البنك 🏦' });
  return { embeds: [e], components: base.components };
}
function bankPanel() {
  const e = new EmbedBuilder().setColor(COLOR).setTitle('🏦 بنك الديوانية')
    .setDescription([
      `حط ${C()} في البنك وتزيد **2% كل يوم** 📈 (لين 100 باليوم)`,
      'وفلوس البنك محمية من الرهانات والمبارزات 🛡️',
      '',
      '👛 **رصيدي** — محفظتك وبنكك وترتيبك',
      '📥 **إيداع** / 📤 **سحب** — اكتب الكمية أو خلها فاضية للكل',
      '💸 **تحويل** — حوّل لعضو ثاني',
      '🏆 **الأغنى** — أغنى أعضاء الديوانية',
    ].join('\n'));
  const r1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pn_bal').setLabel('رصيدي').setEmoji('👛').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('pn_dep').setLabel('إيداع').setEmoji('📥').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('pn_wd').setLabel('سحب').setEmoji('📤').setStyle(ButtonStyle.Secondary),
  );
  const r2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pn_tr').setLabel('تحويل').setEmoji('💸').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('pn_top').setLabel('الأغنى').setEmoji('🏆').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [e], components: [r1, r2] };
}
function earnPanel() {
  const e = new EmbedBuilder().setColor(COLOR).setTitle('💼 الشغل والمكافآت')
    .setDescription([
      `اجمع ${C()} كل يوم من هنا 👇`,
      '',
      '💼 **اشتغل** — كل ساعة (20–60)',
      '🎁 **مكافأة يومية** — تزيد كل ما استمريت يوم ورا يوم',
      '🎡 **عجلة الحظ** — لفّة مجانية كل يوم، لين 500!',
      '',
      '⚔️ تبي أكثر؟ تحدى أحد بـ `/مبارزة` • 🎉 والفعاليات فيها جوايز كبيرة',
    ].join('\n'));
  const r = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pn_work').setLabel('اشتغل').setEmoji('💼').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('pn_daily').setLabel('مكافأة يومية').setEmoji('🎁').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('pn_wheel').setLabel('عجلة الحظ').setEmoji('🎡').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [e], components: [r] };
}

// ───────── إنشاء الرومات ونشر اللوحات ─────────
async function ensure(g) {
  const me = g.members.me;
  const boy = g.roles.cache.find((r) => r.name === BOY); const girl = g.roles.cache.find((r) => r.name === GIRL);
  const viewers = boy && girl ? [boy, girl] : [g.roles.everyone];
  const ow = [
    { id: g.roles.everyone.id, deny: viewers[0] === g.roles.everyone ? [P.SendMessages, P.CreatePublicThreads, P.AddReactions] : [P.ViewChannel, P.SendMessages] },
    ...(viewers[0] === g.roles.everyone ? [] : viewers.map((r) => ({ id: r.id, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages, P.CreatePublicThreads, P.AddReactions] }))),
    { id: me.roles.highest.id, allow: [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory, P.ManageMessages] },
  ];
  let cat = g.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name === CATEGORY);
  if (!cat) cat = await g.channels.create({ name: CATEGORY, type: ChannelType.GuildCategory, permissionOverwrites: ow });
  const build = { shop: () => shopPanel(g), bank: bankPanel, earn: earnPanel };
  for (const [k, name] of Object.entries(CH)) {
    let ch = g.channels.cache.find((c) => c.type === ChannelType.GuildText && c.name === name);
    if (!ch) ch = await g.channels.create({ name, type: ChannelType.GuildText, parent: cat.id, permissionOverwrites: ow, topic: 'اضغط الأزرار تحت 👇 — الردود تطلع لك بس' });
    const msgs = await ch.messages.fetch({ limit: 20 }).catch(() => null);
    const mine = msgs?.filter((m) => m.author.id === client.user.id && m.embeds.length);
    const panel = build[k]();
    const first = mine?.last();
    if (first) {
      await first.edit(panel).catch((e) => console.error('⚠️ panel edit:', e.message));
      for (const m of mine.values()) if (m.id !== first.id) await m.delete().catch(() => {});
    } else await ch.send(panel).catch((e) => console.error('⚠️ panel send:', e.message));
  }
}

// ───────── الأزرار ─────────
const amountModal = (id, title) => new ModalBuilder().setCustomId(id).setTitle(title).addComponents(
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n').setLabel('الكمية (خلها فاضية = الكل)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10).setPlaceholder('مثال: 500')),
);
const trModal = () => new ModalBuilder().setCustomId('pn_trm').setTitle('💸 تحويل').addComponents(
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('who').setLabel('اسم العضو أو يوزره').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40)),
  new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n').setLabel('الكمية').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10)),
);
const num = (s) => { const n = parseInt(String(s || '').replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^\d]/g, ''), 10); return Number.isFinite(n) && n > 0 ? n : null; };

async function handle(i) {
  if (i.isButton() && i.customId.startsWith('pn_')) {
    const id = i.customId;
    if (id === 'pn_bal') await run(i, 'رصيدي');
    else if (id === 'pn_top') await run(i, 'الأغنى');
    else if (id === 'pn_work') await run(i, 'عمل');
    else if (id === 'pn_daily') await run(i, 'يومي');
    else if (id === 'pn_wheel') await run(i, 'عجلة');
    else if (id === 'pn_dep') await i.showModal(amountModal('pn_depm', '📥 إيداع في البنك'));
    else if (id === 'pn_wd') await i.showModal(amountModal('pn_wdm', '📤 سحب من البنك'));
    else if (id === 'pn_tr') await i.showModal(trModal());
    return true;
  }
  if (i.isModalSubmit() && i.customId.startsWith('pn_')) {
    if (i.customId === 'pn_depm' || i.customId === 'pn_wdm') {
      const raw = i.fields.getTextInputValue('n');
      const n = num(raw);
      if (raw && !n) { await i.reply({ content: '✋ اكتب رقم صحيح', flags: MessageFlags.Ephemeral }); return true; }
      await run(i, 'بنك', { sub: i.customId === 'pn_depm' ? 'ايداع' : 'سحب', opts: { كمية: n } });
      return true;
    }
    if (i.customId === 'pn_trm') {
      const q = i.fields.getTextInputValue('who').trim().replace(/^@/, '').toLowerCase();
      const n = num(i.fields.getTextInputValue('n'));
      if (!n) { await i.reply({ content: '✋ اكتب كمية صحيحة', flags: MessageFlags.Ephemeral }); return true; }
      const idm = q.match(/\d{15,20}/);
      let member = idm ? await i.guild.members.fetch(idm[0]).catch(() => null) : null;
      if (!member) {
        const found = await i.guild.members.fetch({ query: q, limit: 5 }).catch(() => null);
        member = found?.find((m) => [m.user.username, m.displayName, m.user.globalName].some((x) => String(x || '').toLowerCase() === q)) || (found?.size === 1 ? found.first() : null);
      }
      if (!member) { await i.reply({ content: `🔎 ما لقيت «${q}» بالضبط — اكتب اليوزر نفسه، أو استخدم \`/تحويل\``, flags: MessageFlags.Ephemeral }); return true; }
      await run(i, 'تحويل', { opts: { عضو: member.user, كمية: n } });
      return true;
    }
  }
  return false;
}

function init(c) {
  client = c;
  client.once('clientReady', () => {
    // ننتظر شوي لين تحمّل بيانات الاقتصاد ونظام الأقسام
    setTimeout(async () => {
      const g = getGuild(); if (!g) return;
      try { await ensure(g); console.log('🏦 لوحات الاقتصاد جاهزة'); } catch (e) { console.error('⚠️ panels:', e.message); }
    }, 25000);
    // نحدّث لوحة المتجر كل نص ساعة (لو انضافت رتب جديدة)
    setInterval(() => { const g = getGuild(); if (g) ensure(g).catch(() => {}); }, 30 * 60000).unref();
  });
}

module.exports = { init, handle, refresh: () => { const g = getGuild(); return g ? ensure(g) : null; } };
