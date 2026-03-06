// ─────────────────────────────────────────────────────
//  src/journal.js
//  Wraps journalctl for log querying and SSE streaming.
// ─────────────────────────────────────────────────────
'use strict';

const { spawn, execSync } = require('child_process');

// ── build journalctl args from query params ────────
function buildArgs(opts = {}) {
  const args = ['--no-pager', '-o', 'json'];

  if (opts.follow)  args.push('-f');
  if (opts.unit)    args.push('-u', opts.unit);
  if (opts.priority && opts.priority !== 'all') args.push('-p', opts.priority);
  if (opts.since)   args.push('--since', opts.since);
  if (opts.boot)    args.push('-b', opts.boot === 'prev' ? '-1' : '0');
  if (opts.lines)   args.push('-n', String(+opts.lines || 100));
  else if (!opts.follow) args.push('-n', '200');

  return args;
}

// ── parse a single journal JSON line ──────────────
function parseLine(raw) {
  try {
    const e = JSON.parse(raw);
    return {
      ts:       e.__REALTIME_TIMESTAMP
                  ? new Date(+e.__REALTIME_TIMESTAMP / 1000).toISOString()
                  : null,
      cursor:   e.__CURSOR,
      unit:     (e._SYSTEMD_UNIT || e.SYSLOG_IDENTIFIER || 'kernel')
                  .replace('.service', ''),
      host:     e._HOSTNAME || '',
      pid:      e._PID || '',
      msg:      e.MESSAGE || '',
      priority: +e.PRIORITY || 6,
      // human priority label
      level:    ['emerg','alert','crit','err','warning','notice','info','debug'][+e.PRIORITY || 6],
    };
  } catch { return null; }
}

// ── one-shot log query ─────────────────────────────
// Equivalent: journalctl -u nginx -n 100 -o json --no-pager
function queryLogs(opts = {}) {
  const args = buildArgs(opts);
  try {
    const out = execSync(`journalctl ${args.join(' ')} 2>/dev/null`, {
      encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
    });
    return out.trim().split('\n').filter(Boolean).map(parseLine).filter(Boolean);
  } catch (e) {
    throw new Error('journalctl error: ' + e.message);
  }
}

// ── SSE streaming ─────────────────────────────────
// Equivalent: journalctl -f -u nginx -o json
// Browser connects to /api/logs/stream?unit=nginx&priority=err
// Uses Server-Sent Events (text/event-stream)
function streamLogs(req, res) {
  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',        // disable nginx buffering
  });
  res.write('retry: 3000\n\n');       // auto-reconnect every 3s

  const opts = {
    follow: true,
    unit:     req.query.unit     || null,
    priority: req.query.priority || null,
    since:    req.query.since    || '1h ago',
    lines:    req.query.lines    || 50,
  };

  const args = buildArgs(opts);
  const proc = spawn('journalctl', args);
  let buffer = '';

  proc.stdout.on('data', chunk => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete last line
    for (const line of lines) {
      const entry = parseLine(line);
      if (entry) {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
      }
    }
  });

  proc.stderr.on('data', d => {
    res.write(`event: error\ndata: ${d.toString().trim()}\n\n`);
  });

  proc.on('close', () => res.end());

  // clean up when browser disconnects
  req.on('close', () => {
    try { proc.kill('SIGTERM'); } catch {}
  });
}

// ── boot analysis ─────────────────────────────────
// Equivalent: systemd-analyze blame --json=short
function getBootAnalysis() {
  try {
    const summary = execSync('systemd-analyze 2>/dev/null', { encoding: 'utf8' }).trim();
    let blame = [];
    try {
      const raw = execSync('systemd-analyze blame --json=short 2>/dev/null', { encoding: 'utf8' });
      blame = JSON.parse(raw).slice(0, 20);
    } catch {
      // systemd-analyze blame --json not available on older versions, fall back
      const raw = execSync('systemd-analyze blame 2>/dev/null', { encoding: 'utf8' });
      blame = raw.trim().split('\n').slice(0, 20).map(l => {
        const m = l.trim().match(/^([\d.]+)ms\s+(.+)$/);
        return m ? { name: m[2].trim(), time: +m[1] } : null;
      }).filter(Boolean);
    }

    // parse: "Startup finished in Xs (firmware) + Ys (loader) + Zs (kernel) + Ws (userspace)"
    const times = {};
    const m = summary.match(/(\d+\.?\d*)s \((\w+)\)/g) || [];
    m.forEach(t => {
      const [, val, key] = t.match(/([\d.]+)s \((\w+)\)/);
      times[key] = +val;
    });

    return { summary, times, blame };
  } catch (e) {
    throw new Error('systemd-analyze failed: ' + e.message);
  }
}

module.exports = { queryLogs, streamLogs, getBootAnalysis };
