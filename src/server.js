require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/books', require('./routes/books'));
app.use('/api/issues', require('./routes/issues'));

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Something went wrong.' }); });

const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => console.log(`Library running on http://localhost:${PORT}`));
module.exports = app;
