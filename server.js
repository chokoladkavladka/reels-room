const express = require('express');
const path = require('path');
const cookieSession = require('cookie-session');
const db = require('./db');
const { fetchReelData } = require('./instagram');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(
  cookieSession({
    name: 'session',
    keys: [process.env.SESSION_SECRET || 'reels-dashboard-dev-secret'],
    maxAge: 30 * 24 * 60 * 60 * 1000,
  })
);
app.use(express.static(path.join(__dirname, 'public')));

const AVATAR_SEEDS = ['Aneka', 'Milo', 'Kiki', 'Nova', 'Pepper', 'Sunny', 'Bramble', 'Willow'];

// ---------- Auth (упрощённый — для внутреннего инструмента) ----------

app.post('/api/login', (req, res) => {
  const { username, pin, display_name } = req.body || {};
  if (!username || !pin) return res.status(400).json({ error: 'Укажите логин и PIN' });
  const clean = String(username).trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
  if (!clean) return res.status(400).json({ error: 'Некорректный логин' });

  let user = db.prepare('SELECT * FROM users WHERE username = ?').get(clean);

  if (!user) {
    const seed = AVATAR_SEEDS[Math.floor(Math.random() * AVATAR_SEEDS.length)];
    const info = db
      .prepare('INSERT INTO users (username, display_name, pin, avatar_seed) VALUES (?, ?, ?, ?)')
      .run(clean, display_name || username, String(pin), seed);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  } else if (user.pin !== String(pin)) {
    return res.status(401).json({ error: 'Неверный PIN для этого аккаунта' });
  }

  req.session.userId = user.id;
  res.json({ id: user.id, username: user.username, display_name: user.display_name, avatar_seed: user.avatar_seed });
});

app.post('/api/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Не авторизован' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Не авторизован' });
  req.user = user;
  next();
}

app.get('/api/me', requireAuth, (req, res) => {
  const { id, username, display_name, avatar_seed } = req.user;
  res.json({ id, username, display_name, avatar_seed });
});

// ---------- Reels ----------

app.post('/api/reels', requireAuth, async (req, res) => {
  const { url } = req.body || {};
  if (!url || !/instagram\.com/.test(url)) {
    return res.status(400).json({ error: 'Вставьте корректную ссылку на Instagram Reels' });
  }
  try {
    const data = await fetchReelData(url);
    const info = db
      .prepare(
        `INSERT INTO reels (user_id, source_url, shortcode, cover_url, caption, views, likes, comments, posted_at, status, source)
         VALUES (@user_id, @source_url, @shortcode, @cover_url, @caption, @views, @likes, @comments, @posted_at, @status, @source)`
      )
      .run({
        user_id: req.user.id,
        source_url: url,
        shortcode: data.shortcode,
        cover_url: data.cover_url,
        caption: data.caption,
        views: data.views,
        likes: data.likes,
        comments: data.comments,
        posted_at: data.posted_at,
        status: data.status,
        source: data.source,
      });
    const reel = db.prepare('SELECT * FROM reels WHERE id = ?').get(info.lastInsertRowid);
    res.json(reel);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Не удалось получить данные по ссылке' });
  }
});

app.get('/api/reels', requireAuth, (req, res) => {
  const scope = req.query.scope === 'all' ? 'all' : 'mine';
  const rows =
    scope === 'all'
      ? db
          .prepare(
            `SELECT reels.*, users.display_name, users.username, users.avatar_seed
             FROM reels JOIN users ON users.id = reels.user_id
             ORDER BY reels.added_at DESC LIMIT 300`
          )
          .all()
      : db.prepare('SELECT * FROM reels WHERE user_id = ? ORDER BY added_at DESC').all(req.user.id);
  res.json(rows);
});

app.delete('/api/reels/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM reels WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

app.get('/api/analytics', requireAuth, (req, res) => {
  const mine = db.prepare('SELECT views, likes, comments, posted_at FROM reels WHERE user_id = ?').all(req.user.id);
  const totalViews = mine.reduce((s, r) => s + r.views, 0);
  const totalLikes = mine.reduce((s, r) => s + r.likes, 0);
  const totalComments = mine.reduce((s, r) => s + r.comments, 0);
  const count = mine.length;
  const avgViews = count ? Math.round(totalViews / count) : 0;
  const best = mine.slice().sort((a, b) => b.views - a.views)[0] || null;

  const leaderboard = db
    .prepare(
      `SELECT users.display_name, users.username, users.avatar_seed,
              COUNT(reels.id) as reels_count, COALESCE(SUM(reels.views),0) as total_views
       FROM users LEFT JOIN reels ON reels.user_id = users.id
       GROUP BY users.id ORDER BY total_views DESC LIMIT 10`
    )
    .all();

  res.json({ totalViews, totalLikes, totalComments, count, avgViews, best, leaderboard });
});

app.listen(PORT, () => console.log(`Reels dashboard running on :${PORT}`));
