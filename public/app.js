// Newsline Live - browser code
// Loads stories from our own backend (/api/...) and listens on /api/stream
// so new headlines appear without refreshing the page.

const state = {
  category: 'top',
  query: '',
  categories: [],
  articles: [],
  bookmarks: new Set(),
  lastRefresh: null,
  pending: {} // category -> number of new stories not shown yet
};

const $ = (id) => document.getElementById(id);
const feedEl = $('feed');

// ---------- small helpers ----------

function el(tag, attrs = {}, ...children) {
  // Builds elements safely: all text goes in as text, never as HTML.
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c);
  return node;
}

function timeAgo(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24); return `${d} day${d > 1 ? 's' : ''} ago`;
}

async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

// ---------- rendering ----------

function thumb(a, cls) {
  if (!a.image) return el('div', { class: `thumb empty ${cls || ''}`, 'aria-hidden': 'true' }, a.source);
  const img = el('img', { class: `thumb ${cls || ''}`, src: a.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => img.replaceWith(el('div', { class: 'thumb empty', 'aria-hidden': 'true' }, a.source)));
  return img;
}

function meta(a) {
  const saved = state.bookmarks.has(a.id);
  const isFresh = Date.now() - a.publishedAt < 30 * 60 * 1000;
  return el('div', { class: 'meta' },
    el('span', { class: 'src' }, a.source),
    el('time', { class: 'time', datetime: new Date(a.publishedAt).toISOString(), title: new Date(a.publishedAt).toLocaleString() }, timeAgo(a.publishedAt)),
    isFresh ? el('span', { class: 'fresh' }, 'NEW') : null,
    el('button', {
      class: 'save', type: 'button', 'aria-pressed': String(saved),
      'aria-label': saved ? `Remove "${a.title}" from saved` : `Save "${a.title}"`,
      onclick: () => toggleBookmark(a.id)
    }, saved ? 'Saved' : 'Save')
  );
}

function storyLink(a, heading) {
  return el('a', { class: 'story-link', href: a.link, target: '_blank', rel: 'noopener noreferrer' }, heading);
}

function renderArticles(list) {
  feedEl.replaceChildren();
  if (!list.length) return renderEmpty();

  const [lead, ...rest] = list;
  const rail = rest.slice(0, 4);
  const grid = rest.slice(4);

  feedEl.append(
    el('section', { class: 'lead-wrap', 'aria-label': 'Top story' },
      el('article', { class: 'lead' },
        storyLink(lead, [thumb(lead), el('h2', {}, lead.title)]),
        lead.summary ? el('p', { class: 'sum' }, lead.summary) : null,
        meta(lead)
      ),
      el('div', { class: 'rail' },
        rail.map((a) => el('article', { class: 'story' }, meta(a), storyLink(a, el('h3', {}, a.title))))
      )
    ),
    el('section', { class: 'grid', 'aria-label': 'More stories' },
      grid.map((a) => el('article', { class: 'card' },
        storyLink(a, [thumb(a), el('h3', { style: 'margin-top:12px' }, a.title)]),
        a.summary ? el('p', { class: 'sum' }, a.summary) : null,
        meta(a)
      ))
    )
  );
}

function renderEmpty() {
  let title = 'No stories yet';
  let text = 'The server is collecting headlines. This usually takes a few seconds after starting.';
  if (state.category === 'saved') { title = 'Nothing saved yet'; text = 'Tap "Save" on any story to keep it here.'; }
  else if (state.query) { title = 'No matches'; text = `No headlines match "${state.query}".`; }
  feedEl.replaceChildren(el('div', { class: 'state' },
    el('h2', {}, title), el('p', {}, text),
    state.query ? el('button', { type: 'button', onclick: clearSearch }, 'Clear search')
      : el('button', { type: 'button', onclick: forceRefresh }, 'Check for news now')
  ));
}

function renderLoading() {
  feedEl.replaceChildren(el('div', { class: 'lead-wrap' },
    el('div', {}, el('div', { class: 'skel', style: 'aspect-ratio:16/9' }), el('div', { class: 'skel', style: 'height:34px;margin-top:16px;width:80%' })),
    el('div', {}, [1, 2, 3, 4].map(() => el('div', { class: 'skel', style: 'height:56px;margin-bottom:16px' })))
  ));
}

function renderError(message) {
  feedEl.replaceChildren(el('div', { class: 'state' },
    el('h2', {}, 'Could not load news'),
    el('p', {}, `${message}. Make sure the server is running (npm start), then try again.`),
    el('button', { type: 'button', onclick: load }, 'Try again')
  ));
}

function renderTabs() {
  const tabs = [...state.categories, { id: 'saved', name: 'Saved' }];
  $('tabs').replaceChildren(...tabs.map((c) => el('button', {
    class: 'tab', type: 'button', 'aria-current': String(c.id === state.category),
    onclick: () => { state.category = c.id; state.pending[c.id] = 0; renderTabs(); load(); }
  }, c.name, state.pending[c.id] && c.id !== state.category ? el('span', { class: 'count' }, String(state.pending[c.id])) : null)));
}

function renderUpdated() {
  $('updated').textContent = state.lastRefresh ? `Updated ${timeAgo(state.lastRefresh)}` : 'Waiting for first update…';
}

function renderPill() {
  const pill = $('new-pill');
  const n = state.pending[state.category] || 0;
  if (n > 0 && state.category !== 'saved') {
    pill.textContent = `↑ ${n} new ${n === 1 ? 'story' : 'stories'}, tap to show`;
    pill.hidden = false;
  } else pill.hidden = true;
}

// ---------- data ----------

async function load() {
  renderLoading();
  try {
    if (state.category === 'saved') {
      const data = await api('/api/bookmarks');
      state.bookmarks = new Set(data.ids);
      state.articles = state.query
        ? data.articles.filter((a) => a.title.toLowerCase().includes(state.query.toLowerCase()))
        : data.articles;
    } else {
      const params = new URLSearchParams({ category: state.category, q: state.query, limit: 60 });
      const data = await api(`/api/news?${params}`);
      state.articles = data.articles;
      state.lastRefresh = data.lastRefresh;
    }
    state.pending[state.category] = 0;
    renderArticles(state.articles);
    renderUpdated();
    renderPill();
    renderTabs();
  } catch (err) {
    renderError(err.message);
  }
}

async function loadBookmarks() {
  try { const data = await api('/api/bookmarks'); state.bookmarks = new Set(data.ids); } catch { /* not critical */ }
}

async function toggleBookmark(id) {
  const saved = state.bookmarks.has(id);
  try {
    await api(`/api/bookmarks/${id}`, { method: saved ? 'DELETE' : 'POST' });
    saved ? state.bookmarks.delete(id) : state.bookmarks.add(id);
    if (state.category === 'saved') load(); else renderArticles(state.articles);
  } catch (err) {
    alert('Could not update saved stories: ' + err.message);
  }
}

async function forceRefresh() {
  renderLoading();
  try { await api('/api/refresh', { method: 'POST' }); } catch { /* shown by load */ }
  load();
}

function clearSearch() { $('search').value = ''; state.query = ''; load(); }

// ---------- live connection ----------

function connectLive() {
  const live = $('live');
  const source = new EventSource('/api/stream');
  source.onopen = () => live.classList.add('on');
  source.onerror = () => live.classList.remove('on'); // the browser reconnects automatically
  source.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.at) state.lastRefresh = msg.at;
    if (msg.type === 'new') {
      for (const [cat, n] of Object.entries(msg.byCategory || {})) state.pending[cat] = (state.pending[cat] || 0) + n;
      // First load with an empty page: just show the stories straight away.
      if (!state.articles.length && state.category !== 'saved') return load();
      renderTabs();
      renderPill();
    }
    renderUpdated();
  };
}

// ---------- start ----------

async function init() {
  $('date-line').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  $('new-pill').addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); load(); });

  let t;
  $('search').addEventListener('input', (e) => {
    clearTimeout(t);
    t = setTimeout(() => { state.query = e.target.value.trim(); load(); }, 350);
  });
  $('search-form').addEventListener('submit', (e) => e.preventDefault());

  $('theme-btn').addEventListener('click', () => {
    const root = document.documentElement;
    const isDark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = isDark ? 'light' : 'dark';
    try { localStorage.setItem('theme', root.dataset.theme); } catch { /* ignore */ }
  });

  try {
    state.categories = await api('/api/categories');
    const status = await api('/api/status');
    const names = [...new Set(status.feeds.map((f) => f.source))];
    if (names.length) $('sources').textContent = `Sources: ${names.join(', ')}`;
  } catch { /* handled by load */ }

  renderTabs();
  await loadBookmarks();
  await load();
  connectLive();
  setInterval(renderUpdated, 30000);
}

init();
