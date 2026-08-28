/**
 * services/footballDataService.js
 *
 * football-data.org ile SADECE bu dosya konuşur ve SADECE cron job
 * (jobs/scheduler.js) bu fonksiyonları çağırır. Free tier limiti 10 req/min
 * olduğu için burada:
 *   1) İstekler arasında minimum bekleme (throttle) uygulanır,
 *   2) Her çağrı db/database.js -> api_call_log tablosuna kaydedilir,
 *   3) 429 (Too Many Requests) alınırsa exponential backoff ile yeniden dener.
 */
const fetch = require('node-fetch');
const env = require('../config/env');
const logger = require('../utils/logger');
const db = require('../db/database');

const BASE_URL = env.footballData.baseUrl;
const HEADERS = { 'X-Auth-Token': env.footballData.token };

// Basit bekleme yardımcı fonksiyonu
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Throttled + retry'lı düşük seviye istek fonksiyonu.
 * @param {string} endpoint - örn: '/competitions/PL/standings'
 */
async function request(endpoint, { retries = 3, backoffMs = 5000 } = {}) {
  const url = `${BASE_URL}${endpoint}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
    logger.api(`football-data.org -> ${endpoint} (deneme ${attempt})`);
    const res = await fetch(url, { headers: HEADERS });

    await db
      .run(
        'INSERT INTO api_call_log (source, endpoint, status_code) VALUES (?, ?, ?)',
        ['football-data', endpoint, res.status]
      )
      .catch(() => {}); // log tablosu yazılamazsa akışı bozmasın

    if (res.status === 429) {
      const wait = backoffMs * attempt;
      logger.warn(`Rate limit (429) alındı. ${wait}ms bekleniyor...`);
      await sleep(wait);
      continue;
    }

    if (!res.ok) {
      throw new Error(`football-data.org hata: ${res.status} ${res.statusText} (${endpoint})`);
    }

    return res.json();
  }
  throw new Error(`football-data.org: ${retries} denemeden sonra başarısız (${endpoint})`);
}

/** Tek bir ligin puan durumunu çeker */
async function getStandings(leagueCode) {
  const data = await request(`/competitions/${leagueCode}/standings`);
  return data;
}

/** Tek bir ligin fikstürünü (gelecek + geçmiş maçlar) çeker */
async function getFixtures(leagueCode) {
  const data = await request(`/competitions/${leagueCode}/matches`);
  return data;
}

async function getTodayMatches() {
  const data = await request('/matches');
  return data;
}

/**
 * Tüm takip edilen ligler arasında throttle uygulayarak sırayla istek atar.
 * 10 req/min limitini aşmamak için her istek arasında ~6.5 saniye bekler
 * (10 istek/dk = ortalama 6sn/istek; güvenlik payı için 6.5sn kullanıyoruz).
 */
async function forEachLeagueThrottled(leagueCodes, fn) {
  const results = [];
  for (const code of leagueCodes) {
    try {
      const result = await fn(code);
      results.push({ code, result, ok: true });
    } catch (err) {
      logger.error(`Lig ${code} için istek başarısız:`, err.message);
      results.push({ code, error: err.message, ok: false });
    }
    await sleep(6500); // free-tier rate limit koruması
  }
  return results;
}

module.exports = {
  getStandings,
  getFixtures,
  getTodayMatches,
  forEachLeagueThrottled,
};
