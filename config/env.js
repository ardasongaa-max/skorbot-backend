/**
 * config/env.js
 * Tüm ortam değişkenlerini tek bir yerden okuyup dışa aktarır.
 * Başka hiçbir dosya doğrudan process.env okumamalı — bu, konfigürasyonu
 * tek bir kaynaktan yönetmemizi sağlar ve eksik değişkenleri erken yakalar.
 */
require('dotenv').config();

function required(name, fallback = undefined) {
  const val = process.env[name] ?? fallback;
  if (val === undefined) {
    console.warn(`[config] UYARI: ${name} tanımlı değil. .env dosyanızı kontrol edin.`);
  }
  return val;
}

module.exports = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || '*')
    .split(',')
    .map((o) => o.trim()),

  footballData: {
    token: required('FOOTBALL_DATA_TOKEN'),
    baseUrl: process.env.FOOTBALL_DATA_BASE_URL || 'https://api.football-data.org/v4',
  },

  sportsDb: {
    baseUrl: process.env.SPORTSDB_BASE_URL || 'https://www.thesportsdb.com/api/v1/json/3',
  },

  rapidApi: {
    key: process.env.RAPIDAPI_KEY,
    host: process.env.RAPIDAPI_HOST || 'api-football-v1.p.rapidapi.com',
  },

  schedule: {
    standingsCron: process.env.STANDINGS_CRON || '0 3 * * *',
    livePollIntervalSeconds: parseInt(process.env.LIVE_POLL_INTERVAL_SECONDS || '60', 10),
    liveCheckIntervalMinutes: parseInt(process.env.LIVE_CHECK_INTERVAL_MINUTES || '5', 10),
  },

  trackedLeagues: (process.env.TRACKED_LEAGUES || 'PL,PD,SA,BL1,FL1,TR1,CL')
    .split(',')
    .map((l) => l.trim()),
};
