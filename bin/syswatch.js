#!/usr/bin/env node
// ─────────────────────────────────────────────────────
//  SysWatch CLI  —  bin/syswatch.js
//  Usage:
//    npx syswatch                   # quick start HTTP
//    npx syswatch --https           # HTTP + HTTPS
//    npx syswatch --port 9000       # custom port
//    npx syswatch --host 0.0.0.0    # bind all interfaces
//    npx syswatch --setup           # interactive first-run wizard
// ─────────────────────────────────────────────────────
'use strict';

const path = require('path');
const args = process.argv.slice(2);

// ── help ───────────────────────────────────────────────
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   SysWatch  —  Linux Monitor + Learn     ║
  ╚══════════════════════════════════════════╝

  Usage:
    npx syswatch [options]

  Options:
    --port <n>        HTTP port        (default: 8080)
    --https-port <n>  HTTPS port       (default: 8443)
    --host <ip>       Bind address     (default: 127.0.0.1)
    --https           Enable HTTPS too
    --no-auth         Disable password protection
    --setup           Run first-time setup wizard
    --help            Show this help

  Examples:
    npx syswatch                         # localhost:8080
    npx syswatch --host 0.0.0.0          # LAN access
    npx syswatch --https                 # HTTP + HTTPS
    npx syswatch --port 3000 --no-auth   # no password, port 3000
  `);
  process.exit(0);
}

// ── setup wizard ──────────────────────────────────────
if (args.includes('--setup')) {
  // force re-run setup even if config exists
  require('../src/setup').run(false);
} else {
  // server.js will auto-detect missing config and run setup
  require('../src/server');
}
