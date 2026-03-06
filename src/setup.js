// ─────────────────────────────────────────────────────
//  src/setup.js
//  First-run interactive setup wizard.
//  Runs automatically if syswatch.config.json is missing.
//  Also callable via: npx syswatch --setup
// ─────────────────────────────────────────────────────
'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');
const crypto   = require('crypto');

const CONFIG_PATH = path.join(process.cwd(), 'syswatch.config.json');

// ── helpers ───────────────────────────────────────
function ask(rl, question) {
  return new Promise(resolve => rl.question(question, resolve));
}

function askHidden(question) {
  // hide password input on linux/mac terminals
  return new Promise(resolve => {
    process.stdout.write(question);
    const stdin = process.openStdin();
    // try to hide input
    try { process.stdin.setRawMode(true); } catch {}
    let input = '';
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const onData = (ch) => {
      ch = ch + '';
      if (ch === '\n' || ch === '\r' || ch === '\u0004') {
        try { process.stdin.setRawMode(false); } catch {}
        process.stdin.pause();
        process.stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(input);
      } else if (ch === '\u0003') {
        process.exit();
      } else if (ch === '\u007f' || ch === '\b') {
        if (input.length > 0) {
          input = input.slice(0, -1);
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          process.stdout.write(question + '*'.repeat(input.length));
        }
      } else {
        input += ch;
        process.stdout.write('*');
      }
    };
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

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const config = {};

  // ── Step 1: Password ────────────────────────────
  print('Step 1/4 — Set your login password', 'bold');
  print('  (This protects your dashboard from others on the network)\n', 'dim');

  let password = '';
  let confirmed = '';

  while (true) {
    password  = await askHidden('  Enter password: ');
    if (password.length < 4) {
      print('  ✗ Password must be at least 4 characters. Try again.\n', 'red');
      continue;
    }
    confirmed = await askHidden('  Confirm password: ');
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

  // ── Generate JWT secret ─────────────────────────
  config.jwtSecret = crypto.randomBytes(32).toString('hex');
  config.sessionHours = 8;
  config.learnMode = true;
  config.maxLogLines = 200;

  rl.close();

  // ── Write config file ───────────────────────────
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
    `  Config saved → syswatch.config.json`,
    '',
    `  🌐  http://${config.host === '0.0.0.0' ? 'YOUR_IP' : 'localhost'}:${config.port}`,
    config.https ? `  🔒  https://${config.host === '0.0.0.0' ? 'YOUR_IP' : 'localhost'}:${config.httpsPort}` : '',
    '',
    '  Start the server:',
    '    sudo node src/server.js',
    '',
    '  Or if installed globally:',
    '    sudo syswatch',
  ].filter(l => l !== ''));
  console.log();

  if (autoMode) {
    // auto-start after setup
    print('  Starting SysWatch now...\n', 'cyan');
    require('./server');
  } else {
    process.exit(0);
  }
}

// ── check if config exists, if not → auto-run setup ─
function checkAndSetup() {
  if (!fs.existsSync(CONFIG_PATH)) {
    print('\n  ⚠  No syswatch.config.json found — running first-time setup...\n', 'yellow');
    return run(true); // autoMode = true means start server after setup
  }
  return Promise.resolve();
}

module.exports = { run, checkAndSetup };
