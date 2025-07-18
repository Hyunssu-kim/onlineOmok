const CACHE_NAME = 'omok-game-v30';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/game.js'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(urlsToCache);
      })
  );
  // 새 서비스 워커를 즉시 활성화
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // 모든 클라이언트에서 새 서비스 워커를 즉시 사용
  return self.clients.claim();
});

self.addEventListener('fetch', function(event) {
  event.respondWith(
    // 네트워크 우선 전략 (항상 최신 파일 가져오기)
    fetch(event.request)
      .then(function(response) {
        // 응답이 유효하면 캐시에 저장
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(function(cache) {
              cache.put(event.request, responseToCache);
            });
        }
        return response;
      })
      .catch(function() {
        // 네트워크 실패 시 캐시에서 가져오기
        return caches.match(event.request);
      })
  );
});