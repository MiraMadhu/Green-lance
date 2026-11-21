const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');

const cfg = require('./config');
const db = require('./db');
const v = require('./views');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'script-src': ["'self'", 'https://checkout.razorpay.com'],
      'frame-src': ["'self'", 'https://api.razorpay.com', 'https://checkout.razorpay.com'],
      'connect-src': ["'self'", 'https://lumberjack.razorpay.com', 'https://api.razorpay.com'],
      'img-src': ["'self'", 'data:', 'https:'],
      'script-src-attr': ["'none'"],
      'upgrade-insecure-requests': cfg.isProd ? [] : null
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: cfg.isProd ? '7d' : 0 }));

/* ---------- helpers ---------- */
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'user';
const clean = (s, max = 200) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const emailOk = (e) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e) && e.length <= 254;

function passwordProblems(pw) {
  const p = [];
  if (typeof pw !== 'string' || pw.length < 8) p.push('at least 8 characters');
  if (pw && pw.length > 72) p.push('at most 72 characters');
  if (!/[a-z]/.test(pw || '')) p.push('a lowercase letter');
  if (!/[A-Z]/.test(pw || '')) p.push('an uppercase letter');
  if (!/[0-9]/.test(pw || '')) p.push('a number');
  if (!/[^A-Za-z0-9]/.test(pw || '')) p.push('a special character');
  return p;
}

function setSession(res, user) {
  const token = jwt.sign({ id: user.id }, cfg.jwtSecret, { expiresIn: '7d' });
  res.cookie('token', token, {
    httpOnly: true, sameSite: 'lax', secure: cfg.isProd, maxAge: 7 * 24 * 3600 * 1000, path: '/'
  });
}

function ensureProfile(user) {
  const exists = db.prepare('SELECT 1 FROM profiles WHERE user_id=?').get(user.id);
  if (exists) return;
  const slug = `${slugify(user.name)}-${user.id}`;
  db.prepare('INSERT INTO profiles (user_id, slug) VALUES (?, ?)').run(user.id, slug);
}

function publicUser(u) {
  return u && { id: u.id, name: u.name, email: u.email, role: u.role, credits: u.credits, premium: !!u.premium, freeLeft: Math.max(0, cfg.freeContacts - u.free_used) };
}

/* ---------- session middleware ---------- */
app.use((req, res, next) => {
  req.user = null;
  const t = req.cookies && req.cookies.token;
  if (t) {
    try {
      const p = jwt.verify(t, cfg.jwtSecret);
      req.user = db.prepare('SELECT * FROM users WHERE id=?').get(p.id) || null;
    } catch (_) { /* invalid/expired */ }
  }
  res.locals.user = req.user;
  next();
});

// CSRF defence for API writes: JSON only + same-origin check
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (!req.is('application/json')) return res.status(415).json({ error: 'JSON required' });
    const origin = req.get('origin');
    if (origin && origin !== cfg.baseUrl && cfg.isProd) return res.status(403).json({ error: 'Bad origin' });
  }
  next();
});

const apiAuth = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Please log in' }));
const pageAuth = (req, res, next) => (req.user ? next() : res.redirect('/login?next=' + encodeURIComponent(req.originalUrl)));
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Not allowed for your account type' });

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Try again in a few minutes.' } });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: true, legacyHeaders: false });
app.use('/api', apiLimiter);

/* ---------- auth API ---------- */
app.post('/api/register', authLimiter, (req, res) => {
  const name = clean(req.body.name, 80);
  const email = clean(req.body.email, 254).toLowerCase();
  const role = req.body.role;
  const pw = req.body.password;
  if (name.length < 2) return res.status(400).json({ error: 'Please enter your name' });
  if (!emailOk(email)) return res.status(400).json({ error: 'Enter a valid email address' });
  if (!['freelancer', 'client'].includes(role)) return res.status(400).json({ error: 'Choose freelancer or client' });
  const problems = passwordProblems(pw);
  if (problems.length) return res.status(400).json({ error: 'Password needs ' + problems.join(', ') });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(409).json({ error: 'An account with this email already exists' });
  const hash = bcrypt.hashSync(pw, 12);
  const info = db.prepare('INSERT INTO users (email, password_hash, name, role) VALUES (?,?,?,?)').run(email, hash, name, role);
  const user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
  ensureProfile(user);
  setSession(res, user);
  res.json({ ok: true, redirect: '/dashboard' });
});

app.post('/api/login', authLimiter, (req, res) => {
  const email = clean(req.body.email, 254).toLowerCase();
  const pw = typeof req.body.password === 'string' ? req.body.password : '';
  const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  // constant-ish time: always run a compare
  const ok = bcrypt.compareSync(pw, user ? user.password_hash : '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi');
  if (!user || !ok) return res.status(401).json({ error: 'Incorrect email or password' });
  setSession(res, user);
  const next = typeof req.body.next === 'string' && /^\/[^/\\]/.test(req.body.next) ? req.body.next : '/dashboard';
  res.json({ ok: true, redirect: user.role === 'admin' ? '/admin' : next });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ ok: true });
});

/* ---------- Google OAuth (no extra deps) ---------- */
app.get('/auth/google', (req, res) => {
  if (!cfg.google.clientId) return res.redirect('/login?err=' + encodeURIComponent('Google sign-in is not configured yet'));
  const role = req.query.role === 'client' ? 'client' : 'freelancer';
  const state = crypto.randomBytes(16).toString('hex');
  res.cookie('gstate', `${state}|${role}`, { httpOnly: true, sameSite: 'lax', secure: cfg.isProd, maxAge: 10 * 60 * 1000 });
  const params = new URLSearchParams({
    client_id: cfg.google.clientId,
    redirect_uri: `${cfg.baseUrl}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account'
  });
  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params);
});

app.get('/auth/google/callback', async (req, res) => {
  try {
    const [state, role] = String(req.cookies.gstate || '').split('|');
    res.clearCookie('gstate');
    if (!state || state !== req.query.state || !req.query.code) throw new Error('state');
    const tok = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(req.query.code),
        client_id: cfg.google.clientId,
        client_secret: cfg.google.clientSecret,
        redirect_uri: `${cfg.baseUrl}/auth/google/callback`,
        grant_type: 'authorization_code'
      })
    }).then((r) => r.json());
    if (!tok.access_token) throw new Error('token');
    const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: 'Bearer ' + tok.access_token }
    }).then((r) => r.json());
    if (!info.email || !info.email_verified) throw new Error('email');
    const email = info.email.toLowerCase();
    let user = db.prepare('SELECT * FROM users WHERE google_id=? OR email=?').get(info.sub, email);
    if (!user) {
      const hash = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10);
      const r = db.prepare('INSERT INTO users (email, password_hash, google_id, name, role) VALUES (?,?,?,?,?)')
        .run(email, hash, info.sub, clean(info.name || email.split('@')[0], 80), role === 'client' ? 'client' : 'freelancer');
      user = db.prepare('SELECT * FROM users WHERE id=?').get(r.lastInsertRowid);
    } else if (!user.google_id) {
      db.prepare('UPDATE users SET google_id=? WHERE id=?').run(info.sub, user.id);
    }
    ensureProfile(user);
    setSession(res, user);
    res.redirect('/dashboard');
  } catch (e) {
    res.redirect('/login?err=' + encodeURIComponent('Google sign-in failed. Please try again.'));
  }
});

/* ---------- profile ---------- */
app.put('/api/profile', apiAuth, (req, res) => {
  const u = req.user;
  const b = req.body;
  const name = clean(b.name, 80);
  if (name.length < 2) return res.status(400).json({ error: 'Name is required' });
  const phone = clean(b.phone, 20).replace(/[^0-9+\-\s()]/g, '');
  let website = clean(b.website, 200);
  if (website && !/^https?:\/\//i.test(website)) website = 'https://' + website;
  if (website && !/^https?:\/\/[^\s<>"']+$/i.test(website)) return res.status(400).json({ error: 'Website URL looks invalid' });
  const category = cfg.categories.includes(b.category) ? b.category : '';
  db.prepare('UPDATE users SET name=?, phone=? WHERE id=?').run(name, phone, u.id);
  ensureProfile(u);
  db.prepare(`UPDATE profiles SET headline=?, bio=?, skills=?, category=?, rate=?, location=?, company=?, website=?, updated_at=datetime('now') WHERE user_id=?`)
    .run(clean(b.headline, 120), clean(b.bio, 2000), clean(b.skills, 300), category, clean(b.rate, 60), clean(b.location, 80), clean(b.company, 100), website, u.id);
  res.json({ ok: true });
});

/* ---------- requirements (clients) ---------- */
app.post('/api/requirements', apiAuth, requireRole('client'), (req, res) => {
  const b = req.body;
  const title = clean(b.title, 120);
  const description = clean(b.description, 4000);
  if (title.length < 8) return res.status(400).json({ error: 'Give your requirement a clear title (8+ characters)' });
  if (description.length < 30) return res.status(400).json({ error: 'Describe what you need in at least 30 characters' });
  const category = cfg.categories.includes(b.category) ? b.category : 'Other';
  const info = db.prepare('INSERT INTO requirements (client_id,title,description,category,skills,budget,location) VALUES (?,?,?,?,?,?,?)')
    .run(req.user.id, title, description, category, clean(b.skills, 300), clean(b.budget, 60), clean(b.location, 80));
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.post('/api/requirements/:id/close', apiAuth, requireRole('client'), (req, res) => {
  const r = db.prepare("UPDATE requirements SET status='closed' WHERE id=? AND client_id=?").run(req.params.id, req.user.id);
  if (!r.changes) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true });
});

/* ---------- contact (the core paid action) ---------- */
app.post('/api/contact', apiAuth, requireRole('freelancer', 'client'), (req, res) => {
  const me = req.user;
  const targetId = Number(req.body.targetUserId);
  const reqId = req.body.requirementId ? Number(req.body.requirementId) : null;
  const message = clean(req.body.message, 1500);
  if (message.length < 20) return res.status(400).json({ error: 'Write a short intro (20+ characters) so they know why you are reaching out' });
  const target = db.prepare('SELECT * FROM users WHERE id=?').get(targetId);
  if (!target || target.id === me.id) return res.status(404).json({ error: 'Person not found' });
  // freelancers contact clients; clients contact freelancers
  const expected = me.role === 'freelancer' ? 'client' : 'freelancer';
  if (target.role !== expected) return res.status(403).json({ error: `You can only contact ${expected}s` });
  if (reqId) {
    const r = db.prepare("SELECT 1 FROM requirements WHERE id=? AND client_id=? AND status='open'").get(reqId, target.id);
    if (!r) return res.status(404).json({ error: 'That requirement is no longer open' });
  }

  const doContact = db.transaction(() => {
    const already = db.prepare('SELECT 1 FROM contacts WHERE from_user=? AND to_user=?').get(me.id, target.id);
    if (already) return { status: 200, body: { ok: true, already: true, contact: contactCard(target) } };
    const fresh = db.prepare('SELECT * FROM users WHERE id=?').get(me.id);
    let paidWith;
    if (fresh.free_used < cfg.freeContacts) {
      db.prepare('UPDATE users SET free_used = free_used + 1 WHERE id=?').run(me.id);
      paidWith = 'free';
    } else if (!fresh.premium) {
      return { status: 402, body: { error: `You have used your ${cfg.freeContacts} free contacts. Unlock lifetime access once to continue.`, need: 'unlock' } };
    } else if (fresh.credits < 1) {
      return { status: 402, body: { error: 'You are out of credits. Buy a credit pack to keep contacting.', need: 'credits' } };
    } else {
      db.prepare('UPDATE users SET credits = credits - 1 WHERE id=?').run(me.id);
      paidWith = 'credit';
    }
    db.prepare('INSERT INTO contacts (from_user,to_user,requirement_id,message,paid_with) VALUES (?,?,?,?,?)')
      .run(me.id, target.id, reqId, message, paidWith);
    return { status: 200, body: { ok: true, contact: contactCard(target) } };
  });

  const out = doContact();
  if (out.body.ok) out.body.me = publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(me.id));
  res.status(out.status).json(out.body);
});

function contactCard(u) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone || '' };
}

/* ---------- payments ---------- */
function applyPayment(row) {
  const t = db.transaction(() => {
    const cur = db.prepare('SELECT status FROM payments WHERE id=?').get(row.id);
    if (cur.status === 'paid') return false;
    db.prepare("UPDATE payments SET status='paid' WHERE id=?").run(row.id);
    if (row.plan === 'unlock') db.prepare('UPDATE users SET premium=1, credits=credits+? WHERE id=?').run(row.credits, row.user_id);
    else db.prepare('UPDATE users SET credits=credits+? WHERE id=?').run(row.credits, row.user_id);
    return true;
  });
  return t();
}

app.post('/api/pay/order', apiAuth, requireRole('freelancer', 'client'), async (req, res) => {
  const plan = cfg.plans[req.body.plan];
  if (!plan) return res.status(400).json({ error: 'Unknown plan' });
  const u = req.user;
  if (req.body.plan === 'unlock' && u.premium) return res.status(400).json({ error: 'You have already unlocked lifetime access' });
  if (req.body.plan !== 'unlock' && !u.premium) return res.status(400).json({ error: 'Unlock lifetime access first, then buy credits', need: 'unlock' });

  const demo = !cfg.razorpay.keyId;
  if (demo && !cfg.demoPayments) return res.status(503).json({ error: 'Payments are not configured yet' });

  let orderId = 'demo_' + crypto.randomBytes(8).toString('hex');
  if (!demo) {
    try {
      const r = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Basic ' + Buffer.from(`${cfg.razorpay.keyId}:${cfg.razorpay.keySecret}`).toString('base64')
        },
        body: JSON.stringify({ amount: plan.amount, currency: 'INR', receipt: `u${u.id}_${Date.now()}`, notes: { user: String(u.id), plan: req.body.plan } })
      });
      const j = await r.json();
      if (!r.ok || !j.id) throw new Error('razorpay');
      orderId = j.id;
    } catch (_) {
      return res.status(502).json({ error: 'Could not start payment. Please try again.' });
    }
  }
  db.prepare('INSERT INTO payments (user_id,plan,amount,credits,order_id) VALUES (?,?,?,?,?)').run(u.id, req.body.plan, plan.amount, plan.credits, orderId);
  res.json({ ok: true, demo, orderId, amount: plan.amount, keyId: cfg.razorpay.keyId, name: cfg.siteName, description: plan.desc, email: u.email, userName: u.name });
});

app.post('/api/pay/verify', apiAuth, (req, res) => {
  const orderId = clean(req.body.orderId, 100);
  const row = db.prepare('SELECT * FROM payments WHERE order_id=? AND user_id=?').get(orderId, req.user.id);
  if (!row) return res.status(404).json({ error: 'Order not found' });
  const demo = orderId.startsWith('demo_');
  if (demo) {
    if (cfg.razorpay.keyId || !cfg.demoPayments) return res.status(400).json({ error: 'Demo payments are disabled' });
  } else {
    const paymentId = clean(req.body.paymentId, 100);
    const sig = clean(req.body.signature, 200);
    const expected = crypto.createHmac('sha256', cfg.razorpay.keySecret).update(orderId + '|' + paymentId).digest('hex');
    const a = Buffer.from(expected), b = Buffer.from(sig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(400).json({ error: 'Payment verification failed' });
    db.prepare('UPDATE payments SET payment_id=? WHERE id=?').run(paymentId, row.id);
  }
  applyPayment(row);
  res.json({ ok: true, me: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id)) });
});

app.get('/api/me', (req, res) => res.json({ user: publicUser(req.user) }));

/* ---------- pages ---------- */
const PAGE = 18;

app.get('/', (req, res) => {
  const freelancers = db.prepare(`SELECT u.id,u.name,p.* FROM users u JOIN profiles p ON p.user_id=u.id WHERE u.role='freelancer' AND p.headline!='' ORDER BY p.updated_at DESC LIMIT 6`).all();
  const projects = db.prepare(`SELECT r.*, u.name AS client_name FROM requirements r JOIN users u ON u.id=r.client_id WHERE r.status='open' ORDER BY r.created_at DESC LIMIT 6`).all();
  const counts = {
    freelancers: db.prepare("SELECT COUNT(*) c FROM users WHERE role='freelancer'").get().c,
    clients: db.prepare("SELECT COUNT(*) c FROM users WHERE role='client'").get().c,
    projects: db.prepare("SELECT COUNT(*) c FROM requirements WHERE status='open'").get().c
  };
  res.send(v.home({ user: req.user, freelancers, projects, counts }));
});

app.get('/pricing', (req, res) => res.send(v.pricing({ user: req.user })));

app.get('/freelancers', (req, res) => {
  const q = clean(req.query.q, 60);
  const cat = cfg.categories.includes(req.query.category) ? req.query.category : '';
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const where = ["u.role='freelancer'", "p.headline!=''"];
  const args = [];
  if (q) { where.push('(u.name LIKE ? OR p.headline LIKE ? OR p.skills LIKE ? OR p.bio LIKE ?)'); args.push(...Array(4).fill(`%${q.replace(/[%_]/g, '')}%`)); }
  if (cat) { where.push('p.category=?'); args.push(cat); }
  const total = db.prepare(`SELECT COUNT(*) c FROM users u JOIN profiles p ON p.user_id=u.id WHERE ${where.join(' AND ')}`).get(...args).c;
  const rows = db.prepare(`SELECT u.id,u.name,p.* FROM users u JOIN profiles p ON p.user_id=u.id WHERE ${where.join(' AND ')} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`).all(...args, PAGE, (page - 1) * PAGE);
  res.send(v.freelancerList({ user: req.user, rows, q, cat, page, pages: Math.ceil(total / PAGE), total }));
});

app.get('/freelancers/:slug', (req, res) => {
  const f = db.prepare(`SELECT u.id,u.name,u.role,p.* FROM users u JOIN profiles p ON p.user_id=u.id WHERE p.slug=? AND u.role='freelancer' AND p.headline!=''`).get(req.params.slug);
  if (!f) return res.status(404).send(v.notFound({ user: req.user }));
  const contacted = req.user ? !!db.prepare('SELECT 1 FROM contacts WHERE from_user=? AND to_user=?').get(req.user.id, f.id) : false;
  res.send(v.freelancerPage({ user: req.user, f, contacted }));
});

app.get('/projects', (req, res) => {
  const q = clean(req.query.q, 60);
  const cat = cfg.categories.includes(req.query.category) ? req.query.category : '';
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const where = ["r.status='open'"];
  const args = [];
  if (q) { where.push('(r.title LIKE ? OR r.description LIKE ? OR r.skills LIKE ?)'); args.push(...Array(3).fill(`%${q.replace(/[%_]/g, '')}%`)); }
  if (cat) { where.push('r.category=?'); args.push(cat); }
  const total = db.prepare(`SELECT COUNT(*) c FROM requirements r WHERE ${where.join(' AND ')}`).get(...args).c;
  const rows = db.prepare(`SELECT r.*, u.name AS client_name FROM requirements r JOIN users u ON u.id=r.client_id WHERE ${where.join(' AND ')} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`).all(...args, PAGE, (page - 1) * PAGE);
  res.send(v.projectList({ user: req.user, rows, q, cat, page, pages: Math.ceil(total / PAGE), total }));
});

app.get('/projects/:id', (req, res) => {
  const r = db.prepare(`SELECT r.*, u.name AS client_name FROM requirements r JOIN users u ON u.id=r.client_id WHERE r.id=?`).get(req.params.id);
  if (!r) return res.status(404).send(v.notFound({ user: req.user }));
  const contacted = req.user ? !!db.prepare('SELECT 1 FROM contacts WHERE from_user=? AND to_user=?').get(req.user.id, r.client_id) : false;
  res.send(v.projectPage({ user: req.user, r, contacted }));
});

app.get('/login', (req, res) => res.send(v.login({ user: req.user, err: clean(req.query.err, 200), next: req.query.next, googleOn: !!cfg.google.clientId })));
app.get('/register', (req, res) => res.send(v.register({ user: req.user, role: req.query.role === 'client' ? 'client' : 'freelancer', googleOn: !!cfg.google.clientId })));

app.get('/dashboard', pageAuth, (req, res) => {
  const u = req.user;
  if (u.role === 'admin') return res.redirect('/admin');
  ensureProfile(u);
  const profile = db.prepare('SELECT * FROM profiles WHERE user_id=?').get(u.id);
  const myReqs = u.role === 'client' ? db.prepare('SELECT * FROM requirements WHERE client_id=? ORDER BY created_at DESC').all(u.id) : [];
  const unlocked = db.prepare(`SELECT c.*, t.name, t.email, t.phone, t.role, p.slug, p.headline, r.title AS req_title
    FROM contacts c JOIN users t ON t.id=c.to_user LEFT JOIN profiles p ON p.user_id=t.id LEFT JOIN requirements r ON r.id=c.requirement_id
    WHERE c.from_user=? ORDER BY c.created_at DESC`).all(u.id);
  const inbound = db.prepare(`SELECT c.*, f.name, f.email, f.phone, f.role, p.slug, p.headline, r.title AS req_title
    FROM contacts c JOIN users f ON f.id=c.from_user LEFT JOIN profiles p ON p.user_id=f.id LEFT JOIN requirements r ON r.id=c.requirement_id
    WHERE c.to_user=? ORDER BY c.created_at DESC`).all(u.id);
  res.send(v.dashboard({ user: u, profile, myReqs, unlocked, inbound }));
});

app.get('/admin', pageAuth, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).send(v.notFound({ user: req.user }));
  const s = {
    freelancers: db.prepare("SELECT COUNT(*) c FROM users WHERE role='freelancer'").get().c,
    clients: db.prepare("SELECT COUNT(*) c FROM users WHERE role='client'").get().c,
    premium: db.prepare('SELECT COUNT(*) c FROM users WHERE premium=1').get().c,
    open: db.prepare("SELECT COUNT(*) c FROM requirements WHERE status='open'").get().c,
    contacts: db.prepare('SELECT COUNT(*) c FROM contacts').get().c,
    revenue: db.prepare("SELECT COALESCE(SUM(amount),0) s FROM payments WHERE status='paid'").get().s
  };
  const users = db.prepare('SELECT id,name,email,role,premium,credits,created_at FROM users ORDER BY id DESC LIMIT 50').all();
  const pays = db.prepare(`SELECT p.*, u.email FROM payments p JOIN users u ON u.id=p.user_id WHERE p.status='paid' ORDER BY p.id DESC LIMIT 30`).all();
  res.send(v.admin({ user: req.user, s, users, pays }));
});

/* ---------- SEO files ---------- */
app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /admin\nDisallow: /api/\nDisallow: /auth/\n\nSitemap: ${cfg.baseUrl}/sitemap.xml\n`);
});

app.get('/sitemap.xml', (req, res) => {
  const urls = [
    ['/', 1.0, 'daily'], ['/freelancers', 0.9, 'daily'], ['/projects', 0.9, 'daily'], ['/pricing', 0.7, 'monthly'],
    ['/register', 0.6, 'monthly'], ['/login', 0.3, 'yearly']
  ].map(([p, pr, cf]) => ({ loc: cfg.baseUrl + p, pr, cf }));
  db.prepare(`SELECT p.slug, p.updated_at FROM profiles p JOIN users u ON u.id=p.user_id WHERE u.role='freelancer' AND p.headline!=''`).all()
    .forEach((r) => urls.push({ loc: `${cfg.baseUrl}/freelancers/${r.slug}`, pr: 0.7, cf: 'weekly', lm: r.updated_at }));
  db.prepare("SELECT id, created_at FROM requirements WHERE status='open'").all()
    .forEach((r) => urls.push({ loc: `${cfg.baseUrl}/projects/${r.id}`, pr: 0.7, cf: 'weekly', lm: r.created_at }));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `<url><loc>${u.loc}</loc>${u.lm ? `<lastmod>${u.lm.replace(' ', 'T')}Z</lastmod>` : ''}<changefreq>${u.cf}</changefreq><priority>${u.pr}</priority></url>`).join('\n') + '\n</urlset>';
  res.type('application/xml').send(xml);
});

app.get('/healthz', (req, res) => res.send('ok'));

app.use((req, res) => res.status(404).send(v.notFound({ user: req.user })));
app.use((err, req, res, next) => {
  console.error(err);
  if (req.path.startsWith('/api')) return res.status(500).json({ error: 'Something went wrong' });
  res.status(500).send('Something went wrong');
});

/* ---------- admin seed ---------- */
if (cfg.admin.email && cfg.admin.password && !passwordProblems(cfg.admin.password).length) {
  const e = cfg.admin.email.toLowerCase();
  const ex = db.prepare('SELECT * FROM users WHERE email=?').get(e);
  const hash = bcrypt.hashSync(cfg.admin.password, 12);
  if (!ex) db.prepare("INSERT INTO users (email,password_hash,name,role,premium) VALUES (?,?,?,'admin',1)").run(e, hash, 'Admin');
  else db.prepare("UPDATE users SET role='admin', password_hash=? WHERE id=?").run(hash, ex.id);
}

if (require.main === module) {
  app.listen(cfg.port, () => console.log(`GreenLance running on ${cfg.baseUrl} (port ${cfg.port})`));
}
module.exports = app;
