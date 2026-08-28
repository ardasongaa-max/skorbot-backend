/**
 * utils/logger.js
 * Basit, bağımlılıksız zaman damgalı logger.
 * Amaç: dış API çağrılarının ne zaman/ne sıklıkta yapıldığını izleyebilmek
 * (rate-limit ihlallerini teşhis etmek için kritik).
 */
function ts() {
  return new Date().toISOString();
}

module.exports = {
  info: (...args) => console.log(`[${ts()}] [INFO]`, ...args),
  warn: (...args) => console.warn(`[${ts()}] [WARN]`, ...args),
  error: (...args) => console.error(`[${ts()}] [ERROR]`, ...args),
  api: (...args) => console.log(`[${ts()}] [DIŞ-API-ÇAĞRISI]`, ...args),
};
