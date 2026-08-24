// instagram.js — подтягивает обложку/просмотры/дату по ссылке на Reels.
//
// Режим 1 (боевой): если задан APIFY_TOKEN — идём в Apify Instagram Scraper
// (бесплатного тарифа/пробных кредитов Apify хватает для теста).
// Режим 2 (демо): если токена нет или Apify не ответил — генерируем
// стабильные (детерминированные по ссылке) демо-данные, чтобы сайт
// всегда работал и его можно было показать без чужих API-ключей.

const fetch = require('node-fetch');

const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
const APIFY_ACTOR = process.env.APIFY_ACTOR || 'apify~instagram-reel-scraper';

function extractShortcode(url) {
  const m = url.match(/instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

// Простой детерминированный хэш, чтобы одна и та же ссылка всегда
// давала одни и те же "просмотры"/обложку в демо-режиме.
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function demoData(url) {
  const shortcode = extractShortcode(url) || url.slice(-10);
  const h = hashString(url);
  const views = 3000 + (h % 480000);
  const likes = Math.round(views * (0.03 + (h % 10) / 200));
  const comments = Math.round(likes * (0.02 + (h % 5) / 300));
  const daysAgo = h % 30;
  const posted = new Date(Date.now() - daysAgo * 86400000).toISOString();
  return {
    shortcode,
    cover_url: `https://picsum.photos/seed/${shortcode}/600/800`,
    caption: 'Демо-данные — подключите APIFY_TOKEN, чтобы подтягивать реальные Reels',
    views,
    likes,
    comments,
    posted_at: posted,
    status: 'demo',
    source: 'demo',
  };
}

async function fetchFromApify(url) {
  const endpoint = `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: [], directUrls: [url], resultsLimit: 1 }),
    timeout: 60000,
  });
  if (!res.ok) throw new Error(`Apify HTTP ${res.status}`);
  const items = await res.json();
  const item = Array.isArray(items) ? items[0] : null;
  if (!item) throw new Error('Apify: пустой ответ');

  // Разные акторы Apify называют поля по-разному — пробуем самые частые варианты.
  const views = item.videoPlayCount ?? item.videoViewCount ?? item.viewsCount ?? item.playsCount ?? 0;
  const cover = item.displayUrl ?? item.imageUrl ?? item.thumbnailUrl ?? null;
  const posted = item.timestamp ?? item.takenAtTimestamp ?? new Date().toISOString();

  return {
    shortcode: item.shortCode ?? extractShortcode(url),
    cover_url: cover,
    caption: item.caption ?? '',
    views: Number(views) || 0,
    likes: Number(item.likesCount ?? 0),
    comments: Number(item.commentsCount ?? 0),
    posted_at: posted,
    status: 'ok',
    source: 'apify',
  };
}

async function fetchReelData(url) {
  if (!APIFY_TOKEN) return demoData(url);
  try {
    return await fetchFromApify(url);
  } catch (err) {
    console.warn('[instagram] Apify недоступен, использую демо-данные:', err.message);
    return demoData(url);
  }
}

module.exports = { fetchReelData, extractShortcode };
