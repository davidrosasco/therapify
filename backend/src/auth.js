const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db, ensureDefaultDataForUser } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function authMiddleware(req, res, next) {
  const token = req.cookies && req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = { id: data.userId, email: data.email };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

function getUserByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

async function register(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res
      .status(400)
      .json({ error: 'Email y contraseña son obligatorios' });
  }

  const existing = getUserByEmail(email);
  if (existing) {
    return res.status(400).json({ error: 'El usuario ya existe' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const result = db
    .prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)')
    .run(email, passwordHash);

  ensureDefaultDataForUser(result.lastInsertRowid);

  const token = createToken({ userId: result.lastInsertRowid, email });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.json({ id: result.lastInsertRowid, email });
}

async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res
      .status(400)
      .json({ error: 'Email y contraseña son obligatorios' });
  }

  const user = getUserByEmail(email);
  if (!user) {
    return res.status(400).json({ error: 'Credenciales inválidas' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(400).json({ error: 'Credenciales inválidas' });
  }

  const token = createToken({ userId: user.id, email: user.email });
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return res.json({ id: user.id, email: user.email });
}

function me(req, res) {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  return res.json({ id: req.user.id, email: req.user.email });
}

function logout(req, res) {
  res.clearCookie('token');
  return res.json({ success: true });
}

function requestPasswordReset(req, res) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email es obligatorio' });
  }
  const user = getUserByEmail(email);
  if (!user) {
    return res.json({ success: true });
  }
  const token = require('crypto').randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  db.prepare(
    `INSERT INTO password_resets (user_id, token, expires_at)
     VALUES (?, ?, ?)`
  ).run(user.id, token, expiresAt);

  return res.json({
    success: true,
    resetToken: token,
    message:
      'Token de reseteo generado. En un entorno real se enviaría por email.',
  });
}

async function resetPassword(req, res) {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res
      .status(400)
      .json({ error: 'Token y nueva contraseña son obligatorios' });
  }

  const record = db
    .prepare(
      `SELECT * FROM password_resets
       WHERE token = ? AND used = 0 AND expires_at > CURRENT_TIMESTAMP`
    )
    .get(token);

  if (!record) {
    return res.status(400).json({ error: 'Token inválido o expirado' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(
    passwordHash,
    record.user_id
  );

  db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(
    record.id
  );

  return res.json({ success: true });
}

module.exports = {
  authMiddleware,
  register,
  login,
  me,
  logout,
  requestPasswordReset,
  resetPassword,
};

