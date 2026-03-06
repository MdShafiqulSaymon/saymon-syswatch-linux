// ─────────────────────────────────────────────────────
//  src/setup.js
//  First-run interactive setup wizard.
//  Runs automatically if config is missing.
//  Also callable via: syswatch --setup
// ─────────────────────────────────────────────────────
'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');
const crypto   = require('crypto');
const os       = require('os');

// ── config path (mirrors src/config.js logic) ─────
function getConfigDir() {
  try {
    if (process.getuid && process.getuid() === 0) return '/etc/syswatch';
  } catch {}
  return path.join(os.homedir(), '.config', 'syswatch');
}

const CONFIG_DIR  = process.env.SYSWATCH_CONFIG_DIR || getConfigDir();
const CONFIG_PATH = path.join(CONFIG_DIR, 'syswatch.config.json');

// ── helpers ───────────────────────────────────────
function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

// Hide password input — uses raw stdin mode WITHOUT creating a readline interface
// so there is no conflict with the rl instance used for other questions.
function askHidden(question) {
  return new Promise(resolve => {
    process.stdout.write(question);

    const isTTY = process.stdin.isTTY;
    if (isTTY) {
      try { process.stdin.setRawMode(true); } catch {}
    }

    let input = '';

    const onData = (ch) => {
      const s = ch.toString();

      if (s === '\n' || s === '\r' || s === '\u0004') {
        // Enter / Ctrl-D → done
        if (isTTY) {
          try { process.stdin.setRawMode(false); } catch {}
        }
        process.stdin.removeListener('data', onData);
        process.stdin.pause();
        process.stdout.write('\n');
        resolve(input);

      } else if (s === '\u0003') {
        // Ctrl-C → exit
        process.stdout.write('\n');
        process.exit(0);

      } else if (s === '\u007f' || s === '\b') {
        // Backspace
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          process.stdout.write(question + '*'.repeat(input.length));
        }
      } else {
        input += s;
        process.stdout.write('*');
      }
    };

    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
  });
}

function clear() { process.stdout.write('\x1Bc'); }

function print(text, color) {
  const colors = { green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
                   red: '\x1b[31m', bold: '\x1b[1m', dim: '\x1b[2m', reset: '\x1b[0m' };
  console.log((colors[color] || '') + text + colors.reset);
}

function box(lines) {
  const width = 54;
  const border = '─'.repeat(width);
  console.log(`\x1b[36m╭${border}╮\x1b[0m`);
  for (const line of lines) {
    const pad = width - line.replace(/\x1b\[[0-9;]*m/g, '').length;
    console.log(`\x1b[36m│\x1b[0m ${line}${' '.repeat(Math.max(0, pad - 1))}\x1b[36m│\x1b[0m`);
  }
  console.log(`\x1b[36m╰${border}╯\x1b[0m`);
}

// ── main wizard ───────────────────────────────────
async function run(autoMode = false) {
  clear();

  box([
    '\x1b[1m\x1b[32m  SysWatch — First Time Setup\x1b[0m',
    '',
    '  Linux Monitor + Learning Dashboard',
    '  This wizard creates your config file.',
    '  Takes about 30 seconds ⚡',
  ]);
  console.log();

  const config = {};

  // ── Step 1: Password (raw stdin — no readline yet) ─
  print('Step 1/4 — Set your login password', 'bold');
  print('  (This protects your dashboard from others on the network)\n', 'dim');

  let password = '';
  while (true) {
    password         = await askHidden('  Enter password: ');
    if (password.length < 4) {
      print('  ✗ Password must be at least 4 characters. Try again.\n', 'red');
      continue;
    }
    const confirmed  = await askHidden('  Confirm password: ');
    if (password !== confirmed) {
      print('  ✗ Passwords do not match. Try again.\n', 'red');
      continue;
    }
    break;
  }

  print('\n  ⏳ Hashing password (bcrypt)...', 'dim');
  const bcrypt = require('bcrypt');
  config.passwordHash = await bcrypt.hash(password, 10);
  print('  ✓ Password set!\n', 'green');

  // ── readline for remaining non-secret questions ──
  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
  });

  // ── Step 2: Port ────────────────────────────────
  print('Step 2/4 — HTTP Port', 'bold');
  print('  Default is 8080. Press Enter to keep it.\n', 'dim');

  const portInput = await ask(rl, '  Port [8080]: ');
  config.port = portInput ? parseInt(portInput) : 8080;
  print(`  ✓ HTTP port: ${config.port}\n`, 'green');

  // ── Step 3: Host binding ────────────────────────
  print('Step 3/4 — Who can access SysWatch?', 'bold');
  print('  1) Only this computer  (127.0.0.1) ← safer', 'dim');
  print('  2) Anyone on my network (0.0.0.0)  ← for LAN access\n', 'dim');

  const hostChoice = await ask(rl, '  Choose [1]: ');
  config.host = (hostChoice.trim() === '2') ? '0.0.0.0' : '127.0.0.1';
  const hostLabel = config.host === '0.0.0.0' ? 'Network (0.0.0.0)' : 'Localhost only';
  print(`  ✓ Access: ${hostLabel}\n`, 'green');

  // ── Step 4: HTTPS ───────────────────────────────
  print('Step 4/4 — Enable HTTPS? (optional)', 'bold');
  print('  A self-signed certificate will be auto-generated.', 'dim');
  print('  Browser will show a warning — that is normal.\n', 'dim');

  const httpsChoice = await ask(rl, '  Enable HTTPS? [y/N]: ');
  config.https = httpsChoice.toLowerCase().startsWith('y');
  config.httpsPort = 8443;
  print(`  ✓ HTTPS: ${config.https ? 'Enabled on port 8443' : 'Disabled'}\n`, 'green');

  config.jwtSecret    = crypto.randomBytes(32).toString('hex');
  config.sessionHours = 8;
  config.learnMode    = true;
  config.maxLogLines  = 200;

  rl.close();

  // ── Write config file ───────────────────────────
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const finalConfig = {
    _note: "Auto-generated by syswatch --setup. Do NOT commit this file to git.",
    host:         config.host,
    port:         config.port,
    https:        config.https,
    httpsPort:    config.httpsPort,
    auth:         true,
    passwordHash: config.passwordHash,
    jwtSecret:    config.jwtSecret,
    sessionHours: config.sessionHours,
    learnMode:    config.learnMode,
    maxLogLines:  config.maxLogLines,
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(finalConfig, null, 2));

  // ── Done ────────────────────────────────────────
  console.log();
  box([
    '\x1b[1m\x1b[32m  ✓ Setup complete!\x1b[0m',
    '',
    `  Config saved → ${CONFIG_PATH}`,
    '',
    `  🌐  http://${config.host === '0.0.0.0' ? 'YOUR_IP' : 'localhost'}:${config.port}`,
    config.https ? `  🔒  https://${config.host === '0.0.0.0' ? 'YOUR_IP' : 'localhost'}:${config.httpsPort}` : '',
    '',
    '  To start:  sudo syswatch',
    '  Re-setup:  sudo syswatch --setup',
  ].filter(l => l !== ''));
  console.log();

  if (autoMode) {
    print('  Starting SysWatch now...\n', 'cyan');
    // server is already chained via .then(startServer) in server.js
  } else {
    process.exit(0);
  }
}

// ── check if config exists, if not → auto-run setup ─
function checkAndSetup() {
  if (!fs.existsSync(CONFIG_PATH)) {
    print(`\n  ⚠  No config found at ${CONFIG_PATH} — running first-time setup...\n`, 'yellow');
    return run(true);
  }
  return Promise.resolve();
}

module.exports = { run, checkAndSetup, CONFIG_PATH, CONFIG_DIR };
