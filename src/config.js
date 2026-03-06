// ─────────────────────────────────────────────────────
//  src/config.js
//  Reads config from (priority order):
//    1. CLI arguments   (--port 9000)
//    2. ENV variables   (SYSWATCH_PORT=9000)
//    3. Config file at fixed path (see CONFIG_PATH below)
//    4. Defaults below
// ─────────────────────────────────────────────────────
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ── fixed config path (same regardless of cwd) ────
// root/sudo → /etc/syswatch/   non-root → ~/.config/syswatch/
function getConfigDir() {
  try {
    if (process.getuid && process.getuid() === 0) return '/etc/syswatch';
  } catch {}
  return path.join(os.homedir(), '.config', 'syswatch');
}

const CONFIG_DIR  = process.env.SYSWATCH_CONFIG_DIR || getConfigDir();
const CONFIG_PATH = path.join(CONFIG_DIR, 'syswatch.config.json');

// ── parse CLI args ─────────────────────────────────
const argv = process.argv.slice(2);
const arg  = (flag, def) => {
  const i = argv.indexOf(flag);
  return i !== -1 ? argv[i + 1] : def;
};
const flag = (f) => argv.includes(f);

// ── load optional config file ──────────────────────
let fileConf = {};
if (fs.existsSync(CONFIG_PATH)) {
  try { fileConf = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch (e) { console.warn('[syswatch] Warning: invalid syswatch.config.json at ' + CONFIG_PATH); }
}

// ── merge config ───────────────────────────────────
const config = {
  // Network
  host:       arg('--host',       process.env.SYSWATCH_HOST       || fileConf.host       || '127.0.0.1'),
  port:       +arg('--port',      process.env.SYSWATCH_PORT       || fileConf.port       || 8080),
  httpsPort:  +arg('--https-port',process.env.SYSWATCH_HTTPS_PORT || fileConf.httpsPort  || 8443),
  httpsEnabled: flag('--https') || process.env.SYSWATCH_HTTPS === 'true' || fileConf.https || false,

  // Auth
  authEnabled:  !flag('--no-auth') && (process.env.SYSWATCH_AUTH !== 'false') && (fileConf.auth !== false),
  // bcrypt hash of password — set via SYSWATCH_PASSWORD_HASH env or config file
  // Generate hash:  node -e "const b=require('bcrypt');b.hash('yourpass',10).then(console.log)"
  passwordHash: process.env.SYSWATCH_PASSWORD_HASH || fileConf.passwordHash || null,
  jwtSecret:    process.env.SYSWATCH_JWT_SECRET    || fileConf.jwtSecret    || _randomSecret(),

  // Session
  sessionHours: fileConf.sessionHours || 8,

  // TLS cert paths (used when httpsEnabled)
  certPath: fileConf.certPath || path.join(CONFIG_DIR, 'certs', 'cert.pem'),
  keyPath:  fileConf.keyPath  || path.join(CONFIG_DIR, 'certs', 'key.pem'),

  // Features
  learnMode:  fileConf.learnMode  !== false,   // default on
  maxLogLines: fileConf.maxLogLines || 200,

  // Dev mode (skips auth, uses mock data)
  dev: flag('--dev') || process.env.NODE_ENV === 'development',
};

function _randomSecret() {
  try { return require('crypto').randomBytes(32).toString('hex'); }
  catch { return 'syswatch-change-this-secret'; }
}

config.CONFIG_PATH = CONFIG_PATH;
config.CONFIG_DIR  = CONFIG_DIR;

module.exports = config;
