const CACHE_NAME = 'wakil-app-v2';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
    'https://fonts.googleapis.com/css2?family=Tajawal:wght@300;500;700;900&display=swap'
];

// تثبيت الـ Service Worker وتخزين الملفات
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// تفعيل الـ Service Worker وتنظيف الكاش القديم
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        })
    );
});

// استراتيجية Cache First: جلب الملفات من الكاش أولاً، ثم الشبكة
self.addEventListener('fetch', (event) => {
    // استثناء طلبات الفايربيس من الكاش المباشر لأنها تدير نفسها
    if (event.request.url.includes('firestore') || event.request.url.includes('googleapis')) {
        return; 
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).catch(() => {
                // يمكن هنا وضع صفحة احتياطية إذا لزم الأمر
            });
        })
    );
});
