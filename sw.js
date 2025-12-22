// ============ SERVICE WORKER ДЛЯ ОФФЛАЙНА ============
// Файл: sw.js
// Место: Корень проекта (/sw.js)

const CACHE_VERSION = 'techflow-v1.2';
const CACHE_ASSETS = 'techflow-assets-v1';
const CACHE_IMAGES = 'techflow-images-v1';

// ============ УСТАНОВКА ============
self.addEventListener('install', (event) => {
    console.log('🚀 Service Worker установлен');
    event.waitUntil(
        caches.open(CACHE_VERSION)
            .then((cache) => {
                console.log('📦 Кэширование основных файлов...');
                return cache.addAll([
                    '/',
                    '/index.html',
                    '/miniapp.html',
                    '/admin.html',
                    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
                    'https://unpkg.com/vue@3/dist/vue.global.js'
                ]);
            })
            .catch((err) => {
                console.log('⚠️ Ошибка кэширования:', err);
            })
            .then(() => self.skipWaiting())
    );
});

// ============ АКТИВАЦИЯ ============
self.addEventListener('activate', (event) => {
    console.log('🔄 Service Worker активирован');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_VERSION && 
                        cacheName !== CACHE_ASSETS && 
                        cacheName !== CACHE_IMAGES) {
                        console.log('🗑️ Удаление старого кэша:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// ============ FETCH (ПЕРЕХВАТ ЗАПРОСОВ) ============
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Игнорировать не-GET запросы
    if (request.method !== 'GET') {
        return;
    }

    // Стратегия "Cache first, Network fallback" для статических ресурсов
    if (url.pathname.endsWith('.js') || 
        url.pathname.endsWith('.css') ||
        url.pathname.endsWith('.woff') ||
        url.pathname.endsWith('.woff2')) {
        
        event.respondWith(
            caches.open(CACHE_ASSETS).then((cache) => {
                return cache.match(request).then((response) => {
                    if (response) {
                        return response;
                    }
                    return fetch(request).then((networkResponse) => {
                        cache.put(request, networkResponse.clone());
                        return networkResponse;
                    }).catch(() => {
                        return new Response('Ошибка загрузки ресурса', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
                });
            })
        );
        return;
    }

    // Стратегия "Network first, Cache fallback" для HTML и API
    if (url.pathname.endsWith('.html') || 
        url.pathname.includes('/data/') ||
        request.url.includes('github.com')) {
        
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse.status === 200) {
                        const cache = caches.open(CACHE_VERSION);
                        cache.then((c) => c.put(request, networkResponse.clone()));
                    }
                    return networkResponse;
                })
                .catch(() => {
                    return caches.match(request).then((cachedResponse) => {
                        if (cachedResponse) {
                            return cachedResponse;
                        }
                        return new Response('Вы оффлайн. Используйте кэшированные данные.', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
                })
        );
        return;
    }

    // Для изображений: стратегия "Cache first"
    if (request.destination === 'image') {
        event.respondWith(
            caches.open(CACHE_IMAGES).then((cache) => {
                return cache.match(request).then((response) => {
                    if (response) {
                        return response;
                    }
                    return fetch(request)
                        .then((networkResponse) => {
                            cache.put(request, networkResponse.clone());
                            return networkResponse;
                        })
                        .catch(() => {
                            return new Response(
                                '<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#ddd"/><text x="50" y="50" text-anchor="middle" dy=".3em" fill="#999" font-size="12">No Image</text></svg>',
                                { headers: { 'Content-Type': 'image/svg+xml' } }
                            );
                        });
                    });
                })
        );
        return;
    }

    // По умолчанию: Network first
    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response.status === 200) {
                    const cache = caches.open(CACHE_VERSION);
                    cache.then((c) => c.put(request, response.clone()));
                }
                return response;
            })
            .catch(() => {
                return caches.match(request).catch(() => {
                    return new Response('Вы оффлайн', {
                        status: 503,
                        statusText: 'Service Unavailable'
                    });
                });
            })
    );
});

// ============ СИНХРОНИЗАЦИЯ В ФОНЕ (Background Sync) ============
self.addEventListener('sync', (event) => {
    console.log('🔄 Background sync:', event.tag);
    
    if (event.tag === 'sync-news') {
        event.waitUntil(
            fetch('/data/news.json')
                .then((response) => response.json())
                .then((data) => {
                    // Сохранить в кэш
                    return caches.open(CACHE_VERSION).then((cache) => {
                        cache.put('/data/news.json', new Response(JSON.stringify(data)));
                    });
                })
                .catch((err) => {
                    console.log('❌ Ошибка синхронизации:', err);
                })
        );
    }
});

// ============ PUSH УВЕДОМЛЕНИЯ (для будущего) ============
self.addEventListener('push', (event) => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || '🚀 TechFlow';
    const options = {
        body: data.body || 'Новая новость!',
        icon: data.icon || '🚀',
        badge: data.badge || '📰',
        tag: 'news-notification',
        requireInteraction: false
    };

    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

// ============ КЛИК НА УВЕДОМЛЕНИЕ ============
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
            // Если окно уже открыто, переключиться на него
            for (let i = 0; i < clientList.length; i++) {
                if (clientList[i].url === '/' && 'focus' in clientList[i]) {
                    return clientList[i].focus();
                }
            }
            // Иначе открыть новое окно
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
    );
});

console.log('✅ Service Worker скрипт загружен');
