import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/refinement.css";

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

document.addEventListener("input",(event)=>{
  const target=event.target as HTMLInputElement|HTMLTextAreaElement|null;
  if(!target||!(target instanceof HTMLInputElement||target instanceof HTMLTextAreaElement))return;
  const normalized=toEnglishDigits(target.value);
  if(normalized!==target.value)target.value=normalized;
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

const customFetch = ((input:RequestInfo|URL,init?:RequestInit)=>{
  const method=String(init?.method||((typeof Request!=="undefined"&&input instanceof Request)?input.method:"GET")).toUpperCase();
  const rawUrl=typeof input==="string"?input:input instanceof URL?input.href:input.url;
  const url=new URL(rawUrl,window.location.origin);
  const isApi=url.origin===window.location.origin&&url.pathname.startsWith("/api/");
  const isWrite=!( ["GET","HEAD","OPTIONS"].includes(method) );
  if(isApi&&isWrite&&!navigator.onLine){
    return Promise.resolve(new Response(JSON.stringify({error:"أنت الآن دون اتصال. بقيت آخر البيانات المتاحة للقراءة، لكن الحفظ والنشر والتعديل متوقفون لحماية الجدول."}),{status:503,statusText:"Offline write blocked",headers:{"Content-Type":"application/json; charset=utf-8","X-Schedule-Offline":"1"}}));
  }
  return nativeFetch(input as any,init).then(async response=>{
    if(!isApi)return response;
    const contentType=response.headers.get("content-type")||"";
    if(!contentType.includes("application/json"))return response;
    try{
      const raw=await response.clone().json();
      const data=normalizePayload(raw);
      const headers=new Headers(response.headers);headers.set("Content-Type","application/json; charset=utf-8");headers.set("X-Schedule-English-Digits","1");
      if(response.ok)return new Response(JSON.stringify(data),{status:response.status,statusText:response.statusText,headers});
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

createRoot(document.getElementById("root")!).render(<StrictMode><App/></StrictMode>);
if ("serviceWorker" in navigator && import.meta.env.PROD) window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>undefined));
