/**
 * ── أنماطُ صفحة طلب الأستاذ (مسارُ التفاوض) ───────────────────────────────────
 *
 * طبقةٌ تُحقن بعد أنماط الصفحة القديمة في server.ts: تعيد رسمَ الرأس والمسار
 * وبطاقة «قرارك» والمواعيد وورقة التوقيع، وتترك منطقَ الصفحة كما هو. تعيش في
 * وحدةٍ وحدها كأنماط تنبيه المقترح، فلا تُعزل الصفحةُ في الاختبارات بلا أنماطها.
 *
 * ولا تُكتب هنا علامةُ الاقتباس المائلة ولا ‎${‎: النصُّ قالبٌ نصّي.
 */
export const REQUEST_V3_CSS = `:root{--ok-ink:#16523a;--on:#fff;--amber:#b07d00;--gold:#d19a1f;--raise:#fff;--amber-line:#e6c46d;--warn-line:#f0e2b3;--sk-on:#fff}
/* ── v3: مسارُ التفاوض ───────────────────────────────────────────────────────
   طبقةٌ فوق الأنماط القديمة: تعيد رسمَ الرأس والمسار وبطاقة القرار والمواعيد
   وورقة التوقيع، وتترك منطقَ الصفحة كما هو. الألوانُ كلُّها من متغيّرات الصفحة. */
.wrap{max-width:560px;padding-inline:16px}
.gi{width:20px;height:20px;flex:none;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round;vertical-align:-.25em}
.num{direction:ltr;unicode-bidi:isolate;display:inline-block;font-variant-numeric:tabular-nums}
.statusline{margin:0;gap:6px}
.chip{font-size:11.5px;padding:3px 10px}
.hd{display:flex;align-items:flex-start;gap:12px;margin:2px 2px 14px}
.hd .av{flex:none;inline-size:46px;block-size:46px;border-radius:50%;display:grid;place-items:center;background:var(--ok2);color:var(--ok-ink);font-weight:700;font-size:15px;letter-spacing:.02em}
.hd .hd-k{display:block;font-size:11.5px;font-weight:700;color:var(--muted2);line-height:1.2}
.hd h1{margin:0;font-size:20px;line-height:1.35}
.hd .sub{margin:0;font-size:12.5px}
.hd>div{min-inline-size:0}
.hd .statusline{margin:6px 0 0;gap:5px}
.hd .chip{font-size:11.5px}
.hero{display:none}
/* المسار */
.path{position:relative;display:grid;grid-template-columns:repeat(4,1fr);margin:0 0 14px;padding-top:2px}
.path::before{content:"";position:absolute;top:22px;inset-inline:12.5%;block-size:3px;border-radius:3px;background:var(--line)}
.path .fill{position:absolute;top:22px;inset-inline-start:12.5%;block-size:3px;border-radius:3px;background:var(--ok);transform-origin:right center;animation:grow .9s cubic-bezier(.2,.8,.2,1) both}
@keyframes grow{from{transform:scaleX(0)}}
.st{position:relative;display:grid;justify-items:center;gap:6px;text-align:center;font-size:11.5px;font-weight:600;color:var(--muted2);line-height:1.35}
.st .c{inline-size:44px;block-size:44px;border-radius:50%;display:grid;place-items:center;background:var(--raise);border:2px solid var(--line);color:var(--muted2);transition:all .3s}
.st[data-s=done]{color:var(--muted)}
.st[data-s=done] .c{background:var(--ok);border-color:var(--ok);color:var(--on)}
.st[data-s=now]{color:var(--ink)}
.st[data-s=now] .c{border-color:var(--ok);color:var(--ok);box-shadow:0 0 0 6px rgba(36,119,86,.14)}
.st[data-s=now][data-you="1"] .c{border-color:var(--gold);color:var(--warn);box-shadow:0 0 0 6px rgba(209,154,31,.2);animation:pulse 1.8s ease-out infinite}
@keyframes pulse{50%{box-shadow:0 0 0 11px rgba(209,154,31,.05)}}
/* بطاقة القرار */
.deck{position:relative;margin:0 0 16px;padding:16px;border-radius:26px;background:linear-gradient(180deg,var(--warn2),var(--raise) 44%);border:1px solid #eed994;box-shadow:var(--shadow);display:grid;gap:14px}
.dk-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.dk-ct{display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;color:var(--warn)}
.dk-ct b{font-variant-numeric:tabular-nums}
.dk-nav{display:inline-flex;gap:6px}
.dk-nav button{inline-size:36px;block-size:36px;border-radius:12px;border:1px solid var(--line);background:var(--raise);display:grid;place-items:center;color:var(--ink);cursor:pointer}
.dk-nav button:disabled{opacity:.35;cursor:default}
.dk-dots{display:flex;gap:5px;justify-content:center}
.dk-dots i{inline-size:7px;block-size:7px;border-radius:50%;background:var(--line2)}
.dk-dots i[data-on="1"]{background:var(--gold);inline-size:20px;border-radius:5px}
.dk-dots i[data-done="1"]{background:var(--ok)}
.dk-h{display:grid;gap:2px}
.dk-h h2{margin:0;font-size:21px;line-height:1.4;font-weight:700;text-wrap:balance}
.dk-h p{margin:0;font-size:13px;color:var(--muted)}
.dk-why{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:16px;background:var(--raise);border:1px solid var(--warn-line);font-size:13.5px;line-height:1.55;color:var(--warn);font-weight:600}
.dk-why .b{flex:none;inline-size:34px;block-size:34px;border-radius:11px;display:grid;place-items:center;background:var(--warn2)}
.dk-why small{display:block;font-weight:500;color:var(--muted);font-size:12.5px}
.offers{display:flex;gap:6px;flex-wrap:wrap}
.offers button{flex:1 1 0;min-inline-size:120px;border:1.5px solid var(--line);border-radius:14px;background:var(--raise);padding:8px 10px;font-weight:600;font-size:13px;color:var(--muted);cursor:pointer}
.offers button[aria-pressed=true]{border-color:var(--ok);background:var(--ok2);color:var(--ok-ink)}
/* الموعد كإنفوجرافيك */
.slot{display:grid;gap:12px;padding:14px;border-radius:20px;background:var(--soft)}
.when{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.when .big{font-size:30px;font-weight:700;line-height:1.1;letter-spacing:-.01em}
.when .tag{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;padding:3px 10px;border-radius:999px;background:var(--ok);color:var(--on)}
.when .tag[data-k=asked]{background:var(--amber)}
.when .tag .gi{inline-size:14px;block-size:14px}
.sdays{display:grid;grid-template-columns:repeat(5,1fr);gap:6px}
.sd{display:grid;justify-items:center;gap:3px;padding:7px 0 6px;border-radius:12px;font-size:12px;font-weight:600;color:var(--muted2);border:1.5px solid transparent}
.sd i{inline-size:7px;block-size:7px;border-radius:50%;background:currentColor;opacity:.35}
.sd[data-k=new]{background:var(--ok);color:var(--on)}.sd[data-k=new] i{opacity:1}
.sd[data-k=asked]{background:var(--warn2);color:var(--warn);border-color:var(--amber-line)}.sd[data-k=asked] i{opacity:1}
.sd[data-k=old]{border:1.5px dashed var(--bad);color:var(--bad);text-decoration:line-through}.sd[data-k=old] i{opacity:0}
.ruler{position:relative;block-size:44px}
.ruler .track{position:absolute;inset-inline:0;top:8px;block-size:16px;border-radius:8px;background:repeating-linear-gradient(90deg,var(--line) 0 1px,transparent 1px calc(100% / 12));background-color:var(--on)}
.ruler .blk{position:absolute;top:4px;block-size:24px;border-radius:8px;transition:all .4s cubic-bezier(.2,.8,.2,1)}
.ruler .blk[data-k=new]{background:var(--ok);box-shadow:0 4px 12px rgba(36,119,86,.35)}
.ruler .blk[data-k=asked]{background:var(--amber)}
.ruler .blk[data-k=old]{border:1.5px dashed var(--bad);background:rgba(173,47,40,.08)}
.ruler .tk{position:absolute;bottom:0;font-size:11px;color:var(--muted2)}
.skey{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:11.5px;color:var(--muted)}
.skey span{display:inline-flex;align-items:center;gap:6px}
.skey b{inline-size:16px;block-size:9px;border-radius:4px;display:inline-block}
.facts{display:grid;gap:8px;margin:0;padding:0;list-style:none}
.facts li{display:flex;align-items:center;gap:10px;font-size:13.5px;line-height:1.5}
.facts .b{inline-size:34px;block-size:34px;border-radius:11px;display:grid;place-items:center;flex:none;background:var(--soft);color:var(--ok)}
.facts li[data-t=warn] .b{background:var(--warn2);color:var(--warn)}
.facts li[data-t=bad] .b{background:var(--bad2);color:var(--bad)}
.dk-acts{display:grid;gap:10px}
.btn-main{display:flex;align-items:center;justify-content:center;gap:9px;inline-size:100%;min-block-size:56px;padding:10px 16px;border-radius:18px;border:0;background:var(--ok);color:var(--on);font-weight:700;font-size:17px;cursor:pointer;box-shadow:0 8px 20px rgba(36,119,86,.3)}
.btn-main:active{transform:scale(.985)}
.btn-main:disabled{opacity:.45;box-shadow:none;cursor:not-allowed}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.btn-alt{display:flex;align-items:center;justify-content:center;gap:8px;min-block-size:50px;border-radius:16px;border:1.5px solid var(--line);background:var(--raise);font-weight:600;font-size:14.5px;color:var(--ink);cursor:pointer}
.btn-alt .gi{color:var(--ok)}
.btn-alt.wide{inline-size:100%}
/* لا قرار ينتظر: بطاقة هادئة */
.calm{margin:0 0 16px;padding:14px 16px;border-radius:22px;background:var(--raise);border:1px solid var(--line);box-shadow:var(--shadow);display:flex;align-items:center;gap:12px}
.calm .b{flex:none;inline-size:46px;block-size:46px;border-radius:15px;display:grid;place-items:center;background:var(--ok2);color:var(--ok)}
.calm[data-t=wait] .b{background:var(--soft);color:var(--muted)}
.calm b{display:block;font-size:15.5px}.calm small{display:block;color:var(--muted);font-size:12.5px;line-height:1.5}
/* التبويبات */
.tabs{border-radius:16px}
.tabs button{display:inline-flex;align-items:center;justify-content:center;gap:7px}
.tb{min-inline-size:20px;block-size:20px;padding:0 6px;border-radius:10px;display:inline-grid;place-items:center;background:var(--gold);color:var(--on);font-size:11.5px;font-weight:700}
.tb[data-q=mute]{background:var(--line2);color:var(--ink)}
/* قائمة المواعيد */
.plan{border-radius:22px;border:1px solid var(--line);box-shadow:var(--shadow)}
.appt-head{display:grid;grid-template-columns:auto minmax(0,1fr) auto 20px;grid-template-areas:"ic main st chev";gap:6px 12px;align-items:center;padding:12px 14px}
.ap-ic{grid-area:ic;inline-size:38px;block-size:38px;border-radius:12px;display:grid;place-items:center;background:var(--soft);color:var(--ok)}
.ap-ic .gi{inline-size:19px;block-size:19px}
.appt[data-act=change] .ap-ic{background:var(--warn2);color:var(--warn)}
.appt[data-act=add] .ap-ic{background:var(--ok2);color:var(--ok)}
.appt[data-act=delete] .ap-ic{background:var(--bad2);color:var(--bad)}
.appt[data-neg=proposed] .ap-ic{background:var(--warn2);color:var(--warn)}
.ap-main{grid-area:main;min-inline-size:0;display:grid;gap:1px}
.ap-main b{font-weight:700;font-size:15px;line-height:1.4}
.ap-main small{color:var(--muted2);font-size:11.5px}
.ap-when{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);margin-top:2px}
.pips{display:inline-flex;gap:3px}
.pips i{inline-size:18px;block-size:18px;border-radius:5px;background:var(--line);display:grid;place-items:center;font-style:normal;font-size:11px;font-weight:700;color:var(--on)}
.pips i[data-on="1"]{background:var(--ok)}
.appt[data-act=change] .pips i[data-on="1"]{background:var(--amber)}
.appt[data-act=delete] .pips i[data-on="1"]{background:var(--bad)}
.ap-when s{color:var(--muted2);font-size:11.5px}
.ap-st{grid-area:st;display:grid;justify-items:end;gap:3px}
.neg{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;padding:2px 9px;border-radius:999px;background:var(--soft);color:var(--muted)}
.neg[data-neg=proposed]{background:var(--warn2);color:var(--warn)}
.neg[data-neg=agreed]{background:var(--ok2);color:var(--ok-ink)}
.neg[data-neg=rejected]{background:var(--bad2);color:var(--bad)}
.thread{margin-top:10px;padding:12px;border-radius:16px;background:var(--soft);display:grid;gap:10px}
.thread-head{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px}
.msgs{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.msgs li{max-inline-size:90%;padding:8px 12px;border-radius:16px;background:var(--raise);font-size:13.5px;line-height:1.6}
.msgs li[data-from=instructor]{justify-self:start;background:var(--ok2);border-end-start-radius:5px}
.msgs li[data-from=department]{justify-self:end;border-end-end-radius:5px}
.msgs small{display:block;font-size:11px;color:var(--muted2);font-weight:600}
.msgs p{margin:0}
.slots{display:flex;gap:5px;flex-wrap:wrap;margin-top:4px}
.slot-chip,.msgs .slot{display:inline-flex;align-items:center;gap:5px;padding:2px 10px;border-radius:999px;background:var(--ok2);color:var(--ok-ink);font-size:12px;font-weight:700}
.thread-act{display:flex;gap:8px;flex-wrap:wrap}
.thread-act button{display:inline-flex;align-items:center;gap:7px;min-block-size:44px;padding:8px 14px;border-radius:13px;border:1.5px solid var(--line);background:var(--raise);font:inherit;font-size:13px;font-weight:600;cursor:pointer}
.thread-act button.pri{background:var(--ok);border-color:var(--ok);color:var(--on)}
/* شريط الإرسال */
.send{position:fixed;inset-inline:0;bottom:0;margin:0;padding:8px 12px calc(10px + env(safe-area-inset-bottom,0px));background:linear-gradient(transparent,var(--bg) 30%);z-index:6;pointer-events:none}
.sendbar{pointer-events:auto;max-inline-size:560px;margin:0 auto;display:flex;align-items:center;gap:12px;padding:8px 8px 8px 12px;border-radius:22px;background:color-mix(in srgb,var(--raise) 97%,transparent);border:1px solid var(--line);box-shadow:0 -6px 30px rgba(22,57,40,.12)}
.sb-t{flex:1;min-inline-size:0;line-height:1.35}
.sb-t b{display:block;font-size:14px}.sb-t small{display:block;font-size:11.5px;color:var(--muted)}
.sendbar #send[data-blocked]{background:var(--amber);box-shadow:none}
.sendbar #send{flex:none;inline-size:auto;min-block-size:48px;padding:8px 20px;border-radius:15px;display:inline-flex;align-items:center;gap:8px;font-size:15px}
.wrap{padding-bottom:128px}
/* شاشة الإرسال */
.done{padding:20px 4px}
.done .tick{inline-size:76px;block-size:76px;border-radius:26px;margin:0 auto 14px;display:grid;place-items:center;background:var(--ok);color:var(--on);animation:pop .55s cubic-bezier(.2,1.4,.4,1)}
@keyframes pop{from{transform:scale(.5);opacity:0}to{transform:none;opacity:1}}
.done .tick .gi{inline-size:36px;block-size:36px;stroke-width:2.2}
.done .code{display:inline-flex;align-items:center;gap:8px;margin-top:6px;padding:6px 14px;border-radius:999px;background:var(--soft);font-weight:700}
.done-path{margin:18px 0 8px}
.done .btn-main{margin-top:16px;inline-size:auto;display:inline-flex;padding-inline:24px}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}
@media (max-width:380px){.when .big{font-size:26px}.pair{grid-template-columns:1fr}}
/* عند ٣٢٠–٣٨٠ بكسل لا يتّسع العمودان معاً: تنزل حالة الموعد تحت نصّه بدل أن تركب على أيام الأسبوع */
@media (max-width:380px){.appt-head{grid-template-columns:auto minmax(0,1fr) 20px;grid-template-areas:"ic main chev" "ic st chev"}.ap-st{justify-items:start}.appt-chev{grid-area:chev}}
@media print{.dk-acts,.dk-nav,.thread-act{display:none!important}.deck{box-shadow:none;break-inside:avoid}}
.sr{position:absolute;inline-size:1px;block-size:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.edit{border-top:1px dashed var(--line2)}
.days button,.starts button,.acts .act{font-family:inherit;border-radius:13px;font-weight:600;letter-spacing:0}
.starts button{font-size:14px;line-height:1;padding:12px 4px;font-variant-numeric:tabular-nums}
.days button{font-size:13px;padding:11px 2px}
.days button[aria-pressed=true],.starts button[aria-pressed=true]{background:var(--ok2);border-color:var(--ok);color:var(--ok-ink)}
.starts button[aria-pressed=true]{background:var(--ok);color:var(--on)}
.acts .act{min-block-size:46px}
.hint-pro{margin:0 0 8px;padding:9px 12px;border-radius:12px;background:var(--warn2);color:var(--warn);font-size:12.5px;line-height:1.6}
.verdict{border-radius:14px}
:root{color-scheme:light dark}
@media (prefers-color-scheme:dark){
:root{--ink:#e6efe9;--muted:#a2b2a9;--muted2:#7d8d84;--line:#26362d;--line2:#35483d;--bg:#0e1612;--card:#16211b;--soft:#1b2a22;--ok:#4fbf8c;--ok2:#17372a;--warn:#e8b64d;--warn2:#332a10;--bad:#f08c84;--bad2:#3a1c1a;--accent:#4fbf8c;--shadow:0 12px 34px rgba(0,0,0,.4);
--ok-ink:#86dcb1;--on:#08140e;--amber:#e8b64d;--gold:#e8b64d;--raise:#1d2b23;--amber-line:#6a5320;--warn-line:#4a3b16;--sk-on:#08140e;--sk-toast-bg:#e6efe9;--sk-toast-fg:#0e1612;color-scheme:dark}
body{background:radial-gradient(circle at 85% 0,rgba(79,191,140,.08),transparent 28%),var(--bg)}
.pick button,.days button,.alts button,textarea,.course-college select,.course-search,.course-option,label.sign input,label.time input,.starts button,.act{background:var(--raise);color:var(--ink);border-color:var(--line2)}
.tabs{background:color-mix(in srgb,var(--card) 92%,transparent)}
.card[data-act="delete"]{background:var(--bad2)}
.state,.chip.st{background:var(--warn2);border-color:var(--warn-line);color:var(--warn)}
.state[data-approved="1"],.statusline[data-approved="1"] .chip.st{background:var(--ok2);border-color:var(--line2);color:var(--ok)}
.add-card{background:color-mix(in srgb,var(--card) 70%,transparent);border-color:var(--line2)}
.err{background:var(--bad2)}
.restored{background:var(--soft)}
details.demo>summary{background:var(--warn2);border-color:var(--warn-line);color:var(--warn)}
.verdict[data-tone=warn]{color:var(--warn)}
.alts-ro span{background:var(--soft);color:var(--ink)}
.status[data-act=add],.status[data-act=change],.status[data-act=delete],.add-start,.send button,.starts button[aria-pressed=true],.done .tick,.verdict>i,.dept i,.reply button[data-reply]{color:var(--on)}
.days button[aria-pressed=true],.pick button[aria-pressed=true]{background:var(--ok2);border-color:var(--ok);color:var(--ink)}
.appt-head:hover{background:rgba(79,191,140,.08)}
label.sign input::placeholder,.course-search::placeholder,textarea::placeholder,.signnote{color:var(--muted)}
.deck{background:linear-gradient(180deg,var(--warn2),var(--card) 44%);border-color:var(--warn-line)}
.sd[data-k=asked]{background:var(--warn2)}
.ruler .track{background-color:var(--raise)}
.tb[data-q=mute]{background:var(--line2);color:var(--ink)}
.pips i{color:var(--on)}
.ev,.plan-head{color:var(--ink)}
}
`;
