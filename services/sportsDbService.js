/**
 * services/sportsDbService.js
 *
 * TheSportsDB'nin ücretsiz (test key = '3') endpoint'lerinden takım logosu
 * çeker. Bu veriler neredeyse hiç değişmediği için TTL.TEAM_INFO (1 gün)
 * ile agresif biçimde cache'lenir. Ayrıca sonuçlar SQLite'a da yazılabilir
 * (standings tablosundaki crest_url alanı fallback olarak kullanılabilir).
 */
const fetch = require('node-fetch');
const env = require('../config/env');
const logger = require('../utils/logger');
const cacheService = require('./cacheService');

const BASE_URL = env.sportsDb.baseUrl;

async function getTeamLogo(teamName) {
  const cacheKey = `logo:${teamName.toLowerCase()}`;
  const cached = cacheService.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    logger.api(`TheSportsDB -> searchteams (${teamName})`);
    const res = await fetch(
      `${BASE_URL}/searchteams.php?t=${encodeURIComponent(teamName)}`
    );
    if (!res.ok) throw new Error(`TheSportsDB hata: ${res.status}`);
    const data = await res.json();
    const logoUrl = data?.teams?.[0]?.strTeamBadge || null;
    cacheService.set(cacheKey, logoUrl, cacheService.TTL.TEAM_INFO);
    return logoUrl;
  } catch (err) {
    logger.warn(`Logo alınamadı (${teamName}):`, err.message);
    return null; // logo yoksa frontend fallback ikon gösterecek
  }
}

module.exports = { getTeamLogo };
