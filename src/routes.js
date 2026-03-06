// ─────────────────────────────────────────────────────
//  src/routes.js
//  All /api/* routes.  Protected by requireAuth.
// ─────────────────────────────────────────────────────
'use strict';

const rateLimit = require('express-rate-limit');
const metrics   = require('./metrics');
const services  = require('./services');
const processes = require('./processes');
const journal   = require('./journal');

// ── rate limiters ──────────────────────────────────
const apiLimiter = rateLimit({ windowMs: 60_000, max: 300,
  message: { error: 'Too many requests' } });

const controlLimiter = rateLimit({ windowMs: 60_000, max: 20,
  message: { error: 'Too many control requests' } });

// ── error wrapper ─────────────────────────────────
const wrap = fn => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function registerRoutes(app, { requireAuth }) {
  app.use('/api', apiLimiter);

  // ── METRICS ─────────────────────────────────────
  // GET /api/metrics  — full snapshot (CPU, mem, disk, net, uptime)
  // Learning note: reads /proc/stat /proc/meminfo /proc/loadavg
  app.get('/api/metrics', requireAuth, wrap(async (req, res) => {
    const snap = await metrics.getSnapshot();
    res.json(snap);
  }));

  // GET /api/metrics/cpu
  app.get('/api/metrics/cpu', requireAuth, wrap(async (req, res) => {
    const cpu = await metrics.getCpuPercent();
    res.json({ cpu });
  }));

  // GET /api/metrics/memory
  app.get('/api/metrics/memory', requireAuth, wrap(async (req, res) => {
    res.json(metrics.getMemory());
  }));

  // ── SERVICES ────────────────────────────────────
  // GET /api/services  — all systemd service units
  // Learning note: systemctl list-units --type=service --all --output=json
  app.get('/api/services', requireAuth, wrap(async (req, res) => {
    const list = await services.listServices();
    res.json(list);
  }));

  // GET /api/services/:name  — single service info
  app.get('/api/services/:name', requireAuth, wrap(async (req, res) => {
    const info = await services.getServiceInfo(req.params.name);
    res.json(info);
  }));

  // POST /api/services/:name/control  { action: "restart"|"stop"|"start" }
  // Learning note: systemctl restart nginx.service
  app.post('/api/services/:name/control', requireAuth, controlLimiter, wrap(async (req, res) => {
    const { action } = req.body;
    const result = await services.controlService(req.params.name, action);
    res.json(result);
  }));

  // ── PROCESSES ───────────────────────────────────
  // GET /api/processes  — all processes from /proc
  // Learning note: cat /proc/*/stat  or  ps aux
  app.get('/api/processes', requireAuth, wrap((req, res) => {
    const procs = processes.getProcesses();
    res.json(procs);
  }));

  // DELETE /api/processes/:pid  { signal: 9|15 }
  // Learning note: kill -9 <pid>
  app.delete('/api/processes/:pid', requireAuth, controlLimiter, wrap((req, res) => {
    const signal = +(req.query.signal || req.body?.signal || 15);
    const result = processes.killProcess(req.params.pid, signal);
    res.json(result);
  }));

  // ── JOURNAL LOGS ────────────────────────────────
  // GET /api/logs?unit=nginx&priority=err&lines=100&since=1h+ago
  // Learning note: journalctl -u nginx -p err -n 100 --since "1h ago" -o json
  app.get('/api/logs', requireAuth, wrap((req, res) => {
    const entries = journal.queryLogs({
      unit:     req.query.unit     || null,
      priority: req.query.priority || null,
      since:    req.query.since    || null,
      lines:    req.query.lines    || 100,
      boot:     req.query.boot     || null,
    });
    res.json(entries);
  }));

  // GET /api/logs/stream  — SSE live stream
  // Learning note: journalctl -f -u nginx -o json  (streamed as SSE)
  app.get('/api/logs/stream', requireAuth, (req, res) => {
    journal.streamLogs(req, res);
  });

  // ── BOOT ANALYSIS ───────────────────────────────
  // GET /api/boot  — systemd-analyze blame output
  // Learning note: systemd-analyze blame --json=short
  app.get('/api/boot', requireAuth, wrap((req, res) => {
    const data = journal.getBootAnalysis();
    res.json(data);
  }));

  // ── SYSTEM INFO ─────────────────────────────────
  app.get('/api/system', requireAuth, wrap(async (req, res) => {
    res.json({
      hostname: metrics.getHostname(),
      kernel:   metrics.getKernelVersion(),
      uptime:   metrics.getUptime(),
      cpuInfo:  metrics.getCpuInfo(),
    });
  }));

  // ── HEALTH CHECK (no auth) ──────────────────────
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, version: require('../package.json').version });
  });

  // ── ERROR HANDLER ───────────────────────────────
  app.use('/api', (err, req, res, _next) => {
    console.error('[syswatch api error]', err.message);
    res.status(500).json({ error: err.message });
  });
}

module.exports = { registerRoutes };
