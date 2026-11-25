// غرف الفعاليات المباشرة على موقع الديوانية 🎮
// هاتف خربان (فكرة قارتك فون) • خمّن الرسمة • مسابقة مباشرة • سباق الأجوبة • أسرع إصبع
// بدون تسجيل دخول: رابط شخصي من الديسكورد (عشان الكوينز) أو دخول كزائر
const crypto = require('crypto');
const ED = require('./events-data');
const WD = require('./web-data');

const TYPES = {
  phone: { title: 'هاتف خربان 📞', min: 2, desc: 'تكتب جملة ← اللي بعدك يرسمها ← اللي بعده يخمّن وش رسم... وبالأخير نشوف كيف تخربطت 😂' },
  draw: { title: 'خمّن الرسمة 🎨', min: 2, desc: 'كل واحد يرسم كلمة والباقي يخمنون بالشات — أسرع واحد ياخذ نقاط أكثر' },
  quiz: { title: 'مسابقة مباشرة 🧠', min: 1, desc: 'أسئلة للكل بنفس الوقت — الصح والأسرع ياخذ نقاط أكثر' },
  race: { title: 'سباق الأجوبة ⚡', min: 1, desc: 'إيموجي، حروف، ألغاز، أمثال ورياضيات — اكتب الجواب قبل الكل' },
  tap: { title: 'أسرع إصبع 👆', min: 1, desc: 'استنى لين تصير الشاشة خضرا واضغط بأسرع ما يمكن!' },
};
const DUR = { write: 50000, draw: 100000, guess: 45000, pick: 12000, sdraw: 80000, sreveal: 5000, q: 15000, qrev: 5000, rq: 30000, rrev: 4000 };
const MAX_PLAYERS = 30;

const rooms = new Map();
const tokens = new Map();
let matchFn = null;
function matches(a, list) {
  if (!matchFn) matchFn = require('./events')._test.matches;
  return matchFn(a, list);
}
function norm(s) {
  return require('./events')._test.norm(s);
}

const rid = (n = 16) => crypto.randomBytes(n).toString('base64url').slice(0, n);
const pick = (a) => a[crypto.randomInt(a.length)];
function shuffle(a) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; }
function newCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 4 }, () => A[crypto.randomInt(A.length)]).join(''); } while (rooms.has(c));
  return c;
}
function cleanName(s) {
  let n = String(s || '').replace(/[\u0000-\u001f<>@#`*_~|\\]/g, '').replace(/https?:\/\/\S+|discord\.gg\S*|www\.\S+/gi, '').trim().slice(0, 20);
  if (!n) n = 'زائر';
  return n;
}
function cleanText(s, max = 120) {
  return String(s || '').replace(/[\u0000-\u001f<>`]/g, '').replace(/https?:\/\/\S+|discord\.gg\S*|www\.\S+/gi, '🔗').replace(/@(everyone|here)/gi, '@​$1').trim().slice(0, max);
}
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// ───────── أساسيات الغرفة ─────────
function create({ type, prize = 0, rounds = 0, waitMin = 3, channelId = null, hooks = {} }) {
  if (!TYPES[type]) throw new Error('type');
  const room = {
    code: newCode(), type, title: TYPES[type].title, desc: TYPES[type].desc, prize, rounds, channelId,
    phase: 'lobby', players: new Map(), order: [], seq: 1, waiters: new Set(), chat: [], strokes: [], imgs: new Map(),
    g: null, created: Date.now(), startAt: Date.now() + Math.max(1, waitMin) * 60000, extended: false,
    timer: null, extra: [], hooks, turnId: 0, flushQ: false, result: null, ended: 0, cancelled: null,
  };
  rooms.set(room.code, room);
  room.autoTimer = setTimeout(() => start(room, true), room.startAt - Date.now());
  sys(room, `🎮 انفتحت غرفة «${room.title}» — الرمز ${room.code}`);
  return room;
}
function tokenFor(room, info) {
  const t = rid(22);
  tokens.set(t, { code: room.code, uid: info.uid || null, name: cleanName(info.name), avatar: info.avatar || null, host: !!info.host });
  return t;
}
const get = (code) => rooms.get(String(code || '').toUpperCase());
function current() {
  let best = null;
  for (const r of rooms.values()) if (r.phase !== 'end' && (!best || r.created > best.created)) best = r;
  return best;
}
function summary(r) {
  return r && { code: r.code, type: r.type, title: r.title, desc: r.desc, phase: r.phase, players: r.players.size, prize: r.prize, startAt: r.startAt };
}

function flush(room) {
  room.flushQ = false;
  for (const w of [...room.waiters]) respond(room, w);
}
function bump(room) {
  room.seq++;
  if (!room.flushQ) { room.flushQ = true; setImmediate(() => flush(room)); }
}
function push(room, arr, item, cap) {
  room.seq++;
  item.seq = room.seq;
  arr.push(item);
  if (cap && arr.length > cap) arr.splice(0, arr.length - cap);
  if (!room.flushQ) { room.flushQ = true; setImmediate(() => flush(room)); }
}
function sys(room, text, to = null) { push(room, room.chat, { sys: true, text, to }, 120); }
function later(room, ms, fn) {
  clearTimeout(room.timer);
  room.timer = setTimeout(() => { try { fn(); } catch (e) { console.error('⚠️ live:', e); } }, Math.max(0, ms));
}
function clearExtra(room) { for (const t of room.extra) clearTimeout(t); room.extra = []; }
const isActive = (p) => p && Date.now() - p.seen < 35000;
const nameOf = (room, pid) => room.players.get(pid)?.name || '؟';
const participants = (room) => room.order.map((id) => room.players.get(id)).filter(Boolean);
const activeParts = (room) => participants(room).filter(isActive);

function start(room, auto = false) {
  clearTimeout(room.autoTimer);
  if (room.phase !== 'lobby') return { error: 'بدأت' };
  const ps = [...room.players.values()].filter(isActive).filter((p) => !p.spec);
  const min = TYPES[room.type].min;
  if (ps.length < min) {
    if (auto && !room.extended) {
      room.extended = true;
      room.startAt = Date.now() + 2 * 60000;
      room.autoTimer = setTimeout(() => start(room, true), 2 * 60000);
      sys(room, `⏳ نحتاج ${min} لاعبين على الأقل — مدّدنا الانتظار دقيقتين`);
      return { error: 'العدد' };
    }
    if (auto) { cancel(room, 'ما اكتمل عدد اللاعبين 😅'); return { error: 'العدد' }; }
    return { error: `نحتاج ${min} لاعبين على الأقل` };
  }
  room.phase = 'play';
  room.order = shuffle(ps.map((p) => p.pid));
  for (const p of room.players.values()) p.score = 0;
  sys(room, '🚀 بدأت الفعالية! بالتوفيق للجميع');
  try { room.hooks.onStart?.(room); } catch {}
  GAMES[room.type].init(room);
  bump(room);
  return { ok: true };
}
function finish(room) {
  if (room.phase === 'end') return;
  clearTimeout(room.timer); clearExtra(room);
  room.phase = 'end';
  room.ended = Date.now();
  const ranking = participants(room).sort((a, b) => b.score - a.score)
    .map((p) => ({ pid: p.pid, name: p.name, uid: p.uid, avatar: p.avatar, score: p.score }));
  room.result = ranking;
  sys(room, '🏁 خلصت الفعالية! شوفوا النتائج');
  try { room.hooks.onFinish?.(room, ranking); } catch (e) { console.error('⚠️ live finish hook:', e.message); }
  bump(room);
}
function cancel(room, reason) {
  if (room.phase === 'end') return;
  clearTimeout(room.timer); clearTimeout(room.autoTimer); clearExtra(room);
  room.phase = 'end'; room.ended = Date.now(); room.cancelled = reason || 'انلغت';
  sys(room, `⛔ ${room.cancelled}`);
  try { room.hooks.onCancel?.(room, room.cancelled); } catch {}
  bump(room);
}

// ───────── 📞 هاتف خربان ─────────
const phoneKind = (s) => (s === 0 ? 'write' : s % 2 === 1 ? 'draw' : 'guess');
const chainOf = (N, j, s) => (((j - s) % N) + N) % N;
const phone = {
  init(room) {
    const N = room.order.length;
    room.g = { N, steps: Math.max(3, Math.min(N, 10)), step: -1, chains: room.order.map(() => []), subs: new Set(), stage: 'steps', ideas: {}, likes: new Map(), ai: 0 };
    for (const pid of room.order) room.g.ideas[pid] = pick(WD.DRAW);
    phone.next(room);
  },
  next(room) {
    const g = room.g;
    g.step++;
    if (g.step >= g.steps) return phone.album(room);
    g.subs = new Set();
    g.kind = phoneKind(g.step);
    g.deadline = Date.now() + DUR[g.kind];
    later(room, DUR[g.kind] + 2500, () => phone.close(room));
    bump(room);
  },
  close(room) {
    const g = room.g;
    if (g.stage !== 'steps') return;
    room.order.forEach((pid, j) => {
      const c = chainOf(g.N, j, g.step);
      if (!g.chains[c][g.step]) g.chains[c][g.step] = g.kind === 'draw' ? { by: pid, t: 'img', v: null } : { by: pid, t: 'text', v: '🤐 (ما كتب شي)' };
    });
    phone.next(room);
  },
  submit(room, p, b) {
    const g = room.g;
    if (g.stage !== 'steps') return { error: 'مو وقته' };
    const j = room.order.indexOf(p.pid);
    if (j < 0) return { error: 'أنت متفرج هالمرة 👀' };
    if (g.subs.has(p.pid)) return { error: 'سلّمت قبل ✅' };
    const c = chainOf(g.N, j, g.step);
    if (g.kind === 'draw') {
      const id = saveImg(room, b.img);
      if (!id) return { error: 'الرسمة ما وصلت صح 😓' };
      g.chains[c][g.step] = { by: p.pid, t: 'img', v: id };
    } else {
      const text = cleanText(b.text, 90);
      if (!text) return { error: 'اكتب شي 😅' };
      g.chains[c][g.step] = { by: p.pid, t: 'text', v: text };
    }
    g.subs.add(p.pid);
    const waiting = room.order.filter((id) => !g.subs.has(id) && isActive(room.players.get(id)));
    if (!waiting.length) later(room, 600, () => phone.close(room));
    bump(room);
    return { ok: true };
  },
  album(room) {
    const g = room.g;
    g.stage = 'album'; g.ai = 0;
    phone.albumTimer(room);
    bump(room);
  },
  albumTimer(room) {
    const g = room.g;
    const ms = g.chains[g.ai].length * 3500 + 9000;
    g.deadline = Date.now() + ms;
    later(room, ms, () => phone.albumNext(room));
  },
  albumNext(room) {
    const g = room.g;
    if (g.stage !== 'album') return;
    g.ai++;
    if (g.ai >= g.N) return phone.end(room);
    phone.albumTimer(room);
    bump(room);
  },
  like(room, p, id) {
    const g = room.g;
    if (g.stage !== 'album') return { error: 'مو وقته' };
    const entry = g.chains.flat().find((e) => e && e.t === 'img' && e.v === id);
    if (!entry) return { error: 'ما لقيت الرسمة' };
    if (entry.by === p.pid) return { error: 'ما يصير تعجبك رسمتك 😏' };
    const set = g.likes.get(id) || new Set();
    if (set.has(p.pid)) set.delete(p.pid); else set.add(p.pid);
    g.likes.set(id, set);
    bump(room);
    return { ok: true };
  },
  end(room) {
    const g = room.g;
    g.stage = 'done';
    let best = null;
    for (const e of g.chains.flat()) {
      if (!e || e.t !== 'img' || !e.v) continue;
      const n = g.likes.get(e.v)?.size || 0;
      const p = room.players.get(e.by);
      if (p) p.score += n;
      if (n > 0 && (!best || n > best.likes)) best = { id: e.v, by: e.by, likes: n };
    }
    if (best) {
      const chain = g.chains.find((ch) => ch.some((e) => e && e.v === best.id));
      const k = chain.findIndex((e) => e && e.v === best.id);
      room.best = { ...best, name: nameOf(room, best.by), prompt: chain[k - 1]?.v || '', img: room.imgs.get(best.id) };
    }
    finish(room);
  },
  view(room, p) {
    const g = room.g;
    if (!g) return null;
    if (g.stage === 'steps') {
      const j = room.order.indexOf(p.pid);
      const base = { stage: 'steps', step: g.step, steps: g.steps, kind: g.kind, deadline: g.deadline, done: g.subs.size, total: g.N };
      if (j < 0) return { ...base, spec: true };
      const c = chainOf(g.N, j, g.step);
      const prev = g.step > 0 ? g.chains[c][g.step - 1] : null;
      return { ...base, prompt: prev ? { t: prev.t, v: prev.v } : null, submitted: g.subs.has(p.pid), idea: g.step === 0 ? g.ideas[p.pid] : null };
    }
    if (g.stage === 'album') {
      const chain = g.chains[g.ai] || [];
      return {
        stage: 'album', i: g.ai, total: g.N, deadline: g.deadline, starter: nameOf(room, room.order[g.ai]),
        entries: chain.map((e) => e && ({ t: e.t, v: e.v, by: nameOf(room, e.by), mine: e.by === p.pid, likes: e.t === 'img' && e.v ? (g.likes.get(e.v)?.size || 0) : 0, liked: !!(e.t === 'img' && e.v && g.likes.get(e.v)?.has(p.pid)) })),
      };
    }
    return { stage: 'done' };
  },
  doneSet(room) { return room.g?.stage === 'steps' ? room.g.subs : null; },
  act(room, p, b) {
    if (b.a === 'submit') return phone.submit(room, p, b);
    if (b.a === 'like') return phone.like(room, p, String(b.id || ''));
    if (b.a === 'next' && p.host) {
      if (room.g.stage === 'album') phone.albumNext(room);
      else if (room.g.stage === 'steps') phone.close(room);
      return { ok: true };
    }
    return null;
  },
};

function saveImg(room, data) {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
  if (!m) return null;
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length < 200 || buf.length > 700000) return null;
  if (room.imgs.size > 400) return null;
  const id = rid(10);
  room.imgs.set(id, { buf, mime: `image/${m[1]}` });
  return id;
}

// ───────── 🎨 خمّن الرسمة ─────────
const draw = {
  init(room) {
    const per = room.rounds >= 2 ? 2 : 1;
    room.g = { dorder: [...room.order], turns: Math.min(room.order.length * per, 16), t: -1, used: new Set(), sub: null };
    draw.next(room);
  },
  next(room) {
    const g = room.g;
    clearExtra(room);
    let tries = 0;
    do { g.t++; tries++; } while (g.t < g.turns && !isActive(room.players.get(g.dorder[g.t % g.dorder.length])) && tries < 40);
    if (g.t >= g.turns) return finish(room);
    g.drawer = g.dorder[g.t % g.dorder.length];
    g.sub = 'pick';
    const pool = shuffle(WD.DRAW.filter((w) => !g.used.has(w)));
    g.choices = pool.slice(0, 3);
    g.word = null; g.guessed = new Map();
    g.deadline = Date.now() + DUR.pick;
    room.strokes = []; room.turnId++;
    sys(room, `🎨 دور ${nameOf(room, g.drawer)} يرسم`);
    later(room, DUR.pick, () => draw.pickWord(room, crypto.randomInt(3)));
    bump(room);
  },
  pickWord(room, i) {
    const g = room.g;
    if (g.sub !== 'pick') return;
    g.word = g.choices[i] || g.choices[0];
    g.used.add(g.word);
    g.sub = 'draw';
    g.start = Date.now();
    g.deadline = g.start + DUR.sdraw;
    const letters = [...g.word].map((ch, k) => (ch === ' ' ? -1 : k)).filter((k) => k >= 0);
    g.hintIdx = shuffle(letters).slice(0, letters.length >= 4 ? 2 : letters.length >= 3 ? 1 : 0);
    room.extra.push(setTimeout(() => bump(room), DUR.sdraw * 0.5), setTimeout(() => bump(room), DUR.sdraw * 0.75));
    later(room, DUR.sdraw, () => draw.endTurn(room));
    bump(room);
  },
  endTurn(room) {
    const g = room.g;
    if (g.sub !== 'draw') return;
    clearExtra(room);
    g.sub = 'reveal';
    g.deadline = Date.now() + DUR.sreveal;
    sys(room, `📢 الكلمة كانت: ${g.word}`);
    later(room, DUR.sreveal, () => draw.next(room));
    bump(room);
  },
  hint(g) {
    const el = (Date.now() - g.start) / DUR.sdraw;
    const n = el >= 0.75 ? 2 : el >= 0.5 ? 1 : 0;
    const show = new Set(g.hintIdx.slice(0, n));
    return [...g.word].map((ch, k) => (ch === ' ' ? ' ' : show.has(k) ? ch : '_')).join('');
  },
  guess(room, p, text) {
    const g = room.g;
    if (g.sub !== 'draw') return chat(room, p, text);
    if (p.pid === g.drawer) return { error: 'أنت الرسّام 😏 لا تكتب الجواب!' };
    if (g.guessed.has(p.pid)) return { error: 'عرفتها ✅ استنى الباقين' };
    if (!room.order.includes(p.pid)) { room.order.push(p.pid); }
    if (matches(text, [g.word])) {
      const rem = Math.max(0, g.deadline - Date.now());
      const pts = Math.round(50 + 100 * (rem / DUR.sdraw));
      p.score += pts;
      const d = room.players.get(g.drawer);
      if (d) d.score += 20;
      g.guessed.set(p.pid, pts);
      sys(room, `✅ ${p.name} عرفها! (+${pts})`);
      const left = room.order.filter((id) => id !== g.drawer && !g.guessed.has(id) && isActive(room.players.get(id)));
      if (!left.length) later(room, 800, () => draw.endTurn(room));
      bump(room);
      return { ok: true, correct: true };
    }
    const a = norm(text); const w = norm(g.word);
    if (a.length >= 3 && lev(a, w) === 1) sys(room, `🔥 «${cleanText(text, 30)}» قريبة جدًا!`, p.pid);
    return chat(room, p, text);
  },
  draw(room, p, ops) {
    const g = room.g;
    if (g.sub !== 'draw' || p.pid !== g.drawer) return { error: 'مو دورك' };
    if (!Array.isArray(ops) || !ops.length || ops.length > 200) return { error: 'bad' };
    if (room.strokes.length > 6000) return { error: 'كثير' };
    const clean = [];
    for (const o of ops) {
      if (!o || typeof o !== 'object') continue;
      const col = /^#[0-9a-f]{6}$/i.test(o.c) ? o.c : '#000000';
      if (o.k === 'l' && Array.isArray(o.p) && o.p.length >= 2 && o.p.length <= 600) {
        clean.push({ k: 'l', c: col, w: Math.max(1, Math.min(60, Number(o.w) | 0)), s: Number(o.s) | 0, p: o.p.map((v) => Math.max(0, Math.min(1000, Math.round(Number(v) || 0)))) });
      } else if (o.k === 'f') clean.push({ k: 'f', c: col, s: Number(o.s) | 0, x: Math.max(0, Math.min(1000, Number(o.x) | 0)), y: Math.max(0, Math.min(750, Number(o.y) | 0)) });
      else if (o.k === 'c' || o.k === 'u') clean.push({ k: o.k });
    }
    if (clean.length) push(room, room.strokes, { ops: clean });
    return { ok: true };
  },
  view(room, p) {
    const g = room.g;
    if (!g || !g.sub) return null;
    const me = p.pid === g.drawer;
    const v = { sub: g.sub, turn: g.t + 1, turns: g.turns, drawer: nameOf(room, g.drawer), me, deadline: g.deadline, turnId: room.turnId, guessed: [...g.guessed.keys()].map((id) => nameOf(room, id)) };
    if (g.sub === 'pick') { if (me) v.choices = g.choices; return v; }
    v.word = me || g.guessed.has(p.pid) || g.sub === 'reveal' ? g.word : draw.hint(g);
    v.len = [...g.word].filter((c) => c !== ' ').length;
    v.got = g.guessed.has(p.pid);
    return v;
  },
  doneSet(room) { return room.g?.sub === 'draw' ? new Set([...room.g.guessed.keys(), room.g.drawer]) : null; },
  act(room, p, b) {
    const g = room.g;
    if (b.a === 'pick' && g.sub === 'pick' && p.pid === g.drawer) { draw.pickWord(room, Number(b.i) | 0); return { ok: true }; }
    if (b.a === 'guess') return draw.guess(room, p, b.text);
    if (b.a === 'draw') return draw.draw(room, p, b.ops);
    if (b.a === 'next' && p.host) { if (g.sub === 'draw') draw.endTurn(room); else if (g.sub === 'pick') draw.pickWord(room, 0); else draw.next(room); return { ok: true }; }
    return null;
  },
};

// ───────── 🧠 مسابقة مباشرة ─────────
const ALL_TRIVIA = [...ED.TRIVIA, ...WD.TRIVIA];
const ALL_TF = [...ED.TRUE_FALSE, ...WD.TRUE_FALSE];
function buildQuiz(n) {
  const out = [];
  const tq = shuffle(ALL_TRIVIA); const tf = shuffle(ALL_TF);
  for (let k = 0; k < n; k++) {
    if (k % 3 === 2 && tf.length) {
      const [s, ok] = tf.pop();
      out.push({ text: s, opts: ['صح ✅', 'خطأ ❌'], ok: ok ? 0 : 1 });
    } else {
      const [q, opts, ok] = tq.pop();
      const order = shuffle([0, 1, 2, 3]);
      out.push({ text: q, opts: order.map((i) => opts[i]), ok: order.indexOf(ok) });
    }
  }
  return out;
}
const quiz = {
  init(room) {
    room.g = { qs: buildQuiz(Math.max(5, Math.min(20, room.rounds || 10))), qi: -1 };
    quiz.next(room);
  },
  next(room) {
    const g = room.g;
    g.qi++;
    if (g.qi >= g.qs.length) return finish(room);
    g.sub = 'q'; g.ans = new Map(); g.deadline = Date.now() + DUR.q;
    later(room, DUR.q, () => quiz.reveal(room));
    bump(room);
  },
  reveal(room) {
    const g = room.g;
    if (g.sub !== 'q') return;
    g.sub = 'rev'; g.deadline = Date.now() + DUR.qrev;
    later(room, DUR.qrev, () => quiz.next(room));
    bump(room);
  },
  answer(room, p, i) {
    const g = room.g;
    const q = g.qs[g.qi];
    if (g.sub !== 'q' || g.ans.has(p.pid) || !(i >= 0 && i < q.opts.length)) return { error: 'ما ينفع' };
    if (!room.order.includes(p.pid)) room.order.push(p.pid);
    const rem = Math.max(0, g.deadline - Date.now());
    const pts = i === q.ok ? Math.round(500 + 500 * (rem / DUR.q)) : 0;
    p.score += pts;
    g.ans.set(p.pid, { i, pts });
    if (activeParts(room).every((x) => g.ans.has(x.pid))) later(room, 700, () => quiz.reveal(room));
    bump(room);
    return { ok: true };
  },
  view(room, p) {
    const g = room.g;
    if (!g || !g.sub) return null;
    const q = g.qs[g.qi];
    const v = { sub: g.sub, qi: g.qi + 1, total: g.qs.length, text: q.text, opts: q.opts, deadline: g.deadline, answered: g.ans.size, my: g.ans.get(p.pid) || null };
    if (g.sub === 'rev') {
      v.ok = q.ok;
      v.counts = q.opts.map((_, k) => [...g.ans.values()].filter((a) => a.i === k).length);
    }
    return v;
  },
  doneSet(room) { return room.g?.sub === 'q' ? new Set(room.g.ans.keys()) : null; },
  act(room, p, b) {
    if (b.a === 'answer') return quiz.answer(room, p, Number(b.i));
    if (b.a === 'next' && p.host) { if (room.g.sub === 'q') quiz.reveal(room); else quiz.next(room); return { ok: true }; }
    return null;
  },
};

// ───────── ⚡ سباق الأجوبة ─────────
function buildRace(n) {
  const kinds = shuffle(['emoji', 'scramble', 'riddle', 'proverb', 'math', 'emoji', 'scramble', 'riddle', 'proverb', 'math']);
  const em = shuffle([...ED.EMOJI, ...WD.EMOJI]); const wd = shuffle([...ED.WORDS, ...WD.WORDS]);
  const rd = shuffle(WD.RIDDLES); const pv = shuffle(WD.PROVERBS);
  const out = [];
  for (let k = 0; k < n; k++) {
    const kind = kinds[k % kinds.length];
    if (kind === 'emoji') { const [e, a] = em.pop(); out.push({ label: '🤔 خمّن الإيموجي', text: e, big: true, answers: a, show: a[0] }); }
    if (kind === 'scramble') {
      const w = wd.pop(); let m = w;
      for (let t = 0; t < 10 && m === w; t++) m = shuffle([...w]).join('');
      out.push({ label: '🔤 رتّب الحروف', text: [...m].join(' '), big: true, answers: [w], show: w });
    }
    if (kind === 'riddle') { const [q, a] = rd.pop(); out.push({ label: '🧩 لغز', text: q, answers: a, show: a[0] }); }
    if (kind === 'proverb') { const [q, a] = pv.pop(); out.push({ label: '📜 كمّل المثل', text: q, answers: a, show: a[0] }); }
    if (kind === 'math') {
      const a = 3 + crypto.randomInt(15); const b = 2 + crypto.randomInt(11); const c = crypto.randomInt(40);
      const plus = crypto.randomInt(2) === 0;
      const ans = plus ? a * b + c : a * b - c;
      out.push({ label: '🧮 رياضيات', text: `${a} × ${b} ${plus ? '+' : '-'} ${c} = ؟`, big: true, answers: [String(ans)], show: String(ans) });
    }
  }
  return out;
}
const race = {
  init(room) {
    room.g = { qs: buildRace(Math.max(5, Math.min(20, room.rounds || 10))), qi: -1 };
    race.next(room);
  },
  next(room) {
    const g = room.g;
    g.qi++;
    if (g.qi >= g.qs.length) return finish(room);
    g.sub = 'q'; g.right = []; g.deadline = Date.now() + DUR.rq;
    later(room, DUR.rq, () => race.reveal(room));
    bump(room);
  },
  reveal(room) {
    const g = room.g;
    if (g.sub !== 'q') return;
    g.sub = 'rev'; g.deadline = Date.now() + DUR.rrev;
    later(room, DUR.rrev, () => race.next(room));
    bump(room);
  },
  answer(room, p, text) {
    const g = room.g;
    if (g.sub !== 'q') return { error: 'استنى السؤال الجاي' };
    if (g.right.some((r) => r.pid === p.pid)) return { error: 'جبتها ✅' };
    if (!room.order.includes(p.pid)) room.order.push(p.pid);
    if (!matches(text, g.qs[g.qi].answers)) return { ok: true, correct: false };
    const pts = Math.max(100, 300 - 50 * g.right.length);
    p.score += pts;
    g.right.push({ pid: p.pid, pts });
    sys(room, `⚡ ${p.name} جابها! (+${pts})`);
    if (activeParts(room).every((x) => g.right.some((r) => r.pid === x.pid))) later(room, 700, () => race.reveal(room));
    bump(room);
    return { ok: true, correct: true, pts };
  },
  view(room, p) {
    const g = room.g;
    if (!g || !g.sub) return null;
    const q = g.qs[g.qi];
    const mine = g.right.find((r) => r.pid === p.pid);
    const v = { sub: g.sub, qi: g.qi + 1, total: g.qs.length, label: q.label, text: q.text, big: !!q.big, deadline: g.deadline, right: g.right.map((r) => nameOf(room, r.pid)), my: mine ? mine.pts : null };
    if (g.sub === 'rev') v.answer = q.show;
    return v;
  },
  doneSet(room) { return room.g?.sub === 'q' ? new Set(room.g.right.map((r) => r.pid)) : null; },
  act(room, p, b) {
    if (b.a === 'answer') return race.answer(room, p, String(b.text || '').slice(0, 80));
    if (b.a === 'next' && p.host) { if (room.g.sub === 'q') race.reveal(room); else race.next(room); return { ok: true }; }
    return null;
  },
};

// ───────── 👆 أسرع إصبع ─────────
const tap = {
  init(room) {
    room.g = { rounds: Math.max(5, Math.min(15, room.rounds || 10)), r: -1 };
    tap.next(room);
  },
  next(room) {
    const g = room.g;
    g.r++;
    if (g.r >= g.rounds) return finish(room);
    g.sub = 'ready';
    g.goAt = Date.now() + 2500 + crypto.randomInt(4000);
    g.taps = new Map(); g.early = new Set();
    g.deadline = g.goAt + 3000;
    later(room, g.deadline - Date.now(), () => tap.end(room));
    bump(room);
  },
  end(room) {
    const g = room.g;
    if (g.sub !== 'ready') return;
    g.sub = 'res';
    g.res = [...g.taps.entries()].sort((a, b) => a[1] - b[1]);
    g.res.forEach(([pid], k) => { const p = room.players.get(pid); if (p && k < 3) p.score += 3 - k; });
    g.deadline = Date.now() + 3500;
    later(room, 3500, () => tap.next(room));
    bump(room);
  },
  tap(room, p, b) {
    const g = room.g;
    if (g.sub !== 'ready') return { error: 'مو وقته' };
    if (g.taps.has(p.pid) || g.early.has(p.pid)) return { error: 'ضغطت قبل' };
    if (!room.order.includes(p.pid)) room.order.push(p.pid);
    const ms = Math.round(Number(b.ms));
    if (b.early || Date.now() < g.goAt - 500 || !(ms >= 90 && ms <= 3000)) {
      g.early.add(p.pid);
      tap.check(room);
      bump(room);
      return { ok: true, early: true };
    }
    g.taps.set(p.pid, ms);
    tap.check(room);
    bump(room);
    return { ok: true, ms };
  },
  check(room) {
    const g = room.g;
    // ما ننهي الجولة قبل ما يطلع الأخضر (عشان اللي ضغطوا بدري ما يخربونها)
    if (Date.now() < g.goAt) return;
    if (activeParts(room).every((x) => g.taps.has(x.pid) || g.early.has(x.pid))) later(room, 400, () => tap.end(room));
  },
  view(room, p) {
    const g = room.g;
    if (!g || !g.sub) return null;
    const v = { sub: g.sub, r: g.r + 1, rounds: g.rounds, goAt: g.goAt, deadline: g.deadline, my: g.taps.get(p.pid) ?? null, early: g.early.has(p.pid), count: g.taps.size };
    if (g.sub === 'res') v.res = g.res.slice(0, 8).map(([pid, ms]) => ({ name: nameOf(room, pid), ms }));
    return v;
  },
  doneSet(room) { return room.g?.sub === 'ready' ? new Set([...room.g.taps.keys(), ...room.g.early]) : null; },
  act(room, p, b) {
    if (b.a === 'tap') return tap.tap(room, p, b);
    if (b.a === 'next' && p.host) { if (room.g.sub === 'ready') tap.end(room); else tap.next(room); return { ok: true }; }
    return null;
  },
};

const GAMES = { phone, draw, quiz, race, tap };

// ───────── الشات ─────────
function chat(room, p, text) {
  const t = cleanText(text, 120);
  if (!t) return { error: 'فاضي' };
  const now = Date.now();
  if (now - (p.lastChat || 0) < 700) return { error: 'شوي شوي 😅' };
  p.lastChat = now;
  push(room, room.chat, { name: p.name, text: t, host: p.host }, 120);
  return { ok: true };
}

// ───────── العرض لكل لاعب ─────────
function view(room, p) {
  const done = room.phase === 'play' ? GAMES[room.type].doneSet(room) : null;
  const list = [...room.players.values()]
    .filter((x) => isActive(x) || room.order.includes(x.pid))
    .map((x) => ({ name: x.name, avatar: x.avatar, score: x.score, host: x.host, linked: !!x.uid, away: !isActive(x), me: x.pid === p.pid, done: done ? done.has(x.pid) : false, spec: !!x.spec }));
  if (room.phase !== 'lobby') list.sort((a, b) => b.score - a.score);
  const v = {
    code: room.code, type: room.type, title: room.title, desc: room.desc, phase: room.phase, prize: room.prize,
    startAt: room.startAt, players: list,
    me: { name: p.name, host: p.host, linked: !!p.uid, score: p.score, spec: !!p.spec, avatar: p.avatar },
  };
  if (room.phase === 'play') v.g = GAMES[room.type].view(room, p);
  if (room.phase === 'end') {
    v.cancelled = room.cancelled;
    v.result = (room.result || []).slice(0, 15).map((r) => ({ name: r.name, score: r.score, avatar: r.avatar, linked: !!r.uid, me: r.pid === p.pid }));
    if (room.best) v.best = { id: room.best.id, name: room.best.name, likes: room.best.likes, prompt: room.best.prompt };
    if (room.awards) v.awards = room.awards;
  }
  return v;
}

function respond(room, w) {
  room.waiters.delete(w);
  clearTimeout(w.timer);
  if (w.res.writableEnded) return;
  const p = room.players.get(w.pid);
  if (!p) return sendJson(w.res, 410, { error: 'gone' });
  const since = w.since;
  sendJson(w.res, 200, {
    seq: room.seq, now: Date.now(), st: view(room, p),
    strokes: room.strokes.filter((s) => s.seq > since),
    chat: room.chat.filter((c) => c.seq > since && (!c.to || c.to === p.pid)).slice(-60).map((c) => ({ seq: c.seq, sys: !!c.sys, name: c.name, text: c.text, host: !!c.host, priv: !!c.to })),
  });
}

// ───────── HTTP ─────────
function sendJson(res, code, body) {
  if (res.writableEnded) return;
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}
const actRate = new Map();
function rateOk(pid, max = 25) {
  const now = Date.now();
  const r = actRate.get(pid) || { t: now, n: 0 };
  if (now - r.t > 1000) { r.t = now; r.n = 0; }
  r.n++;
  actRate.set(pid, r);
  return r.n <= max;
}

async function handle(req, res, url) {
  const p = url.pathname;
  if (!p.startsWith('/api/live/')) return false;
  const a = p.slice('/api/live/'.length);

  if (a === 'current') { sendJson(res, 200, { room: summary(current()) }); return true; }

  if (a === 'img') {
    const room = get(url.searchParams.get('r'));
    const img = room?.imgs.get(url.searchParams.get('id'));
    if (!img) { sendJson(res, 404, { error: 'not found' }); return true; }
    res.writeHead(200, { 'Content-Type': img.mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    res.end(img.buf);
    return true;
  }

  if (a === 'poll') {
    const room = get(url.searchParams.get('r'));
    if (!room) { sendJson(res, 404, { error: 'الفعالية خلصت أو الرمز غلط' }); return true; }
    const player = room.players.get(url.searchParams.get('p'));
    if (!player) { sendJson(res, 410, { error: 'gone' }); return true; }
    const wasAway = !isActive(player);
    player.seen = Date.now();
    if (wasAway) bump(room);
    const since = Number(url.searchParams.get('since')) || 0;
    const w = { pid: player.pid, since, res };
    if (room.seq > since) { room.waiters.add(w); respond(room, w); return true; }
    w.timer = setTimeout(() => respond(room, w), 20000);
    room.waiters.add(w);
    req.on('close', () => { clearTimeout(w.timer); room.waiters.delete(w); });
    return true;
  }

  if (req.method !== 'POST') { sendJson(res, 405, { error: 'method' }); return true; }

  if (a === 'join') {
    const b = await readBody(req, 2000).catch(() => null);
    const room = get(b?.r);
    if (!room) { sendJson(res, 404, { error: 'الفعالية خلصت أو الرمز غلط 😅' }); return true; }
    if (b.pid && room.players.has(b.pid)) {
      const pl = room.players.get(b.pid); pl.seen = Date.now(); bump(room);
      sendJson(res, 200, { pid: pl.pid }); return true;
    }
    const tok = b.t ? tokens.get(b.t) : null;
    if (tok && tok.code === room.code) {
      const same = [...room.players.values()].find((x) => x.uid && x.uid === tok.uid);
      if (same) { same.seen = Date.now(); if (tok.host) same.host = true; bump(room); sendJson(res, 200, { pid: same.pid }); return true; }
    }
    if (room.phase === 'end') { sendJson(res, 410, { error: 'الفعالية خلصت 🏁' }); return true; }
    let name = tok && tok.code === room.code ? tok.name : cleanName(b.name);
    const taken = new Set([...room.players.values()].map((x) => x.name));
    if (taken.has(name)) { let k = 2; while (taken.has(`${name} ${k}`)) k++; name = `${name} ${k}`; }
    const active = [...room.players.values()].filter(isActive).length;
    const pl = {
      pid: rid(18), name, avatar: tok?.avatar || null, uid: tok && tok.code === room.code ? tok.uid : null,
      host: !!(tok && tok.code === room.code && tok.host), score: 0, seen: Date.now(), joined: Date.now(),
      spec: (room.phase === 'play' && room.type === 'phone') || active >= MAX_PLAYERS,
    };
    room.players.set(pl.pid, pl);
    sys(room, `👋 ${pl.name} دخل${pl.spec ? ' (يتفرج)' : ''}`);
    sendJson(res, 200, { pid: pl.pid });
    return true;
  }

  if (a === 'act') {
    const b = await readBody(req, 800000).catch(() => null);
    const room = get(b?.r);
    if (!room) { sendJson(res, 404, { error: 'الفعالية خلصت' }); return true; }
    const pl = room.players.get(b.p);
    if (!pl) { sendJson(res, 410, { error: 'gone' }); return true; }
    pl.seen = Date.now();
    if (!rateOk(pl.pid, b.a === 'draw' ? 40 : 12)) { sendJson(res, 429, { error: 'شوي شوي 😅' }); return true; }
    let out = null;
    if (b.a === 'start') out = pl.host ? start(room) : { error: 'للمنظّم بس' };
    else if (b.a === 'end') { if (pl.host) { if (room.phase === 'play') finish(room); else cancel(room, 'المنظّم لغى الفعالية'); out = { ok: true }; } else out = { error: 'للمنظّم بس' }; }
    else if (b.a === 'chat') out = room.phase === 'play' && room.type === 'draw' ? draw.guess(room, pl, b.text) : chat(room, pl, b.text);
    else if (room.phase === 'play' && !pl.spec) out = GAMES[room.type].act(room, pl, b);
    sendJson(res, out?.error ? 400 : 200, out || { error: 'ما ينفع الحين' });
    return true;
  }

  sendJson(res, 404, { error: 'not found' });
  return true;
}

// تنظيف دوري
setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.phase === 'lobby') {
      let changed = false;
      for (const [pid, pl] of room.players) if (now - pl.seen > 45000) { room.players.delete(pid); changed = true; }
      if (changed) bump(room);
      if (now - room.created > 60 * 60000) cancel(room, 'انتهى وقت الغرفة');
    }
    if (room.phase === 'end' && now - room.ended > 20 * 60000) {
      for (const w of room.waiters) { clearTimeout(w.timer); sendJson(w.res, 404, { error: 'انتهت' }); }
      rooms.delete(room.code);
      for (const [t, v] of tokens) if (v.code === room.code) tokens.delete(t);
    }
  }
  for (const [k, r] of actRate) if (now - r.t > 60000) actRate.delete(k);
}, 10000).unref();

module.exports = { TYPES, DUR, create, tokenFor, get, current, summary, start, finish, cancel, handle, rooms };
