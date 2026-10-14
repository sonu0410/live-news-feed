// A tiny file-based database.
// Articles and bookmarks are kept in memory and saved to data/db.json,
// so your saved stories survive a server restart.
// (To upgrade later, this is the one file you would swap for MongoDB or PostgreSQL.)

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const MAX_ARTICLES = 1500;

let data = { articles: {}, bookmarks: [] };

function load() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      data.articles = parsed.articles || {};
      data.bookmarks = parsed.bookmarks || [];
    }
  } catch (err) {
    console.error('Could not read database file, starting fresh:', err.message);
  }
}

let saveTimer = null;
function save() {
  // Group many quick changes into one write.
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = DB_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, DB_FILE); // write-then-rename so the file is never half written
    } catch (err) {
      console.error('Could not save database:', err.message);
    }
  }, 300);
}

function prune() {
  const all = Object.values(data.articles);
  if (all.length <= MAX_ARTICLES) return;
  const keep = new Set(data.bookmarks);
  all
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(MAX_ARTICLES)
    .forEach((a) => { if (!keep.has(a.id)) delete data.articles[a.id]; });
}

// Returns 'new' for a never-seen story, 'added' when a known story appears
// in another category for the first time, or null when nothing changed.
function upsertArticle(article, categoryId) {
  const existing = data.articles[article.id];
  if (existing) {
    if (existing.categories.includes(categoryId)) return null;
    existing.categories.push(categoryId);
    return 'added';
  }
  data.articles[article.id] = { ...article, categories: [categoryId] };
  return 'new';
}

function listArticles({ category, q, limit = 60, ids } = {}) {
  let list = Object.values(data.articles);
  if (ids) {
    const set = new Set(ids);
    list = list.filter((a) => set.has(a.id));
  }
  if (category) list = list.filter((a) => a.categories.includes(category));
  if (q) {
    const needle = q.toLowerCase();
    list = list.filter((a) =>
      a.title.toLowerCase().includes(needle) ||
      a.summary.toLowerCase().includes(needle) ||
      a.source.toLowerCase().includes(needle));
  }
  list.sort((a, b) => b.publishedAt - a.publishedAt);
  if (ids) return list.slice(0, limit);
  return mixSources(list).slice(0, limit);
}

// Some sites publish far more often than others, so a plain "newest first"
// list can end up showing only one source. This takes stories from each
// source in turn (newest first within each source), so every source gets space.
function mixSources(sortedList) {
  const bySource = new Map();
  for (const a of sortedList) {
    if (!bySource.has(a.source)) bySource.set(a.source, []);
    bySource.get(a.source).push(a);
  }
  const queues = [...bySource.values()]; // ordered by each source's newest story
  const mixed = [];
  while (queues.some((q) => q.length)) {
    for (const q of queues) if (q.length) mixed.push(q.shift());
  }
  return mixed;
}

function getBookmarks() { return [...data.bookmarks]; }
function addBookmark(id) {
  if (!data.articles[id]) return false;
  if (!data.bookmarks.includes(id)) data.bookmarks.unshift(id);
  save();
  return true;
}
function removeBookmark(id) {
  data.bookmarks = data.bookmarks.filter((b) => b !== id);
  save();
}

module.exports = { load, save, prune, upsertArticle, listArticles, getBookmarks, addBookmark, removeBookmark };