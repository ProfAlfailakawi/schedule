/**
 * ── سكربتُ الإعلان والنبض: ملفٌّ واحد يخدم كل الصفحات ─────────────────────────────
 *
 * يُقدَّم من `/_ads/ad.js` ويُحمَّل في الصفحات العامة بنونس الصفحة نفسها (فلا يُضعف
 * سياسة CSP الصارمة) وفي تطبيق الكادر بوسم script عادي. يفعل شيئين مستقلين:
 *
 *   النبض   data-pulse="me|schedule|status|survey|staff|app"
 *           زيارةٌ مجهولة واحدة في اليوم لكل نوع صفحة وكل متصفح، بلا هوية ولا عنوان.
 *   الإعلان data-slot="me|schedule|status|dashboard" مع عنصرٍ #adx في الصفحة، ويُعرَض `window.AdxMount(el, slot)`
 *           لصفحةٍ تُركِّب موقعاً بنفسها (محطة الاستراحة داخل «تذكرتي» في «مساري»)،
 *           يتناوب بين حملات الموقع، ويحتسب الظهور بعد ثانيةٍ من الرؤية الفعلية.
 *
 * ثوابت: لا innerHTML بنصٍّ قادمٍ من الخادم، ولا مكتباتٍ، ولا تتبّعَ خارج هذا الأصل،
 * ويحترم «تقليل الحركة»، وفيه زرُّ إيقافٍ للتبديل التلقائي (WCAG 2.2.2).
 */
export const AD_CLIENT_SCRIPT = String.raw`(function(){
"use strict";
var me=document.currentScript;if(!me)return;
var slot=me.getAttribute("data-slot")||"",pulse=me.getAttribute("data-pulse")||"";
var ls=null;try{ls=window.localStorage;ls.setItem("adx:t","1");ls.removeItem("adx:t")}catch(e){ls=null}
function get(k){try{return ls?ls.getItem(k):null}catch(e){return null}}
function put(k,v){try{if(ls)ls.setItem(k,v)}catch(e){}}
var day=new Date(Date.now()+10800000).toISOString().slice(0,10);
function post(url,obj,beacon){
 var body=JSON.stringify(obj);
 try{
  if(beacon&&navigator.sendBeacon&&navigator.sendBeacon(url,new Blob([body],{type:"application/json"})))return;
  fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:body,keepalive:true,credentials:"omit"}).catch(function(){});
 }catch(e){}
}
var mobile=/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent||"")||(window.matchMedia&&window.matchMedia("(max-width: 820px)").matches);

/* هويّة الرابط العام: يعرف بها الخادمُ نوعَ الصفحة الحقيقي (الصفحة الواحدة قد تخدم أنواعاً) وكليتَها. */
var tm=location.pathname.match(/^\/(?:s|t|m)\/([^\/?#]+)/),tok="";
try{tok=tm?decodeURIComponent(tm[1]):""}catch(e){tok=""}

if(pulse){
 var pk="adx:p:"+pulse;
 if(get(pk)!==day){
  var first=get("adx:first");put(pk,day);if(!first)put("adx:first",day);
  post("/_pulse",{k:pulse,r:first&&first<day?1:0,m:mobile?1:0,t:tok||undefined});
 }
 window.addEventListener("appinstalled",function(){post("/_pulse",{k:"install"})});
}

if(!document.getElementById("adx-css")){
 var css=document.createElement("style");css.id="adx-css";
 css.textContent=
 ".adx{display:none;max-width:640px;margin:18px auto;padding:0 16px;box-sizing:border-box;font-family:inherit}"+
 ".adx.on{display:block}"+
 ".adx .adx-main,.adx .adx-sp{position:relative;border-radius:14px;overflow:hidden;border:1px solid rgba(127,127,127,.28);background:rgba(127,127,127,.08)}"+
 ".adx .adx-sp{margin-bottom:8px;border-radius:12px}"+
 ".adx .adx-stage{position:relative;width:100%}"+
 ".adx .adx-slide{position:absolute;inset:0;display:block;opacity:0;pointer-events:none;transition:opacity .45s ease}"+
 ".adx .adx-slide.cur{opacity:1;pointer-events:auto}"+
 ".adx img{display:block;width:100%;height:100%;object-fit:cover}"+
 ".adx .adx-tag{position:absolute;top:8px;inset-inline-start:8px;padding:2px 9px;border-radius:999px;background:rgba(0,0,0,.62);color:#fff;font-size:11px;line-height:1.6;z-index:2;letter-spacing:.02em}"+
 ".adx .adx-bar{display:flex;align-items:center;justify-content:center;gap:10px;padding:7px 10px 2px;min-height:22px}"+
 ".adx .adx-dots{display:flex;gap:6px}"+
 ".adx .adx-dot{inline-size:8px;block-size:8px;padding:0;border:0;border-radius:50%;background:rgba(127,127,127,.45);cursor:pointer}"+
 ".adx .adx-dot.cur{background:rgba(127,127,127,.95);inline-size:18px;border-radius:6px}"+
 ".adx .adx-pp{border:0;background:transparent;color:inherit;font-size:12px;opacity:.7;cursor:pointer;padding:2px 6px}"+
 ".adx .adx-coupon{display:inline-block;margin:6px 0 0;padding:4px 12px;border-radius:999px;border:1px dashed rgba(127,127,127,.55);font-size:13px;user-select:all;-webkit-user-select:all}"+
 ".adx .adx-note{margin:4px 0 0;text-align:center;font-size:11px;opacity:.6}"+
 ".adx .adx-foot{text-align:center}"+
 "@media (prefers-reduced-motion:reduce){.adx .adx-slide{transition:none}}"+
 ".adx-intro{margin:0 0 6px;font-size:13px;opacity:.85;text-align:start}"+
 ".adx.brk{margin:10px 0 0;padding:0;max-width:none}.adx.brk .adx-note{margin-bottom:0}"+
 "@media print{.adx{display:none!important}}";
 document.head.appendChild(css);
}

function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n}
var queue=[],timer=0;
function flush(beacon){
 if(timer){clearTimeout(timer);timer=0}
 if(!queue.length)return;
 var batch=queue.splice(0,20);post("/_ads/e",{e:batch},beacon);
 if(queue.length)timer=setTimeout(function(){flush(false)},800);
}
function record(it){
 var uk="adx:u:"+it.c+":"+day,nk="adx:n:"+it.c+":"+day;
 var u=get(uk)?0:1;if(u)put(uk,"1");
 put(nk,String((parseInt(get(nk)||"0",10)||0)+1));
 queue.push({c:it.c,k:it.k,u:u});
 if(!timer)timer=setTimeout(function(){flush(false)},1500);
}
window.addEventListener("pagehide",function(){flush(true)});
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden")flush(true)});

function link(it,w,h){
 var a=el("a","adx-slide");
 a.href=it.href;a.target="_blank";a.rel="sponsored noopener noreferrer";
 a.setAttribute("aria-label",it.alt);
 var i=document.createElement("img");i.src=it.img;i.alt=it.alt;i.width=w;i.height=h;i.decoding="async";
 a.appendChild(i);return a;
}
function stage(items,w,h,auto,wrap){
 var st=el("div","adx-stage");st.style.aspectRatio=w+" / "+h;
 var slides=items.map(function(it,idx){var a=link(it,w,h);if(idx===0)a.classList.add("cur");else a.setAttribute("aria-hidden","true");a.tabIndex=idx===0?0:-1;st.appendChild(a);return a});
 var state={cur:0,inView:false,paused:!auto,counted:{},t:0};
 function arm(){
  if(state.t){clearTimeout(state.t);state.t=0}
  var idx=state.cur;
  if(state.counted[idx]||!state.inView||document.hidden)return;
  state.t=setTimeout(function(){state.t=0;if(state.inView&&!document.hidden&&state.cur===idx&&!state.counted[idx]){state.counted[idx]=1;var pk=items[idx].c+"|"+items[idx].k;if(PV[pk])return;PV[pk]=1;record(items[idx])}},1000);
 }
 function show(n){
  n=(n+items.length)%items.length;if(n===state.cur)return;
  slides[state.cur].classList.remove("cur");slides[state.cur].setAttribute("aria-hidden","true");slides[state.cur].tabIndex=-1;
  state.cur=n;slides[n].classList.add("cur");slides[n].removeAttribute("aria-hidden");slides[n].tabIndex=0;
  if(state.onShow)state.onShow(n);arm();
 }
 if("IntersectionObserver" in window){
  new IntersectionObserver(function(es){es.forEach(function(e){state.inView=e.isIntersecting&&e.intersectionRatio>=0.5;arm()})},{threshold:[0,.5,1]}).observe(st);
 }else state.inView=true;
 document.addEventListener("visibilitychange",arm);
 wrap.addEventListener("pointerenter",function(){state.hover=true});
 wrap.addEventListener("pointerleave",function(){state.hover=false});
 wrap.addEventListener("focusin",function(){state.hover=true});
 wrap.addEventListener("focusout",function(){state.hover=false});
 wrap.addEventListener("touchstart",function(){state.touched=Date.now()},{passive:true});
 if(items.length>1&&auto){
  setInterval(function(){
   if(state.paused||state.hover||document.hidden||(state.touched&&Date.now()-state.touched<12000))return;
   show(state.cur+1);
  },state.every||9000);
 }
 state.show=show;state.slides=slides;
 return {el:st,state:state};
}

var PV={};
function mount(box,slot,opt){
if(!box||!slot)return;
box.classList.add("adx");
fetch("/_ads/serve?slot="+encodeURIComponent(slot)+(tok?"&t="+encodeURIComponent(tok):""),{credentials:"omit",cache:"no-store"})
.then(function(r){return r.ok?r.json():null})
.then(function(d){
 if(!d)return;
 var day2=day,items=(d.items||[]).filter(function(it){return (parseInt(get("adx:n:"+it.c+":"+day2)||"0",10)||0)<40});
 if(!items.length)items=d.items||[];
 var sponsor=d.sponsor||null;
 if(!items.length&&!sponsor)return;
 box.textContent="";
 if(opt&&opt.intro){box.classList.add("brk");box.appendChild(el("p","adx-intro",opt.intro))}
 if(sponsor){
  var sp=el("div","adx-sp"),ss=stage([sponsor],sponsor.w,sponsor.h,false,sp);
  sp.appendChild(el("span","adx-tag","برعاية"));sp.appendChild(ss.el);box.appendChild(sp);
 }
 if(items.length){
  var w0=items[0].w,h0=items[0].h;
  var reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var main=el("div","adx-main"),auto=items.length>1&&!reduce;
  var st=stage(items,w0,h0,auto,main);
  st.state.every=d.rotateMs||9000;
  main.appendChild(el("span","adx-tag","إعلان"));main.appendChild(st.el);box.appendChild(main);
  if(items.length>1){
   var bar=el("div","adx-bar"),dots=el("div","adx-dots");
   var dotEls=items.map(function(it,i){var b=el("button","adx-dot"+(i===0?" cur":""));b.type="button";b.setAttribute("aria-label","الإعلان "+(i+1)+" من "+items.length);b.addEventListener("click",function(){st.state.paused=true;pp.textContent="تشغيل";st.state.show(i)});dots.appendChild(b);return b});
   var pp=el("button","adx-pp",auto?"إيقاف":"تشغيل");pp.type="button";
   pp.setAttribute("aria-label","إيقاف أو تشغيل تبديل الإعلانات");
   pp.addEventListener("click",function(){st.state.paused=!st.state.paused;pp.textContent=st.state.paused?"تشغيل":"إيقاف"});
   st.state.onShow=function(n){dotEls.forEach(function(b,i){b.classList.toggle("cur",i===n)})};
   bar.appendChild(dots);bar.appendChild(pp);box.appendChild(bar);
  }
  var foot=el("div","adx-foot"),shown=function(n){
   foot.textContent="";var it=items[n];
   if(it.coupon){var c=el("span","adx-coupon");c.textContent="كود الخصم: "+it.coupon;foot.appendChild(c)}
  };
  shown(0);box.appendChild(foot);
  var prev=st.state.onShow;st.state.onShow=function(n){if(prev)prev(n);shown(n)};
  var note=el("p","adx-note"),why=el("a",null,"كيف نقيس؟");note.appendChild(document.createTextNode("نقيس عدد المشاهدات والنقرات دون تتبّع هويتك. "));why.href="/measurement";why.target="_blank";why.rel="noopener";why.style.color="inherit";note.appendChild(why);box.appendChild(note);
 }
 box.classList.add("on");
}).catch(function(){});
}
window.AdxMount=function(box,slot,opt){try{mount(box,slot,opt)}catch(e){}};
if(slot)mount(document.getElementById("adx"),slot);
/* صفحةٌ طلبت تركيب موقعٍ قبل أن يجهز هذا السكربت (محطة الاستراحة): نُنفّذ الطلبات المؤجَّلة إن كان عنصرها ما زال في الصفحة. */
var pend=window.__adxPending;window.__adxPending=null;
if(pend&&pend.length)pend.forEach(function(a){if(a&&a[0]&&document.documentElement.contains(a[0]))window.AdxMount(a[0],a[1],a[2])});
})();
`;
