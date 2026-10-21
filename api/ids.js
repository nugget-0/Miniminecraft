// GET /api/ids: every NuggetCode ID that has logged in, with the player's current name, for the legacy admin dashboard.
const { configured, ensureTables, allRows, cors } = require('./_nb');

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!configured()) return res.status(200).json({ configured: false });
  try {
    await ensureTables();
    const [ids, players, sessions] = await Promise.all([
      allRows('sw_ids', '-last_seen', 5000),
      allRows('sw_players', '-last_seen', 5000),
      allRows('sw_sessions', '-last', 500),
    ]);
    const byPid = new Map(players.map(p => [p.pid, p]));
    const now = Date.now(), online = new Set(sessions.filter(s => s.last && now - Date.parse(s.last) < 150e3).map(s => s.pid));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      configured: true,
      ids: ids.map(r => {
        const p = byPid.get(r.pid);
        return { ncid: r.ncid, role: r.role, pid: r.pid, name: (p && p.name) || r.name || '', logins: r.logins || 0,
          first: r.first_seen, last: p && p.last_seen > r.last_seen ? p.last_seen : r.last_seen, online: online.has(r.pid) };
      }),
    });
  } catch (e) {
    return res.status(502).json({ configured: true, error: e.message });
  }
};
