/**
 * services/cacheService.js
 *
 * Mimari sırayla şöyle çalışır:
 *   İstek geldi -> RAM Cache'de var mı? -> VARSA anında dön (0ms, dış API yok)
 *                                       -> YOKSA SQLite'tan oku, cache'e koy, dön
 * Dış API'ye SADECE cron job'lar yazar (bkz. jobs/scheduler.js).
 *
 * node-cache tek process içinde RAM'de tutar. Tek instance'lık free-tier
 * hosting (Render/Fly.io) için yeterlidir. Çok sunuculu (multi-instance)
 * bir yapıya geçerseniz bunun yerine Redis kullanmanız önerilir — arayüz
 * aynı kalacağı için (get/set/del) değişiklik minimaldir.
 */
const NodeCache = require('node-cache');

// stdTTL: varsayılan yaşam süresi (saniye). checkperiod: süresi dolanları temizleme sıklığı.
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const TTL = {
  STANDINGS: 60 * 60 * 6,   // 6 saat (günde 1 kez zaten güncelleniyor)
  FIXTURES: 60 * 60 * 3,    // 3 saat
  LIVE_MATCHES: 30,         // 30 saniye (canlı veri daha kısa ömürlü olmalı)
  TEAM_INFO: 60 * 60 * 24,  // 1 gün (logo/takım bilgisi nadiren değişir)
};

module.exports = {
  cache,
  TTL,
  get: (key) => cache.get(key),
  set: (key, value, ttl) => cache.set(key, value, ttl),
  del: (key) => cache.del(key),
  flush: () => cache.flushAll(),
  has: (key) => cache.has(key),
};
