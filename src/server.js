// ─────────────────────────────────────────────────────
//  src/server.js  —  SysWatch Main Entry
//  Starts HTTP and optionally HTTPS server.
//  Run:  node src/server.js [options]
// ─────────────────────────────────────────────────────
'use strict';

// ── Auto-run setup wizard if no config exists ─────
const { checkAndSetup } = require('./setup');
checkAndSetup().then(startServer).catch(err => {
  console.error('Startup error:', err.message);
  process.exit(1);
});

function startServer() {

const http        = require('http');
const https       = require('https');
const path        = require('path');
const fs          = require('fs');
const express     = require('express');
const cors        = require('cors');
const cookieParser = require('cookie-parser');

const config      = require('./config');
const { requireAuth, authRoutes } = require('./auth');
const { registerRoutes }          = require('./routes');

// ── app setup ──────────────────────────────────────
const app = express();

app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// ── auth routes (login, logout, status) ───────────
authRoutes(app);

// ── API routes ────────────────────────────────────
registerRoutes(app, { requireAuth });

// ── static frontend ───────────────────────────────
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path === '/login') return res.status(404).end();
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ── HTTP server ───────────────────────────────────
const httpServer = http.createServer(app);

httpServer.listen(config.port, config.host, () => {
  banner();
  console.log(`  🌐  HTTP   →  http://${displayHost()}:${config.port}`);
});

// ── HTTPS server (optional) ───────────────────────
if (config.httpsEnabled) {
  let tlsOpts;
  try {
    tlsOpts = {
      key:  fs.readFileSync(config.keyPath),
      cert: fs.readFileSync(config.certPath),
    };
  } catch {
    console.log('\n  ⚠  HTTPS certs not found. Generating self-signed cert...');
    const { generateCert } = require('../bin/gen-cert');
    generateCert();
    tlsOpts = {
      key:  fs.readFileSync(config.keyPath),
      cert: fs.readFileSync(config.certPath),
    };
  }

  const httpsServer = https.createServer(tlsOpts, app);
  httpsServer.listen(config.httpsPort, config.host, () => {
    console.log(`  🔒  HTTPS  →  https://${displayHost()}:${config.httpsPort}`);
    afterBanner();
  });
} else {
  afterBanner();
}

// ── banner ────────────────────────────────────────
function banner() {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║   SysWatch  v${require('../package.json').version}  —  Linux Monitor        ║
  ╚══════════════════════════════════════════════╝`);
}

function afterBanner() {
  console.log(`
  📖  Learn mode:  ${config.learnMode ? 'ON  (toggle in UI)' : 'OFF'}
  🔐  Auth:        ${config.authEnabled ? 'ON' : 'OFF (--no-auth)'}
  🖥  Host:        ${config.host}
  `);
}

function displayHost() {
  return config.host === '0.0.0.0' ? 'YOUR_SERVER_IP' : config.host;
}

module.exports = app; // for testing

} // end startServer()
