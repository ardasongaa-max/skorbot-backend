/**
 * middleware/errorHandler.js
 * Tüm route'larda tekrarlanan try/catch bloklarını tekilleştirmek için
 * asyncHandler sarmalayıcısı + merkezi hata middleware'i.
 */
const logger = require('../utils/logger');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Endpoint bulunamadı', path: req.originalUrl });
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  logger.error(`${req.method} ${req.originalUrl} ->`, err.message);
  res.status(err.status || 500).json({
    error: 'Sunucu hatası',
    detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
}

module.exports = { asyncHandler, notFoundHandler, errorHandler };
