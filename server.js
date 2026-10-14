// Live News Feed - backend server
// 1. Every few minutes it downloads RSS feeds from news websites.
// 2. New stories are saved in the database (db.js).
// 3. Open browsers are told about new stories instantly via Server-Sent Events.

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const Parser = require('rss-parser');
const categories = require('./feeds');
const db = require('./db');

const PORT = Number(process.env.PORT) || 3000;
const REFRESH_MINUTES = Number(process.env.REFRESH_MINUTES) || 3;

const parser = new Parser({
  timeout: 15000,
  headers: { 'User-Agent': 'LiveNewsFeed/1.0 (+personal project)' },
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }]
    ]
  }
});

// ---------- helpers ----------

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };

function cleanText(text = '', max = 240) {
  let t = String(text)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m])
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, '') + '…';
  return t;
}

function isHttpUrl(u) {
  try { const p = new URL(u); return p.protocol === 'http:' || p.protocol === 'https:'; }
  catch { return false; }
}

function pickImage(item) {
  const candidates = [];
  if (item.enclosure && item.enclosure.url && (!item.enclosure.type || item.enclosure.type.startsWith('image'))) {
    candidates.push(item.enclosure.url);
  }
  for (const m of item.mediaContent || []) if (m && m.$ && m.$.url) candidates.push(m.$.url);
  for (const m of item.mediaThumbnail || []) if (m && m.$ && m.$.url) candidates.push(m.$.url);
  const html = item['content:encoded'] || item.content || '';
  const match = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  if (match) candidates.push(match[1]);
  return candidates.find(isHttpUrl) || null;
}

function toArticle(item, source) {
  const link = item.link || item.guid;
  if (!link || !isHttpUrl(link) || !item.title) return null;
  const published = Date.parse(item.isoDate || item.pubDate || '') || Date.now();
  return {
    id: crypto.createHash('sha1').update(link).digest('hex').slice(0, 16),
    title: cleanText(item.title, 200),
    summary: cleanText(item.contentSnippet || item.summary || item.content || '', 240),
    link,
    image: pickImage(item),
    source,
    publishedAt: Math.min(published, Date.now()),
    fetchedAt: Date.now()
  };
}

// ---------- fetching ----------

const feedStatus = {}; // url -> { source, ok, lastChecked, error, count }
let lastRefresh = null;
let refreshing = false;

async function fetchFeed(feed) {
  try {
    const result = await parser.parseURL(feed.url);
    feedStatus[feed.url] = { source: feed.source, ok: true, lastChecked: Date.now(), count: result.items.length };
    return result.items.map((it) => toArticle(it, feed.source)).filter(Boolean);
  } catch (err) {
    feedStatus[feed.url] = { source: feed.source, ok: false, lastChecked: Date.now(), error: err.message };
    console.warn(`[feed] ${feed.source} failed: ${err.message}`);
    return [];
  }
}

async function refresh() {
  if (refreshing) return { added: 0 };
  refreshing = true;
  const newIds = [];
  const newByCategory = {};
  try {
    for (const cat of categories) {
      const results = await Promise.all(cat.feeds.map(fetchFeed));
      for (const article of results.flat()) {
        const result = db.upsertArticle(article, cat.id);
        if (result === 'new') newIds.push(article.id);
        if (result) newByCategory[cat.id] = (newByCategory[cat.id] || 0) + 1;
      }
    }
    db.prune();
    db.save();
    lastRefresh = Date.now();
    console.log(`[refresh] ${new Date().toLocaleTimeString()} - ${newIds.length} new stories`);
    if (newIds.length) broadcast({ type: 'new', count: newIds.length, byCategory: newByCategory, at: lastRefresh });
    else broadcast({ type: 'heartbeat', at: lastRefresh });
  } finally {
    refreshing = false;
  }
  return { added: newIds.length };
}

// ---------- live updates (Server-Sent Events) ----------

const clients = new Set();

function broadcast(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) res.write(msg);
}

// ---------- web server ----------

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/categories', (req, res) => {
  res.json(categories.map(({ id, name }) => ({ id, name })));
});

app.get('/api/news', (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : 'top';
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const limit = Math.min(Number(req.query.limit) || 60, 200);
  res.json({ lastRefresh, articles: db.listArticles({ category, q, limit }) });
});

app.get('/api/bookmarks', (req, res) => {
  const ids = db.getBookmarks();
  const order = new Map(ids.map((id, i) => [id, i]));
  const articles = db.listArticles({ ids, limit: 500 }).sort((a, b) => order.get(a.id) - order.get(b.id));
  res.json({ ids, articles });
});

app.post('/api/bookmarks/:id', (req, res) => {
  if (!db.addBookmark(req.params.id)) return res.status(404).json({ error: 'Story not found' });
  res.json({ ok: true });
});

app.delete('/api/bookmarks/:id', (req, res) => {
  db.removeBookmark(req.params.id);
  res.json({ ok: true });
});

app.get('/api/status', (req, res) => {
  res.json({ lastRefresh, refreshMinutes: REFRESH_MINUTES, liveClients: clients.size, feeds: Object.values(feedStatus) });
});

app.post('/api/refresh', async (req, res) => {
  res.json(await refresh());
});

app.get('/api/stream', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: 'hello', at: lastRefresh })}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000); // keeps the connection open
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
});

function start() {
  db.load();
  const server = app.listen(PORT, () => {
    console.log(`\n  Live News Feed running at http://localhost:${PORT}\n  Fetching news every ${REFRESH_MINUTES} minutes...\n`);
  });
  refresh();
  setInterval(refresh, REFRESH_MINUTES * 60 * 1000);
  return server;
}

if (require.main === module) start();

module.exports = { app, start, refresh, toArticle, cleanText };
