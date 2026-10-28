const router = require('express').Router();
const pool = require('../db');
const Trie = require('../utils/trie');
const LRUCache = require('../utils/lru');
const { auth, adminOnly } = require('../middleware');

// Autocomplete index (rebuilt lazily after any book change)
let trie = null;
async function getTrie() {
  if (!trie) {
    trie = new Trie();
    const [rows] = await pool.query('SELECT title FROM books');
    rows.forEach((r) => trie.insert(r.title));
  }
  return trie;
}

// Recently viewed books per user (LRU, last 5)
const recent = new Map();
const recentFor = (uid) => {
  if (!recent.has(uid)) recent.set(uid, new LRUCache(5));
  return recent.get(uid);
};

// GET /api/books?q=&category=&available=1&page=1&limit=8
router.get('/', auth, async (req, res) => {
  const { q = '', category = '', available = '' } = req.query;
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 8, 1), 50);
  const where = [], params = [];
  if (q) { where.push('(title LIKE ? OR author LIKE ? OR isbn = ?)'); params.push(`%${q}%`, `%${q}%`, q); }
  if (category) { where.push('category = ?'); params.push(category); }
  if (available === '1') where.push('available_copies > 0');
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM books ${clause}`, params);
  const [books] = await pool.query(
    `SELECT * FROM books ${clause} ORDER BY title LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit]
  );
  res.json({ books, total, page, pages: Math.ceil(total / limit) });
});

router.get('/categories', auth, async (req, res) => {
  const [rows] = await pool.query('SELECT DISTINCT category FROM books ORDER BY category');
  res.json(rows.map((r) => r.category));
});

router.get('/suggest', auth, async (req, res) => {
  const t = await getTrie();
  res.json(t.suggest(String(req.query.prefix || '')));
});

router.get('/recent', auth, (req, res) => res.json(recentFor(req.user.id).values()));

router.get('/:id', auth, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM books WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Book not found.' });
  recentFor(req.user.id).put(rows[0].id, rows[0]);
  res.json(rows[0]);
});

function validate(b) {
  const copies = Number(b.total_copies);
  if (!b.title || !b.author || !b.isbn || !b.category) return 'Title, author, ISBN and category are required.';
  if (!Number.isInteger(copies) || copies < 1) return 'Copies must be a whole number of 1 or more.';
  return null;
}

router.post('/', auth, adminOnly, async (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });
  const { title, author, isbn, category, total_copies } = req.body;
  try {
    const [r] = await pool.query(
      'INSERT INTO books (title, author, isbn, category, total_copies, available_copies) VALUES (?,?,?,?,?,?)',
      [title.trim(), author.trim(), isbn.trim(), category.trim(), total_copies, total_copies]
    );
    trie = null;
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'A book with this ISBN already exists.' });
    res.status(500).json({ error: 'Could not add book.' });
  }
});

router.put('/:id', auth, adminOnly, async (req, res) => {
  const err = validate(req.body);
  if (err) return res.status(400).json({ error: err });
  const { title, author, isbn, category, total_copies } = req.body;
  const [rows] = await pool.query('SELECT * FROM books WHERE id = ?', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Book not found.' });
  const issued = rows[0].total_copies - rows[0].available_copies;
  if (total_copies < issued) return res.status(400).json({ error: `${issued} copies are currently issued. Total cannot be lower.` });
  await pool.query(
    'UPDATE books SET title=?, author=?, isbn=?, category=?, total_copies=?, available_copies=? WHERE id=?',
    [title, author, isbn, category, total_copies, total_copies - issued, req.params.id]
  );
  trie = null;
  res.json({ ok: true });
});

router.delete('/:id', auth, adminOnly, async (req, res) => {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM issues WHERE book_id = ?', [req.params.id]);
  if (n > 0) return res.status(400).json({ error: 'This book has issue history and cannot be deleted.' });
  await pool.query('DELETE FROM books WHERE id = ?', [req.params.id]);
  trie = null;
  res.json({ ok: true });
});

module.exports = router;
