// GET /api/stats: everything the in-game admin dashboard shows, worked out from the NuggetBase tables.
const { configured, ensureTables, allRows, cors } = require('./_nb');

const day = d => String(d || '').slice(0, 10);

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!configured()) return res.status(200).json({ configured: false });
  try {
    await ensureTables();
    const [players, sessions, events] = await Promise.all([
      allRows('sw_players', '-playtime', 2000),
      allRows('sw_sessions', '-started', 2000),
      allRows('sw_events', '-at', 500),
    ]);
    const now = Date.now(), today = day(new Date().toISOString());
    const since = ms => r => r && now - Date.parse(r) < ms;
    const sum = (rows, k) => rows.reduce((a, r) => a + (+r[k] || 0), 0);

    const days = [];
    for (let i = 13; i >= 0; i--) {
      const key = day(new Date(now - i * 864e5).toISOString());
      const ss = sessions.filter(s => day(s.started) === key);
      days.push({ day: key, sessions: ss.length, players: new Set(ss.map(s => s.pid)).size, minutes: Math.round(sum(ss, 'seconds') / 60) });
    }
    const count = (rows, f) => { const m = {}; for (const r of rows) { const k = f(r); m[k] = (m[k] || 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v })); };
    const recent = sessions.filter(s => since(30 * 864e5)(s.started));
    const MG = { '': 'Normal world', spleef: 'Spleef', gungame: 'Gun Game', ctf: 'Capture the Flag', koth: 'King of the Hill', bedwars: 'Bed Wars', wings: 'Wings Race' };

    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');
    return res.status(200).json({
      configured: true,
      at: new Date().toISOString(),
      totals: {
        players: players.length,
        sessions: sessions.length,
        hours: Math.round(sum(players, 'playtime') / 360) / 10,
        kills: sum(players, 'kills'), deaths: sum(players, 'deaths'),
        broken: sum(players, 'broken'), placed: sum(players, 'placed'),
        shots: sum(players, 'shots'), moves: sum(players, 'moves'),
        online: sessions.filter(s => since(150e3)(s.last)).length,
        today: players.filter(p => day(p.last_seen) === today).length,
        week: players.filter(p => since(7 * 864e5)(p.last_seen)).length,
        newWeek: players.filter(p => since(7 * 864e5)(p.first_seen)).length,
      },
      days,
      modes: count(recent, s => MG[s.minigame || ''] || s.minigame),
      devices: count(recent, s => s.device || 'desktop'),
      multiplayer: recent.length ? Math.round(recent.filter(s => s.multiplayer).length / recent.length * 100) : 0,
      online: sessions.filter(s => since(150e3)(s.last)).map(s => ({ name: s.name, minigame: MG[s.minigame || ''] || s.minigame, mode: s.mode, minutes: Math.round((s.seconds || 0) / 60) })),
      top: players.slice(0, 15).map(p => ({ name: p.name, pid: p.pid, hours: Math.round((p.playtime || 0) / 360) / 10, sessions: p.sessions || 0, kills: p.kills || 0, deaths: p.deaths || 0, blocks: (p.broken || 0) + (p.placed || 0), admin: !!p.admin, last: p.last_seen })),
      events: events.slice(0, 30).map(e => ({ kind: e.kind, name: e.name, detail: e.detail, at: e.at })),
    });
  } catch (e) {
    return res.status(502).json({ configured: true, error: e.message });
  }
};
