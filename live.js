// فعاليات صاحب السيرفر 👑
// /فعالية       ← فعالية في الشات العام للكل (روليت، إقصاء، ماراثون، أسرع زر، خمّن الرقم، سحب...)
// /فعالية-موقع  ← فعالية مباشرة على الموقع (هاتف خربان، خمّن الرسمة، مسابقة مباشرة...) والكل يدخل من رابط
// /فعالية-ايقاف ← يوقف أي فعالية شغالة
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits,
  SlashCommandBuilder, MessageFlags, AttachmentBuilder,
} = require('discord.js');
const crypto = require('crypto');
const ED = require('./events-data');
const WD = require('./web-data');
const ECO = require('./economy');
const ROOMS = require('./rooms');

const COLOR = 0xe84393;
const SITE = () => (process.env.SITE_URL || process.env.RENDER_EXTERNAL_URL || 'https://diwaniya-bot-1.onrender.com').replace(/\/$/, '');
let client = null;
let ev = null;      // فعالية الشات الحالية
let typed = null;   // سؤال ينتظر جواب مكتوب
let btn = null;     // سؤال ينتظر ضغطة زر
const siteMsgs = new Map(); // كود الغرفة ← رسالة الإعلان

const TRIVIA = [...ED.TRIVIA, ...WD.TRIVIA];
const TF = [...ED.TRUE_FALSE, ...WD.TRUE_FALSE];
const EMOJI = [...ED.EMOJI, ...WD.EMOJI];
const WORDS = [...ED.WORDS, ...WD.WORDS];
const SENTENCES = [...ED.SENTENCES, ...WD.SENTENCES];

const pick = (a) => a[crypto.randomInt(a.length)];
function shuffle(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const nonce = () => crypto.randomBytes(4).toString('hex');
const ts = (ms) => `<t:${Math.floor((Date.now() + ms) / 1000)}:R>`;
let matchesFn = null;
const matches = (a, list) => (matchesFn || (matchesFn = require('./events')._test.matches))(a, list);
const digits = (s) => require('./events')._test.digits(s);

function getGuild() {
  const id = process.env.GUILD_ID;
  return (id && client.guilds.cache.get(id)) || client.guilds.cache.first();
}
function generalChannel(g, fallback) {
  const list = g.channels.cache.filter((c) => c.type === ChannelType.GuildText);
  const bad = /(تذاكر|تذكرة|سجل|bot-|اعتراف|تحديات|العد|المستويات|شراكات|رسومات|قوانين|ترحيب|اعلان|إعلان|دليل)/;
  const good = [/عام/, /شات/, /general/i, /سوالف/, /chat/i];
  for (const re of good) {
    const c = list.find((x) => re.test(x.name) && !bad.test(x.name));
    if (c) return c;
  }
  return fallback;
}

// ───────── أدوات الأسئلة ─────────
function stopAsks() {
  if (typed) { clearTimeout(typed.timer); const r = typed.resolve; typed = null; r(null); }
  if (btn) { clearTimeout(btn.timer); const b = btn; btn = null; b.resolve(b.mode === 'all' ? new Map() : null); }
}
// سؤال جوابه يُكتب بالشات — يرجع أول عضو جاوب صح
async function askTyped(ch, embed, answers, ms, opt = {}) {
  await ch.send({ embeds: [embed] }).catch(() => {});
  return new Promise((resolve) => {
    typed = { channelId: ch.id, answers, antiCopy: opt.antiCopy, check: opt.check, resolve };
    typed.timer = setTimeout(() => { if (typed?.resolve === resolve) { typed = null; resolve(null); } }, ms);
  });
}
// سؤال بأزرار — mode 'first': أول صح يفوز • mode 'all': يجمع إجابة كل واحد لين يخلص الوقت
async function askButtons(ch, embed, labels, ms, opt = {}) {
  const n = nonce();
  const styles = opt.styles || [];
  const rows = [];
  for (let k = 0; k < labels.length; k += 5) {
    rows.push(new ActionRowBuilder().addComponents(labels.slice(k, k + 5).map((l, x) => new ButtonBuilder()
      .setCustomId(`lv_b_${n}_${k + x}`).setLabel(String(l).slice(0, 80)).setStyle(styles[k + x] || ButtonStyle.Secondary))));
  }
  const msg = await ch.send({ embeds: [embed], components: rows }).catch(() => null);
  if (!msg) return opt.mode === 'all' ? new Map() : null;
  const out = await new Promise((resolve) => {
    btn = { n, mode: opt.mode || 'first', correct: opt.correct, allowed: opt.allowed || null, tried: new Set(), answers: new Map(), resolve };
    btn.timer = setTimeout(() => {
      if (btn?.n !== n) return;
      const b = btn; btn = null;
      resolve(b.mode === 'all' ? b.answers : null);
    }, ms);
  });
  await msg.edit({ components: [] }).catch(() => {});
  return out;
}

// أسئلة جاهزة (نص، أجوبة)
function typedQuestion(kind) {
  const e = new EmbedBuilder().setColor(COLOR);
  if (kind === 'emoji') { const [em, a] = pick(EMOJI); e.setTitle('🤔 خمّن الإيموجي').setDescription(`# ${em}\nاكتب الجواب بالشات 👇`); return { e, answers: a, show: a[0] }; }
  if (kind === 'scramble') {
    const w = pick(WORDS); let m = w;
    for (let k = 0; k < 10 && m === w; k++) m = shuffle([...w]).join('');
    e.setTitle('🔤 رتّب الحروف').setDescription(`# ${[...m].join(' ')}\nرتّبها واكتب الكلمة 👇`);
    return { e, answers: [w], show: w };
  }
  if (kind === 'riddle') { const [q, a] = pick(WD.RIDDLES); e.setTitle('🧩 لغز').setDescription(`**${q}**\nاكتب الجواب 👇`); return { e, answers: a, show: a[0] }; }
  if (kind === 'proverb') { const [q, a] = pick(WD.PROVERBS); e.setTitle('📜 كمّل المثل').setDescription(`# ${q}\nاكتب الكلمة الناقصة 👇`); return { e, answers: a, show: a[0] }; }
  if (kind === 'typing') {
    const s = pick(SENTENCES);
    e.setTitle('⌨️ أسرع كاتب').setDescription(`اكتب الجملة بالضبط (بدون نسخ 😏):\n\n**${s.split(' ').join(' ​')}**`);
    return { e, answers: [s], show: s, antiCopy: true };
  }
  // رياضيات
  const a = 3 + crypto.randomInt(17); const b = 2 + crypto.randomInt(12); const c = crypto.randomInt(50);
  const plus = crypto.randomInt(2) === 0; const ans = plus ? a * b + c : a * b - c;
  e.setTitle('🧮 رياضيات').setDescription(`# ${a} × ${b} ${plus ? '+' : '-'} ${c} = ؟\nاكتب الجواب 👇`);
  return { e, answers: [String(ans)], show: String(ans) };
}
function mcQuestion() {
  if (crypto.randomInt(3) === 0) {
    const [s, ok] = pick(TF);
    return { text: s, labels: ['✅ صح', '❌ خطأ'], correct: ok ? 0 : 1, show: ok ? 'صح ✅' : 'خطأ ❌', styles: [ButtonStyle.Success, ButtonStyle.Danger] };
  }
  const [q, opts, ok] = pick(TRIVIA);
  const order = shuffle([0, 1, 2, 3]);
  return { text: q, labels: order.map((i) => opts[i]), correct: order.indexOf(ok), show: opts[ok] };
}

// ───────── الجوائز ─────────
function prizeFor(rank, prize) { return rank === 0 ? prize : rank === 1 ? Math.floor(prize / 2) : rank === 2 ? Math.floor(prize / 4) : 0; }
async function finishRanked(ch, title, scores, prize, unit = 'نقطة') {
  const ranked = [...scores.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const medals = ['🥇', '🥈', '🥉'];
  const lines = ranked.slice(0, 10).map(([id, v], k) => {
    const c = prizeFor(k, prize);
    if (c) ECO.add(id, c, `فعالية: ${title}`);
    return `${medals[k] || `**${k + 1}.**`} <@${id}> — **${v}** ${unit}${c ? ` • +${c} ${ECO.COIN}` : ''}`;
  });
  await ch.send({
    content: ranked[0] ? `<@${ranked[0][0]}>` : undefined,
    embeds: [new EmbedBuilder().setColor(0xffd700).setTitle(`🏁 نتائج ${title}`)
      .setDescription(lines.length ? `${lines.join('\n')}\n\nكفو عليكم 👏 شوفوا رصيدكم بـ \`/رصيدي\`` : 'محد جمع نقاط هالمرة 😅')],
    allowedMentions: { users: ranked[0] ? [ranked[0][0]] : [] },
  }).catch(() => {});
}
async function winOne(ch, member, title, prize, extra = '') {
  if (!member) return;
  if (prize) ECO.add(member.id, prize, `فعالية: ${title}`);
  await ch.send({
    content: `${member}`,
    embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('🏆 عندنا فايز!')
      .setDescription(`كفو ${member} 👏 فزت في **${title}**${extra}${prize ? `\n+${ECO.fmt(prize)}` : ''}`)],
    allowedMentions: { users: [member.id] },
  }).catch(() => {});
}

// مرحلة الانضمام (زر)
async function joinPhase(ch, title, desc, ms, prize) {
  const id = nonce();
  ev.joinId = id; ev.joined = new Set();
  const embed = () => new EmbedBuilder().setColor(COLOR).setTitle(`🎉 ${title}`)
    .setDescription(`${desc}\n\n${prize ? `🏆 الجائزة: ${ECO.fmt(prize)}\n` : ''}⏳ الانضمام يقفل ${ts(Math.max(0, ev.joinEnd - Date.now()))}\n👥 انضم: **${ev.joined.size}**`);
  ev.joinEnd = Date.now() + ms;
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`lv_j_${id}`).setLabel('انضم').setEmoji('🙋').setStyle(ButtonStyle.Success));
  const msg = await ch.send({ content: ev.ping ? '@here' : undefined, embeds: [embed()], components: [row], allowedMentions: { parse: ev.ping ? ['everyone'] : [] } });
  ev.joinMsg = msg; ev.joinEmbed = embed;
  const step = 1000;
  for (let t = 0; t < ms && !ev.stop; t += step) await sleep(step);
  ev.joinId = null;
  await msg.edit({ embeds: [embed().setDescription(`${desc}\n\n🔒 قفل الانضمام — انضم **${ev.joined.size}**`)], components: [] }).catch(() => {});
  return [...ev.joined];
}

// ───────── أنواع فعاليات الشات ─────────
const CHAT_TYPES = {
  marathon: '🏁 ماراثون منوّع',
  quizrace: '🧠 سباق الأسئلة',
  elim: '✅❌ صح ولا خطأ (إقصاء)',
  roulette: '🎰 الروليت',
  fast: '⚡ أسرع زر',
  guessnum: '🔢 خمّن الرقم',
  giveaway: '🎁 سحب على جائزة',
  emoji: '🤔 خمّن الإيموجي',
  scramble: '🔤 رتّب الحروف',
  typing: '⌨️ أسرع كاتب',
  math: '🧮 رياضيات',
  riddle: '🧩 لغز',
  proverb: '📜 كمّل المثل',
  random: '🎲 عشوائي',
};

async function runChat(ch, type, prize, rounds, minutes) {
  const title = CHAT_TYPES[type];
  const intro = (desc) => ch.send({
    content: ev.ping ? '@here' : undefined,
    embeds: [new EmbedBuilder().setColor(COLOR).setTitle(`🎉 فعالية: ${title}`).setDescription(`${desc}${prize ? `\n\n🏆 الجائزة: ${ECO.fmt(prize)}` : ''}\n\n⏳ نبدأ بعد 10 ثواني... استعدوا!`)],
    allowedMentions: { parse: ev.ping ? ['everyone'] : [] },
  });

  if (['emoji', 'scramble', 'typing', 'math', 'riddle', 'proverb'].includes(type)) {
    await intro('أول واحد يكتب الجواب الصح بالشات يفوز 🏆');
    await sleep(10000); if (ev.stop) return;
    const q = typedQuestion(type);
    q.e.setDescription(`${q.e.data.description}\n⏳ ينتهي ${ts(90000)}`);
    const m = await askTyped(ch, q.e, q.answers, 90000, { antiCopy: q.antiCopy });
    if (ev.stop) return;
    if (m) await winOne(ch, m, title, prize, `\nالجواب: **${q.show}**`);
    else await ch.send(`⏰ انتهى الوقت ومحد جابها! الجواب: **${q.show}**`).catch(() => {});
    return;
  }

  if (type === 'marathon' || type === 'quizrace') {
    const R = Math.max(3, Math.min(20, rounds || (type === 'marathon' ? 8 : 10)));
    await intro(type === 'marathon'
      ? `**${R} جولات** منوّعة: إيموجي، حروف، ألغاز، أمثال، رياضيات وأسئلة!\nكل جولة أول واحد يجاوب صح ياخذ نقطة — والأعلى نقاط يفوز 🏆`
      : `**${R} أسئلة** — كل سؤال جاوب مرة وحدة (15 ثانية)\n✅ الجواب الصح = نقطة • ⚡ أول واحد صح = نقطة زيادة`);
    await sleep(10000);
    const scores = new Map();
    for (let r = 1; r <= R && !ev.stop; r++) {
      if (type === 'quizrace' || (type === 'marathon' && crypto.randomInt(3) === 0)) {
        const q = mcQuestion();
        const e = new EmbedBuilder().setColor(COLOR).setTitle(`❓ جولة ${r}/${R}`).setDescription(`**${q.text}**\n⏳ ${ts(type === 'quizrace' ? 15000 : 20000)}`);
        if (type === 'quizrace') {
          const ans = await askButtons(ch, e, q.labels, 15000, { mode: 'all', correct: q.correct, styles: q.styles });
          if (ev.stop) break;
          const right = [...ans.entries()].filter(([, a]) => a.k === q.correct).sort((a, b) => a[1].t - b[1].t);
          right.forEach(([id], k) => scores.set(id, (scores.get(id) || 0) + (k === 0 ? 2 : 1)));
          await ch.send({ embeds: [new EmbedBuilder().setColor(0x99aab5).setDescription(`✅ الجواب: **${q.show}**\n${right.length ? `جاوب صح **${right.length}** — وأسرعهم <@${right[0][0]}> ⚡` : 'محد جابها 😅'}`)], allowedMentions: { parse: [] } }).catch(() => {});
        } else {
          const m = await askButtons(ch, e, q.labels, 20000, { mode: 'first', correct: q.correct, styles: q.styles });
          if (ev.stop) break;
          if (m) scores.set(m.id, (scores.get(m.id) || 0) + 1);
          await ch.send({ embeds: [new EmbedBuilder().setColor(0x99aab5).setDescription(m ? `✅ ${m} جابها! (**${q.show}**)` : `⏰ محد جابها — الجواب: **${q.show}**`)], allowedMentions: { parse: [] } }).catch(() => {});
        }
      } else {
        const q = typedQuestion(pick(['emoji', 'scramble', 'math', 'riddle', 'proverb']));
        q.e.setTitle(`${q.e.data.title} — جولة ${r}/${R}`).setDescription(`${q.e.data.description}\n⏳ ${ts(30000)}`);
        const m = await askTyped(ch, q.e, q.answers, 30000, { antiCopy: q.antiCopy });
        if (ev.stop) break;
        if (m) scores.set(m.id, (scores.get(m.id) || 0) + 1);
        await ch.send({ embeds: [new EmbedBuilder().setColor(0x99aab5).setDescription(m ? `✅ ${m} جابها! (**${q.show}**)` : `⏰ محد جابها — الجواب: **${q.show}**`)], allowedMentions: { parse: [] } }).catch(() => {});
      }
      if (r < R) await sleep(3500);
    }
    if (!ev.stop) await finishRanked(ch, title, scores, prize);
    return;
  }

  if (type === 'elim') {
    const players = await joinPhase(ch, title, 'اضغط **🙋 انضم** — بعدين تنزل جمل وتجاوب صح ولا خطأ.\nاللي يغلط أو ما يجاوب يطلع ❌ وآخر واحد يبقى يفوز 👑', (minutes || 1) * 60000, prize);
    if (ev.stop) return;
    if (players.length < 2) { await ch.send('😅 لازم ينضم 2 على الأقل — انلغت الفعالية.').catch(() => {}); return; }
    let alive = new Set(players);
    const qs = shuffle(TF);
    for (let r = 1; r <= 25 && alive.size > 1 && !ev.stop; r++) {
      const [s, ok] = qs[(r - 1) % qs.length];
      const e = new EmbedBuilder().setColor(COLOR).setTitle(`✅❌ جولة ${r} — باقي ${alive.size}`).setDescription(`**${s}**\n\nبس اللي باقين يجاوبون • ⏳ ${ts(12000)}`);
      const ans = await askButtons(ch, e, ['✅ صح', '❌ خطأ'], 12000, { mode: 'all', allowed: alive, styles: [ButtonStyle.Success, ButtonStyle.Danger] });
      if (ev.stop) break;
      const correct = ok ? 0 : 1;
      const out = [...alive].filter((id) => ans.get(id)?.k !== correct);
      let note;
      if (out.length === alive.size) note = '😂 كلكم غلطتوا — محد طلع هالجولة!';
      else { for (const id of out) alive.delete(id); note = out.length ? `❌ طلعوا: ${out.map((id) => `<@${id}>`).join(' ')}` : '🔥 كلكم جبتوها! محد طلع'; }
      await ch.send({ embeds: [new EmbedBuilder().setColor(0x99aab5).setDescription(`الجواب: **${ok ? 'صح ✅' : 'خطأ ❌'}**\n${note}\n👥 باقي: **${alive.size}**`)], allowedMentions: { parse: [] } }).catch(() => {});
      await sleep(3000);
    }
    if (ev.stop) return;
    const winners = [...alive];
    const each = Math.floor(prize / Math.max(1, winners.length));
    for (const id of winners) if (each) ECO.add(id, each, `فعالية: ${title}`);
    await ch.send({ content: winners.map((id) => `<@${id}>`).join(' '), embeds: [new EmbedBuilder().setColor(0xffd700).setTitle('👑 الفايز!')
      .setDescription(`${winners.map((id) => `<@${id}>`).join('، ')} ${winners.length > 1 ? 'صمدوا للنهاية ويتقاسمون الجائزة' : 'آخر واحد صامد!'} 🎉${each ? `\n+${ECO.fmt(each)}${winners.length > 1 ? ' لكل واحد' : ''}` : ''}`)], allowedMentions: { users: winners } }).catch(() => {});
    return;
  }

  if (type === 'roulette') {
    const players = await joinPhase(ch, title, 'اضغط **🙋 انضم** وادخل الروليت 🎰\nكل شوي يطلع واحد بالعشوائي... وآخر واحد يبقى ياخذ الجائزة!', (minutes || 1) * 60000, prize);
    if (ev.stop) return;
    if (players.length < 2) { await ch.send('😅 لازم ينضم 2 على الأقل — انلغت الروليت.').catch(() => {}); return; }
    const lines = ['🔫 الحظ ما كان معك يا {u}', '💨 {u} طار من الروليت!', '🍃 مع السلامة {u}', '💥 {u} انضرب وطلع', '🚪 {u} برا الروليت', '😵 {u} دارت عليه الدايرة', '🌪️ {u} شالته الريح'];
    let alive = shuffle(players);
    const msg = await ch.send({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🎰 الروليت تدور...').setDescription(`👥 **${alive.length}** لاعب`)] }).catch(() => null);
    while (alive.length > 1 && !ev.stop) {
      await sleep(4000);
      const out = alive.splice(crypto.randomInt(alive.length), 1)[0];
      await ch.send({ content: pick(lines).replace('{u}', `<@${out}>`), allowedMentions: { parse: [] } }).catch(() => {});
      if (msg) await msg.edit({ embeds: [new EmbedBuilder().setColor(COLOR).setTitle('🎰 الروليت تدور...').setDescription(`👥 باقي **${alive.length}**:\n${alive.map((id) => `<@${id}>`).join(' ')}`)] }).catch(() => {});
    }
    if (ev.stop) return;
    const m = await ch.guild.members.fetch(alive[0]).catch(() => null);
    await winOne(ch, m, title, prize, '\nآخر واحد صامد في الروليت 🎰');
    return;
  }

  if (type === 'fast') {
    const R = Math.max(1, Math.min(10, rounds || 3));
    await intro(`**${R} جولات** — بيطلع زر ⚡ فجأة، وأول واحد يضغطه ياخذ الجولة!`);
    await sleep(8000);
    const scores = new Map();
    for (let r = 1; r <= R && !ev.stop; r++) {
      const msg = await ch.send({ embeds: [new EmbedBuilder().setColor(0x99aab5).setTitle(`⚡ جولة ${r}/${R}`).setDescription('استعدوا... الزر بيطلع بأي لحظة 👀')] }).catch(() => null);
      await sleep(3000 + crypto.randomInt(7000));
      if (ev.stop || !msg) break;
      const n = nonce();
      const winner = await new Promise((resolve) => {
        btn = { n, mode: 'fast', tried: new Set(), answers: new Map(), resolve };
        btn.timer = setTimeout(() => { if (btn?.n === n) { btn = null; resolve(null); } }, 20000);
        msg.edit({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle(`⚡ جولة ${r}/${R}`).setDescription('# اضغط الحين!!')],
          components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`lv_b_${n}_0`).setLabel('اضغط!').setEmoji('⚡').setStyle(ButtonStyle.Success))] }).catch(() => {});
      });
      await msg.edit({ components: [], embeds: [new EmbedBuilder().setColor(0xffd700).setTitle(`⚡ جولة ${r}/${R}`).setDescription(winner ? `🏆 ${winner} أسرع واحد!` : 'محد ضغط 😴')] }).catch(() => {});
      if (winner) scores.set(winner.id, (scores.get(winner.id) || 0) + 1);
      await sleep(2500);
    }
    if (!ev.stop) await finishRanked(ch, title, scores, prize, 'جولة');
    return;
  }

  if (type === 'guessnum') {
    const max = rounds && rounds >= 10 ? Math.min(rounds, 10000) : 100;
    const target = 1 + crypto.randomInt(max);
    await intro(`فكّرت برقم من **1** إلى **${max}** 🤫\nاكتبوا أرقام بالشات وأنا أقولكم ⬆️ أكبر أو ⬇️ أصغر\nأول واحد يجيبه يفوز!`);
    await sleep(8000); if (ev.stop) return;
    const e = new EmbedBuilder().setColor(COLOR).setTitle('🔢 خمّن الرقم').setDescription(`الرقم بين **1** و **${max}** — اكتب تخمينك 👇\n⏳ ينتهي ${ts(4 * 60000)}`);
    const tries = { n: 0 };
    const m = await askTyped(ch, e, [String(target)], 4 * 60000, {
      check: async (msg) => {
        const raw = digits(msg.content.trim());
        if (!/^\d{1,6}$/.test(raw)) return false;
        tries.n++;
        const v = Number(raw);
        if (v === target) return true;
        await msg.react(v < target ? '⬆️' : '⬇️').catch(() => {});
        return false;
      },
    });
    if (ev.stop) return;
    if (m) await winOne(ch, m, title, prize, `\nالرقم كان **${target}** (بعد ${tries.n} محاولة)`);
    else await ch.send(`⏰ انتهى الوقت! الرقم كان **${target}**`).catch(() => {});
    return;
  }

  if (type === 'giveaway') {
    const players = await joinPhase(ch, title, 'اضغط **🙋 انضم** وتدخل السحب 🎁\nبالأخير يطلع فايز بالعشوائي!', (minutes || 2) * 60000, prize);
    if (ev.stop) return;
    if (!players.length) { await ch.send('😅 محد دخل السحب!').catch(() => {}); return; }
    await ch.send('🥁 نسحب الحين...').catch(() => {});
    await sleep(3000);
    const m = await ch.guild.members.fetch(pick(players)).catch(() => null);
    await winOne(ch, m, title, prize, `\nمن بين **${players.length}** مشارك 🎉`);
  }
}

// ───────── فعاليات الموقع ─────────
function siteEmbed(room, state) {
  const link = `${SITE()}/live?r=${room.code}`;
  const t = ROOMS.TYPES[room.type];
  const desc = state === 'lobby'
    ? `${t.desc}\n\n🔗 **ادخل من الزر تحت** — بدون تسجيل ولا حساب!\n🎟️ زر **«خذ رابطك»** يعطيك رابط شخصي عشان الكوينز تنضاف لك لو فزت\n\n🔑 رمز الغرفة: **${room.code}**\n⏳ تبدأ ${ts(Math.max(0, room.startAt - Date.now()))}${room.prize ? `\n🏆 الجائزة: ${ECO.fmt(room.prize)} للأول (والثاني والثالث ياخذون بعد)` : ''}`
    : state === 'play' ? `🚀 **بدأت!** تقدر تدخل الحين وتلحق${room.type === 'phone' ? ' (تتفرج لين الجولة الجاية)' : ''}\n🔑 الرمز: **${room.code}**`
      : state === 'end' ? '🏁 خلصت الفعالية — شوفوا النتائج تحت 👇' : `⛔ ${room.cancelled || 'انلغت'}`;
  return new EmbedBuilder().setColor(state === 'end' || state === 'cancel' ? 0x99aab5 : COLOR)
    .setTitle(`🌐 فعالية على الموقع: ${room.title}`).setDescription(desc).setURL(link);
}
function siteRow(room, enabled = true) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`lv_site_${room.code}`).setLabel('خذ رابطك').setEmoji('🎟️').setStyle(ButtonStyle.Success).setDisabled(!enabled),
    new ButtonBuilder().setURL(`${SITE()}/live?r=${room.code}`).setLabel('دخول كزائر').setEmoji('🌐').setStyle(ButtonStyle.Link),
  );
}
async function siteFinished(room, ranking) {
  // الجزء هذا يمشي فورًا (قبل أي await) عشان الصفحة تعرض الكوينز مع النتائج
  const awards = [];
  ranking.forEach((r, k) => {
    if (!r.uid) return;
    let c = r.score > 0 ? prizeFor(k, room.prize) : 0;
    if (r.score > 0 && room.prize) c += 5; // مشاركة
    if (c) { ECO.add(r.uid, c, `فعالية الموقع: ${room.title}`); awards.push({ name: r.name, coins: c }); }
  });
  room.awards = awards;
  const ch = client.channels.cache.get(room.channelId);
  const ann = siteMsgs.get(room.code);
  if (ann) await ann.edit({ embeds: [siteEmbed(room, 'end')], components: [] }).catch(() => {});
  if (!ch) return;
  const medals = ['🥇', '🥈', '🥉'];
  const aw = new Map(awards.map((a) => [a.name, a.coins]));
  const lines = ranking.slice(0, 10).map((r, k) => `${medals[k] || `**${k + 1}.**`} ${r.uid ? `<@${r.uid}>` : `**${r.name}** 👤`} — **${r.score}**${aw.get(r.name) ? ` • +${aw.get(r.name)} ${ECO.COIN}` : ''}`);
  const files = [];
  const embed = new EmbedBuilder().setColor(0xffd700).setTitle(`🏁 نتائج ${room.title}`)
    .setDescription(`${lines.join('\n') || 'محد لعب 😅'}${ranking.some((r) => !r.uid) ? '\n\n👤 = دخل كزائر (بدون كوينز)' : ''}`);
  if (room.best?.img) {
    const ext = room.best.img.mime.split('/')[1] === 'jpeg' ? 'jpg' : room.best.img.mime.split('/')[1];
    files.push(new AttachmentBuilder(room.best.img.buf, { name: `best.${ext}` }));
    embed.setImage(`attachment://best.${ext}`).addFields({ name: `🎨 أحلى رسمة (${room.best.likes} ❤️)`, value: `رسمها **${room.best.name}**${room.best.prompt ? ` • «${String(room.best.prompt).slice(0, 80)}»` : ''}` });
  }
  const top = ranking.filter((r) => r.uid).slice(0, 3).map((r) => r.uid);
  await ch.send({ content: top.map((id) => `<@${id}>`).join(' ') || undefined, embeds: [embed], files, allowedMentions: { users: top } }).catch((e) => console.error('⚠️ live results:', e.message));
}

// ───────── الأوامر ─────────
const commands = [
  new SlashCommandBuilder().setName('فعالية').setDescription('👑 تسوي فعالية بالشات العام للكل (لصاحب السيرفر)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) => o.setName('نوع').setDescription('نوع الفعالية').setRequired(true)
      .addChoices(...Object.entries(CHAT_TYPES).map(([value, name]) => ({ name, value }))))
    .addIntegerOption((o) => o.setName('جائزة').setDescription(`كم ${ECO.COIN_NAME} للفايز؟ (افتراضي 50)`).setMinValue(0).setMaxValue(100000))
    .addIntegerOption((o) => o.setName('جولات').setDescription('عدد الجولات (للماراثون/الأسئلة/أسرع زر) — أو أكبر رقم في خمّن الرقم'))
    .addIntegerOption((o) => o.setName('مدة').setDescription('دقائق الانضمام (للروليت/الإقصاء/السحب)').setMinValue(1).setMaxValue(30))
    .addChannelOption((o) => o.setName('روم').setDescription('الروم (افتراضي الشات العام)').addChannelTypes(ChannelType.GuildText))
    .addBooleanOption((o) => o.setName('منشن').setDescription('يسوي @here مع الإعلان؟')),
  new SlashCommandBuilder().setName('فعالية-موقع').setDescription('👑 تسوي فعالية مباشرة على الموقع والكل يدخل من رابط (لصاحب السيرفر)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) => o.setName('نوع').setDescription('نوع الفعالية').setRequired(true)
      .addChoices(...Object.entries(ROOMS.TYPES).map(([value, t]) => ({ name: t.title, value }))))
    .addIntegerOption((o) => o.setName('جائزة').setDescription(`كم ${ECO.COIN_NAME} للأول؟ (افتراضي 100)`).setMinValue(0).setMaxValue(100000))
    .addIntegerOption((o) => o.setName('انتظار').setDescription('كم دقيقة قبل ما تبدأ تلقائي؟ (افتراضي 3)').setMinValue(1).setMaxValue(15))
    .addIntegerOption((o) => o.setName('جولات').setDescription('عدد الأسئلة/الجولات (للمسابقة والسباق وأسرع إصبع)').setMinValue(1).setMaxValue(20))
    .addChannelOption((o) => o.setName('روم').setDescription('روم الإعلان (افتراضي الشات العام)').addChannelTypes(ChannelType.GuildText))
    .addBooleanOption((o) => o.setName('منشن').setDescription('يسوي @here مع الإعلان؟')),
  new SlashCommandBuilder().setName('فعالية-ايقاف').setDescription('👑 يوقف الفعالية الشغالة (الشات والموقع)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map((c) => c.toJSON());

async function handle(i) {
  // أزرار
  if (i.isButton() && i.customId.startsWith('lv_')) {
    const id = i.customId;
    if (id.startsWith('lv_site_')) {
      const room = ROOMS.get(id.slice(8));
      if (!room || room.phase === 'end') return i.reply({ content: '🏁 هالفعالية خلصت — استنى الجاية!', flags: MessageFlags.Ephemeral }).then(() => true);
      const member = i.member;
      const tok = ROOMS.tokenFor(room, { uid: i.user.id, name: member?.displayName || i.user.globalName || i.user.username, avatar: i.user.displayAvatarURL({ size: 64, extension: 'png' }) });
      await i.reply({
        content: `🎟️ هذا رابطك الشخصي لـ **${room.title}** — لا تعطيه أحد 🤫\nلو فزت تنضاف الكوينز لرصيدك تلقائي ${ECO.COIN}`,
        components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setURL(`${SITE()}/live?r=${room.code}&t=${tok}`).setLabel('ادخل الفعالية').setEmoji('🎮').setStyle(ButtonStyle.Link))],
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (id.startsWith('lv_j_')) {
      if (!ev || ev.joinId !== id.slice(5)) return i.reply({ content: 'الانضمام قفل ⏰', flags: MessageFlags.Ephemeral }).then(() => true);
      if (ev.joined.has(i.user.id)) return i.reply({ content: 'أنت منضم ✅', flags: MessageFlags.Ephemeral }).then(() => true);
      ev.joined.add(i.user.id);
      await i.reply({ content: '✅ انضميت! استعد 🔥', flags: MessageFlags.Ephemeral });
      if (!ev.editPending) {
        ev.editPending = true;
        setTimeout(() => { if (!ev) return; ev.editPending = false; if (ev.joinId) ev.joinMsg?.edit({ embeds: [ev.joinEmbed()] }).catch(() => {}); }, 2000);
      }
      return true;
    }
    if (id.startsWith('lv_b_')) {
      const [, , n, k] = id.split('_');
      if (!btn || btn.n !== n) return i.reply({ content: 'هالسؤال خلص ⏰', flags: MessageFlags.Ephemeral }).then(() => true);
      const choice = Number(k);
      if (btn.mode === 'fast') {
        const b = btn; btn = null; clearTimeout(b.timer);
        await i.deferUpdate().catch(() => {});
        b.resolve(i.member);
        return true;
      }
      if (btn.allowed && !btn.allowed.has(i.user.id)) return i.reply({ content: 'أنت مو من اللاعبين الباقين 👀', flags: MessageFlags.Ephemeral }).then(() => true);
      if (btn.mode === 'all') {
        if (btn.answers.has(i.user.id)) return i.reply({ content: 'جاوبت ✅ محاولة وحدة بس', flags: MessageFlags.Ephemeral }).then(() => true);
        btn.answers.set(i.user.id, { k: choice, t: Date.now() });
        await i.reply({ content: '📝 انحفظ جوابك — النتيجة بعد ما يخلص الوقت', flags: MessageFlags.Ephemeral });
        if (btn.allowed && btn.answers.size >= btn.allowed.size) { const b = btn; btn = null; clearTimeout(b.timer); b.resolve(b.answers); }
        return true;
      }
      if (btn.tried.has(i.user.id)) return i.reply({ content: 'جاوبت قبل 😅 محاولة وحدة بس', flags: MessageFlags.Ephemeral }).then(() => true);
      btn.tried.add(i.user.id);
      if (choice === btn.correct) {
        const b = btn; btn = null; clearTimeout(b.timer);
        await i.deferUpdate().catch(() => {});
        b.resolve(i.member);
      } else await i.reply({ content: '❌ غلط!', flags: MessageFlags.Ephemeral });
      return true;
    }
    return false;
  }
  if (!i.isChatInputCommand()) return false;
  const n = i.commandName;
  if (n !== 'فعالية' && n !== 'فعالية-موقع' && n !== 'فعالية-ايقاف') return false;
  if (!ECO.isOwner(i)) { await i.reply({ content: '👑 هذا الأمر لصاحب السيرفر بس.', flags: MessageFlags.Ephemeral }); return true; }
  const g = i.guild;

  if (n === 'فعالية-ايقاف') {
    const parts = [];
    if (ev) { ev.stop = true; stopAsks(); parts.push('فعالية الشات'); }
    const room = ROOMS.current();
    if (room) { ROOMS.cancel(room, 'صاحب السيرفر أوقف الفعالية'); parts.push(`فعالية الموقع (${room.code})`); }
    await i.reply({ content: parts.length ? `⛔ وقّفت: ${parts.join(' + ')}` : 'ما فيه فعالية شغالة 😴', flags: MessageFlags.Ephemeral });
    return true;
  }

  const ch = i.options.getChannel('روم') || generalChannel(g, i.channel);
  const ping = !!i.options.getBoolean('منشن');

  if (n === 'فعالية') {
    if (ev) { await i.reply({ content: `فيه فعالية شغالة الحين في <#${ev.channelId}> — استنها تخلص أو أوقفها بـ \`/فعالية-ايقاف\``, flags: MessageFlags.Ephemeral }); return true; }
    let type = i.options.getString('نوع');
    if (type === 'random') type = pick(Object.keys(CHAT_TYPES).filter((x) => x !== 'random' && x !== 'giveaway'));
    const prize = i.options.getInteger('جائزة') ?? 50;
    const rounds = i.options.getInteger('جولات');
    const minutes = i.options.getInteger('مدة');
    ev = { type, channelId: ch.id, stop: false, ping };
    await i.reply({ content: `✅ بدأت **${CHAT_TYPES[type]}** في ${ch}`, flags: MessageFlags.Ephemeral });
    runChat(ch, type, prize, rounds, minutes)
      .catch((e) => { console.error('⚠️ chat event:', e); ch.send('⚠️ صار خطأ بالفعالية 😓').catch(() => {}); })
      .finally(() => { typed = null; btn = null; ev = null; });
    return true;
  }

  // فعالية-موقع
  const cur = ROOMS.current();
  if (cur) { await i.reply({ content: `فيه فعالية على الموقع شغالة (رمز **${cur.code}**) — أوقفها أول بـ \`/فعالية-ايقاف\``, flags: MessageFlags.Ephemeral }); return true; }
  const type = i.options.getString('نوع');
  const prize = i.options.getInteger('جائزة') ?? 100;
  const wait = i.options.getInteger('انتظار') ?? 3;
  const rounds = i.options.getInteger('جولات') || 0;
  const room = ROOMS.create({
    type, prize, rounds, waitMin: wait, channelId: ch.id,
    hooks: {
      onStart: (r) => { const m = siteMsgs.get(r.code); if (m) m.edit({ embeds: [siteEmbed(r, 'play')], components: [siteRow(r)] }).catch(() => {}); },
      onFinish: (r, ranking) => { siteFinished(r, ranking).catch((e) => console.error('⚠️ site finish:', e.message)); },
      onCancel: (r) => {
        const m = siteMsgs.get(r.code);
        if (m) m.edit({ embeds: [siteEmbed(r, 'cancel')], components: [] }).catch(() => {});
      },
    },
  });
  const hostTok = ROOMS.tokenFor(room, { uid: i.user.id, name: i.member?.displayName || i.user.username, avatar: i.user.displayAvatarURL({ size: 64, extension: 'png' }), host: true });
  const msg = await ch.send({
    content: ping ? '@here' : undefined,
    embeds: [siteEmbed(room, 'lobby')], components: [siteRow(room)],
    allowedMentions: { parse: ping ? ['everyone'] : [] },
  }).catch(() => null);
  if (msg) siteMsgs.set(room.code, msg);
  await i.reply({
    content: `✅ انفتحت **${room.title}** — الإعلان نزل في ${ch}\n👑 هذا **رابط التحكم** حقك (تبدأ/تتخطى/تنهي من الموقع) — لا تعطيه أحد!\nتبدأ تلقائي بعد **${wait}** دقيقة لو ما بدأتها.`,
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setURL(`${SITE()}/live?r=${room.code}&t=${hostTok}`).setLabel('افتح لوحة التحكم').setEmoji('👑').setStyle(ButtonStyle.Link))],
    flags: MessageFlags.Ephemeral,
  });
  return true;
}

// الرسائل (للأسئلة المكتوبة)
async function onMessage(msg) {
  if (!typed || msg.author.bot || msg.channelId !== typed.channelId) return;
  const t = typed;
  if (t.antiCopy && /[​-‏⁠﻿]/.test(msg.content)) {
    await msg.react('😏').catch(() => {});
    return;
  }
  const ok = t.check ? await t.check(msg) : matches(msg.content, t.answers);
  if (!ok || typed !== t) return;
  typed = null; clearTimeout(t.timer);
  await msg.react('🏆').catch(() => {});
  t.resolve(msg.member);
}

function init(c) {
  client = c;
  client.on('messageCreate', (m) => onMessage(m).catch((e) => console.error('⚠️ live msg:', e.message)));
  client.once('clientReady', () => console.log('🎉 فعاليات صاحب السيرفر جاهزة (/فعالية و /فعالية-موقع)'));
}

module.exports = { init, handle, commands, _test: { CHAT_TYPES, typedQuestion, mcQuestion, generalChannel } };
