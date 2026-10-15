import { ARABIC_COUNT_SCRIPT } from "../utils/arabicCount";
import { PUBLIC_FONT_FACES } from "./publicKit";
import { PUBLIC_LIGHT_VARS, PUBLIC_THEME_COLOR } from "./publicTheme";

/**
 * ── مساري: صفحةٌ واحدة، والهاتفُ أولاً ─────────────────────────────────
 *
 * يفتحها الطالبُ من ملصقٍ أو رسالة، ولا يحتاج شيئاً غير رقمه المدني. تُرسم كلُّها
 * في المتصفح من `/api/public/me/*`، والخادمُ يقرّر ما يُسمح به؛ هنا رسمٌ فقط.
 *
 * قواعدُ التصميم: رقمٌ كبير وسطرٌ واحد وأيقونة. التفاصيلُ تنفتح عند اللمس.
 * اللون يحمل معنى — أخضرُ العلامة لما تمّ، وذهبيُّها لما هو الآن، ورماديٌّ لما لم
 * يأتِ — وهو لونُ أرقامٍ فقط قبل التسجيل: لا أسماءَ تظهر هنا لأحد.
 *
 * السكربتُ ES5 عادي (يعمل على هواتفَ قديمة)، لا علامةَ اقتباسٍ مائلة ولا ‎${‎ فيه:
 * النصُّ قالبٌ في الخادم.
 */

const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>
<symbol id="i-cap" viewBox="0 0 24 24"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5"/><path d="M22 9v6"/></symbol>
<symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/></symbol>
<symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></symbol>
<symbol id="i-heart" viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></symbol>
<symbol id="i-ticket" viewBox="0 0 24 24"><path d="M4 8.5a2 2 0 0 0 0 4v3.5A1.5 1.5 0 0 0 5.5 17.5h13a1.5 1.5 0 0 0 1.5-1.5v-3.5a2 2 0 0 1 0-4V7A1.5 1.5 0 0 0 18.5 5.5h-13A1.5 1.5 0 0 0 4 7z"/><path d="M14 6v11" stroke-dasharray="2 2"/></symbol>
<symbol id="i-flag" viewBox="0 0 24 24"><path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/></symbol>
<symbol id="i-cal" viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/></symbol>
<symbol id="i-calx" viewBox="0 0 24 24"><rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M10 13.5l4 4M14 13.5l-4 4"/></symbol>
<symbol id="i-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.6"/><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M18 6l-1.4 1.4M7.4 16.6L6 18"/></symbol>
<symbol id="i-moon" viewBox="0 0 24 24"><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/></symbol>
<symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></symbol>
<symbol id="i-book" viewBox="0 0 24 24"><path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v14H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19"/></symbol>
<symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></symbol>
<symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></symbol>
<symbol id="i-back" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
<symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
<symbol id="i-trash" viewBox="0 0 24 24"><path d="M4.5 7h15M10 7V4.5h4V7M6.5 7l1 12.5h9l1-12.5M10 11v5M14 11v5"/></symbol>
<symbol id="i-edit" viewBox="0 0 24 24"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M14.5 7.5l3 3"/></symbol>
<symbol id="i-out" viewBox="0 0 24 24"><path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10"/><path d="M14 8l4 4-4 4M18 12H9"/></symbol>
<symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/></symbol>
<symbol id="i-key" viewBox="0 0 24 24"><circle cx="8" cy="14" r="3.6"/><path d="M10.7 11.5L19 3.5M16 6.5l2.5 2.5M14 8.5l2 2"/></symbol>
<symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/></symbol>
<symbol id="i-spark" viewBox="0 0 24 24"><path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/></symbol>
<symbol id="i-layers" viewBox="0 0 24 24"><path d="M12 4l8 4-8 4-8-4z"/><path d="M4 12l8 4 8-4"/><path d="M4 16l8 4 8-4"/></symbol>
<symbol id="i-building" viewBox="0 0 24 24"><path d="M4 20h16"/><path d="M6 20V9l6-4 6 4v11"/><path d="M10 20v-5h4v5"/></symbol>
<symbol id="i-eye" viewBox="0 0 24 24"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></symbol>
<symbol id="i-down" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></symbol>
</defs></svg>`;

export const STUDENT_HOME_CSS = `
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
:root{${PUBLIC_LIGHT_VARS};--r:20px;--shadow:0 1px 2px rgba(19,24,23,.04),0 8px 24px -14px rgba(19,24,23,.2);--ease:cubic-bezier(.2,.7,.2,1);--gold:#8d6423;--gold-soft:#f3ead9;--ok:#25684a;--ok-soft:#dfeee6}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;min-height:100dvh;background:radial-gradient(120% 60% at 100% 0,var(--accent-soft) 0,transparent 55%),var(--bg);color:var(--ink);font-family:"Plex Arabic",-apple-system,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif;font-synthesis:none;-webkit-font-smoothing:antialiased;line-height:1.65;padding-bottom:env(safe-area-inset-bottom)}
button,input{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:10px}
.i{inline-size:20px;block-size:20px;flex:none;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.ltr{direction:ltr;unicode-bidi:isolate}
.sr{position:absolute;inline-size:1px;block-size:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.app{max-inline-size:520px;margin:0 auto;padding:0 16px 120px}
.top{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:max(18px,env(safe-area-inset-top)) 0 10px}
.mark{font:600 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.28em;color:var(--brass)}
.term{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;background:var(--card);border:1px solid var(--line);font-size:12.5px;color:var(--dim)}
.term .i{inline-size:14px;block-size:14px;color:var(--accent)}

/* ── بطاقات ── */
.hero{display:grid;gap:12px;padding:22px 20px;border-radius:26px;color:#fff;background:linear-gradient(155deg,#1f6b5c 0%,#164f44 70%);box-shadow:0 18px 36px -22px rgba(22,79,68,.7);position:relative;overflow:hidden}
.hero::after{content:"";position:absolute;inset-block-start:-40px;inset-inline-end:-40px;inline-size:150px;block-size:150px;border-radius:50%;background:radial-gradient(closest-side,rgba(199,155,95,.35),transparent)}
.hero .disc{inline-size:54px;block-size:54px;border-radius:18px;display:grid;place-items:center;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.22)}
.hero .disc .i{inline-size:28px;block-size:28px}
.hero h1{margin:0;font-size:28px;line-height:1.3;font-weight:700}
.hero p{margin:0;color:rgba(255,255,255,.82);font-size:15px}
.phase{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:16px;background:rgba(255,255,255,.12);font-size:13.5px;line-height:1.5}
.phase .i{color:#e7c590}
.card{margin-block-start:14px;padding:18px;border-radius:var(--r);background:var(--card);border:1px solid var(--line);box-shadow:var(--shadow);display:grid;gap:14px}
.card h2{margin:0;font-size:17px;line-height:1.4;font-weight:700;display:flex;align-items:center;gap:10px}
.card h2 .b{inline-size:36px;block-size:36px;border-radius:12px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent);flex:none}
.card h2 .chip{margin-inline-start:auto}
.chip{display:inline-flex;align-items:center;gap:5px;padding:2px 10px;border-radius:999px;font-size:11.5px;font-weight:600;background:var(--soft);color:var(--dim)}
.chip.gold{background:var(--gold-soft);color:var(--gold)}
.chip.ok{background:var(--ok-soft);color:var(--ok)}
.muted{color:var(--muted);font-size:13px;margin:0;line-height:1.7}
.lead{margin:0;font-size:14.5px;color:var(--ink)}

/* ── حقول وأزرار ── */
.field{display:grid;gap:8px}
.field>label,.lbl{font-size:13.5px;font-weight:600;color:var(--ink)}
.inp{inline-size:100%;min-block-size:56px;padding:10px 16px;border:1.5px solid var(--line-strong);border-radius:16px;background:var(--card);font-size:18px;outline:none;transition:border-color .15s,box-shadow .15s}
.inp:focus{border-color:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 16%,transparent)}
.civil{letter-spacing:.14em;text-align:center;font-variant-numeric:tabular-nums;font-size:22px;direction:ltr}
.hint{min-block-size:1.5em;margin:0;font-size:12.5px;color:var(--muted);text-align:center}
.hint.ok{color:var(--ok)}.hint.bad{color:var(--bad)}
.btn{display:flex;align-items:center;justify-content:center;gap:9px;inline-size:100%;min-block-size:56px;padding:10px 18px;border:0;border-radius:18px;background:var(--accent);color:var(--on-accent);font-size:17px;font-weight:700;cursor:pointer;box-shadow:0 10px 22px -14px rgba(22,79,68,.9);transition:transform .12s var(--ease),opacity .15s}
.btn:active{transform:scale(.985)}
.btn:disabled{opacity:.42;box-shadow:none;cursor:not-allowed}
.btn.alt{background:var(--card);color:var(--ink);border:1.5px solid var(--line-strong);box-shadow:none}
.btn.danger{background:var(--bad)}
.btn.small{min-block-size:44px;font-size:15px;border-radius:14px}
.link{border:0;background:none;color:var(--accent);font-weight:600;font-size:14px;cursor:pointer;padding:8px;text-decoration:underline;text-underline-offset:3px}
.row{display:flex;align-items:center;gap:10px}
.row.between{justify-content:space-between}
.err{padding:11px 14px;border-radius:14px;background:var(--bad-soft);color:var(--bad);font-size:13.5px;font-weight:600}
.note{display:flex;gap:9px;align-items:flex-start;padding:11px 13px;border-radius:14px;background:var(--gold-soft);color:#6b4a14;font-size:13px;line-height:1.7}
.note .i{margin-block-start:2px}
.priv{display:flex;align-items:center;justify-content:center;gap:7px;margin:4px 0 0;font-size:12px;color:var(--muted);text-align:center}
.priv .i{inline-size:15px;block-size:15px;color:var(--accent)}

/* ── خانات الرمز ── */
.otpw{position:relative}
.otp{display:flex;gap:8px;direction:ltr;justify-content:center}
.otp i{flex:1;max-inline-size:52px;block-size:58px;border-radius:14px;border:1.5px solid var(--line-strong);display:grid;place-items:center;font:600 24px/1 inherit;font-family:inherit;font-style:normal;background:var(--card)}
.otp i.on{border-color:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 16%,transparent)}
.otp i.fill{border-color:color-mix(in srgb,var(--accent) 45%,var(--line-strong))}
.otpw input{position:absolute;inset:0;inline-size:100%;block-size:100%;opacity:0;font-size:16px;border:0;background:transparent;direction:ltr}

/* ── مفاتيح ── */
.sw{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:var(--card2);border:1px solid var(--line);cursor:pointer;text-align:start;inline-size:100%}
.sw .t{flex:1;display:grid;gap:1px;font-size:14px;font-weight:600}
.sw .t small{font-weight:400;color:var(--muted);font-size:12px}
.sw .tg{inline-size:46px;block-size:28px;border-radius:99px;background:var(--line-strong);position:relative;flex:none;transition:background .18s}
.sw .tg::after{content:"";position:absolute;inset-block-start:3px;inset-inline-start:3px;inline-size:22px;block-size:22px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .18s var(--ease)}
.sw[aria-checked="true"] .tg{background:var(--accent)}
.sw[aria-checked="true"] .tg::after{transform:translateX(-18px)}
.chk{display:flex;gap:12px;align-items:flex-start;font-size:13.5px;line-height:1.7;cursor:pointer}
.chk input{inline-size:22px;block-size:22px;flex:none;accent-color:var(--accent);margin-block-start:2px}

/* ── خطوات ── */
.steps{display:flex;gap:8px;align-items:center;margin:6px 0 4px}
.steps i{flex:1;block-size:6px;border-radius:99px;background:var(--line-strong)}
.steps i.on{background:var(--accent)}
.steps i.now{background:var(--brass)}
.h2{margin:14px 0 4px;font-size:22px;line-height:1.4;font-weight:700}

/* ── قوائم الاختيار ── */
.list{display:grid;gap:8px}
.opt{display:flex;align-items:center;gap:12px;padding:12px 14px;min-block-size:56px;border-radius:16px;border:1.5px solid var(--line);background:var(--card);cursor:pointer;text-align:start;inline-size:100%;transition:border-color .15s,background .15s}
.opt:hover{border-color:var(--line-strong)}
.opt[aria-pressed="true"],.opt[aria-checked="true"]{border-color:var(--accent);background:var(--accent-soft)}
.opt .tx{flex:1;min-inline-size:0;display:grid;gap:2px}
.opt .tx b{font-size:14.5px;font-weight:600;line-height:1.5}
.opt .tx small{color:var(--muted);font-size:12px}
.opt .box{inline-size:26px;block-size:26px;border-radius:9px;border:2px solid var(--line-strong);display:grid;place-items:center;flex:none;color:transparent;background:var(--card)}
.opt[aria-checked="true"] .box{background:var(--accent);border-color:var(--accent);color:#fff}
.opt .box .i{inline-size:16px;block-size:16px;stroke-width:2.6}
.opt .code{font:600 12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--accent);direction:ltr;unicode-bidi:isolate}
.opt.off{opacity:.55}
.grp{margin:10px 2px 2px;font-size:12.5px;font-weight:700;color:var(--brass);letter-spacing:.02em}
.srch{position:relative}
.srch .i{position:absolute;inset-inline-start:14px;inset-block-start:50%;transform:translateY(-50%);color:var(--muted);pointer-events:none}
.srch .inp{padding-inline-start:44px;font-size:16px}
.seg{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;padding:2px}
.seg::-webkit-scrollbar{display:none}
.seg button{flex:none;min-block-size:44px;min-inline-size:48px;padding:0 14px;border:1.5px solid var(--line);border-radius:14px;background:var(--card);font-size:15px;font-weight:600;cursor:pointer;font-variant-numeric:tabular-nums}
.seg button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:#fff}
.seg.fit button{flex:1 1 0;min-inline-size:0;padding:0 4px}
.tags{display:flex;flex-wrap:wrap;gap:8px}
.tag{display:inline-flex;align-items:center;gap:8px;min-block-size:44px;padding:0 14px;border:1.5px solid var(--line);border-radius:999px;background:var(--card);font-size:13.5px;cursor:pointer}
.tag[aria-pressed="true"]{background:var(--accent-soft);border-color:var(--accent);color:var(--accent)}
.tag .i{inline-size:18px;block-size:18px}

/* ── رحلة الفصل ── */
.track{list-style:none;margin:0;padding:2px 0 0;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(52px,1fr);overflow-x:auto;scrollbar-width:none}
.track.ov{-webkit-mask-image:linear-gradient(to left,#000 calc(100% - 22px),transparent);mask-image:linear-gradient(to left,#000 calc(100% - 22px),transparent)}
.track::-webkit-scrollbar{display:none}
.stp{position:relative;display:grid;justify-items:center;align-content:start;gap:3px;padding-inline:3px;text-align:center}
.stp::before{content:"";position:absolute;inset-block-start:17px;inset-inline-start:50%;inset-inline-end:-50%;block-size:2px;background:var(--line-strong)}
.stp:last-child::before{display:none}
.stp.done::before{background:var(--accent)}
.stp .d{position:relative;z-index:1;inline-size:34px;block-size:34px;border-radius:50%;display:grid;place-items:center;background:var(--card);border:2px solid var(--line-strong);color:var(--muted)}
.stp .d .i{inline-size:16px;block-size:16px}
.stp.done .d{background:var(--accent);border-color:var(--accent);color:#fff}
.stp.now .d{background:var(--gold-soft);border-color:var(--brass);color:var(--gold);box-shadow:0 0 0 4px color-mix(in srgb,var(--brass) 16%,transparent)}
.stp.unset .d{border-style:dashed;background:transparent}
.stp b{font-size:11px;font-weight:700;line-height:1.35;overflow-wrap:anywhere}
.stp.unset b{color:var(--muted);font-weight:500}
.stp small{font-size:10.5px;color:var(--muted);line-height:1.4}

/* ── حلقة التقدم ── */
.ring{position:relative;inline-size:76px;block-size:76px;flex:none}
.ring svg{inline-size:100%;block-size:100%;transform:rotate(90deg) scaleX(-1)}
.ring circle{fill:none;stroke-width:8;stroke-linecap:round}
.ring .bg{stroke:var(--soft)}
.ring .fg{stroke:var(--accent);transition:stroke-dashoffset .9s var(--ease)}
.ring b{position:absolute;inset:0;display:grid;place-items:center;font-size:19px;font-variant-numeric:tabular-nums}
.big{font-size:30px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
.big small{font-size:14px;font-weight:500;color:var(--muted)}
.tk{position:relative;padding:0;overflow:hidden;gap:0}
.tk .hd{display:flex;align-items:center;gap:14px;padding:18px;background:linear-gradient(135deg,var(--accent-soft),var(--card))}
.tk .win{flex:none;inline-size:64px;block-size:64px;border-radius:18px;background:var(--accent);color:var(--on-accent);display:grid;place-items:center;align-content:center;line-height:1;box-shadow:0 8px 18px -10px var(--accent)}
.tk .win b{font-size:28px;font-weight:700;font-variant-numeric:tabular-nums}
.tk .win small{font-size:10.5px;opacity:.85;margin-block-start:2px}
.tk .hd .tx{display:grid;gap:3px;min-inline-size:0}
.tk .hd .tx b{font-size:16px}
.tk .perf{position:relative;block-size:0;border-block-start:2px dashed var(--line-strong);margin-inline:18px}
.tk .perf:before,.tk .perf:after{content:"";position:absolute;inset-block-start:-11px;inline-size:20px;block-size:20px;border-radius:50%;background:var(--bg);border:1px solid var(--line)}
.tk .perf:before{inset-inline-start:-29px}.tk .perf:after{inset-inline-end:-29px}
.tk .bd{padding:18px;display:grid;gap:12px}
.tk .ln{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;background:var(--soft)}
.tk .ln .ic{flex:none;inline-size:34px;block-size:34px;border-radius:11px;display:grid;place-items:center;background:var(--card);color:var(--accent)}
.tk .ln .tx{flex:1;min-inline-size:0;display:grid;gap:2px}
.tk .ln .tx b{font-size:14px;font-weight:600;line-height:1.5}
.tk .ln .tx small{color:var(--muted);font-size:12px;line-height:1.6}
.tk .ln .code{font:600 11.5px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--accent);direction:ltr;unicode-bidi:isolate}
.tk .tt{display:inline-flex;gap:5px;align-items:center;flex-wrap:wrap}
.tk .u{font-variant-numeric:tabular-nums;font-weight:700;color:var(--ink)}
.tk .bar{block-size:8px;border-radius:99px;background:var(--soft);overflow:hidden}
.tk .bar i{display:block;block-size:100%;border-radius:99px;background:var(--accent)}
.chip.warn{background:var(--gold-soft);color:var(--gold)}
.nt{padding:14px;gap:8px}
.nt h2{margin-block-end:2px}
.nt .it{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;background:var(--soft);cursor:pointer;border:0;inline-size:100%;text-align:start;font:inherit;color:inherit;min-block-size:56px}
.nt .it .ic{flex:none;inline-size:36px;block-size:36px;border-radius:12px;display:grid;place-items:center;background:var(--card);color:var(--accent)}
.nt .it.action .ic{background:var(--accent);color:var(--on-accent)}
.nt .it.alert .ic{background:var(--bad);color:#fff}
.nt .it.done .ic{background:var(--ok-soft);color:var(--ok)}
.nt .it .tx{flex:1;min-inline-size:0;display:grid;gap:1px}
.nt .it .tx b{font-size:14px;font-weight:600;line-height:1.5}
.nt .it .tx small{color:var(--muted);font-size:12px;line-height:1.6}
.nt .it .i.go{flex:none;color:var(--muted);inline-size:16px;block-size:16px}

.opt .tx small.need{color:var(--gold);display:flex;align-items:center;gap:5px;flex-wrap:wrap}.opt .tx small.need .i{inline-size:13px;block-size:13px}
.rp .ln{display:grid;gap:10px;padding:12px;border-radius:14px;background:var(--soft)}
.rp .ln .top{display:flex;align-items:center;gap:10px}
.rp .ln .top b{flex:1;min-inline-size:0;font-size:14.5px;line-height:1.5}
.rp .ln .why{display:flex;gap:6px;flex-wrap:wrap}
.rp .why button{min-block-size:40px;padding:0 12px;border-radius:12px;border:1.5px solid var(--line);background:var(--card);font:inherit;font-size:13px;cursor:pointer}
.rp .why button[aria-pressed="true"]{border-color:var(--bad);background:var(--bad);color:#fff}
.rp .yn{display:flex;gap:6px;flex:none}
.rp .yn button{min-block-size:44px;padding:0 14px;border-radius:14px;border:1.5px solid var(--line);background:var(--card);font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.rp .yn button[data-v="registered"][aria-pressed="true"]{background:var(--ok);border-color:var(--ok);color:#fff}
.rp .yn button[data-v="stuck"][aria-pressed="true"]{background:var(--bad);border-color:var(--bad);color:#fff}
.rp .help{display:grid;gap:10px;padding:14px;border-radius:16px;border:1.5px dashed var(--line-strong)}
.rp .ref{font:700 22px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;direction:ltr;text-align:center;padding:12px;border-radius:14px;background:var(--accent-soft);color:var(--accent)}

.tk .fine{font-size:11.5px;color:var(--muted);line-height:1.7;margin:0}


/* ── شريط سفلي لاصق ── */
.dock{position:fixed;inset-inline:0;inset-block-end:0;z-index:20;padding:10px 16px calc(12px + env(safe-area-inset-bottom));background:linear-gradient(180deg,transparent,var(--bg) 28%);pointer-events:none}
.dock>div{max-inline-size:520px;margin:0 auto;display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:22px;background:var(--card);border:1px solid var(--line);box-shadow:0 14px 30px -16px rgba(19,24,23,.45);pointer-events:auto}
.dock .ring{inline-size:48px;block-size:48px}
.dock .ring circle{stroke-width:7}
.dock .ring b{font-size:12px}
.dock .meta{flex:1;min-inline-size:0;display:grid;font-size:13px;line-height:1.4}
.dock .meta b{font-size:15px}
.dock .btn{inline-size:auto;min-inline-size:132px;min-block-size:48px;font-size:15px;border-radius:15px}

/* ── ورقة سفلية ── */
.scrim{position:fixed;inset:0;z-index:60;background:rgba(10,24,17,.5);display:flex;align-items:flex-end;justify-content:center}
.sheet{inline-size:min(100%,520px);max-block-size:92dvh;overflow:auto;background:var(--card);border-radius:28px 28px 0 0;padding:10px 18px calc(20px + env(safe-area-inset-bottom));display:grid;gap:14px;animation:up .26s var(--ease)}
.grab{inline-size:42px;block-size:5px;border-radius:5px;background:var(--line-strong);margin:0 auto}
.sheet h3{margin:0;font-size:19px}
@keyframes up{from{transform:translateY(40px);opacity:.5}to{transform:none;opacity:1}}
.toast{position:fixed;inset-inline:16px;inset-block-end:calc(96px + env(safe-area-inset-bottom));z-index:80;margin:0 auto;max-inline-size:420px;padding:12px 16px;border-radius:16px;background:var(--ink);color:#fff;font-size:14px;box-shadow:0 14px 30px -14px rgba(0,0,0,.5);animation:up .22s var(--ease)}
.toast.bad{background:var(--bad)}
.skel{block-size:150px;border-radius:var(--r);background:linear-gradient(100deg,var(--soft) 30%,var(--card) 50%,var(--soft) 70%);background-size:200% 100%;animation:sh 1.2s linear infinite;margin-block-start:14px}
@keyframes sh{to{background-position:-200% 0}}
details.more>summary{cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600;color:var(--accent);min-block-size:44px}
details.more>summary::-webkit-details-marker{display:none}
details.more[open]>summary .i{transform:rotate(180deg)}
.fade{animation:fade .4s var(--ease) both}
@keyframes fade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.fade,.sheet,.toast,.skel{animation:none}.ring .fg{transition:none}}
`;

export const STUDENT_HOME_SCRIPT = String.raw`
(function(){
"use strict";
var app=document.getElementById("app"),topEl=document.getElementById("top"),dockEl=document.getElementById("dock");
var S={state:null,view:"boot",civil:"",exists:false,resetPending:false,resetAt:"",catalog:null,plans:null,planSource:"",draft:null,offered:null,busy:false,remember:false,sheet:""};

function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
function digits(v){return String(v||"").replace(/[٠-٩]/g,function(d){return String("٠١٢٣٤٥٦٧٨٩".indexOf(d))}).replace(/[۰-۹]/g,function(d){return String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))}).replace(/\D/g,"")}
function civilValid(v){v=String(v||"");if(!/^\d{12}$/.test(v))return false;var w=[2,1,6,3,7,9,10,5,8,4,2],sum=0;for(var i=0;i<11;i++)sum+=Number(v.charAt(i))*w[i];return 11-(sum%11)===Number(v.charAt(11))}
function ic(n,c){return '<svg class="i'+(c?" "+c:"")+'" aria-hidden="true"><use href="#i-'+n+'"/></svg>'}
function fmtDate(iso){if(!iso)return"";var d=new Date(iso);if(isNaN(d.getTime()))return"";return d.toLocaleDateString("ar-KW-u-nu-latn",{day:"numeric",month:"long",year:"numeric"})}
function fmtShort(iso){if(!iso)return"";var d=new Date(iso+"T00:00:00Z");if(isNaN(d.getTime()))return"";return d.toLocaleDateString("ar-KW-u-nu-latn",{day:"numeric",month:"short",timeZone:"UTC"})}
${ARABIC_COUNT_SCRIPT}

function api(method,url,body){
  return fetch(url,{method:method,headers:{"Content-Type":"application/json"},credentials:"same-origin",body:body===undefined?undefined:JSON.stringify(body)})
    .then(function(r){return r.text().then(function(t){var d={};try{d=t?JSON.parse(t):{}}catch(e){}return{ok:r.ok,status:r.status,d:d}})})
    .catch(function(){return{ok:false,status:0,d:{error:"تعذّر الاتصال. تحقق من الإنترنت ثم أعد المحاولة."}}});
}
var toastTimer=0;
function toast(msg,bad){var old=document.getElementById("toast");if(old)old.remove();var el=document.createElement("div");el.id="toast";el.className="toast"+(bad?" bad":"");el.setAttribute("role",bad?"alert":"status");el.textContent=msg;document.body.appendChild(el);clearTimeout(toastTimer);toastTimer=setTimeout(function(){el.remove()},3800)}

/* ── أجزاءٌ مشتركة ── */
function otp(id,label){return '<div class="field"><label for="'+id+'">'+esc(label)+'</label><div class="otpw"><div class="otp" id="'+id+'-b" aria-hidden="true">'+'<i></i><i></i><i></i><i></i><i></i><i></i></div><input id="'+id+'" inputmode="numeric" autocomplete="off" maxlength="6" aria-label="'+esc(label)+'" dir="ltr"></div></div>'}
function wireOtp(id,cb){var inp=document.getElementById(id),box=document.getElementById(id+"-b");if(!inp)return;function paint(){var v=digits(inp.value).slice(0,6);inp.value=v;var cells=box.children;for(var i=0;i<6;i++){cells[i].textContent=i<v.length?"•":"";cells[i].className=i<v.length?"fill":(i===v.length&&document.activeElement===inp?"on":"")}if(cb)cb(v)}inp.addEventListener("input",paint);inp.addEventListener("focus",paint);inp.addEventListener("blur",paint);paint()}
function ring(pct,size){var r=34,c=2*Math.PI*r,off=c*(1-Math.max(0,Math.min(100,pct))/100);return '<div class="ring" role="img" aria-label="'+pct+'٪"><svg viewBox="0 0 80 80"><circle class="bg" cx="40" cy="40" r="'+r+'"/><circle class="fg" cx="40" cy="40" r="'+r+'" stroke-dasharray="'+c.toFixed(1)+'" stroke-dashoffset="'+c.toFixed(1)+'" data-off="'+off.toFixed(1)+'"/></svg><b>'+pct+'٪</b></div>'}
function markOverflow(){var t=document.querySelector(".track");if(t&&t.scrollWidth>t.clientWidth+2)t.className+=" ov"}
function animateRings(){var fgs=document.querySelectorAll(".ring .fg");for(var i=0;i<fgs.length;i++){(function(el){requestAnimationFrame(function(){requestAnimationFrame(function(){el.style.strokeDashoffset=el.getAttribute("data-off")})})})(fgs[i])}}
function phaseChip(){var s=S.state;if(!s)return"";var ph=s.phase;return '<div class="phase">'+ic(ph.mode==="wishes"?"heart":ph.mode==="report"?"ticket":ph.mode==="frozen"?"lock":"clock")+'<span>'+(ph.line.indexOf(ph.label)>=0?'':'<b>'+esc(ph.label)+'</b> · ')+esc(ph.line)+'</span></div>'}
function track(){var s=S.state;if(!s||!s.timeline)return"";var ICON={submission:"book",wishes:"heart",frozen:"lock",round:"ticket",close:"flag"};var h='<ol class="track" aria-label="رحلة الفصل">';s.timeline.forEach(function(st){var d=st.to||st.from;h+='<li class="stp '+st.state+'"'+(st.state==="now"?' aria-current="step"':"")+'><span class="d">'+ic(st.state==="done"?"check":ICON[st.kind]||"clock")+'</span><b>'+esc(st.title)+'</b><small>'+(d?esc(fmtShort(d)):"—")+'</small></li>'});return h+'</ol>'}
function setTop(){var s=S.state;topEl.innerHTML='<span class="mark">SCHEDULE</span>'+(s&&s.term?'<span class="term">'+ic("cal")+esc(s.term.name)+'</span>':"")}
function setView(v){S.view=v;render()}
function sheet(html){closeSheet();var el=document.createElement("div");el.className="scrim";el.id="scrim";el.innerHTML='<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>'+html+'</div>';el.addEventListener("click",function(e){if(e.target===el)closeSheet()});document.body.appendChild(el);return el}
function closeSheet(){var el=document.getElementById("scrim");if(el)el.remove()}
function errBox(id){return '<div class="err" id="'+id+'" role="alert" hidden></div>'}
function showErr(id,msg){var el=document.getElementById(id);if(!el)return;el.textContent=msg;el.hidden=!msg}

/* ── الدخول ── */
function viewGate(){
  app.innerHTML='<section class="hero fade"><span class="disc">'+ic("cap")+'</span><h1>مساري</h1><p>جدولك المتوقع قبل التسجيل، في مكانٍ واحد.</p>'+phaseChip()+'</section>'
   +'<section class="card fade"><div class="field"><label for="civil">الرقم المدني</label><input class="inp civil" id="civil" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="اكتب رقمك المدني" dir="ltr" aria-describedby="chint"><p class="hint" id="chint"></p></div>'
   +errBox("gerr")+'<button class="btn" id="go" disabled>تابع '+ic("back")+'</button>'
   +'<p class="priv">'+ic("shield")+'نحفظ بصمةً مشفّرة وأرقام مقرراتك فقط — لا اسم ولا رقم مدني.</p></section>';
  var inp=document.getElementById("civil"),hint=document.getElementById("chint"),go=document.getElementById("go");
  function paint(){inp.value=digits(inp.value).slice(0,12);var v=inp.value;go.disabled=true;hint.className="hint";
    if(!v.length){hint.textContent="";return}
    if(v.length<12){hint.textContent="باقي "+(12-v.length)+" رقماً";return}
    if(civilValid(v)){hint.textContent="رقمٌ صحيح";hint.className="hint ok";go.disabled=false}else{hint.textContent="هذا الرقم غير صحيح — راجع بطاقتك المدنية";hint.className="hint bad"}}
  inp.addEventListener("input",paint);inp.addEventListener("keydown",function(e){if(e.key==="Enter"&&!go.disabled){e.preventDefault();go.click()}});
  go.addEventListener("click",function(){go.disabled=true;go.textContent="يتحقق…";S.civil=inp.value;
    api("POST","/api/public/me/identity",{civil:S.civil}).then(function(r){
      if(!r.ok){go.disabled=false;go.innerHTML='تابع '+ic("back");showErr("gerr",r.d.error||"تعذّر التحقق");return}
      S.exists=!!r.d.exists;S.resetPending=!!r.d.resetPending;S.resetAt=r.d.resetAt||"";setView(S.exists?"code":"create")})});
  if(S.civil)inp.value=S.civil;paint();setTimeout(function(){try{inp.focus()}catch(e){}},50);
}
function rememberSwitch(){return '<button type="button" class="sw" role="switch" id="rem" aria-checked="'+(S.remember?"true":"false")+'"><span class="t">هذا جهازي الشخصي<small>يبقى دخولك 180 يوماً. لا تفعّله على جهازٍ مشترك.</small></span><span class="tg"></span></button>'}
function wireRemember(){var b=document.getElementById("rem");if(b)b.addEventListener("click",function(){S.remember=!S.remember;b.setAttribute("aria-checked",S.remember?"true":"false")})}
function viewCode(){
  app.innerHTML='<section class="hero fade"><span class="disc">'+ic("lock")+'</span><h1>أهلاً بعودتك</h1><p>أدخل رمزك الشخصي لتفتح ملفّك.</p></section>'
   +'<section class="card fade">'+(S.resetPending?'<div class="note">'+ic("info")+'<span>سيُحذف هذا الملف في '+esc(fmtDate(S.resetAt))+' بناءً على الطلب الذي قُدّم. دخولك بالرمز الصحيح يُلغيه.</span></div>':"")
   +otp("code","رمزك الشخصي")+rememberSwitch()+errBox("cerr")+'<button class="btn" id="enter" disabled>ادخل '+ic("back")+'</button>'
   +'<div class="row between"><button class="link" id="forgot">نسيت رمزي</button><button class="link" id="other">رقم مدني آخر</button></div></section>';
  var code="",btn=document.getElementById("enter");wireRemember();
  wireOtp("code",function(v){code=v;btn.disabled=v.length!==6});
  function submit(){if(btn.disabled)return;btn.disabled=true;btn.textContent="يتحقق…";showErr("cerr","");
    api("POST","/api/public/me/enter",{civil:S.civil,code:code,remember:S.remember}).then(function(r){
      if(!r.ok){btn.disabled=false;btn.innerHTML='ادخل '+ic("back");var left=r.d.attemptsLeft;showErr("cerr",(r.d.error||"تعذّر الدخول")+(left>0&&left<5?" (تبقّى "+countOf(left,AR.attempt)+")":""));var i=document.getElementById("code");if(i){i.value="";i.dispatchEvent(new Event("input"));i.focus()}return}
      afterSignIn()})}
  btn.addEventListener("click",submit);document.getElementById("code").addEventListener("keydown",function(e){if(e.key==="Enter")submit()});
  document.getElementById("other").addEventListener("click",function(){S.civil="";S.remember=false;setView("gate")});
  document.getElementById("forgot").addEventListener("click",function(){
    var el=sheet('<h3>نسيت رمزك؟</h3><p class="lead">حمايةً لملفّك لا يستطيع أحدٌ استرجاع الرمز. يمكنك طلب حذف الملف: يُحذف بعد 30 يوماً، وإن تذكّرت رمزك قبلها وأدخلته أُلغي الطلب. ثم تنشئ ملفاً جديداً بدقائق.</p>'+errBox("rerr")+'<button class="btn danger" id="rq">اطلب حذف ملفي</button><button class="btn alt" id="rc">تراجع</button>');
    document.getElementById("rc").addEventListener("click",closeSheet);
    document.getElementById("rq").addEventListener("click",function(){var b=this;b.disabled=true;api("POST","/api/public/me/reset",{civil:S.civil}).then(function(r){b.disabled=false;if(!r.ok){showErr("rerr",r.d.error||"تعذّر الطلب");return}closeSheet();S.resetPending=true;S.resetAt=r.d.deleteAt;toast("سيُحذف ملفّك بعد 30 يوماً ما لم تدخل برمزك.");viewCode()})})});
  setTimeout(function(){var i=document.getElementById("code");if(i)i.focus()},60);
}
function viewCreate(){
  app.innerHTML='<section class="hero fade"><span class="disc">'+ic("spark")+'</span><h1>ابدأ ملفّك</h1><p>اختر رمزاً من 6 أرقام يحمي ملفّك. لا يعرفه غيرك.</p></section>'
   +'<section class="card fade"><div class="field"><label for="nm">الاسم الثلاثي</label><input class="inp" id="nm" autocomplete="name" maxlength="80"><p class="muted">'+ic("shield","")+' يُحفظ مختوماً مع ملفّك، ولا يراه أحدٌ إلا قسمُ مقررك إن تعثّرتَ وطلبتَ مساعدته.</p></div>'+otp("c1","رمزك الشخصي")+otp("c2","أعد كتابة الرمز")+rememberSwitch()
   +'<label class="chk"><input type="checkbox" id="agree"><span>أوافق على حفظ ملفّي: اسمي (مختوماً) وأرقام المقررات التي أنجزتها ورغباتي. يُحذف تلقائياً بعد تخرّجي المتوقَّع بسنة أو إن انقطعت عامين، وأستطيع حذفه متى شئت.</span></label>'
   +errBox("verr")+'<button class="btn" id="mk" disabled>أنشئ ملفّي '+ic("back")+'</button><button class="link" id="other">رقم مدني آخر</button></section>';
  var a="",b="",agree=document.getElementById("agree"),mk=document.getElementById("mk"),nm=document.getElementById("nm");wireRemember();
  function nameOk(){var v=nm.value.replace(/\s+/g," ").trim();return v.length>=6&&v.length<=80&&!/[<>{}\\\d]/.test(v)}
  nm.addEventListener("input",function(){sync()});
  function sync(){mk.disabled=!(nameOk()&&a.length===6&&b.length===6&&agree.checked);showErr("verr",a.length===6&&b.length===6&&a!==b?"الرمزان غير متطابقين":"")}
  wireOtp("c1",function(v){a=v;sync()});wireOtp("c2",function(v){b=v;sync()});agree.addEventListener("change",sync);
  mk.addEventListener("click",function(){if(a!==b){showErr("verr","الرمزان غير متطابقين");return}mk.disabled=true;mk.textContent="ينشئ…";
    api("POST","/api/public/me/enter",{civil:S.civil,code:a,create:true,agree:true,remember:S.remember,name:nm.value}).then(function(r){
      if(!r.ok){mk.disabled=false;mk.innerHTML='أنشئ ملفّي '+ic("back");showErr("verr",r.d.error||"تعذّر الإنشاء");return}
      afterSignIn()})});
  document.getElementById("other").addEventListener("click",function(){S.civil="";setView("gate")});
  setTimeout(function(){var i=document.getElementById("nm");if(i)i.focus()},60);
}
function afterSignIn(){S.civil="";api("GET","/api/public/me/state").then(function(r){if(r.ok){S.state=r.d;setTop()}S.draft=null;S.offered=null;setView(S.state&&S.state.profile&&S.state.profile.setupDone?"home":"setup")})}

/* ── إعداد الملف: القسم ← الصحيفة ← ما أنجزت ── */
function ensureCatalog(cb){if(S.catalog)return cb();api("GET","/api/public/me/catalog").then(function(r){S.catalog=r.ok?r.d.colleges:[];cb()})}
function startDraft(){var p=S.state.profile||{};S.draft={sectionId:p.sectionId||0,sectionName:p.sectionName||"",planId:p.planId||"",passed:(p.passedCourseIds||[]).slice(),step:1,q:"",filter:"all"};return S.draft}
function viewSetup(){var d=S.draft||startDraft();ensureCatalog(function(){if(d.step===1)setupSection();else if(d.step===2)setupPlan();else setupPassed()})}
function stepsBar(n,total){var h='<div class="steps" aria-hidden="true">';for(var i=1;i<=total;i++)h+='<i class="'+(i<n?"on":i===n?"now":"")+'"></i>';return h+'</div>'}
function setupSection(){var d=S.draft;
  app.innerHTML=stepsBar(1,3)+'<h1 class="h2 fade">ما قسمك العلمي؟</h1><p class="muted">اختر القسم الذي تدرس فيه.</p><div class="srch" style="margin-block-start:12px">'+ic("search")+'<input class="inp" id="q" type="search" placeholder="ابحث باسم القسم" aria-label="ابحث باسم القسم" autocomplete="off"></div><div id="lst" class="list" style="margin-block-start:12px"></div>';
  var lst=document.getElementById("lst"),q=document.getElementById("q");
  function paint(){var t=q.value.trim(),h="",any=false;(S.catalog||[]).forEach(function(c){var items=c.sections.filter(function(s){return!t||(s.name+" "+c.name).indexOf(t)>=0});if(!items.length)return;any=true;h+='<div class="grp">'+esc(c.name)+'</div>';items.forEach(function(s){h+='<button type="button" class="opt" data-id="'+s.id+'" data-n="'+esc(s.name)+'" aria-pressed="'+(d.sectionId===s.id?"true":"false")+'"><span class="tx"><b>'+esc(s.name)+'</b></span>'+ic("back")+'</button>'})});lst.innerHTML=any?h:'<p class="muted">لا قسم بهذا الاسم.</p>'}
  q.addEventListener("input",paint);paint();
  lst.addEventListener("click",function(e){var b=e.target.closest(".opt");if(!b)return;var id=Number(b.getAttribute("data-id"));if(id!==d.sectionId){d.passed=[];d.planId=""}d.sectionId=id;d.sectionName=b.getAttribute("data-n");d.plans=null;
    api("GET","/api/public/me/plan?sectionId="+id).then(function(r){if(!r.ok){toast(r.d.error||"تعذّر تحميل القسم",true);return}S.plans=r.d.plans;S.planSource=r.d.source;
      if(S.plans.length===1){d.planId=S.plans[0].id;d.step=3}else d.step=2;viewSetup()})});
}
function setupPlan(){var d=S.draft;
  var label={transition:"السابقة",active:"الجديدة"};
  app.innerHTML=stepsBar(2,3)+'<button class="link" id="bk" style="padding-inline:0">'+ic("back")+' القسم</button><h1 class="h2 fade">على أي صحيفةٍ تدرس؟</h1><p class="muted">'+esc(d.sectionName)+'</p><div class="list" style="margin-block-start:12px" id="pl"></div>';
  var h="";S.plans.forEach(function(p){h+='<button type="button" class="opt" data-id="'+esc(p.id)+'" aria-pressed="'+(d.planId===p.id?"true":"false")+'"><span class="tx"><b>'+esc(p.name)+'</b><small>'+(label[p.status]&&p.name.indexOf(label[p.status])<0?"الصحيفة "+label[p.status]+" · ":"")+countOf(p.courses.length,AR.course)+'</small></span>'+ic("back")+'</button>'});
  document.getElementById("pl").innerHTML=h;
  document.getElementById("pl").addEventListener("click",function(e){var b=e.target.closest(".opt");if(!b)return;d.planId=b.getAttribute("data-id");d.passed=[];d.step=3;viewSetup()});
  document.getElementById("bk").addEventListener("click",function(){d.step=1;viewSetup()});
}
function currentPlan(){var d=S.draft,pl=S.plans||[];for(var i=0;i<pl.length;i++)if(pl[i].id===d.planId)return pl[i];return pl[0]||{courses:[]}}
function setupPassed(){var d=S.draft,load=function(){
  var plan=currentPlan(),courses=plan.courses,total=0,units=0;courses.forEach(function(c){total+=c.credit});
  app.innerHTML=stepsBar(3,3)+'<button class="link" id="bk" style="padding-inline:0">'+ic("back")+' رجوع</button><h1 class="h2 fade">ما الذي أنجزته؟</h1><p class="muted">علّم المقررات التي اجتزتها. يمكنك تعديلها لاحقاً.</p>'
   +'<div class="srch" style="margin-block-start:12px">'+ic("search")+'<input class="inp" id="q" type="search" placeholder="ابحث باسم المقرر أو رمزه" aria-label="ابحث في المقررات" autocomplete="off"></div>'
   +'<div class="seg" role="group" aria-label="تصفية" style="margin-block-start:10px"><button type="button" data-f="all" aria-pressed="true">الكل</button><button type="button" data-f="done" aria-pressed="false">المنجَز</button><button type="button" data-f="todo" aria-pressed="false">غير المنجَز</button></div>'
   +'<div class="row between" style="margin-block-start:10px"><button class="link" id="all" style="padding-inline:0">علّم المعروض</button><button class="link" id="none" style="padding-inline:0">أزل التعليم</button></div>'
   +'<div class="list" id="crs" style="margin-block-start:6px"></div>';
  dockEl.innerHTML='<div><div id="dr"></div><div class="meta"><b id="dc"></b><span id="du"></span></div><button class="btn" id="sv">احفظ ملفّي</button></div>';
  var lst=document.getElementById("crs"),q=document.getElementById("q"),set={};d.passed.forEach(function(i){set[i]=1});
  function counts(){var n=0,u=0;courses.forEach(function(c){if(set[c.id]){n++;u+=c.credit}});var pct=total?Math.round(u/total*100):0;document.getElementById("dr").innerHTML=ring(pct);animateRings();document.getElementById("dc").textContent=countOf(n,AR.course);document.getElementById("du").textContent="من "+courses.length+" · "+countOf(u,AR.unit)}
  function visible(){var t=q.value.trim().toLowerCase();return courses.filter(function(c){if(d.filter==="done"&&!set[c.id])return false;if(d.filter==="todo"&&set[c.id])return false;return!t||(c.name+" "+c.code).toLowerCase().indexOf(t)>=0})}
  function paint(){var h="";visible().forEach(function(c){h+='<div class="opt" role="checkbox" tabindex="0" aria-checked="'+(set[c.id]?"true":"false")+'" data-id="'+c.id+'"><span class="box">'+ic("check")+'</span><span class="tx"><b>'+esc(c.name)+'</b><small><span class="code">'+esc(c.code)+'</span> · '+countOf(c.credit,AR.unit)+'</small></span></div>'});lst.innerHTML=h||'<p class="muted">لا مقررات مطابقة.</p>';counts()}
  function toggle(el){var id=Number(el.getAttribute("data-id"));if(set[id])delete set[id];else set[id]=1;el.setAttribute("aria-checked",set[id]?"true":"false");counts();if(d.filter!=="all")setTimeout(paint,160)}
  lst.addEventListener("click",function(e){var el=e.target.closest(".opt");if(el)toggle(el)});
  lst.addEventListener("keydown",function(e){if(e.key===" "||e.key==="Enter"){var el=e.target.closest(".opt");if(el){e.preventDefault();toggle(el)}}});
  q.addEventListener("input",paint);
  document.querySelectorAll(".seg button").forEach(function(b){b.addEventListener("click",function(){d.filter=b.getAttribute("data-f");document.querySelectorAll(".seg button").forEach(function(x){x.setAttribute("aria-pressed",x===b?"true":"false")});paint()})});
  document.getElementById("all").addEventListener("click",function(){visible().forEach(function(c){set[c.id]=1});paint()});
  document.getElementById("none").addEventListener("click",function(){visible().forEach(function(c){delete set[c.id]});paint()});
  document.getElementById("bk").addEventListener("click",function(){dockEl.innerHTML="";d.passed=Object.keys(set).map(Number);d.step=S.plans&&S.plans.length>1?2:1;viewSetup()});
  document.getElementById("sv").addEventListener("click",function(){var b=this;b.disabled=true;b.textContent="يحفظ…";
    api("PUT","/api/public/me/profile",{sectionId:d.sectionId,curriculumPlanId:d.planId,passedCourseIds:Object.keys(set).map(Number)}).then(function(r){
      if(!r.ok){b.disabled=false;b.textContent="احفظ ملفّي";toast(r.d.error||"تعذّر الحفظ",true);if(r.status===401){S.state.signedIn=false;setView("gate")}return}
      dockEl.innerHTML="";S.state.profile=r.d;S.draft=null;S.offered=null;toast("تم حفظ ملفّك");setView("home")})});
  paint()};
  if(S.plans&&S.plans.length&&S.draft.sectionId)load();else api("GET","/api/public/me/plan?sectionId="+d.sectionId).then(function(r){if(!r.ok){toast(r.d.error||"تعذّر التحميل",true);return}S.plans=r.d.plans;if(!d.planId&&S.plans.length===1)d.planId=S.plans[0].id;load()})}

/* ── الرئيسية ── */
function viewHome(){
  dockEl.innerHTML="";var s=S.state,p=s.profile,ph=s.phase,pr=p.progress||{percent:0,passedUnits:0,totalUnits:0,remainingUnits:0};
  var h='<section class="card fade" style="margin-block-start:6px"><div class="row" style="gap:16px">'+ring(pr.percent)+'<div style="flex:1;min-inline-size:0;display:grid;gap:2px"><b style="font-size:17px">'+esc(p.sectionName)+'</b><span class="muted">'+(p.planName?esc(p.planName)+" · ":"")+countOf(p.passedUnits,AR.unit)+' مجتازة'+(pr.remainingUnits?" · بقي "+countOf(pr.remainingUnits,AR.unit):"")+'</span></div><button class="link" id="edp" aria-label="عدّل ما أنجزت">'+ic("edit")+'</button></div></section>';
  h+='<div id="notices"></div>';h+='<section class="card fade"><h2><span class="b">'+ic("clock")+'</span>رحلة الفصل</h2>'+track()+'<p class="muted">'+esc(ph.line)+(ph.nextAt?" · التالي: "+esc(ph.nextLabel)+" "+esc(fmtShort(ph.nextAt)):"")+'</p></section>';
  h+='<div id="ticket"></div><div id="report"></div><div id="offered"></div><div id="wishes"></div>';
  h+='<section class="card fade"><h2><span class="b">'+ic("user")+'</span>ملفي</h2><p class="muted">'+ic("shield","")+' يُحفظ ملفّك حتى '+esc(fmtDate(p.keepsUntil))+(p.keepsReason==="inactive"?" ما لم تعد إليه":"")+'، ثم يُحذف وحده.</p><div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn alt small" id="chg" style="inline-size:auto">'+ic("key")+'غيّر الرمز</button><button class="btn alt small" id="del" style="inline-size:auto">'+ic("trash")+'احذف ملفّي</button><button class="btn alt small" id="out" style="inline-size:auto">'+ic("out")+'اخرج</button></div></section>';
  app.innerHTML=h;animateRings();markOverflow();
  document.getElementById("edp").addEventListener("click",function(){var d=startDraft();d.step=3;viewSetup()});
  document.getElementById("out").addEventListener("click",function(){api("POST","/api/public/me/exit",{}).then(function(){S.state.signedIn=false;S.state.profile=null;S.civil="";S.remember=false;S.draft=null;S.offered=null;setView("gate")})});
  document.getElementById("chg").addEventListener("click",sheetCode);
  document.getElementById("del").addEventListener("click",sheetForget);
  loadNotices();loadTicket();loadReport();loadOffered();renderWishes();
}
var DAYN=["أحد","اثنين","ثلاثاء","أربعاء","خميس"];
function hhmm(m){var h=Math.floor(m/60),n=m%60;return (h<10?"0":"")+h+":"+(n<10?"0":"")+n}
function slotsText(slots){var g={};slots.forEach(function(x){var k=hhmm(x.start)+"–"+hhmm(x.end);(g[k]=g[k]||[]).push(DAYN[x.day]||"")});return Object.keys(g).map(function(k){return g[k].join(" · ")+' <bdi dir="ltr">'+k+'</bdi>'}).join("، ")}
var WHY={prereq:"ينقصك مسبقه",full:"امتلأت شعبه",conflict:"يتعارض مع غيره",units:"فوق وحداتك المطلوبة","not-offered":"لا يُطرح هذا الفصل"};
var NT_ICON={edit:"edit",ticket:"ticket",check:"check",info:"info",clock:"clock",lock:"lock"},NT_TARGET={setup:"edp",wishes:"wishes",ticket:"ticket",report:"report",cases:"notices"};
function loadNotices(){var host=document.getElementById("notices");if(!host)return;
  api("GET","/api/public/me/notices").then(function(r){if(!r.ok||!r.d.notices||!r.d.notices.length){host.innerHTML="";return}
    var list=r.d.notices,showAll=false;
    function paint(){var shown=showAll?list:list.slice(0,4);
      var h='<section class="card nt fade"><h2><span class="b">'+ic("spark")+'</span>ما الجديد؟'+(list.filter(function(n){return n.tone==="action"||n.tone==="alert"}).length?'<span class="chip gold">'+list.filter(function(n){return n.tone==="action"||n.tone==="alert"}).length+'</span>':'')+'</h2>';
      shown.forEach(function(n,i){h+='<button type="button" class="it '+n.tone+'" data-i="'+i+'"><span class="ic">'+ic(NT_ICON[n.icon]||"info")+'</span><span class="tx"><b>'+esc(n.title)+'</b>'+(n.detail?'<small>'+esc(n.detail)+'</small>':'')+'</span>'+ic("back","go")+'</button>'});
      if(list.length>4&&!showAll)h+='<button type="button" class="link" id="ntall">عرض الكل ('+list.length+')</button>';
      host.innerHTML=h+'</section>';
      host.querySelectorAll(".it").forEach(function(b){b.addEventListener("click",function(){var n=shown[Number(b.getAttribute("data-i"))],el=document.getElementById(NT_TARGET[n.target]||"");if(el&&el.scrollIntoView)el.scrollIntoView({behavior:"smooth",block:"center"});if(n.target==="setup"&&el)el.click()})});
      var all=document.getElementById("ntall");if(all)all.addEventListener("click",function(){showAll=true;paint()})}
    paint()})}
function loadTicket(){var host=document.getElementById("ticket");if(!host)return;
  api("GET","/api/public/me/ticket").then(function(r){if(!r.ok||!r.d.ready){host.innerHTML="";return}var t=r.d;S.ticket=t;S.tkPlan=S.tkPlan||"A";paintTicket(host)})}
function paintTicket(host){var t=S.ticket,cur=null;t.plans.forEach(function(p){if(p.label===S.tkPlan)cur=p});if(!cur)cur=t.plans[0];
  var w=t.window,when=w.name?(w.name+(w.start?" · "+fmtShort(w.start)+(w.end?" → "+fmtShort(w.end):""):"")):"يحدّد موعدَها صاحبُ القرار";
  var h='<section class="card tk fade"><div class="hd"><span class="win"><b>'+w.n+'</b><small>من '+w.of+'</small></span><div class="tx"><b>تذكرتي · نافذتي '+w.n+'</b><span class="muted">'+esc(when)+'</span></div></div><div class="perf"></div><div class="bd">';
  if(t.stale)h+='<div class="chip warn">'+ic("info")+' عدّلت ملفّك بعد آخر حساب — ستتحدّث تذكرتك في التحديث القادم</div>';
  if(t.defaulted)h+='<div class="chip">'+ic("info")+' بُنيت على افتراضٍ (١٥ وحدة). اكتب رغباتك لتُناسبك</div>';
  h+='<div class="seg fit" role="group" aria-label="الخطة">'+t.plans.map(function(p){return '<button type="button" data-l="'+p.label+'" aria-pressed="'+(p.label===cur.label?"true":"false")+'">'+({A:"الخطة أ",B:"الخطة ب",C:"الخطة ج"})[p.label]+'</button>'}).join("")+'</div>';
  h+='<div class="row between"><span class="muted">'+({A:"الأقرب لرغباتك",B:"شعبٌ بديلة إن امتلأت أ",C:"الحدّ الأدنى الآمن"})[cur.label]+'</span><span class="u">'+countOf(cur.units,AR.unit)+'</span></div>';
  if(!cur.items.length)h+='<p class="lead">لا مقرراتٍ تُناسب هذه الخطة الآن.</p>';
  cur.items.forEach(function(i){h+='<div class="ln"><span class="ic">'+ic("book")+'</span><span class="tx"><b>'+esc(i.name)+'</b><small>'+(i.timesVisible?esc(i.section?"شعبة "+i.section+" · ":"")+slotsText(i.slots):ic("lock","")+" الموعد يظهر عند اعتماد جدول القسم")+'</small></span>'+(i.tight?'<span class="chip warn">مقاعد قليلة</span>':'')+'<span class="code">'+esc(i.code)+'</span></div>'});
  if(t.unmet.length){h+='<details class="more"><summary>'+ic("down")+' ما لم نضعه ('+t.unmet.length+')</summary><div class="list" style="margin-block-start:6px">'+t.unmet.map(function(u){return '<div class="opt off"><span class="tx"><b>'+esc(u.name)+'</b><small>'+esc(WHY[u.reason]||"")+'</small></span></div>'}).join("")+'</div></details>'}
  h+='<p class="fine">'+ic("shield","")+' تقديرٌ تجريبي من بياناتٍ جمعناها — لا يحجز مقعداً ولا يُغني عن التسجيل الرسمي.</p></div></section>';
  host.innerHTML=h;
  host.querySelectorAll(".seg button").forEach(function(b){b.addEventListener("click",function(){S.tkPlan=b.getAttribute("data-l");paintTicket(host)})})}
function loadReport(){var host=document.getElementById("report");if(!host)return;
  api("GET","/api/public/me/report").then(function(r){if(!r.ok||!r.d.ready||(!r.d.canReport&&!r.d.answers.length)||!r.d.courses.length){host.innerHTML="";return}S.report=r.d;S.rp={};r.d.answers.forEach(function(a){S.rp[a.courseId]={state:a.state,reason:a.reason||"other"}});S.rpHelp=false;paintReport(host)})}
function paintReport(host){var d=S.report,h='<section class="card rp fade"><h2><span class="b">'+ic("check")+'</span>هل سجّلت؟'+(d.answeredAt?'<span class="chip ok">'+ic("check","")+' أُرسل</span>':'')+'</h2><p class="muted">'+esc(d.line)+' أخبرنا بما حدث — يساعدنا ويساعد قسمك.</p>';
  var anyStuck=false;
  d.courses.forEach(function(c){var a=S.rp[c.courseId]||{},stuck=a.state==="stuck";if(stuck)anyStuck=true;
    h+='<div class="ln" data-c="'+c.courseId+'"><div class="top"><b>'+esc(c.name)+'</b><div class="yn"><button type="button" data-v="registered" aria-pressed="'+(a.state==="registered")+'">سجّلت</button><button type="button" data-v="stuck" aria-pressed="'+stuck+'">تعثّرت</button></div></div>'
      +(stuck?'<div class="why">'+[["full","امتلأت الشعب"],["prereq","المسبق لا يسمح"],["conflict","تعارض"],["other","آخر"]].map(function(x){return '<button type="button" data-w="'+x[0]+'" aria-pressed="'+(a.reason===x[0])+'">'+x[1]+'</button>'}).join("")+'</div>':'')+'</div>'});
  if(anyStuck&&d.canReport){var known=S.state&&S.state.profile&&S.state.profile.hasIdentity;
    h+='<div class="help"><label class="row" style="gap:10px"><input type="checkbox" id="hp"'+(S.rpHelp?" checked":"")+'><span>أريد أن يساعدني القسم في حالتي</span></label>'
    +(S.rpHelp&&known?'<p class="muted">'+ic("shield","")+' سيصل اسمك المحفوظ مع ملفّك لقسم المقرر وللتسجيل فقط.</p>':'')
    +(S.rpHelp&&!known?'<div class="field"><label for="hn">الاسم الثلاثي</label><input class="inp" id="hn" autocomplete="name"></div><div class="field"><label for="hc">الرقم المدني</label><input class="inp civil" id="hc" inputmode="numeric" maxlength="12" dir="ltr" autocomplete="off"></div><p class="muted">'+ic("shield","")+' يصل اسمك ورقمك المدني لقسم المقرر وللتسجيل فقط، ولا يُحفظان في ملفّك الدائم.</p>':'')+'</div>'}
  h+=errBox("rperr");
  if(d.canReport)h+='<button class="btn" id="rps"'+(Object.keys(S.rp).length?"":" disabled")+'>'+ic("check")+' أرسل</button>';
  h+='<div id="rpdone"></div></section>';host.innerHTML=h;
  host.querySelectorAll(".ln").forEach(function(row){var id=Number(row.getAttribute("data-c"));
    row.querySelectorAll(".yn button").forEach(function(b){b.addEventListener("click",function(){if(!d.canReport)return;var v=b.getAttribute("data-v");S.rp[id]={state:v,reason:(S.rp[id]&&S.rp[id].reason)||"other"};paintReport(host)})});
    row.querySelectorAll(".why button").forEach(function(b){b.addEventListener("click",function(){S.rp[id].reason=b.getAttribute("data-w");paintReport(host)})})});
  var hp=document.getElementById("hp");if(hp)hp.addEventListener("change",function(){S.rpHelp=hp.checked;paintReport(host)});
  var sv=document.getElementById("rps");if(sv)sv.addEventListener("click",function(){sv.disabled=true;showErr("rperr","");
    var answers=Object.keys(S.rp).map(function(k){return{courseId:Number(k),state:S.rp[k].state,reason:S.rp[k].reason}});
    var body={answers:answers};if(anyStuck&&S.rpHelp){body.help=(S.state.profile&&S.state.profile.hasIdentity)?true:{name:(document.getElementById("hn")||{}).value||"",civil:(document.getElementById("hc")||{}).value||""}}
    api("POST","/api/public/me/report",body).then(function(r){sv.disabled=false;if(!r.ok){showErr("rperr",r.d.error||"تعذّر الإرسال");return}
      var m='<p class="lead">شكراً — سُجّل جوابك.</p>';(r.d.cases||[]).forEach(function(c){m+='<p class="muted">حالتك لدى '+esc(c.sectionName)+'؛ رقمها:</p><div class="ref">'+esc(c.caseRef)+'</div>'});
      document.getElementById("rpdone").innerHTML=m;toast("وصل جوابك")})})}
function loadOffered(){var host=document.getElementById("offered");if(!host)return;
  host.innerHTML='<div class="skel"></div>';
  api("GET","/api/public/me/offered").then(function(r){if(!r.ok||!r.d.ready){host.innerHTML="";return}var o=r.d;S.offered=o;
    var pct=o.remainingCount?Math.round(o.offeredCount/o.remainingCount*100):0;
    var h='<section class="card fade"><h2><span class="b">'+ic("layers")+'</span>المطروح لي<span class="chip gold">مبدئي</span></h2>';
    if(!o.remainingCount){h+='<p class="lead">أنجزت كل مقررات صحيفتك. مبارك!</p>'}
    else{h+='<div class="row" style="gap:16px">'+ring(pct)+'<div style="flex:1;display:grid;gap:4px"><span class="big">'+o.offeredCount+' <small>من '+o.remainingCount+'</small></span><span class="muted">من مقرراتك المتبقية مطروحٌ منها ما يعادل '+countOf(o.offeredUnits,AR.unit)+' هذا الفصل (قيد الإعداد).</span></div></div>'
      +'<details class="more"><summary>'+ic("down")+' المقررات</summary><div class="list" style="margin-block-start:6px">'+o.courses.map(function(c){return '<div class="opt'+(c.sections?"":" off")+'"><span class="tx"><b>'+esc(c.name)+'</b><small><span class="code">'+esc(c.code)+'</span> · '+countOf(c.credit,AR.unit)+'</small>'+(c.needs&&c.needs.length?'<small class="need">'+ic("lock","")+' يلزمك أولاً: '+esc(c.needs.join(" + "))+'</small>':'')+'</span><span class="chip'+(c.sections?" ok":"")+'">'+(c.sections?countOf(c.sections,AR.section):"غير مطروح")+'</span></div>'}).join("")+'</div></details>'}
    host.innerHTML=h+'</section>';animateRings()})}
function renderWishes(){var host=document.getElementById("wishes"),s=S.state,ph=s.phase,w=s.profile.wishes;if(w&&s.term&&w.termId!==s.term.id)w=null;if(!host)return;
  if(ph.mode!=="wishes"&&!(w&&ph.mode==="frozen")){host.innerHTML="";return}
  var edit=ph.mode==="wishes";
  var h='<section class="card fade"><h2><span class="b">'+ic("heart")+'</span>رغباتي'+(edit?"":'<span class="chip">للقراءة</span>')+'</h2>';
  var cur=w||{targetUnits:15,courseIds:[],constraints:{}};
  h+='<div class="field"><span class="lbl">كم وحدةً تريد هذا الفصل؟</span><div class="seg fit" id="wu" role="group" aria-label="الوحدات">'+[12,13,14,15,16,17,18].map(function(n){return '<button type="button" data-n="'+n+'" aria-pressed="'+(n===cur.targetUnits?"true":"false")+'"'+(edit?"":" disabled")+'>'+n+'</button>'}).join("")+'</div></div>';
  h+='<div class="field"><span class="lbl">ما الذي لا يناسبك؟</span><div class="tags" id="wc">'
   +'<button type="button" class="tag" data-k="noMorning" aria-pressed="'+(cur.constraints.noMorning?"true":"false")+'"'+(edit?"":" disabled")+'>'+ic("sun")+'لا أستطيع الصباح الباكر</button>'
   +'<button type="button" class="tag" data-k="noAfternoon" aria-pressed="'+(cur.constraints.noAfternoon?"true":"false")+'"'+(edit?"":" disabled")+'>'+ic("moon")+'لا أستطيع بعد الظهر</button>'
   +'<button type="button" class="tag" data-k="freeDay" aria-pressed="'+(cur.constraints.freeDay?"true":"false")+'"'+(edit?"":" disabled")+'>'+ic("calx")+'أحتاج يوماً فارغاً</button></div></div>';
  var off=(S.offered&&S.offered.courses||[]).filter(function(c){return c.sections});
  if(off.length&&edit){h+='<details class="more"><summary>'+ic("down")+' اختر مقرراتٍ بعينها <span class="chip" id="wn">'+cur.courseIds.length+'</span></summary><div class="list" id="wl" style="margin-block-start:6px">'+off.map(function(c){return '<div class="opt" role="checkbox" tabindex="0" aria-checked="'+(cur.courseIds.indexOf(c.id)>=0?"true":"false")+'" data-id="'+c.id+'"><span class="box">'+ic("check")+'</span><span class="tx"><b>'+esc(c.name)+'</b><small><span class="code">'+esc(c.code)+'</span> · '+countOf(c.credit,AR.unit)+'</small></span></div>'}).join("")+'</div></details>'}
  if(edit)h+=errBox("werr")+'<button class="btn" id="wsv">'+(w?"حدّث رغباتي":"احفظ رغباتي")+'</button><p class="muted">'+(ph.nextAt?"تُغلق الرغبات "+esc(fmtShort(ph.nextAt))+". ":"")+'يمكنك تعديلها قبل ذلك.</p>';
  host.innerHTML=h+'</section>';
  if(!edit)return;
  var state={targetUnits:cur.targetUnits,courseIds:cur.courseIds.slice(),constraints:{noMorning:!!cur.constraints.noMorning,noAfternoon:!!cur.constraints.noAfternoon,freeDay:!!cur.constraints.freeDay}};
  document.getElementById("wu").addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;state.targetUnits=Number(b.getAttribute("data-n"));[].forEach.call(this.children,function(x){x.setAttribute("aria-pressed",x===b?"true":"false")})});
  document.getElementById("wc").addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;var k=b.getAttribute("data-k");state.constraints[k]=!state.constraints[k];b.setAttribute("aria-pressed",state.constraints[k]?"true":"false")});
  var wl=document.getElementById("wl");if(wl){var tg=function(el){var id=Number(el.getAttribute("data-id")),at=state.courseIds.indexOf(id);if(at>=0)state.courseIds.splice(at,1);else if(state.courseIds.length<12)state.courseIds.push(id);else{toast("حتى 12 مقرراً",true);return}el.setAttribute("aria-checked",state.courseIds.indexOf(id)>=0?"true":"false");document.getElementById("wn").textContent=state.courseIds.length};
    wl.addEventListener("click",function(e){var el=e.target.closest(".opt");if(el)tg(el)});wl.addEventListener("keydown",function(e){if(e.key===" "||e.key==="Enter"){var el=e.target.closest(".opt");if(el){e.preventDefault();tg(el)}}})}
  document.getElementById("wsv").addEventListener("click",function(){var b=this;b.disabled=true;api("PUT","/api/public/me/wishes",state).then(function(r){b.disabled=false;if(!r.ok){showErr("werr",r.d.error||"تعذّر الحفظ");return}S.state.profile.wishes=r.d.wishes;toast("تم حفظ رغباتك");renderWishes()})});
}

/* ── أوراق: الرمز والحذف ── */
function sheetCode(){sheet('<h3>تغيير الرمز</h3>'+otp("o1","رمزك الحالي")+otp("o2","الرمز الجديد")+errBox("kerr")+'<button class="btn" id="ks" disabled>احفظ الرمز الجديد</button><button class="btn alt" id="kc">إلغاء</button>');
  var a="",b="",ks=document.getElementById("ks");wireOtp("o1",function(v){a=v;ks.disabled=!(a.length===6&&b.length===6)});wireOtp("o2",function(v){b=v;ks.disabled=!(a.length===6&&b.length===6)});
  document.getElementById("kc").addEventListener("click",closeSheet);
  ks.addEventListener("click",function(){ks.disabled=true;api("POST","/api/public/me/code",{oldCode:a,newCode:b,remember:S.remember}).then(function(r){ks.disabled=false;if(!r.ok){showErr("kerr",r.d.error||"تعذّر التغيير");return}closeSheet();toast("تم تغيير الرمز")})})}
function sheetForget(){sheet('<h3>حذف ملفّي</h3><p class="lead">يُحذف ملفّك نهائياً: قسمك ومقرراتك المنجزة ورغباتك. لا رجعة فيه، ويمكنك إنشاء ملفٍّ جديد بعده.</p>'+otp("f1","رمزك للتأكيد")+errBox("ferr")+'<button class="btn danger" id="fs" disabled>احذف ملفّي نهائياً</button><button class="btn alt" id="fc">تراجع</button>');
  var a="",fs=document.getElementById("fs");wireOtp("f1",function(v){a=v;fs.disabled=v.length!==6});document.getElementById("fc").addEventListener("click",closeSheet);
  fs.addEventListener("click",function(){fs.disabled=true;api("POST","/api/public/me/forget",{code:a}).then(function(r){fs.disabled=false;if(!r.ok){showErr("ferr",r.d.error||"تعذّر الحذف");return}closeSheet();S.state.signedIn=false;S.state.profile=null;S.civil="";S.draft=null;toast("حُذف ملفّك");setView("gate")})})}

function render(){
  closeSheet();window.scrollTo(0,0);if(S.view!=="setup")dockEl.innerHTML="";
  var v=S.view;
  if(v==="boot"){app.innerHTML='<div class="skel"></div><div class="skel"></div>';return}
  if(v==="gate")return viewGate();
  if(v==="code")return viewCode();
  if(v==="create")return viewCreate();
  if(v==="setup")return viewSetup();
  if(v==="home")return viewHome();
}
function boot(){setView("boot");api("GET","/api/public/me/state").then(function(r){
  if(!r.ok){app.innerHTML='<section class="card"><p class="err">'+esc(r.d.error||"تعذّر فتح الصفحة")+'</p><button class="btn" onclick="location.reload()">أعد المحاولة</button></section>';return}
  S.state=r.d;setTop();
  if(S.state.signedIn&&S.state.profile)setView(S.state.profile.setupDone?"home":"setup");else setView("gate")})}
boot();
})();
`;

export function studentHomePage(nonce: string): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="${PUBLIC_THEME_COLOR}">
<meta name="robots" content="noindex,nofollow">
<title>مساري · SCHEDULE</title>
<link rel="icon" href="/schedule-icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/schedule-icon-192.png">
<style>/* SCHEDULE_PUBLIC_PLEX_ARABIC */${PUBLIC_FONT_FACES}${STUDENT_HOME_CSS}</style>
</head>
<body>
${SPRITE}
<div class="app">
<header class="top" id="top"><span class="mark">SCHEDULE</span></header>
<main id="app" aria-live="polite"><div class="skel"></div></main>
</div>
<div class="dock" id="dock"></div>
<noscript><p style="padding:24px;text-align:center">يلزم تفعيل JavaScript لفتح مساري.</p></noscript>
<script nonce="${nonce}">${STUDENT_HOME_SCRIPT}</script>
</body>
</html>`;
}
