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
<symbol id="i-swap" viewBox="0 0 24 24"><path d="M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4"/></symbol>
<symbol id="i-up" viewBox="0 0 24 24"><path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19h14"/></symbol>
<symbol id="i-fwd" viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></symbol>
<symbol id="i-home" viewBox="0 0 24 24"><path d="M4 11l8-6.5 8 6.5"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5.5h4V20"/></symbol>
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
.topr{display:flex;align-items:center;gap:8px}
.jrn{display:inline-flex;align-items:center;gap:6px;padding:5px 13px;border-radius:999px;background:var(--card);border:1px solid var(--line);font-size:12.5px;font-weight:700;color:var(--ink,inherit);text-decoration:none;transition:border-color .2s,transform .2s}
.jrn:hover,.jrn:focus-visible{border-color:var(--brass);outline:none;transform:translateY(-1px)}
.jrn .i{inline-size:15px;block-size:15px;color:var(--brass)}

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
.case-row{padding:12px 0;border-top:1px solid var(--line);display:grid;gap:5px}.case-row:first-of-type{border-top:0;padding-top:0}.case-row .case-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.case-row .case-head b{font-size:14px}.case-row .ref{font:600 12px/1.4 ui-monospace,monospace;direction:ltr;color:var(--muted)}.case-row .case-courses{display:flex;flex-wrap:wrap;gap:6px}.case-row .case-course{padding:3px 8px;border-radius:9px;background:var(--card2);font-size:12px}.case-row .case-detail{font-size:12.5px;color:var(--muted);margin:0}
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
.track-picks{display:grid;gap:9px;margin-block-start:14px}
.grad-estimate{padding-block-start:8px;border-block-start:1px solid var(--line)}
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
.tk .ln,.adv .ln{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:14px;background:var(--soft)}
.tk .ln .ic,.adv .ln .ic{flex:none;inline-size:34px;block-size:34px;border-radius:11px;display:grid;place-items:center;background:var(--card);color:var(--accent)}
.tk .ln .tx,.adv .ln .tx{flex:1;min-inline-size:0;display:grid;gap:2px}
.tk .ln .tx b,.adv .ln .tx b{font-size:14px;font-weight:600;line-height:1.5}
.tk .ln .tx small,.adv .ln .tx small{color:var(--muted);font-size:12px;line-height:1.6}
.tk .ln .code,.adv .ln .code{font:600 11.5px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--accent);direction:ltr;unicode-bidi:isolate}
.tk .tt{display:inline-flex;gap:5px;align-items:center;flex-wrap:wrap}
.tk .u{font-variant-numeric:tabular-nums;font-weight:700;color:var(--ink)}
.tk .bar{block-size:8px;border-radius:99px;background:var(--soft);overflow:hidden}
.tk .bar i{display:block;block-size:100%;border-radius:99px;background:var(--accent)}
.chip.warn{background:var(--gold-soft);color:var(--gold)}
.idn .ic{flex:none;inline-size:42px;block-size:42px;border-radius:14px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent)}
.idn .tx{flex:1;min-inline-size:0;display:grid;gap:2px}.idn .tx b{font-size:15.5px}.idn .tx small{color:var(--muted);font-size:12px;line-height:1.6}
.idn .link{flex:none;font-size:12.5px}
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
.tk .ticket-alt{display:grid;gap:5px;margin-inline-start:46px;margin-block-start:-7px}
.tk .ticket-alt label{font-size:11px;color:var(--muted)}
.tk .ticket-alt .inp{min-block-size:40px;padding:8px 11px;font-size:12px}
@media(max-width:580px){.tk .ticket-alt{margin-inline-start:0}.tk .ln,.adv .ln{gap:8px;padding:9px}}


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

/* ── الرئيسية: بطاقة «أين أنا» ── */
.hero.me{gap:16px;padding:20px}
.hero.me .ring .bg{stroke:rgba(255,255,255,.16)}
.hero.me .ring .fg{stroke:#e7c590}
.hero.me .ring b{color:#fff}
.hero.me .who{flex:1;min-inline-size:0;display:grid;gap:2px}
.hero.me .who small{font-size:13px;color:rgba(255,255,255,.75)}
.hero.me .who h1{font-size:19px;line-height:1.4}
.hero.me .who span{font-size:13px;color:rgba(255,255,255,.8)}
.ghost{flex:none;inline-size:44px;block-size:44px;border-radius:14px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);color:#fff;display:grid;place-items:center;cursor:pointer;align-self:start}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);border-radius:16px;background:rgba(255,255,255,.1);position:relative;z-index:1}
.kpis>div{display:grid;justify-items:center;gap:1px;padding:10px 4px;text-align:center}
.kpis>div+div{border-inline-start:1px solid rgba(255,255,255,.14)}
.kpis b{font-size:18px;line-height:1.3;font-variant-numeric:tabular-nums}
.kpis b.w{font-size:14px;font-weight:700;line-height:1.5}
.kpis small{font-size:11px;color:rgba(255,255,255,.72)}
.pane>.card:first-child,.pane>div:first-child>.card{margin-block-start:14px}
details.how{margin:10px 4px 0}
details.how>summary{color:var(--dim);font-weight:500;font-size:13px}
details.how[open]>summary .i{transform:none}
details.how p{margin:0}
.fine-more>summary{min-block-size:32px;font-size:12.5px;color:var(--muted);margin-block-start:-8px}
.fine-more p{margin:0}

/* ── ألسنة سفلية ── */
.tabs{max-inline-size:360px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:6px;border-radius:22px;background:var(--card);border:1px solid var(--line);box-shadow:0 14px 30px -16px rgba(19,24,23,.45);pointer-events:auto}
.tabs button{position:relative;display:grid;justify-items:center;gap:2px;min-block-size:54px;padding:6px 4px;border:0;border-radius:16px;background:none;color:var(--muted);font-size:12px;font-weight:600;cursor:pointer;transition:background .15s,color .15s}
.tabs button .i{inline-size:22px;block-size:22px}
.tabs button[aria-selected="true"]{background:var(--accent-soft);color:var(--accent)}
.tabs .dot{position:absolute;inset-block-start:8px;inset-inline-end:calc(50% - 18px);inline-size:9px;block-size:9px;border-radius:50%;background:var(--brass);box-shadow:0 0 0 2px var(--card)}

/* ── ملفي: ثلاث أزرار أيقونية ── */
.acts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.act{display:grid;justify-items:center;gap:6px;padding:14px 6px;border-radius:16px;border:1px solid var(--line);background:var(--card2);font-size:13px;font-weight:600;cursor:pointer}
.act .i{inline-size:22px;block-size:22px;color:var(--accent)}
.act.bad .i{color:var(--bad)}
.opt .pk{flex:none;inline-size:40px;block-size:40px;border-radius:12px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent)}
.opt>.i:last-child{color:var(--muted)}

/* ── جدولي الأسبوعي ── */
.fine{font-size:11.5px;color:var(--muted);line-height:1.7;margin:0}
.chip .i{inline-size:14px;block-size:14px}
.seg.sm2 button{min-block-size:38px;font-size:13.5px}
.wk{display:grid;gap:4px}
.wk-h,.wk-body{display:grid;grid-template-columns:24px repeat(5,minmax(0,1fr));gap:3px}
.wk-h{font-size:11px;font-weight:700;color:var(--muted);text-align:center}
.wk-hrs{display:grid;grid-auto-rows:var(--h);font-size:10px;color:var(--muted);font-variant-numeric:tabular-nums}
.wk-hrs i{font-style:normal;text-align:center;transform:translateY(-6px)}
.wk-col{position:relative;block-size:calc(var(--rows)*var(--h));border-radius:10px;background:repeating-linear-gradient(to bottom,transparent 0,transparent calc(var(--h) - 1px),var(--line) calc(var(--h) - 1px),var(--line) var(--h)),var(--card2);overflow:hidden}
.wk-b{position:absolute;inset-inline:2px;border:0;border-radius:8px;padding:3px 4px;background:var(--c);color:#fff;font-family:inherit;text-align:start;overflow:hidden;cursor:pointer;display:grid;align-content:start;gap:0;line-height:1.3;transition:opacity .15s,box-shadow .15s}
.wk-b b{font-size:10px;font-weight:700}
.wk-b span{font-size:9.5px;font-weight:500;opacity:.92;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.wk-b.sel{box-shadow:0 0 0 2px var(--card),0 0 0 4px var(--c);z-index:2}
.wk-b.dim{opacity:.42}
.wk-b.ghost{background:color-mix(in srgb,var(--c) 12%,var(--card));color:var(--ink);border:1.5px dashed var(--c);z-index:1}
.wk-b.ghost.bad{border-color:var(--bad);background:var(--bad-soft);color:var(--bad)}
.wk-sel{display:grid;gap:8px;padding:12px;border-radius:16px;background:var(--soft);border-inline-start:4px solid var(--c)}
.wk-sel .code{font:600 11.5px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--accent);direction:ltr}
.chps{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.chp{min-block-size:36px;padding:0 12px;border:1.5px solid var(--line);border-radius:999px;background:var(--card);font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
.chp.on{background:var(--accent);border-color:var(--accent);color:#fff}
.chp.bad{border-color:var(--bad);color:var(--bad)}
.chp.on.bad{background:var(--bad);color:#fff}

/* ── مقترحي ── */
.stp .d.num{font-weight:700;font-size:14px;font-variant-numeric:tabular-nums}
.stp.goal .d{background:var(--ok-soft);border-color:var(--ok);color:var(--ok)}
.stp.goal b{color:var(--ok)}
.adv .track{margin-block:4px}
.offrow{display:flex;align-items:center;gap:14px;padding-block-start:12px;border-block-start:1px solid var(--line)}
.offrow .ring{inline-size:56px;block-size:56px}.offrow .ring b{font-size:14px}
.offt{display:grid;gap:1px}.offt b{font-size:16px}.offt b small{font-size:13px;font-weight:500;color:var(--muted)}
.adv .lead.big{font-size:17px;font-weight:700;line-height:1.6}
.adv .ln .tx small{color:var(--accent);font-weight:600}
.adv .ln .tx b{font-size:14.5px}

/* ── الرغبات: بطاقاتٌ تُمرَّر ── */
.wz .sl{display:grid;gap:12px;animation:fade .3s var(--ease) both}
.wz .lbl{font-size:15px}
.bignum{display:flex;align-items:baseline;justify-content:center;gap:8px}
.bignum b{font-size:56px;line-height:1;font-variant-numeric:tabular-nums;color:var(--accent)}
.bignum small{font-size:15px;color:var(--muted)}
.wz .wl{max-block-size:44dvh;overflow:auto}
.dots{display:flex;gap:6px;justify-content:center}
.dots i{inline-size:22px;block-size:5px;border-radius:99px;background:var(--line-strong)}
.dots i.on{background:var(--accent)}.dots i.now{background:var(--brass);inline-size:34px}
#wcnt{display:flex;align-items:center;gap:6px;color:var(--ok)}

/* ── طلبٌ للقسم: بلاطات وورقة ── */
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(96px,1fr));gap:8px}
.tile{display:grid;justify-items:center;align-content:start;gap:4px;padding:14px 6px 12px;border-radius:18px;border:1px solid var(--line);background:var(--card2);font:inherit;text-align:center;cursor:pointer;transition:transform .12s var(--ease),border-color .15s}
.tile:active{transform:scale(.97)}.tile:hover{border-color:var(--line-strong)}
.tile .ti,.upl .ti{inline-size:44px;block-size:44px;border-radius:14px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent)}
.tile .ti .i,.upl .ti .i{inline-size:22px;block-size:22px}
.tile b{font-size:13px;line-height:1.4}.tile small{font-size:11px;color:var(--muted)}
.tile.dim{opacity:.7}
.sheet .done{display:grid;justify-items:center;gap:6px;text-align:center;padding-block:10px}
.okc{inline-size:60px;block-size:60px;border-radius:50%;display:grid;place-items:center;background:var(--ok-soft);color:var(--ok)}
.okc .i{inline-size:28px;block-size:28px;stroke-width:2.4}
.sheet .ref{font:700 22px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;direction:ltr;text-align:center;padding:10px 18px;border-radius:14px;background:var(--accent-soft);color:var(--accent)}
.gm{display:grid;gap:8px;padding:14px;border-radius:18px;background:var(--card2)}
.gm-top{display:flex;align-items:baseline;gap:8px}.gm-top b{font-size:34px;line-height:1;color:var(--accent);font-variant-numeric:tabular-nums}.gm-top small{color:var(--muted);font-size:13px}.gm-top .chip{margin-inline-start:auto}
.gm-bar{position:relative;block-size:12px;border-radius:99px;background:var(--line-strong);margin-inline-end:14px}
.gm-bar i{display:block;block-size:100%;border-radius:99px;background:var(--accent);transition:inline-size .8s var(--ease)}
.gm-flag{position:absolute;inset-inline-end:-14px;inset-block-start:50%;transform:translateY(-50%);inline-size:28px;block-size:28px;border-radius:50%;display:grid;place-items:center;background:var(--card);border:2px solid var(--brass);color:var(--gold)}
.gm-flag .i{inline-size:14px;block-size:14px}
.rsns{display:grid;gap:8px}
.rsn{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;border:1.5px solid var(--line);background:var(--card);font:inherit;font-size:14px;font-weight:600;text-align:start;cursor:pointer}
.rsn .i{color:var(--accent);flex:none}
.rsn[aria-checked="true"]{border-color:var(--accent);background:var(--accent-soft)}
.upl{display:grid;justify-items:center;gap:4px;padding:18px 12px;border-radius:18px;border:2px dashed var(--line-strong);background:var(--card2);cursor:pointer;text-align:center}
.upl b{font-size:14.5px}.upl small{color:var(--muted);font-size:12px}
#upst{display:grid;gap:6px;margin-block-start:6px}
.hint.ok{color:var(--ok)}
@media (prefers-reduced-motion:reduce){.fade,.sheet,.toast,.skel{animation:none}.ring .fg{transition:none}}
`;

export const STUDENT_HOME_SCRIPT = String.raw`
(function(){
"use strict";
var app=document.getElementById("app"),topEl=document.getElementById("top"),dockEl=document.getElementById("dock");
var S={state:null,view:"boot",civil:"",exists:false,resetPending:false,resetAt:"",catalog:null,plans:null,planSource:"",draft:null,offered:null,busy:false,remember:false,sheet:"",track:window.__SCHEDULE_TRACK||""};

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
function setTop(){var s=S.state;topEl.innerHTML='<span class="mark">SCHEDULE</span><span class="topr">'+(s&&s.term?'<span class="term">'+ic("cal")+esc(s.term.name)+'</span>':"")+'<a class="jrn" href="/?journey=1&amp;back=/me" aria-label="افتح رحلة SCHEDULE">'+ic("spark")+'<span>الرحلة</span></a></span>'}
function setView(v){S.view=v;render()}
function sheet(html){closeSheet();var el=document.createElement("div");el.className="scrim";el.id="scrim";el.innerHTML='<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>'+html+'</div>';el.addEventListener("click",function(e){if(e.target===el)closeSheet()});document.body.appendChild(el);return el}
function closeSheet(){var el=document.getElementById("scrim");if(el)el.remove()}
function errBox(id){return '<div class="err" id="'+id+'" role="alert" hidden></div>'}
function showErr(id,msg){var el=document.getElementById(id);if(!el)return;el.textContent=msg;el.hidden=!msg}

/* ── الدخول ── */
function viewGate(){
  app.innerHTML='<section class="hero fade"><span class="disc">'+ic("cap")+'</span><h1>مساري</h1><p>جدولك المتوقع قبل التسجيل، في مكانٍ واحد.</p>'+phaseChip()+'</section>'
   +'<section class="card fade"><div class="field"><label for="civil">الرقم المدني</label><input class="inp civil" id="civil" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="اكتب رقمك المدني" dir="ltr" aria-describedby="chint"><p class="hint" id="chint"></p></div>'
   +errBox("gerr")+'<button class="btn" id="go" disabled>تابع '+ic("fwd")+'</button>'
   +'<p class="priv">'+ic("shield")+'نحفظ بصمةً مشفّرة وأرقام مقرراتك فقط — لا اسم ولا رقم مدني.</p></section>';
  var inp=document.getElementById("civil"),hint=document.getElementById("chint"),go=document.getElementById("go");
  function paint(){inp.value=digits(inp.value).slice(0,12);var v=inp.value;go.disabled=true;hint.className="hint";
    if(!v.length){hint.textContent="";return}
    if(v.length<12){hint.textContent="باقي "+(12-v.length)+" رقماً";return}
    if(civilValid(v)){hint.textContent="رقمٌ صحيح";hint.className="hint ok";go.disabled=false}else{hint.textContent="هذا الرقم غير صحيح — راجع بطاقتك المدنية";hint.className="hint bad"}}
  inp.addEventListener("input",paint);inp.addEventListener("keydown",function(e){if(e.key==="Enter"&&!go.disabled){e.preventDefault();go.click()}});
  go.addEventListener("click",function(){go.disabled=true;go.textContent="يتحقق…";S.civil=inp.value;
    api("POST","/api/public/me/identity",{civil:S.civil}).then(function(r){
      if(!r.ok){go.disabled=false;go.innerHTML='تابع '+ic("fwd");showErr("gerr",r.d.error||"تعذّر التحقق");return}
      S.exists=!!r.d.exists;S.resetPending=!!r.d.resetPending;S.resetAt=r.d.resetAt||"";setView(S.exists?"code":"create")})});
  if(S.civil)inp.value=S.civil;paint();setTimeout(function(){try{inp.focus()}catch(e){}},50);
}
function rememberSwitch(){return '<button type="button" class="sw" role="switch" id="rem" aria-checked="'+(S.remember?"true":"false")+'"><span class="t">هذا جهازي الشخصي<small>يبقى دخولك 180 يوماً</small></span><span class="tg"></span></button>'}
function wireRemember(){var b=document.getElementById("rem");if(b)b.addEventListener("click",function(){S.remember=!S.remember;b.setAttribute("aria-checked",S.remember?"true":"false")})}
function viewCode(){
  app.innerHTML='<section class="hero fade"><span class="disc">'+ic("lock")+'</span><h1>أهلاً بعودتك</h1><p>أدخل رمزك الشخصي لتفتح ملفّك.</p></section>'
   +'<section class="card fade">'+(S.resetPending?'<div class="note">'+ic("info")+'<span>سيُحذف هذا الملف في '+esc(fmtDate(S.resetAt))+' بناءً على الطلب الذي قُدّم. دخولك بالرمز الصحيح يُلغيه.</span></div>':"")
   +otp("code","رمزك الشخصي")+rememberSwitch()+errBox("cerr")+'<button class="btn" id="enter" disabled>ادخل '+ic("fwd")+'</button>'
   +'<div class="row between"><button class="link" id="forgot">نسيت رمزي</button><button class="link" id="other">رقم مدني آخر</button></div></section>';
  var code="",btn=document.getElementById("enter");wireRemember();
  wireOtp("code",function(v){code=v;btn.disabled=v.length!==6});
  function submit(){if(btn.disabled)return;btn.disabled=true;btn.textContent="يتحقق…";showErr("cerr","");
    api("POST","/api/public/me/enter",{civil:S.civil,code:code,remember:S.remember}).then(function(r){
      if(!r.ok){btn.disabled=false;btn.innerHTML='ادخل '+ic("fwd");var left=r.d.attemptsLeft;showErr("cerr",(r.d.error||"تعذّر الدخول")+(left>0&&left<5?" (تبقّى "+countOf(left,AR.attempt)+")":""));var i=document.getElementById("code");if(i){i.value="";i.dispatchEvent(new Event("input"));i.focus()}return}
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
   +'<section class="card fade"><div class="field"><label for="nm">الاسم الثلاثي</label><input class="inp" id="nm" autocomplete="name" maxlength="80"><p class="muted">'+ic("shield","")+' مختوم — يراه قسمك فقط إن طلبت مساعدته.</p></div>'+otp("c1","رمزك الشخصي")+'<div id="c2w" hidden>'+otp("c2","أعد كتابة الرمز")+'</div>'+rememberSwitch()
   +'<label class="chk"><input type="checkbox" id="agree"><span>أوافق على حفظ ملفّي</span></label><details class="more fine-more"><summary>'+ic("down")+' ما الذي يُحفظ؟</summary><p class="muted">اسمي (مختوماً) وأرقام المقررات التي أنجزتها ورغباتي. يُحذف تلقائياً بعد تخرّجي المتوقَّع بسنة أو إن انقطعت عامين، وأستطيع حذفه متى شئت.</p></details>'
   +errBox("verr")+'<button class="btn" id="mk" disabled>أنشئ ملفّي '+ic("fwd")+'</button><button class="link" id="other">رقم مدني آخر</button></section>';
  var a="",b="",agree=document.getElementById("agree"),mk=document.getElementById("mk"),nm=document.getElementById("nm");wireRemember();
  function nameOk(){var v=nm.value.replace(/\s+/g," ").trim();return v.length>=6&&v.length<=80&&!/[<>{}\\\d]/.test(v)}
  nm.addEventListener("input",function(){sync()});
  function sync(){mk.disabled=!(nameOk()&&a.length===6&&b.length===6&&agree.checked);showErr("verr",a.length===6&&b.length===6&&a!==b?"الرمزان غير متطابقين":"")}
  wireOtp("c1",function(v){a=v;var w=document.getElementById("c2w");if(v.length===6&&w.hidden){w.hidden=false;var c=document.getElementById("c2");if(c)c.focus()}sync()});wireOtp("c2",function(v){b=v;sync()});agree.addEventListener("change",sync);
  mk.addEventListener("click",function(){if(a!==b){showErr("verr","الرمزان غير متطابقين");return}mk.disabled=true;mk.textContent="ينشئ…";
    api("POST","/api/public/me/enter",{civil:S.civil,code:a,create:true,agree:true,remember:S.remember,name:nm.value}).then(function(r){
      if(!r.ok){mk.disabled=false;mk.innerHTML='أنشئ ملفّي '+ic("fwd");showErr("verr",r.d.error||"تعذّر الإنشاء");return}
      afterSignIn()})});
  document.getElementById("other").addEventListener("click",function(){S.civil="";setView("gate")});
  setTimeout(function(){var i=document.getElementById("nm");if(i)i.focus()},60);
}
function afterSignIn(){S.civil="";api("GET","/api/public/me/state").then(function(r){if(r.ok){S.state=r.d;setTop()}S.draft=null;S.offered=null;setView(S.state&&S.state.profile&&S.state.profile.setupDone?"home":"setup")})}

/* ── إعداد الملف: القسم ← الصحيفة ← ما أنجزت ── */
function ensureCatalog(cb){if(!S.track)return cb();if(S.catalog)return cb();api("GET","/api/public/me/catalog?track="+encodeURIComponent(S.track)).then(function(r){S.catalog=r.ok?r.d.specializations:[];cb()})}
function startDraft(){var p=S.state.profile||{};S.draft={sectionId:p.sectionId||0,sectionName:p.sectionName||"",planId:p.planId||"",passed:(p.passedCourseIds||[]).slice(),step:1,q:"",filter:"all"};return S.draft}
function viewSetup(){var d=S.draft||startDraft();ensureCatalog(function(){if(d.step===1)setupSection();else if(d.step===2)setupPlan();else setupPassed()})}
function stepsBar(n,total){var h='<div class="steps" aria-hidden="true">';for(var i=1;i<=total;i++)h+='<i class="'+(i<n?"on":i===n?"now":"")+'"></i>';return h+'</div>'}
function setupSection(){var d=S.draft;
  if(!S.track){
    app.innerHTML=stepsBar(1,3)+'<h1 class="h2 fade">اختر مسار الدراسة</h1><div class="track-picks"><button type="button" class="opt" data-track="boys"><span class="pk">'+ic("building")+'</span><span class="tx"><b>مسار البنين</b><small>أقسام كلية التربية الأساسية</small></span>'+ic("fwd")+'</button><button type="button" class="opt" data-track="girls"><span class="pk">'+ic("building")+'</span><span class="tx"><b>مسار البنات</b><small>أقسام كلية التربية الأساسية</small></span>'+ic("fwd")+'</button></div>';
    app.querySelectorAll("[data-track]").forEach(function(b){b.addEventListener("click",function(){S.track=b.getAttribute("data-track");history.replaceState(null,"","/me?track="+encodeURIComponent(S.track));S.catalog=null;viewSetup()})});return;
  }
  app.innerHTML=stepsBar(1,3)+'<h1 class="h2 fade">ما تخصصك؟</h1><div class="srch" style="margin-block-start:12px">'+ic("search")+'<input class="inp" id="q" type="search" placeholder="ابحث باسم التخصص" aria-label="ابحث باسم التخصص" autocomplete="off"></div><div id="lst" class="list" style="margin-block-start:12px"></div>';
  var lst=document.getElementById("lst"),q=document.getElementById("q");
  function paint(){var t=q.value.trim(),h="",items=(S.catalog||[]).filter(function(s){return!t||s.name.indexOf(t)>=0});items.forEach(function(s){h+='<button type="button" class="opt" data-id="'+s.id+'" data-n="'+esc(s.name)+'" aria-pressed="'+(d.sectionId===s.id?"true":"false")+'"><span class="tx"><b>'+esc(s.name)+'</b></span>'+ic("fwd")+'</button>'});lst.innerHTML=h||'<p class="muted">لا تخصص بهذا الاسم في هذا المسار.</p>'}
  q.addEventListener("input",paint);paint();
  lst.addEventListener("click",function(e){var b=e.target.closest(".opt");if(!b)return;var id=Number(b.getAttribute("data-id"));if(id!==d.sectionId){d.passed=[];d.planId=""}d.sectionId=id;d.sectionName=b.getAttribute("data-n");d.plans=null;
    api("GET","/api/public/me/plan?sectionId="+id).then(function(r){if(!r.ok){toast(r.d.error||"تعذّر تحميل القسم",true);return}S.plans=r.d.plans;S.planSource=r.d.source;
      if(S.plans.length===1){d.planId=S.plans[0].id;d.step=3}else d.step=2;viewSetup()})});
}
function setupPlan(){var d=S.draft;
  var label={transition:"السابقة",active:"الجديدة"};
  app.innerHTML=stepsBar(2,3)+'<button class="link" id="bk" style="padding-inline:0">'+ic("back")+' القسم</button><h1 class="h2 fade">على أي صحيفةٍ تدرس؟</h1><p class="muted">'+esc(d.sectionName)+'</p><div class="list" style="margin-block-start:12px" id="pl"></div>';
  var h="";S.plans.forEach(function(p){h+='<button type="button" class="opt" data-id="'+esc(p.id)+'" aria-pressed="'+(d.planId===p.id?"true":"false")+'"><span class="tx"><b>'+esc(p.name)+'</b><small>'+(label[p.status]&&p.name.indexOf(label[p.status])<0?"الصحيفة "+label[p.status]+" · ":"")+countOf(p.courses.length,AR.course)+'</small></span>'+ic("fwd")+'</button>'});
  document.getElementById("pl").innerHTML=h;
  document.getElementById("pl").addEventListener("click",function(e){var b=e.target.closest(".opt");if(!b)return;d.planId=b.getAttribute("data-id");d.passed=[];d.step=3;viewSetup()});
  document.getElementById("bk").addEventListener("click",function(){d.step=1;viewSetup()});
}
function currentPlan(){var d=S.draft,pl=S.plans||[];for(var i=0;i<pl.length;i++)if(pl[i].id===d.planId)return pl[i];return pl[0]||{courses:[]}}
function setupPassed(){var d=S.draft,load=function(){
  var plan=currentPlan(),courses=plan.courses,total=0,units=0;courses.forEach(function(c){total+=c.credit});
  app.innerHTML=stepsBar(3,3)+'<button class="link" id="bk" style="padding-inline:0">'+ic("back")+' رجوع</button><h1 class="h2 fade">ما الذي أنجزته؟</h1><p class="muted">المس كل مقرر اجتزته.</p>'
   +'<div'+(courses.length>10?'':' hidden')+'><div class="srch" style="margin-block-start:12px">'+ic("search")+'<input class="inp" id="q" type="search" placeholder="ابحث باسم المقرر أو رمزه" aria-label="ابحث في المقررات" autocomplete="off"></div>'
   +'<div class="row between" style="margin-block-start:10px"><div class="seg" role="group" aria-label="تصفية"><button type="button" data-f="all" aria-pressed="true">الكل</button><button type="button" data-f="done" aria-pressed="false">المنجَز</button><button type="button" data-f="todo" aria-pressed="false">الباقي</button></div><button class="link" id="all" style="padding-inline:0">علّم الكل</button><button class="link" id="none" hidden></button></div></div>'
   +'<div class="list" id="crs" style="margin-block-start:6px"></div>';
  dockEl.innerHTML='<div><div id="dr"></div><div class="meta"><b id="dc"></b><span id="du"></span></div><button class="btn" id="sv">احفظ ملفّي</button></div>';
  var lst=document.getElementById("crs"),q=document.getElementById("q"),set={};d.passed.forEach(function(i){set[i]=1});
  function counts(){var n=0,u=0;courses.forEach(function(c){if(set[c.id]){n++;u+=c.credit}});var pct=total?Math.round(u/total*100):0;document.getElementById("dr").innerHTML=ring(pct);animateRings();document.getElementById("dc").textContent=n?countOf(n,AR.course):"ابدأ بالتعليم";document.getElementById("du").textContent=n?countOf(u,AR.unit)+" من "+total:"لم تعلّم شيئاً بعد"}
  function visible(){var t=q.value.trim().toLowerCase();return courses.filter(function(c){if(d.filter==="done"&&!set[c.id])return false;if(d.filter==="todo"&&set[c.id])return false;return!t||(c.name+" "+c.code).toLowerCase().indexOf(t)>=0})}
  function paint(){var h="";visible().forEach(function(c){h+='<div class="opt" role="checkbox" tabindex="0" aria-checked="'+(set[c.id]?"true":"false")+'" data-id="'+c.id+'"><span class="box">'+ic("check")+'</span><span class="tx"><b>'+esc(c.name)+'</b><small><span class="code">'+esc(c.code)+'</span> · '+countOf(c.credit,AR.unit)+'</small></span></div>'});lst.innerHTML=h||'<p class="muted">لا مقررات مطابقة.</p>';counts()}
  function toggle(el){var id=Number(el.getAttribute("data-id"));if(set[id])delete set[id];else set[id]=1;el.setAttribute("aria-checked",set[id]?"true":"false");counts();if(d.filter!=="all")setTimeout(paint,160)}
  lst.addEventListener("click",function(e){var el=e.target.closest(".opt");if(el)toggle(el)});
  lst.addEventListener("keydown",function(e){if(e.key===" "||e.key==="Enter"){var el=e.target.closest(".opt");if(el){e.preventDefault();toggle(el)}}});
  q.addEventListener("input",paint);
  document.querySelectorAll(".seg button").forEach(function(b){b.addEventListener("click",function(){d.filter=b.getAttribute("data-f");document.querySelectorAll(".seg button").forEach(function(x){x.setAttribute("aria-pressed",x===b?"true":"false")});paint()})});
  document.getElementById("all").addEventListener("click",function(){var v=visible(),full=v.every(function(c){return set[c.id]});v.forEach(function(c){if(full)delete set[c.id];else set[c.id]=1});this.textContent=full?"علّم الكل":"أزل التعليم";paint()});
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
  dockEl.innerHTML="";S.tkOverrides={};S.tkRemoved={};S.tkAdded={};S.tkSel=0;S.tkErr="";S.wDraft=null;S.wEdit=false;S.wStep=0;S.wCount=null;var s=S.state,p=s.profile,ph=s.phase,pr=p.progress||{percent:0,passedUnits:0,totalUnits:0,remainingUnits:0};
  var first=p.identity&&p.identity.name?String(p.identity.name).split(" ")[0]:"";
  var terms=pr.remainingUnits?Math.ceil(pr.remainingUnits/15):0;
  /* ── الواجهة: بطاقةٌ واحدة تقول «أين أنا» — حلقةٌ ورقمان — والباقي في ثلاثة ألسنة. ── */
  var h='<section class="hero me fade"><div class="row" style="gap:16px">'+ring(pr.percent)+'<div class="who"><small>'+(first?"أهلاً، "+esc(first):"مساري")+'</small><h1>'+esc(p.sectionName)+'</h1><span>'+(p.planName?esc(p.planName)+" · ":"")+countOf(p.passedUnits,AR.unit)+' مجتازة</span></div><button class="ghost" id="edp" aria-label="عدّل ما أنجزت">'+ic("edit")+'</button></div>'
   +'<div class="kpis"><div><b>'+(pr.remainingUnits||0)+'</b><small>الوحدات المتبقية</small></div><div><b id="kt">'+(terms||"✓")+'</b><small id="kts">'+(terms?"فصول للتخرّج":"أكملت الصحيفة")+'</small></div><div><b class="w">'+esc(ph.label)+'</b><small>'+(ph.nextAt?esc(fmtShort(ph.nextAt)):"المرحلة الآن")+'</small></div></div></section>';
  h+='<div class="pane" data-pane="now"><div id="notices"></div><div id="cases"></div><div id="ticket"></div><div id="report"></div><div id="wishes"></div>'
   +'<section class="card fade"><h2><span class="b">'+ic("clock")+'</span>رحلة الفصل</h2>'+track()+'</section><div id="caseRequest"></div></div>';
  h+='<div class="pane" data-pane="plan" hidden><div id="advice"></div>'
   +'<details class="more how fade"><summary>'+ic("info")+' كيف قدّرنا التخرج؟</summary><p class="muted">'+(pr.remainingUnits?'نحو '+countOf(terms,AR.term)+' بحسب المتبقي ومعدل 15 وحدة في الفصل.':'أكملت وحدات الصحيفة بحسب المقررات التي علّمتها.')+' تقدير يتغير مع تحديث إنجازك والقواعد المعتمدة، وليس موعداً رسمياً.</p></details></div>';
  h+='<div class="pane" data-pane="me" hidden>'
   +(p.identity?'<section class="card idn fade"><div class="row" style="gap:12px"><span class="ic">'+ic("user")+'</span><div class="tx"><b>'+esc(p.identity.name)+'</b><small>الرقم المدني <bdi dir="ltr">'+esc(p.identity.civilMasked)+'</bdi></small></div><button type="button" class="link" id="nmb">تصحيح</button></div></section>':"")
   +'<section class="card fade"><div class="acts"><button class="act" id="chg">'+ic("key")+'<span>غيّر الرمز</span></button><button class="act" id="out">'+ic("out")+'<span>اخرج</span></button><button class="act bad" id="del">'+ic("trash")+'<span>احذف ملفّي</span></button></div><p class="priv">'+ic("shield")+' يُحفظ حتى '+esc(fmtDate(p.keepsUntil))+(p.keepsReason==="inactive"?" ما لم تعد إليه":"")+'، ثم يُحذف وحده.</p></section></div>';
  app.innerHTML=h;animateRings();markOverflow();
  dockEl.innerHTML='<nav class="tabs" role="tablist" aria-label="أقسام مساري"><button type="button" role="tab" data-tab="now" aria-selected="true">'+ic("home")+'<span>الآن</span><i class="dot" id="nowdot" hidden></i></button><button type="button" role="tab" data-tab="plan" aria-selected="false">'+ic("layers")+'<span>خطتي</span></button><button type="button" role="tab" data-tab="me" aria-selected="false">'+ic("user")+'<span>ملفي</span></button></nav>';
  dockEl.querySelectorAll("[data-tab]").forEach(function(b){b.addEventListener("click",function(){showTab(b.getAttribute("data-tab"))})});
  document.getElementById("edp").addEventListener("click",function(){var d=startDraft();d.step=3;viewSetup()});
  document.getElementById("out").addEventListener("click",function(){api("POST","/api/public/me/exit",{}).then(function(){S.state.signedIn=false;S.state.profile=null;S.civil="";S.remember=false;S.draft=null;S.offered=null;setView("gate")})});
  document.getElementById("chg").addEventListener("click",sheetCode);
  var nmb=document.getElementById("nmb");if(nmb)nmb.addEventListener("click",sheetName);
  document.getElementById("del").addEventListener("click",sheetForget);
  loadNotices();loadCases();loadCaseRequest();loadTicket();loadReport();loadPlan();renderWishes();
}
function showTab(t){var panes=document.querySelectorAll(".pane");for(var i=0;i<panes.length;i++)panes[i].hidden=panes[i].getAttribute("data-pane")!==t;
  dockEl.querySelectorAll("[data-tab]").forEach(function(b){b.setAttribute("aria-selected",b.getAttribute("data-tab")===t?"true":"false")});window.scrollTo(0,0);animateRings()}
function reveal(el){var pane=el.closest&&el.closest(".pane");if(pane&&pane.hidden)showTab(pane.getAttribute("data-pane"));if(el.scrollIntoView)el.scrollIntoView({behavior:"smooth",block:"center"})}
var DAYN=["أحد","اثنين","ثلاثاء","أربعاء","خميس"];
function hhmm(m){var h=Math.floor(m/60),n=m%60;return (h<10?"0":"")+h+":"+(n<10?"0":"")+n}
function slotsText(slots){var g={};slots.forEach(function(x){var k=hhmm(x.start)+"–"+hhmm(x.end);(g[k]=g[k]||[]).push(DAYN[x.day]||"")});return Object.keys(g).map(function(k){return g[k].join(" · ")+' <bdi dir="ltr">'+k+'</bdi>'}).join("، ")}
var WHY={prereq:"ينقصك مسبقه",full:"امتلأت شعبه",conflict:"يتعارض مع غيره",units:"فوق وحداتك المطلوبة","not-offered":"لا يُطرح هذا الفصل"};
var NT_ICON={spark:"spark",home:"home",edit:"edit",ticket:"ticket",check:"check",info:"info",clock:"clock",lock:"lock"},NT_TARGET={setup:"edp",wishes:"wishes",ticket:"ticket",report:"report",cases:"cases",advice:"advice"};
function loadNotices(){var host=document.getElementById("notices");if(!host)return;
  api("GET","/api/public/me/notices").then(function(r){if(!r.ok||!r.d.notices||!r.d.notices.length){host.innerHTML="";return}
    var list=r.d.notices.filter(function(n){return!(n.target==="wishes"&&document.querySelector("#wishes .card"))}),showAll=false;if(!list.length){host.innerHTML="";return}
    function paint(){var shown=showAll?list:list.slice(0,3);var dot=document.getElementById("nowdot");if(dot)dot.hidden=!list.some(function(n){return n.tone==="action"||n.tone==="alert"});
      var h='<section class="card nt fade"><h2><span class="b">'+ic("spark")+'</span>ما الجديد؟'+(list.filter(function(n){return n.tone==="action"||n.tone==="alert"}).length?'<span class="chip gold">'+list.filter(function(n){return n.tone==="action"||n.tone==="alert"}).length+'</span>':'')+'</h2>';
      shown.forEach(function(n,i){h+='<button type="button" class="it '+n.tone+'" data-i="'+i+'"><span class="ic">'+ic(NT_ICON[n.icon]||"info")+'</span><span class="tx"><b>'+esc(n.title)+'</b>'+(n.detail?'<small>'+esc(n.detail)+'</small>':'')+'</span>'+ic("fwd","go")+'</button>'});
      if(list.length>3&&!showAll)h+='<button type="button" class="link" id="ntall">عرض الكل ('+list.length+')</button>';
      host.innerHTML=h+'</section>';
      host.querySelectorAll(".it").forEach(function(b){b.addEventListener("click",function(){var n=shown[Number(b.getAttribute("data-i"))],el=document.getElementById(NT_TARGET[n.target]||"");if(el)reveal(el);if(n.target==="setup"&&el)el.click()})});
      var all=document.getElementById("ntall");if(all)all.addEventListener("click",function(){showAll=true;paint()})}
    paint()})}
function loadCases(){var host=document.getElementById("cases");if(!host)return;
  api("GET","/api/public/me/cases").then(function(r){if(!r.ok||!r.d.cases||!r.d.cases.length){host.innerHTML="";return}
    var rows=r.d.cases,h='<section class="card fade"><h2><span class="b">'+ic("ticket")+'</span>حالاتي</h2><p class="muted">متابعة الطلبات التي أرسلتها، بما فيها الطلبات السابقة.</p>';
    rows.forEach(function(c){h+='<article class="case-row"><div class="case-head"><b>'+esc(c.title)+'</b><span class="chip '+(c.statusCode==="approved"?"ok":c.statusCode==="committee-rejected"||c.statusCode==="rejected"?"gold":"")+'">'+esc(c.status)+'</span></div><div class="row between"><span class="muted">'+esc(c.term)+'</span><bdi class="ref">'+esc(c.caseRef)+'</bdi></div>';
      if(c.courses&&c.courses.length)h+='<div class="case-courses">'+c.courses.map(function(course){return '<span class="case-course">'+esc(course.name)+(course.dropped?' · أُزيل من الطلب':course.state!=="pending"?' · '+esc(course.status):'')+'</span>'}).join("")+'</div>';
      if(c.detail)h+='<p class="case-detail">'+esc(c.detail)+'</p>';h+='</article>'});
    host.innerHTML=h+'</section>'})}
/* ── طلبٌ للقسم: ثلاث بلاطات (مقرر لم يُفتح · تعارض · خريج/متوقع تخرّجه) ← ورقةٌ لكلٍّ منها. هو الاستبيانُ نفسُه بعد دمجه في مساري. ── */
function tileHtml(k,i,title,sub,dim){return '<button type="button" class="tile'+(dim?" dim":"")+'" data-k="'+k+'"><span class="ti">'+ic(i)+'</span><b>'+title+'</b><small>'+sub+'</small></button>'}
function cardHtml(i,title,body){return '<section class="card fade"><h2><span class="b">'+ic(i)+'</span>'+title+'</h2>'+body+'</section>'}
function loadCaseRequest(){var host=document.getElementById("caseRequest");if(!host)return;
  Promise.all([api("GET","/api/public/me/request-context"),api("GET","/api/public/me/graduate")]).then(function(rs){
    var c=rs[0].ok&&rs[0].d.ready&&rs[0].d.canRequest?rs[0].d:null,g=rs[1].ok&&rs[1].d.ready&&rs[1].d.ruleSaved&&rs[1].d.canRequest?rs[1].d:null;
    S.reqCtx=c;S.grad=g;var t="";
    if(c&&c.courses&&c.courses.length)t+=tileHtml("new-course","plus","مقرر لم يُفتح","اطلب فتحه");
    if(c&&(c.conflictPairs||[]).length)t+=tileHtml("course-conflict","swap","تعارض مقررين","تعذّر حلّه");
    if(g)t+=tileHtml("graduate","cap","خريج / متوقع",g.existing?"قُدّم طلبك":(g.enough?"استوفيت الوحدات":g.passedUnits+" / "+g.threshold),!g.enough);
    if(!t){host.innerHTML="";return}
    host.innerHTML=cardHtml("ticket","طلب للقسم",'<p class="muted">تعذّر تكوين جدول؟ اطلب مراجعة القسم.</p><div class="tiles">'+t+'</div>');
    host.querySelectorAll(".tile").forEach(function(b){b.addEventListener("click",function(){var k=b.getAttribute("data-k");if(k==="graduate")reqGrad(g);else reqCourses(c,k)})})})}
function reqShell(title,body,sendLabel){return '<h3>'+title+'</h3>'+body+errBox("crerr")+(sendLabel?'<button class="btn" id="crsend" disabled>'+sendLabel+'</button>':'')+'<button class="btn alt" id="crx">إغلاق</button>'}
function reqDone(r){var cases=r.d.cases||[{sectionName:"القسم المختص",caseRef:r.d.caseRef}],h='<div class="done"><span class="okc">'+ic("check")+'</span><h3>وصل طلبك</h3><p class="lead">وصل طلبك للأقسام المعنية.</p>';
  cases.forEach(function(c){h+='<p class="muted">'+esc(c.sectionName)+' · رقم الحالة</p><div class="ref">'+esc(c.caseRef)+'</div>'});
  h+='<button class="btn" id="crx2">تمّ</button></div>';var el=document.querySelector(".sheet");if(el){el.innerHTML='<div class="grab"></div>'+h;document.getElementById("crx2").addEventListener("click",closeSheet)}loadCases();toast("وصل طلبك")}
function reqConsent(){return '<label class="chk"><input type="checkbox" id="crconsent"><span>أوافق على إرسال اسمي ورقمي المدني إلى القسم لمراجعة هذا الطلب.</span></label>'}
function reqCourses(d,kind){
  var options=function(list){return '<option value="">اختر المقرر</option>'+list.map(function(c){return '<option value="'+c.id+'">'+esc(c.code)+' · '+esc(c.name)+(c.sectionName?' · '+esc(c.sectionName):'')+'</option>'}).join("")};
  var conflict=kind==="course-conflict",body='<p class="muted">يصل اختيارك للقسم المختص للمراجعة. لا يثبت الأهلية ولا يحجز مقعداً.</p>';
  if(conflict)body+='<p class="muted">طلب التعارض لا يظهر إلا إذا لم نجد توليفة منشورة خالية منه.</p><div class="field"><label for="crone">المقرر المتعثر في صحيفتك</label><select class="inp" id="crone">'+options(d.conflictOwnCourses||[])+'</select><label for="crtwo" style="margin-block-start:8px">المقرر الآخر</label><select class="inp" id="crtwo">'+options([])+'</select></div>';
  else body+='<div class="field"><span class="lbl">اختر ما يحتاج فتحاً (حتى 12)</span><div class="list" style="max-block-size:34dvh;overflow:auto">'+(d.courses||[]).map(function(c){return '<label class="opt"><span class="tx"><b>'+esc(c.name)+'</b><small><bdi>'+esc(c.code)+'</bdi></small></span><input type="checkbox" name="crcourse" value="'+c.id+'"></label>'}).join("")+'</div></div>';
  body+='<div class="field"><label for="crdetails">سبب مختصر</label><textarea class="inp" id="crdetails" maxlength="600" rows="3" placeholder="اكتب ما يحتاج القسم معرفته"></textarea></div>'+reqConsent();
  var el=sheet(reqShell(conflict?"تعارض مقررين":"مقرر لم يُفتح",body,"أرسل الطلب"));
  var send=document.getElementById("crsend"),one=document.getElementById("crone"),two=document.getElementById("crtwo");
  document.getElementById("crx").addEventListener("click",closeSheet);
  function ids(){if(conflict)return[Number((one||{}).value||0),Number((two||{}).value||0)];var out=[],cs=el.querySelectorAll('input[name="crcourse"]:checked');for(var i=0;i<cs.length;i++)out.push(Number(cs[i].value));return out}
  function ready(){var i=ids();return(conflict?(i[0]>0&&i[1]>0):i.length>0)&&document.getElementById("crdetails").value.trim().length>=3&&document.getElementById("crconsent").checked}
  function sync(){send.disabled=!ready()}
  if(conflict){var fill=function(){var id=Number(one.value||0),list=(d.conflictCourses||[]).filter(function(c){return(d.conflictPairs||[]).some(function(p){return Number(p.ownCourseId)===id&&Number(p.otherCourseId)===Number(c.id)})});two.innerHTML=options(list);sync()};one.addEventListener("change",fill);two.addEventListener("change",sync)}
  el.addEventListener("input",sync);el.addEventListener("change",function(e){if(e.target&&e.target.name==="crcourse"&&e.target.checked&&el.querySelectorAll('input[name="crcourse"]:checked').length>12){e.target.checked=false;showErr("crerr","يمكنك اختيار حتى 12 مقرراً في الطلب الواحد.")}sync()});
  send.addEventListener("click",function(){send.disabled=true;showErr("crerr","");
    api("POST","/api/public/me/request",{requestType:kind,courseIds:ids(),details:document.getElementById("crdetails").value,consent:true}).then(function(r){if(!r.ok){send.disabled=false;showErr("crerr",r.d.error||"تعذّر إرسال الطلب");return}reqDone(r)})})}
function reqGrad(g){
  var pct=g.threshold?Math.min(100,Math.round(g.passedUnits/g.threshold*100)):0;
  var meter='<div class="gm"><div class="gm-top"><b>'+g.passedUnits+'</b><small>من '+countOf(g.threshold,AR.unit)+(g.thresholdExact?'':' (الأدنى)')+'</small><span class="chip">'+(g.summer?"الفصل الصيفي":"الفصل العادي")+'</span></div><div class="gm-bar" role="img" aria-label="'+pct+'٪"><i style="inline-size:'+pct+'%"></i><span class="gm-flag">'+ic("flag")+'</span></div><p class="hint'+(g.enough?' ok':'')+'">'+(g.enough?'استوفيت وحدات الخريج — ارفع صحيفتك للتدقيق.':'ينقصك '+countOf(g.short,AR.unit)+' لتقدّم طلب الخريج.')+'</p></div>';
  if(!g.enough){sheet(reqShell("خريج / متوقع تخرّجه",meter+'<p class="muted">تُحسب من المقررات التي علّمتها في ملفّك. عدّلها إن نسيت مقرراً.</p>',""));document.getElementById("crx").addEventListener("click",closeSheet);return}
  var RS=[["field-conflict","مقرر يتعارض مع وقت الميداني","swap"],["field-prerequisite-conflict","مسبق ميداني يتعارض مع مسبق آخر","layers"]];
  var body=meter+(g.existing?'<div class="note">'+ic("info")+'<span>لديك طلب سابق · رقم الحالة <bdi dir="ltr">'+esc(g.existing.caseRef)+'</bdi> — الإرسال يحدّثه.</span></div>':'')
   +'<div class="field"><span class="lbl">ما نوع طلبك؟</span><div class="rsns" role="radiogroup">'+RS.map(function(r){return '<button type="button" class="rsn" role="radio" aria-checked="false" data-r="'+r[0]+'">'+ic(r[2])+'<span>'+r[1]+'</span></button>'}).join("")+'</div></div>'
   +'<div class="field"><label for="crdetails">اكتب سبب احتياجك</label><textarea class="inp" id="crdetails" maxlength="600" rows="3" placeholder="ملاحظاتك للقسم"></textarea></div>'
   +'<div class="field"><span class="lbl">صحيفة التخرّج الرسمية</span><label class="upl" id="upl"><input type="file" id="upf" accept="application/pdf,image/*" hidden><span class="ti">'+ic("up")+'</span><b>ارفعها للتدقيق</b><small>PDF أو صورة واضحة · حتى 14 ميغابايت</small></label><div id="upst" role="status" aria-live="polite"></div></div>'+reqConsent();
  var el=sheet(reqShell("خريج / متوقع تخرّجه",body,"أرسل الطلب")),send=document.getElementById("crsend"),proof="",reason="";
  document.getElementById("crx").addEventListener("click",closeSheet);
  function sync(){send.disabled=!(reason&&proof&&document.getElementById("crdetails").value.trim().length>=3&&document.getElementById("crconsent").checked)}
  el.querySelectorAll(".rsn").forEach(function(b){b.addEventListener("click",function(){reason=b.getAttribute("data-r");el.querySelectorAll(".rsn").forEach(function(x){x.setAttribute("aria-checked",x===b?"true":"false")});sync()})});
  el.addEventListener("input",sync);el.addEventListener("change",sync);
  var upf=document.getElementById("upf"),st=document.getElementById("upst");
  upf.addEventListener("change",function(){var f=upf.files&&upf.files[0];if(!f)return;proof="";sync();showErr("crerr","");
    if(f.size>14*1024*1024){st.innerHTML='<div class="err">حجم الملف أكبر من 14 ميغابايت. صوّر الصفحة الرسمية وحدها أو احفظها PDF بحجمٍ أصغر.</div>';return}
    st.innerHTML='<div class="chip gold">'+ic("clock","")+' يتحقق من «'+esc(f.name.slice(0,40))+'»… قد يستغرق دقيقة</div>';
    fetch("/api/public/me/graduate/proof",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/octet-stream","x-file-type":f.type||"application/pdf"},body:f})
      .then(function(r){return r.text().then(function(t){var d={};try{d=t?JSON.parse(t):{}}catch(e){}return{ok:r.ok,d:d}})})
      .catch(function(){return{ok:false,d:{error:"تعذّر الاتصال. تحقق من الإنترنت ثم أعد المحاولة."}}})
      .then(function(r){if(!r.ok||!r.d.proofToken){upf.value="";st.innerHTML='<div class="err">'+esc(r.d.error||"تعذّر التحقق من الصحيفة")+'</div>';return}
        proof=r.d.proofToken;st.innerHTML='<div class="chip ok">'+ic("check","")+' تم التحقق · اجتزت '+countOf(r.d.passedUnits,AR.unit)+'</div>';sync()})});
  send.addEventListener("click",function(){send.disabled=true;showErr("crerr","");
    api("POST","/api/public/me/request",{requestType:"graduate",graduateReason:reason,details:document.getElementById("crdetails").value,proofToken:proof,consent:true}).then(function(r){
      if(!r.ok){send.disabled=false;if(r.d.code==="proof-expired"||r.d.code==="proof-required"){proof="";upf.value="";st.innerHTML='<div class="err">'+esc(r.d.error)+'</div>'}else showErr("crerr",r.d.error||"تعذّر إرسال الطلب");return}reqDone(r)})})}
function loadTicket(){var host=document.getElementById("ticket");if(!host)return;
  api("GET","/api/public/me/ticket").then(function(r){if(!r.ok||!r.d.ready){host.innerHTML="";return}var t=r.d;S.ticket=t;S.tkPlan=S.tkPlan||"A";paintTicket(host)})}
/* ── التذكرة: أسبوعُه على شبكة. المس مقرراً: شعبُه البديلة أشباحٌ على الشبكة (الأحمر يتعارض)، وبدّله بمقررٍ آخر أو أزِله.
   كلُّه معاينةٌ شخصية — لا يغيّر جدول القسم — وزرٌّ واحد يحوّل ما اخترتَه إلى رغباتك. ── */
var PAL=["#1f6b5c","#8d6423","#3b6ea5","#a0522d","#6b4e9b","#2f7f8f","#9a4a6a","#5a7d2a"];
function clash(a,b){return(a||[]).some(function(l){return(b||[]).some(function(r){return l.day===r.day&&l.start<r.end&&r.start<l.end})})}
function tkColor(id){S.tkColor=S.tkColor||{};if(S.tkColor[id]==null)S.tkColor[id]=PAL[Object.keys(S.tkColor).length%PAL.length];return S.tkColor[id]}
function tkItems(cur){var out=[];
  cur.items.forEach(function(i){var key=cur.label+":"+i.courseId;if(S.tkRemoved[key])return;var alt=S.tkOverrides[key];
    out.push(alt?{courseId:i.courseId,name:i.name,code:i.code,credit:i.credit,tight:alt.tight,timesVisible:i.timesVisible,section:alt.section,slots:alt.slots,offeringId:alt.offeringId,alternatives:i.alternatives,base:i}:i)});
  (S.tkAdded[cur.label]||[]).forEach(function(a){out.push(a)});
  return out}
function tkOptions(it){if(it.added)return it.options;var base=it.base||it;
  return [{offeringId:base.offeringId,section:base.section,slots:base.slots,tight:base.tight,isBase:true}].concat(base.alternatives||[])}
function tkUnits(items){var n=0;items.forEach(function(i){n+=Number(i.credit)||0});return n}
function tkSet(cur,courseId,offeringId){
  var items=tkItems(cur),it=items.filter(function(x){return Number(x.courseId)===Number(courseId)})[0];if(!it)return false;
  var opt=tkOptions(it).filter(function(o){return o.offeringId===offeringId})[0];if(!opt)return false;
  for(var n=0;n<items.length;n++)if(items[n]!==it&&clash(items[n].slots,opt.slots)){S.tkErr="هذه الشعبة تتعارض مع مقرر آخر في خطتك؛ اختر شعبة أخرى.";return false}
  S.tkErr="";
  if(it.added){it.offeringId=opt.offeringId;it.section=opt.section;it.slots=opt.slots;it.tight=!!opt.tight}
  else{var key=cur.label+":"+courseId;if(opt.isBase)delete S.tkOverrides[key];else S.tkOverrides[key]=opt}
  return true}
function tkDrop(cur,courseId){var key=cur.label+":"+courseId,base=cur.items.filter(function(i){return Number(i.courseId)===Number(courseId)})[0];
  if(base){S.tkRemoved[key]=true;delete S.tkOverrides[key]}else S.tkAdded[cur.label]=(S.tkAdded[cur.label]||[]).filter(function(a){return Number(a.courseId)!==Number(courseId)})}
function tkEdited(cur){var any=false;Object.keys(S.tkRemoved).forEach(function(k){if(k.indexOf(cur.label+":")===0)any=true});return any||(S.tkAdded[cur.label]||[]).length>0}
function tkGrid(items,sel,ghosts){
  var lo=1440,hi=0;
  items.forEach(function(it){if(it.timesVisible)(it.slots||[]).forEach(function(s){lo=Math.min(lo,s.start);hi=Math.max(hi,s.end)})});
  ghosts.forEach(function(g){g.slots.forEach(function(s){lo=Math.min(lo,s.start);hi=Math.max(hi,s.end)})});
  if(hi<=lo)return "";
  lo=Math.floor(lo/60)*60;hi=Math.ceil(hi/60)*60;var H=44,rows=(hi-lo)/60;
  var h='<div class="wk" style="--rows:'+rows+';--h:'+H+'px"><div class="wk-h"><span></span>'+DAYN.map(function(d){return '<b>'+d+'</b>'}).join("")+'</div><div class="wk-body"><div class="wk-hrs" aria-hidden="true">';
  for(var t=lo;t<hi;t+=60)h+='<i>'+(t/60)+'</i>';
  h+='</div>';
  for(var d=0;d<5;d++){h+='<div class="wk-col">';
    items.forEach(function(it){if(!it.timesVisible)return;(it.slots||[]).forEach(function(s){if(s.day!==d)return;
      h+='<button type="button" class="wk-b'+(sel&&Number(sel)===Number(it.courseId)?' sel':(sel?' dim':''))+'" data-c="'+it.courseId+'" style="--c:'+tkColor(it.courseId)+';inset-block-start:'+((s.start-lo)/60*H)+'px;block-size:'+((s.end-s.start)/60*H-2)+'px"><b>'+esc(it.code)+'</b><span>'+esc(it.name)+'</span></button>'})});
    ghosts.forEach(function(g){g.slots.forEach(function(s){if(s.day!==d)return;
      h+='<button type="button" class="wk-b ghost'+(g.bad?' bad':'')+'" data-o="'+esc(g.offeringId)+'" style="--c:'+tkColor(g.courseId)+';inset-block-start:'+((s.start-lo)/60*H)+'px;block-size:'+((s.end-s.start)/60*H-2)+'px"><b>ش '+esc(g.section)+'</b></button>'})});
    h+='</div>'}
  return h+'</div></div>'}
function tkPoolSheet(cur,replaceId){
  var t=S.ticket,pool=t.pool||[],items=tkItems(cur).filter(function(x){return Number(x.courseId)!==Number(replaceId)}),have={};
  items.forEach(function(x){have[x.courseId]=1});
  var base=tkUnits(items),ok="",locked="";
  pool.forEach(function(p){if(have[p.courseId])return;
    var lock=p.needs&&p.needs.length;
    var opt=p.offerings.filter(function(o){return!items.some(function(x){return clash(x.slots,o.slots)})})[0];
    var over=base+Number(p.credit)>15;
    var why=lock?ic("lock","")+' يلزمك أولاً: '+esc(p.needs.join(" + ")):(!opt?'يتعارض مع جدولك':(over?'يتجاوز 15 وحدة':''));
    var row='<button type="button" class="opt'+(why?' off':'')+'" data-p="'+p.courseId+'"'+(why?' disabled':'')+'><span class="tx"><b>'+esc(p.name)+'</b><small><span class="code">'+esc(p.code)+'</span> · '+countOf(p.credit,AR.unit)+' · '+countOf(p.offerings.length,AR.section)+'</small>'+(why?'<small class="need">'+why+'</small>':'')+'</span>'+(why?'':ic("plus"))+'</button>';
    if(lock)locked+=row;else ok+=row});
  var el=sheet('<h3>'+(replaceId?'بدّل المقرر':'أضف مقرراً')+'</h3><p class="muted">وحداتك الآن '+tkUnits(items)+' · معاينةٌ شخصية لا تغيّر جدول القسم.</p><div class="list">'+(ok||'<p class="muted">لا مقررات متاحة لك الآن.</p>')+(locked?'<div class="grp">مقفلة — ينقصك مسبق</div>'+locked:'')+'</div><button class="btn alt" id="pc">إغلاق</button>');
  document.getElementById("pc").addEventListener("click",closeSheet);
  el.querySelectorAll("[data-p]").forEach(function(b){b.addEventListener("click",function(){
    var p=pool.filter(function(x){return Number(x.courseId)===Number(b.getAttribute("data-p"))})[0],opt=p.offerings.filter(function(o){return!items.some(function(x){return clash(x.slots,o.slots)})})[0];if(!p||!opt)return;
    if(replaceId)tkDrop(cur,replaceId);
    var baseItem=cur.items.filter(function(i){return Number(i.courseId)===Number(p.courseId)})[0];
    if(baseItem){delete S.tkRemoved[cur.label+":"+p.courseId]}
    else{(S.tkAdded[cur.label]=S.tkAdded[cur.label]||[]).push({courseId:p.courseId,name:p.name,code:p.code,credit:p.credit,tight:false,timesVisible:true,section:opt.section,slots:opt.slots,offeringId:opt.offeringId,added:true,
      options:p.offerings.map(function(o){return{offeringId:o.offeringId,section:o.section,slots:o.slots,tight:false}})})}
    S.tkSel=p.courseId;S.tkErr="";closeSheet();paintTicket(document.getElementById("ticket"))})})}
function tkSaveWishes(cur,btn){var items=tkItems(cur),w=S.state.profile.wishes&&S.state.term&&S.state.profile.wishes.termId===S.state.term.id?S.state.profile.wishes:null;
  var units=Math.max(12,Math.min(15,tkUnits(items)||15));btn.disabled=true;
  api("PUT","/api/public/me/wishes",{targetUnits:units,courseIds:items.map(function(i){return Number(i.courseId)}).slice(0,12),constraints:w?w.constraints:{}}).then(function(r){btn.disabled=false;
    if(!r.ok){toast(r.d.error||"تعذّر الحفظ",true);return}S.state.profile.wishes=r.d.wishes;S.wDraft=null;S.wCount=null;toast("سُجّلت رغباتك — تتحدّث تذكرتك في التحديث القادم");renderWishes()})}
function paintTicket(host){var t=S.ticket,cur=null;S.tkOverrides=S.tkOverrides||{};S.tkRemoved=S.tkRemoved||{};S.tkAdded=S.tkAdded||{};
  t.plans.forEach(function(p){if(p.label===S.tkPlan)cur=p});if(!cur)cur=t.plans[0];
  var items=tkItems(cur),units=tkUnits(items),visibleTimes=items.length>0&&items.every(function(i){return i.timesVisible}),daySet={},gapMinutes=0;
  if(visibleTimes){var byDay={};items.forEach(function(i){(i.slots||[]).forEach(function(slot){(byDay[slot.day]||(byDay[slot.day]=[])).push(slot)})});Object.keys(byDay).forEach(function(day){daySet[day]=true;var slots=byDay[day].sort(function(a,b){return a.start-b.start});for(var n=1;n<slots.length;n++)gapMinutes+=Math.max(0,slots[n].start-slots[n-1].end)})}
  var anyTimes=items.some(function(i){return i.timesVisible});var view=S.tkView||(anyTimes?"grid":"list");if(view==="grid"&&!anyTimes)view="list";
  var w=t.window,when=w.name?(w.name+(w.start?" · "+fmtShort(w.start)+(w.end?" → "+fmtShort(w.end):""):"")):"يحدّد موعدَها صاحبُ القرار";
  var sel=items.filter(function(x){return Number(x.courseId)===Number(S.tkSel)})[0];if(!sel)S.tkSel=0;
  var h='<section class="card tk fade"><div class="hd"><span class="win"><b>'+w.n+'</b><small>من '+w.of+'</small></span><div class="tx"><b>تذكرتي · نافذتي '+w.n+'</b><span class="muted">'+esc(when)+'</span></div></div><div class="perf"></div><div class="bd">';
  if(t.stale)h+='<div class="chip warn">'+ic("info")+' عدّلت ملفّك بعد آخر حساب — ستتحدّث تذكرتك في التحديث القادم</div>';
  if(t.defaulted)h+='<div class="chip">'+ic("info")+' بُنيت على افتراضٍ (١٥ وحدة). اكتب رغباتك لتُناسبك</div>';
  h+='<div class="seg fit" role="group" aria-label="الخطة" data-seg="plan">'+t.plans.map(function(p){return '<button type="button" data-l="'+p.label+'" aria-pressed="'+(p.label===cur.label?"true":"false")+'">'+({A:"الخطة أ",B:"الخطة ب",C:"الخطة ج"})[p.label]+'</button>'}).join("")+'</div>';
  h+='<div class="row between"><span class="muted">'+({A:"الأقرب لرغباتك",B:"شعبٌ بديلة إن امتلأت أ",C:"الحدّ الأدنى الآمن"})[cur.label]+'</span><span class="u">'+countOf(units,AR.unit)+(units<12&&items.length?' <span class="chip warn">أقل من 12</span>':'')+'</span></div>';
  if(anyTimes)h+='<div class="seg fit sm2" role="group" aria-label="العرض" data-seg="view"><button type="button" data-v="grid" aria-pressed="'+(view==="grid")+'">أسبوعي</button><button type="button" data-v="list" aria-pressed="'+(view==="list")+'">قائمة</button></div>';
  if(visibleTimes)h+='<p class="fine">'+countOf(Object.keys(daySet).length,AR.day)+' حضور · '+(gapMinutes?('فراغات بين المحاضرات نحو '+countOf(Math.round(gapMinutes/6)/10,AR.hour)):'بلا فراغات طويلة')+' · التعديل معاينة شخصية لا تغيّر جدول القسم.</p>';
  if(!items.length)h+='<p class="lead">لا مقرراتٍ تُناسب هذه الخطة الآن.</p>';
  var ghosts=[];
  if(sel&&view==="grid")tkOptions(sel).forEach(function(o){if(o.offeringId===sel.offeringId)return;var bad=items.some(function(x){return x!==sel&&clash(x.slots,o.slots)});ghosts.push({offeringId:o.offeringId,courseId:sel.courseId,section:o.section,slots:o.slots,bad:bad})});
  if(view==="grid"){
    h+=tkGrid(items,S.tkSel,ghosts);
    if(sel){var opts=tkOptions(sel);
      h+='<div class="wk-sel" style="--c:'+tkColor(sel.courseId)+'"><div class="row between"><b>'+esc(sel.name)+'</b><span class="code">'+esc(sel.code)+'</span></div><small class="muted">'+(sel.timesVisible?esc((sel.section?"شعبة "+sel.section+" · ":""))+slotsText(sel.slots):"")+'</small>';
      if(opts.length>1)h+='<div class="chps" role="group" aria-label="شعب بديلة">'+opts.map(function(o){var bad=items.some(function(x){return x!==sel&&clash(x.slots,o.slots)});return '<button type="button" class="chp'+(o.offeringId===sel.offeringId?' on':'')+(bad?' bad':'')+'" data-o="'+esc(o.offeringId)+'">شعبة '+esc(o.section)+(bad?' · تتعارض':(o.tight?' · مقاعد قليلة':''))+'</button>'}).join("")+'</div>';
      h+='<div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn alt small" data-act="swap" style="inline-size:auto">'+ic("layers")+'بدّله بمقرر آخر</button><button type="button" class="btn alt small" data-act="drop" style="inline-size:auto">'+ic("x")+'لا أريده</button></div></div>'}
    else if(items.length)h+='<p class="hint">المس مقرراً لتجرّب شعبةً بديلة أو تبدّله.</p>'}
  else{
    items.forEach(function(chosen){var i=chosen.base||chosen,alternatives=(chosen.added?[]:(i.alternatives||[]));
      h+='<div class="ln"><span class="ic">'+ic("book")+'</span><span class="tx"><b>'+esc(chosen.name)+'</b><small>'+(chosen.timesVisible?esc(chosen.section?"شعبة "+chosen.section+" · ":"")+slotsText(chosen.slots):ic("lock","")+" الموعد يظهر عند اعتماد جدول القسم")+'</small></span>'+(chosen.tight?'<span class="chip warn">مقاعد قليلة</span>':'')+'<span class="code">'+esc(chosen.code)+'</span></div>';
      if(chosen.timesVisible&&alternatives.length){h+='<div class="ticket-alt"><label for="ta'+chosen.courseId+'">جرّب شعبة بديلة · معاينة شخصية</label><select class="inp ticket-alt-select" id="ta'+chosen.courseId+'" data-course="'+chosen.courseId+'"><option value="'+esc(i.offeringId)+'">الشعبة المقترحة · '+esc(i.section)+'</option>'+alternatives.map(function(a){return '<option value="'+esc(a.offeringId)+'"'+(chosen.offeringId===a.offeringId?' selected':'')+'>شعبة '+esc(a.section)+(a.tight?' · مقاعد قليلة':'')+'</option>'}).join("")+'</select></div>'}})}
  var removed=cur.items.filter(function(i){return S.tkRemoved[cur.label+":"+i.courseId]});
  if(removed.length)h+='<div class="chps"><small class="muted">أزلتَ:</small>'+removed.map(function(i){return '<button type="button" class="chp" data-undo="'+i.courseId+'">'+ic("plus","")+esc(i.name)+'</button>'}).join("")+'</div>';
  h+='<div class="row" style="gap:8px;flex-wrap:wrap">'+((t.pool||[]).length?'<button type="button" class="btn alt small" data-act="add" style="inline-size:auto">'+ic("plus")+'أضف مقرراً</button>':'')
    +(tkEdited(cur)&&S.state.phase&&S.state.phase.canEditWishes?'<button type="button" class="btn small" data-act="wish" style="inline-size:auto">'+ic("heart")+'اجعلها رغباتي</button>':'')+'</div>';
  h+='<p class="fine" id="tkerr" role="status" aria-live="polite">'+esc(S.tkErr||"")+'</p>';
  if(t.unmet.length){h+='<details class="more"><summary>'+ic("down")+' ما لم نضعه ('+t.unmet.length+')</summary><div class="list" style="margin-block-start:6px">'+t.unmet.map(function(u){return '<div class="opt off"><span class="tx"><b>'+esc(u.name)+'</b><small>'+esc(WHY[u.reason]||"")+'</small></span></div>'}).join("")+'</div></details>'}
  h+='<p class="fine">'+ic("shield","")+' تقدير فقط — لا يحجز مقعداً.</p></div></section>';
  host.innerHTML=h;
  host.querySelectorAll('[data-seg="plan"] button').forEach(function(b){b.addEventListener("click",function(){S.tkPlan=b.getAttribute("data-l");S.tkSel=0;S.tkErr="";paintTicket(host)})});
  host.querySelectorAll('[data-seg="view"] button').forEach(function(b){b.addEventListener("click",function(){S.tkView=b.getAttribute("data-v");paintTicket(host)})});
  host.querySelectorAll(".wk-b[data-c]").forEach(function(b){b.addEventListener("click",function(){var id=Number(b.getAttribute("data-c"));S.tkSel=Number(S.tkSel)===id?0:id;S.tkErr="";paintTicket(host)})});
  host.querySelectorAll(".wk-b.ghost,.chp[data-o]").forEach(function(b){b.addEventListener("click",function(){if(sel){tkSet(cur,sel.courseId,b.getAttribute("data-o"));paintTicket(host)}})});
  host.querySelectorAll("[data-undo]").forEach(function(b){b.addEventListener("click",function(){delete S.tkRemoved[cur.label+":"+b.getAttribute("data-undo")];S.tkErr="";paintTicket(host)})});
  host.querySelectorAll("[data-act]").forEach(function(b){b.addEventListener("click",function(){var a=b.getAttribute("data-act");
    if(a==="drop"&&sel){tkDrop(cur,sel.courseId);S.tkSel=0;S.tkErr="";paintTicket(host)}
    else if(a==="swap"&&sel)tkPoolSheet(cur,sel.courseId);
    else if(a==="add")tkPoolSheet(cur,0);
    else if(a==="wish")tkSaveWishes(cur,b)})});
  var alternatives=host.querySelectorAll(".ticket-alt-select");for(var ai=0;ai<alternatives.length;ai++)(function(select){select.addEventListener("change",function(){var courseId=Number(select.getAttribute("data-course"));
    if(!tkSet(cur,courseId,select.value)){var it=tkItems(cur).filter(function(x){return Number(x.courseId)===courseId})[0];select.value=it?it.offeringId:"";document.getElementById("tkerr").textContent=S.tkErr;return}
    paintTicket(host)})})(alternatives[ai])}
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
/* ── خطتي: بطاقةٌ واحدة — ماذا أسجّل، وأين طريقي إلى التخرّج، وما المطروح لي. (كانت بطاقتين متداخلتين.) ── */
function roadmap(a){
  if(a.termsAfter===null||a.done)return "";
  var h='<ol class="track" aria-label="طريقي إلى التخرّج"><li class="stp now"><span class="d">'+ic("book")+'</span><b>هذا الفصل</b><small>'+countOf(a.units,AR.unit)+'</small></li>',n=a.path.length,show=Math.min(n,4);
  for(var i=0;i<show;i++)h+='<li class="stp unset"><span class="d num">'+(i+2)+'</span><b>الفصل</b><small>'+countOf(a.path[i],AR.unit)+'</small></li>';
  if(n>show)h+='<li class="stp unset"><span class="d">…</span><b>+'+(n-show)+'</b></li>';
  return h+'<li class="stp goal"><span class="d">'+ic("flag")+'</span><b>التخرّج</b></li></ol>'}
function planCard(a,o){
  var locked=function(c){return c.needs&&c.needs.length},okList=o?o.courses.filter(function(c){return!locked(c)}):[],now=okList.filter(function(c){return c.sections}).length;
  var h='<section class="card adv fade"><h2><span class="b">'+ic(a?"spark":"layers")+'</span>'+(a?"مقترحي لك":"المطروح لي")+(a&&!a.hasRules?'<span class="chip gold">بلا شروط معتمدة</span>':'')+'</h2>';
  if(a){
    h+='<p class="lead big">'+esc(a.line)+'</p>';
    a.picks.forEach(function(p){h+='<div class="ln"><span class="ic">'+ic("book")+'</span><span class="tx"><b>'+esc(p.name)+'</b><small>'+esc(p.why)+'</small></span><span class="code">'+esc(p.code)+'</span></div>'});
    h+=roadmap(a);
    if(!a.picks.length||a.termsAfter===null)h+='<p class="muted">'+esc(a.tail)+'</p>';
    if(a.notOffered&&a.notOffered.length)h+='<div class="note">'+ic("info")+'<span>غير مطروحة هذا الفصل: '+a.notOffered.map(esc).join("، ")+'</span></div>';
    if(a.waiting&&a.waiting.length)h+='<details class="more"><summary>'+ic("lock")+' تنتظر مسبقاً ('+a.waiting.length+')</summary><div class="list" style="margin-block-start:6px">'+a.waiting.map(function(x){return '<div class="opt off"><span class="tx"><b>'+esc(x.name)+'</b><small class="need">'+esc(x.reason)+'</small></span></div>'}).join("")+'</div></details>';
    if(a.picks.length&&S.state.phase&&S.state.phase.canEditWishes)h+='<button class="btn" id="advw">'+ic("heart")+'استخدمها في رغباتي</button>'}
  if(o){
    if(!o.remainingCount){if(!a)h+='<p class="lead">أنجزت كل مقررات صحيفتك. مبارك!</p>'}
    else h+='<div class="offrow">'+ring(o.remainingCount?Math.round(now/o.remainingCount*100):0)+'<div class="offt"><b>'+now+' <small>تستطيع تسجيلها الآن</small></b><span class="muted">من '+o.remainingCount+' متبقية</span></div></div>'
      +'<details class="more"><summary>'+ic("down")+' المطروح لي ('+okList.length+')</summary><div class="list" style="margin-block-start:6px">'+(okList.map(function(c){return '<div class="opt'+(c.sections?"":" off")+'"><span class="tx"><b>'+esc(c.name)+'</b><small><span class="code">'+esc(c.code)+'</span> · '+countOf(c.credit,AR.unit)+'</small></span><span class="chip'+(c.sections?" ok":"")+'">'+(c.sections?countOf(c.sections,AR.section):"غير مطروح")+'</span></div>'}).join("")||'<p class="muted">لا مقررات متاحة الآن.</p>')+'</div></details>'}
  return h+'<p class="fine">'+ic("shield","")+' اقتراح فقط — لا يحجز مقعداً.</p></section>'}
function loadPlan(){var host=document.getElementById("advice");if(!host)return;
  host.innerHTML='<div class="skel"></div>';
  Promise.all([api("GET","/api/public/me/advice"),api("GET","/api/public/me/offered")]).then(function(rs){
    var a=rs[0].ok&&rs[0].d.ready?rs[0].d:null,o=rs[1].ok&&rs[1].d.ready?rs[1].d:null;S.offered=o;
    if(!a&&!o){host.innerHTML=""}else{host.innerHTML=planCard(a,o);animateRings();markOverflow()}
    var kt=document.getElementById("kt"),ks=document.getElementById("kts");
    if(a&&kt){var n=a.done?0:(a.termsAfter===null?null:a.termsAfter+(a.picks.length?1:0));kt.textContent=n===null?"؟":(n===0?"✓":n);ks.textContent=n===0?"أكملت الصحيفة":(n===null?"راجع مرشدك":"فصول للتخرّج")}
    var b=document.getElementById("advw");if(b&&a)b.addEventListener("click",function(){b.disabled=true;var w=S.state.profile.wishes&&S.state.term&&S.state.profile.wishes.termId===S.state.term.id?S.state.profile.wishes:null;
      api("PUT","/api/public/me/wishes",{targetUnits:Math.max(12,Math.min(15,a.units||15)),courseIds:a.picks.map(function(p){return p.courseId}),constraints:w?w.constraints:{}}).then(function(x){b.disabled=false;
        if(!x.ok){toast(x.d.error||"تعذّر الحفظ",true);return}S.state.profile.wishes=x.d.wishes;S.wDraft=null;S.wCount=null;S.wEdit=false;toast("صارت رغباتك");renderWishes()})});
    if(S.state.phase.mode==="wishes")renderWishes()})}
/* ── الرغبات: ثلاث بطاقاتٍ تمرّرها (كم وحدة ← ما لا يناسبك ← مقررات بعينها) ثم «وصلت» وعدّادُ زملائك. ── */
function wishState(){if(S.wDraft)return S.wDraft;var s=S.state,w=s.profile.wishes;if(w&&s.term&&w.termId!==s.term.id)w=null;
  var cur=w||{targetUnits:15,courseIds:[],constraints:{}};
  S.wDraft={targetUnits:cur.targetUnits,courseIds:cur.courseIds.slice(),constraints:{noMorning:!!cur.constraints.noMorning,noAfternoon:!!cur.constraints.noAfternoon,freeDay:!!cur.constraints.freeDay}};return S.wDraft}
function wishChips(w){var h='<span class="chip ok">'+countOf(w.targetUnits,AR.unit)+'</span>';
  if(w.constraints.noMorning)h+='<span class="chip">'+ic("sun","")+' لا صباحاً</span>';
  if(w.constraints.noAfternoon)h+='<span class="chip">'+ic("moon","")+' لا بعد الظهر</span>';
  if(w.constraints.freeDay)h+='<span class="chip">يومٌ فارغ '+ic("calx","")+'</span>';
  if(w.courseIds&&w.courseIds.length)h+='<span class="chip">'+countOf(w.courseIds.length,AR.course)+' بعينها</span>';
  return h}
function wishesDone(host,w,edit){var ph=S.state.phase;
  host.innerHTML='<section class="card fade"><h2><span class="b">'+ic("heart")+'</span>احتياجي لهذا الفصل'+(edit?'<span class="chip ok">'+ic("check","")+' وصلت</span>':'<span class="chip">للقراءة</span>')+'</h2><div class="tags">'+wishChips({targetUnits:w.targetUnits,constraints:w.constraints||{},courseIds:w.courseIds||[]})+'</div><p class="muted" id="wcnt"></p>'
    +(edit?'<button class="btn alt small" id="wed" style="inline-size:auto">'+ic("edit")+'عدّل رغباتي</button><p class="hint">'+(ph.nextAt?"تعدّلها حتى "+esc(fmtShort(ph.nextAt)):"تعدّلها متى شئت")+'</p>':'')+'</section>';
  var ed=document.getElementById("wed");if(ed)ed.addEventListener("click",function(){S.wEdit=true;S.wStep=0;renderWishes()});
  if(edit){var put=function(c){var el=document.getElementById("wcnt");if(el)el.innerHTML=c}
    if(S.wCount)put(S.wCount);
    else api("GET","/api/public/me/wishes-count").then(function(r){if(!r.ok||!r.d.ready)return;S.wCount=r.d.show?ic("user","")+' أنت واحدٌ من '+countOf(r.d.n,AR.student)+' أرسلوا رغباتهم في قسمك.':ic("shield","")+' رغباتك تغذّي رادار التسجيل لقسمك.';put(S.wCount)})}}
function renderWishes(){var host=document.getElementById("wishes"),s=S.state,ph=s.phase,w=s.profile.wishes;if(w&&s.term&&w.termId!==s.term.id)w=null;if(!host)return;
  if(ph.mode!=="wishes"&&!(w&&ph.mode==="frozen")){host.innerHTML="";return}
  var edit=ph.mode==="wishes";
  if(!edit||(w&&!S.wEdit)){wishesDone(host,w,edit);return}
  var state=wishState(),step=Math.max(0,Math.min(2,S.wStep||0));
  var remaining=(S.offered&&S.offered.courses)||[];
  var allowedNow=remaining.filter(function(c){return!(c.needs&&c.needs.length)}),lockedNow=remaining.filter(function(c){return c.needs&&c.needs.length});
  var row=function(c){return '<div class="opt'+(c.sections?"":" off")+'" role="checkbox" tabindex="0" aria-checked="'+(state.courseIds.indexOf(c.id)>=0?"true":"false")+'" data-id="'+c.id+'"><span class="box">'+ic("check")+'</span><span class="tx"><b>'+esc(c.name)+'</b><small><span class="code">'+esc(c.code)+'</span> · '+countOf(c.credit,AR.unit)+(c.sections?"":" · غير مطروح هذا الفصل")+'</small></span></div>'};
  var h='<section class="card fade wz"><h2><span class="b">'+ic("heart")+'</span>احتياجي لهذا الفصل<span class="chip">ليس تسجيلاً</span></h2>';
  h+='<div class="sl" data-i="0"><span class="lbl">كم وحدةً تريد هذا الفصل؟</span><div class="bignum"><b id="wun"></b></div><p class="hint">وحدة دراسية هذا الفصل · بين 12 و15</p><div class="seg fit" id="wu" role="group" aria-label="الوحدات">'+[12,13,14,15].map(function(n){return '<button type="button" data-n="'+n+'" aria-pressed="'+(n===state.targetUnits?"true":"false")+'">'+n+'</button>'}).join("")+'</div></div>';
  h+='<div class="sl" data-i="1" hidden><span class="lbl">ما الذي لا يناسبك؟ <small class="muted">اختياري</small></span><div class="tags" id="wc">'
   +'<button type="button" class="tag" data-k="noMorning" aria-pressed="'+(state.constraints.noMorning?"true":"false")+'">'+ic("sun")+'لا أستطيع الصباح الباكر</button>'
   +'<button type="button" class="tag" data-k="noAfternoon" aria-pressed="'+(state.constraints.noAfternoon?"true":"false")+'">'+ic("moon")+'لا أستطيع بعد الظهر</button>'
   +'<button type="button" class="tag" data-k="freeDay" aria-pressed="'+(state.constraints.freeDay?"true":"false")+'">'+ic("calx")+'أحتاج يوماً فارغاً</button></div></div>';
  h+='<div class="sl" data-i="2" hidden><span class="lbl">مقرراتٌ بعينها؟ <small class="muted">اختياري · <span id="wn">'+state.courseIds.length+'</span></small></span>'
   +(allowedNow.length?'<div class="list wl" id="wl">'+allowedNow.map(row).join("")+'</div>':'<p class="muted">لا مقررات تستطيع طلبها الآن.</p>')
   +(lockedNow.length?'<details class="more"><summary>'+ic("down")+' مقفلة — ينقصك مسبق ('+lockedNow.length+')</summary><div class="list" style="margin-block-start:6px">'+lockedNow.map(function(c){return '<div class="opt off"><span class="tx"><b>'+esc(c.name)+'</b><small class="need">'+ic("lock","")+' يلزمك أولاً: '+esc(c.needs.join(" + "))+'</small></span></div>'}).join("")+'</div></details>':'')+'</div>';
  h+='<div class="dots" aria-hidden="true"><i></i><i></i><i></i></div>'+errBox("werr")
   +'<div class="row" style="gap:8px"><button type="button" class="btn alt" id="wprev" style="inline-size:auto;min-inline-size:96px">رجوع</button><button type="button" class="btn" id="wnext"></button></div></section>';
  host.innerHTML=h;
  var slides=host.querySelectorAll(".sl"),dots=host.querySelectorAll(".dots i"),next=document.getElementById("wnext"),prev=document.getElementById("wprev");
  function go(n){step=Math.max(0,Math.min(2,n));S.wStep=step;for(var i=0;i<slides.length;i++){slides[i].hidden=i!==step;dots[i].className=i<step?"on":i===step?"now":""}
    prev.hidden=step===0;next.innerHTML=step<2?'التالي '+ic("fwd"):ic("check")+' '+(s.profile.wishes?"حدّث رغباتي":"أرسل رغباتي");showErr("werr","")}
  document.getElementById("wun").textContent=state.targetUnits;
  go(step);
  next.addEventListener("click",function(){if(step<2)return go(step+1);var b=next;b.disabled=true;
    api("PUT","/api/public/me/wishes",state).then(function(r){b.disabled=false;if(!r.ok){showErr("werr",r.d.error||"تعذّر الحفظ");return}
      S.state.profile.wishes=r.d.wishes;S.wDraft=null;S.wEdit=false;S.wCount=null;toast("وصلت رغباتك");renderWishes()})});
  prev.addEventListener("click",function(){go(step-1)});
  var ts=null;host.addEventListener("touchstart",function(e){ts=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null},{passive:true});
  host.addEventListener("touchend",function(e){if(!ts)return;var t=e.changedTouches[0],dx=t.clientX-ts.x,dy=t.clientY-ts.y;ts=null;if(Math.abs(dx)<60||Math.abs(dx)<Math.abs(dy)*1.6)return;go(dx>0?step+1:step-1)},{passive:true});
  document.getElementById("wu").addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;state.targetUnits=Number(b.getAttribute("data-n"));document.getElementById("wun").textContent=state.targetUnits;[].forEach.call(this.children,function(x){x.setAttribute("aria-pressed",x===b?"true":"false")})});
  document.getElementById("wc").addEventListener("click",function(e){var b=e.target.closest("button");if(!b)return;var k=b.getAttribute("data-k");state.constraints[k]=!state.constraints[k];b.setAttribute("aria-pressed",state.constraints[k]?"true":"false")});
  var wl=document.getElementById("wl");if(wl){var tg=function(el){var id=Number(el.getAttribute("data-id")),at=state.courseIds.indexOf(id);if(at>=0)state.courseIds.splice(at,1);else if(state.courseIds.length<12)state.courseIds.push(id);else{toast("حتى 12 مقرراً",true);return}el.setAttribute("aria-checked",state.courseIds.indexOf(id)>=0?"true":"false");document.getElementById("wn").textContent=state.courseIds.length};
    wl.addEventListener("click",function(e){var el=e.target.closest(".opt");if(el)tg(el)});wl.addEventListener("keydown",function(e){if(e.key===" "||e.key==="Enter"){var el=e.target.closest(".opt");if(el){e.preventDefault();tg(el)}}})}
}

/* ── أوراق: الرمز والحذف ── */
function sheetName(){var cur=(S.state.profile.identity||{}).name||"";
  sheet('<h3>تصحيح الاسم</h3><p class="lead">اكتب اسمك الثلاثي كما في الجامعة. هو ما يصل قسمك إن طلبتَ مساعدته.</p><div class="field"><label for="nm2">الاسم الثلاثي</label><input class="inp" id="nm2" maxlength="80" autocomplete="name"></div>'+errBox("nerr")+'<button class="btn" id="ns">احفظ</button><button class="btn alt" id="nc">إلغاء</button>');
  var inp=document.getElementById("nm2");inp.value=cur;document.getElementById("nc").addEventListener("click",closeSheet);
  document.getElementById("ns").addEventListener("click",function(){var b=this;b.disabled=true;api("PUT","/api/public/me/name",{name:inp.value}).then(function(r){b.disabled=false;if(!r.ok){showErr("nerr",r.d.error||"تعذّر الحفظ");return}closeSheet();S.state.profile=r.d;toast("تم تصحيح الاسم");render()})})}
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

export function studentHomePage(nonce: string, track: "boys" | "girls" | "" = ""): string {
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
<header class="top" id="top"><span class="mark">SCHEDULE</span><span class="topr"><a class="jrn" href="/?journey=1&amp;back=/me" aria-label="افتح رحلة SCHEDULE"><svg class="i" aria-hidden="true"><use href="#i-spark"/></svg><span>الرحلة</span></a></span></header>
<main id="app" aria-live="polite"><div class="skel"></div></main>
</div>
<div class="dock" id="dock"></div>
<noscript><p style="padding:24px;text-align:center">يلزم تفعيل JavaScript لفتح مساري.</p></noscript>
<script nonce="${nonce}">window.__SCHEDULE_TRACK=${JSON.stringify(track)};</script><script nonce="${nonce}">${STUDENT_HOME_SCRIPT}</script>
</body>
</html>`;
}
