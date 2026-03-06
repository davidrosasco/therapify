require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');

const {
  register,
  login,
  me,
  logout,
  requestPasswordReset,
  resetPassword,
  authMiddleware,
} = require('./auth');
const apiRouter = require('./routes');

const app = express();

app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET || 'dev-cookie-secret'));

const frontendOrigin =
  process.env.FRONTEND_ORIGIN ||
  (process.env.NODE_ENV === 'production' ? true : 'http://localhost:4000');

app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
  })
);

app.post('/api/auth/register', register);
app.post('/api/auth/login', login);
app.get('/api/auth/me', authMiddleware, me);
app.post('/api/auth/logout', logout);
app.post('/api/auth/forgot-password', requestPasswordReset);
app.post('/api/auth/reset-password', resetPassword);

app.use('/api', apiRouter);

const publicDir = path.join(__dirname, '..', '..', 'frontend');
app.use(express.static(publicDir));

app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Therapify backend escuchando en http://localhost:${PORT}`);
});

