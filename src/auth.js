// ─────────────────────────────────────────────────────
//  src/auth.js
//  Simple JWT-based auth middleware.
//  Login → POST /auth/login  { password }
//  Token stored in httpOnly cookie "sw_token"
// ─────────────────────────────────────────────────────
'use strict';

const jwt    = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const config = require('./config');

// ── token helpers ──────────────────────────────────
function signToken() {
  return jwt.sign({ role: 'admin' }, config.jwtSecret, {
    expiresIn: `${config.sessionHours}h`,
  });
}

function verifyToken(token) {
  try { return jwt.verify(token, config.jwtSecret); }
  catch { return null; }
}

// ── middleware ─────────────────────────────────────
function requireAuth(req, res, next) {
  if (!config.authEnabled) return next();

  const token = req.cookies?.sw_token
    || req.headers['authorization']?.replace('Bearer ', '');

  if (verifyToken(token)) return next();

  // API requests get 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Browser requests → redirect to login page
  res.redirect('/login');
}

// ── routes factory ─────────────────────────────────
function authRoutes(app) {
  // Serve login page
  app.get('/login', (req, res) => {
    const token = req.cookies?.sw_token;
    if (verifyToken(token)) return res.redirect('/');
    res.sendFile(require('path').join(__dirname, '..', 'public', 'login.html'));
  });

  // POST /auth/login
  app.post('/auth/login', async (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });

    // If no hash is set yet → first run, accept any password and save hash
    if (!config.passwordHash) {
      const hash = await bcrypt.hash(password, 10);
      config.passwordHash = hash;
      console.log('\n✓ Password set for this session.');
      console.log('  To persist it, add to syswatch.config.json:');
      console.log(`  { "passwordHash": "${hash}" }\n`);
    }

    const valid = await bcrypt.compare(password, config.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = signToken();
    res.cookie('sw_token', token, {
      httpOnly: true,
      secure: config.httpsEnabled,
      sameSite: 'strict',
      maxAge: config.sessionHours * 3600 * 1000,
    });
    res.json({ ok: true });
  });

  // POST /auth/logout
  app.post('/auth/logout', (req, res) => {
    res.clearCookie('sw_token');
    res.json({ ok: true });
  });

  // GET /auth/status
  app.get('/auth/status', (req, res) => {
    const token = req.cookies?.sw_token;
    res.json({
      authenticated: !!verifyToken(token),
      authEnabled: config.authEnabled,
    });
  });
}

module.exports = { requireAuth, authRoutes };
