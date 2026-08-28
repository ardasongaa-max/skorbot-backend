/**
 * routes/standings.js
 * GET /api/standings              -> takip edilen tüm liglerin özet listesi
 * GET /api/standings/:leagueCode  -> tek bir liginin tam puan durumu tablosu
 *
 * ÖNEMLİ: Bu route'lar dış API'ye ASLA istek atmaz. Sadece:
 *   1) cache'e bak (varsa dön)
 *   2) yoksa SQLite'tan oku, cache'e yaz, dön
 */
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const cacheService = require('../services/cacheService');
const { asyncHandler } = require('../middleware/errorHandler');

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const cacheKey = 'standings:all';
    const cached = cacheService.get(cacheKey);
    if (cached) return res.json({ source: 'cache', data: cached });

    const leagues = await db.all('SELECT * FROM leagues ORDER BY name');
    cacheService.set(cacheKey, leagues, cacheService.TTL.STANDINGS);
    res.json({ source: 'db', data: leagues });
  })
);

router.get(
  '/:leagueCode',
  asyncHandler(async (req, res) => {
    const { leagueCode } = req.params;
    const cacheKey = `standings:${leagueCode}`;
    const cached = cacheService.get(cacheKey);
    if (cached) return res.json({ source: 'cache', data: cached });

    const league = await db.get('SELECT * FROM leagues WHERE code = ?', [leagueCode]);
    if (!league) {
      return res.status(404).json({ error: `Lig bulunamadı: ${leagueCode}` });
    }

    const table = await db.all(
      'SELECT * FROM standings WHERE league_code = ? ORDER BY position ASC',
      [leagueCode]
    );

    const payload = { league, table };
    cacheService.set(cacheKey, payload, cacheService.TTL.STANDINGS);
    res.json({ source: 'db', data: payload });
  })
);

module.exports = router;
