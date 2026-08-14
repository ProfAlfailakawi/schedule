const SHELL_CACHE="schedule-shell-v9";
const API_CACHE="schedule-api-v9";
/** One document answers every route in a single-page app. */
const APP_SHELL_KEY="/index.html";
const SHELL=["/manifest.webmanifest","/schedule-icon.svg","/schedule-icon-192.png","/schedule-icon-512.png","/fonts/plex-arabic-arabic-400.woff2","/fonts/plex-arabic-arabic-600.woff2","/fonts/plex-arabic-latin-400.woff2","/fonts/plex-arabic-latin-600.woff2","/fonts/plex-mono-latin-500.woff2"];
const CACHEABLE_API_PREFIXES=[
  "/api/dashboard","/api/colleges","/api/sections","/api/terms","/api/instructors","/api/courses","/api/schedules",
  "/api/intelligence/overview","/api/intelligence/drafts","/api/intelligence/versions","/api/intelligence/room","/api/intelligence/professor",
  "/api/audit-logs","/api/form-names","/api/admin-user-options"
];
const isCacheableApi=pathname=>CACHEABLE_API_PREFIXES.some(prefix=>pathname===prefix||pathname.startsWith(prefix+"/")||pathname.startsWith(prefix+"?"));
self.addEventListener("install",event=>{event.waitUntil(caches.open(SHELL_CACHE).then(async cache=>{
  await cache.addAll(SHELL).catch(()=>undefined);
  // Fetch the shell document once at install so the very first offline launch
  // already has a page to open, rather than waiting for a lucky online visit.
  try{const shell=await fetch("/",{cache:"no-store"});if(shell.ok)await cache.put(APP_SHELL_KEY,shell.clone());}catch{}
}).catch(()=>undefined));self.skipWaiting()});
self.addEventListener("activate",event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>![SHELL_CACHE,API_CACHE].includes(key)).map(key=>caches.delete(key)))));self.clients.claim()});
self.addEventListener("message",event=>{if(event.data?.type==="CLEAR_API_CACHE")event.waitUntil(caches.delete(API_CACHE));});
self.addEventListener("fetch",event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=="GET"||url.origin!==self.location.origin)return;
  if(url.pathname.startsWith("/api/")){
    // Never persist authentication responses or credential/admin-user payloads.
    if(url.pathname.startsWith("/api/auth/")||url.pathname==="/api/users"||!isCacheableApi(url.pathname))return;
    event.respondWith((async()=>{
      const cache=await caches.open(API_CACHE);
      try{
        const response=await fetch(request);
        if(response.ok&&response.headers.get("content-type")?.includes("application/json"))await cache.put(request,response.clone());
        return response;
      }catch{
        const hit=await cache.match(request);
        return hit||new Response(JSON.stringify({error:"لا يوجد اتصال ولا توجد نسخة محفوظة لهذه البيانات بعد."}),{status:503,headers:{"Content-Type":"application/json; charset=utf-8","X-Schedule-Offline":"1"}});
      }
    })());
    return;
  }
  // Navigation requests for HTML documents must always be served from network to avoid stale JS asset references.
  // But every successful document is kept under ONE key, so that going offline
  // has something real to fall back to. Previously the fallback searched for the
  // exact URL that was never stored, so it could only ever miss — an installed
  // app opened to a dead page while onboarding promised the opposite. The SPA
  // serves the same document on every route, so one copy answers every path.
  if(request.mode==="navigate"){
    event.respondWith(fetch(request,{cache:"no-store"}).then(response=>{
      if(response.ok)caches.open(SHELL_CACHE).then(cache=>cache.put(APP_SHELL_KEY,response.clone())).catch(()=>undefined);
      return response;
    }).catch(async()=>{
      const cache=await caches.open(SHELL_CACHE);
      const hit=await cache.match(APP_SHELL_KEY)||await cache.match(request);
      return hit||new Response("<html><body><h2 style='text-align:center;margin-top:50px;font-family:sans-serif'>لا يوجد اتصال بالإنترنت حالياً</h2></body></html>",{headers:{"Content-Type":"text/html; charset=utf-8"}});
    }));
    return;
  }
  event.respondWith((async()=>{
    const cache=await caches.open(SHELL_CACHE);
    try{
      const response=await fetch(request);
      if(response.ok)cache.put(request,response.clone()).catch(()=>undefined);
      return response;
    }catch{
      const hit=await cache.match(request);
      return hit||new Response("Not found",{status:404});
    }
  })());
});
