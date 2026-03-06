#!/usr/bin/env node
// ─────────────────────────────────────────────────────
//  bin/gen-cert.js
//  Generates a self-signed TLS cert for HTTPS mode.
//  Uses openssl — must be installed on the system.
//  Saves to: <configDir>/certs/key.pem + cert.pem
// ─────────────────────────────────────────────────────
'use strict';

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');

const { CONFIG_DIR } = require('../src/config');
const certsDir = path.join(CONFIG_DIR, 'certs');

function generateCert() {
  if (!fs.existsSync(certsDir)) fs.mkdirSync(certsDir, { recursive: true });

  const keyPath  = path.join(certsDir, 'key.pem');
  const certPath = path.join(certsDir, 'cert.pem');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    console.log('✓ Certificates already exist at certs/');
    return { keyPath, certPath };
  }

  console.log('🔐 Generating self-signed TLS certificate...');

  try {
    execSync(
      `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" \
       -out "${certPath}" -days 365 -nodes \
       -subj "/CN=syswatch/O=SysWatch/C=US"`,
      { stdio: 'pipe' }
    );
    console.log(`✓ Certificates saved to ${certsDir}/`);
    console.log('  Note: Browser will warn "Not secure" for self-signed certs — that is normal.');
    console.log('  For production, replace with Let\'s Encrypt certs.');
  } catch (e) {
    console.error('✗ openssl not found. Install it:  sudo apt install openssl');
    process.exit(1);
  }

  return { keyPath, certPath };
}

module.exports = { generateCert };

// run directly
if (require.main === module) generateCert();
