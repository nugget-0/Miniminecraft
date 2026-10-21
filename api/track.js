// POST /api/track: the game reports play time and counters (heartbeats) and admin actions (events).
const { nb, configured, ensureTables, findOne, cors } = require('./_nb');

const str = (v, n) => String(v == null ? '' : v).slice(0, n);
const num = (v, max) => Math.max(0, Math.min(max, Math.floor(+v || 0)));
const EVENTS = new Set(['join', 'kick', 'ban', 'unban', 'deadmin', 'readmin', 'win', 'death']);

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false });
  if (!configured()) return res.status(200).json({ ok: false, configured: false });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  if (!b || typeof b !== 'object') return res.status(400).json({ ok: false });

  const pid = str(b.pid, 16), name = str(b.name, 16) || 'Player', now = new Date().toISOString();
  if (!/^u[a-z0-9]{4,12}$/.test(pid)) return res.status(400).json({ ok: false });

  try {
    await ensureTables();
    if (b.type === 'ev') {
      const kind = str(b.kind, 16);
      if (!EVENTS.has(kind)) return res.status(400).json({ ok: false });
      await nb('/tables/sw_events/rows', { method: 'POST', body: JSON.stringify({ kind, pid, name, detail: str(b.detail, 120), at: now }) });
      return res.status(200).json({ ok: true });
    }
    if (b.type === 'login') {
      const ncid = str(b.ncid, 40).trim().toUpperCase(), role = b.role === 'admin' ? 'admin' : 'user';
      if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(ncid)) return res.status(400).json({ ok: false });
      const r = await findOne('sw_ids', 'ncid', ncid);
      if (r) await nb('/tables/sw_ids/rows/' + r.id, { method: 'PATCH', body: JSON.stringify({ role, pid, name, last_seen: now, logins: (r.logins || 0) + 1 }) });
      else await nb('/tables/sw_ids/rows', { method: 'POST', body: JSON.stringify({ ncid, role, pid, name, first_seen: now, last_seen: now, logins: 1 }) });
      return res.status(200).json({ ok: true });
    }
    if (b.type !== 'hb') return res.status(400).json({ ok: false });

    const sid = str(b.sid, 24), dt = num(b.dt, 130), d = b.d || {};
    const c = { kills: num(d.kills, 2000), deaths: num(d.deaths, 200), broken: num(d.broken, 20000), placed: num(d.placed, 20000), shots: num(d.shots, 50000), moves: num(d.moves, 2000) };
    const meta = { mode: str(b.mode, 12), minigame: str(b.mg, 12), multiplayer: !!b.mp, device: b.device === 'touch' ? 'touch' : 'desktop' };

    let newSession = false;
    const s = sid && await findOne('sw_sessions', 'sid', sid);
    if (s) await nb('/tables/sw_sessions/rows/' + s.id, { method: 'PATCH', body: JSON.stringify({ last: now, seconds: (s.seconds || 0) + dt, name, ...meta }) });
    else if (sid) { newSession = true; await nb('/tables/sw_sessions/rows', { method: 'POST', body: JSON.stringify({ sid, pid, name, started: now, last: now, seconds: dt, ...meta }) }); }

    const p = await findOne('sw_players', 'pid', pid);
    if (p) {
      const upd = { name, last_seen: now, playtime: (p.playtime || 0) + dt, admin: !!b.admin, device: meta.device };
      for (const k in c) upd[k] = (p[k] || 0) + c[k];
      if (newSession) upd.sessions = (p.sessions || 0) + 1;
      await nb('/tables/sw_players/rows/' + p.id, { method: 'PATCH', body: JSON.stringify(upd) });
    } else {
      await nb('/tables/sw_players/rows', { method: 'POST', body: JSON.stringify({ pid, name, first_seen: now, last_seen: now, playtime: dt, sessions: 1, admin: !!b.admin, device: meta.device, ...c }) });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: e.message });
  }
};
