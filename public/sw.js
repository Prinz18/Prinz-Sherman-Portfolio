const CACHE_NAME = 'prinz-sherman-v7';
const assets = [
  '/',
  '/index.html',
  '/community.html',
  '/profile.html',
  '/projects/ludo.html',
  '/projects/checkers.html',
  '/projects/snake.html',
  '/projects/little-lemon.html',
  '/assets/css/styles.css',
  '/assets/css/snake.css',
  '/assets/js/presence.js',
  '/assets/images/prinzo.jpg',
  '/assets/images/my-photo.jpeg'
];

// Install: Cache essential assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Opened cache');
      return Promise.allSettled(
        assets.map(url => {
          return cache.add(url).catch(err => console.warn(`Failed to cache ${url}:`, err));
        })
      );
    })
  );
  self.skipWaiting();
});

// Activate: Clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      }));
    })
  );
});

// Fetch: Network-First strategy for HTML, Cache-First for others
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // IGNORE external API requests (AWS, Groq, Google, Spline) so they go straight to network
  if (url.hostname.includes('amazonaws.com') || 
      url.hostname.includes('groq.com') || 
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('spline.design')) {
    return; // Let the browser handle it normally
  }

  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    event.respondWith(
      caches.match(event.request).then(response => {
        return response || fetch(event.request).catch(err => {
          console.warn('Fetch failed in Service Worker:', event.request.url, err);
          // Return a fallback or just fail gracefully
          return null; 
        });
      })
    );
  }
});
