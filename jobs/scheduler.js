/**
 * jobs/scheduler.js
 *
 * Bu dosya, projenin "sıfır maliyet / rate-limit'i asla aşma" garantisinin
 * kalbidir. Dış API'lere istek atan TEK yer burasıdır (services/* üzerinden).
 *
 * İki bağımsız zamanlayıcı çalışır:
 *
 *  A) DAILY JOB (STANDINGS_CRON, varsayılan: her gün 03:00)
 *     - Tüm takip edilen ligler için puan durumu + fikstür çeker.
 *     - forEachLeagueThrottled ile istekler arasına ~6.5sn koyarak
 *       10 req/min limitinin çok altında kalır.
 *     - Sonuçları SQLite'a yazar ve ilgili cache anahtarlarını temizler
 *       (bir sonraki istek DB'den taze veri okuyup cache'i yeniden doldurur).
 *
 *  B) LIVE WATCHER (iki kademeli polling)
 *     - Varsayılan durumda "yoklama modu"nda çalışır: her
 *       LIVE_CHECK_INTERVAL_MINUTES dakikada bir "bugün canlı maç var mı?"
 *       diye TEK bir istek atar.
 *     - Canlı maç bulunursa "hızlı mod"a geçer: her
 *       LIVE_POLL_INTERVAL_SECONDS saniyede bir günceller.
 *     - Canlı maç kalmayınca otomatik olarak yoklama moduna geri döner.
 *     Bu iki kademeli yapı sayesinde maç olmayan saatlerde dış API'ye
 *     neredeyse hiç istek gitmez.
 */
const cron = require('node-cron');
const env = require('../config/env');
const logger = require('../utils/logger');
const db = require('../db/database');
const footballDataService = require('../services/footballDataService');
const sportsDbService = require('../services/sportsDbService');
const liveScoreService = require('../services/liveScoreService');
const cacheService = require('../services/cacheService');

// ---------------------------------------------------------------------------
// A) GÜNLÜK: Puan Durumu + Fikstür Güncelleme
// ---------------------------------------------------------------------------
async function updateStandingsAndFixtures() {
  logger.info('== GÜNLÜK GÖREV BAŞLIYOR: Puan durumu & fikstür güncelleme ==');

  await footballDataService.forEachLeagueThrottled(
    env.trackedLeagues,
    async (leagueCode) => {
      // --- Puan Durumu ---
      const standingsData = await footballDataService.getStandings(leagueCode);
      const table = standingsData?.standings?.find((s) => s.type === 'TOTAL')?.table || [];

      await db.run('DELETE FROM standings WHERE league_code = ?', [leagueCode]);

      await db.run(
        `INSERT OR REPLACE INTO leagues (code, name, country, emblem_url, season, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [
          leagueCode,
          standingsData?.competition?.name || leagueCode,
          standingsData?.area?.name || '',
          standingsData?.competition?.emblem || '',
          standingsData?.season?.startDate?.slice(0, 4) || '',
        ]
      );

      for (const row of table) {
        await db.run(
          `INSERT INTO standings
            (league_code, position, team_id, team_name, crest_url, played, won, draw, lost,
             points, goals_for, goals_against, goal_diff, form, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))`,
          [
            leagueCode,
            row.position,
            row.team.id,
            row.team.name,
            row.team.crest,
            row.playedGames,
            row.won,
            row.draw,
            row.lost,
            row.points,
            row.goalsFor,
            row.goalsAgainst,
            row.goalDifference,
            row.form || '',
          ]
        );
      }

      // --- Fikstür ---
      const fixturesData = await footballDataService.getFixtures(leagueCode);
      const matches = fixturesData?.matches || [];

      for (const m of matches) {
        await db.run(
          `INSERT OR REPLACE INTO fixtures
            (id, league_code, matchday, utc_date, status, home_team_id, home_team, home_crest,
             away_team_id, away_team, away_crest, home_score, away_score, minute, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?, datetime('now'))`,
          [
            m.id,
            leagueCode,
            m.matchday,
            m.utcDate,
            m.status,
            m.homeTeam?.id,
            m.homeTeam?.name,
            m.homeTeam?.crest,
            m.awayTeam?.id,
            m.awayTeam?.name,
            m.awayTeam?.crest,
            m.score?.fullTime?.home,
            m.score?.fullTime?.away,
            null,
          ]
        );
      }

      logger.info(`✔ ${leagueCode}: ${table.length} takım, ${matches.length} maç güncellendi.`);
      return { standings: table.length, fixtures: matches.length };
    }
  );

  // Bu verilere bağlı cache anahtarlarını temizle -> sıradaki istek DB'den taze okur
  env.trackedLeagues.forEach((code) => {
    cacheService.del(`standings:${code}`);
    cacheService.del(`fixtures:${code}`);
  });
  cacheService.del('standings:all');
  cacheService.del('fixtures:all');

  logger.info('== GÜNLÜK GÖREV TAMAMLANDI ==');
}

// ---------------------------------------------------------------------------
// B) CANLI MAÇ İZLEYİCİ (iki kademeli polling)
// ---------------------------------------------------------------------------
let liveIntervalHandle = null;
let currentMode = 'idle'; // 'idle' | 'polling' | 'watching'

async function updateLiveMatches() {
  const { source, matches } = await liveScoreService.fetchLiveMatches();

  if (matches.length === 0) {
    if (currentMode !== 'watching') {
      logger.info('Canlı maç yok -> yoklama moduna geçiliyor.');
      switchToWatchMode();
    }
    await db.run('DELETE FROM live_matches');
    cacheService.del('live-matches');
    return;
  }

  if (currentMode !== 'polling') {
    logger.info(`${matches.length} canlı maç bulundu -> hızlı polling moduna geçiliyor.`);
    switchToPollMode();
  }

  await db.run('DELETE FROM live_matches');
  for (const m of matches) {
    // football-data.org ve api-football farklı alan isimleri kullanır; normalize ediyoruz.
    const normalized =
      source === 'football-data'
        ? {
            id: m.id,
            league_code: m.competition?.code || '',
            home_team: m.homeTeam?.name,
            away_team: m.awayTeam?.name,
            home_crest: m.homeTeam?.crest,
            away_crest: m.awayTeam?.crest,
            home_score: m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? 0,
            away_score: m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? 0,
            minute: m.minute || null,
            status: m.status,
          }
        : {
            id: m.fixture?.id,
            league_code: m.league?.name || '',
            home_team: m.teams?.home?.name,
            away_team: m.teams?.away?.name,
            home_crest: m.teams?.home?.logo,
            away_crest: m.teams?.away?.logo,
            home_score: m.goals?.home ?? 0,
            away_score: m.goals?.away ?? 0,
            minute: m.fixture?.status?.elapsed || null,
            status: m.fixture?.status?.short,
          };

    await db.run(
      `INSERT OR REPLACE INTO live_matches
        (id, league_code, home_team, away_team, home_crest, away_crest, home_score, away_score, minute, status, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?, datetime('now'))`,
      [
        normalized.id,
        normalized.league_code,
        normalized.home_team,
        normalized.away_team,
        normalized.home_crest,
        normalized.away_crest,
        normalized.home_score,
        normalized.away_score,
        normalized.minute,
        normalized.status,
      ]
    );
  }

  cacheService.del('live-matches'); // sıradaki istek taze veriyi DB'den okusun
  logger.info(`Canlı maçlar güncellendi (${matches.length} maç, kaynak: ${source}).`);
}

function switchToPollMode() {
  currentMode = 'polling';
  if (liveIntervalHandle) clearInterval(liveIntervalHandle);
  liveIntervalHandle = setInterval(
    updateLiveMatches,
    env.schedule.livePollIntervalSeconds * 1000
  );
}

function switchToWatchMode() {
  currentMode = 'watching';
  if (liveIntervalHandle) clearInterval(liveIntervalHandle);
  liveIntervalHandle = setInterval(
    updateLiveMatches,
    env.schedule.liveCheckIntervalMinutes * 60 * 1000
  );
}

// ---------------------------------------------------------------------------
// Başlatıcı
// ---------------------------------------------------------------------------
function start() {
  logger.info(`Zamanlayıcı başlatıldı. Günlük görev: "${env.schedule.standingsCron}"`);

  // Günlük puan durumu / fikstür job'u
  cron.schedule(env.schedule.standingsCron, () => {
    updateStandingsAndFixtures().catch((err) =>
      logger.error('Günlük görev hata verdi:', err.message)
    );
  });

  // Canlı maç izleyiciyi "yoklama modu" ile başlat
  switchToWatchMode();
  updateLiveMatches().catch((err) => logger.error('İlk canlı kontrol hatası:', err.message));
}

// CLI'dan `node jobs/scheduler.js --once` ile manuel tetikleme (ilk kurulumda
// veritabanını hemen doldurmak için kullanışlıdır — cron'u 03:00'a kadar
// beklemeye gerek kalmaz).
if (require.main === module && process.argv.includes('--once')) {
  db.init()
    .then(() => updateStandingsAndFixtures())
    .then(() => {
      logger.info('Manuel tek seferlik güncelleme tamamlandı.');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Manuel güncelleme başarısız:', err);
      process.exit(1);
    });
}

module.exports = { start, updateStandingsAndFixtures, updateLiveMatches };
