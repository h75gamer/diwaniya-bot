// تشغيل مع تشخيص الاتصال بديسكورد
require('dotenv').config();
const { Client } = require('discord.js');
const orig = Client.prototype.emit;
Client.prototype.emit = function (ev, ...a) {
  if (['debug', 'warn', 'error', 'shardError', 'invalidated', 'shardDisconnect'].includes(ev)) {
    const msg = String(a[0] && a[0].message ? a[0].message : a[0]);
    if (!/Heartbeat/i.test(msg)) console.log('[' + ev + ']', msg.slice(0, 300));
  }
  return orig.call(this, ev, ...a);
};
(async () => {
  try {
    const r = await fetch('https://discord.com/api/v10/gateway/bot', { headers: { Authorization: 'Bot ' + (process.env.DISCORD_TOKEN || '').trim() } });
    console.log('[check] gateway/bot status', r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.log('[check] fetch failed', e.message); }
})();
process.env.DISCORD_TOKEN = (process.env.DISCORD_TOKEN || '').trim();
require('./index.js');
