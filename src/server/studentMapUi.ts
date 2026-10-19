/**
 * ── «خريطتي» في مساري: الواجهة ──────────────────────────────────────────────
 *
 * لوحةٌ واحدة لصحيفة الطالب كلها، كلُّ ما فيها يُضغط ويستجيب: الحلقةُ والأرقامُ والبطاقاتُ والمستوياتُ والسلاسلُ
 * والتصنيفات؛ وعند فتح أي مقررٍ تضيء سلسلتُه (ما يتطلبه وما يفتحه) في كل مكانٍ، ويُعلَّم مجتازاً فتُعاد الأرقامُ لحظتَها
 * ويُحفظ إنجازُه. الواجهةُ متسقة على الهاتف والحاسوب، بعرض مريح وورقة تفاصيل من الأسفل.
 *
 * السكربتُ ES5 عادي (يعمل على هواتفَ قديمة): بلا علامة اقتباسٍ مائلة ولا ‎${‎ ولا دوالَّ سهمية — النصُّ قالبٌ في الخادم،
 * ويُفحص ذلك في tests/student-map-audit.ts.
 */
import { STUDENT_MAP_CORE } from "../utils/studentMap";

export const STUDENT_MAP_CSS = `
/* ── خريطتي ── */
.km{margin-block-start:14px}
.km-grid{display:flex;flex-direction:column;gap:18px}
.km-side,.km-main,.km-sticky{display:contents}
.o1{order:1}.o2{order:2}.o3{order:3}.o4{order:4}.o5{order:5}.o6{order:6}
.app.km-on .hero.me{display:none}
.km-hero{position:relative;overflow:hidden;display:grid;gap:14px;padding:20px 18px 16px;border-radius:30px;color:#fff;background:radial-gradient(120% 90% at 100% 0,#2f8a76 0,#1f6b5c 38%,#123c34 100%);box-shadow:0 22px 44px -24px rgba(22,79,68,.75)}
.km-hero::before{content:"";position:absolute;inset-block-end:-70px;inset-inline-start:-60px;inline-size:210px;block-size:210px;border-radius:50%;background:radial-gradient(closest-side,rgba(199,155,95,.32),transparent)}
.km-hrow{position:relative;display:flex;align-items:center;gap:14px}
.km-ring{position:relative;inline-size:124px;block-size:124px;flex:none}
.km-ring svg{inline-size:100%;block-size:100%;transform:none}
.km-ring path{fill:none;stroke-width:11;stroke-linecap:round}
.km-ring .bg{stroke:rgba(255,255,255,.14);stroke-dasharray:100 100}
.km-ring .pl{opacity:.42;transition:stroke-dasharray .9s var(--ease)}
.km-ring .dn{transition:stroke-dasharray 1s var(--ease)}
.km-ring>div{position:absolute;inset:0;display:grid;place-content:center;text-align:center;line-height:1}
.km-ring b{font-size:31px;font-weight:700;font-variant-numeric:tabular-nums}
.km-ring b small{font-size:15px;font-weight:600;margin-inline-start:1px}
.km-ring span{font-size:11px;opacity:.78;margin-block-start:5px;font-weight:600}
.km-who{min-inline-size:0;display:grid;gap:2px}
.km-who small{font-size:12px;opacity:.7;font-weight:600;letter-spacing:.04em}
.km-who h1{margin:0;font-size:25px;line-height:1.25;font-weight:700}
.km-who p{margin:0;font-size:14px;font-weight:600;opacity:.95}
.km-who span{font-size:12.5px;opacity:.7}
.km-leg{position:relative;display:flex;flex-wrap:wrap;gap:6px}
.km-lg{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border:0;border-radius:999px;background:rgba(255,255,255,.1);color:#fff;font-size:12px;font-weight:700;cursor:pointer;transition:background .15s}
.km-lg:hover{background:rgba(255,255,255,.2)}
.km-lg i{inline-size:9px;block-size:9px;border-radius:3px}
.km-stats{position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.km-stats button{display:grid;gap:1px;padding:9px 4px;border:0;border-radius:16px;background:rgba(255,255,255,.1);color:#fff;text-align:center;cursor:pointer;transition:background .15s,transform .12s}
.km-stats button:hover{background:rgba(255,255,255,.18)}.km-stats button:active{transform:scale(.97)}
.km-stats b{font-size:22px;line-height:1.25;font-weight:700;font-variant-numeric:tabular-nums}
.km-stats small{font-size:11.5px;opacity:.82;font-weight:600}
.km-stats .now b{color:#f0cf95}
.km-chips{position:relative;display:flex;flex-wrap:wrap;gap:7px}
.km-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 13px;border-radius:999px;background:rgba(255,255,255,.1);font-size:12.5px;font-weight:600}
.km-chip.gold{background:rgba(240,207,149,.2);color:#f0cf95}
.km-chip .i{inline-size:14px;block-size:14px}
.km-sec{display:grid;gap:12px}
.km-progress-stack{display:grid;gap:18px}
.km-pre-icon{inline-size:36px;block-size:36px;flex:none;display:grid;place-items:center;border-radius:12px;background:var(--gold-soft);color:var(--gold)}
.km-pre-icon .i{inline-size:18px;block-size:18px}
.km-pre-details{overflow:hidden;border:1px solid var(--line);border-radius:18px;background:var(--card);box-shadow:var(--shadow)}
.km-pre-details>summary{display:flex;align-items:center;gap:10px;min-block-size:58px;padding:10px 14px;cursor:pointer;list-style:none}
.km-pre-details>summary::-webkit-details-marker{display:none}
.km-pre-details>summary>span:nth-child(2){flex:1;display:grid;gap:2px}
.km-pre-details>summary b{font-size:14px}
.km-pre-details>summary small{font-size:11.5px;color:var(--muted)}
.km-pre-details>summary>.i{color:var(--muted);transition:transform .18s}
.km-pre-details[open]>summary>.i{transform:rotate(180deg)}
.km-pre-details>.km-sec{padding:0 12px 12px}
.km-sh{display:flex;align-items:center;justify-content:space-between;gap:10px}
.km-sh h2{margin:0;font-size:19px;font-weight:700;line-height:1.4}
.km-tag{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:var(--muted);font-weight:600}
.km-tag .i{inline-size:14px;block-size:14px}
.km-lead{margin:-4px 0 0;font-size:13.5px;color:var(--dim)}
.km-more{display:flex;align-items:center;justify-content:center;gap:6px;min-block-size:44px;border:1.5px dashed var(--line-strong);border-radius:16px;background:var(--card);font-size:13.5px;font-weight:700;color:var(--dim);cursor:pointer}
.km-more .i{inline-size:16px;block-size:16px}.km-more[aria-expanded="true"] .i{transform:rotate(180deg)}
.kg{display:grid;gap:10px;padding:4px;border-radius:20px;background:var(--card);border:1px solid var(--line);box-shadow:var(--shadow)}
.kg.open{padding-block-end:12px}
.kg-h{display:flex;align-items:center;gap:12px;padding:10px 12px;border:0;background:none;text-align:start;cursor:pointer}
.kg-h>span:nth-child(2){flex:1;display:grid;min-inline-size:0}.kg-h b{font-size:14.5px}.kg-h small{font-size:12px;color:var(--muted)}
.kg-i{inline-size:38px;block-size:38px;border-radius:13px;display:grid;place-items:center;background:var(--gold-soft);color:var(--gold)}
.kg-h>.i{color:var(--muted);transition:transform .2s}.kg.open .kg-h>.i{transform:rotate(180deg)}
.kg .kc-grid{padding-inline:8px}
.km-sub{margin:4px 2px 0;font-size:12.5px;font-weight:700;color:var(--muted)}
.km-sub.g{color:var(--gold)}
.km-empty{display:grid;justify-items:center;gap:4px;padding:22px 14px;border-radius:20px;background:var(--card);border:1px dashed var(--line-strong);text-align:center}
.km-empty .i{color:var(--accent);inline-size:26px;block-size:26px}.km-empty small{color:var(--muted)}
.kc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.kc{position:relative;display:grid;gap:3px;align-content:start;min-block-size:104px;padding:12px 13px;border-radius:20px;background:var(--card);border:1.5px solid var(--line);border-inline-start:5px solid var(--h);box-shadow:var(--shadow);cursor:pointer;transition:transform .15s var(--ease),box-shadow .15s,border-color .15s,opacity .2s}
.kc:hover{transform:translateY(-2px);box-shadow:0 14px 28px -16px rgba(19,24,23,.45)}
.kc:active{transform:scale(.985)}
.kc.f{border-style:dashed;border-inline-start-style:solid;background:var(--card2)}
.kc.on{border-color:var(--h);background:color-mix(in srgb,var(--h) 7%,var(--card))}
.kc.no{opacity:.62}
.kc-t{display:flex;align-items:center;justify-content:space-between}
.kc em{font-style:normal;font-size:22px;font-weight:700;color:var(--h);font-variant-numeric:tabular-nums;letter-spacing:.3px}
.kc b{font-size:14px;line-height:1.5;font-weight:700}
.kc small{font-size:11.5px;color:var(--muted);line-height:1.5}
.kc .u{inline-size:24px;block-size:24px;border-radius:50%;background:var(--h);color:#fff;display:grid;place-items:center;font-size:12.5px;font-weight:700}
.kc-add{inline-size:34px;block-size:34px;border-radius:50%;border:2px solid var(--h);background:var(--card);color:var(--h);display:grid;place-items:center;cursor:pointer;padding:0;transition:background .15s,color .15s,transform .15s var(--ease)}
.kc-add .i{inline-size:18px;block-size:18px;stroke-width:2.4}
.kc-add:hover{transform:scale(1.08)}
.kc-add[aria-pressed="true"]{background:var(--h);color:#fff;animation:kpop .3s var(--ease)}
.kc-add:disabled{opacity:.35;cursor:not-allowed;transform:none}
@keyframes kpop{0%{transform:scale(.8)}60%{transform:scale(1.18)}100%{transform:scale(1)}}
.kc-rib{position:absolute;inset-block-start:-9px;inset-inline-start:12px;display:inline-flex;align-items:center;gap:4px;padding:1px 10px;border-radius:999px;background:linear-gradient(90deg,#c79b5f,#b8893f);color:#fff;font-size:11px;font-weight:700;box-shadow:0 6px 12px -6px rgba(141,100,35,.7)}
.kc-rib.key{background:linear-gradient(90deg,#1f6b5c,#2f8a76)}
.kc-rib .i{inline-size:12px;block-size:12px}
.km-map{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:22px;background:var(--card);border:1px solid var(--line);box-shadow:var(--shadow);color:inherit;text-decoration:none;transition:transform .15s var(--ease),border-color .15s}
.km-map:hover{transform:translateY(-2px);border-color:var(--accent)}
.km-map .mi{inline-size:64px;flex:none;color:var(--accent)}.km-map .mi svg{inline-size:100%;stroke:currentColor;stroke-width:1.8;fill:var(--accent-soft)}
.km-map .mt{flex:1;display:grid;min-inline-size:0}.km-map b{font-size:15.5px}.km-map small{font-size:12.5px;color:var(--muted)}
.km-map>.i{color:var(--accent)}
.km-fs{display:flex;gap:6px;overflow-x:auto;padding-block-end:2px;scrollbar-width:none}.km-fs::-webkit-scrollbar{display:none}
.km-f{flex:none;min-block-size:36px;padding:4px 15px;border:1.5px solid var(--line-strong);border-radius:999px;background:var(--card);font-size:13px;font-weight:600;cursor:pointer;transition:background .15s,color .15s,border-color .15s}
.km-f[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:#fff}
.km-f.cat[aria-pressed="true"]{background:var(--accent);border-color:var(--accent)}
.kl{display:grid;gap:8px;padding:11px 12px 12px;border-radius:22px;background:var(--card);border:1px solid var(--line);border-inline-start:5px solid var(--h);box-shadow:var(--shadow)}
.kl.full{background:linear-gradient(135deg,var(--t),var(--card) 70%)}
.kl-h{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:10px;padding:0;border:0;background:none;text-align:start;cursor:pointer}
.kl-h b{font-size:20px;font-weight:700;color:var(--h);font-variant-numeric:tabular-nums}
.kl-h small{display:inline-flex;align-items:center;gap:4px;font-size:12.5px;font-weight:700;color:var(--dim)}
.kl.full .kl-h small{color:var(--h)}.kl-h small .i{inline-size:15px;block-size:15px;stroke-width:2.6}
.kl-h i{display:block;block-size:6px;border-radius:9px;background:var(--soft);overflow:hidden}.kl-h i u{display:block;block-size:100%;background:var(--h);border-radius:9px;transition:inline-size .6s var(--ease)}
.kl-d{display:grid;grid-template-columns:repeat(auto-fill,minmax(46px,1fr));gap:6px}
.kdot{position:relative;block-size:42px;border-radius:13px;display:grid;place-items:center;font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums;cursor:pointer;border:2px solid transparent;transition:transform .12s var(--ease),opacity .2s,box-shadow .15s;padding:0}
.kdot:hover{transform:translateY(-2px)}.kdot:active{transform:scale(.94)}
.kdot.s-ok{background:var(--h);color:#fff}
.kdot.s-now{background:#fbf3df;color:#6b4a14;border-color:#c79b5f;box-shadow:0 0 0 3px #f3ead9}
.kdot.s-wait,.kdot.s-full{background:var(--card2);color:var(--muted);border-color:var(--line)}
.kdot.s-full{opacity:.6}
.kdot.f{border-style:dashed}.kdot.s-ok.f{border-color:#fff8}
.kdot.key::after{content:"";position:absolute;inset-block-start:-5px;inset-inline-start:-5px;inline-size:15px;block-size:15px;border-radius:50%;background:#c79b5f;box-shadow:0 0 0 2px var(--card)}
.kdot.key::before{content:"";position:absolute;z-index:1;inset-block-start:-2px;inset-inline-start:-2px;inline-size:9px;block-size:9px;background:#fff;clip-path:polygon(50% 0,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)}
.kdot.cart{outline:3px solid #c79b5f;outline-offset:2px}
.kl-n{display:grid;gap:6px;padding-block-start:4px}
.kn{display:flex;align-items:center;gap:10px;padding:9px 11px;border:1.5px solid var(--line);border-radius:15px;background:var(--card2);text-align:start;cursor:pointer;transition:border-color .15s,transform .12s}
.kn:hover{border-color:var(--h)}.kn:active{transform:scale(.99)}
.kn em{font-style:normal;font-weight:700;font-size:15px;color:var(--h);min-inline-size:44px;font-variant-numeric:tabular-nums}
.kn span{flex:1;display:grid;min-inline-size:0}.kn b{font-size:13.5px;line-height:1.4}.kn small{font-size:11.5px;color:var(--muted)}
.kn .i{color:var(--muted);inline-size:17px;block-size:17px}.kn.s-ok .i{color:var(--ok)}
.kn.s-ok{background:var(--ok-soft);border-color:transparent}.kn.s-now{background:#fbf3df;border-color:#c79b5f}
.kn-list{display:grid;gap:10px}.kn-list .kn{inline-size:100%;min-block-size:78px;padding:12px 16px;border:1px solid var(--line);border-radius:16px;box-shadow:0 3px 10px rgba(24,48,39,.045)}.kn-list .kn.s-ok{background:linear-gradient(110deg,#edf5ef,#e3f0e8);border-color:#d7e7dc}.kn-list .kn em{font-size:16px}.kn-list .kn b{font-size:15px;line-height:1.5}.kn-list .kn small{font-size:12px;line-height:1.5}
.km-key{display:flex;flex-wrap:wrap;gap:6px 14px;justify-content:center;font-size:12px;color:var(--muted);font-weight:600}
.km-key i.d{display:inline-block;inline-size:12px;block-size:12px;border-radius:4px;vertical-align:-1px;margin-inline-end:5px;border:2px solid transparent}
.km-key .ok{background:var(--accent)}.km-key .now{background:#fbf3df;border-color:#c79b5f}.km-key .wait{background:var(--card2);border-color:var(--line)}.km-key .f{border:2px dashed var(--line-strong)}
.kch{display:grid;gap:10px}
.kchl{display:grid;gap:8px;padding:12px 14px;border-radius:20px;background:var(--card);border:1px solid var(--line);box-shadow:var(--shadow)}
.kchh{display:flex;justify-content:space-between;align-items:baseline}.kchh b{font-size:14px;color:var(--h)}.kchh small{font-size:12px;color:var(--muted);font-weight:700}
.kchs{display:flex;align-items:center}
.kchs .ln{flex:1;block-size:4px;min-inline-size:14px;border-radius:4px;background:var(--line-strong)}.kchs .ln.on{background:var(--h)}
.ks{min-inline-size:50px;block-size:38px;padding:0 12px;border-radius:999px;border:2.5px solid var(--h);background:var(--card);color:var(--h);font-size:13.5px;font-weight:700;cursor:pointer;font-variant-numeric:tabular-nums;transition:transform .12s var(--ease)}
.ks:hover{transform:translateY(-2px)}
.ks.s-ok{background:var(--h);color:#fff}.ks.s-now{background:#fbf3df;border-color:#c79b5f;color:#6b4a14;box-shadow:0 0 0 4px #f3ead9}
.ks.s-wait,.ks.s-full{border-color:var(--line-strong);color:var(--muted)}
.term.demo{white-space:nowrap;background:#F3EAD9;color:#6B4A12;border-color:#E3CFA0}
.kchr{display:grid;grid-template-columns:auto 1fr;gap:6px;align-items:center}
.kchb{display:grid;gap:8px}.kchbr{display:flex;align-items:center}.kchbr>.ln{display:block;inline-size:14px;block-size:2px;background:#cfd6d2;flex:none}.kchbr>.ln.on{background:var(--h)}
.ks.big{min-inline-size:62px;block-size:46px;font-size:15.5px}
.app.km-bar{padding-block-end:200px}
.kl.gold .kl-h b{font-size:15.5px}.kl.gold .kl-h{grid-template-columns:1fr auto}.kl.gold .kl-h i{grid-column:1/-1}
.kl.gold .kl-h b{grid-column:1}.kl.gold .kl-h small{grid-column:2}
.kchc{font-size:11.5px;color:var(--muted);line-height:1.6}
.krq{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.rq{display:grid;justify-items:center;gap:3px;padding:14px 6px 12px;border-radius:22px;background:var(--card);border:1.5px solid var(--line);box-shadow:var(--shadow);cursor:pointer;text-align:center;transition:transform .15s var(--ease),border-color .15s}
.rq:hover{transform:translateY(-2px)}.rq.open{border-color:var(--c)}
.rq .rg{inline-size:62px;block-size:62px;border-radius:50%;background:conic-gradient(var(--c) var(--p),var(--soft) 0);display:grid;place-items:center;margin-block-end:4px}
.rq .rg b{inline-size:48px;block-size:48px;border-radius:50%;background:var(--card);display:grid;place-items:center;font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}
.rq strong{font-size:13px;line-height:1.35}.rq small{font-size:11.5px;color:var(--muted)}
.krl{display:grid;gap:6px;margin-block-start:6px;padding:12px;border-radius:20px;background:var(--card);border:1px solid var(--line)}
.kdb{position:fixed;inset:0;z-index:55;background:rgba(10,24,17,.45)}
body.km-lock{overflow:hidden}
.kd{position:fixed;z-index:56;inset-inline:0;inset-block-end:0;max-block-size:86dvh;overflow:auto;display:grid;gap:12px;align-content:start;padding:8px 18px calc(22px + env(safe-area-inset-bottom));border-radius:28px 28px 0 0;background:var(--card);box-shadow:0 -20px 50px -20px rgba(10,24,17,.55);animation:up .26s var(--ease)}
.kd::before{content:"";justify-self:center;inline-size:42px;block-size:5px;border-radius:5px;background:var(--line-strong);margin-block-end:4px}
.kd-h{display:flex;gap:12px;align-items:flex-start}
.kd-badge{flex:none;min-inline-size:58px;block-size:58px;padding:0 8px;border-radius:18px;display:grid;place-items:center;background:var(--h);color:#fff;font-size:19px;font-weight:700;font-variant-numeric:tabular-nums}
.kd-h h3{margin:0;font-size:18px;line-height:1.4;font-weight:700}
.kd-h>div{flex:1;min-inline-size:0}
.kd-m{display:flex;flex-wrap:wrap;gap:5px;margin-block-start:5px}
.kd-m span{padding:1px 10px;border-radius:999px;background:var(--soft);font-size:11.5px;font-weight:600;color:var(--dim)}.kd-m .f{background:var(--gold-soft);color:var(--gold)}
.kd-x{flex:none;inline-size:38px;block-size:38px;border-radius:50%;border:0;background:var(--soft);display:grid;place-items:center;cursor:pointer}
.kd-b{display:flex;align-items:center;gap:8px;padding:11px 14px;border-radius:16px;font-size:14px;font-weight:700}
.kd-b.ok{background:var(--ok-soft);color:var(--ok)}.kd-b.now{background:#fbf3df;color:#6b4a14}.kd-b.wait{background:var(--soft);color:var(--dim)}
.kd-b .i{flex:none}
.kd-k{display:flex;align-items:center;gap:8px;padding:9px 13px;border-radius:14px;background:var(--accent-soft);color:var(--accent);font-size:13px;font-weight:700}
.kd-s{display:grid;gap:7px}.kd-s h4{margin:0;font-size:13.5px;font-weight:700;color:var(--dim)}.kd-s h4 small{font-weight:600;color:var(--muted)}
.kxl{display:flex;flex-wrap:wrap;gap:7px}
.kxo{display:grid;gap:5px}.kxo small{font-size:12px;color:var(--muted);font-weight:700}
.kx{display:inline-flex;align-items:center;gap:7px;max-inline-size:100%;padding:6px 12px 6px 10px;border-radius:14px;border:1.5px solid var(--h);background:var(--card);cursor:pointer;text-align:start;font-size:13px;font-weight:600;transition:transform .12s var(--ease)}
.kx:hover{transform:translateY(-2px)}.kx:active{transform:scale(.97)}
.kx em{font-style:normal;font-weight:700;color:var(--h);font-variant-numeric:tabular-nums}
.kx span{min-inline-size:0}
.kx .i{inline-size:15px;block-size:15px;flex:none}
.kx.s-ok{background:var(--h);color:#fff}.kx.s-ok em{color:#fff}
.kx.s-now{background:#fbf3df;border-color:#c79b5f}.kx.s-wait{border-color:var(--line-strong);color:var(--muted)}.kx.s-wait em{color:var(--muted)}
.kx.f{border-style:dashed}
.kxn{margin:0;font-size:13px;color:var(--muted)}
.kxu{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;color:var(--dim)}.kxu.ok{color:var(--ok)}
.kd-a{display:grid;gap:8px;margin-block-start:2px}
.kd-n{margin:0}
.kd-future{display:grid;gap:10px;padding:13px;border:1px solid color-mix(in srgb,var(--accent) 22%,var(--line));border-radius:18px;background:linear-gradient(145deg,var(--accent-soft),var(--card) 72%)}
.kd-future-head{display:flex;align-items:center;gap:9px}.kd-future-head .i{inline-size:20px;block-size:20px;color:var(--accent)}.kd-future-head b{font-size:14px}.kd-future-head small{display:block;color:var(--muted);font-size:11.5px}
.kd-future-meters{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px}.kd-future-meters>div{display:grid;justify-items:center;padding:9px 6px;border-radius:14px;background:var(--card)}.kd-future-meters b{font-size:20px;color:var(--accent)}.kd-future-meters small{font-size:10.5px;color:var(--muted)}.kd-future-meters>.i{color:var(--brass)}
.kd-future-list{display:flex;flex-wrap:wrap;gap:6px}.kd-future-list .kx{max-inline-size:100%}.kd-future-note{margin:0;color:var(--muted);font-size:11.5px;line-height:1.6}
.kd-future{display:grid;gap:10px;padding:13px;border:1px solid color-mix(in srgb,var(--accent) 22%,var(--line));border-radius:18px;background:linear-gradient(145deg,var(--accent-soft),var(--card) 72%)}
.kd-future-head{display:flex;align-items:center;gap:9px}.kd-future-head .i{inline-size:20px;block-size:20px;color:var(--accent)}.kd-future-head b{font-size:14px}.kd-future-head small{display:block;color:var(--muted);font-size:11.5px}
.kd-future-meters{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:8px}.kd-future-meters>div{display:grid;justify-items:center;padding:9px 6px;border-radius:14px;background:var(--card)}.kd-future-meters b{font-size:20px;color:var(--accent)}.kd-future-meters small{font-size:10.5px;color:var(--muted)}.kd-future-meters>.i{color:var(--brass)}
.kd-future-list{display:flex;flex-wrap:wrap;gap:6px}.kd-future-list .kx{max-inline-size:100%}.kd-future-note{margin:0;color:var(--muted);font-size:11.5px;line-height:1.6}
.kbar{position:fixed;z-index:30;inset-inline:0;inset-block-end:calc(84px + env(safe-area-inset-bottom));margin:0 auto;inline-size:min(calc(100% - 24px),496px);display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:22px;background:var(--ink);color:#fff;box-shadow:0 18px 38px -16px rgba(10,24,17,.7);animation:up .25s var(--ease)}
.kbar .kb-m{flex:1;display:grid;gap:4px;min-inline-size:0}.kbar b{font-size:14px;font-variant-numeric:tabular-nums}
.kbar .kb-m small.goal{color:#f0cf95;opacity:1}
.visit-delta{padding:13px 15px;gap:10px;border-color:color-mix(in srgb,var(--accent) 16%,var(--line));background:linear-gradient(135deg,var(--card),var(--accent-soft))}
.visit-delta h2{font-size:15px}.visit-delta .b{inline-size:32px;block-size:32px}.visit-delta .visit-pills{display:flex;flex-wrap:wrap;gap:6px}.visit-delta .visit-pill{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border:1px solid color-mix(in srgb,var(--accent) 12%,var(--line));border-radius:999px;background:var(--card);font-size:11.5px;font-weight:600;color:var(--dim)}.visit-delta .visit-pill .i{inline-size:14px;block-size:14px;color:var(--accent)}
.tk-compare{display:grid;gap:8px}.tk-compare-title{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700}.tk-compare-title .i{inline-size:17px;block-size:17px;color:var(--accent)}
.tk-plans{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}
.tk-plan{position:relative;display:grid;gap:7px;min-inline-size:0;padding:10px 8px;border:1.5px solid var(--line);border-radius:16px;background:var(--card);color:var(--ink);text-align:center;font:inherit;cursor:pointer;transition:transform .15s,border-color .15s,background .15s}
.tk-plan:hover{transform:translateY(-2px);border-color:var(--accent)}.tk-plan[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-soft);box-shadow:0 5px 15px -12px var(--accent)}
.tk-plan .tk-score{inline-size:46px;block-size:46px;display:grid;place-items:center;margin:0 auto;border-radius:50%;background:conic-gradient(var(--accent) var(--score),var(--soft) 0);position:relative;font-size:13px;font-weight:800;font-variant-numeric:tabular-nums}
.tk-plan .tk-score:before{content:"";position:absolute;inset:4px;border-radius:50%;background:var(--card)}.tk-plan[aria-pressed="true"] .tk-score:before{background:var(--accent-soft)}.tk-plan .tk-score b{position:relative}
.tk-plan strong{font-size:12px;line-height:1.35}.tk-plan small{font-size:10px;color:var(--muted);line-height:1.45}.tk-plan .tk-best{position:absolute;inset-block-start:-8px;inset-inline-start:50%;transform:translateX(50%);white-space:nowrap;padding:1px 7px;border-radius:99px;background:var(--gold-soft);color:var(--gold);font-size:9px;font-weight:700}
.tk-compare-note{margin:0;font-size:10.5px;color:var(--muted);line-height:1.55}
/* لا يضغط أي نص في صفوف التذكرة تحت حجم الخط العربي. */
.tk .ln,.adv .ln{min-inline-size:0}.tk .ln .tx,.adv .ln .tx{min-inline-size:0}.tk .ln .tx b,.adv .ln .tx b,.tk .ln .tx small,.adv .ln .tx small{overflow-wrap:anywhere;line-height:1.55}.tk-plan strong,.tk-plan small{overflow-wrap:anywhere}
.kb-meter{position:relative;block-size:7px;border-radius:9px;background:rgba(255,255,255,.18);overflow:hidden}
.kb-meter i{position:absolute;inset-block:0;inset-inline-start:0;border-radius:9px;background:#f0cf95;transition:inline-size .35s var(--ease)}
.kb-meter span{position:absolute;inset-block:0;inset-inline-start:80%;inline-size:2px;background:rgba(255,255,255,.75)}
.kb-meter.ok i{background:#8fdcae}.kb-meter.over i{background:#f2a37a}
.kbar small{font-size:11.5px;opacity:.85}.kbar small.ok{color:#a7e3c3;opacity:1}
.kbar .btn{inline-size:auto;min-inline-size:136px;min-block-size:46px;font-size:14.5px;border-radius:15px;background:#c79b5f;color:#1a1308;box-shadow:none}
.km-conf{position:fixed;inset:0;z-index:90;pointer-events:none;overflow:hidden}
.km-conf i{position:absolute;inset-block-start:-12px;inset-inline-start:var(--x);inline-size:9px;block-size:14px;border-radius:2px;transform:rotate(var(--r));animation:kfall 1.5s var(--d) cubic-bezier(.3,.6,.4,1) forwards}
@keyframes kfall{to{transform:translateY(105vh) rotate(calc(var(--r) + 540deg));opacity:.7}}
.km [data-id]{transition:opacity .2s,transform .15s var(--ease),box-shadow .15s}
.km [data-id].dim{opacity:.22}
.km [data-id].foc{box-shadow:0 0 0 3px var(--h,#c79b5f),0 12px 26px -12px rgba(19,24,23,.5);transform:scale(1.04);position:relative;z-index:1}
.km [data-id].rel{box-shadow:0 0 0 2.5px var(--h,#c79b5f)}
@media (min-width:0px){
.app.km-on{padding-block-end:calc(194px + env(safe-area-inset-bottom))}
.km-hero{gap:10px;padding:14px 14px 12px;border-radius:24px}
.km-hrow{gap:10px}
.km-ring{inline-size:88px;block-size:88px}
.km-ring b{font-size:25px}
.km-ring span{font-size:10px;margin-block-start:3px}
.km-who h1{font-size:20px}
.km-who p{font-size:12.5px;line-height:1.45}
.km-who span{font-size:11.5px;line-height:1.4}
.km-leg{gap:5px}
.km-lg{padding:3px 9px;font-size:11px}
.km-stats{gap:6px}
.km-stats button{padding:7px 3px;border-radius:13px}
.km-stats b{font-size:19px}
.km-stats small{font-size:10.5px;line-height:1.35}
.km-chips{gap:5px}
.km-chip{padding:3px 9px;font-size:11.5px}
.kbar{gap:8px;padding:8px 9px;border-radius:18px}
.kbar .kb-m{gap:3px}
.kbar b{font-size:12px}
.kbar small{font-size:10px;line-height:1.35}
.kbar .btn{min-inline-size:112px;min-block-size:42px;padding:7px 9px;font-size:12px;gap:5px}
.km-seg{position:sticky;top:0;z-index:30;display:flex;gap:6px;margin-inline:-4px;padding:8px 4px;background:color-mix(in srgb,var(--bg,#F4F6F3) 92%,transparent);backdrop-filter:blur(10px)}
.km-seg button{flex:1 1 0;min-block-size:40px;padding:6px 4px;border:1px solid #DCE3DE;border-radius:999px;background:#fff;color:#5B6962;font:inherit;font-size:13.5px;font-weight:800;cursor:pointer;transition:background .18s,color .18s,border-color .18s}
.km-seg button[aria-pressed="true"]{background:#0F5E4A;border-color:#0F5E4A;color:#fff;box-shadow:0 4px 14px rgba(15,94,74,.28)}
.km-seg button:focus-visible{outline:2px solid #0F5E4A;outline-offset:2px}
.km[data-pane="reg"] [data-pane]:not([data-pane="reg"]),.km[data-pane="progress"] [data-pane]:not([data-pane="progress"]){display:none}
}
@keyframes kslide{from{transform:translateX(-24px);opacity:0}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){.km-ring path,.kc,.kdot,.kd,.kbar,.km-conf i,.kl-h i u{transition:none;animation:none}}
`;

export const STUDENT_MAP_SCRIPT = STUDENT_MAP_CORE + String.raw`
/* ═══ خريطتي: صحيفتي كلُّها، كلُّ ما فيها يُضغط ويستجيب ═══ */
var KM={ready:false,m:null,x:null,cart:{},status:"all",cat:"",focus:0,openLv:{},openCat:"",openGrp:{},regAll:false,advice:null,dirty:false,timer:0,saving:false,desk:false,first:true};
var KMLV={100:"#2563EB",200:"#059669",300:"#7C3AED",400:"#EA580C",0:"#64748B"};
var KMTINT={100:"#DBEAFE",200:"#D1FAE5",300:"#EDE9FE",400:"#FFEDD5",0:"#E2E8F0"};
var KMGOLD="#C79B5F";
function kmCol(c){return KMLV[c.level]||KMLV[0]}
function kmLvName(l){return l?String(l):"عام"}
function kmCanWish(){return !!(S.state&&S.state.phase&&S.state.phase.canEditWishes)}
function kmCartIds(){return Object.keys(KM.cart).map(Number)}
function kmUnits(ids){var s=0;ids.forEach(function(id){s+=KM.x.byId[id].credit});return s}
function kmOff(id){return KM.m.offered[id]||0}
function kmFirstName(){var p=S.state.profile;return p&&p.identity&&p.identity.name?String(p.identity.name).split(" ")[0]:""}
function kmVisitChanges(model,changes){var el=document.getElementById("visitChanges");if(!el||!changes)return;
  var nameList=function(ids){return ids.slice(0,2).map(function(id){return KM.x.byId[id]?esc(KM.x.byId[id].name):""}).filter(Boolean).join("، ")+(ids.length>2?'، و'+countOf(ids.length-2,AR.course)+' أخرى':'')},pills=[];
  if(changes.passed&&changes.passed.length)pills.push('<span class="visit-pill">'+ic('check','')+' اجتزت '+countOf(changes.passed.length,AR.course)+(changes.passed.length<3?' · '+nameList(changes.passed):'')+'</span>');
  if(changes.offered&&changes.offered.length)pills.push('<span class="visit-pill">'+ic('book','')+' طُرحت '+countOf(changes.offered.length,AR.course)+(changes.offered.length<3?' · '+nameList(changes.offered):'')+'</span>');
  if(changes.available&&changes.available.length)pills.push('<span class="visit-pill">'+ic('spark','')+' صارت متاحة '+countOf(changes.available.length,AR.course)+(changes.available.length<3?' · '+nameList(changes.available):'')+'</span>');
  if(pills.length)el.innerHTML='<section class="card visit-delta fade"><h2><span class="b">'+ic('spark')+'</span>منذ زيارتك الأخيرة</h2><div class="visit-pills">'+pills.join('')+'</div></section>'}

function kmInit(model,advice,changes){
  KM.m=model;KM.advice=advice||null;KM.x=kmCore(model,S.state.profile.passedCourseIds||[]);
  KM.transfer=S.state.profile.transfer===true;KM.eq={};(S.state.profile.equivalentCourseIds||[]).forEach(function(i){KM.eq[i]=1});
  /* ما حُفظ سابقاً بغير ترتيب المسبقات يُصحَّح الآن ويُحفظ مصحَّحاً. */
  var healed=kmPrune();if(healed){S.state.profile.passedCourseIds=KM.x.passedList();KM.healed=healed}
  KM.picks={};((advice&&advice.picks)||[]).forEach(function(p,i){KM.picks[p.courseId]={why:p.why,rank:i}});
  KM.cart={};KM.pane=kmCanWish()?"reg":"progress";
  if(kmCanWish()){
    var w=S.state.profile.wishes,cur=w&&S.state.term&&w.termId===S.state.term.id?w:null;
    var ids=cur?cur.courseIds:Object.keys(KM.picks).map(Number);
    ids.forEach(function(id){if(KM.x.byId[id]&&!KM.x.isPassed(id)&&KM.x.status(id)!=="wait")KM.cart[id]=1})}
  KM.status="all";KM.cat="";KM.focus=0;KM.futureCourse=0;KM.openLv={};KM.openCat="";KM.openGrp={};KM.regAll=false;KM.dirty=false;KM.ready=true;KM.first=true;
  KM.desk=false;kmVisitChanges(model,changes)}

/* ── حلقة التقدّم: قوسٌ لكل مستوى بحجم وحداته؛ المملوء ما اجتزته، والباهت ما اخترته لهذا الفصل ── */
function kmSegs(){var X=KM.x,m=KM.m,need=X.need(),segs=[];
  [100,200,300,400,0].forEach(function(l){var req=0,done=0,plan=0;
    need.compulsory.forEach(function(id){var c=X.byId[id];if(c.level!==l)return;req+=c.credit;if(X.isPassed(id))done+=c.credit;else if(KM.cart[id])plan+=c.credit});
    if(req)segs.push({k:l,req:req,done:done,plan:plan,col:KMLV[l]})});
  var er=0,ed=0,ep=0;
  m.groups.forEach(function(g){var p=X.group(g),req=Math.max(g.minUnits,g.minCourses*3);er+=req;ed+=Math.min(p.passedUnits,req);
    var cu=0;g.courseIds.forEach(function(id){if(KM.cart[id]&&!X.isPassed(id))cu+=X.byId[id].credit});ep+=Math.min(cu,Math.max(0,req-Math.min(p.passedUnits,req)))});
  if(er)segs.push({k:"e",req:er,done:ed,plan:ep,col:KMGOLD});
  return segs}
function kmArcPath(a0,a1){var r=48,c=60,p=function(a){var t=a*Math.PI/180;return[c+r*Math.sin(t),c-r*Math.cos(t)]},s=p(a0),e=p(a1);
  return"M"+s[0].toFixed(2)+" "+s[1].toFixed(2)+"A"+r+" "+r+" 0 "+(a1-a0>180?1:0)+" 1 "+e[0].toFixed(2)+" "+e[1].toFixed(2)}
function kmRingSvg(segs){var R=0;segs.forEach(function(s){R+=s.req});var a=0,gap=segs.length>1?4:0,h='<svg viewBox="0 0 120 120" aria-hidden="true">';
  segs.forEach(function(s){var span=360*s.req/R,a0=a+gap/2,a1=a+span-gap/2;a+=span;var d=kmArcPath(a0,a1);
    h+='<path class="bg" d="'+d+'" pathLength="100"/><path class="pl" data-k="'+s.k+'" d="'+d+'" pathLength="100" stroke="'+s.col+'" data-d="'+Math.min(100,(s.done+s.plan)/s.req*100).toFixed(2)+'" style="stroke-dasharray:'+(KM.first?"0":Math.min(100,(s.done+s.plan)/s.req*100).toFixed(2))+' 100"/>'
      +'<path class="dn" data-k="'+s.k+'" d="'+d+'" pathLength="100" stroke="'+s.col+'" data-d="'+Math.min(100,s.done/s.req*100).toFixed(2)+'" style="stroke-dasharray:'+(KM.first?"0":Math.min(100,s.done/s.req*100).toFixed(2))+' 100"/>'});
  return h+'</svg>'}
function kmAnimateRing(root){var els=(root||document).querySelectorAll(".km-ring path[data-d]");
  for(var i=0;i<els.length;i++){(function(el){requestAnimationFrame(function(){requestAnimationFrame(function(){el.style.strokeDasharray=el.getAttribute("data-d")+" 100"})})})(els[i])}}
function kmHeroHtml(){var X=KM.x,m=KM.m,p=X.progress(),segs=kmSegs(),nowN=0;
  X.plan.forEach(function(id){if(kmIsComp(id)&&X.status(id)==="now")nowN++});
  var after=kmAfter(),terms=p.remainingUnits?Math.ceil(p.remainingUnits/15):0,first=kmFirstName();
  var leg='';[100,200,300,400,0].forEach(function(l){var has=false;X.plan.forEach(function(id){if(X.byId[id].level===l)has=true});if(has)leg+='<button type="button" class="km-lg" data-act="lv" data-l="'+l+'"><i style="background:'+KMLV[l]+'"></i>'+kmLvName(l)+'</button>'});
  if(m.groups.length)leg+='<button type="button" class="km-lg" data-act="el"><i style="background:'+KMGOLD+'"></i>اختياري</button>';
  return '<section class="km-hero fade"><div class="km-hrow"><div class="km-ring" role="img" aria-label="'+p.percent+'٪ من التخرج">'+kmRingSvg(segs)+'<div><b id="kmPct">'+p.percent+'<small>٪</small></b><span>من التخرج</span></div></div>'
   +'<div class="km-who"><small>خريطتي</small><h1>'+(first?'أهلاً، '+esc(first):'مساري')+'</h1><p>'+esc(m.sectionName)+'</p><span>'+(m.planName?esc(m.planName):'')+'</span></div></div>'
   +'<div class="km-leg" aria-label="المستويات">'+leg+'</div>'
   +'<div class="km-stats"><button type="button" data-act="passed"><b id="kmSp">'+p.passedUnits+'</b><small>الوحدات المجتازة</small></button><button type="button" data-act="left"><b id="kmSl">'+p.remainingUnits+'</b><small>الوحدات المتبقية</small></button><button type="button" class="now" data-act="now"><b id="kmSn">'+nowN+'</b><small>إجباري متاح الآن</small></button></div>'
   +'<div class="km-chips" id="kmChips">'+kmChipsHtml(p,after,terms)+'</div></section>'}
function kmChipsHtml(p,after,terms){var h='';
  if(after&&after.percent>p.percent)h+='<span class="km-chip gold">'+ic("spark","")+' بعد هذا الفصل: '+after.percent+'٪</span>';
  h+='<span class="km-chip">'+(terms?'نحو '+countOf(terms,AR.term)+' للتخرّج':'أكملت الصحيفة')+'</span>';
  if(!KM.hasRules)h+='<span class="km-chip">بلا شروط معتمدة</span>';
  return h}
function kmAfter(){var ids=kmCartIds();if(!ids.length)return null;ids.forEach(function(id){KM.x.set(id,true)});var q=KM.x.progress();ids.forEach(function(id){KM.x.set(id,false)});return q}
function kmHeroUpdate(){var host=document.getElementById("kmHero");if(!host)return;var X=KM.x,p=X.progress(),segs=kmSegs(),nowN=0;X.plan.forEach(function(id){if(kmIsComp(id)&&X.status(id)==="now")nowN++});
  var set=function(id,v){var el=document.getElementById(id);if(el)el.innerHTML=v};
  set("kmPct",p.percent+"<small>٪</small>");set("kmSp",p.passedUnits);set("kmSl",p.remainingUnits);set("kmSn",nowN);
  set("kmChips",kmChipsHtml(p,kmAfter(),p.remainingUnits?Math.ceil(p.remainingUnits/15):0));
  var R=0;segs.forEach(function(s){R+=s.req});
  segs.forEach(function(s){var pl=host.querySelector('.pl[data-k="'+s.k+'"]'),dn=host.querySelector('.dn[data-k="'+s.k+'"]');
    if(pl){var v=Math.min(100,(s.done+s.plan)/s.req*100);pl.setAttribute("data-d",v.toFixed(2));pl.style.strokeDasharray=v.toFixed(2)+" 100"}
    if(dn){var w=Math.min(100,s.done/s.req*100);dn.setAttribute("data-d",w.toFixed(2));dn.style.strokeDasharray=w.toFixed(2)+" 100"}});
  var ring=host.querySelector(".km-ring");if(ring)ring.setAttribute("aria-label",p.percent+"٪ من التخرج")}

/* ── سجّل هذا الفصل ── */
function kmNowIds(){var X=KM.x,ids=X.plan.filter(function(id){return X.status(id)==="now"});
  return ids.sort(function(a,b){var pa=KM.picks[a],pb=KM.picks[b];if(pa&&pb)return pa.rank-pb.rank;if(pa)return-1;if(pb)return 1;
    var oa=kmOff(a)?0:1,ob=kmOff(b)?0:1;if(oa!==ob)return oa-ob;
    var ua=X.unlocks(a).length,ub=X.unlocks(b).length;if(ua!==ub)return ub-ua;return(X.byId[a].level||9e3)-(X.byId[b].level||9e3)})}
function kmCard(id){var X=KM.x,c=X.byId[id],on=!!KM.cart[id],pk=KM.picks[id],un=X.unlocks(id).length,off=kmOff(id),wish=kmCanWish();
  var rib=pk?'<span class="kc-rib">'+ic("spark","")+' مقترحنا</span>':(un>=3?'<span class="kc-rib key">'+ic("flag","")+' يفتح '+un+'</span>':'');
  return '<div class="kc'+(on?' on':'')+(pk?' pk':'')+(off?'':' no')+(c.own?'':' f')+'" data-id="'+id+'" style="--h:'+kmCol(c)+'" role="button" tabindex="0" aria-label="'+esc(c.name)+'">'+rib
   +'<div class="kc-t"><em>'+esc(c.short)+'</em>'+(wish?'<button type="button" class="kc-add" data-add="'+id+'" aria-pressed="'+(on?"true":"false")+'" aria-label="'+(on?"أزل ":"أضف ")+esc(c.name)+(on?" من رغباتي":" إلى رغباتي")+'"'+(off?'':' disabled')+'>'+ic(on?"check":"plus")+'</button>':'<span class="u">'+c.credit+'</span>')+'</div>'
   +'<b>'+esc(c.name)+'</b><small>'+(c.own?'':esc(c.owner)+' · ')+countOf(c.credit,AR.unit)+' · '+(off?countOf(off,AR.section):'غير مطروح')+'</small></div>'}
function kmGroupsNow(skip){var X=KM.x,out=[];
  KM.m.groups.forEach(function(g){var p=X.group(g);if(p.done)return;var cand=p.candidateIds.filter(function(id){return X.status(id)==="now"&&!skip[id]});
    if(cand.length)out.push({g:g,p:p,cand:cand,need:Math.max(p.needCourses,p.needUnits?Math.ceil(p.needUnits/3):0)})});
  return out}
function kmGroupName(g){var i=g.name.indexOf("·");return(i>0?g.name.slice(i+1):g.name).replace(/^\s+|\s+$/g,"")}
function kmRegHtml(){var X=KM.x,ids=kmNowIds(),a=KM.advice,isMain=function(id){var c=X.byId[id];return KM.picks[id]||(!c.group&&c.kind!=="elective")};
  var main=ids.filter(isMain),cap=KM.desk?9:8,shown=KM.regAll?main:main.slice(0,cap),more=main.length-shown.length,skip={};main.forEach(function(id){skip[id]=1});
  var groups=kmGroupsNow(skip);
  var h='<section class="km-sec fade" id="kmRegSec"><div class="km-sh"><h2>خطة هذا الفصل</h2>'+(KM.m.termName?'<span class="km-tag">'+ic("cal","")+esc(KM.m.termName)+'</span>':'')+'</div>';
  if(!ids.length)return h+'<div class="km-empty">'+ic("check","")+'<b>'+(X.need().remainingUnits?'لا مقرر متاحاً الآن':'أكملت الصحيفة')+'</b><small>'+(X.need().remainingUnits?'ينتظر ما بقي مسبقاً لم تُنجزه بعد.':'مبارك!')+'</small></div></section>';
  if(a&&a.line)h+='<p class="km-lead">'+esc(a.line)+'</p>';
  if(shown.length)h+='<div class="kc-grid">'+shown.map(kmCard).join("")+'</div>';
  if(more>0||KM.regAll&&main.length>cap)h+='<button type="button" class="km-more" data-act="regall" aria-expanded="'+(KM.regAll?"true":"false")+'">'+(KM.regAll?'أخفِ الباقي':'عرض كل المتاح لي ('+more+' أخرى)')+ic("down")+'</button>';
  groups.forEach(function(x){var open=!!KM.openGrp[x.g.id];
    h+='<div class="kg'+(open?' open':'')+'"><button type="button" class="kg-h" data-act="grp" data-g="'+esc(x.g.id)+'" aria-expanded="'+(open?"true":"false")+'"><span class="kg-i">'+ic("layers","")+'</span><span><b>'+esc(kmGroupName(x.g))+'</b><small>اختر '+(x.need||x.g.minCourses||1)+' من '+x.g.courseIds.length+' · '+x.cand.length+' متاحة لك</small></span>'+ic("down")+'</button>'
     +(open?'<div class="kc-grid">'+x.cand.map(kmCard).join("")+'</div>':'')+'</div>'});
  return h+'</section>'}
function kmBarUpdate(){var bar=document.getElementById("kbar");if(!bar)return;var ids=kmCartIds(),u=kmUnits(ids);
  var ap=document.querySelector(".app");if(!kmCanWish()||!ids.length||S.tab!=="plan"||S.view!=="home"){bar.hidden=true;if(ap)ap.classList.remove("km-bar");return}
  if(ap)ap.classList.add("km-bar");
  bar.hidden=false;/* الحدّ من 12 إلى 15 وحدة: المقياس 0–15، والعلامة عند 12؛ من بلغ 12 فقد أتمّ الحدّ (ممتاز) ولا يُطلب منه المزيد. */
  var wish=S.state.profile.wishes&&S.state.term&&S.state.profile.wishes.termId===S.state.term.id?S.state.profile.wishes:null,target=wish?wish.targetUnits:15;
  var pct=Math.min(100,u/15*100),st=u<12?'low':(u>15?'over':'ok'),msg=st==='low'?'ينقصك '+countOf(12-u,AR.unit)+' لتبلغ الحدّ الأدنى (12)':(st==='over'?'فوق 15 وحدة — سيُعدّ حملُك 15':'ممتاز ✓ ضمن الحدّ (12 إلى 15)');
  bar.innerHTML='<div class="kb-m"><b>اختيارك للتخطيط · '+countOf(ids.length,AR.course)+' · '+countOf(u,AR.unit)+'</b><div class="kb-meter '+st+'" aria-hidden="true"><i style="inline-size:'+pct+'%"></i><span></span></div><small class="'+(st==='ok'?'ok':'')+'">'+msg+'</small><small class="goal">هدف رغباتك: '+countOf(target,AR.unit)+' · لا يُحفظ الاختيار إلا عند الضغط</small></div><button type="button" class="btn" id="kbsend">'+ic("heart")+' أضفها إلى رغباتي</button>';
  document.getElementById("kbsend").addEventListener("click",kmSendWishes)}
function kmSendWishes(){var b=document.getElementById("kbsend");if(!b||b.disabled)return;var ids=kmCartIds(),w=S.state.profile.wishes&&S.state.term&&S.state.profile.wishes.termId===S.state.term.id?S.state.profile.wishes:null;
  b.disabled=true;
  api("PUT","/api/public/me/wishes",{targetUnits:w?w.targetUnits:15,courseIds:ids.slice(0,12),constraints:w?w.constraints:{}}).then(function(r){b.disabled=false;
    if(!r.ok){toast(r.d.error||"تعذّر الحفظ",true);return}
    S.state.profile.wishes=r.d.wishes;S.wDraft=null;S.wCount=null;S.wEdit=false;toast("صارت رغباتك");if(typeof renderWishes==="function")renderWishes()})}
function kmToggleCart(id){if(!kmCanWish())return;var c=KM.x.byId[id];if(!c||KM.x.isPassed(id)||!kmOff(id))return;
  if(!KM.x.unlocked(id)){toast("يتطلب اجتياز مسبقاته أولاً",true);return}
  if(KM.cart[id])delete KM.cart[id];else if(kmCartIds().length>=12){toast("حتى 12 مقرراً",true);return}else KM.cart[id]=1;kmRefresh(true)}

/* ── رحلتي في المستويات ── */
function kmMatch(id){var X=KM.x,c=X.byId[id],st=X.status(id);
  if(KM.status==="now"&&st!=="now")return false;if(KM.status==="left"&&st==="ok")return false;if(KM.status==="ok"&&st!=="ok")return false;
  if(KM.cat&&c.cat!==KM.cat)return false;return true}
var KMST={ok:"اجتزته",now:"متاح الآن",wait:"ينتظر مسبقاً",full:"اكتملت مجموعته"};
function kmIsComp(id){var c=KM.x.byId[id];return!c.group&&c.kind!=="elective"}
function kmDot(id,gold){var X=KM.x,c=X.byId[id],st=X.status(id),un=st==="now"?X.unlocks(id).length:0;
  return '<button type="button" class="kdot s-'+st+(c.own?'':' f')+(un>=3?' key':'')+(KM.cart[id]?' cart':'')+'" data-id="'+id+'" style="--h:'+(gold?KMGOLD:kmCol(c))+'" aria-label="'+esc(c.name)+' — '+KMST[st]+'">'+esc(c.short)+'</button>'}
function kmNameRow(id){var X=KM.x,c=X.byId[id],st=X.status(id);
  return '<button type="button" class="kn s-'+st+'" data-id="'+id+'" style="--h:'+kmCol(c)+'"><em>'+esc(c.short)+'</em><span><b>'+esc(c.name)+'</b><small>'+(c.own?'':esc(c.owner)+' · ')+countOf(c.credit,AR.unit)+' · '+KMST[st]+'</small></span>'+(st==="ok"?ic("check"):st==="wait"?ic("lock"):'')+'</button>'}
function kmRowHtml(key,title,sub,col,tint,all,gold){var X=KM.x,shown=all.filter(kmMatch);if(!shown.length)return'';
  var done=all.filter(function(id){return X.isPassed(id)}).length,full=sub?false:done===all.length,open=!!KM.openLv[key];
  return '<div class="kl'+(full?' full':'')+(gold?' gold':'')+'" data-lv="'+key+'" style="--h:'+col+';--t:'+tint+'"><button type="button" class="kl-h" data-act="lvopen" data-l="'+key+'" aria-expanded="'+(open?"true":"false")+'"><b>'+title+'</b><small>'+(full?ic("check","")+' مكتمل':(sub||done+'/'+all.length))+'</small><i><u style="inline-size:'+Math.round(all.length?done/all.length*100:0)+'%"></u></i></button>'
   +'<div class="kl-d">'+shown.map(function(id){return kmDot(id,gold)}).join("")+'</div>'+(open?'<div class="kl-n">'+shown.map(kmNameRow).join("")+'</div>':'')+'</div>'}
function kmJrHtml(){var X=KM.x,m=KM.m,chips='';
  [["all","الكل"],["now","المتاح الآن"],["left","المتبقي"],["ok","المجتاز"]].forEach(function(f){chips+='<button type="button" class="km-f" data-f="'+f[0]+'" aria-pressed="'+(KM.status===f[0]?"true":"false")+'">'+f[1]+'</button>'});
  var cats='';if(m.cats.length)m.cats.forEach(function(c){cats+='<button type="button" class="km-f cat" data-c="'+esc(c)+'" aria-pressed="'+(KM.cat===c?"true":"false")+'">'+esc(c)+'</button>'});
  var rows='';
  X.levels().forEach(function(L){rows+=kmRowHtml(L.level,kmLvName(L.level),"",KMLV[L.level||0],KMTINT[L.level||0],L.ids.filter(kmIsComp),false)});
  var looseIds=X.plan.filter(function(id){var c=X.byId[id];return!c.group&&c.kind==="elective"});
  m.groups.forEach(function(g){var p=X.group(g),need=Math.max(p.needCourses,p.needUnits?Math.ceil(p.needUnits/3):0);
    rows+=kmRowHtml("g"+g.id,esc(kmGroupName(g)),p.done?'مكتمل ✓':'اختر '+(need||g.minCourses||1)+' · '+p.passedCourses+' مجتازة',KMGOLD,"#F3EAD9",g.courseIds,true)});
  if(looseIds.length)rows+=kmRowHtml("loose","اختيارية أخرى","",KMGOLD,"#F3EAD9",looseIds,true);
  if(!rows)rows='<div class="km-empty"><b>لا مقررات بهذا الفلتر</b><small>جرّب «الكل».</small></div>';
  return '<section class="km-sec fade" id="kmJrSec"><div class="km-sh"><h2>تقدّمي في الصحيفة</h2><span class="km-tag">اضغط أي مقرر</span></div><div class="km-fs">'+chips+'</div>'+(cats?'<div class="km-fs cats">'+cats+'</div>':'')+rows
   +'<div class="km-key"><span><i class="d ok"></i>اجتزته</span><span><i class="d now"></i>متاح الآن</span><span><i class="d wait"></i>ينتظر</span><span><i class="d f"></i>من قسم آخر</span></div></section>'}

/* ── سلاسل المسبقات العابرة للأقسام ── */
function kmChainsHtml(){var X=KM.x,ch=X.chains();if(!ch.length)return'';
  var groups={},order=[];ch.forEach(function(line){var r=line[0];if(!groups[r]){groups[r]=[];order.push(r)}groups[r].push(line.slice(1))});
  var hues=["#2563EB","#0891B2","#DB2777","#7C3AED","#EA580C","#059669"],h='<details class="km-pre-details"><summary><span class="km-pre-icon">'+ic("layers","")+'</span><span><b>المسبقات بين الأقسام</b><small>استكشف ما يفتح كل مقرر</small></span>'+ic("down","")+'</summary><section class="km-sec fade"><div class="kch">';
  var st=function(id,big){var s=X.status(id);return '<button type="button" class="ks s-'+s+(big?' big':'')+'" data-id="'+id+'" aria-label="'+esc(X.byId[id].name)+' — '+KMST[s]+'">'+esc(X.byId[id].short)+'</button>'};
  order.forEach(function(r,i){var root=X.byId[r],br=groups[r],hue=hues[i%hues.length],ids={};ids[r]=1;br.forEach(function(path){path.forEach(function(id){ids[id]=1})});
    var all=Object.keys(ids).map(Number),done=all.filter(function(id){return X.isPassed(id)}).length,kids={};
    h+='<div class="kchl" style="--h:'+hue+'"><div class="kchh"><b>'+esc(root.own?root.name:(root.owner||root.name))+'</b><small>'+done+'/'+all.length+'</small></div><div class="kchr">'+st(r,true)+'<div class="kchb">';
    br.forEach(function(path){h+='<div class="kchbr">';path.forEach(function(id,k){h+='<i class="ln'+(X.isPassed(k?path[k-1]:r)?' on':'')+'"></i>'+st(id,false)});h+='</div>'});
    h+='</div></div><small class="kchc">'+esc(root.name)+' ← '+br.map(function(path){return esc(X.byId[path[0]].name)}).filter(function(n,k,a){return a.indexOf(n)===k}).join(" · ")+'</small></div>'});
  return h+'</div></section></details>'}

/* ── بقية متطلباتي: حلقةٌ لكل تصنيف ── */
function kmReqData(){var X=KM.x,m=KM.m,need=X.need(),out=[];if(!m.cats.length)return out;
  m.cats.forEach(function(cat){var total=0,done=0,list=[],groups=[];
    need.compulsory.forEach(function(id){var c=X.byId[id];if(c.cat!==cat)return;total++;list.push(id);if(X.isPassed(id))done++});
    m.groups.forEach(function(g){var fc=X.byId[g.courseIds[0]];if(!fc||fc.cat!==cat)return;var p=X.group(g),t=Math.max(g.minCourses,g.minUnits?Math.ceil(g.minUnits/3):0);total+=t;done+=Math.min(p.passedCourses,t);groups.push({g:g,p:p,t:t})});
    if(total)out.push({cat:cat,total:total,done:done,list:list,groups:groups})});
  return out}
function kmReqHtml(){var data=kmReqData();if(!data.length)return'';var h='<section class="km-sec fade"><div class="km-sh"><h2>بقية متطلباتي</h2><span class="km-tag">حسب صحيفتك</span></div><div class="krq">';
  var cols=["#059669","#7C3AED","#2563EB","#EA580C","#C79B5F","#DB2777"];
  data.forEach(function(d,i){var pct=Math.round(d.done/d.total*100),open=KM.openCat===d.cat;
    h+='<button type="button" class="rq'+(open?' open':'')+'" data-act="cat" data-c="'+esc(d.cat)+'" aria-expanded="'+(open?"true":"false")+'" style="--c:'+cols[i%cols.length]+';--p:'+pct+'%"><span class="rg"><b>'+d.done+'/'+d.total+'</b></span><strong>'+esc(d.cat)+'</strong><small>'+(d.done>=d.total?'مكتمل':'بقي '+(d.total-d.done))+'</small></button>'});
  h+='</div>';
  data.forEach(function(d){if(KM.openCat!==d.cat)return;h+='<div class="krl"><div class="km-sub">'+esc(d.cat)+'</div>'+d.list.map(kmNameRow).join("");
    d.groups.forEach(function(x){h+='<div class="km-sub g">'+esc(x.g.name)+' — اختر '+x.t+(x.p.done?' ✓':'')+'</div>'+x.g.courseIds.map(kmNameRow).join("")});h+='</div>'});
  return h+'</section>'}
function kmMapHtml(){return '<a class="km-map fade" href="/api/public/me/map-page"><span class="mi"><svg viewBox="0 0 64 40" aria-hidden="true"><rect x="2" y="3" width="16" height="9" rx="3"/><rect x="2" y="16" width="16" height="9" rx="3"/><rect x="24" y="9" width="16" height="9" rx="3"/><rect x="46" y="3" width="16" height="9" rx="3"/><rect x="46" y="24" width="16" height="9" rx="3"/><path d="M18 7.5h2.5a3 3 0 0 1 3 3v3M18 20.5h2.5a3 3 0 0 0 3-3M40 13.5h2.5a3 3 0 0 1 3 3v8M40 13.5h2.5a3 3 0 0 0 3-3v-3" fill="none"/></svg></span><span class="mt"><b>خريطة قسمي بالأسهم</b><small>كل مسبق وما يفتحه، ملوّنةً بإنجازي</small></span>'+ic("fwd")+'</a>'}

/* ── الهيكل والرسم ── */
function kmShell(){return '<div class=\"km\" id=\"kmRoot\" data-pane=\"'+KM.pane+'\"><div class=\"km-grid\"><aside class=\"km-side\"><div class=\"km-sticky\"><div id=\"kmHero\" class=\"o1\" data-pane=\"progress\"></div><nav id=\"kmSeg\" class=\"km-seg o1\" aria-label=\"أقسام خريطتي\"></nav></div></aside><div class=\"km-main\"><div id=\"kmReg\" class=\"o2\" data-pane=\"reg\"></div><div id=\"kmMap\" class=\"o3\" data-pane=\"reg\"></div><div id=\"kmProgress\" class=\"o4 km-progress-stack\" data-pane=\"progress\"><div id=\"kmJr\"></div><div id=\"kmRq\"></div><div id=\"kmCh\"></div></div></div></div></div>'}
/* الجوال: خطةُ الفصل في لوحة، والتقدّم والمتطلبات في لوحة ثانية؛ الحاسوب يعرضهما معاً. */
function kmSegHtml(){var t=[["reg","خطة الفصل",kmCanWish()],["progress","تقدّمي",true]];
  if(!kmCanWish()&&KM.pane==="reg")KM.pane="progress";
  return t.filter(function(x){return x[2]}).map(function(x){return '<button type="button" data-act="pane" data-p="'+x[0]+'" aria-pressed="'+(KM.pane===x[0]?"true":"false")+'">'+x[1]+'</button>'}).join("")}
function kmPane(p,sc){if(p==="jr"||p==="ch"||p==="rq")p="progress";KM.pane=p;var r=document.getElementById("kmRoot");if(r)r.setAttribute("data-pane",p);var sg=document.getElementById("kmSeg");if(sg)sg.innerHTML=kmSegHtml();
  if(sc){var h=document.getElementById("kmHero");if(h&&window.innerWidth<900){var y=h.getBoundingClientRect().bottom+window.scrollY-8;window.scrollTo({top:Math.max(0,y),behavior:"auto"})}}}
function kmPaint(){var set=function(id,h){var el=document.getElementById(id);if(el)el.innerHTML=h};
  set("kmHero",kmHeroHtml());set("kmSeg",kmSegHtml());set("kmReg",kmRegHtml());set("kmMap",kmMapHtml());set("kmJr",kmJrHtml());set("kmCh",kmChainsHtml());set("kmRq",kmReqHtml());
  kmBarUpdate();kmFocusApply();if(KM.first){kmAnimateRing(document.getElementById("kmHero"));KM.first=false}}
/* تحديثٌ جزئيّ بلا فقد التمرير: القلبُ يُرسم من جديد والحلقةُ تتحرك. */
function kmRefresh(heroToo){var y=window.scrollY,set=function(id,h){var el=document.getElementById(id);if(el)el.innerHTML=h};
  set("kmSeg",kmSegHtml());set("kmReg",kmRegHtml());set("kmJr",kmJrHtml());set("kmCh",kmChainsHtml());set("kmRq",kmReqHtml());
  if(heroToo)kmHeroUpdate();kmBarUpdate();kmFocusApply();window.scrollTo(0,y)}

/* ── التركيز: عند فتح مقررٍ تضيء سلسلتُه في كل مكان ── */
function kmFocusApply(){var host=document.querySelector(".km");if(!host)return;var X=KM.x,f=KM.focus,rel={};
  if(f){rel[f]="foc";X.requires(f).forEach(function(i){rel[i]="rel"});X.dependents(f).forEach(function(i){rel[i]="rel"})}
  var els=host.querySelectorAll("[data-id]");for(var i=0;i<els.length;i++){var id=els[i].getAttribute("data-id"),k=rel[id];
    els[i].classList.toggle("foc",k==="foc");els[i].classList.toggle("rel",k==="rel");els[i].classList.toggle("dim",!!f&&!k)}}

/* ── ورقة المقرر: هاتفاً من الأسفل، وحاسوباً لوحةً جانبية ── */
function kmEnsureSheet(){var el=document.getElementById("kd");if(el)return el;
  var b=document.createElement("div");b.id="kdb";b.className="kdb";b.hidden=true;b.addEventListener("click",kmClose);document.body.appendChild(b);
  el=document.createElement("aside");el.id="kd";el.className="kd";el.hidden=true;el.setAttribute("role","dialog");el.setAttribute("aria-label","تفاصيل المقرر");
  el.addEventListener("click",kmSheetClick);document.body.appendChild(el);return el}
function kmChip(i){var X=KM.x,d=X.byId[i],s=X.status(i);return '<button type="button" class="kx s-'+s+(d.own?'':' f')+'" data-go="'+i+'" style="--h:'+kmCol(d)+'"><em>'+esc(d.short)+'</em><span>'+esc(d.name)+'</span>'+(s==="ok"?ic("check"):s==="wait"?ic("lock"):'')+'</button>'}
function kmAncestors(id){var X=KM.x,out=[],seen={},walk=function(i){var r=KM.m.rules[i];if(!r)return;r.all.forEach(function(p){if(seen[p])return;seen[p]=1;if(!X.isPassed(p)){out.push(p);walk(p)}})};walk(id);return out}
function kmFutureHtml(id){var X=KM.x,st=X.status(id),open=KM.futureCourse===id;
  var h='<button type="button" class="btn alt small" data-do="future">'+ic('spark')+(open?'أخفِ التجربة':'جرّب مستقبلك')+'</button>';if(!open)return h;
  var newly=[];
  if(st==='now'){var ids=X.passedList();ids.push(id);var after=kmCore(KM.m,ids);newly=X.plan.filter(function(other){return other!==id&&X.status(other)==='wait'&&after.status(other)==='now'})}
  h+='<div class="kd-future"><div class="kd-future-head">'+ic('spark')+'<div><b>لو اجتزت هذا المقرر</b><small>معاينة على مسبقات صحيفتك، بدون حفظ</small></div></div>';
  if(st!=='now')h+='<div class="kd-b wait">'+ic('lock','')+' أكمل مسبقاته أولاً؛ ما زال مبكراً تقدير أثره.</div>';
  else if(newly.length)h+='<div class="kd-future-meters"><div><b>الآن</b><small>حالتك الحالية</small></div>'+ic('fwd','')+'<div><b>'+countOf(newly.length,AR.course)+'</b><small>تصبح متاحة بعد اجتيازه</small></div></div><div class="kd-future-list">'+newly.slice(0,6).map(kmChip).join('')+(newly.length>6?'<small class="muted">و'+countOf(newly.length-6,AR.course)+' أخرى</small>':'')+'</div>';
  else h+='<div class="kd-b now">'+ic('check','')+' لا يفتح مقرراً آخر مباشرةً؛ يضيف تقدماً في صحيفتك.</div>';
  h+='<p class="kd-future-note">لا يغيّر هذا العرض إنجازك أو رغباتك، ولا يتنبأ بطرح المقررات مستقبلاً.</p></div>';return h}
function kmSheetHtml(id,after){var X=KM.x,m=KM.m,c=X.byId[id],st=X.status(id),r=m.rules[id]||{all:[],anyOf:[],minUnits:0,coreq:[]},col=kmCol(c),off=kmOff(id),dep=X.dependents(id),un=X.unlocks(id).length,u=X.unmet(id);
  var banner,bc;
  if(st==="ok"){banner=ic("check","")+' اجتزتَ هذا المقرر'+(KM.eq[id]?' · معادَل':'');bc="ok"}
  else if(st==="now"){banner=ic("spark","")+' متاح لك الآن'+(off?' · مطروح '+countOf(off,AR.section):' · غير مطروح هذا الفصل');bc="now"}
  else if(st==="full"){banner=ic("check","")+' اكتملت مجموعتك الاختيارية';bc="ok"}
  else{var miss=u.all.map(function(i){return X.byId[i].name}).concat(u.anyOf.map(function(g){return"أحد: "+g.map(function(i){return X.byId[i].name}).join(" أو ")}));if(u.unitsShort)miss.push(countOf(u.unitsShort,AR.unit));banner=ic("lock","")+' ينقصك: '+esc(miss.join(" + "));bc="wait"}
  var req='';
  if(r.all.length)req+='<div class="kxl">'+r.all.map(kmChip).join("")+'</div>';
  r.anyOf.forEach(function(g){req+='<div class="kxo"><small>أحد هذه المقررات</small><div class="kxl">'+g.map(kmChip).join("")+'</div></div>'});
  if(r.minUnits)req+='<div class="kxu'+(X.passedUnits()>=r.minUnits?' ok':'')+'">'+ic(X.passedUnits()>=r.minUnits?"check":"lock","")+' اجتياز '+countOf(r.minUnits,AR.unit)+' · لديك '+X.passedUnits()+'</div>';
  if(!req)req='<p class="kxn">لا يتطلب مقرراً سابقاً — يمكن تسجيله مباشرة.</p>';
  var h='<div class="kd-h" style="--h:'+col+'"><span class="kd-badge">'+esc(c.short)+'</span><div><h3>'+esc(c.name)+'</h3><div class="kd-m"><span>'+(c.level?'المستوى '+c.level:'عام')+'</span><span>'+countOf(c.credit,AR.unit)+'</span>'+(c.cat?'<span>'+esc(c.cat)+'</span>':'')+'<span class="'+(c.own?'':'f')+'">'+(c.own?'قسمي':esc(c.owner||'قسم آخر'))+'</span></div></div><button type="button" class="kd-x" data-do="close" aria-label="إغلاق">'+ic("x")+'</button></div>'
   +'<div class="kd-b '+bc+'" role="status">'+banner+'</div>'
   +(un>=2&&st!=="ok"?'<div class="kd-k">'+ic("flag","")+' مفتاحي: يفتح لك '+countOf(un,AR.course)+' إجبارياً بعده</div>':'')
   +'<div class="kd-s"><h4>يتطلب قبله</h4>'+req+'</div>'
   +'<div class="kd-s"><h4>يفتح بعده'+(dep.length?' <small>('+dep.length+')</small>':'')+'</h4>'+(dep.length?'<div class="kxl">'+dep.map(kmChip).join("")+'</div>':'<p class="kxn">لا يتطلبه مقرر آخر.</p>')+'</div>';
  if(st==="now"||st==="wait")h+=kmFutureHtml(id);
  if(r.coreq.length)h+='<div class="kd-s"><h4>يُسجَّل معه</h4><div class="kxl">'+r.coreq.map(kmChip).join("")+'</div></div>';
  /* لا تعليمَ قبل المسبقات: المقرر المقفول لا زرَّ اجتياز له، والمفتوح يُعلَّم، وإلغاءُ مسبقٍ يُلغي ما بُني عليه. */
  var canPass=X.unlocked(id);
  h+='<div class="kd-a">'+(st==="ok"?'<button type="button" class="btn alt small" data-do="unpass">'+ic("x")+' ألغِ علامة الاجتياز</button>':(canPass?'<button type="button" class="btn alt small" data-do="pass">'+ic("check")+' علّمته مجتازاً</button>':(KM.transfer?'<p class="kxn kd-lockmsg">'+ic("lock","")+' مسبقاته غير مجتازة. إن كان معادَلاً لك فعلّمه:</p><button type="button" class="btn alt small" data-do="pass">'+ic("check")+' علّمته معادَلاً</button>':'<p class="kxn kd-lockmsg">'+ic("lock","")+' لا يُعلَّم مجتازاً قبل اجتياز مسبقاته (أعلاه).</p><button type="button" class="link" data-do="transfer">طالب محوَّل ومعادَلة لك مقررات؟</button>')));
  if(kmCanWish()&&st!=="ok"&&off&&st!=="wait")h+='<button type="button" class="btn" data-do="cart">'+ic(KM.cart[id]?"check":"heart")+(KM.cart[id]?' أزله من التخطيط':' أضفه إلى خطة هذا الفصل')+'</button>';
  h+='</div>';
  return h}
function kmOpen(id,after){if(!KM.x.byId[id])return;if(KM.focus!==id)KM.futureCourse=0;KM.focus=id;var el=kmEnsureSheet(),b=document.getElementById("kdb");KM.desk=!!(window.matchMedia&&window.matchMedia("(min-width:900px)").matches);
  el.innerHTML=kmSheetHtml(id,after);el.hidden=false;el.classList.toggle("desk",KM.desk);el.scrollTop=0;
  if(!KM.desk){b.hidden=false;document.body.classList.add("km-lock")}
  var root=document.querySelector(".km");if(root)root.classList.toggle("km-d",KM.desk);
  kmFocusApply();if(!KM.desk){var x=el.querySelector(".kd-x");if(x)x.focus()}}
function kmClose(){var el=document.getElementById("kd"),b=document.getElementById("kdb");if(el)el.hidden=true;if(b)b.hidden=true;document.body.classList.remove("km-lock");KM.futureCourse=0;
  var root=document.querySelector(".km");if(root)root.classList.remove("km-d");KM.focus=0;kmFocusApply()}
function kmSheetClick(e){var t=e.target,go=t.closest("[data-go]");if(go){kmOpen(Number(go.getAttribute("data-go")));return}
  var d=t.closest("[data-do]");if(!d)return;var act=d.getAttribute("data-do"),id=KM.focus;
  if(act==="close")kmClose();
  else if(act==="future"){KM.futureCourse=KM.futureCourse===id?0:id;kmOpen(id)}
  else if(act==="pass")kmMark(id,true);
  else if(act==="unpass")kmMark(id,false);
  else if(act==="transfer"){if(window.confirm("سيُحفظ في ملفك أنك طالب محوَّل ومعادَلة لك مقررات، فيُسمح لك بتعليم المقرر المعادَل بلا مسبقاته. هل أنت كذلك؟")){KM.transfer=true;KM.dirty=true;kmSaveSoon();kmOpen(id)}}
  else if(act==="cart"){kmToggleCart(id);kmOpen(id)}
  }
/* من أُزيل مسبقُه يسقط ما بُني عليه من المنجَز حتى يستقرّ: لا منجَزَ بلا مسبقاته. */
function kmPrune(){var X=KM.x,n=0,ch=true;while(ch){ch=false;X.plan.forEach(function(i){if(X.isPassed(i)&&!KM.eq[i]&&!X.unlocked(i)){X.set(i,false);n++;ch=true}})}return n}
function kmMark(id,on){var X=KM.x,c=X.byId[id],before=X.passedList().length,lvDone=function(){var l=c.level,ids=X.plan.filter(function(i){return X.byId[i].level===l});return ids.length>0&&ids.every(function(i){return X.isPassed(i)})};
  var viaEq=on&&!X.unlocked(id);
  if(viaEq&&!KM.transfer){toast("يتطلب اجتياز مسبقاته أولاً",true);return}
  var wasFull=lvDone();X.set(id,on);if(on)delete KM.cart[id];
  /* الطالب المحوَّل: مقررٌ بلا مسبقاته يُسجَّل «معادَلاً»، وإلغاؤه يُلغي علامته. */
  if(viaEq){KM.eq[id]=1;toast("سُجّل معادَلاً")}else if(!on)delete KM.eq[id];
  var cut=on?0:kmPrune();
  if(cut){toast("أُزيل أيضاً "+countOf(cut,AR.course)+" يعتمد عليه",true);var cs=KM.cart,keep={};Object.keys(cs).forEach(function(k){if(X.status(Number(k))==="now")keep[k]=1});KM.cart=keep}
  /* نسخةُ الملف المحلية تتبع التعليمَ فوراً: تبديلُ التاب لا يُعيد الخريطة من إنجازٍ قديم قبل أن يصل الحفظ. */
  if(S.state&&S.state.profile)S.state.profile.passedCourseIds=X.passedList();
  kmAfterMark(id,0,null);if(on&&!wasFull&&lvDone())kmConfetti(kmCol(c),c.level)}
function kmAfterMark(id,n,anc){KM.dirty=true;kmRefresh(true);kmOpen(id,anc&&anc.length?anc:null);kmSaveSoon();if(n)toast("علّمتُ "+countOf(n,AR.course)+" مسبقاً")}
function kmSaveSoon(){clearTimeout(KM.timer);KM.pending=true;KM.timer=setTimeout(kmSave,700)}
/* مغادرةُ الصفحة (رابط الخريطة الكاملة، إغلاق، تحديث): ما لم يُحفظ يُرسَل الآن ولو والصفحةُ تُغلق. */
function kmBody(p){var eq=[];KM.x.passedList().forEach(function(i){if(KM.eq[i])eq.push(i)});return{sectionId:p.sectionId,curriculumPlanId:p.planId,passedCourseIds:KM.x.passedList(),transfer:!!KM.transfer,equivalentCourseIds:eq}}
function kmFlush(){if(!KM.pending||!KM.x)return;var p=S.state&&S.state.profile;if(!p||!p.sectionId)return;clearTimeout(KM.timer);KM.pending=false;
  try{fetch("/api/public/me/profile",{method:"PUT",keepalive:true,credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(kmBody(p))})}catch(e){}}
function kmSave(){var p=S.state.profile;if(!p||!p.sectionId||KM.saving){if(KM.saving)kmSaveSoon();return}KM.saving=true;KM.pending=false;
  api("PUT","/api/public/me/profile",kmBody(p)).then(function(r){KM.saving=false;
    if(!r.ok){toast(r.d.error||"تعذّر حفظ إنجازك",true);if(r.status===401){S.state.signedIn=false;setView("gate")}return}
    if(!KM.pending)S.state.profile=r.d;toast("حُفظ إنجازك")})}
function kmConfetti(col,l){if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion:reduce)").matches){toast("أكملتَ المستوى "+kmLvName(l)+" 🎉");return}
  var box=document.createElement("div");box.className="km-conf";box.setAttribute("aria-hidden","true");
  for(var i=0;i<26;i++){var s=document.createElement("i");s.style.setProperty("--x",(Math.random()*100).toFixed(1)+"%");s.style.setProperty("--d",(Math.random()*.5).toFixed(2)+"s");s.style.setProperty("--r",Math.round(Math.random()*360)+"deg");s.style.background=i%3?col:KMGOLD;box.appendChild(s)}
  document.body.appendChild(box);setTimeout(function(){box.remove()},1800);toast("أكملتَ المستوى "+kmLvName(l)+" 🎉")}

/* ── أفعال الصفحة ── */
function kmAct(el){var a=el.getAttribute("data-act");
  if(a==="passed"){kmListSheet("المجتازة",KM.x.plan.filter(function(id){return KM.x.isPassed(id)}))}
  else if(a==="pane"){kmPane(el.getAttribute("data-p"),true)}
  else if(a==="left"){KM.status="left";KM.cat="";kmPane("progress",false);kmRefresh(false);kmScroll("kmJrSec")}
  else if(a==="now"){kmPane(kmCanWish()?"reg":"progress",false);var r=document.getElementById("kmReg");if(r&&r.scrollIntoView)r.scrollIntoView({behavior:"smooth",block:"start"})}
  else if(a==="lv"){var l=Number(el.getAttribute("data-l"));kmPane("progress",false);KM.status="all";KM.cat="";KM.openLv[l]=true;kmRefresh(false);var t=document.querySelector('.kl[data-lv="'+l+'"]');if(t&&t.scrollIntoView)t.scrollIntoView({behavior:"smooth",block:"center"})}
  else if(a==="regall"){KM.regAll=!KM.regAll;kmRefresh(false)}
  else if(a==="grp"){var gid=el.getAttribute("data-g");KM.openGrp[gid]=!KM.openGrp[gid];kmRefresh(false)}
  else if(a==="el"){KM.status="all";KM.cat="";kmPane("progress",true);kmRefresh(false)}
  else if(a==="lvopen"){var l2=Number(el.getAttribute("data-l"));KM.openLv[l2]=!KM.openLv[l2];kmRefresh(false)}
  else if(a==="cat"){var c=el.getAttribute("data-c");KM.openCat=KM.openCat===c?"":c;kmRefresh(false)}}
function kmScroll(id){var e=document.getElementById(id);if(e&&e.scrollIntoView)e.scrollIntoView({behavior:"smooth",block:"start"})}
function kmListSheet(title,ids){var h='<h3>'+title+' <small class="muted">('+ids.length+')</small></h3>'+(ids.length?'<div class="kn-list">'+ids.map(kmNameRow).join("")+'</div>':'<p class="muted">لم تعلّم شيئاً بعد. افتح أي مقرر واضغط «علّمته مجتازاً».</p>')+'<button class="btn alt" id="klx">إغلاق</button>';
  var s=sheet(h);s.addEventListener("click",function(e){var b=e.target.closest("[data-id]");if(b){closeSheet();kmOpen(Number(b.getAttribute("data-id")))}});var x=document.getElementById("klx");if(x)x.addEventListener("click",closeSheet)}
function kmMount(host){
  if(!document.getElementById("kbar")){var kb=document.createElement("div");kb.id="kbar";kb.className="kbar";kb.hidden=true;document.body.appendChild(kb)}
  host.innerHTML=kmShell();kmPaint();
  if(KM.healed){toast("صُحّح إنجازك: أُزيل "+countOf(KM.healed,AR.course)+" بغير ترتيب المسبقات",true);KM.healed=0;kmSaveSoon()}
  host.addEventListener("click",function(e){var t=e.target;
    var add=t.closest("[data-add]");if(add){e.stopPropagation();if(!add.disabled)kmToggleCart(Number(add.getAttribute("data-add")));return}
    var el=t.closest("[data-id]");if(el){kmOpen(Number(el.getAttribute("data-id")));return}
    var f=t.closest("[data-f]");if(f){KM.status=f.getAttribute("data-f");kmRefresh(false);return}
    var c=t.closest("[data-c].cat");if(c){var v=c.getAttribute("data-c");KM.cat=KM.cat===v?"":v;kmRefresh(false);return}
    var a=t.closest("[data-act]");if(a)kmAct(a)});
  host.addEventListener("keydown",function(e){if(e.key!=="Enter"&&e.key!==" ")return;var el=e.target.closest(".kc[data-id]");if(el&&e.target===el){e.preventDefault();kmOpen(Number(el.getAttribute("data-id")))}});
  if(!KM.bound){KM.bound=true;window.addEventListener("pagehide",kmFlush);document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden")kmFlush()});document.addEventListener("keydown",function(e){if(e.key==="Escape"&&KM.focus)kmClose()})}}
`;
