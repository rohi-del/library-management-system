// Trie for fast prefix autocomplete (hand-written, no library).
class TrieNode {
  constructor() { this.children = new Map(); this.words = new Set(); }
}

class Trie {
  constructor() { this.root = new TrieNode(); }

  insert(word) {
    let node = this.root;
    for (const ch of word.toLowerCase()) {
      if (!node.children.has(ch)) node.children.set(ch, new TrieNode());
      node = node.children.get(ch);
      node.words.add(word);
    }
  }

  // Returns up to `limit` words that start with `prefix`.
  suggest(prefix, limit = 8) {
    let node = this.root;
    for (const ch of prefix.toLowerCase()) {
      node = node.children.get(ch);
      if (!node) return [];
    }
    return [...node.words].sort().slice(0, limit);
  }
}

module.exports = Trie;
