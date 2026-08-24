const fmt = new Intl.NumberFormat('ru-RU');
const dfmt = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
};

let ME = null;

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (res.status === 401) {
    window.location.href = '/';
    throw new Error('unauth');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка');
  return data;
}

async function init() {
  ME = await api('/api/me');
  document.getElementById('user-name').textContent = ME.display_name;
  document.getElementById('user-avatar').style.background = `linear-gradient(135deg, hsl(${hashHue(ME.username)},70%,75%), hsl(${hashHue(ME.username) + 60},70%,65%))`;

  document.getElementById('logout').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' });
    window.location.href = '/';
  });

  setupTabs();
  setupSegmented('segmented-mine', renderMine);
  setupSegmented('segmented-all', renderAll);

  document.getElementById('add-reel').addEventListener('click', addReel);
  document.getElementById('reel-url').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addReel();
  });

  await renderMine();
}

function hashHue(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

function setupTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach((t) =>
    t.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.remove('active'));
      t.classList.add('active');
      document.querySelectorAll('.panel').forEach((p) => (p.hidden = true));
      const panel = document.getElementById(`panel-${t.dataset.tab}`);
      panel.hidden = false;
      if (t.dataset.tab === 'all') renderAll();
      if (t.dataset.tab === 'analytics') renderAnalytics();
    })
  );
}

function setupSegmented(id, rerender) {
  const el = document.getElementById(id);
  el.querySelectorAll('.seg').forEach((btn) =>
    btn.addEventListener('click', () => {
      el.querySelectorAll('.seg').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      rerender();
    })
  );
}

function currentView(id) {
  const active = document.querySelector(`#${id} .seg.active`);
  return active ? active.dataset.view : 'feed';
}

async function addReel() {
  const input = document.getElementById('reel-url');
  const status = document.getElementById('add-status');
  const url = input.value.trim();
  if (!url) return;
  status.hidden = false;
  status.className = 'status-line';
  status.textContent = 'Подтягиваем данные из Reel…';
  try {
    await api('/api/reels', { method: 'POST', body: JSON.stringify({ url }) });
    input.value = '';
    status.className = 'status-line ok';
    status.textContent = 'Готово! Обложка, просмотры и дата подтянулись.';
    await renderMine();
  } catch (e) {
    status.className = 'status-line err';
    status.textContent = e.message;
  }
}

function reelCardNode(r, showAuthor) {
  const tpl = document.getElementById('reel-card-tpl').content.cloneNode(true);
  const img = tpl.querySelector('img');
  img.src = r.cover_url || 'https://picsum.photos/seed/fallback/600/800';
  img.alt = r.caption || 'Reel';
  tpl.querySelector('.reel-views-pill b').textContent = fmt.format(r.views || 0);
  const src = tpl.querySelector('.reel-source-pill');
  src.textContent = r.source === 'apify' ? 'live' : 'demo';
  src.classList.add(r.source === 'apify' ? 'apify' : 'demo');
  tpl.querySelector('.reel-author').textContent = showAuthor ? r.display_name || r.username : dateOrDelete(r);
  tpl.querySelector('.reel-date').textContent = dfmt(r.posted_at);
  const card = tpl.querySelector('.reel-card');
  card.addEventListener('click', () => window.open(r.source_url, '_blank'));
  return tpl;
}

function dateOrDelete(r) {
  return '';
}

async function renderMine() {
  const reels = await api('/api/reels?scope=mine');
  const feedEl = document.getElementById('mine-feed');
  const tableEl = document.getElementById('mine-table');
  const emptyEl = document.getElementById('mine-empty');
  const view = currentView('segmented-mine');

  emptyEl.hidden = reels.length > 0;
  feedEl.hidden = view !== 'feed' || reels.length === 0;
  tableEl.hidden = view !== 'table' || reels.length === 0;

  feedEl.innerHTML = '';
  reels.forEach((r) => {
    const node = reelCardNode(r, false);
    const meta = node.querySelector('.reel-meta');
    meta.innerHTML = `<span class="reel-date">${dfmt(r.posted_at)}</span><button class="reel-delete" data-id="${r.id}">удалить</button>`;
    feedEl.appendChild(node);
  });
  feedEl.querySelectorAll('.reel-delete').forEach((btn) =>
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await api(`/api/reels/${btn.dataset.id}`, { method: 'DELETE' });
      renderMine();
    })
  );

  renderTable(tableEl, reels, false);
}

async function renderAll() {
  const reels = await api('/api/reels?scope=all');
  const feedEl = document.getElementById('all-feed');
  const tableEl = document.getElementById('all-table');
  const view = currentView('segmented-all');
  feedEl.hidden = view !== 'feed';
  tableEl.hidden = view !== 'table';

  feedEl.innerHTML = '';
  reels.forEach((r) => feedEl.appendChild(reelCardNode(r, true)));
  renderTable(tableEl, reels, true);
}

function renderTable(el, reels, showAuthor) {
  const rows = reels
    .map(
      (r) => `
    <tr>
      <td class="td-cover"><img src="${r.cover_url || ''}" alt="" /></td>
      ${showAuthor ? `<td>${escapeHtml(r.display_name || r.username)}</td>` : ''}
      <td class="td-views">${fmt.format(r.views || 0)}</td>
      <td>${fmt.format(r.likes || 0)}</td>
      <td>${fmt.format(r.comments || 0)}</td>
      <td>${dfmt(r.posted_at)}</td>
      <td><a href="${r.source_url}" target="_blank">открыть ↗</a></td>
    </tr>`
    )
    .join('');
  el.innerHTML = `
    <table>
      <thead><tr>
        <th>Обложка</th>
        ${showAuthor ? '<th>Блогер</th>' : ''}
        <th>Просмотры</th>
        <th>Лайки</th>
        <th>Комменты</th>
        <th>Дата</th>
        <th>Ссылка</th>
      </tr></thead>
      <tbody>${rows || `<tr><td colspan="7" style="padding:24px;color:var(--ink-soft)">Пусто</td></tr>`}</tbody>
    </table>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function renderAnalytics() {
  const a = await api('/api/analytics');
  document.getElementById('stat-views').textContent = fmt.format(a.totalViews);
  document.getElementById('stat-count').textContent = fmt.format(a.count);
  document.getElementById('stat-avg').textContent = fmt.format(a.avgViews);
  document.getElementById('stat-eng').textContent = `${fmt.format(a.totalLikes)} / ${fmt.format(a.totalComments)}`;

  const bestEl = document.getElementById('best-reel');
  if (a.best) {
    bestEl.innerHTML = `<div class="best-reel-row"><span class="n">👁 ${fmt.format(a.best.views)}</span></div><p style="color:var(--ink-soft);font-size:13px;margin-top:8px">опубликован ${dfmt(a.best.posted_at)}</p>`;
  } else {
    bestEl.textContent = 'Пока нет роликов';
  }

  const lb = document.getElementById('leaderboard');
  lb.innerHTML = a.leaderboard
    .map(
      (u, i) => `<li><span class="lb-rank">${i + 1}</span><span class="lb-name">${escapeHtml(u.display_name || u.username)}</span><span class="lb-views">${fmt.format(u.total_views)}</span></li>`
    )
    .join('');
}

init();
