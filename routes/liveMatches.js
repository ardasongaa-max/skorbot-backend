/**
 * routes/liveMatches.js
 * GET /api/live-matches -> şu anda canlı olan tüm maçlar
 *
 * TTL çok kısa (30sn) tutulur çünkü kullanıcı deneyimi için tazelik önemlidir,
 * ama yine de dış API'ye gitmeden SQLite'tan okunur — dış API'yi güncel
 * tutmak scheduler.js'in (60sn'lik poll) görevidir.
 */
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const cacheService = require('../services/cacheService');
const { asyncHandler } = require('../middleware/errorHandler');

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const cacheKey = 'live-matches';
    const cached = cacheService.get(cacheKey);
    if (cached) return res.json({ source: 'cache', data: cached });

    const matches = await db.all('SELECT * FROM live_matches ORDER BY league_code');
    cacheService.set(cacheKey, matches, cacheService.TTL.LIVE_MATCHES);
    res.json({ source: 'db', data: matches, count: matches.length });
  })
);

module.exports = router;
