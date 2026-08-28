/**
 * middleware/rateLimiter.js
 *
 * Dikkat: Bu, dış API'lere uyguladığımız throttle DEĞİL — bizim KENDİ
 * backend API'mizi kötüye kullanıma (bot/DDoS/aşırı istek) karşı koruyan
 * ayrı bir katmandır. Kullanıcılar zaten sadece cache/DB'den okuduğu için
 * bu limit yüksek tutulabilir; amaç sadece kaynakları korumaktır.
 */
const rateLimit = require('express-rate-limit');

const publicApiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 dakika
  max: 120, // dakikada 120 istek/IP -> normal kullanıcı için bolca yeterli
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Çok fazla istek gönderildi. Lütfen bir dakika sonra tekrar deneyin.',
  },
});

module.exports = { publicApiLimiter };
