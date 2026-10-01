/**
 * ── صفحةُ المقترح الدراسي للأستاذ ───────────────────────────────────────────
 *
 * تُبنى في الخادم كبقيّة الأبواب العامة (طلب الأستاذ، بطاقته): يفتحها من واتساب
 * على هاتفه، فلا حزمةَ تطبيقٍ تُحمَّل ولا إطار عمل. سكربتٌ واحد بصياغة ES5
 * العادية داخل قالبٍ نصّي، وأنماطٌ واحدة.
 *
 * وما فيها مقصودٌ كما هو:
 *   - المقترحُ مسوّدةٌ لا جدول: لا تقول الصفحةُ في أي موضعٍ إن جدوله تغيّر قبل
 *     أن يثبّت القسم. موافقتُه «تسجيلُ موافقة» وبعدها «بانتظار تثبيت القسم».
 *   - الأرقامُ المدنيّة توقيعٌ يُرسَل ولا يُحفظ: لا في المتصفح ولا في السجلّ؛
 *     تُمحى من الذاكرة بعد نجاح الإرسال.
 *   - كلُّ ردٍّ يحمل رقمَ النسخة التي رآها الأستاذ؛ الخادمُ يرفض الردّ على نسخةٍ
 *     أقدم، والصفحةُ تدلّه على إعادة التحميل بدل أن تخمّن.
 *   - الوقتُ يُكتب «بداية – نهاية» داخل عزلٍ يسارِيّ فلا يقلبه اتجاهُ الفقرة.
 *
 * النصُّ داخل String.raw عمداً: لا تُضاعَف الشرطاتُ المائلة في التعابير النمطية
 * ولا يُخشى ⁦ أن يُحلَّ قبل أن يصل المتصفّح. ولا تُكتب علامةُ اقتباسٍ مائلة
 * (backtick) ولا ‎${‎ داخل السكربت: أولُّهما يُغلق القالب والثاني يُحلّ في الخادم.
 */
import { ARABIC_COUNT_SCRIPT } from "../utils/arabicCount";

const FONT_FACES = ["400", "500", "600", "700"].map(w =>
  `@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:${w};font-display:swap;src:url("/fonts/plex-arabic-arabic-${w}.woff2") format("woff2")}` +
  `@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:${w};font-display:swap;unicode-range:U+0000-00FF,U+2000-206F;src:url("/fonts/plex-arabic-latin-${w}.woff2") format("woff2")}`,
).join("");

const PAGE_CSS = String.raw`
:root{--ink:#15251d;--ink2:#2c3f34;--muted:#5d6e64;--muted2:#8a9890;--line:#dde6e0;--line2:#c8d5cd;--bg:#f3f7f4;--card:#fff;--soft:#edf5f0;
--accent:#247756;--accent-d:#1b5c43;--accent-soft:#e1f2e9;--accent-line:#9fcdb6;
--amber:#85580a;--amber-soft:#fff4d6;--amber-line:#e3c26a;--bad:#a8322b;--bad-soft:#fdecea;--bad-line:#e1a39d;
--info:#2b5d88;--info-soft:#e7f0f8;--info-line:#a9c6de;
--shadow:0 1px 2px rgba(22,57,40,.05),0 12px 32px rgba(22,57,40,.07);--ring:0 0 0 3px rgba(36,119,86,.28);--H:56px}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100dvh;background:radial-gradient(circle at 90% -5%,rgba(36,119,86,.09),transparent 30%),var(--bg);color:var(--ink);font:400 16px/1.7 "Plex Arabic","Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;font-synthesis:none;font-kerning:normal;-webkit-font-smoothing:antialiased}
button,input,select,textarea{font:inherit;color:inherit}
button{touch-action:manipulation;cursor:pointer}
button:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible,a:focus-visible,.ev:focus-visible{outline:none;box-shadow:var(--ring);border-color:var(--accent)}
svg.i{width:1.15em;height:1.15em;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;vertical-align:-.2em}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.ltr{direction:ltr;unicode-bidi:isolate;display:inline-block}
[hidden]{display:none!important}
.wrap{max-width:1100px;margin:0 auto;padding:16px 16px 40px}
.wrap.has-bar{padding-bottom:104px}
/* الهيدر */
.hero{position:relative;overflow:hidden;border-radius:24px;padding:22px 22px 18px;color:#fff;background:linear-gradient(135deg,#17513c 0%,#247756 62%,#2f8d68 100%);box-shadow:var(--shadow)}
.hero::after{content:"";position:absolute;inset:auto auto -70px -50px;width:230px;height:230px;border-radius:50%;background:radial-gradient(circle,rgba(255,255,255,.14),transparent 68%);pointer-events:none}
.hero-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.brand{font:600 12px/1 system-ui,sans-serif;letter-spacing:.28em;opacity:.78}
.badge{display:inline-flex;align-items:center;gap:6px;padding:5px 12px 5px 14px;border-radius:999px;font-size:13px;font-weight:700;line-height:1.5;border:1px solid transparent}
.hero .badge{background:#fff;color:var(--ink)}
.badge[data-tone=ok]{color:var(--accent-d);background:var(--accent-soft);border-color:var(--accent-line)}
.badge[data-tone=wait]{color:var(--amber);background:var(--amber-soft);border-color:var(--amber-line)}
.badge[data-tone=bad]{color:var(--bad);background:var(--bad-soft);border-color:var(--bad-line)}
.badge[data-tone=info]{color:var(--info);background:var(--info-soft);border-color:var(--info-line)}
.badge[data-tone=mute]{color:var(--muted);background:#eef2ef;border-color:var(--line2)}
.hero h1{margin:0 0 4px;font-size:clamp(21px,3.6vw,30px);line-height:1.4;letter-spacing:-.01em;font-weight:700}
.hero .who{margin:0;font-size:15px;opacity:.92}
.meta{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 0;padding:0;list-style:none}
.meta li{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:12px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22);font-size:13.5px;line-height:1.5}
.meta li b{font-weight:600}
.meta li[data-urgent="1"]{background:#fff4d6;color:#6b4800;border-color:#ecd28a}
/* تنبيهات */
.note{display:flex;gap:11px;align-items:flex-start;margin:14px 0 0;padding:13px 15px;border-radius:16px;border:1px solid var(--line);background:var(--card);font-size:14.5px;line-height:1.75}
.note>.i{margin-top:3px;width:1.3em;height:1.3em}
.note b{display:block;font-size:15.5px;margin-bottom:1px}
.note p{margin:0;color:var(--muted)}
.note[data-tone=ok]{background:var(--accent-soft);border-color:var(--accent-line);color:var(--accent-d)}.note[data-tone=ok] p{color:#34614f}
.note[data-tone=wait]{background:var(--amber-soft);border-color:var(--amber-line);color:var(--amber)}.note[data-tone=wait] p{color:#6e5313}
.note[data-tone=bad]{background:var(--bad-soft);border-color:var(--bad-line);color:var(--bad)}.note[data-tone=bad] p{color:#7c3a35}
.note[data-tone=info]{background:var(--info-soft);border-color:var(--info-line);color:var(--info)}.note[data-tone=info] p{color:#3d5d78}
.note .btn{margin-top:9px}
/* بطاقات وعناوين */
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:18px;box-shadow:var(--shadow)}
.sec{margin-top:26px}
.sec-h{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 2px 12px}
.sec-h h2{margin:0;font-size:19px;line-height:1.4;font-weight:700}
.sec-h p{margin:2px 0 0;font-size:13.5px;color:var(--muted)}
.msg{position:relative;margin-top:14px;padding:16px 20px 16px 18px;border-radius:20px;background:var(--card);border:1px solid var(--line);box-shadow:var(--shadow)}
.msg::before{content:"";position:absolute;inset-block:14px;inset-inline-start:0;width:4px;border-radius:4px;background:var(--accent)}
.msg small{display:block;font-size:12.5px;color:var(--muted);margin-bottom:3px;font-weight:600}
.msg p{margin:0;font-size:16px;line-height:1.85;white-space:pre-wrap}
/* مواد المقترح */
.ops{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,400px),1fr))}
.op{position:relative;display:flex;flex-direction:column;gap:11px;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:16px;box-shadow:var(--shadow)}
.op-head{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
.kind{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:999px;font-size:12.5px;font-weight:700;border:1px solid}
.kind[data-k=create]{color:var(--accent-d);background:var(--accent-soft);border-color:var(--accent-line)}
.kind[data-k=assign]{color:var(--info);background:var(--info-soft);border-color:var(--info-line)}
.kind[data-k=edit]{color:var(--amber);background:var(--amber-soft);border-color:var(--amber-line)}
.kind[data-k=replace]{color:#5a3e86;background:#f0eafa;border-color:#c9b9e4}
.op h3{margin:0;font-size:17px;line-height:1.45;font-weight:700}
.op h3 small{display:block;margin-top:1px;font-size:13px;font-weight:500;color:var(--muted)}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:8px 12px;margin:0}
.facts div{display:flex;gap:8px;align-items:flex-start;min-width:0}
.facts dt{display:flex;margin-top:3px;color:var(--muted2)}
.facts dd{margin:0;font-size:14.5px;line-height:1.55;min-width:0;overflow-wrap:anywhere}
.facts .lbl{display:block;font-size:11.5px;color:var(--muted2);font-weight:600;line-height:1.3}
.facts .dim{color:var(--muted)}
.chg{border-radius:14px;padding:11px 13px;font-size:14px;line-height:1.7;background:var(--soft);border:1px solid var(--line);color:var(--ink2)}
.chg b{font-weight:700}
.chg .row{display:flex;gap:9px;align-items:flex-start;padding:2px 0}
.chg .row>.i{margin-top:5px}
.chg .row[data-r=out]{color:var(--bad)}.chg .row[data-r=in]{color:var(--accent-d)}
.chg .ba{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;align-items:baseline}
.chg .ba span{font-size:12px;font-weight:700;color:var(--muted)}
.chg .ba .was{text-decoration:line-through;text-decoration-color:rgba(168,50,43,.55);color:var(--muted)}
.chg .why{display:block;margin-top:5px;font-size:13px;color:var(--muted)}
.opres{display:flex;align-items:center;gap:7px;margin-top:auto;padding-top:10px;border-top:1px dashed var(--line2);font-size:13.5px;font-weight:600}
.opres[data-s=approve]{color:var(--accent-d)}.opres[data-s=changes]{color:var(--amber)}.opres[data-s=pending]{color:var(--muted)}.opres[data-s=skipped]{color:var(--bad)}
.opnote{margin:0;font-size:13.5px;color:var(--muted)}
/* الأثر */
.impact{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(min(100%,196px),1fr))}
@media (min-width:900px){.impact{grid-template-columns:repeat(3,1fr)}}
.m{position:relative;display:flex;flex-direction:column;gap:3px;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:14px 15px;box-shadow:var(--shadow);overflow:hidden}
.m[data-ch="1"]{border-color:var(--accent-line)}
.m[data-ch="1"]::before{content:"";position:absolute;inset-inline:0;top:0;height:3px;background:var(--accent)}
.m .lab{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--muted)}
.m .val{font-size:21px;line-height:1.4;font-weight:700;color:var(--ink)}
.m .val small{font-size:13px;font-weight:500;color:var(--muted)}
.m .cmp{display:flex;flex-wrap:wrap;align-items:center;gap:4px 9px;font-size:13px;color:var(--ink2)}
.m .cmp .was{color:var(--muted)}
.m .dir{display:inline-flex;align-items:center;gap:4px;font-weight:600;padding:1px 8px;border-radius:999px;background:var(--soft);border:1px solid var(--line)}
.m .dir[data-d=up]{color:var(--info);background:var(--info-soft);border-color:var(--info-line)}
.m .dir[data-d=down]{color:var(--accent-d);background:var(--accent-soft);border-color:var(--accent-line)}
.m .sub{font-size:12.5px;color:var(--muted);line-height:1.55;margin-top:2px}
.m .warn{display:flex;gap:6px;align-items:flex-start;margin-top:4px;padding:5px 9px;border-radius:10px;background:var(--amber-soft);border:1px solid var(--amber-line);font-size:12.5px;color:var(--amber);line-height:1.5}
/* الجدول الأسبوعي */
.tools{display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap;margin-bottom:12px}
.seg{display:inline-flex;padding:4px;gap:4px;border-radius:15px;background:#e8efea;border:1px solid var(--line)}
.seg button{display:inline-flex;align-items:center;gap:7px;border:0;border-radius:11px;padding:8px 15px;background:transparent;color:var(--muted);font-weight:600;font-size:14.5px;min-height:40px;transition:background .16s,color .16s,box-shadow .16s}
.seg button[aria-pressed=true]{background:var(--card);color:var(--accent-d);box-shadow:0 1px 3px rgba(22,57,40,.16)}
.seg.sm button{padding:6px 11px;min-height:36px;font-size:13.5px}
.chk{display:inline-flex;align-items:center;gap:9px;padding:7px 12px;border-radius:12px;border:1px solid var(--line);background:var(--card);font-size:14px;cursor:pointer;min-height:40px}
.chk input{width:18px;height:18px;accent-color:var(--accent);margin:0}
.chk:focus-within{box-shadow:var(--ring);border-color:var(--accent)}
.ttcard{background:var(--card);border:1px solid var(--line);border-radius:20px;box-shadow:var(--shadow);overflow:hidden}
.tt-sum{display:flex;flex-wrap:wrap;gap:7px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--line);background:linear-gradient(#fbfdfc,#f6faf7);font-size:13.5px;color:var(--ink2)}
.tt-sum .pill{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:999px;border:1px solid var(--line2);background:#fff;font-weight:600}
.pill[data-st=proposed]{color:var(--accent-d);background:var(--accent-soft);border-color:var(--accent-line)}
.pill[data-st=modified]{color:var(--amber);background:var(--amber-soft);border-color:var(--amber-line)}
.pill[data-st=out]{color:var(--bad);background:#fff;border:1px dashed var(--bad-line)}
.tt-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
.tt{min-width:580px;padding:10px 10px 12px}
.tt-row{display:grid;grid-template-columns:50px repeat(5,minmax(0,1fr));gap:0 6px}
.tt-head{padding-bottom:6px}
.tt-head div{padding:6px 4px 7px;text-align:center;font-size:14px;font-weight:700;color:var(--ink2);border-radius:10px;background:var(--soft)}
.tt-head div:first-child{background:transparent}
.tt-times{position:relative;height:calc(var(--H)*12)}
.tt-times span{position:absolute;inset-inline:0;font-size:11.5px;color:var(--muted2);text-align:center;transform:translateY(-.55em);direction:ltr;font-variant-numeric:tabular-nums}
.tt-col{position:relative;height:calc(var(--H)*12);border-radius:12px;background-color:#fbfdfc;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(rgba(221,230,224,.5) 1px,transparent 1px);background-size:100% var(--H),100% calc(var(--H)/2);background-position:0 0,0 0;border:1px solid var(--line)}
.ev{position:absolute;display:flex;flex-direction:column;gap:1px;padding:4px 7px 3px;margin:0;text-align:start;overflow:hidden;border-radius:10px;border:1px solid var(--line2);border-inline-start-width:4px;background:#f1f5f2;color:var(--ink);font-size:12.5px;line-height:1.35;min-width:0;transition:opacity .18s,transform .18s,box-shadow .18s}
.ev:hover{box-shadow:0 4px 14px rgba(22,57,40,.16);z-index:2}
.ev>*{flex:none;max-width:100%}
.ev .n{font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ev .t{font-size:11.5px;color:var(--ink2);white-space:nowrap}
.ev .p{font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ev .tag{display:inline-flex;align-items:center;gap:3px;align-self:flex-start;font-size:10.5px;font-weight:700;line-height:1.35;padding:0 6px;border-radius:999px;background:#fff;border:1px solid currentColor;white-space:nowrap}
.ev .tag .i{width:1em;height:1em}
.ev[data-st=current]{background:#eef3f0;border-color:#c1cfc6;border-inline-start-color:#82988b}
.ev[data-st=proposed]{background:var(--accent-soft);border-color:var(--accent);border-inline-start-width:5px;color:#0f3d2b}
.ev[data-st=proposed] .tag{color:var(--accent-d)}
.ev[data-st=modified]{background:var(--amber-soft);border:2px solid var(--amber-line);border-inline-start:5px double #b57a10;color:#4f3500}
.ev[data-st=modified] .tag{color:var(--amber)}
.ev[data-st=out]{background:repeating-linear-gradient(135deg,#fff,#fff 6px,#fbeeed 6px,#fbeeed 12px);border:1.5px dashed var(--bad-line);border-inline-start-width:1.5px;color:#7c3a35;opacity:.82}
.ev[data-st=out] .n{text-decoration:line-through;text-decoration-thickness:1.5px}
.ev[data-st=out] .tag{color:var(--bad)}
.ev[data-compact="1"] .n{white-space:normal;font-size:11.5px;line-height:1.25}
.ev[data-compact="1"] .p,.ev[data-compact="1"] .tag span{display:none}
.ev[data-short="1"] .p{display:none}
.ev[data-tiny="1"] .p,.ev[data-tiny="1"] .sc{display:none}
.ev[data-micro="1"] .tag{display:none}
.ev[data-tg="1"][data-short="1"] .sc{display:none}
.ev[data-compact="1"] .sc{display:none}
.ag .ev .sc{display:block}
.ev.swap{animation:fadeIn .18s ease-out both}
@keyframes fadeIn{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;padding:11px 14px 13px;border-top:1px solid var(--line);font-size:12.5px;color:var(--muted)}
.legend span{display:inline-flex;align-items:center;gap:7px}
.legend i{display:inline-block;width:22px;height:14px;border-radius:5px;border:1px solid var(--line2)}
.legend i[data-st=current]{background:#eef3f0;border-inline-start:4px solid #82988b}
.legend i[data-st=proposed]{background:var(--accent-soft);border:1px solid var(--accent);border-inline-start-width:4px}
.legend i[data-st=modified]{background:var(--amber-soft);border:2px solid var(--amber-line);border-inline-start:4px double #b57a10}
.legend i[data-st=out]{background:repeating-linear-gradient(135deg,#fff,#fff 3px,#fbeeed 3px,#fbeeed 6px);border:1.5px dashed var(--bad-line)}
.empty{padding:30px 16px;text-align:center;color:var(--muted);font-size:14.5px}
/* قائمة اليوم */
.days{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding:10px 10px 4px}
.days button{display:flex;flex-direction:column;align-items:center;gap:1px;border:1px solid var(--line);border-radius:13px;background:#fff;padding:7px 2px;font-size:13.5px;font-weight:600;color:var(--muted);min-width:0}
.days button small{font-size:11px;font-weight:500;color:var(--muted2)}
.days button[aria-pressed=true]{background:var(--accent-soft);border-color:var(--accent);color:var(--accent-d)}
.days button[aria-pressed=true] small{color:var(--accent-d)}
.ag{list-style:none;margin:0;padding:8px 10px 12px;display:grid;gap:8px}
.ag li{display:grid;grid-template-columns:78px minmax(0,1fr);gap:10px;align-items:stretch}
.ag .when{display:flex;flex-direction:column;justify-content:center;align-items:center;gap:1px;padding:6px 2px;font-size:13px;font-weight:700;color:var(--ink2);font-variant-numeric:tabular-nums}
.ag .when small{font-weight:500;color:var(--muted2);font-size:11.5px}
.ag .ev{position:static;display:flex;width:100%;padding:10px 12px;font-size:14.5px;gap:3px;border-radius:14px}
.ag .ev .n{white-space:normal;font-size:15px}.ag .ev .t,.ag .ev .p{font-size:13px;white-space:normal}
.ag .ev .tag{font-size:12px;padding:1px 9px}
/* تفاصيل منبثقة */
.ov{position:fixed;inset:0;z-index:40;display:flex;align-items:flex-end;justify-content:center;background:rgba(16,32,24,.42);animation:fadeIn .16s ease-out both}
.dlg{width:min(100%,520px);max-height:86dvh;overflow:auto;background:var(--card);border-radius:22px 22px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom));box-shadow:0 -12px 40px rgba(0,0,0,.22)}
.dlg header{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}
.dlg h3{margin:0;font-size:19px;line-height:1.45}
.dlg h3 small{display:block;font-size:13.5px;font-weight:500;color:var(--muted)}
.x{flex:none;display:grid;place-items:center;width:40px;height:40px;border-radius:12px;border:1px solid var(--line);background:#fff}
.dlg .facts{grid-template-columns:1fr 1fr;margin:12px 0}
@media (min-width:700px){.ov{align-items:center}.dlg{border-radius:22px}}
/* الرد */
.resp{padding:20px}
.resp h2{margin:0 0 4px;font-size:20px}
.resp .lead{margin:0 0 14px;color:var(--muted);font-size:14.5px}
.rows{display:grid;gap:9px;margin:0 0 14px}
.rrow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 13px;border:1px solid var(--line);border-radius:15px;background:#fbfdfc}
.rrow[data-c=approve]{border-color:var(--accent-line);background:var(--accent-soft)}
.rrow[data-c=changes]{border-color:var(--amber-line);background:var(--amber-soft)}
.rrow b{display:block;font-size:15px;line-height:1.5}.rrow small{display:block;color:var(--muted);font-size:12.5px}
.pick{display:inline-flex;gap:6px}
.pick button,.big button{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1.5px solid var(--line2);border-radius:12px;background:#fff;padding:8px 14px;min-height:44px;font-weight:600;font-size:14.5px;color:var(--ink2);transition:background .16s,border-color .16s,color .16s}
.pick button[data-v=approve][aria-pressed=true],.big button[data-v=approve][aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:#fff}
.pick button[data-v=changes][aria-pressed=true],.big button[data-v=changes][aria-pressed=true]{background:#b57a10;border-color:#b57a10;color:#fff}
.big{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 14px}
.big button{min-height:58px;font-size:16px;border-radius:15px}
.quick{margin:0 0 12px}
.link{border:0;background:none;color:var(--accent-d);font-weight:600;text-decoration:underline;text-underline-offset:3px;padding:6px 2px;min-height:36px}
.form{margin-top:4px;padding:14px;border:1px solid var(--amber-line);background:#fffaf0;border-radius:16px;display:grid;gap:14px}
.form h3{margin:0;font-size:16px;color:var(--amber)}
.fld{display:grid;gap:7px}
.fld>span,.fld>legend{font-size:13.5px;font-weight:600;color:var(--ink2)}
fieldset.fld{border:0;margin:0;padding:0;min-width:0}
.chips{display:flex;flex-wrap:wrap;gap:7px}
.chips button{border:1.5px solid var(--line2);background:#fff;border-radius:999px;padding:7px 15px;min-height:42px;font-size:14.5px;color:var(--ink2)}
.chips button[aria-pressed=true]{background:var(--ink);border-color:var(--ink);color:#fff;font-weight:600}
textarea,input[type=time],input.civil{width:100%;padding:11px 13px;border:1.5px solid var(--line2);border-radius:13px;background:#fff;min-height:46px}
textarea{min-height:92px;resize:vertical;line-height:1.7}
input[type=time]{max-width:180px;direction:ltr;text-align:center}
.cnt{font-size:12px;color:var(--muted2);text-align:end}
.sign{display:grid;gap:8px;margin-top:14px;padding:14px;border-radius:16px;background:var(--soft);border:1px solid var(--line)}
.sign label{display:grid;gap:7px;font-size:14px;font-weight:600}
input.civil{direction:ltr;text-align:center;letter-spacing:.14em;font-size:17px;max-width:280px;font-variant-numeric:tabular-nums}
.sign p{margin:0;font-size:12.5px;color:var(--muted);line-height:1.7}
.err{display:flex;gap:9px;align-items:flex-start;margin-top:14px;padding:12px 14px;border-radius:14px;background:var(--bad-soft);border:1px solid var(--bad-line);color:var(--bad);font-size:14.5px}
.err .btn{margin-top:8px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:1.5px solid var(--accent);border-radius:14px;background:var(--accent);color:#fff;padding:11px 20px;min-height:48px;font-weight:700;font-size:15.5px;text-decoration:none;transition:background .16s,opacity .16s}
.btn:hover{background:var(--accent-d)}
.btn[disabled]{opacity:.55;cursor:not-allowed}
.btn.ghost{background:#fff;color:var(--accent-d)}
.btn.ghost:hover{background:var(--accent-soft)}
.btn.full{width:100%}
.sendrow{margin-top:14px;display:grid;gap:8px}
.hint{font-size:13px;color:var(--muted);margin:0}
/* السجل */
details.hist{margin-top:18px;border:1px solid var(--line);border-radius:16px;background:var(--card)}
details.hist summary{cursor:pointer;padding:12px 15px;font-weight:700;font-size:15px;list-style:none;display:flex;align-items:center;gap:8px;border-radius:16px;min-height:48px}
details.hist summary::-webkit-details-marker{display:none}
details.hist[open] summary{border-bottom:1px solid var(--line);border-radius:16px 16px 0 0}
.tl{list-style:none;margin:0;padding:12px 15px 14px;display:grid;gap:12px}
.tl li{position:relative;padding-inline-start:20px;font-size:14px;line-height:1.7}
.tl li::before{content:"";position:absolute;inset-inline-start:2px;top:9px;width:9px;height:9px;border-radius:50%;background:var(--accent-line);border:2px solid #fff;box-shadow:0 0 0 1px var(--accent-line)}
.tl li b{font-weight:700}.tl li small{display:block;color:var(--muted);font-size:12.5px}
.tl li q{display:block;margin-top:2px;color:var(--ink2);quotes:"«" "»"}
/* شريط الرد */
.bar{position:fixed;inset-inline:0;bottom:0;z-index:30;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:rgba(255,255,255,.94);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-top:1px solid var(--line2);box-shadow:0 -8px 28px rgba(22,57,40,.1);transition:transform .2s ease}
.bar[data-hide="1"]{transform:translateY(110%);pointer-events:none}
.bar-in{max-width:1100px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px}
.bar p{margin:0;font-size:14px;line-height:1.5;color:var(--ink2);min-width:0}.bar p b{display:block;font-size:14.5px}
.bar .btn{flex:none;min-height:46px;padding:9px 18px}
/* تحميل */
.sk{border-radius:20px;background:linear-gradient(90deg,#e7eee9 25%,#f3f7f4 50%,#e7eee9 75%);background-size:200% 100%;animation:sh 1.3s linear infinite}
@keyframes sh{to{background-position:-200% 0}}
.state{max-width:520px;margin:12vh auto 0;padding:30px 22px;text-align:center}
.state .big-i{display:grid;place-items:center;width:58px;height:58px;margin:0 auto 12px;border-radius:50%;background:var(--bad-soft);color:var(--bad)}
.state .big-i .i{width:28px;height:28px}
.state h1{margin:0 0 6px;font-size:21px}.state p{margin:0 0 16px;color:var(--muted)}
noscript{display:block;padding:30px;text-align:center}
@media (max-width:639px){
.wrap{padding:10px 12px 32px}.wrap.has-bar{padding-bottom:96px}
.hero{border-radius:20px;padding:18px 16px 14px}.meta li{font-size:13px;padding:5px 10px}
.card,.resp{padding:15px}.op{padding:14px}.sec{margin-top:22px}
.seg button{padding:7px 12px;font-size:14px}
.seg.main{display:flex;width:100%}.seg.main button{flex:1;justify-content:center}
.big{grid-template-columns:1fr}
.rrow{grid-template-columns:1fr}.pick{display:grid;grid-template-columns:1fr 1fr}
.ag li{grid-template-columns:64px minmax(0,1fr);gap:8px}
.bar p small{display:none}
.dlg .facts{grid-template-columns:1fr}
.impact{grid-template-columns:1fr 1fr;gap:8px}.m{padding:12px}.m .val{font-size:18px}
}
@media (max-width:380px){.impact{grid-template-columns:1fr}.bar-in{gap:8px}.bar .btn{padding:9px 13px}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
@media print{body{background:#fff}.bar,.tools,.btn,.seg,.days,.form,.sign,.sendrow,.ov{display:none!important}.wrap{max-width:none;padding:0}.card,.op,.m,.msg,.ttcard,.hero{box-shadow:none;break-inside:avoid}.hero{color:#000;background:#fff;border:1px solid #999}.hero .badge{border:1px solid #999}.meta li{background:#fff;border-color:#bbb}.tt-scroll{overflow:visible}.tt{min-width:0}}
`;

const PAGE_SCRIPT = String.raw`
(function(){
var TOKEN=__TOKEN__,PID=__PID__,host=document.getElementById("host");
var API="/api/public/request/"+encodeURIComponent(TOKEN)+"/proposals/"+encodeURIComponent(PID);
var DAYS=[["fsunday","الأحد"],["fmonday","الاثنين"],["ftuesday","الثلاثاء"],["fwednesday","الأربعاء"],["fthursday","الخميس"]];
var KIND={create:"شعبة جديدة",assign:"إسناد شعبة",edit:"تعديل موعد",replace:"استبدال"};
var KIND_IC={create:"plus",assign:"inflow",edit:"pen",replace:"swap"};
var REASONS=[["time","الوقت"],["place","المكان"],["days","الأيام"],["load","النصاب"],["other","سبب آخر"]];
var REASON_TXT={time:"الوقت",place:"المكان",days:"الأيام",load:"النصاب",other:"سبب آخر"};
var D=null,META={term:"",who:""},LOADING=true,LOADERR=null,LOADCODE=0;
var UI={mode:"after",view:window.innerWidth<640?"agenda":"grid",ghosts:true,day:"",choice:{},linked:"",reason:"",note:"",start:"",sdays:[],civil:"",editing:false,sending:false,err:"",errCode:"",open:null,lastFocus:null,barHide:false};
var CRED={one:"ساعة معتمدة",two:"ساعتان معتمدتان",few:"ساعات معتمدة",many:"ساعة معتمدة"};
${ARABIC_COUNT_SCRIPT}
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function digitsOf(v){return String(v||"").replace(/[٠-٩]/g,function(d){return String("٠١٢٣٤٥٦٧٨٩".indexOf(d))}).replace(/[۰-۹]/g,function(d){return String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))}).replace(/\D/g,"")}
function mins(t){var p=String(t||"0:0").split(":");return (+p[0]||0)*60+(+p[1]||0)}
function pad(n){return (n<10?"0":"")+n}
function clk(t){var p=String(t||"").split(":");return p.length<2?String(t||""):pad(+p[0]||0)+":"+pad(+p[1]||0)}
/* المدى «بداية – نهاية» في عزلٍ يسارِيّ: لا يقلب اتجاهُ الفقرة ترتيبَ الساعتين. */
function rng(s,e){var a=clk(s),b=clk(e);if(!a&&!b)return "—";if(!b)return a;return "⁦"+a+" – "+b+"⁩"}
function rngHtml(s,e){return '<span class="ltr" dir="ltr">\u2066'+esc(clk(s)+" – "+clk(e))+'\u2069</span>'}
function dayName(k){for(var i=0;i<DAYS.length;i++)if(DAYS[i][0]===k)return DAYS[i][1];return k}
function daysText(a){return (a||[]).map(dayName).join(" · ")||"لم تُحدَّد الأيام"}
function dateLong(iso){if(!iso)return "";var d=new Date(iso);if(isNaN(d))return "";
 return d.toLocaleDateString("ar-KW-u-nu-latn",{weekday:"long",day:"numeric",month:"long"})+"، "+d.toLocaleTimeString("ar-KW-u-nu-latn",{hour:"numeric",minute:"2-digit"})}
function dateShort(iso){if(!iso)return "";var d=new Date(iso);if(isNaN(d))return "";
 return d.toLocaleDateString("ar-KW-u-nu-latn",{day:"numeric",month:"long"})+"، "+d.toLocaleTimeString("ar-KW-u-nu-latn",{hour:"numeric",minute:"2-digit"})}
function untilText(iso){if(!iso)return "";var ms=Date.parse(iso)-Date.now();if(isNaN(ms))return "";if(ms<0)return "";
 var d=Math.floor(ms/864e5);if(d>=1)return "بقي "+countOf(d,AR.day);var h=Math.floor(ms/36e5);if(h>=1)return "بقيت "+countOf(h,AR.hour);return "بقيت أقل من ساعة"}
function urgent(iso){var ms=Date.parse(iso)-Date.now();return !isNaN(ms)&&ms>=0&&ms<864e5}
function hm(m){m=Math.max(0,Math.round(+m||0));var h=Math.floor(m/60),r=m%60;
 if(!h)return countOf(r,AR.minute,"لا شيء");if(!r)return countOf(h,AR.hour);return countOf(h,AR.hour)+" و"+countOf(r,AR.minute)}
var ICONS={
clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
pen:'<path d="M4 20l1.2-4.2L16.6 4.4a2 2 0 013 3L8.2 18.8z"/><path d="M14.5 6.5l3 3"/>',
plus:'<path d="M12 5v14M5 12h14"/>',
inflow:'<path d="M12 4v11"/><path d="M7.5 11l4.5 4.5L16.5 11"/><path d="M5 20h14"/>',
outflow:'<path d="M12 15V4"/><path d="M7.5 8L12 3.5 16.5 8"/><path d="M5 20h14"/>',
swap:'<path d="M5 8h13l-3-3"/><path d="M19 16H6l3 3"/>',
x:'<path d="M6 6l12 12M18 6L6 18"/>',
alert:'<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
up:'<path d="M12 19V6"/><path d="M6.5 11.5L12 6l5.5 5.5"/>',
down:'<path d="M12 5v13"/><path d="M6.5 12.5L12 18l5.5-5.5"/>',
same:'<path d="M5 12h14"/>',
cal:'<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
pin:'<path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
user:'<circle cx="12" cy="8" r="4"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6"/>',
ban:'<circle cx="12" cy="12" r="9"/><path d="M5.7 5.7l12.6 12.6"/>',
shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
refresh:'<path d="M20 11a8 8 0 00-14.5-4M4 4v4h4"/><path d="M4 13a8 8 0 0014.5 4M20 20v-4h-4"/>',
send:'<path d="M4 12l16-8-6 16-3-7z"/><path d="M11 13l9-9"/>',
grid:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 10h16M10 4v16"/>',
list:'<path d="M9 7h11M9 12h11M9 17h11"/><path d="M4.5 7h.01M4.5 12h.01M4.5 17h.01"/>',
book:'<path d="M5 4h10a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h10"/>',
chart:'<path d="M5 20V10M12 20V4M19 20v-7"/>',
hourglass:'<path d="M7 3h10M7 21h10"/><path d="M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/>',
msg:'<path d="M5 5h14a2 2 0 012 2v8a2 2 0 01-2 2h-7l-5 4v-4H5a2 2 0 01-2-2V7a2 2 0 012-2z"/>'};
function ic(n){return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'+(ICONS[n]||"")+'</svg>'}
function statusInfo(p){var s=p.status;
 if(p.committedAt)return {tone:"ok",icon:"shield",text:"ثبّته القسم في جدولك"};
 if(s==="sent")return {tone:"wait",icon:"hourglass",text:"بانتظار ردّك"};
 if(s==="approved")return {tone:"ok",icon:"check",text:"وافقتَ · بانتظار تثبيت القسم"};
 if(s==="partial")return {tone:"wait",icon:"check",text:"موافقة جزئية · بانتظار القسم"};
 if(s==="changes")return {tone:"wait",icon:"pen",text:"طلبتَ تعديلاً · عند القسم"};
 if(s==="withdrawn")return {tone:"mute",icon:"ban",text:"سحبه القسم"};
 if(s==="expired")return {tone:"bad",icon:"clock",text:"انتهت مهلة الرد"};
 if(s==="committed")return {tone:"ok",icon:"shield",text:"ثبّته القسم في جدولك"};
 return {tone:"info",icon:"info",text:p.statusLabel||"مقترح"}}
function place(o){return o&&o.placeKnown===false?"القاعة لم تُحدد":(o&&o.place)||"القاعة لم تُحدد"}
function placeOf(x){return (x&&x.place)?x.place:"القاعة لم تُحدد"}
function opOf(id){var o=D.ops||[];for(var i=0;i<o.length;i++)if(o[i].id===id)return o[i];return null}
function opName(o){return (o.target.courseName||o.target.courseCode||"مقرر")+(o.target.SCode?" · شعبة "+o.target.SCode:"")}
function liveRegion(t){var el=document.getElementById("live");if(el)el.textContent=t}

/* ── مناطق الصفحة: كلُّ منطقةٍ تُرسم وحدها وتُعاد إليها بؤرةُ الإدخال ─────────── */
function setRegion(id,html){var el=document.getElementById(id);if(!el)return;
 var a=document.activeElement,k=a&&a!==document.body&&el.contains(a)?a.getAttribute("data-k"):null;
 var st=null;if(k&&a&&typeof a.selectionStart==="number"){try{st=[a.selectionStart,a.selectionEnd]}catch(e){}}
 el.innerHTML=html;
 if(k){var n=el.querySelector('[data-k="'+k+'"]');if(n){try{n.focus({preventScroll:true});if(st&&typeof n.setSelectionRange==="function")n.setSelectionRange(st[0],st[1])}catch(e){}}}}

/* ── الهيدر والتنبيهات ───────────────────────────────────────────────────── */
function heroHtml(){var p=D,si=statusInfo(p),h='';
 h+='<div class="hero-top"><span class="brand">SCHEDULE · مقترح دراسي</span><span class="badge" data-tone="'+si.tone+'">'+ic(si.icon)+esc(si.text)+'</span></div>';
 h+='<h1>'+esc(p.title||"مقترح دراسي")+'</h1>';
 h+='<p class="who">'+esc(META.who||"")+(META.who&&META.term?" · ":"")+esc(META.term||"")+'</p>';
 h+='<ul class="meta">';
 if(p.expiresAt&&!p.committedAt&&p.gate&&p.gate.open){var u=untilText(p.expiresAt);
  h+='<li'+(urgent(p.expiresAt)?' data-urgent="1"':'')+'>'+ic("clock")+'<span>آخر موعد للرد: <b>'+esc(dateLong(p.expiresAt))+'</b>'+(u?' · '+esc(u):'')+'</span></li>'}
 else if(p.expiresAt&&p.status==="expired")h+='<li>'+ic("clock")+'<span>انتهت المهلة في <b>'+esc(dateLong(p.expiresAt))+'</b></span></li>';
 if(p.version>1)h+='<li>'+ic("refresh")+'<span><b>النسخة '+esc(p.version)+'</b> · بعد مراجعة القسم</span></li>';
 if(p.sentAt)h+='<li>'+ic("send")+'<span>أُرسل '+esc(dateShort(p.sentAt))+(p.sentByName?' · '+esc(p.sentByName):'')+'</span></li>';
 h+='</ul>';return h}
function noteHtml(tone,icon,title,body,extra){return '<div class="note" data-tone="'+tone+'" role="'+(tone==="bad"?"alert":"status")+'">'+ic(icon)+'<div><b>'+esc(title)+'</b>'+(body?'<p>'+esc(body)+'</p>':'')+(extra||'')+'</div></div>'}
function alertsHtml(){var p=D,h='',g=p.gate||{};
 if(p.committedAt){h+=noteHtml("ok","shield","ثبّت القسم هذا المقترح في جدولك","يمكنك الاطّلاع أدناه على ما طُبّق وما لم يُطبَّق في كل مادة.")}
 else if(!g.open){var tone=p.status==="withdrawn"?"mute":"bad";
  h+=noteHtml(tone==="mute"?"info":"bad",p.status==="withdrawn"?"ban":"clock",p.status==="withdrawn"?"سحب القسم هذا المقترح":(p.version!==p.workingVersion?"يعدّل القسم المقترح الآن":"أُغلق باب الرد"),g.reason||"",p.version!==p.workingVersion?'':'')}
 if(p.stale&&!p.committedAt&&p.status!=="withdrawn")h+=noteHtml("info","info","تغيّرت بعض بيانات الجدول بعد إرسال المقترح","سيعيد القسم مراجعته قبل التثبيت.");
 var d=p.decision||{};
 if(!p.committedAt&&(d.approved&&d.approved.length||d.changes&&d.changes.length)&&p.status!=="withdrawn"){h+=recordedHtml(true)}
 return h}
/* ما سُجّل من ردّك: بكلماتٍ لا تدّعي أن الجدول تغيّر. */
function recordedHtml(compact){var d=D.decision||{},a=(d.approved||[]).length,c=(d.changes||[]).length,p=(d.pending||[]).length,all=(D.ops||[]).length,h='';
 if(!a&&!c)return "";
 var lines=[];
 if(a&&!c&&!p)lines.push("تم تسجيل موافقتك · بانتظار تثبيت القسم");
 else if(a)lines.push("تم تسجيل موافقتك"+(all>1?" على "+countOf(a,AR.course)+" من "+countOf(all,AR.course):"")+" · بانتظار تثبيت القسم");
 if(c)lines.push("سجّلنا طلب التعديل · سيراجعه القسم");
 var tone=c?"wait":"ok";
 var body="لم يتغيّر جدولك: لا يُطبَّق شيءٌ قبل أن يثبّت القسم المقترح."+(p?" وبقيت "+countOf(p,AR.course)+" بانتظار ردّك.":"");
 return '<div class="note" data-tone="'+tone+'" role="status" data-k="recorded">'+ic(c?"pen":"check")+'<div>'+lines.map(function(l){return '<b>'+esc(l)+'</b>'}).join("")+'<p>'+esc(body)+'</p></div></div>'}
function msgHtml(){if(!D.message)return "";return '<small>رسالة القسم'+(D.sentByName?' · '+esc(D.sentByName):'')+'</small><p>'+esc(D.message)+'</p>'}

/* ── مواد المقترح ────────────────────────────────────────────────────────── */
function factsHtml(t){
 return '<dl class="facts">'+
 '<div><dt>'+ic("cal")+'</dt><dd><span class="lbl">الأيام</span>'+esc(daysText(t.days))+'</dd></div>'+
 '<div><dt>'+ic("clock")+'</dt><dd><span class="lbl">الوقت</span>'+rngHtml(t.start,t.end)+'</dd></div>'+
 '<div><dt>'+ic("pin")+'</dt><dd><span class="lbl">المكان</span>'+(t.placeKnown===false?'<span class="dim">القاعة لم تُحدد</span>':esc(t.place||"القاعة لم تُحدد"))+'</dd></div></dl>'}
function whereLine(x){return daysText(x.days)+" · "+rng(x.start,x.end)}
function whatChanges(o){var h='',t=o.target;
 if(o.kind==="create")h='<div class="row" data-r="in">'+ic("plus")+'<span><b>تُفتح لك شعبةٌ جديدة</b> في جدولك إن وافقتَ وثبّت القسم المقترح.</span></div>';
 else if(o.kind==="assign"){h='<div class="row" data-r="in">'+ic("inflow")+'<span><b>تُسند إليك شعبةٌ قائمة</b> في جدول القسم، ولا تُفتح شعبةٌ جديدة.</span></div>';
  if(o.adjusted)h+='<span class="why">عُدّل وقتُ هذه الشعبة أو مكانها ليلائم جدولك؛ الموعد أدناه هو المقترح لك.</span>'}
 else if(o.kind==="edit"){var b=o.before||{};
  h='<div class="ba"><span>الآن</span><div class="was">'+esc(daysText(b.days))+' · '+rngHtml(b.start,b.end)+(b.place?' · '+esc(b.place):'')+'</div><span>المقترح</span><div><b>'+esc(daysText(t.days))+' · </b>'+rngHtml(t.start,t.end)+' · '+esc(placeOf(t))+'</div></div>'}
 else if(o.kind==="replace"){var u=o.out;
  if(u)h+='<div class="row" data-r="out">'+ic("outflow")+'<span><b>يخرج من جدولك:</b> '+esc(u.courseName||u.courseCode||"")+(u.SCode?' · شعبة '+esc(u.SCode):'')+' · '+esc(daysText(u.days))+' · '+rngHtml(u.start,u.end)+'</span></div>';
  h+='<div class="row" data-r="in">'+ic("inflow")+'<span><b>يدخل:</b> '+esc(opName(o))+' · '+esc(o.incoming==="create"?"شعبةٌ جديدة":"شعبةٌ قائمة في جدول القسم")+'</span></div>';
  if(u)h+='<span class="why">'+(u.action==="delete"?"يُحذف الموعد الخارج من الجدول كلّه، فلا يبقى لأحدٍ في جدول القسم.":"تبقى الشعبة الخارجة في جدول القسم كما هي، وتُرفع من جدولك أنت فقط.")+'</span>'}
 return h?'<div class="chg">'+h+'</div>':""}
function opResultHtml(o){var d=D.decision||{},s="";
 if(o.result==="applied")return '<div class="opres" data-s="approve">'+ic("shield")+'طُبّقت هذه المادة في جدولك</div>';
 if(o.result==="skipped")return '<div class="opres" data-s="skipped">'+ic("alert")+'لم تُطبَّق هذه المادة عند التثبيت · سيوضّح لك القسم السبب</div>';
 if((d.approved||[]).indexOf(o.id)>=0)return '<div class="opres" data-s="approve">'+ic("check")+'سجّلتَ موافقتك على هذه المادة</div>';
 if((d.changes||[]).indexOf(o.id)>=0)return '<div class="opres" data-s="changes">'+ic("pen")+'طلبتَ تعديلها</div>';
 if((D.responses||[]).length)return '<div class="opres" data-s="pending">'+ic("hourglass")+'بانتظار ردّك</div>';
 return ""}
function opsHtml(){var ops=D.ops||[];if(!ops.length)return '<div class="card empty">لا مواد في هذا المقترح.</div>';
 return '<div class="ops">'+ops.map(function(o,i){var t=o.target;
  return '<article class="op" aria-label="'+esc(KIND[o.kind]+": "+opName(o))+'"><div class="op-head"><span class="kind" data-k="'+o.kind+'">'+ic(KIND_IC[o.kind])+esc(KIND[o.kind]||o.kind)+'</span><span class="hint">المادة '+(i+1)+' من '+ops.length+'</span></div>'+
  '<h3>'+esc(t.courseName||t.courseCode||"المقرر")+'<small>'+esc(t.courseCode||"")+(t.SCode?' · شعبة '+esc(t.SCode):'')+(t.collegeName?' · '+esc(t.collegeName):'')+'</small></h3>'+
  factsHtml(t)+whatChanges(o)+opResultHtml(o)+'</article>'}).join("")+'</div>'}

/* ── الأثر ───────────────────────────────────────────────────────────────── */
function metricCard(o){var b=o.b,a=o.a,known=(b!=null&&a!=null),same=known&&Math.round(b*100)===Math.round(a*100);
 var h='<div class="m" data-ch="'+(known&&!same?1:0)+'"><div class="lab">'+ic(o.icon)+esc(o.label)+'</div>';
 if(a==null){h+='<div class="val">غير متوفر</div><div class="sub">'+esc(o.missing||"لم تُسجَّل البيانات اللازمة لحسابه.")+'</div>'}
 else{h+='<div class="val">'+o.fmt(a)+'</div>';
  if(b==null)h+='<div class="cmp"><span class="was">الآن: غير متوفر</span></div>';
  else{var d=a-b,dir=same?"same":(d>0?"up":"down");
   h+='<div class="cmp"><span class="was">الآن: '+o.fmt(b,true)+'</span><span class="dir" data-d="'+dir+'">'+ic(dir)+(same?"دون تغيّر":(d>0?"زيادة ":"نقص ")+o.delta(Math.abs(d)))+'</span></div>'}
  if(o.sub)h+='<div class="sub">'+o.sub+'</div>';
  if(o.warn)h+=o.warn}
 return h+'</div>'}
function impactHtml(){var S=D.schedule;if(!S)return "";var b=S.before.metrics,a=S.after.metrics,cap=S.loadCap,u=function(n){return countOf(n,CRED)};
 var warn="";if(cap&&a.loadUnits!=null&&a.loadUnits>cap)warn='<div class="warn">'+ic("alert")+'يتجاوز النصاب المسجّل ('+esc(cap)+') بمقدار '+esc(countOf(a.loadUnits-cap,CRED))+'</div>';
 var cards=[
 {icon:"book",label:"النصاب",b:b.loadUnits,a:a.loadUnits,fmt:function(v){return esc(u(v))},delta:function(v){return esc(u(v))},sub:cap?"النصاب المسجّل: "+esc(countOf(cap,AR.hour)):"",missing:"ساعات مقرراتك غير مسجّلة لدى القسم بعد.",warn:warn},
 {icon:"grid",label:"عدد الشعب",b:b.sections,a:a.sections,fmt:function(v){return esc(countOf(v,AR.section))},delta:function(v){return esc(countOf(v,AR.section))}},
 {icon:"cal",label:"أيام الحضور",b:b.attendanceDays,a:a.attendanceDays,fmt:function(v){return esc(countOf(v,AR.day,"لا أيام"))},delta:function(v){return esc(countOf(v,AR.day))},sub:esc((a.dayKeys||[]).map(dayName).join(" · "))},
 {icon:"user",label:"ساعات الحضور",b:b.presenceMinutes,a:a.presenceMinutes,fmt:function(v){return esc(hm(v))},delta:function(v){return esc(hm(v))},sub:"من أول محاضرة إلى آخر محاضرة في كل يوم"},
 {icon:"clock",label:"ساعات التدريس",b:b.teachingMinutes,a:a.teachingMinutes,fmt:function(v){return esc(hm(v))},delta:function(v){return esc(hm(v))},sub:"زمن المحاضرات نفسها دون الفراغات"},
 {icon:"hourglass",label:"الفراغات بين المحاضرات",b:b.gapMinutes,a:a.gapMinutes,fmt:function(v,was){return esc(v?hm(v):"لا فراغات")},delta:function(v){return esc(hm(v))},sub:a.maxGap?"أطول فراغ: "+esc(hm(a.maxGap)):""}];
 return '<div class="impact">'+cards.map(metricCard).join("")+'</div>'}

/* ── الجدول الأسبوعي ─────────────────────────────────────────────────────── */
var START=8*60,END=20*60;
function itemsNow(){var S=D.schedule;if(!S)return [];
 if(D.committedAt)return S.after.items.map(function(it){var c={};for(var k in it)c[k]=it[k];c.state="current";return c});
 if(UI.mode==="before")return S.before.items.slice();
 var l=S.after.items.slice();if(UI.ghosts)l=l.concat(S.after.ghosts||[]);return l}
function lanesFor(list){list.sort(function(a,b){return a.s-b.s||b.e-a.e});
 var out=[],cl=[],ce=0;
 function flush(){var ends=[];cl.forEach(function(c){var l=0;while(l<ends.length&&ends[l]>c.s)l++;ends[l]=c.e;c.lane=l});
  var n=ends.length;cl.forEach(function(c){c.lanes=n;out.push(c)});cl=[]}
 list.forEach(function(c){if(cl.length&&c.s>=ce)flush();cl.push(c);ce=Math.max(ce,c.e)});
 if(cl.length)flush();return out}
function stLabel(it){if(it.state==="proposed")return "مقترح";if(it.state==="modified")return "معدّل";
 if(it.state==="out")return it.outAction==="delete"?"يُحذف":it.outAction==="unassign"?"يخرج":"قبل التعديل";return ""}
function stIcon(it){return it.state==="proposed"?"plus":it.state==="modified"?"pen":it.state==="out"?"x":""}
function evAria(it,day){var l=stLabel(it);return (l?l+": ":"")+it.courseName+(it.SCode?"، شعبة "+it.SCode:"")+"، "+(day?dayName(day)+"، ":"")+rng(it.start,it.end)+"، "+placeOf(it)}
function evHtml(it,pos,day,swap){var s=mins(it.start),e=mins(it.end),h=pos?(e-s)/60:0,st=it.state,lbl=stLabel(it);
 var tag=lbl?'<span class="tag">'+ic(stIcon(it))+'<span>'+esc(lbl)+'</span></span>':'';
 var core=tag+'<span class="n">'+esc(it.courseName||it.courseCode)+'</span>'+(it.SCode?'<span class="t sc">شعبة '+esc(it.SCode)+'</span>':'')+'<span class="t">'+rngHtml(it.start,it.end)+'</span><span class="p">'+esc(placeOf(it))+'</span>';
 if(!pos)return '<button type="button" class="ev'+(swap?' swap':'')+'" data-st="'+st+'" data-act="open" data-key="'+esc(it.key)+'" data-day="'+day+'" aria-haspopup="dialog" aria-label="'+esc(evAria(it,day))+'">'+core+'</button>';
 var style='top:calc(var(--H)*'+((s-START)/60).toFixed(4)+');height:calc(var(--H)*'+h.toFixed(4)+' - 2px);inset-inline-start:calc('+pos.lane+'*100%/'+pos.lanes+' + 1px);width:calc(100%/'+pos.lanes+' - 3px)';
 var short=(e-s)<=80,tiny=(e-s)<=55,micro=(e-s)<=45;
 return '<button type="button" class="ev'+(swap?' swap':'')+'" data-st="'+st+'" data-compact="'+(pos.lanes>=3?1:0)+'" data-short="'+(short?1:0)+'" data-tg="'+(lbl?1:0)+'" data-tiny="'+(tiny?1:0)+'" data-micro="'+(micro?1:0)+'" style="'+style+'" data-act="open" data-key="'+esc(it.key)+'" data-day="'+day+'" aria-haspopup="dialog" aria-label="'+esc(evAria(it,day))+'">'+core+'</button>'}
function itemsOfDay(list,day){return list.filter(function(it){return (it.days||[]).indexOf(day)>=0&&mins(it.end)>mins(it.start)})}
function ttSummary(list){if(D.committedAt)return '<span>جدولك بعد أن ثبّت القسم المقترح: '+esc(countOf(list.length,AR.section))+'</span>';var c={proposed:0,modified:0,out:0};list.forEach(function(it){if(c[it.state]!=null)c[it.state]++});
 var h='';if(UI.mode==="before")return '<span>جدولك الحالي: '+esc(countOf(D.schedule.before.items.length,AR.section))+' · كما هو قبل أي تغيير</span>';
 if(c.proposed)h+='<span class="pill" data-st="proposed">'+ic("plus")+esc(countOf(c.proposed,AR.appointment))+' مقترح</span>';
 if(c.modified)h+='<span class="pill" data-st="modified">'+ic("pen")+esc(countOf(c.modified,AR.appointment))+' معدّل</span>';
 if(c.out)h+='<span class="pill" data-st="out">'+ic("x")+esc(countOf(c.out,AR.appointment))+' يخرج أو يتغيّر</span>';
 if(!h)h='<span>لا يغيّر هذا المقترح مواعيدك الحالية.</span>';
 else h='<span>في هذا العرض:</span>'+h;
 return h}
function legendHtml(){var h='<span><i data-st="current"></i>موعد قائم</span>';
 if(UI.mode==="after"&&!D.committedAt){h+='<span><i data-st="proposed"></i>مقترح (جديد)</span><span><i data-st="modified"></i>معدّل</span>';if(UI.ghosts&&D.schedule.after.ghosts&&D.schedule.after.ghosts.length)h+='<span><i data-st="out"></i>يخرج أو كان قبل التعديل</span>'}return h}
function dayCount(list,k){return itemsOfDay(list,k).length}
function ttHtml(swap){var S=D.schedule;if(!S)return "";var list=itemsNow(),done=!!D.committedAt,hasGhost=!done&&UI.mode==="after"&&(S.after.ghosts||[]).length>0;
 var h='<div class="tools">'+(done?'':'<div class="seg main" role="group" aria-label="اختر الجدول المعروض">'+
  '<button type="button" data-act="mode" data-v="before" data-k="m-before" aria-pressed="'+(UI.mode==="before")+'">جدولي الحالي</button>'+
  '<button type="button" data-act="mode" data-v="after" data-k="m-after" aria-pressed="'+(UI.mode==="after")+'">بعد المقترح</button></div>')+
  '<div class="seg sm" role="group" aria-label="طريقة العرض"><button type="button" data-act="view" data-v="grid" data-k="v-grid" aria-pressed="'+(UI.view==="grid")+'">'+ic("grid")+'أسبوعي</button>'+
  '<button type="button" data-act="view" data-v="agenda" data-k="v-agenda" aria-pressed="'+(UI.view==="agenda")+'">'+ic("list")+'عرض يومي</button></div>'+
  (hasGhost?'<label class="chk"><input type="checkbox" data-act="ghosts" data-k="g"'+(UI.ghosts?' checked':'')+'>أظهر ما سيخرج أو يتغيّر</label>':'')+'</div>';
 h+='<div class="ttcard"><div class="tt-sum" aria-live="polite">'+ttSummary(list)+'</div>';
 if(UI.view==="agenda")h+=agendaHtml(list,swap);else h+=gridHtml(list,swap);
 h+='<div class="legend" aria-label="دليل الألوان والأنماط">'+legendHtml()+'</div></div>';return h}
function gridHtml(list,swap){var h='<div class="tt-scroll" tabindex="-1"><div class="tt" role="group" aria-label="الجدول الأسبوعي من الأحد إلى الخميس"><div class="tt-row tt-head"><div></div>'+DAYS.map(function(d){return '<div>'+d[1]+'</div>'}).join("")+'</div><div class="tt-row"><div class="tt-times" aria-hidden="true">';
 for(var hr=8;hr<=19;hr++)h+='<span style="top:calc(var(--H)*'+(hr-8)+')">'+pad(hr)+':00</span>';
 h+='</div>';
 DAYS.forEach(function(d){var rows=itemsOfDay(list,d[0]).map(function(it){return {it:it,s:Math.max(START,mins(it.start)),e:Math.min(END,mins(it.end))}});
  h+='<div class="tt-col" role="group" aria-label="'+d[1]+'">'+lanesFor(rows).map(function(c){return evHtml(c.it,c,d[0],swap)}).join("")+'</div>'});
 h+='</div></div></div>';if(!list.length)h+='<div class="empty">لا مواعيد لعرضها.</div>';return h}
function agendaHtml(list,swap){if(!UI.day)UI.day=firstDay(list);
 var h='<div class="days" role="group" aria-label="اختر اليوم">'+DAYS.map(function(d){var n=dayCount(list,d[0]);
  return '<button type="button" data-act="day" data-v="'+d[0]+'" data-k="d-'+d[0]+'" aria-pressed="'+(UI.day===d[0])+'">'+d[1]+'<small>'+(n?esc(n):'—')+'</small></button>'}).join("")+'</div>';
 var items=itemsOfDay(list,UI.day).sort(function(a,b){return mins(a.start)-mins(b.start)||mins(a.end)-mins(b.end)});
 if(!items.length)return h+'<div class="empty">لا محاضرات يوم '+dayName(UI.day)+'.</div>';
 return h+'<ol class="ag" aria-label="محاضرات يوم '+dayName(UI.day)+'">'+items.map(function(it){return '<li><div class="when"><span class="ltr">'+esc(clk(it.start))+'</span><small class="ltr">'+esc(clk(it.end))+'</small></div>'+evHtml(it,null,UI.day,swap)+'</li>'}).join("")+'</ol>'}
function firstDay(list){for(var i=0;i<DAYS.length;i++)if(dayCount(list,DAYS[i][0]))return DAYS[i][0];return DAYS[0][0]}

/* ── تفاصيل موعد ─────────────────────────────────────────────────────────── */
function findItem(key){var S=D.schedule,all=S.before.items.concat(S.after.items,S.after.ghosts||[]);for(var i=0;i<all.length;i++)if(all[i].key===key)return all[i];return null}
function itemNote(it){var o=it.opId?opOf(it.opId):null;
 if(it.state==="current")return UI.mode==="before"?"موعدٌ قائم في جدولك الآن.":"موعدٌ قائم في جدولك، ولا يتغيّر بهذا المقترح.";
 if(it.state==="proposed"){return o?("يُضاف إلى جدولك إن وافقتَ وثبّت القسم المقترح · "+KIND[o.kind]+"."):"يُضاف إلى جدولك إن وافقتَ وثبّت القسم المقترح."}
 if(it.state==="modified"){var b=o&&o.before;return "هذا الموعد قائمٌ في جدولك ويُعدَّل وقتُه أو مكانه."+(b?" كان: "+daysText(b.days)+" · "+rng(b.start,b.end)+(b.place?" · "+b.place:"")+".":"")}
 if(it.state==="out"){if(it.outAction==="delete")return "يُحذف هذا الموعد من الجدول إن ثبّت القسم المقترح.";if(it.outAction==="unassign")return "يخرج من جدولك فقط إن ثبّت القسم المقترح، وتبقى الشعبة في جدول القسم.";return "هذا موعدك الحالي قبل التعديل، ويحلّ محلَّه الموعدُ المعدّل."}return ""}
function dlgHtml(it){var lbl=stLabel(it);
 return '<div class="ov" data-act="close-ov"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlgT" tabindex="-1"><header><h3 id="dlgT">'+esc(it.courseName||it.courseCode)+'<small>'+esc(it.courseCode||"")+(it.SCode?' · شعبة '+esc(it.SCode):'')+'</small></h3><button type="button" class="x" data-act="close" aria-label="إغلاق التفاصيل">'+ic("x")+'</button></header>'+
 (lbl?'<span class="badge" data-tone="'+(it.state==="out"?"bad":it.state==="modified"?"wait":"ok")+'">'+ic(stIcon(it))+esc(lbl)+'</span>':'<span class="badge" data-tone="mute">'+ic("check")+'قائم في جدولك</span>')+
 factsHtml(it)+(it.collegeName||it.sectionName?'<p class="hint">'+esc([it.collegeName,it.sectionName].filter(Boolean).join(" · "))+'</p>':'')+
 '<div class="chg" style="margin-top:10px">'+esc(itemNote(it))+'</div></div></div>'}
function openItem(key,from){var it=findItem(key);if(!it)return;UI.open=key;UI.lastFocus=from||null;
 var root=document.getElementById("dlg");root.innerHTML=dlgHtml(it);var d=root.querySelector(".dlg");if(d)d.focus();liveRegion("فُتحت تفاصيل الموعد")}
function closeItem(){var root=document.getElementById("dlg");root.innerHTML="";UI.open=null;
 var f=UI.lastFocus;if(f&&document.body.contains(f)){try{f.focus({preventScroll:true})}catch(e){}}else if(f&&f.getAttribute){var q=document.querySelector('[data-key="'+f.getAttribute("data-key")+'"][data-day="'+f.getAttribute("data-day")+'"]');if(q)q.focus({preventScroll:true})}UI.lastFocus=null}

/* ── الرد ────────────────────────────────────────────────────────────────── */
function wantsChange(){if(D.responseMode==="linked")return UI.linked==="changes";for(var k in UI.choice)if(UI.choice[k]==="changes")return true;return false}
function anyChoice(){if(D.responseMode==="linked")return !!UI.linked;for(var k in UI.choice)if(UI.choice[k])return true;return false}
function seedFromRecorded(){var d=D.decision||{};UI.choice={};UI.linked="";
 if(D.responseMode==="linked"){if((d.approved||[]).length)UI.linked="approve";else if((d.changes||[]).length)UI.linked="changes"}
 else{(d.approved||[]).forEach(function(i){UI.choice[i]="approve"});(d.changes||[]).forEach(function(i){UI.choice[i]="changes"})}}
function hasRecorded(){var d=D.decision||{};return (d.approved||[]).length+(d.changes||[]).length>0}
function respHtml(){var p=D,g=p.gate||{},h='';
 h+='<section class="card resp" id="respcard" aria-labelledby="respT"><h2 id="respT">ردّك على المقترح</h2>';
 if(p.committedAt){h+='<p class="lead">أُغلق باب الرد لأن القسم ثبّت المقترح. تجد في كل مادة أعلاه ما طُبّق منها.</p>'+historyBlock()+'</section>';return h}
 if(!g.open){h+='<div class="note" data-tone="'+(p.status==="withdrawn"?"info":"bad")+'" role="status" style="margin-top:6px">'+ic(p.status==="withdrawn"?"ban":"clock")+'<div><b>لا يمكن الرد الآن</b><p>'+esc(g.reason||"أُغلق باب الرد.")+'</p></div></div>'+
  (p.version!==p.workingVersion?'<p class="hint" style="margin-top:12px">ستصلك رسالةٌ بالنسخة الجديدة، ويمكنك تحديث الصفحة لاحقاً.</p><button type="button" class="btn ghost" data-act="reload" data-k="reload" style="margin-top:10px">'+ic("refresh")+'حدّث الصفحة</button>':'')+historyBlock()+'</section>';return h}
 if(hasRecorded()&&!UI.editing){h+='<p class="lead">هذا ما سجّلناه من ردّك على النسخة '+esc(p.version)+'. يمكنك تغييره ما دام القسم لم يثبّت المقترح.</p>'+recordedHtml()+
  '<div class="sendrow"><button type="button" class="btn ghost" data-act="edit" data-k="edit">'+ic("pen")+'غيّر ردّي</button></div>'+historyBlock()+'</section>';return h}
 var linked=p.responseMode==="linked";
 h+='<p class="lead">'+(linked?"هذا ترتيبٌ واحد متكامل: توافق على المجموعة كاملة أو تطلب تعديلها.":"اختر ردّك على كل مادة. ما تتركه دون اختيار يبقى بانتظار ردّك.")+' الموافقة لا تغيّر جدولك قبل أن يثبّت القسم.</p>';
 if(linked){h+='<div class="note" data-tone="info" style="margin:0 0 14px">'+ic("info")+'<div><b>ترتيبٌ واحد لا يتجزّأ</b><p>يوافق الأستاذ على المجموعة كاملة أو يطلب تعديلها. لا موافقةَ على بعض المواد دون بعض.</p></div></div>'+
  '<div class="big" role="group" aria-label="ردّك على المقترح كاملاً"><button type="button" data-act="linked" data-v="approve" data-k="l-ok" aria-pressed="'+(UI.linked==="approve")+'">'+ic("check")+'أوافق على المقترح</button><button type="button" data-act="linked" data-v="changes" data-k="l-ch" aria-pressed="'+(UI.linked==="changes")+'">'+ic("pen")+'أحتاج تعديلاً</button></div>'}
 else{h+='<div class="quick"><button type="button" class="link" data-act="all-ok" data-k="all-ok">أوافق على كل المواد</button></div><div class="rows">'+(p.ops||[]).map(function(o,i){var c=UI.choice[o.id]||"";
  return '<div class="rrow" data-c="'+c+'" role="group" aria-label="ردّك على '+esc(opName(o))+'"><div><b>'+esc(o.target.courseName||o.target.courseCode)+(o.target.SCode?' · شعبة '+esc(o.target.SCode):'')+'</b><small>'+esc(KIND[o.kind])+' · '+esc(daysText(o.target.days))+' · '+rngHtml(o.target.start,o.target.end)+'</small></div>'+
  '<div class="pick"><button type="button" data-act="choice" data-op="'+esc(o.id)+'" data-v="approve" data-k="c-'+i+'-a" aria-pressed="'+(c==="approve")+'">'+ic("check")+'أوافق</button><button type="button" data-act="choice" data-op="'+esc(o.id)+'" data-v="changes" data-k="c-'+i+'-c" aria-pressed="'+(c==="changes")+'">'+ic("pen")+'أحتاج تعديلاً</button></div></div>'}).join("")+'</div>'}
 if(wantsChange()){h+='<div class="form"><h3>ما الذي تحتاج تعديله؟</h3>'+
  '<fieldset class="fld"><legend>السبب الرئيسي</legend><div class="chips">'+REASONS.map(function(r){return '<button type="button" data-act="reason" data-v="'+r[0]+'" data-k="r-'+r[0]+'" aria-pressed="'+(UI.reason===r[0])+'">'+r[1]+'</button>'}).join("")+'</div></fieldset>'+
  '<label class="fld"><span>ملاحظتك للقسم (اختياري إن اخترت سبباً)</span><textarea data-k="note" data-input="note" maxlength="600" placeholder="مثال: لديّ التزامٌ في هذا الوقت، وأفضّل ما بعد الظهر.">'+esc(UI.note)+'</textarea><span class="cnt" data-cnt="1">'+esc(UI.note.length)+' / 600</span></label>'+
  '<label class="fld"><span>وقت بداية تقترحه (اختياري)</span><input type="time" data-k="start" data-input="start" min="08:00" max="19:00" value="'+esc(UI.start)+'"></label>'+
  '<fieldset class="fld"><legend>أيام تقترحها (اختياري)</legend><div class="chips">'+DAYS.map(function(d){return '<button type="button" data-act="sday" data-v="'+d[0]+'" data-k="sd-'+d[0]+'" aria-pressed="'+(UI.sdays.indexOf(d[0])>=0)+'">'+d[1]+'</button>'}).join("")+'</div></fieldset></div>'}
 h+='<div class="sign"><label for="civil">رقمك المدني — توقيعك على هذا الرد<input class="civil" id="civil" data-k="civil" data-input="civil" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="12 رقمًا" value="'+esc(UI.civil)+'"></label>'+
  '<p>بإدخال رقمك المدني والضغط على زر الإرسال فأنت توقّع هذا الرد باسمك. لا يُحفظ الرقم في هذا المتصفح.</p></div>';
 if(UI.err)h+='<div class="err" role="alert" id="err">'+ic("alert")+'<div>'+esc(UI.err)+((UI.errCode==="stale-version"||UI.errCode==="closed"||UI.errCode==="busy")?'<br><button type="button" class="btn ghost" data-act="reload" data-k="reload">'+ic("refresh")+(UI.errCode==="stale-version"?"افتح النسخة الأحدث":"حدّث الصفحة")+'</button>':'')+'</div></div>';
 var label=!anyChoice()?"اختر ردّك أولاً":(wantsChange()?"أرسل طلب التعديل":"أرسل موافقتي");
 h+='<div class="sendrow"><button type="button" class="btn full" data-act="send" data-k="send"'+((UI.sending||!anyChoice())?' disabled':'')+'>'+ic("send")+(UI.sending?"يُرسل…":label)+'</button>'+
  (hasRecorded()?'<button type="button" class="link" data-act="cancel-edit" data-k="cancel">تراجع عن التغيير</button>':'')+'</div>'+historyBlock()+'</section>';return h}
function historyBlock(){var rs=D.responses||[],hs=D.history||[];if(!rs.length&&hs.length<2)return "";
 var ev=[];hs.forEach(function(v){ev.push({at:v.sentAt,t:"النسخة "+v.version+" أُرسلت "+dateShort(v.sentAt),n:v.version>1&&v.message?v.message:""})});
 rs.forEach(function(r){var a=(r.decisions||[]).filter(function(x){return x.decision==="approve"}).length,c=(r.decisions||[]).length-a;
  var what=c?(a?"وافقتَ على "+countOf(a,AR.course)+" وطلبتَ تعديل "+countOf(c,AR.course):"طلبتَ تعديلاً")+(r.reason?" · "+REASON_TXT[r.reason]:""):"وافقتَ على "+(D.responseMode==="linked"?"المقترح كاملاً":countOf(a,AR.course));
  var extra=[];if(r.suggestedStart)extra.push("وقتٌ مقترح: "+r.suggestedStart);if(r.suggestedDays&&r.suggestedDays.length)extra.push("أيامٌ مقترحة: "+daysText(r.suggestedDays));
  ev.push({at:r.at,t:"ردّك على النسخة "+r.version+": "+what+" · "+dateShort(r.at),n:r.note||"",x:extra.join(" · "),code:r.verifyCode})});
 ev.sort(function(a,b){return String(a.at).localeCompare(String(b.at))});
 return '<details class="hist"><summary>'+ic("clock")+'تاريخ المقترح وردودك</summary><ol class="tl">'+ev.map(function(e){return '<li><b>'+esc(e.t)+'</b>'+(e.x?'<small>'+esc(e.x)+'</small>':'')+(e.n?'<q>'+esc(e.n)+'</q>':'')+(e.code?'<small>رمز التوقيع: <span class="ltr">'+esc(e.code)+'</span></small>':'')+'</li>'}).join("")+'</ol></details>'}
function barHtml(){var g=D.gate||{};if(D.committedAt||!g.open)return "";
 var rec=hasRecorded();
 return '<div class="bar-in"><p><b>'+(rec?"سجّلنا ردّك":"المقترح بانتظار ردّك")+'</b><small>'+(rec?"بانتظار تثبيت القسم":"لن يتغيّر جدولك قبل تثبيت القسم")+'</small></p><button type="button" class="btn" data-act="goto-resp" data-k="goto">'+(rec?"عرض ردّي":"الردّ على المقترح")+'</button></div>'}

/* ── الرسم ───────────────────────────────────────────────────────────────── */
function shell(){host.innerHTML='<div class="wrap" id="wrap"><header class="hero" id="r-hero"></header><div id="r-alert"></div><section class="msg" id="r-msg" hidden></section>'+
 '<section class="sec" aria-labelledby="t-ops"><div class="sec-h"><div><h2 id="t-ops">ماذا يقترح القسم</h2><p>كل مادة بما يتغيّر فيها، لا يُنفَّذ شيءٌ منها قبل ردّك وتثبيت القسم.</p></div></div><div id="r-ops"></div></section>'+
 '<section class="sec" aria-labelledby="t-tt"><div class="sec-h"><div><h2 id="t-tt">جدولك الأسبوعي</h2><p>قارن بين جدولك الحالي وما بعد المقترح. اضغط أي موعد لتفاصيله.</p></div></div><div id="r-tt"></div></section>'+
 '<section class="sec" id="s-impact" aria-labelledby="t-im"><div class="sec-h"><div><h2 id="t-im">أثر المقترح عليك</h2><p>الحاليُّ مقابل ما بعد المقترح. أرقامٌ يحسبها النظام من جدولك.</p></div></div><div id="r-impact"></div></section>'+
 '<div class="sec" id="r-resp"></div></div><div class="bar" id="bar" data-hide="1" hidden></div><div id="dlg"></div><div class="sr" id="live" aria-live="polite"></div>'}
function paintAll(swap){
 if(LOADING){host.innerHTML='<div class="wrap" aria-busy="true"><div class="sk" style="height:170px"></div><div class="sk" style="height:90px;margin-top:14px"></div><div class="sk" style="height:300px;margin-top:14px"></div><span class="sr">يفتح مقترحك…</span></div>';return}
 if(LOADERR){host.innerHTML='<div class="card state" role="alert"><div class="big-i">'+ic(LOADCODE===404?"ban":"alert")+'</div><h1>'+esc(LOADCODE===404?"لا يوجد مقترحٌ بهذا المعرّف":"تعذّر فتح المقترح")+'</h1><p>'+esc(LOADERR)+'</p><button type="button" class="btn" data-act="reload" data-k="reload">'+ic("refresh")+'حاول مرةً أخرى</button></div>';return}
 if(!document.getElementById("r-hero"))shell();
 setRegion("r-hero",heroHtml());setRegion("r-alert",alertsHtml());
 var m=document.getElementById("r-msg");m.hidden=!D.message;setRegion("r-msg",msgHtml());
 setRegion("r-ops",opsHtml());paintTT(swap);setRegion("r-impact",impactHtml());paintResp();paintBar();
 var si=document.getElementById("s-impact");if(si)si.hidden=!!D.committedAt;var tt=document.getElementById("t-tt");if(tt)tt.textContent=D.committedAt?"جدولك الآن":"جدولك الأسبوعي";
 document.title="مقترحك الدراسي — "+(D.title||"")}
function paintTT(swap){setRegion("r-tt",ttHtml(swap))}
function paintResp(){setRegion("r-resp",respHtml())}
function paintBar(){var b=document.getElementById("bar"),w=document.getElementById("wrap");if(!b)return;var h=barHtml();b.hidden=!h;b.innerHTML=h;w.className="wrap"+(h?" has-bar":"");syncBar()}
function syncBar(){var b=document.getElementById("bar"),c=document.getElementById("respcard");if(!b||b.hidden)return;
 var r=c?c.getBoundingClientRect():null,vh=window.innerHeight||600;
 var inView=r&&r.top<vh-40&&r.bottom>80;b.setAttribute("data-hide",inView?"1":"0")}

/* ── التحميل ─────────────────────────────────────────────────────────────── */
function load(keep){if(!keep){LOADING=true;LOADERR=null;paintAll()}
 return fetch(API,{headers:{Accept:"application/json"},cache:"no-store"}).then(function(r){return r.json().catch(function(){return {}}).then(function(d){return {ok:r.ok,status:r.status,d:d}})})
 .then(function(x){LOADING=false;
  if(!x.ok||!x.d.proposal){LOADERR=(x.d&&x.d.error)||"تعذّر فتح هذا المقترح. تحقّق من الرابط وحاول مجدداً.";LOADCODE=x.status;D=null;paintAll();return}
  LOADERR=null;D=x.d.proposal;META.term=x.d.termName||"";META.who=x.d.instructorName||"";
  if(!UI.day||!D.schedule)UI.day="";seedFromRecorded();UI.editing=false;UI.err="";UI.errCode="";
  paintAll()})
 .catch(function(){LOADING=false;LOADERR="تعذّر الاتصال بالخادم. تحقّق من الإنترنت وحاول مجدداً.";LOADCODE=0;D=null;paintAll()})}

/* ── الإرسال ─────────────────────────────────────────────────────────────── */
function payload(){var civil=digitsOf(UI.civil),b={civil:civil,version:D.version};
 if(D.responseMode==="linked")b.decision=UI.linked;
 else{b.decisions=[];(D.ops||[]).forEach(function(o){if(UI.choice[o.id])b.decisions.push({opId:o.id,decision:UI.choice[o.id]})})}
 if(wantsChange()){b.reason=UI.reason||undefined;b.note=UI.note.trim()||undefined;b.suggestedStart=UI.start||undefined;b.suggestedDays=UI.sdays.length?UI.sdays.slice():undefined}
 return b}
function fail(msg,code,focusId){UI.err=msg;UI.errCode=code||"";paintResp();var e=document.getElementById("err");if(e&&e.scrollIntoView)e.scrollIntoView({block:"center",behavior:"auto"});
 if(focusId){var f=document.getElementById(focusId);if(f)f.focus()}}
function send(){if(UI.sending||!D)return;UI.err="";UI.errCode="";
 if(!anyChoice()){fail("اختر ردّك أولاً: أوافق أو أحتاج تعديلاً.");return}
 if(wantsChange()&&!UI.reason&&!UI.note.trim()){fail("اختر سبباً مختصراً أو اكتب ملاحظةً عمّا تحتاج تعديله.");return}
 if(digitsOf(UI.civil).length!==12){fail("اكتب رقمك المدني كاملاً — 12 رقمًا — فهو توقيعك على هذا الرد.","","civil");return}
 var body=payload();UI.sending=true;paintResp();
 fetch(API+"/respond",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
 .then(function(r){return r.json().catch(function(){return {}}).then(function(d){return {ok:r.ok,status:r.status,d:d}})})
 .then(function(x){UI.sending=false;
  if(x.ok&&x.d.proposal){D=x.d.proposal;UI.civil="";UI.editing=false;UI.err="";UI.errCode="";seedFromRecorded();paintAll();
   liveRegion(wantsChangeOf(x.d.proposal)?"سجّلنا طلب التعديل · سيراجعه القسم":"تم تسجيل موافقتك · بانتظار تثبيت القسم");
   var n=document.querySelector('[data-k="recorded"]');if(n){n.setAttribute("tabindex","-1");n.scrollIntoView({block:"center"});n.focus({preventScroll:true})}return}
  var code=(x.d&&x.d.code)||"";
  if(x.status===409&&code==="stale-version")fail("وصلتك نسخةٌ أحدث من هذا المقترح. أعد فتحه لتراجع الجديد قبل أن تردّ.",code);
  else if(x.status===409)fail((x.d&&x.d.error)||"لا يمكن الرد الآن.",code||"closed");
  else fail((x.d&&x.d.error)||(x.status===429?"محاولاتٌ كثيرة. انتظر قليلاً ثم أعد المحاولة.":"تعذّر إرسال ردّك."),"",x.status===403||x.status===400?"civil":"")})
 .catch(function(){UI.sending=false;fail("تعذّر الاتصال. لم يُسجَّل ردّك؛ حاول مجدداً.")})}
function wantsChangeOf(p){return ((p.decision||{}).changes||[]).length>0}

/* ── الأحداث: مُفوَّضةٌ على الصفحة فلا تُفقد عند إعادة رسم منطقة ───────────── */
function closest(el,sel){while(el&&el!==document){if(el.matches&&el.matches(sel))return el;el=el.parentNode}return null}
document.addEventListener("click",function(e){var el=closest(e.target,"[data-act]");if(!el||!D&&el&&el.getAttribute("data-act")!=="reload")return;var a=el.getAttribute("data-act"),v=el.getAttribute("data-v");
 if(a==="close-ov"){if(e.target===el)closeItem();return}
 if(a==="ghosts")return;
 if(a==="open"){openItem(el.getAttribute("data-key"),el);return}
 if(a==="close"){closeItem();return}
 if(a==="mode"){if(UI.mode!==v){UI.mode=v;paintTT(true);liveRegion(v==="after"?"عرض الجدول بعد المقترح":"عرض جدولك الحالي")}return}
 if(a==="view"){UI.view=v;paintTT(true);return}
 if(a==="day"){UI.day=v;paintTT(true);return}
 if(a==="choice"){var id=el.getAttribute("data-op");UI.choice[id]=UI.choice[id]===v?"":v;UI.err="";paintResp();return}
 if(a==="all-ok"){(D.ops||[]).forEach(function(o){UI.choice[o.id]="approve"});UI.err="";paintResp();return}
 if(a==="linked"){UI.linked=UI.linked===v?"":v;UI.err="";paintResp();return}
 if(a==="reason"){UI.reason=UI.reason===v?"":v;paintResp();return}
 if(a==="sday"){var i=UI.sdays.indexOf(v);if(i>=0)UI.sdays.splice(i,1);else UI.sdays.push(v);paintResp();return}
 if(a==="edit"){UI.editing=true;paintResp();return}
 if(a==="cancel-edit"){UI.editing=false;UI.err="";seedFromRecorded();paintResp();return}
 if(a==="send"){send();return}
 if(a==="reload"){load(false);return}
 if(a==="goto-resp"){var c=document.getElementById("respcard");if(c){c.scrollIntoView({behavior:window.matchMedia&&window.matchMedia("(prefers-reduced-motion:reduce)").matches?"auto":"smooth",block:"start"});var f=c.querySelector("button,input,textarea");if(f)setTimeout(function(){try{f.focus({preventScroll:true})}catch(x){}},320)}return}
});
document.addEventListener("change",function(e){var el=e.target;if(el&&el.getAttribute&&el.getAttribute("data-act")==="ghosts"){UI.ghosts=!!el.checked;paintTT(true)}});
document.addEventListener("input",function(e){var el=e.target,k=el&&el.getAttribute&&el.getAttribute("data-input");if(!k)return;
 if(k==="note"){UI.note=el.value;var c=document.querySelector("[data-cnt]");if(c)c.textContent="\u2066"+UI.note.length+" / 600\u2069"}
 else if(k==="start")UI.start=el.value;
 else if(k==="civil"){UI.civil=digitsOf(el.value).slice(0,12);if(el.value!==UI.civil)el.value=UI.civil}});
document.addEventListener("keydown",function(e){if(!UI.open)return;
 if(e.key==="Escape"){e.preventDefault();closeItem();return}
 if(e.key==="Tab"){var d=document.querySelector(".dlg");if(!d)return;var f=d.querySelectorAll("button");if(!f.length)return;var first=f[0],last=f[f.length-1];
  if(e.shiftKey&&(document.activeElement===first||document.activeElement===d)){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});
window.addEventListener("scroll",syncBar,{passive:true});window.addEventListener("resize",syncBar);
paintAll();load(true);
})();
`;

/** يُستدعى من server.ts عبر مسار /r/:token/proposal/:pid. */
export function studyProposalPage(token: string, proposalId: string, nonce: string, demoHint = ""): string {
  /* القيمُ تدخل السكربت JSON، ويُهرَّب '<' فلا يُغلق وسمٌ مبكّراً ولا يُقرأ ‎<!--‎ تعليقاً. */
  const lit = (v: string) => JSON.stringify(String(v)).replace(/</g, "\\u003c");
  const script = PAGE_SCRIPT.replace("__TOKEN__", () => lit(token)).replace("__PID__", () => lit(proposalId));
  return `<!doctype html><html lang="ar" dir="rtl"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#247756">
<title>مقترحك الدراسي — SCHEDULE</title>
<link rel="icon" href="/schedule-icon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/schedule-icon-192.png">
<style>/* SCHEDULE_PUBLIC_PLEX_ARABIC */${FONT_FACES}${PAGE_CSS}</style></head><body>${demoHint ? `<div style="max-width:1100px;margin:0 auto;padding:12px 16px 0">${demoHint}</div>` : ""}<noscript>تحتاج هذه الصفحة إلى تفعيل جافاسكربت في المتصفح.</noscript><div id="host"></div>
<script nonce="${nonce}">${script}</script></body></html>`;
}

