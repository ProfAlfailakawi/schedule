import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary.tsx";
import {safeStorage} from "./utils/safeStorage";
import "./index.css";

// Global safety layer for the existing application. It never changes successful online
// responses; it only blocks writes while offline and softens unexpected infrastructure
// errors into a message a scheduling coordinator can act on.
const nativeFetch=window.fetch.bind(window);
const toEnglishDigits=(value:string)=>String(value||"")
  .replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
const normalizePayload=(value:any):any=>{
  if(typeof value==="string")return toEnglishDigits(value);
  if(Array.isArray(value))return value.map(normalizePayload);
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalizePayload(v)]));
  return value;
};

/**
 * Arabic-Indic digits are rewritten to ASCII as they are typed, because every
 * comparison in the product — times, civil IDs, codes — is done on ASCII.
 *
 * Rewriting `value` on its own is not enough. React remembers the last value it
 * saw on each field; assigning `value` updates that memory too, so React would
 * conclude nothing had changed and never run the field's onChange. The field
 * would then show the typed text while the component's state stayed empty —
 * the text looks accepted and is silently lost on save. Restoring React's
 * memory to the pre-edit value keeps the change visible to React, and the caret
 * is put back because assigning `value` sends it to the end of the field.
 */
document.addEventListener("input",(event)=>{
  const target=event.target as HTMLInputElement|HTMLTextAreaElement|null;
  if(!target||!(target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement))return;
  const original=target.value;
  const normalized=toEnglishDigits(original);
  if(normalized===original)return;
  const start=target.selectionStart,end=target.selectionEnd;
  target.value=normalized;
  const tracker=(target as any)._valueTracker;
  if(tracker&&typeof tracker.setValue==="function")tracker.setValue(original);
  if(start!==null&&end!==null){
    try{target.setSelectionRange(start,end)}catch{/* number/date fields reject selection */}
  }
},true);

const friendlyInfrastructureError=(text:string,status:number)=>{
  const value=String(text||"").trim();
  if(!value)return status>=500?"تعذر إكمال العملية بسبب مشكلة مؤقتة في الخادم. لم يتم اعتماد أي تغيير؛ أعد المحاولة بعد التحقق من الاتصال.":"تعذر إكمال العملية. راجع البيانات ثم أعد المحاولة.";
  // Preserve Arabic validation/business-rule messages returned by the application itself.
  if(/[\u0600-\u06FF]/.test(value))return value;
  if(/Failed to fetch|NetworkError|ECONN|ENOTFOUND|ETIMEDOUT|socket|network/i.test(value))return"تعذر الاتصال بالخادم. تحقق من الإنترنت ثم أعد المحاولة؛ لم يتم اعتماد أي تغيير.";
  if(/Firebase|Firestore|database|SQL|internal server|stack|TypeError|ReferenceError|SyntaxError/i.test(value)||status>=500)return"تعذر إكمال العملية بسبب مشكلة مؤقتة في الخادم. بياناتك الحالية لم تُعتمد كتغيير جديد؛ أعد المحاولة، وإذا تكرر الأمر راجع سجل التغييرات.";
  if(status===401)return"انتهت جلسة الدخول أو لم تعد صالحة. سجّل الدخول من جديد ثم أعد المحاولة.";
  if(status===403)return"هذه العملية خارج صلاحيات حسابك أو نطاق قسمك.";
  if(status===404)return"تعذر العثور على الجزء المطلوب. تأكد من رفع ملفات التحديث كاملة مع الحفاظ على المسارات.";
  return value;
};

// Catalogue reads are identical across screens and change only when someone
// edits them. Holding them briefly in memory removes most of the network wait
// when moving between the schedule, the query centre and the academic screens.
const CATALOGUE=/^\/api\/(colleges|sections|terms|instructors|courses|rooms|form-names)(\/|\?|$)/;
const CATALOGUE_TTL_MS=45_000;
const catalogueCache=new Map<string,{at:number;body:string;status:number;headers:Headers}>();
const clearCatalogueCache=()=>catalogueCache.clear();

const customFetch = ((input:RequestInfo|URL,init?:RequestInit)=>{
  const method=String(init?.method||((typeof Request!=="undefined"&&input instanceof Request)?input.method:"GET")).toUpperCase();
  const rawUrl=typeof input==="string"?input:input instanceof URL?input.href:input.url;
  const url=new URL(rawUrl,window.location.origin);
  const isApi=url.origin===window.location.origin&&url.pathname.startsWith("/api/");
  const isWrite=!( ["GET","HEAD","OPTIONS"].includes(method) );
  if(isApi&&isWrite&&!navigator.onLine){
    return Promise.resolve(new Response(JSON.stringify({error:"أنت الآن دون اتصال. بقيت آخر البيانات المتاحة للقراءة، لكن الحفظ والنشر والتعديل متوقفون لحماية الجدول."}),{status:503,statusText:"Offline write blocked",headers:{"Content-Type":"application/json; charset=utf-8","X-Schedule-Offline":"1"}}));
  }
  const cacheKey=isApi&&method==="GET"&&CATALOGUE.test(url.pathname)?url.pathname+url.search:null;
  if(cacheKey){
    const hit=catalogueCache.get(cacheKey);
    if(hit&&Date.now()-hit.at<CATALOGUE_TTL_MS){
      return Promise.resolve(new Response(hit.body,{status:hit.status,headers:new Headers(hit.headers)}));
    }
  }
  return nativeFetch(input as any,init).then(async response=>{
    if(!isApi)return response;
    // Any successful write can invalidate any catalogue read.
    if(isWrite&&response.ok)clearCatalogueCache();
    const contentType=response.headers.get("content-type")||"";
    if(!contentType.includes("application/json"))return response;
    try{
      const raw=await response.clone().json();
      const data=normalizePayload(raw);
      const headers=new Headers(response.headers);headers.set("Content-Type","application/json; charset=utf-8");headers.set("X-Schedule-English-Digits","1");
      if(response.ok){
        const body=JSON.stringify(data);
        if(cacheKey)catalogueCache.set(cacheKey,{at:Date.now(),body,status:response.status,headers:new Headers(headers)});
        return new Response(body,{status:response.status,statusText:response.statusText,headers});
      }
      if(!data||typeof data.error!=="string")return response;
      const error=friendlyInfrastructureError(data.error,response.status);
      headers.set("X-Schedule-Friendly-Error","1");
      return new Response(JSON.stringify({...data,error}),{status:response.status,statusText:response.statusText,headers});
    }catch{return response}
  });
}) as typeof window.fetch;

try {
  const desc = Object.getOwnPropertyDescriptor(window, "fetch") || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), "fetch");
  if (!desc || desc.configurable !== false) {
    Object.defineProperty(window, "fetch", {
      value: customFetch,
      configurable: true,
      writable: true,
      enumerable: true
    });
  } else {
    console.warn("window.fetch is not configurable, skipping override to prevent browser exception.");
  }
} catch (e) {
  console.warn("Could not override window.fetch:", e);
}

/**
 * Self-heal after a release.
 *
 * The screens are code-split, so an open tab (or a shell held by the service
 * worker) can still be pointing at the previous build's file names. Those files
 * are gone the moment a new version is published, and the tab would sit on a
 * blank page until someone thought to hard-refresh. Instead: drop the caches,
 * unregister the worker and reload — once. The guard makes a genuinely broken
 * build fail visibly rather than spin.
 */
const RECOVERY_KEY="schedule-chunk-recovery";
const recoverFromStaleBuild=async()=>{
  if(safeStorage.get(RECOVERY_KEY,"session"))return;
  safeStorage.set(RECOVERY_KEY,"1","session");
  try{
    if("caches" in window){const keys=await caches.keys();await Promise.all(keys.map(key=>caches.delete(key)))}
    const registrations=await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((registrations||[]).map(registration=>registration.unregister()));
  }catch{/* a blocked cache API must not stop the reload */}
  window.location.reload();
};
window.addEventListener("vite:preloadError",event=>{event.preventDefault();void recoverFromStaleBuild()});
window.addEventListener("error",event=>{
  const message=String((event as ErrorEvent).message||"");
  if(/Loading chunk|Importing a module script failed|dynamically imported module|Failed to fetch dynamically/i.test(message))void recoverFromStaleBuild();
});
// A clean start clears the guard, so the next release can heal itself too.
window.addEventListener("load",()=>{window.setTimeout(()=>safeStorage.remove(RECOVERY_KEY,"session"),4000)});

const container=document.getElementById("root")!;
createRoot(container).render(<StrictMode><ErrorBoundary><App/></ErrorBoundary></StrictMode>);

// Tell the document-level boot guard that the screen is alive. It waits for a
// real paint rather than for render() to return, because React commits later.
const announceBoot=()=>{
  if(container.childElementCount>0){(window as any).__scheduleBooted?.();return}
  requestAnimationFrame(announceBoot);
};
requestAnimationFrame(announceBoot);

if ("serviceWorker" in navigator && import.meta.env.PROD) window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>undefined));
