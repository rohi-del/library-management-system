const $ = (id) => document.getElementById(id);
let token = localStorage.getItem('token');
let user = JSON.parse(localStorage.getItem('user') || 'null');
let page = 1, isRegister = false, editBook = null;

// Escape text before putting it in HTML (prevents XSS)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function toast(msg, isErr) {
  const t = $('toast');
  t.textContent = msg; t.className = 'show' + (isErr ? ' err' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ''), 2800);
}

async function api(path, method = 'GET', body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) { logout(); }
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ---------- auth ----------
function setMode(reg) {
  isRegister = reg;
  $('tabLogin').classList.toggle('on', !reg); $('tabReg').classList.toggle('on', reg);
  $('nameRow').hidden = !reg; $('name').required = reg;
  $('authBtn').textContent = reg ? 'Create account' : 'Log in';
}
$('tabLogin').onclick = () => setMode(false);
$('tabReg').onclick = () => setMode(true);

$('authForm').onsubmit = async (e) => {
  e.preventDefault();
  try {
    const body = { email: $('email').value, password: $('password').value };
    if (isRegister) body.name = $('name').value;
    const data = await api(isRegister ? '/auth/register' : '/auth/login', 'POST', body);
    token = data.token; user = data.user;
    localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(user));
    $('authForm').reset(); start();
  } catch (err) { toast(err.message, true); }
};

function logout() {
  token = null; user = null; localStorage.clear();
  $('authView').hidden = false; $('appView').hidden = true; $('who').hidden = true;
}
$('logout').onclick = logout;

// ---------- navigation ----------
document.querySelectorAll('.tab[data-view]').forEach((b) => (b.onclick = () => showView(b.dataset.view)));
function showView(v) {
  document.querySelectorAll('.tab[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
  document.querySelectorAll('.view').forEach((s) => (s.hidden = s.id !== v));
  if (v === 'catalog') { loadBooks(); loadRecent(); }
  if (v === 'mine') loadMine();
  if (v === 'admin') loadAdmin();
}

function start() {
  $('authView').hidden = true; $('appView').hidden = false; $('who').hidden = false;
  $('whoName').textContent = `${user.name} (${user.role})`;
  document.querySelector('.tab.admin').hidden = user.role !== 'admin';
  api('/books/categories').then((cats) => {
    $('category').innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');
  });
  showView('catalog');
}

// ---------- catalog ----------
async function loadBooks() {
  const p = new URLSearchParams({ q: $('q').value, category: $('category').value, available: $('avail').checked ? 1 : '', page });
  try {
    const d = await api('/books?' + p);
    $('books').innerHTML = d.books.length ? d.books.map((b) => `
      <article class="book">
        <h3>${esc(b.title)}</h3>
        <div class="meta">${esc(b.author)}</div>
        <div class="meta">${esc(b.category)} | ISBN ${esc(b.isbn)}</div>
        <div class="foot">
          <span class="avail ${b.available_copies ? '' : 'none'}">${b.available_copies} of ${b.total_copies} available</span>
          <button data-issue="${b.id}" ${b.available_copies ? '' : 'disabled'}>Borrow</button>
        </div>
        ${user.role === 'admin' ? `<div class="row"><button data-edit="${b.id}" class="ghost">Edit</button><button data-del="${b.id}" class="ghost danger">Delete</button></div>` : ''}
      </article>`).join('') : '<p class="empty">No books match. Try a different search or clear the filters.</p>';
    $('pageInfo').textContent = `Page ${d.pages ? d.page : 0} of ${d.pages}`;
    $('prev').disabled = d.page <= 1; $('next').disabled = d.page >= d.pages;
    window.__books = Object.fromEntries(d.books.map((b) => [b.id, b]));
  } catch (e) { toast(e.message, true); }
}

$('books').onclick = async (e) => {
  const t = e.target;
  try {
    if (t.dataset.issue) {
      await api(`/books/${t.dataset.issue}`); // records "recently viewed" via LRU
      const r = await api('/issues', 'POST', { book_id: Number(t.dataset.issue) });
      toast(r.message); loadBooks(); loadRecent();
    } else if (t.dataset.edit) {
      editBook = window.__books[t.dataset.edit];
      showView('admin'); fillForm(editBook);
    } else if (t.dataset.del) {
      if (!confirm('Delete this book?')) return;
      await api('/books/' + t.dataset.del, 'DELETE'); toast('Book deleted.'); loadBooks();
    }
  } catch (err) { toast(err.message, true); }
};

let timer;
$('q').oninput = () => {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    page = 1; loadBooks();
    const q = $('q').value.trim();
    if (q.length < 2) return ($('suggestions').innerHTML = '');
    const s = await api('/books/suggest?prefix=' + encodeURIComponent(q)).catch(() => []);
    $('suggestions').innerHTML = s.map((x) => `<option value="${esc(x)}">`).join('');
  }, 250);
};
$('category').onchange = $('avail').onchange = () => { page = 1; loadBooks(); };
$('prev').onclick = () => { page--; loadBooks(); };
$('next').onclick = () => { page++; loadBooks(); };

async function loadRecent() {
  const r = await api('/books/recent').catch(() => []);
  $('recent').innerHTML = r.length ? r.map((b) => `<span class="chip">${esc(b.title)}</span>`).join('') : '<span class="empty">Books you open will show up here.</span>';
}

// ---------- my books ----------
async function loadMine() {
  const rows = await api('/issues/mine').catch(() => []);
  $('myIssues').innerHTML = rows.length ? `<table><tr><th>Book</th><th>Due</th><th>Status</th><th></th></tr>${rows.map((r) => `
    <tr><td>${esc(r.title)}<br><small class="done">${esc(r.author)}</small></td>
    <td>${esc(r.due_date)}</td>
    <td class="${r.returned_at ? 'done' : Number(r.overdue) ? 'late' : ''}">${r.returned_at ? `Returned${Number(r.fine) ? ', fine ₹' + r.fine : ''}` : Number(r.overdue) ? 'Overdue' : 'Borrowed'}</td>
    <td>${r.returned_at ? '' : `<button data-return="${r.id}">Return</button>`}</td></tr>`).join('')}</table>` : '<p class="empty">You have not borrowed anything yet. Pick a book from the catalog.</p>';
}
$('myIssues').onclick = async (e) => {
  if (!e.target.dataset.return) return;
  try {
    const r = await api(`/issues/${e.target.dataset.return}/return`, 'POST');
    toast(r.fine ? `Returned. Late fine: ₹${r.fine}` : 'Returned. No fine.'); loadMine();
  } catch (err) { toast(err.message, true); }
};

// ---------- admin ----------
async function loadAdmin() {
  try {
    const [s, o] = await Promise.all([api('/issues/stats'), api('/issues/overdue')]);
    const t = s.totals;
    $('stats').innerHTML = [['Titles', t.titles], ['Copies', t.copies], ['Currently issued', t.active_issues], ['Fines collected', '₹' + t.fines_collected]]
      .map(([l, v]) => `<div class="stat"><b>${esc(v)}</b><span>${l}</span></div>`).join('');
    $('overdue').innerHTML = o.length ? `<table><tr><th>Student</th><th>Book</th><th>Days late</th><th>Fine</th></tr>${o.map((r) => `
      <tr><td>${esc(r.student)}<br><small class="done">${esc(r.email)}</small></td><td>${esc(r.title)}</td><td class="late">${r.days_late}</td><td>₹${r.fine_so_far}</td></tr>`).join('')}</table>` : '<p class="empty">Nothing is overdue.</p>';
    $('topBooks').innerHTML = s.topBooks.length ? `<table><tr><th>Book</th><th>Times issued</th></tr>${s.topBooks.map((b) => `<tr><td>${esc(b.title)}</td><td>${b.times_issued}</td></tr>`).join('')}</table>` : '<p class="empty">No issues yet.</p>';
  } catch (e) { toast(e.message, true); }
}

function fillForm(b) {
  $('formTitle').textContent = b ? 'Edit book' : 'Add a book';
  $('bookSave').textContent = b ? 'Save changes' : 'Add book';
  $('bookCancel').hidden = !b;
  $('bTitle').value = b?.title || ''; $('bAuthor').value = b?.author || ''; $('bIsbn').value = b?.isbn || '';
  $('bCategory').value = b?.category || ''; $('bCopies').value = b?.total_copies || 1;
}
$('bookCancel').onclick = () => { editBook = null; fillForm(null); };
$('bookForm').onsubmit = async (e) => {
  e.preventDefault();
  const body = { title: $('bTitle').value, author: $('bAuthor').value, isbn: $('bIsbn').value, category: $('bCategory').value, total_copies: Number($('bCopies').value) };
  try {
    if (editBook) await api('/books/' + editBook.id, 'PUT', body); else await api('/books', 'POST', body);
    toast(editBook ? 'Book updated.' : 'Book added.'); editBook = null; fillForm(null); loadAdmin();
    api('/books/categories').then((cats) => { $('category').innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join(''); });
  } catch (err) { toast(err.message, true); }
};

if (token && user) start();
