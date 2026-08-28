/**
 * routes/teams.js
 * GET /api/teams/:teamName/logo -> takım logosu (TheSportsDB üzerinden, agresif cache'li)
 *
 * Not: standings/fixtures verisi zaten football-data.org'dan crest_url ile
 * gelir; bu endpoint sadece o alan boşsa fallback olarak kullanılır.
 */
const express = require('express');
const router = express.Router();
const sportsDbService = require('../services/sportsDbService');
const { asyncHandler } = require('../middleware/errorHandler');

router.get(
  '/:teamName/logo',
  asyncHandler(async (req, res) => {
    const { teamName } = req.params;
    const logoUrl = await sportsDbService.getTeamLogo(teamName);
    res.json({ team: teamName, logoUrl });
  })
);

module.exports = router;
