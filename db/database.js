/**
 * db/database.js
 *
 * Neden SQLite?
 * - Sıfır maliyetli hosting (Render free tier vb.) için ayrı bir DB sunucusu
 *   gerektirmez, tek bir dosyadır (data/skorbot.sqlite).
 * - Cron job dış API'den veri çektiğinde SONUCU BURAYA YAZAR.
 * - Kullanıcı istekleri ASLA dış API'ye gitmez; hep bu dosyadan okunur.
 * - Node-cache (bkz. services/cacheService.js) bu verinin RAM'deki hızlı
 *   kopyasını tutar; SQLite ise kalıcılık (persistence) sağlar — sunucu
 *   yeniden başlasa bile veri kaybolmaz, cron tekrar çalışana kadar
 *   "son bilinen veri" servis edilebilir.
 */
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const logger = require('../utils/logger');

const DB_PATH = path.join(__dirname, '..', 'data', 'skorbot.sqlite');
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    logger.error('SQLite bağlantı hatası:', err.message);
  } else {
    logger.info('SQLite veritabanına bağlanıldı:', DB_PATH);
  }
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS leagues (
  code        TEXT PRIMARY KEY,       -- örn: 'PL', 'TR1'
  name        TEXT NOT NULL,
  country     TEXT,
  emblem_url  TEXT,
  season      TEXT,
  updated_at  TEXT
);

CREATE TABLE IF NOT EXISTS standings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  league_code TEXT NOT NULL,
  position    INTEGER,
  team_id     INTEGER,
  team_name   TEXT,
  crest_url   TEXT,
  played      INTEGER,
  won         INTEGER,
  draw        INTEGER,
  lost        INTEGER,
  points      INTEGER,
  goals_for   INTEGER,
  goals_against INTEGER,
  goal_diff   INTEGER,
  form        TEXT,
  updated_at  TEXT,
  FOREIGN KEY (league_code) REFERENCES leagues(code)
);

CREATE TABLE IF NOT EXISTS fixtures (
  id            INTEGER PRIMARY KEY,      -- dış API'nin verdiği maç id'si
  league_code   TEXT NOT NULL,
  matchday      INTEGER,
  utc_date      TEXT,
  status        TEXT,                     -- SCHEDULED / LIVE / IN_PLAY / FINISHED
  home_team_id  INTEGER,
  home_team     TEXT,
  home_crest    TEXT,
  away_team_id  INTEGER,
  away_team     TEXT,
  away_crest    TEXT,
  home_score    INTEGER,
  away_score    INTEGER,
  minute        INTEGER,
  updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS live_matches (
  id            INTEGER PRIMARY KEY,
  league_code   TEXT,
  home_team     TEXT,
  away_team     TEXT,
  home_crest    TEXT,
  away_crest    TEXT,
  home_score    INTEGER,
  away_score    INTEGER,
  minute        INTEGER,
  status        TEXT,
  updated_at    TEXT
);

-- Dış API çağrılarının denetim izi (rate-limit takibi/debug için)
CREATE TABLE IF NOT EXISTS api_call_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT,          -- 'football-data' | 'sportsdb' | 'api-football'
  endpoint    TEXT,
  status_code INTEGER,
  called_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_standings_league ON standings(league_code);
CREATE INDEX IF NOT EXISTS idx_fixtures_league ON fixtures(league_code);
CREATE INDEX IF NOT EXISTS idx_fixtures_status ON fixtures(status);
`;

function init() {
  return new Promise((resolve, reject) => {
    db.exec(SCHEMA, (err) => {
      if (err) {
        logger.error('Şema oluşturulamadı:', err.message);
        return reject(err);
      }
      logger.info('Veritabanı şeması hazır.');
      resolve();
    });
  });
}

// Küçük yardımcı sarmalayıcılar (Promise tabanlı) — sqlite3 callback tabanlıdır.
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

module.exports = { db, init, run, all, get };
