/**
 * routes/fixtures.js
 * GET /api/fixtures                -> tüm liglerden yaklaşan maçlar (varsayılan 20)
 * GET /api/fixtures/:leagueCode    -> belirli bir ligin tüm fikstürü
 * GET /api/fixtures/date/:date     -> belirli bir tarihteki maçlar (YYYY-MM-DD)
 */
const express = require('express');
const router = express.Router();
const db = require('../db/database');
const cacheService = require('../services/cacheService');
const { asyncHandler } = require('../middleware/errorHandler');

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit || '20', 10);
    const cacheKey = `fixtures:all:${limit}`;
    const cached = cacheService.get(cacheKey);
    if (cached) return res.json({ source: 'cache', data: cached });

    const fixtures = await db.all(
      `SELECT * FROM fixtures
       WHERE status = 'SCHEDULED' AND utc_date >= datetime('now')
       ORDER BY utc_date ASC LIMIT ?`,
      [limit]
    );
    cacheService.set(cacheKey, fixtures, cacheService.TTL.FIXTURES);
    res.json({ source: 'db', data: fixtures });
  })
);

router.get(
  '/date/:date',
  asyncHandler(async (req, res) => {
    const { date } = req.params; // YYYY-MM-DD
    const cacheKey = `fixtures:date:${date}`;
    const cached = cacheService.get(cacheKey);
    if (cached) return res.json({ source: 'cache', data: cached });

    const fixtures = await db.all(
      `SELECT * FROM fixtures WHERE date(utc_date) = ? ORDER BY utc_date ASC`,
      [date]
    );
    cacheService.set(cacheKey, fixtures, cacheService.TTL.FIXTURES);
    res.json({ source: 'db', data: fixtures });
  })
);

router.get(
  '/:leagueCode',
  asyncHandler(async (req, res) => {
    const { leagueCode } = req.params;
    const cacheKey = `fixtures:${leagueCode}`;
    const cached = cacheService.get(cacheKey);
    if (cached) return res.json({ source: 'cache', data: cached });

    const fixtures = await db.all(
      'SELECT * FROM fixtures WHERE league_code = ? ORDER BY utc_date ASC',
      [leagueCode]
    );
    cacheService.set(cacheKey, fixtures, cacheService.TTL.FIXTURES);
    res.json({ source: 'db', data: fixtures });
  })
);

module.exports = router;
