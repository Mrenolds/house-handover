// Keeps the builder app usable with no signal: app files and the Firebase
// SDK are cached; data sync is handled by Firestore's own offline cache.
const CACHE = "handover-v9";
const APP = [
  "./", "index.html", "css/style.css",
  "js/builder.js", "js/common.js", "js/checklist.js", "js/config.js", "js/photos.js",
];
const SDK = "https://www.gstatic.com/firebasejs/11.0.2/";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = e.request.url;
  if (e.request.method !== "GET") return;
  const sameOrigin = url.startsWith(self.location.origin);
  if (!sameOrigin && !url.startsWith(SDK)) return; // Firebase API calls go straight to the network
  // Network first (so updates arrive), cache as fallback when offline.
  // no-cache: always ask the server for the newest file (GitHub Pages otherwise lets
  // browsers reuse files for 10 minutes); the cached copy is only used offline.
  e.respondWith(fetch(e.request, { cache: "no-cache" }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
