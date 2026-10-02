/**
 * ── عدّةُ الصفحات العامة ─────────────────────────────────────────────────────
 *
 * ما تتشاركه صفحتا الأستاذ العامتان (طلبُ الجدول /r/:token ومقترحُ القسم
 * /r/:token/proposal/:pid) وكان يُكتب مرّتين أو لا يُكتب:
 *
 *   1. ورقةُ التوقيع: رقمٌ مدنيّ واحد في ورقةٍ سفلية تقول ما سيُوقَّع عليه، ويبقى
 *      الرقمُ في ذاكرة الصفحة وحدها دقائقَ معدودة (لا في التخزين ولا في المسودة)
 *      فتكفي لمسةٌ للجولة التالية. والخادمُ يتحقق من الرقم في كل طلبٍ كما كان.
 *   2. الإشعارُ الصغير (toast) والورقةُ السفلية نفسُها.
 *   3. حقلُ الوقت: نصٌّ بأرقامٍ إنجليزية «HH:MM» بدل <input type="time"> الذي يرسمه
 *      المتصفحُ بأرقام الجهاز وبـ«ص/م»: على هاتفٍ عربيٍّ يعرض الأرقامَ الهندية.
 *   4. خطوطُ Plex بوجهيها العربي واللاتيني: الأرقامُ من الوجه اللاتيني، فتُرسم
 *      بخطّ العلامة لا بخطّ النظام.
 *
 * السكربتُ ES5 عادي، وكلُّ ما فيه تحت اسمٍ واحد (SK) فلا يصطدم بما في الصفحة.
 * ولا تُكتب هنا علامةُ الاقتباس المائلة ولا ‎${‎: النصُّ قالبٌ نصّي في الخادم.
 */

export const PUBLIC_FONT_FACES = ["400", "500", "600", "700"].map(w =>
  `@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:${w};font-display:swap;src:url("/fonts/plex-arabic-arabic-${w}.woff2") format("woff2")}` +
  `@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:${w};font-display:swap;unicode-range:U+0000-00FF,U+2000-206F;src:url("/fonts/plex-arabic-latin-${w}.woff2") format("woff2")}`,
).join("");

export const PUBLIC_KIT_CSS = `/* ── عدّة الصفحات العامة ── */
:root{--sk-ok:var(--ok,var(--accent));--sk-ok-s:var(--ok2,var(--accent-soft));--sk-ok-ink:var(--ok-ink,var(--accent-d,var(--ok)));--sk-bad:var(--bad);--sk-bad-s:var(--bad2,var(--bad-soft));--sk-soft:var(--soft);--sk-card:var(--card);--sk-ink:var(--ink);--sk-muted:var(--muted);--sk-line:var(--line);--sk-line2:var(--line2);--sk-warn-s:var(--warn2,var(--amber-soft,#fff4d6));--sk-warn:var(--warn,var(--amber,#85580a))}
.sk-gi{inline-size:20px;block-size:20px;flex:none;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;vertical-align:-.25em}
.sk-lock{overflow:hidden}
.sk-scrim{position:fixed;inset:0;z-index:60;background:rgba(10,24,17,.5);display:flex;align-items:flex-end;justify-content:center}
.sk-scrim[hidden]{display:none!important}
.sk-sheet{inline-size:min(100%,520px);max-block-size:90dvh;overflow:auto;background:var(--sk-card);color:var(--sk-ink);border-radius:28px 28px 0 0;padding:10px 18px calc(18px + env(safe-area-inset-bottom,0px));display:grid;gap:14px;animation:skup .3s cubic-bezier(.2,.8,.2,1)}
@keyframes skup{from{transform:translateY(48px);opacity:.6}to{transform:none;opacity:1}}
.sk-grab{inline-size:42px;block-size:5px;border-radius:5px;background:var(--sk-line);margin:0 auto}
.sk-h{display:flex;align-items:center;gap:12px}
.sk-b{inline-size:46px;block-size:46px;border-radius:15px;display:grid;place-items:center;background:var(--sk-ok-s);color:var(--sk-ok);flex:none}
.sk-b .sk-gi{inline-size:24px;block-size:24px}
.sk-h h3{margin:0;font-size:18px;line-height:1.4}.sk-h p{margin:0;font-size:13px;color:var(--sk-muted)}
.sk-what{display:grid;gap:8px;padding:12px 14px;border-radius:16px;background:var(--sk-soft);font-size:14px;line-height:1.6}
.sk-what>div{display:flex;align-items:center;gap:10px}.sk-what .sk-gi{color:var(--sk-ok)}
.sk-list{list-style:none;margin:0;padding:0;display:grid;gap:6px;font-size:13px;color:var(--sk-muted)}
.sk-list li{display:flex;gap:8px;align-items:baseline}.sk-list li::before{content:"";flex:none;inline-size:6px;block-size:6px;border-radius:50%;background:var(--sk-ok);transform:translateY(-2px)}
.sk-warn{display:flex;gap:9px;align-items:flex-start;padding:10px 12px;border-radius:14px;background:var(--sk-warn-s,#fff4d6);color:var(--sk-warn,#85580a);font-size:13px;line-height:1.6}
.sk-warn .sk-gi{margin-top:2px}
.sk-known{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:16px;background:var(--sk-ok-s);color:var(--sk-ok-ink);font-size:13px;line-height:1.5}
.sk-known .sk-link{margin-inline-start:auto;border:0;background:none;color:var(--sk-ok-ink);font:inherit;font-weight:700;text-decoration:underline;cursor:pointer;white-space:nowrap}
.sk-otpw{position:relative}
.sk-otp{display:flex;gap:4px;direction:ltr;justify-content:center}
.sk-otp i{flex:1;max-inline-size:30px;block-size:46px;border-radius:9px;border:1.5px solid var(--sk-line2);display:grid;place-items:center;font:600 17px/1 inherit;font-family:inherit;font-style:normal;font-variant-numeric:tabular-nums;background:var(--sk-card)}
.sk-otp i:nth-child(4n){margin-inline-end:6px}.sk-otp i:last-child{margin-inline-end:0}
.sk-otp i.on{border-color:var(--sk-ok);box-shadow:0 0 0 3px color-mix(in srgb,var(--sk-ok) 22%,transparent)}
.sk-otp i.fill{border-color:color-mix(in srgb,var(--sk-ok) 45%,var(--sk-line2))}
.sk-otpw input{position:absolute;inset:0;inline-size:100%;block-size:100%;opacity:0;font-size:16px;border:0;background:transparent;direction:ltr}
.sk-err{padding:10px 12px;border-radius:14px;background:var(--sk-bad-s);color:var(--sk-bad);font-size:13.5px;font-weight:600}
.sk-err[hidden]{display:none}
.sk-hint{margin:0;font-size:12px;color:var(--sk-muted);line-height:1.7;text-align:center}
.sk-priv{display:flex;align-items:center;gap:7px;justify-content:center;margin:0;font-size:12px;color:var(--sk-muted)}
.sk-priv .sk-gi{inline-size:15px;block-size:15px}
.sk-btn{display:flex;align-items:center;justify-content:center;gap:9px;inline-size:100%;min-block-size:56px;padding:10px 16px;border-radius:18px;border:0;background:var(--sk-ok);color:var(--sk-on,#fff);font:inherit;font-weight:700;font-size:17px;cursor:pointer;box-shadow:0 8px 20px color-mix(in srgb,var(--sk-ok) 30%,transparent)}
.sk-btn:active{transform:scale(.985)}
.sk-btn:disabled{opacity:.45;box-shadow:none;cursor:not-allowed}
.sk-lbl{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--sk-muted)}
.sk-lbl .sk-gi{inline-size:16px;block-size:16px}
.sk-pick{display:grid;grid-template-columns:repeat(var(--sk-cols,3),1fr);gap:8px}
.sk-pick button,.sk-times button{border:1.5px solid var(--sk-line);background:var(--sk-card);color:var(--sk-muted);border-radius:14px;padding:10px 4px;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;line-height:1.35}
.sk-pick button small{display:block;font-size:11px;font-weight:500;opacity:.8}
.sk-times{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}
.sk-times button{direction:ltr;font-variant-numeric:tabular-nums;font-size:14px;line-height:1;padding:11px 4px}
.sk-pick button[aria-pressed=true],.sk-times button[aria-pressed=true]{background:var(--sk-ok-s);border-color:var(--sk-ok);color:var(--sk-ok-ink)}
.sk-v{display:flex;align-items:center;gap:9px;padding:11px 13px;border-radius:14px;font-size:13.5px;font-weight:600;background:var(--sk-ok-s);color:var(--sk-ok-ink)}
.sk-v[data-t=bad]{background:var(--sk-bad-s);color:var(--sk-bad)}
.sk-sheet textarea{display:block;inline-size:100%;margin:0;min-block-size:96px;padding:12px;border-radius:16px;border:1.5px solid var(--sk-line2);background:var(--sk-card);color:var(--sk-ink);font:inherit;resize:vertical}
.sk-toast{position:fixed;inset-inline:16px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:70;max-inline-size:528px;margin:0 auto;display:flex;align-items:center;gap:10px;padding:13px 16px;border-radius:18px;background:var(--sk-toast-bg,#14231b);color:var(--sk-toast-fg,#e7f5ed);font-weight:600;font-size:14px;box-shadow:0 14px 40px rgba(0,0,0,.28);animation:skup .3s cubic-bezier(.2,.8,.2,1)}
.sk-toast[hidden]{display:none!important}
.sk-tf{inline-size:100%;max-inline-size:150px;min-block-size:46px;padding:10px 12px;border-radius:13px;border:1.5px solid var(--sk-line2);background:var(--sk-card);color:var(--sk-ink);font:inherit;font-size:17px;font-weight:600;letter-spacing:.06em;text-align:center;direction:ltr;font-variant-numeric:tabular-nums}
.sk-tf[data-bad="1"]{border-color:var(--sk-bad);background:var(--sk-bad-s)}
.sk-tf:focus{outline:none;border-color:var(--sk-ok);box-shadow:0 0 0 3px color-mix(in srgb,var(--sk-ok) 22%,transparent)}
.sk-sr{position:absolute;inline-size:1px;block-size:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (prefers-reduced-motion:reduce){.sk-sheet,.sk-toast{animation:none}}
@media print{.sk-scrim,.sk-toast{display:none!important}}
`;

export const PUBLIC_KIT_SCRIPT = String.raw`
var SK=(function(){
var G={
send:'<path d="M22 2 11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
you:'<circle cx="9" cy="7" r="4"/><path d="M2 21v-1a6 6 0 0 1 6-6h2"/><path d="m15 17 2 2 4-4"/>',
shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
door:'<path d="M5 21V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v17"/><path d="M3 21h18"/><path d="M14 12h.01"/>',
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
sunrise:'<path d="M12 3v4"/><path d="m5.6 8.6 1.4 1.4"/><path d="m18.4 8.6-1.4 1.4"/><path d="M3 17h18"/><path d="M7 17a5 5 0 0 1 10 0"/><path d="M8 21h8"/>',
sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
sunset:'<path d="M12 9V3"/><path d="m8.5 6.5 3.5 3.5 3.5-3.5"/><path d="M3 17h18"/><path d="M7 17a5 5 0 0 1 10 0"/><path d="M8 21h8"/>',
chat:'<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
cal:'<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
finger:'<path d="M6.5 9a6.5 6.5 0 0 1 11 0"/><path d="M5 14v-1a7 7 0 0 1 14 0v1"/><path d="M8.5 21C7.7 19.5 7 17.6 7 14.5a5 5 0 0 1 10 0c0 1.2-.1 2.3-.3 3.3"/><path d="M12 14.5c0 2.5.6 4.6 1.7 6.5"/>',
hour:'<path d="M7 3h10M7 21h10"/><path d="M8 3c0 5 8 5 8 9s-8 4-8 9"/><path d="M16 3c0 5-8 5-8 9s8 4 8 9"/>',
swap:'<path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/>',
x:'<path d="M6 6l12 12M18 6 6 18"/>',
coffee:'<path d="M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 3v2M12 3v2"/>',
lock:'<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
pen:'<path d="M4 20l1.2-4.2L16.6 4.4a2 2 0 0 1 3 3L8.2 18.8z"/>',
plus:'<path d="M12 5v14M5 12h14"/>',
trash:'<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
star:'<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z"/>',
arL:'<path d="M15 6l-6 6 6 6"/>',
arR:'<path d="M9 6l6 6-6 6"/>',
arrow:'<path d="M12 5v14"/><path d="m6 13 6 6 6-6"/>',
alert:'<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
layers:'<path d="M12 3l9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'};
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function gi(n){return '<svg class="sk-gi" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+(G[n]||"")+'</svg>'}
/* الأرقامُ كما تُكتب على أيّ لوحة — عربيةً أو فارسيةً أو لاتينية — وتُرسَل لاتينيةً دائماً. */
function digits(v){return String(v||"")
 .replace(/[٠-٩]/g,function(d){return String("٠١٢٣٤٥٦٧٨٩".indexOf(d))})
 .replace(/[۰-۹]/g,function(d){return String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))})
 .replace(/\D/g,"")}
var TTL=600000,civil="",at=0,scrim=null,toastEl=null,tt=0;
function ensure(){if(scrim)return;
 scrim=document.createElement("div");scrim.className="sk-scrim";scrim.hidden=true;document.body.appendChild(scrim);
 scrim.onclick=function(e){if(e.target===scrim)close()};
 toastEl=document.createElement("div");toastEl.className="sk-toast";toastEl.setAttribute("role","status");toastEl.hidden=true;document.body.appendChild(toastEl)}
function sheet(html){ensure();toastEl.hidden=true;scrim.innerHTML='<div class="sk-sheet" role="dialog" aria-modal="true"><div class="sk-grab"></div>'+html+'</div>';scrim.hidden=false;document.body.classList.add("sk-lock")}
function close(){if(!scrim)return;scrim.hidden=true;scrim.innerHTML="";document.body.classList.remove("sk-lock")}
function toast(icon,text){ensure();toastEl.innerHTML=gi(icon)+'<span>'+esc(text)+'</span>';toastEl.hidden=false;clearTimeout(tt);tt=setTimeout(function(){toastEl.hidden=true},3200)}
function known(){return civil.length===12&&Date.now()-at<TTL}
document.addEventListener("keydown",function(e){if(e.key==="Escape"&&scrim&&!scrim.hidden)close()});
window.addEventListener("pagehide",function(){civil=""});
/* o: {what: html, ok: toast, hint: sentence, run: function(civil, done(msg,status))} */
function sign(o){var again=false;
 function draw(initErr){var kn=known()&&!again;
  sheet('<div class="sk-h"><span class="sk-b">'+gi("finger")+'</span><div><h3>وقّع بلمسة واحدة</h3><p>رقمك المدني هو توقيعك على هذا الرد</p></div></div>'+
   '<div class="sk-what">'+o.what+'</div>'+
   (kn?'<div class="sk-known">'+gi("lock")+'<span>رقمك المدني محفوظ في هذه الصفحة لدقائق، وينتهي بـ <b>'+esc(civil.slice(-4))+'</b></span><button type="button" class="sk-link" id="skOther">رقم آخر</button></div>'
    :'<div class="sk-otpw"><div class="sk-otp" id="skOtp" aria-hidden="true"></div><input id="civil" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="12 رقمًا" aria-label="رقمك المدني — 12 رقمًا"></div>')+
   '<div class="sk-err" id="skErr" role="alert" hidden></div>'+
   '<button type="button" class="sk-btn" id="skGo"'+(kn?'':' disabled')+'>'+gi("send")+'وقّع وأرسل</button>'+
   '<p class="sk-hint">'+(kn?'':'اكتب رقمك المدني كاملاً — 12 رقمًا — فهو توقيعك. ')+esc(o.hint||"بإدخال رقمك المدني والضغط على «أرسل» فأنت توقّع هذا الطلب باسمك.")+'</p>'+
   '<p class="sk-priv">'+gi("lock")+'لا نحفظ رقمك على جهازك، ويُمحى من الصفحة بعد دقائق أو بإغلاقها.</p>');
  var go=document.getElementById("skGo"),err=document.getElementById("skErr"),inp=document.getElementById("civil"),otp=document.getElementById("skOtp"),v="";
  function paintOtp(){if(!otp)return;otp.innerHTML=Array.apply(null,{length:12}).map(function(_,k){return '<i class="'+(k===v.length?"on":k<v.length?"fill":"")+'">'+(v.charAt(k)||"")+'</i>'}).join("");go.disabled=v.length<12}
  if(initErr){err.textContent=initErr;err.hidden=false}
  if(inp){paintOtp();inp.oninput=function(){v=digits(inp.value).slice(0,12);inp.value=v;paintOtp()};setTimeout(function(){inp.focus()},120)}
  var other=document.getElementById("skOther");if(other)other.onclick=function(){again=true;civil="";draw()};
  go.onclick=function(){var c=kn?civil:v;if(c.length!==12)return;
   go.disabled=true;err.hidden=true;go.innerHTML=gi("clock")+'يرسل…';
   o.run(c,function(msg,status){
    if(msg){go.disabled=false;go.innerHTML=gi("send")+'وقّع وأرسل';err.textContent=msg;err.hidden=false;
     if(status===403){civil="";again=true;draw(msg)}return}
    civil=c;at=Date.now();close();if(o.ok)toast("check",o.ok)})}}
 draw()}
/* حقلُ الوقت: «HH:MM» بأرقامٍ إنجليزية. يكتب الأستاذُ 930 فيصير 09:30، والخانةُ الحمراء تقول إنه خارج الدوام. */
function norm(v,min,max){min=min||"08:00";max=max||"20:00";var d=digits(v);if(d.length===3)d="0"+d;if(d.length!==4)return "";
 var h=+d.slice(0,2),m=+d.slice(2);if(h>23||m>59)return "";
 var t=("0"+h).slice(-2)+":"+("0"+m).slice(-2);if(t<min||t>max)return "";return t}
function tf(attrs,value,min,max){return '<input class="sk-tf" type="text" inputmode="numeric" dir="ltr" maxlength="5" autocomplete="off" placeholder="09:30" data-min="'+esc(min||"08:00")+'" data-max="'+esc(max||"20:00")+'" '+(attrs||"")+' value="'+esc(value||"")+'">'}
var tfHandlers=[];
function onTime(fn){tfHandlers.push(fn)}
document.addEventListener("input",function(e){var el=e.target;if(!el||!el.classList||!el.classList.contains("sk-tf"))return;
 var d=digits(el.value).slice(0,4);if(d.length===1&&+d>2)d="0"+d;
 var f=d.length>2?d.slice(0,2)+":"+d.slice(2):d;if(el.value!==f)el.value=f;
 var t=d.length===4?norm(d,el.getAttribute("data-min"),el.getAttribute("data-max")):"";
 el.setAttribute("data-bad",d.length===4&&!t?"1":"0");
 for(var k=0;k<tfHandlers.length;k++)tfHandlers[k](el,t)});
return {G:G,esc:esc,gi:gi,digits:digits,sheet:sheet,close:close,toast:toast,known:known,sign:sign,norm:norm,tf:tf,onTime:onTime};
})();
`;
