/**
 * services/liveScoreService.js
 *
 * Canlı skor stratejisi (maliyet = 0 hedefiyle):
 *   1. ANA KAYNAK: football-data.org `/matches` endpoint'i (zaten
 *      standings/fixtures için kullandığımız aynı token, ek maliyet yok).
 *      Cron, canlı maç olup olmadığını kontrol eder (LIVE_CHECK_INTERVAL_MINUTES).
 *   2. Eğer canlı maç VARSA, poll aralığı LIVE_POLL_INTERVAL_SECONDS'a düşer
 *      (örn. 60sn) ve SADECE o gün için filtrelenmiş maçlar tekrar çekilir.
 *   3. YEDEK KAYNAK (opsiyonel): API-Football/RapidAPI free tier (100 req/gün).
 *      Bu, football-data.org'un canlı veri sağlamadığı/geciktiği durumlarda
 *      devreye girer. RAPIDAPI_KEY tanımlı değilse bu kaynak sessizce atlanır.
 *
 * Böylece TEK bir sağlayıcıya bağımlı kalınmaz ama günlük istek sayısı
 * kesinlikle iki API'nin de free-tier limitinin altında tutulur.
 */
const fetch = require('node-fetch');
const env = require('../config/env');
const logger = require('../utils/logger');
const db = require('../db/database');

async function getLiveMatchesFromFootballData() {
  const footballDataService = require('./footballDataService');
  const data = await footballDataService.getTodayMatches();
  const matches = data.matches || [];
  return matches.filter((m) =>
    ['LIVE', 'IN_PLAY', 'PAUSED'].includes(m.status)
  );
}

/** Yedek kaynak: sadece RAPIDAPI_KEY tanımlıysa ve gerçekten gerekiyorsa kullan */
async function getLiveMatchesFromApiFootball() {
  if (!env.rapidApi.key) {
    logger.info('RAPIDAPI_KEY tanımlı değil, yedek canlı skor kaynağı atlanıyor.');
    return [];
  }
  try {
    logger.api('API-Football (RapidAPI) -> fixtures?live=all');
    const res = await fetch(
      `https://${env.rapidApi.host}/v3/fixtures?live=all`,
      {
        headers: {
          'x-rapidapi-key': env.rapidApi.key,
          'x-rapidapi-host': env.rapidApi.host,
        },
      }
    );
    await db
      .run('INSERT INTO api_call_log (source, endpoint, status_code) VALUES (?, ?, ?)', [
        'api-football',
        '/fixtures?live=all',
        res.status,
      ])
      .catch(() => {});
    if (!res.ok) throw new Error(`API-Football hata: ${res.status}`);
    const data = await res.json();
    return data.response || [];
  } catch (err) {
    logger.warn('Yedek canlı skor kaynağı başarısız:', err.message);
    return [];
  }
}

/**
 * Ana giriş noktası: önce ücretsiz/ana kaynağı dener, boş dönerse
 * (ve yapılandırılmışsa) yedek kaynağa düşer.
 */
async function fetchLiveMatches() {
  let matches = await getLiveMatchesFromFootballData();
  if (matches.length === 0) {
    const backup = await getLiveMatchesFromApiFootball();
    if (backup.length > 0) {
      logger.info(`Yedek kaynaktan ${backup.length} canlı maç alındı.`);
    }
    return { source: 'api-football', matches: backup };
  }
  return { source: 'football-data', matches };
}

module.exports = { fetchLiveMatches };
