const router = require('express').Router();
const pool = require('../db');
const { auth, adminOnly } = require('../middleware');
const { calcFine, LOAN_DAYS, FINE_PER_DAY, MAX_ACTIVE_ISSUES } = require('../utils/fine');

// Issue a book. Transaction + row lock so two students can't take the last copy together.
router.post('/', auth, async (req, res) => {
  const bookId = Number(req.body.book_id);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [books] = await conn.query('SELECT * FROM books WHERE id = ? FOR UPDATE', [bookId]);
    if (!books[0]) { await conn.rollback(); return res.status(404).json({ error: 'Book not found.' }); }
    if (books[0].available_copies < 1) { await conn.rollback(); return res.status(409).json({ error: 'No copies available right now.' }); }

    const [active] = await conn.query('SELECT book_id FROM issues WHERE user_id = ? AND returned_at IS NULL', [req.user.id]);
    if (active.length >= MAX_ACTIVE_ISSUES) { await conn.rollback(); return res.status(400).json({ error: `You can hold at most ${MAX_ACTIVE_ISSUES} books at a time.` }); }
    if (active.some((a) => a.book_id === bookId)) { await conn.rollback(); return res.status(400).json({ error: 'You already have this book.' }); }

    await conn.query('INSERT INTO issues (user_id, book_id, due_date) VALUES (?,?, DATE_ADD(CURDATE(), INTERVAL ? DAY))', [req.user.id, bookId, LOAN_DAYS]);
    await conn.query('UPDATE books SET available_copies = available_copies - 1 WHERE id = ?', [bookId]);
    await conn.commit();
    res.status(201).json({ ok: true, message: `Issued. Return within ${LOAN_DAYS} days.` });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: 'Could not issue the book.' });
  } finally {
    conn.release();
  }
});

// Return a book and calculate the fine
router.post('/:id/return', auth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM issues WHERE id = ? FOR UPDATE', [req.params.id]);
    const issue = rows[0];
    if (!issue) { await conn.rollback(); return res.status(404).json({ error: 'Issue record not found.' }); }
    if (issue.user_id !== req.user.id && req.user.role !== 'admin') { await conn.rollback(); return res.status(403).json({ error: 'This is not your issue.' }); }
    if (issue.returned_at) { await conn.rollback(); return res.status(400).json({ error: 'Already returned.' }); }

    const fine = calcFine(issue.due_date, new Date());
    await conn.query('UPDATE issues SET returned_at = NOW(), fine = ? WHERE id = ?', [fine, issue.id]);
    await conn.query('UPDATE books SET available_copies = available_copies + 1 WHERE id = ?', [issue.book_id]);
    await conn.commit();
    res.json({ ok: true, fine });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: 'Could not return the book.' });
  } finally {
    conn.release();
  }
});

// My issues (current first, then history)
router.get('/mine', auth, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT i.id, b.title, b.author, i.issued_at, i.due_date, i.returned_at, i.fine,
            (i.returned_at IS NULL AND i.due_date < CURDATE()) AS overdue
     FROM issues i JOIN books b ON b.id = i.book_id
     WHERE i.user_id = ? ORDER BY i.returned_at IS NOT NULL, i.due_date`, [req.user.id]);
  res.json(rows);
});

// Admin: overdue report with running fine
router.get('/overdue', auth, adminOnly, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT i.id, u.name AS student, u.email, b.title, i.due_date,
            DATEDIFF(CURDATE(), i.due_date) AS days_late
     FROM issues i JOIN users u ON u.id = i.user_id JOIN books b ON b.id = i.book_id
     WHERE i.returned_at IS NULL AND i.due_date < CURDATE()
     ORDER BY days_late DESC`);
  res.json(rows.map((r) => ({ ...r, fine_so_far: r.days_late * FINE_PER_DAY })));
});

// Admin: stats using aggregates and GROUP BY
router.get('/stats', auth, adminOnly, async (req, res) => {
  const [[totals]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM books) AS titles,
            (SELECT COALESCE(SUM(total_copies),0) FROM books) AS copies,
            (SELECT COUNT(*) FROM issues WHERE returned_at IS NULL) AS active_issues,
            (SELECT COALESCE(SUM(fine),0) FROM issues) AS fines_collected`);
  const [byCategory] = await pool.query(
    `SELECT b.category, COUNT(i.id) AS issues FROM books b
     LEFT JOIN issues i ON i.book_id = b.id GROUP BY b.category ORDER BY issues DESC`);
  const [topBooks] = await pool.query(
    `SELECT b.title, COUNT(*) AS times_issued FROM issues i JOIN books b ON b.id = i.book_id
     GROUP BY b.id, b.title ORDER BY times_issued DESC LIMIT 5`);
  res.json({ totals, byCategory, topBooks });
});

module.exports = router;
