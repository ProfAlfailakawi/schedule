import { telemetryBreadcrumb, telemetryError, telemetrySync } from "./clientTelemetry";

type QueuedMutation = { id:string; at:string; method:"POST"|"PUT"|"DELETE"; url:string; body?:any };
const STORE="schedule-offline-mutations-v1";
const REVIEW_STORE="schedule-offline-review-v1";
let ownerId=0;
const listeners=new Set<(count:number)=>void>();
const storeKey=()=>`${STORE}:${ownerId||"anonymous"}`;
const reviewKey=()=>`${REVIEW_STORE}:${ownerId||"anonymous"}`;

const read=():QueuedMutation[]=>{try{const raw=localStorage.getItem(storeKey());const value=raw?JSON.parse(raw):[];return Array.isArray(value)?value:[]}catch{return[]}};
const write=(items:QueuedMutation[])=>{try{localStorage.setItem(storeKey(),JSON.stringify(items.slice(-120)))}catch{};listeners.forEach(fn=>fn(items.length));};
/**
 * ── الرفّ الذي لم يكن أحد يقرؤه ─────────────────────────────────────────────
 *
 * A change made offline that the server later refuses — a clash it can now
 * see, a row deleted meanwhile, a value it will not accept — is taken out of
 * the sync queue and written here. That decision is right: the alternative is
 * a queue that retries a doomed write forever and a counter that never clears.
 *
 * But the shelf had no reader. Nothing in the product opened this key, so the
 * pending counter dropped to zero, the person was told sync had finished, and
 * their change sat in browser storage that nobody would ever look at until it
 * fell off the end of the list. The message promised a review that did not
 * exist anywhere.
 *
 * These three functions are that review: what is on the shelf, put one back,
 * and let one go.
 */
export type ParkedMutation = QueuedMutation & { reviewReason:string; reviewAt:string };
const readParked=():ParkedMutation[]=>{try{const raw=localStorage.getItem(reviewKey());const value=raw?JSON.parse(raw):[];return Array.isArray(value)?value:[]}catch{return[]}};
const writeParked=(items:ParkedMutation[])=>{try{localStorage.setItem(reviewKey(),JSON.stringify(items.slice(-120)))}catch{};parkedListeners.forEach(fn=>fn(items.length));};
const parkedListeners=new Set<(count:number)=>void>();
const parkForReview=(item:QueuedMutation,reason:string)=>{
  writeParked([...readParked(),{...item,reviewReason:reason,reviewAt:new Date().toISOString()}]);
};

/** Everything the server refused, newest last, exactly as it was sent. */
export function parkedMutations():ParkedMutation[]{return readParked();}
export function parkedCount(){return readParked().length;}
export function subscribeParkedMutations(fn:(count:number)=>void){parkedListeners.add(fn);fn(readParked().length);return()=>parkedListeners.delete(fn);}
/** Let one go. The change is abandoned; nothing is sent. */
export function discardParkedMutation(id:string){writeParked(readParked().filter(item=>item.id!==id));}
/**
 * Send one again, now, as itself.
 *
 * It is not put back in the offline queue: the queue is for work waiting on a
 * connection, and this is a person deciding to try again with one in hand. A
 * second refusal returns its reason so the shelf can say what happened this
 * time rather than silently keeping the row.
 */
export async function retryParkedMutation(id:string):Promise<{ok:boolean;error?:string}>{
  const item=readParked().find(entry=>entry.id===id);
  if(!item)return{ok:false,error:"لم يعد هذا التغيير موجوداً"};
  try{
    const response=await fetch(item.url,{method:item.method,credentials:"include",
      headers:item.body?{"Content-Type":"application/json"}:undefined,
      body:item.body?JSON.stringify(item.body):undefined});
    if(response.ok){discardParkedMutation(id);telemetrySync("offline.review.retry",true,item.url);return{ok:true};}
    const detail=await response.json().catch(()=>({} as any));
    const error=String(detail?.error||`تعذر الإرسال (HTTP ${response.status})`);
    writeParked(readParked().map(entry=>entry.id===id?{...entry,reviewReason:error,reviewAt:new Date().toISOString()}:entry));
    telemetrySync("offline.review.retry",false,error);
    return{ok:false,error};
  }catch(error:any){
    telemetryError("offline.review.retry",error);
    return{ok:false,error:error?.message||"تعذر الاتصال بالخادم"};
  }
}
const stableBody=(value:any)=>{try{return JSON.stringify(value??null,Object.keys(value||{}).sort())}catch{return String(value??"")}};
const uid=()=>`${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
const safeUrl=(url:string)=>/^\/api\/schedules\/move-batch(?:\?|$)/.test(url)||(/^\/api\/schedules\/\d+(?:\?|$)/.test(url));

export function setOfflineQueueOwner(userId:number){ownerId=Math.max(0,Number(userId)||0);listeners.forEach(fn=>fn(read().length));}
export function offlineQueueCount(){return read().length;}
export function subscribeOfflineQueue(fn:(count:number)=>void){listeners.add(fn);fn(read().length);return()=>listeners.delete(fn);}

export function canQueueScheduleMutation(url:string,method:string){
  return ["POST","PUT","DELETE"].includes(method.toUpperCase())&&safeUrl(url)&&!(method.toUpperCase()==="POST"&&!url.includes("move-batch"));
}

export function enqueueScheduleMutation(url:string,options:RequestInit){
  const method=String(options.method||"GET").toUpperCase() as QueuedMutation["method"];
  if(!canQueueScheduleMutation(url,method))return null;
  let body:any=undefined;
  try{body=typeof options.body==="string"?JSON.parse(options.body):options.body}catch{body=undefined}
  const queue=read();
  // Coalesce repeated PUTs for the same row while offline; the last local state is
  // the only one worth replaying. Move batches stay ordered because their revs matter.
  const key=method==="PUT"?`${method}:${url}`:"";
  let filtered=key?queue.filter(item=>`${item.method}:${item.url}`!==key):queue;
  const signature=`${method}:${url}:${stableBody(body)}`;
  filtered=filtered.filter(item=>`${item.method}:${item.url}:${stableBody(item.body)}`!==signature);
  const item={id:uid(),at:new Date().toISOString(),method,url,body};
  filtered.push(item);write(filtered);
  telemetryBreadcrumb(`معلّق محلياً: ${method} ${url}`);
  return item;
}

export function queuedPseudoResponse(item:QueuedMutation){
  if(item.method==="PUT"){
    const id=Number(item.url.match(/\/api\/schedules\/(\d+)/)?.[1]||0);
    return {...(item.body||{}),id,queuedOffline:true};
  }
  return {queuedOffline:true,id:item.id,rows:[]};
}

export async function flushOfflineScheduleQueue():Promise<{done:number;remaining:number;conflict?:boolean}> {
  if(!navigator.onLine)return{done:0,remaining:read().length};
  let queue=read(),done=0,conflict=false;
  while(queue.length){
    const item=queue[0];
    try{
      const response=await fetch(item.url,{method:item.method,credentials:"include",headers:item.body?{"Content-Type":"application/json"}:undefined,body:item.body?JSON.stringify(item.body):undefined});
      if(response.status===409){
        // Not "still syncing". Preserve it for explicit review, remove it from
        // the active pump, and continue with independent queued mutations so
        // one stale row can never pin the counter forever.
        //
        // 409 answers two different questions here — the row moved on since
        // this edit was made, and the placement now clashes with something —
        // and the shelf used to label both «revision conflict». Whoever opened
        // it read a cause that was not theirs, so the server's own sentence is
        // kept when it sends one.
        const detail=await response.json().catch(()=>({} as any));
        conflict=true;
        parkForReview(item,String(detail?.error||"تغيّر هذا الموعد أو صار متعارضاً أثناء انقطاع الاتصال"));
        queue.shift();write(queue);
        telemetrySync("offline.sync",false,"409 parked");continue;
      }
      // DELETE is idempotent. A stale PUT/DELETE to a row that no longer exists
      // is likewise terminal: preserve it for review instead of retrying forever.
      if(response.status===404&&(item.method==="PUT"||item.method==="DELETE")){
        parkForReview(item,`HTTP ${response.status}`);queue.shift();write(queue);
        telemetrySync("offline.sync",false,`HTTP ${response.status} parked`);continue;
      }
      // Validation failures will never heal through retry. Keep the payload in
      // the review shelf, drain the live queue, and let recoverable 5xx/network
      // failures remain pending for the next pump.
      if([400,401,403,410,422].includes(response.status)){
        parkForReview(item,`HTTP ${response.status}`);queue.shift();write(queue);
        telemetrySync("offline.sync",false,`HTTP ${response.status} parked`);continue;
      }
      if(!response.ok){
        telemetrySync("offline.sync",false,`HTTP ${response.status}`);break;
      }
      queue.shift();done++;write(queue);telemetrySync("offline.sync",true,item.url);
    }catch(error){telemetryError("offline.sync",error);break;}
  }
  return{done,remaining:queue.length,conflict};
}
