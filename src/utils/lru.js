// LRU cache using a Map (Map keeps insertion order, so the first key is the oldest).
class LRUCache {
  constructor(capacity = 5) { this.capacity = capacity; this.map = new Map(); }

  get(key) {
    if (!this.map.has(key)) return undefined;
    const val = this.map.get(key);
    this.map.delete(key);
    this.map.set(key, val); // mark as most recently used
    return val;
  }

  put(key, val) {
    if (this.map.has(key)) this.map.delete(key);
    else if (this.map.size >= this.capacity) this.map.delete(this.map.keys().next().value);
    this.map.set(key, val);
  }

  // Most recent first
  values() { return [...this.map.values()].reverse(); }
}

module.exports = LRUCache;
