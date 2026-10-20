// Shared NuggetBase helper for the Stackwild stats functions.
// The write key lives in the NUGGETBASE_KEY environment variable on Vercel, never in the game page.
const BASE = 'https://nuggetdata.vercel.app/api/v1';

const configured = () => /^nb_w_/.test(process.env.NUGGETBASE_KEY || '');

async function nb(path, opt = {}) {
  const res = await fetch(BASE + path, {
    ...opt,
    headers: { Authorization: 'Bearer ' + process.env.NUGGETBASE_KEY, 'Content-Type': 'application/json', ...(opt.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((body.error && body.error.message) || 'NuggetBase HTTP ' + res.status);
    err.status = res.status;
    err.code = body.error && body.error.code;
    throw err;
  }
  return body;
}

// Tables are created on first use, so the only setup is the key.
const SCHEMA = {
  sw_players: [
    { name: 'pid', type: 'text', required: true }, { name: 'name', type: 'text' },
    { name: 'first_seen', type: 'date' }, { name: 'last_seen', type: 'date' },
    { name: 'playtime', type: 'number' }, { name: 'sessions', type: 'number' },
    { name: 'kills', type: 'number' }, { name: 'deaths', type: 'number' },
    { name: 'broken', type: 'number' }, { name: 'placed', type: 'number' },
    { name: 'shots', type: 'number' }, { name: 'moves', type: 'number' },
    { name: 'admin', type: 'boolean' }, { name: 'device', type: 'text' },
  ],
  sw_sessions: [
    { name: 'sid', type: 'text', required: true }, { name: 'pid', type: 'text' }, { name: 'name', type: 'text' },
    { name: 'started', type: 'date' }, { name: 'last', type: 'date' }, { name: 'seconds', type: 'number' },
    { name: 'mode', type: 'text' }, { name: 'minigame', type: 'text' },
    { name: 'multiplayer', type: 'boolean' }, { name: 'device', type: 'text' },
  ],
  sw_events: [
    { name: 'kind', type: 'text', required: true }, { name: 'pid', type: 'text' }, { name: 'name', type: 'text' },
    { name: 'detail', type: 'text' }, { name: 'at', type: 'date' },
  ],
};

let ready = null;
function ensureTables() {
  if (ready) return ready;
  ready = (async () => {
    for (const [name, columns] of Object.entries(SCHEMA)) {
      try { await nb('/tables/' + name); }
      catch (e) {
        if (e.status !== 404) throw e;
        try { await nb('/tables', { method: 'POST', body: JSON.stringify({ name, description: 'Stackwild stats', is_public: false, columns }) }); }
        catch (e2) { if (e2.status !== 409) throw e2; }
      }
    }
  })();
  ready.catch(() => { ready = null; });
  return ready;
}

async function findOne(table, col, val) {
  const r = await nb('/tables/' + table + '/rows?limit=1&filter[' + col + ']=' + encodeURIComponent(val));
  return (r.data && r.data[0]) || null;
}

async function allRows(table, order, max) {
  const out = [];
  for (let offset = 0; offset < max; offset += 500) {
    const r = await nb('/tables/' + table + '/rows?limit=500&offset=' + offset + '&order=' + order);
    out.push(...(r.data || []));
    if (!r.data || r.data.length < 500) break;
  }
  return out;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

module.exports = { nb, configured, ensureTables, findOne, allRows, cors };
