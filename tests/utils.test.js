const test = require('node:test');
const assert = require('node:assert');
const Trie = require('../src/utils/trie');
const LRUCache = require('../src/utils/lru');
const { calcFine } = require('../src/utils/fine');

test('Trie suggests by prefix, case-insensitive', () => {
  const t = new Trie();
  ['Algorithms', 'Algorithm Design', 'Clean Code'].forEach((w) => t.insert(w));
  assert.deepStrictEqual(t.suggest('algo'), ['Algorithm Design', 'Algorithms']);
  assert.deepStrictEqual(t.suggest('zzz'), []);
});

test('LRU evicts the least recently used item', () => {
  const c = new LRUCache(2);
  c.put('a', 1); c.put('b', 2); c.get('a'); c.put('c', 3);
  assert.strictEqual(c.get('b'), undefined);
  assert.strictEqual(c.get('a'), 1);
});

test('Fine is 0 on time and 2 per late day', () => {
  assert.strictEqual(calcFine('2026-10-10', '2026-10-10'), 0);
  assert.strictEqual(calcFine('2026-10-10', '2026-10-08'), 0);
  assert.strictEqual(calcFine('2026-10-10', '2026-10-15'), 10);
});
