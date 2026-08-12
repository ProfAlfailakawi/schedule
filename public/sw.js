const SHELL_CACHE="schedule-shell-v5";
const API_CACHE="schedule-api-v5";
const SHELL=["/","/Home/Index","/manifest.webmanifest","/schedule-icon.svg","/schedule-icon-192.png","/schedule-icon-512.png","/fonts/plex-arabic-arabic-400.woff2","/fonts/plex-arabic-arabic-600.woff2","/fonts/plex-arabic-latin-400.woff2","/fonts/plex-arabic-latin-600.woff2","/fonts/plex-mono-latin-500.woff2"];
const CACHEABLE_API_PREFIXES=[
  "/api/dashboard","/api/colleges","/api/sections","/api/terms","/api/instructors","/api/courses","/api/schedules",
  "/api/intelligence/overview","/api/intelligence/drafts","/api/intelligence/versions","/api/intelligence/room","/api/intelligence/professor",
  "/api/audit-logs","/api/form-names","/api/admin-user-options"
];
const isCacheableApi=pathname=>CACHEABLE_API_PREFIXES.some(prefix=>pathname===prefix||pathname.startsWith(prefix+"/")||pathname.startsWith(prefix+"?"));
self.addEventListener("install",event=>{event.waitUntil(caches.open(SHELL_CACHE).then(cache=>cache.addAll(SHELL)).catch(()=>undefined));self.skipWaiting()});
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
  event.respondWith((async()=>{
    const cache=await caches.open(SHELL_CACHE);
    try{const response=await fetch(request);if(response.ok)cache.put(request,response.clone()).catch(()=>undefined);return response}catch{const hit=await cache.match(request);return hit||await cache.match("/Home/Index")||await cache.match("/")}
  })());
});
