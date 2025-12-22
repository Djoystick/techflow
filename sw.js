// Service Worker for TechFlow - Offline support and caching
const CACHE_NAME = 'techflow-v2.0';
const ASSETS_CACHE = 'techflow-assets-v2';
const IMAGES_CACHE = 'techflow-images-v2';

const urlsToCache = [
  '/',
  '/index.html',
  '/miniapp.html',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/webfonts/fa-solid-900.woff2'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache).catch((err) => {
          console.log('Ошибка кэширования:', err);
        });
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== ASSETS_CACHE && cacheName !== IMAGES_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Пропустить не-GET запросы
  if (event.request.method !== 'GET') {
    return;
  }

  const { request } = event;
  const url = new URL(request.url);

  // Обработка изображений
  if (request.destination === 'image') {
    event.respondWith(
      caches.open(IMAGES_CACHE)
        .then((cache) => {
          return cache.match(request)
            .then((response) => {
              if (response) {
                return response;
              }
              return fetch(request)
                .then((fetchResponse) => {
                  cache.put(request, fetchResponse.clone());
                  return fetchResponse;
                })
                .catch(() => {
                  return caches.match('/images/placeholder.png');
                });
            });
        })
    );
    return;
  }

  // Для остальных запросов: сначала кэш, затем сеть
  event.respondWith(
    caches.match(request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(request)
          .then((fetchResponse) => {
            if (!fetchResponse || fetchResponse.status !== 200) {
              return fetchResponse;
            }
            const responseToCache = fetchResponse.clone();
            caches.open(ASSETS_CACHE)
              .then((cache) => {
                cache.put(request, responseToCache);
              });
            return fetchResponse;
          })
          .catch(() => {
            return caches.match('/index.html');
          });
      })
  );
});

// Обработка сообщений от клиента
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
