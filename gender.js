// أقسام الأولاد والبنات 🚻
// • بوابة «اختر جنسك» — العضو الجديد ما يشوف السيرفر لين يختار ولد أو بنت
// • رتب: 👦 أولاد • 👧 بنات • 🛡️ مشرف الأولاد • 🛡️ مشرفة البنات
// • رومين خاصة: 💙│شات-الأولاد و 💗│شات-البنات
// • تحذير ← فرصة للتصحيح ← بلاغ تلقائي لصاحب السيرفر لو ما استجاب
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits,
  SlashCommandBuilder, MessageFlags, AttachmentBuilder, OverwriteType,
} = require('discord.js');
const crypto = require('crypto');

const P = PermissionFlagsBits;
const NAMES = {
  boy: '👦 أولاد', girl: '👧 بنات', supBoy: '🛡️ مشرف الأولاد', supGirl: '🛡️ مشرفة البنات',
  cat: '🚻 الأقسام الخاصة', boyCh: '💙│شات-الأولاد', girlCh: '💗│شات-البنات', reports: '🚨│بلاغات-الإشراف', gate: '🚪│اختر-جنسك',
};
const DATA_CH = 'bot-gender-data';
const WARN_HOURS = 24;
const COLOR = 0x9b59b6;

let client = null;
let data = { setupDone: false, gateOff: false, gated: {}, warns: [], gateMsg: null, announced: false };
let loaded = false; let dirty = false; let saving = false;
let setupRunning = false;

function getGuild() {
  const id = process.env.GUILD_ID;
  return (id && client.guilds.cache.get(id)) || client.guilds.cache.first();
}
const role = (g, key) => g.roles.cache.find((r) => r.name === NAMES[key]);
const chan = (g, key) => g.channels.cache.find((c) => c.name === NAMES[key]);
const genderOf = (m) => (m.roles.cache.some((r) => r.name === NAMES.boy) ? 'boy' : m.roles.cache.some((r) => r.name === NAMES.girl) ? 'girl' : null);
const label = (k) => (k === 'boy' ? 'ولد 👦' : 'بنت 👧');
function isOwner(g, uid) {
  const extra = String(process.env.OWNER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return uid === g.ownerId || extra.includes(uid);
}
const isAdmin = (g, m) => !!m && (isOwner(g, m.id) || m.permissions.has(P.Administrator));
const isSup = (g, m) => !!m && (isAdmin(g, m) || m.roles.cache.some((r) => r.name === NAMES.supBoy || r.name === NAMES.supGirl));

// ───────── الحفظ ─────────
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
  } catch (e) { console.error('⚠️ gender load:', e.message); }
  loaded = true;
}
async function save(force = false) {
  if (!loaded || saving || (!dirty && !force)) return;
  saving = true;
  try {
    const ch = await dataChannel(getGuild());
    const sent = await ch.send({ content: '💾 بيانات الأقسام — لا تحذف هذه الروم', files: [new AttachmentBuilder(Buffer.from(JSON.stringify(data)), { name: 'gender.json' })] });
    dirty = false;
    const old = await ch.messages.fetch({ limit: 10 });
    for (const m of old.values()) if (m.id !== sent.id && m.author.id === client.user.id) await m.delete().catch(() => {});
  } catch (e) { console.error('⚠️ gender save:', e.message); }
  saving = false;
}

// ───────── الإعداد ─────────
async function ensureRole(g, key, color) {
  return role(g, key) || g.roles.create({ name: NAMES[key], color, mentionable: false, reason: 'أقسام الأولاد والبنات' });
}
function botRolesToAllow(g) {
  // بوتات السيرفر اللي ما عندها أدمن لازم تبقى تشوف الرومات
  return g.roles.cache.filter((r) => r.managed && r.tags?.botId && !r.permissions.has(P.Administrator)).map((r) => r.id);
}
async function ensureSetup(g, { gate = true } = {}) {
  if (setupRunning) return 'busy';
  setupRunning = true;
  try {
    const boy = await ensureRole(g, 'boy', 0x3498db);
    const girl = await ensureRole(g, 'girl', 0xe84393);
    const supBoy = await ensureRole(g, 'supBoy', 0x1f6fb2);
    const supGirl = await ensureRole(g, 'supGirl', 0xb0306a);
    const me = g.members.me;
    const bots = botRolesToAllow(g);
    const botAllow = (extra = []) => [...new Set([me.roles.highest.id, ...bots])].map((id) => ({ id, type: OverwriteType.Role, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.EmbedLinks, P.AttachFiles, P.ManageMessages, ...extra] }));

    let cat = chan(g, 'cat');
    if (!cat) {
      cat = await g.channels.create({
        name: NAMES.cat, type: ChannelType.GuildCategory,
        permissionOverwrites: [
          { id: g.roles.everyone.id, deny: [P.ViewChannel] },
          { id: boy.id, allow: [P.ViewChannel] }, { id: girl.id, allow: [P.ViewChannel] },
          ...botAllow(),
        ],
      });
    }
    const room = (key, mine, other, sup, topic) => g.channels.create({
      name: NAMES[key], type: ChannelType.GuildText, parent: cat.id, topic,
      permissionOverwrites: [
        { id: g.roles.everyone.id, deny: [P.ViewChannel] },
        { id: mine.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles, P.EmbedLinks] },
        { id: other.id, deny: [P.ViewChannel] },
        { id: sup.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.ManageMessages] },
        ...botAllow(),
      ],
    });
    if (!chan(g, 'boyCh')) {
      const c = await room('boyCh', boy, girl, supBoy, '💙 روم الأولاد — سوالف ومزح بحدود الأدب • المشرف: 🛡️ مشرف الأولاد');
      await c.send({ embeds: [new EmbedBuilder().setColor(0x3498db).setTitle('💙 حيّاكم في روم الأولاد').setDescription('هنا سوالف الشباب بس 👦\n• الاحترام أولًا — بدون سب أو تعصب\n• لو شفت أحد مو من الأولاد هنا بلّغ **🛡️ مشرف الأولاد** أو استخدم `/بلاغ`\n• الشات العام موجود للكل 💬')] }).catch(() => {});
    }
    if (!chan(g, 'girlCh')) {
      const c = await room('girlCh', girl, boy, supGirl, '💗 روم البنات — مساحة خاصة للبنات بس • المشرفة: 🛡️ مشرفة البنات');
      await c.send({ embeds: [new EmbedBuilder().setColor(0xe84393).setTitle('💗 حيّاكم في روم البنات').setDescription('مساحة خاصة للبنات بس 👧\n• الاحترام أولًا 🤍\n• لو شفتي أحد مو من البنات هنا بلّغي **🛡️ مشرفة البنات** أو استخدمي `/بلاغ`\n• الشات العام موجود للكل 💬')] }).catch(() => {});
    }
    if (!chan(g, 'reports')) {
      await g.channels.create({
        name: NAMES.reports, type: ChannelType.GuildText, parent: cat.id, topic: '🚨 بلاغات المشرفين — للإشراف وصاحب السيرفر بس',
        permissionOverwrites: [
          { id: g.roles.everyone.id, deny: [P.ViewChannel] },
          { id: boy.id, deny: [P.ViewChannel] }, { id: girl.id, deny: [P.ViewChannel] },
          { id: supBoy.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] },
          { id: supGirl.id, allow: [P.ViewChannel, P.SendMessages, P.ReadMessageHistory] },
          ...botAllow(),
        ],
      });
    }
    let gateCh = chan(g, 'gate');
    if (!gateCh) {
      gateCh = await g.channels.create({
        name: NAMES.gate, type: ChannelType.GuildText, position: 0, topic: '🚪 اختر ولد أو بنت عشان يفتح لك السيرفر',
        permissionOverwrites: [
          { id: g.roles.everyone.id, allow: [P.ViewChannel, P.ReadMessageHistory], deny: [P.SendMessages, P.AddReactions, P.CreatePublicThreads] },
          { id: boy.id, deny: [P.ViewChannel] }, { id: girl.id, deny: [P.ViewChannel] },
          ...botAllow(),
        ],
      });
      await gateCh.setPosition(0).catch(() => {});
    }
    const gateMsg = data.gateMsg && await gateCh.messages.fetch(data.gateMsg).catch(() => null);
    if (!gateMsg) {
      const m = await gateCh.send(gatePayload(g));
      data.gateMsg = m.id; dirty = true;
    }

    // نقفل باقي السيرفر عن اللي ما اختاروا
    let changed = 0;
    if (gate) {
      const skip = new Set([gateCh.id, g.rulesChannelId, cat.id, ...cat.children.cache.keys()].filter(Boolean));
      for (const ch of g.channels.cache.values()) {
        if (skip.has(ch.id) || ch.isThread()) continue;
        if (!ch.permissionsFor(g.roles.everyone)?.has(P.ViewChannel)) continue;
        const list = ch.permissionOverwrites.cache.map((o) => ({ id: o.id, type: o.type, allow: o.allow.bitfield, deny: o.deny.bitfield }));
        const put = (id, type, allow, deny) => {
          let o = list.find((x) => x.id === id);
          if (!o) { o = { id, type, allow: 0n, deny: 0n }; list.push(o); }
          o.allow = (o.allow | allow) & ~deny;
          o.deny = (o.deny | deny) & ~allow;
        };
        const added = list.map((o) => o.id);
        put(g.roles.everyone.id, OverwriteType.Role, 0n, P.ViewChannel);
        put(boy.id, OverwriteType.Role, P.ViewChannel, 0n);
        put(girl.id, OverwriteType.Role, P.ViewChannel, 0n);
        for (const id of new Set([me.roles.highest.id, ...bots])) put(id, OverwriteType.Role, P.ViewChannel, 0n);
        try {
          await ch.permissionOverwrites.set(list, 'بوابة اختيار الجنس');
          data.gated[ch.id] = { added: [...new Set([...(data.gated[ch.id]?.added || []), ...list.map((o) => o.id).filter((id) => !added.includes(id))])] };
          changed++;
        } catch (e) { console.error(`⚠️ gate ${ch.name}:`, e.message); }
      }
    }
    data.setupDone = true; dirty = true;
    await save(true);
    console.log(`🚻 الأقسام جاهزة — قفلت ${changed} روم عن اللي ما اختاروا`);
    return changed;
  } finally { setupRunning = false; }
}
async function undoGate(g) {
  let n = 0;
  for (const [id, info] of Object.entries(data.gated)) {
    const ch = g.channels.cache.get(id);
    if (!ch) continue;
    try {
      await ch.permissionOverwrites.edit(g.roles.everyone, { ViewChannel: null });
      for (const rid of info.added || []) if (rid !== g.roles.everyone.id) await ch.permissionOverwrites.delete(rid).catch(() => {});
      n++;
    } catch (e) { console.error('⚠️ undo gate:', e.message); }
  }
  data.gated = {}; data.gateOff = true; dirty = true;
  await save(true);
  return n;
}

function gatePayload(g) {
  return {
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle(`🚪 حيّاك في ${g.name}!`)
      .setDescription('قبل ما يفتح لك السيرفر لازم تختار:\n\n👦 **ولد** — يفتح لك السيرفر + روم 💙 الأولاد\n👧 **بنت** — يفتح لك السيرفر + روم 💗 البنات\n\n💬 الشات العام وباقي الرومات للكل\n⚠️ اختر صح! الاختيار ما يتغيّر إلا عن طريق الإدارة، واللي يختار غلط عمدًا يتعرض للتحذير والبلاغ.')],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('gn_pick_boy').setLabel('ولد').setEmoji('👦').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('gn_pick_girl').setLabel('بنت').setEmoji('👧').setStyle(ButtonStyle.Danger),
    )],
  };
}

async function setGender(g, member, k, reason) {
  const add = role(g, k); const rem = role(g, k === 'boy' ? 'girl' : 'boy');
  if (!add) throw new Error('الرتب مو جاهزة');
  if (rem && member.roles.cache.has(rem.id)) await member.roles.remove(rem, reason);
  if (!member.roles.cache.has(add.id)) await member.roles.add(add, reason);
}
async function clearGender(g, member, reason) {
  for (const k of ['boy', 'girl']) { const r = role(g, k); if (r && member.roles.cache.has(r.id)) await member.roles.remove(r, reason); }
}

async function report(g, embed, uid, ping = true) {
  const ch = chan(g, 'reports');
  if (!ch) return;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gn_act_unrole_${uid}`).setLabel('رجّعه لبوابة الاختيار').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`gn_act_kick_${uid}`).setLabel('طرد').setEmoji('👢').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`gn_act_ok_${uid}`).setLabel('تم / تجاهل').setEmoji('✅').setStyle(ButtonStyle.Success),
  );
  await ch.send({ content: ping ? `<@${g.ownerId}>` : undefined, embeds: [embed], components: [row], allowedMentions: { users: ping ? [g.ownerId] : [] } }).catch((e) => console.error('⚠️ report:', e.message));
}
async function log(g, text) {
  const ch = chan(g, 'reports');
  if (ch) await ch.send({ content: text, allowedMentions: { parse: [] } }).catch(() => {});
}

// ───────── رسالة المشرف ─────────
function supGuide(g, k) {
  const boy = k === 'supBoy';
  const room = boy ? NAMES.boyCh : NAMES.girlCh;
  return new EmbedBuilder().setColor(boy ? 0x1f6fb2 : 0xb0306a)
    .setTitle(`🛡️ مبروك! صرت ${boy ? 'مشرف الأولاد' : 'مشرفة البنات'} في ${g.name}`)
    .setDescription([
      `**مهمتك:** ${boy ? 'تحافظ' : 'تحافظين'} على روم **${room}** وتخليه مكان محترم ${boy ? 'للأولاد' : 'للبنات'} بس.`,
      '',
      '**📋 إذا أحد دخل وهو من الجنس الثاني (اختار غلط):**',
      `1️⃣ استخدم${boy ? '' : 'ي'} \`/تحذير-جنس\` واختار${boy ? '' : 'ي'} العضو — البوت يرسل له تنبيه بالخاص مع زرين: «صحّح» أو «أنا متأكد»`,
      `2️⃣ إذا صحّح ← ينتقل للقسم الصح تلقائي ✅`,
      `3️⃣ إذا ما ردّ خلال **${WARN_HOURS} ساعة** أو انحذّر مرتين ← البوت يرفع **بلاغ تلقائي** لصاحب السيرفر في ${NAMES.reports}`,
      '',
      '**🚨 أي مشكلة ثانية** (سب، إزعاج، سبام، تحرش): `/بلاغ` + السبب — يوصل للإشراف فورًا',
      `**🧹** ${boy ? 'تقدر تحذف' : 'تقدرين تحذفين'} الرسائل المخالفة في الروم`,
      '',
      '**❌ ممنوع:** التشهير أو الفضح بالعام، أو أخذ الأمور شخصية — بلّغ وصاحب السيرفر يقرر.',
      `${boy ? 'نثق فيك' : 'نثق فيك'} 🤍`,
    ].join('\n'));
}

// ───────── التحذيرات ─────────
function warnRow(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`gn_fix_${id}`).setLabel('اخترت غلط — صحّحه').setEmoji('🔁').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`gn_sure_${id}`).setLabel('أنا متأكد من اختياري').setEmoji('✅').setStyle(ButtonStyle.Secondary),
  );
}
async function checkWarns() {
  const g = getGuild(); if (!g) return;
  const now = Date.now();
  for (const w of data.warns) {
    if (w.status !== 'pending' || now < w.due) continue;
    w.status = 'expired'; dirty = true;
    await report(g, new EmbedBuilder().setColor(0xe74c3c).setTitle('🚨 بلاغ تلقائي: ما استجاب للتحذير')
      .setDescription(`العضو <@${w.uid}> انحذّر إنه في القسم الغلط (${label(w.gender)}) وما ردّ خلال ${WARN_HOURS} ساعة.\n👮 المحذِّر: <@${w.by}>${w.note ? `\n📝 ملاحظة: ${w.note}` : ''}`)
      .setTimestamp(w.ts), w.uid);
  }
  const cutoff = now - 30 * 86400000;
  const before = data.warns.length;
  data.warns = data.warns.filter((w) => w.ts > cutoff);
  if (data.warns.length !== before) dirty = true;
}

// ───────── الأوامر ─────────
const commands = [
  new SlashCommandBuilder().setName('تحذير-جنس').setDescription('🛡️ تنبّه عضو إنه في القسم الغلط (للمشرفين)')
    .addUserOption((o) => o.setName('عضو').setDescription('العضو').setRequired(true))
    .addStringOption((o) => o.setName('ملاحظة').setDescription('ليش تشك؟ (تروح للإدارة بس)').setMaxLength(200)),
  new SlashCommandBuilder().setName('بلاغ').setDescription('🚨 بلّغ الإشراف عن مشكلة أو عضو مخالف')
    .addUserOption((o) => o.setName('عضو').setDescription('العضو المخالف').setRequired(true))
    .addStringOption((o) => o.setName('سبب').setDescription('وش صار؟').setRequired(true).setMaxLength(400)),
  new SlashCommandBuilder().setName('جنس').setDescription('👑 تغيّر قسم عضو (للإدارة)')
    .setDefaultMemberPermissions(P.Administrator)
    .addUserOption((o) => o.setName('عضو').setDescription('العضو').setRequired(true))
    .addStringOption((o) => o.setName('قسم').setDescription('القسم').setRequired(true).addChoices({ name: 'ولد 👦', value: 'boy' }, { name: 'بنت 👧', value: 'girl' }, { name: 'شيل (يرجع للبوابة) 🚪', value: 'none' })),
  new SlashCommandBuilder().setName('مشرف').setDescription('👑 تعيين أو إزالة مشرف/مشرفة (لصاحب السيرفر)')
    .setDefaultMemberPermissions(P.Administrator)
    .addUserOption((o) => o.setName('عضو').setDescription('العضو').setRequired(true))
    .addStringOption((o) => o.setName('قسم').setDescription('أي قسم؟').setRequired(true).addChoices({ name: '🛡️ مشرف الأولاد', value: 'supBoy' }, { name: '🛡️ مشرفة البنات', value: 'supGirl' }))
    .addStringOption((o) => o.setName('اجراء').setDescription('تعيين أو إزالة').setRequired(true).addChoices({ name: 'تعيين', value: 'add' }, { name: 'إزالة', value: 'remove' })),
  new SlashCommandBuilder().setName('اعداد-الأقسام').setDescription('👑 إعادة إعداد أقسام الأولاد والبنات أو إلغاء البوابة')
    .setDefaultMemberPermissions(P.Administrator)
    .addStringOption((o) => o.setName('وضع').setDescription('وش تبي؟').setRequired(true).addChoices({ name: 'تفعيل / إصلاح', value: 'on' }, { name: 'إلغاء قفل السيرفر (البوابة)', value: 'off' })),
].map((c) => c.toJSON());

const reportCd = new Map();

async function handle(i) {
  const g = getGuild();
  if (!g) return false;

  if (i.isButton() && i.customId.startsWith('gn_')) {
    const id = i.customId;
    const member = await g.members.fetch(i.user.id).catch(() => null);
    if (!member) return i.reply({ content: 'لازم تكون داخل السيرفر 😅', flags: MessageFlags.Ephemeral }).then(() => true);

    if (id === 'gn_pick_boy' || id === 'gn_pick_girl') {
      const k = id === 'gn_pick_boy' ? 'boy' : 'girl';
      if (genderOf(member)) return i.reply({ content: `اخترت قبل (${label(genderOf(member))}) ✅ — للتغيير كلّم الإدارة`, flags: MessageFlags.Ephemeral }).then(() => true);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`gn_ok_${k}`).setLabel(`أيوه، أنا ${k === 'boy' ? 'ولد' : 'بنت'}`).setEmoji('✅').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('gn_cancel').setLabel('لا، رجّعني').setStyle(ButtonStyle.Secondary),
      );
      await i.reply({ content: `متأكد إنك **${label(k)}**؟ الاختيار ما يتغيّر إلا عن طريق الإدارة 🤝`, components: [row], flags: i.guild ? MessageFlags.Ephemeral : undefined });
      return true;
    }
    if (id === 'gn_cancel') { await i.update({ content: 'تمام، اختر من جديد 👆', components: [] }).catch(() => {}); return true; }
    if (id === 'gn_ok_boy' || id === 'gn_ok_girl') {
      const k = id === 'gn_ok_boy' ? 'boy' : 'girl';
      if (genderOf(member)) return i.update({ content: `اخترت قبل (${label(genderOf(member))}) ✅`, components: [] }).then(() => true);
      try { await setGender(g, member, k, 'اختيار العضو'); } catch (e) {
        console.error('⚠️ gender pick:', e.message);
        return i.update({ content: '⚠️ ما قدرت أعطيك الرتبة — بلّغ الإدارة 🙏', components: [] }).then(() => true);
      }
      const general = g.channels.cache.find((c) => c.type === ChannelType.GuildText && /عام/.test(c.name) && !/bot-/.test(c.name));
      const myRoom = chan(g, k === 'boy' ? 'boyCh' : 'girlCh');
      await i.update({ content: `🎉 حيّاك! انفتح لك السيرفر\n${myRoom ? `• روم قسمك: <#${myRoom.id}>\n` : ''}${general ? `• الشات العام: <#${general.id}>` : ''}`, components: [] });
      return true;
    }

    if (id.startsWith('gn_fix_') || id.startsWith('gn_sure_')) {
      const wid = id.split('_')[2];
      const w = data.warns.find((x) => x.id === wid);
      if (!w || w.uid !== i.user.id) return i.reply({ content: 'هالتنبيه مو لك 😅', flags: MessageFlags.Ephemeral }).then(() => true);
      if (w.status !== 'pending') return i.reply({ content: 'تم الرد على هالتنبيه قبل ✅', flags: MessageFlags.Ephemeral }).then(() => true);
      if (id.startsWith('gn_fix_')) {
        const k = w.gender === 'boy' ? 'girl' : 'boy';
        await setGender(g, member, k, 'تصحيح بعد تحذير').catch(() => {});
        w.status = 'fixed'; dirty = true;
        await i.update({ content: `✅ شكرًا! انتقلت لقسم **${label(k)}**`, embeds: [], components: [] }).catch(() => {});
        await log(g, `✅ <@${w.uid}> صحّح اختياره بعد تحذير <@${w.by}> (صار ${label(k)})`);
      } else {
        w.status = 'confirmed'; dirty = true;
        await i.update({ content: '👍 تمام، وصل ردّك للإشراف. شكرًا لتعاونك 🤝', embeds: [], components: [] }).catch(() => {});
        await report(g, new EmbedBuilder().setColor(0xf1c40f).setTitle('ℹ️ عضو أكّد اختياره بعد التحذير')
          .setDescription(`<@${w.uid}> يقول إنه فعلًا **${label(w.gender)}**\n👮 المحذِّر: <@${w.by}>${w.note ? `\n📝 ${w.note}` : ''}\n\nلو الإشراف للحين شاك — القرار لصاحب السيرفر 👇`), w.uid, false);
      }
      return true;
    }

    if (id.startsWith('gn_act_')) {
      if (!isAdmin(g, member)) return i.reply({ content: '👑 هذي للإدارة وصاحب السيرفر بس', flags: MessageFlags.Ephemeral }).then(() => true);
      const [, , act, uid] = id.split('_');
      const target = await g.members.fetch(uid).catch(() => null);
      let res;
      if (act === 'ok') res = `✅ ${i.user} أغلق البلاغ`;
      else if (!target) res = '👋 العضو مو موجود بالسيرفر';
      else if (act === 'unrole') { await clearGender(g, target, `بلاغ — ${i.user.username}`).catch(() => {}); res = `🚪 ${i.user} رجّع <@${uid}> لبوابة الاختيار`; target.send(`🚪 الإدارة رجّعتك لبوابة اختيار الجنس في **${g.name}** — اختر الصح لو سمحت 🤝`).catch(() => {}); }
      else if (act === 'kick') { const ok = await target.kick(`بلاغ — ${i.user.username}`).then(() => true).catch(() => false); res = ok ? `👢 ${i.user} طرد <@${uid}>` : '⚠️ ما قدرت أطرده (رتبته أعلى من البوت؟)'; }
      await i.update({ components: [] }).catch(() => {});
      await i.followUp({ content: res, allowedMentions: { parse: [] } }).catch(() => {});
      return true;
    }
    return false;
  }

  if (!i.isChatInputCommand()) return false;
  const n = i.commandName;
  if (!['تحذير-جنس', 'بلاغ', 'جنس', 'مشرف', 'اعداد-الأقسام'].includes(n)) return false;
  const me = await g.members.fetch(i.user.id).catch(() => null);

  if (n === 'بلاغ') {
    const u = i.options.getUser('عضو');
    const why = i.options.getString('سبب');
    const last = reportCd.get(i.user.id) || 0;
    if (Date.now() - last < 120000) return i.reply({ content: 'استنى شوي قبل بلاغ ثاني 🙏', flags: MessageFlags.Ephemeral }).then(() => true);
    reportCd.set(i.user.id, Date.now());
    await report(g, new EmbedBuilder().setColor(0xe67e22).setTitle('🚨 بلاغ جديد')
      .setDescription(`**المبلَّغ عنه:** ${u} (\`${u.username}\`)\n**المبلِّغ:** ${i.user}\n**الروم:** ${i.channel ? `<#${i.channelId}>` : 'خاص'}\n\n**السبب:** ${why}`).setTimestamp(), u.id, true);
    await i.reply({ content: '✅ وصل بلاغك للإشراف — شكرًا إنك تساعدنا نحافظ على السيرفر 🤍', flags: MessageFlags.Ephemeral });
    return true;
  }

  if (n === 'تحذير-جنس') {
    if (!isSup(g, me)) return i.reply({ content: '🛡️ هذا الأمر للمشرفين بس', flags: MessageFlags.Ephemeral }).then(() => true);
    const u = i.options.getUser('عضو');
    const target = await g.members.fetch(u.id).catch(() => null);
    if (!target || u.bot) return i.reply({ content: 'العضو مو موجود 😅', flags: MessageFlags.Ephemeral }).then(() => true);
    const k = genderOf(target);
    if (!k) return i.reply({ content: 'هالعضو للحين ما اختار قسم 🚪', flags: MessageFlags.Ephemeral }).then(() => true);
    const note = i.options.getString('ملاحظة') || '';
    const recent = data.warns.filter((w) => w.uid === u.id && Date.now() - w.ts < 7 * 86400000);
    const w = { id: crypto.randomBytes(4).toString('hex'), uid: u.id, by: i.user.id, ts: Date.now(), due: Date.now() + WARN_HOURS * 3600000, gender: k, note, status: 'pending' };
    data.warns.push(w); dirty = true;
    const e = new EmbedBuilder().setColor(0xf39c12).setTitle(`⚠️ تنبيه من إشراف ${g.name}`)
      .setDescription(`هلا ${target.displayName} 👋\nالمشرفين لاحظوا إنك يمكن اخترت قسم **${label(k)}** بالغلط.\n\nلو اخترت غلط اضغط **«صحّحه»** وننقلك للقسم الصح بدون أي مشكلة 🤝\nولو اختيارك صح اضغط **«أنا متأكد»**.\n\n⏳ عندك **${WARN_HOURS} ساعة** للرد — بعدها يتحول تلقائي لبلاغ عند صاحب السيرفر.`);
    let delivered = await target.send({ embeds: [e], components: [warnRow(w.id)] }).then(() => 'dm').catch(() => null);
    if (!delivered) {
      const room = chan(g, k === 'boy' ? 'boyCh' : 'girlCh');
      if (room) delivered = await room.send({ content: `${target}`, embeds: [e], components: [warnRow(w.id)] }).then(() => 'room').catch(() => null);
    }
    await i.reply({ content: `✅ انرسل التنبيه لـ ${u} ${delivered === 'dm' ? 'بالخاص' : delivered === 'room' ? 'في رومه (خاصه مقفل)' : '— ما قدرت أوصله 😓'}\nلو ما ردّ خلال ${WARN_HOURS} ساعة يتحول لبلاغ تلقائي.`, flags: MessageFlags.Ephemeral });
    await log(g, `⚠️ <@${i.user.id}> حذّر <@${u.id}> (قسم ${label(k)})${note ? ` — ${note}` : ''}`);
    if (recent.length >= 1) {
      await report(g, new EmbedBuilder().setColor(0xe74c3c).setTitle('🚨 بلاغ: تحذير متكرر')
        .setDescription(`<@${u.id}> انحذّر **${recent.length + 1}** مرات خلال أسبوع إنه في القسم الغلط (${label(k)}).\nآخر محذِّر: <@${i.user.id}>${note ? `\n📝 ${note}` : ''}`), u.id);
    }
    return true;
  }

  if (!isAdmin(g, me)) return i.reply({ content: '👑 هذا الأمر للإدارة بس', flags: MessageFlags.Ephemeral }).then(() => true);

  if (n === 'جنس') {
    const target = await g.members.fetch(i.options.getUser('عضو').id).catch(() => null);
    if (!target) return i.reply({ content: 'العضو مو موجود', flags: MessageFlags.Ephemeral }).then(() => true);
    const k = i.options.getString('قسم');
    if (k === 'none') await clearGender(g, target, `الإدارة: ${i.user.username}`);
    else await setGender(g, target, k, `الإدارة: ${i.user.username}`);
    await i.reply({ content: `✅ ${target} صار ${k === 'none' ? 'بدون قسم (يرجع للبوابة 🚪)' : label(k)}`, flags: MessageFlags.Ephemeral });
    return true;
  }
  if (n === 'مشرف') {
    if (!isOwner(g, i.user.id)) return i.reply({ content: '👑 لصاحب السيرفر بس', flags: MessageFlags.Ephemeral }).then(() => true);
    const target = await g.members.fetch(i.options.getUser('عضو').id).catch(() => null);
    const k = i.options.getString('قسم');
    const r = role(g, k);
    if (!target || !r) return i.reply({ content: 'العضو أو الرتبة مو موجودة', flags: MessageFlags.Ephemeral }).then(() => true);
    if (i.options.getString('اجراء') === 'add') await target.roles.add(r, `تعيين من ${i.user.username}`);
    else await target.roles.remove(r, `إزالة من ${i.user.username}`);
    await i.reply({ content: `✅ تم ${i.options.getString('اجراء') === 'add' ? 'تعيين' : 'إزالة'} ${target} ${r}`, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    return true;
  }
  if (n === 'اعداد-الأقسام') {
    if (!isOwner(g, i.user.id)) return i.reply({ content: '👑 لصاحب السيرفر بس', flags: MessageFlags.Ephemeral }).then(() => true);
    await i.deferReply({ flags: MessageFlags.Ephemeral });
    if (i.options.getString('وضع') === 'off') {
      const c = await undoGate(g);
      await i.editReply(`🔓 رجّعت ${c} روم مفتوحة للكل (البوابة صارت اختيارية)`);
    } else {
      data.gateOff = false;
      const c = await ensureSetup(g, { gate: true });
      await i.editReply(c === 'busy' ? '⏳ الإعداد شغال الحين...' : `✅ الأقسام جاهزة — قفلت ${c} روم إضافية عن اللي ما اختاروا`);
    }
    return true;
  }
  return false;
}

// إعلان المميزات الجديدة + رابط الموقع (مرة وحدة)
async function sendFix(g, ch, payload) {
  try { return await ch.send(payload); } catch (e) {
    if (e.code !== 50013) throw e;
    // ما عنده صلاحية إرسال في هالروم — يعطي نفسه الصلاحية ويعيد
    await ch.permissionOverwrites.edit(g.members.me.roles.highest, { ViewChannel: true, SendMessages: true, EmbedLinks: true });
    return ch.send(payload);
  }
}
async function announce(g, generalToo = true) {
  const site = (process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || 'https://diwaniya-bot-1.onrender.com').replace(/\/$/, '');
  const e = new EmbedBuilder().setColor(0xf5b942).setTitle('🎉 تحديث كبير في الديوانية!')
    .setDescription([
      `🌐 **موقع الديوانية:** ${site}`,
      'ألعاب ورسم وتحديات + **فعاليات مباشرة** (هاتف خربان، خمّن الرسمة، مسابقات...) — كلها بدون تسجيل!',
      '',
      '🏦 **البنك والفلوس:** `/عمل` كل ساعة • `/بنك ايداع` وفلوسك تزيد كل يوم 📈 • `/رصيدي` • `/الأغنى` • `/متجر`',
      '🎯 **فعاليات بالشات:** روليت، إقصاء صح وخطأ، ماراثون، أسرع زر وجوايز كوينز 🪙',
      `🚻 **أقسام خاصة:** ${NAMES.boyCh} للأولاد و ${NAMES.girlCh} للبنات • لأي مشكلة \`/بلاغ\``,
      '',
      '`/مساعدة` لكل الأوامر 📜',
    ].join('\n'));
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setURL(site).setLabel('افتح الموقع').setEmoji('🌐').setStyle(ButtonStyle.Link));
  const ann = g.channels.cache.find((c) => (c.type === ChannelType.GuildAnnouncement || c.type === ChannelType.GuildText) && /الإعلانات|الاعلانات/.test(c.name));
  const general = g.channels.cache.find((c) => c.type === ChannelType.GuildText && /عام/.test(c.name) && !/bot-/.test(c.name));
  if (ann) await sendFix(g, ann, { embeds: [e], components: [row] }).then(() => console.log('📣 نزل إعلان التحديث')).catch((er) => console.error('⚠️ announce:', er.message));
  if (general && generalToo) {
    const m = await general.send({ embeds: [new EmbedBuilder().setColor(0xf5b942).setTitle('🌐 موقع الديوانية').setDescription(`${site}\nألعاب، رسم، تحديات وفعاليات مباشرة — بدون تسجيل 🎮`)], components: [row] }).catch(() => null);
    if (m) await m.pin().catch(() => {});
  }
  data.announced = true; data.announcedV = 2; dirty = true;
  await save(true);
}

// تعريف الأعضاء الحاليين اللي ما اختاروا
async function askExisting(g) {
  const members = await g.members.fetch().catch(() => g.members.cache);
  let n = 0;
  for (const m of members.values()) {
    if (m.user.bot || genderOf(m) || isOwner(g, m.id)) continue;
    const ok = await m.send({ ...gatePayload(g), content: `👋 هلا ${m.displayName}! صار عندنا أقسام خاصة للأولاد والبنات في **${g.name}** — اختر عشان يفتح لك السيرفر 👇` }).then(() => true).catch(() => false);
    if (ok) n++;
    await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(`🚻 أرسلت اختيار الجنس لـ ${n} عضو`);
}

function init(c) {
  client = c;
  client.once('clientReady', async () => {
    const g = getGuild();
    if (!g) return;
    await load(g);
    setTimeout(async () => {
      try {
        if (!data.setupDone) {
          await ensureSetup(g, { gate: true });
          askExisting(g).catch((e) => console.error('⚠️ askExisting:', e.message));
        } else await ensureSetup(g, { gate: !data.gateOff }); // يتأكد إن الرتب والرومات موجودة ويقفل أي روم جديدة
        if (data.announcedV !== 2) await announce(g, !data.announced);
      } catch (e) { console.error('⚠️ gender setup:', e); }
    }, 15000);
    setInterval(() => checkWarns().then(() => save()).catch((e) => console.error('⚠️ warns:', e.message)), 10 * 60000);
    console.log('🚻 نظام الأقسام جاهز');
  });

  client.on('guildMemberAdd', async (m) => {
    if (m.user.bot || !data.setupDone) return;
    const g = m.guild;
    const gate = chan(g, 'gate');
    if (gate) {
      const msg = await gate.send({ content: `👋 حيّاك ${m}! اختر من الأزرار فوق عشان يفتح لك السيرفر 👆` }).catch(() => null);
      if (msg) setTimeout(() => msg.delete().catch(() => {}), 5 * 60000);
    }
  });

  client.on('guildMemberUpdate', async (oldM, newM) => {
    if (newM.user.bot) return;
    for (const k of ['supBoy', 'supGirl']) {
      const r = role(newM.guild, k);
      if (r && !oldM.roles.cache.has(r.id) && newM.roles.cache.has(r.id)) {
        const ok = await newM.send({ embeds: [supGuide(newM.guild, k)] }).then(() => true).catch(() => false);
        await log(newM.guild, `🛡️ <@${newM.id}> صار ${NAMES[k]}${ok ? ' — وصلته رسالة التعليمات ✉️' : ' — ⚠️ خاصه مقفل، ما وصلته التعليمات'}`);
      }
    }
    // ما يصير أحد ياخذ الرتبتين مع بعض
    const b = role(newM.guild, 'boy'); const gl = role(newM.guild, 'girl');
    if (b && gl && newM.roles.cache.has(b.id) && newM.roles.cache.has(gl.id)) {
      const justAdded = oldM.roles.cache.has(b.id) ? gl : b;
      const other = justAdded.id === b.id ? gl : b;
      await newM.roles.remove(other, 'ما يصير الرتبتين مع بعض').catch(() => {});
    }
  });
  process.on('SIGTERM', () => { save(true).catch(() => {}); });
}

module.exports = { init, handle, commands };
