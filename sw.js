/* 駐輪場管理アプリ オフライン対応
   ------------------------------------------------------------------
   このファイルは、アプリの「控え」を端末の中に持っておく仕組みです。
   これがあると、電波が届かない場所でもアプリが起動します。

   【大事な決まりごと】
   index.html を直したら、必ず下の VERSION の数字を1つ増やしてください。
   増やし忘れると、古い控えが使われ続けて修正が反映されません。
   ------------------------------------------------------------------ */

const VERSION = "v2";
const CACHE = "parking-" + VERSION;

/* 起動に必要な一式。これだけ控えておけばアプリは動きます。 */
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-180.png",
  "./icon-512.png",
];

/* 控えを作る */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE)
      /* 1つでも取れないと全部失敗するので、個別に入れる */
      .then((cache) => Promise.all(
        SHELL.map((url) => cache.add(url).catch(() => null))
      ))
      .then(() => self.skipWaiting())   // 新しい版をすぐ使い始める
  );
});

/* 古い版の控えを捨てる */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((n) => n !== CACHE).map((n) => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

/* 通信を先に試し、だめなら控えを使う。
   通信が生きているのに遅い、という状況で待たされ続けないよう、
   一定時間で控えに切り替える。 */
function networkFirst(request, timeoutMs) {
  return new Promise((resolve) => {
    let answered = false;
    const answer = (res) => { if (!answered) { answered = true; resolve(res); } };

    const timer = setTimeout(() => {
      caches.match(request)
        .then((hit) => hit || caches.match("./index.html"))
        .then((hit) => { if (hit) answer(hit); });
    }, timeoutMs);

    fetch(request)
      .then((res) => {
        clearTimeout(timer);
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        answer(res);
      })
      .catch(() => {
        clearTimeout(timer);
        caches.match(request)
          .then((hit) => hit || caches.match("./index.html"))
          .then((hit) => answer(hit || Response.error()));
      });
  });
}

/* 控えを先に返し、裏で新しいものを取っておく */
function cacheFirst(request) {
  return caches.match(request).then((hit) => {
    const fresh = fetch(request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => null);

    if (hit) return hit;                      // 控えがあれば即返す
    return fresh.then((res) => res || Response.error());
  });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  /* 読み取り以外と、外部サイトへの通信には手を出さない */
  if (request.method !== "GET") return;
  let url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  const accept = request.headers.get("accept") || "";
  const isPage = request.mode === "navigate" || accept.indexOf("text/html") >= 0;

  /* アプリ本体は「通信優先」。こうしないと修正が永久に届かない。
     画像などは変わらないので「控え優先」で速さを取る。 */
  event.respondWith(isPage ? networkFirst(request, 3000) : cacheFirst(request));
});
