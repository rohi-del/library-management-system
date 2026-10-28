const router = require('express').Router();
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { sign } = require('../middleware');

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6)
    return res.status(400).json({ error: 'Name, email and a password of 6+ characters are required.' });
  try {
    const hash = await bcrypt.hash(password, 10);
    const [r] = await pool.query(
      "INSERT INTO users (name, email, password_hash, role) VALUES (?,?,?,'student')",
      [name.trim(), email.trim().toLowerCase(), hash]
    );
    const user = { id: r.insertId, name: name.trim(), role: 'student' };
    res.status(201).json({ token: sign(user), user });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This email is already registered.' });
    res.status(500).json({ error: 'Could not register.' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [String(email || '').toLowerCase()]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password || '', u.password_hash)))
    return res.status(401).json({ error: 'Wrong email or password.' });
  const user = { id: u.id, name: u.name, role: u.role };
  res.json({ token: sign(user), user });
});

module.exports = router;
