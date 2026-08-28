/**
 * server.js
 * Uygulamanın giriş noktası: Express'i kurar, middleware'leri bağlar,
 * route'ları mount eder, veritabanını başlatır ve zamanlayıcıyı (scheduler)
 * çalıştırır.
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const env = require('./config/env');
const logger = require('./utils/logger');
const db = require('./db/database');
const scheduler = require('./jobs/scheduler');
const standingsRoutes = require('./routes/standingsRoutes');
const fixturesRoutes = require('./routes/fixturesRoutes');
const { publicApiLimiter } = require('./middleware/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const standingsRoutes = require('./routes/standings');
const fixturesRoutes = require('./routes/fixtures');
const liveMatchesRoutes = require('./routes/liveMatches');
const teamsRoutes = require('./routes/teams');

const app = express();

// --- Güvenlik & Performans Middleware'leri ---
app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: env.ALLOWED_ORIGINS.includes('*') ? '*' : env.ALLOWED_ORIGINS,
  })
);
app.use(express.json());
app.use(publicApiLimiter);

// --- Sağlık kontrolü (hosting sağlayıcılarının uptime kontrolleri için) ---
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- REST API Route'ları ---
app.use('/api/standings', standingsRoutes);
app.use('/api/fixtures', fixturesRoutes);
app.use('/api/live-matches', liveMatchesRoutes);
app.use('/api/teams', teamsRoutes);

// --- 404 & Merkezi Hata Yönetimi ---
app.use(notFoundHandler);
app.use(errorHandler);

// --- Başlatma sırası: önce DB, sonra scheduler, sonra HTTP sunucu ---
async function bootstrap() {
  await db.init();
  scheduler.start();

  app.listen(env.PORT, () => {
    logger.info(`🚀 Sunucu ayakta: http://localhost:${env.PORT}`);
    logger.info(`   Ortam: ${env.NODE_ENV}`);
    logger.info(`   Takip edilen ligler: ${env.trackedLeagues.join(', ')}`);
  });
}

bootstrap().catch((err) => {
  logger.error('Sunucu başlatılamadı:', err);
  process.exit(1);
});
