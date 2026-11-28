// Keeps the builder app usable with no signal: app files and the Firebase
// SDK are cached; data sync is handled by Firestore's own offline cache.
const CACHE = "handover-v13";
// App files are requested with a version (?v=N) and cached under that exact address the
// first time they load, so an old file can never be served for a new version.
const APP = ["./", "index.html"];
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
  // Ask the server for the newest file (no-cache), but if the network is slow and the
  // phone already has a copy, use that after 2.5 s; the fresh copy still updates the
  // cache in the background for next time.
  const network = fetch(e.request, { cache: "no-cache" }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
    return res;
  });
  e.respondWith((async () => {
    // Pages may carry extra ?r=… after a reset; versioned files must match exactly.
    const cached = await caches.match(e.request, { ignoreSearch: e.request.mode === "navigate" });
    if (!cached) return network;
    const timeout = new Promise((r) => setTimeout(() => r(cached), 2500));
    return Promise.race([network.catch(() => cached), timeout]);
  })());
});
