const bcrypt = require('bcryptjs');
const pool = require('./db');

const books = [
  ['Clean Code', 'Robert C. Martin', '9780132350884', 'Programming', 3],
  ['The Pragmatic Programmer', 'Andrew Hunt', '9780135957059', 'Programming', 2],
  ['Introduction to Algorithms', 'Thomas H. Cormen', '9780262046305', 'Algorithms', 2],
  ['Algorithms', 'Robert Sedgewick', '9780321573513', 'Algorithms', 2],
  ['Database System Concepts', 'Abraham Silberschatz', '9780078022159', 'Databases', 2],
  ['Learning SQL', 'Alan Beaulieu', '9781492057611', 'Databases', 3],
  ['Operating System Concepts', 'Abraham Silberschatz', '9781119800361', 'Systems', 2],
  ['Computer Networking: A Top-Down Approach', 'James Kurose', '9780136681557', 'Systems', 1],
  ['Eloquent JavaScript', 'Marijn Haverbeke', '9781593279509', 'Web', 3],
  ["You Don't Know JS Yet", 'Kyle Simpson', '9781091210099', 'Web', 2],
];

(async () => {
  const hash = (p) => bcrypt.hashSync(p, 10);
  await pool.query(
    `INSERT IGNORE INTO users (name, email, password_hash, role) VALUES
     ('Admin', 'admin@library.com', ?, 'admin'),
     ('Demo Student', 'student@library.com', ?, 'student')`,
    [hash('admin123'), hash('student123')]
  );
  for (const [t, a, i, c, n] of books) {
    await pool.query(
      'INSERT IGNORE INTO books (title, author, isbn, category, total_copies, available_copies) VALUES (?,?,?,?,?,?)',
      [t, a, i, c, n, n]
    );
  }
  console.log('Seeded. Admin: admin@library.com / admin123 | Student: student@library.com / student123');
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
