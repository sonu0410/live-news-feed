# Newsline Live — live news feed website

A full-stack news website that collects headlines from news websites every few
minutes and shows new stories in the browser instantly, without refreshing.

**Features**
- Live updates: a "↑ 3 new stories" button appears the moment new headlines arrive
- Categories: Top stories, India, World, Business, Technology, Sports
- Search across all headlines
- Save stories to read later (stored on the server, survive restarts)
- Light and dark mode, works on phones
- Sources: BBC News, The Hindu, Times of India (easy to change)

**Tech stack:** Node.js, Express, RSS parsing, Server-Sent Events, file-based JSON database, plain HTML/CSS/JavaScript.

---

## 1. Install once

1. Install **Node.js (LTS version)** from https://nodejs.org
   Check it worked: open a terminal and run `node -v` (should show v18 or higher).
2. Install **VS Code** from https://code.visualstudio.com

## 2. Run the project

1. Unzip `live-news-feed.zip` anywhere on your laptop.
2. Open VS Code → **File → Open Folder…** → choose the `live-news-feed` folder.
3. Open the terminal in VS Code: **Terminal → New Terminal**.
4. Install the packages (only the first time):
   ```
   npm install
   ```
5. Start the website:
   ```
   npm start
   ```
6. Open **http://localhost:3000** in your browser.

The first headlines appear within a few seconds. Leave the terminal running;
the server checks for new stories every 3 minutes.
To stop the server, click in the terminal and press **Ctrl + C**.

**While editing code**, use `npm run dev` instead of `npm start`:
the server restarts automatically every time you save a file.

## 3. Change settings

| What | Where |
|---|---|
| Add or change news sources | `feeds.js` (any site's RSS feed link works) |
| Colors and fonts | `public/style.css` (top of the file) |
| How often news is checked | Run `set REFRESH_MINUTES=5` (Windows) or `export REFRESH_MINUTES=5` (Mac/Linux) before `npm start` |
| Port | Same way with `PORT` |

## 4. Project structure

```
live-news-feed/
├── server.js        Backend: fetches feeds, API routes, live updates
├── feeds.js         List of news sources per category
├── db.js            Simple database (saves to data/db.json)
├── package.json     Project info and dependencies
└── public/          Frontend (what the browser loads)
    ├── index.html   Page structure
    ├── style.css    Design
    └── app.js       Loads news, search, save, live updates
```

## 5. How it works (useful for interviews)

1. **Collecting news:** `server.js` downloads each RSS feed in `feeds.js` using
   the `rss-parser` package, cleans the text, picks an image, and gives each
   story an ID made from its link, so the same story is never stored twice.
2. **Storing:** `db.js` keeps stories in memory and writes them to
   `data/db.json`. It's written to a temporary file first and then renamed, so
   the file is never left half-written. Old stories are trimmed automatically.
3. **API:** the browser talks to the backend through these routes:
   - `GET /api/categories` — list of categories
   - `GET /api/news?category=top&q=search` — stories, newest first
   - `GET/POST/DELETE /api/bookmarks/:id` — saved stories
   - `GET /api/status` — which feeds worked and when news was last checked
   - `POST /api/refresh` — check for news right now
4. **Live updates:** the page keeps one connection open to `/api/stream`
   (Server-Sent Events). When the server finds new stories it sends a short
   message, and the page shows the "new stories" button. If the connection
   drops, the browser reconnects automatically.
5. **Security:** all text from news sites is inserted into the page as plain
   text (never as HTML), and only `http`/`https` links are accepted, so a
   feed can't inject scripts into your site.

## 6. Ideas to extend it

- Swap `db.js` for **MongoDB** or **PostgreSQL**
- Add user accounts so each person has their own saved stories
- Add more languages (Tamil, Hindi feeds) and a language switcher
- Deploy it online for free on **Render** or **Railway**

## Troubleshooting

- **"npm is not recognized"** → Node.js isn't installed, or VS Code needs a restart after installing it.
- **Port already in use** → another program uses port 3000. Run with a different port, e.g. `set PORT=4000` then `npm start`.
- **A source shows no stories** → that site may have changed its RSS link. Look at the terminal for `[feed] ... failed` messages, find the new link, and update `feeds.js`.

Headlines and summaries belong to their publishers; each story links to the original article.
