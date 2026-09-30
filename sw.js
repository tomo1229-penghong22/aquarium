// Service Worker:全ファイルを事前キャッシュして、オフラインでも起動できるようにする。
// 更新するとき(js/・index.html・icons/ などを変えたとき)は、CACHE_VERSION を上げること。
// 新しいファイルを足したときは PRECACHE にも足すこと(tests/smoke.mjs が漏れを検出する)。
const CACHE_VERSION = "v1";
const CACHE = `aquarium-${CACHE_VERSION}`;
const FONT_CACHE = "aquarium-fonts"; // Google Fonts の実行時キャッシュ。バージョンを上げても消さない
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./js/core.js",
  "./js/fish-behavior.js",
  "./js/fish-render.js",
  "./js/main.js",
  "./js/popup.js",
  "./js/scene.js",
  "./js/species.js",
  "./js/ui.js",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];
const FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("aquarium-") && k !== CACHE && k !== FONT_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Google Fonts:stale-while-revalidate。オフラインで未取得なら失敗させる(フォールバックフォントで表示)
  if (FONT_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(FONT_CACHE).then(async cache => {
      const hit = await cache.match(req);
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
        return res;
      });
      if (hit) { net.catch(() => {}); return hit; }
      return net;
    }));
    return;
  }

  // 同一オリジン:キャッシュ優先、なければネットワーク。ナビゲーションは最後に index.html を返す
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req)).catch(() =>
        req.mode === "navigate" ? caches.match("./index.html") : Response.error())
    );
  }
});
