/**
 * ── توليد أصول العلامة من مصدر واحد ────────────────────────────────────────
 *
 * كل أصل مستقلّ للعلامة يُرسم هنا، من موضعين لا ثالث لهما:
 *   - الأعمدة الخمسة أدناه، وهي أرقام src/components/BrandMark.tsx نفسها؛
 *   - ألوان `--brand-*` مقروءةً من src/styles/01-foundation.css لا مكتوبةً.
 *
 * فلا يستطيع أصل مستقل أن ينحرف عن البرنامج، وإعادة تسمية رمز تُفشل السكربت
 * صراحةً بدل أن تُنتج أيقونةً بلون خاطئ بصمت.
 *
 * Run:   node scripts/render-brand.mjs           يكتب الأصول
 * Check: node scripts/render-brand.mjs --check   يتحقّق ولا يكتب
 *
 * التحقّق يقيس النصوص المُولَّدة بالبايت (حتمية على كل نظام)، والصور بالبكسل
 * عند نقاط معلومة. لا يصحّ قياس PNG بالبايت: الرسم يمرّ بمكتبة أصلية يختلف
 * ثنائيّها بين darwin-arm64 و linux-x64، فالرسم نفسه يُنتج ملفاً مختلفاً —
 * وهو ما أسقط البناء في CI بلا عيب حقيقي. البكسل هو ما يعني شيئاً.
 *
 * ولذلك: إعادة توليد الصور على نظام مختلف قد تُظهر فرقاً في git بلا فرق
 * بصري. هذا متوقّع ولا يضرّ.
 *
 * بطاقة المشاركة وحدها لا يُتمّها node: نصّها عربي، والتشكيل العربي يحتاج
 * محرّك صفٍّ حقيقي. فيكتب السكربت scripts/social-card.html بالألوان الصحيحة،
 * وتُرسَم البطاقة منه بمتصفح:
 *
 *   (أي خادم ملفات ساكن على المستودع)
 *   chrome-headless-shell --headless --window-size=1200,630 \
 *     --screenshot=public/schedule-social-card-v4.png <url>/social-card.html
 */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFileSync, writeFileSync } from "node:fs";

/* ── الألوان: تُقرأ، لا تُكتب ─────────────────────────────────────────────── */

const FOUNDATION = "src/styles/01-foundation.css";

function token(css, name) {
  const found = css.match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\s*;`));
  if (!found) {
    throw new Error(
      `لم يُعثر على --${name} في ${FOUNDATION}. ` +
      `أصول العلامة تُشتق من ذلك الملف؛ إن أُعيدت تسمية الرمز فحدّثه هنا أيضاً.`,
    );
  }
  return found[1];
}

const css = readFileSync(FOUNDATION, "utf8");
const JADE = token(css, "brand-jade");
const BRASS = token(css, "brand-brass");
const GROUND = token(css, "brand-ground");

/* ── الهندسة: نفس أعمدة BrandMark.tsx، مضروبة في ٨ ───────────────────────── */

const BARS = [
  { x: 371.2, y: 156, h: 120 },  // الأحد
  { x: 302.4, y: 220, h: 96 },   // الاثنين
  { x: 233.6, y: 132, h: 152 },  // الثلاثاء
  { x: 164.8, y: 260, h: 112, decided: true },  // الأربعاء — المنقول
  { x: 96.0, y: 188, h: 128 },   // الخميس
];
const W = 44.8;
const R = 22.4;

/* ── PNG ──────────────────────────────────────────────────────────────────── */

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/**
 * @param size   pixel size of the output
 * @param masked true for the maskable/apple variant: square ground, no ring —
 *               the platform's own mask draws the shape, and the ring would sit
 *               outside the safe circle and be cut off anyway, which is exactly
 *               what happened to the old icon on every Android device.
 */
function drawIcon(size, masked) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.scale(size / 512, size / 512);

  ctx.fillStyle = GROUND;
  if (masked) {
    ctx.fillRect(0, 0, 512, 512);
  } else {
    roundRect(ctx, 0, 0, 512, 512, 112);
    ctx.fill();
    ctx.strokeStyle = BRASS;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 6.4;
    roundRect(ctx, 8, 8, 496, 496, 107.2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* No trace on any static icon. Drawn at 512 it read as a stray dotted glyph
     rather than as an absence; it earns its place only on the boot splash,
     where the brass column is seen leaving it. */
  for (const bar of BARS) {
    ctx.fillStyle = bar.decided ? BRASS : JADE;
    roundRect(ctx, bar.x, bar.y, W, bar.h, R);
    ctx.fill();
  }
  return canvas.toBuffer("image/png");
}

/* ── SVG ──────────────────────────────────────────────────────────────────── */

const barMarkup = BARS.map(bar =>
  `  <rect x="${bar.x}" y="${bar.y}" width="${W}" height="${bar.h}" rx="${R}" fill="${bar.decided ? BRASS : JADE}"/>`,
).join("\n");

const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="SCHEDULE">
  <!-- مُولَّد من scripts/render-brand.mjs — لا يُحرَّر يدوياً.
       العلامة: الأسبوع الذي حُلّ. خمسة أعمدة = خمسة أيام؛ الارتفاع مدّة،
       والموضع الرأسي ساعة. العمود النحاسي هو الذي نُقل.
       نسخة "any": حافة إلى حافة مع حلقة. -->
  <rect width="512" height="512" rx="112" fill="${GROUND}"/>
  <rect x="8" y="8" width="496" height="496" rx="107.2" fill="none" stroke="${BRASS}" stroke-opacity="0.22" stroke-width="6.4"/>

${barMarkup}
</svg>
`;

const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="SCHEDULE">
  <!-- مُولَّد من scripts/render-brand.mjs — لا يُحرَّر يدوياً.
       نسخة القناع: القناع نفسه يرسم الشكل، فالخلفية مربّعة بلا زوايا،
       والحلقة محذوفة لأنها تقع خارج الدائرة الآمنة. الأعمدة بلا إزاحة:
       أقصى بعد لها عن المركز 188.7 من 204.8 المسموحة. -->
  <rect width="512" height="512" fill="${GROUND}"/>

${barMarkup}
</svg>
`;

/* ── بطاقة المشاركة ───────────────────────────────────────────────────────── */

const cardSvgMark = BARS.map(bar => {
  const k = 64 / 512;
  return `      <rect x="${+(bar.x * k).toFixed(2)}" y="${+(bar.y * k).toFixed(2)}" width="${+(W * k).toFixed(2)}" height="${+(bar.h * k).toFixed(2)}" rx="${+(R * k).toFixed(2)}" fill="${bar.decided ? BRASS : JADE}"/>`;
}).join("\n");

const cardHtml = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<!-- مُولَّد من scripts/render-brand.mjs — لا يُحرَّر يدوياً.
     يُرسَم بمتصفح لا بـnode: النصّ عربي، والتشكيل العربي يحتاج محرّك صفٍّ
     حقيقي؛ @napi-rs/canvas يرسمه مفكّك الحروف ومعكوس الترتيب. -->
<style>
@font-face{font-family:"Plex Arabic";font-weight:400;font-display:block;src:url("/fonts/plex-arabic-arabic-400.woff2") format("woff2");unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFC,U+200C-200E}
@font-face{font-family:"Plex Arabic";font-weight:600;font-display:block;src:url("/fonts/plex-arabic-arabic-600.woff2") format("woff2");unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFC,U+200C-200E}
@font-face{font-family:"Plex Arabic";font-weight:700;font-display:block;src:url("/fonts/plex-arabic-arabic-700.woff2") format("woff2");unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFC,U+200C-200E}
@font-face{font-family:"Plex Mono";font-weight:600;font-display:block;src:url("/fonts/plex-mono-latin-600.woff2") format("woff2");unicode-range:U+0000-00FF}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden}
body{
  background:
    radial-gradient(760px 520px at 22% 46%, rgba(47,133,116,.10), transparent 68%),
    radial-gradient(620px 460px at 92% 8%, rgba(199,155,95,.10), transparent 66%),
    #f2f3ef;
  font-family:"Plex Arabic",sans-serif;color:#131817;position:relative;
}
.grid{
  position:absolute;inset:0;
  background-image:
    linear-gradient(to left,rgba(19,24,23,.045) 1px,transparent 1px),
    linear-gradient(to bottom,rgba(19,24,23,.045) 1px,transparent 1px);
  background-size:75px 75px;
  -webkit-mask-image:radial-gradient(ellipse 78% 74% at 30% 50%,#000 6%,transparent 76%);
}
.sheet{position:relative;height:100%;display:grid;grid-template-columns:410px 1fr;align-items:center;padding:0 76px 0 66px;gap:56px}
.markwrap{display:grid;place-items:center}
.markwrap svg{width:312px;height:312px;display:block;filter:drop-shadow(0 34px 56px rgba(14,28,23,.26))}
.copy{display:grid;justify-items:start;text-align:right;direction:rtl}
.eyebrow{font-weight:600;font-size:22px;letter-spacing:.02em;color:#8d6423;margin-bottom:16px}
.name{font-family:"Plex Mono",monospace;font-weight:600;font-size:34px;letter-spacing:.28em;line-height:1;direction:ltr;color:#131817}
.rule{width:132px;height:4px;border-radius:99px;background:${BRASS};margin:26px 0 30px}
.head{font-weight:700;font-size:56px;line-height:1.28;letter-spacing:-.01em;color:#131817}
.desc{margin-top:24px;font-weight:400;font-size:25px;line-height:1.5;color:#5b6660;white-space:nowrap}
</style>
</head>
<body>
<div class="grid"></div>
<div class="sheet">
  <div class="markwrap">
    <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="14" fill="${GROUND}"/>
      <rect x="1" y="1" width="62" height="62" rx="13.4" fill="none" stroke="${BRASS}" stroke-opacity=".22" stroke-width=".8"/>
${cardSvgMark}
    </svg>
  </div>
  <div class="copy">
    <div class="eyebrow">نظام القرار الأكاديمي</div>
    <div class="name">SCHEDULE</div>
    <div class="rule"></div>
    <h1 class="head">ابنِ الجدول. راجِعه.<br>اتخذ القرار.</h1>
    <p class="desc">يرى التعارض قبل وقوعه، ويحلّه بأقل حركة ممكنة.</p>
  </div>
</div>
</body>
</html>
`;

/* ── العلامة اللفظية: مواصفة واحدة، ويُتحقَّق منها ──────────────────────────
 *
 * The name was hand-set in six places with five letter-spacings, four weights
 * and three typefaces. The tokens fixed that; this stops it happening again.
 *
 * Outlining the wordmark to paths was the other candidate, and it is the wrong
 * fix now. The only surface that could not load the font was the boot splash,
 * and the splash no longer carries the name at all — it carries the mark, which
 * is typeface-independent by construction. Outlining what remains would cost
 * selectable, searchable, user-scalable text to prevent a drift that a check
 * catches for free.
 */
const WORDMARK_SITES = [
  ["src/styles/03-shell.css", ".sidebar-brand strong"],
  ["src/styles/03-shell.css", ".ob-brand"],
  ["src/styles/04-screens.css", ".apex-login-brand strong"],
  ["src/styles/07-responsive.css", ".mobile-brand"],
  ["src/styles/10-journey.css", ".jr-mark>b"],
];

function ruleBlock(css, selector) {
  const at = css.indexOf(selector + "{");
  if (at < 0) return null;
  const close = css.indexOf("}", at);
  return close < 0 ? null : css.slice(at, close);
}

function auditWordmark() {
  const problems = [];
  for (const [file, selector] of WORDMARK_SITES) {
    const block = ruleBlock(readFileSync(file, "utf8"), selector);
    if (block === null) {
      problems.push(`${file}: لم يُعثر على القاعدة «${selector}»`);
      continue;
    }
    for (const [prop, tokenName] of [
      ["letter-spacing", "--brand-word-track"],
      ["font-weight", "--brand-word-weight"],
      ["font-family", "--brand-word-family"],
    ]) {
      const declared = block.match(new RegExp(`${prop}\\s*:\\s*([^;]+)`));
      if (!declared) {
        problems.push(`${file} «${selector}»: ينقصه ${prop}`);
      } else if (!declared[1].includes(tokenName)) {
        problems.push(
          `${file} «${selector}»: ${prop} مكتوب يدوياً (${declared[1].trim()}) بدل var(${tokenName})`,
        );
      }
    }
  }
  return problems;
}

/* ── التحقّق من صور PNG: بالبكسل، لا بالبايت ───────────────────────────────
 *
 * مقارنة البايتات كانت خاطئة هنا. الرسم يمرّ بمكتبة أصلية (skia) يختلف
 * ثنائيّها بين النظام والمعمار: darwin-arm64 محلياً و linux-x64 في CI. الرسم
 * نفسه يُنتج بايتات مختلفة، فكان البناء يسقط في CI بلا عيب حقيقي.
 *
 * فيُقاس ما يعني شيئاً: لون كل عمود في مركزه، ولون الأرضية في نقطتين خاليتين.
 * هذه القيم لا تتغيّر بتغيّر المُرمِّز، وتلتقط ما يهمّ فعلاً — لون مبدَّل، أو
 * هندسة منقولة، أو ملف استُبدل كلّياً.
 */
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

/** نقاط القياس في فضاء 512، مشتقّة من الهندسة نفسها لا مكتوبة يدوياً. */
const PROBES = [
  ...BARS.map(bar => ({
    x: bar.x + W / 2,
    y: bar.y + bar.h / 2,
    expect: bar.decided ? BRASS : JADE,
    what: `العمود عند x=${Math.round(bar.x)}`,
  })),
  { x: 256, y: 72, expect: GROUND, what: "الأرضية أعلى العلامة" },
  { x: 256, y: 440, expect: GROUND, what: "الأرضية أسفل العلامة" },
];

async function probePng(file, size) {
  const image = await loadImage(readFileSync(file));
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, size, size);
  const problems = [];
  for (const probe of PROBES) {
    const px = Math.round((probe.x / 512) * size);
    const py = Math.round((probe.y / 512) * size);
    const [r, g, b] = ctx.getImageData(px, py, 1, 1).data;
    const [er, eg, eb] = rgb(probe.expect);
    /* هامش ضيّق يستوعب اختلاف تنعيم الحواف بين بناءَي skia، ولا يستوعب
       لوناً مختلفاً: بين اليشم والنحاس عشرات الدرجات. */
    if (Math.abs(r - er) > 6 || Math.abs(g - eg) > 6 || Math.abs(b - eb) > 6) {
      problems.push(
        `${file}: ${probe.what} لونه rgb(${r},${g},${b}) والمتوقّع ${probe.expect}`,
      );
    }
  }
  return problems;
}

/* ── الكتابة أو التحقّق ───────────────────────────────────────────────────── */

/** نصوص مُولَّدة: مقارنتها بالبايت صحيحة لأنها حتمية على كل نظام. */
const TEXT_ASSETS = [
  ["public/schedule-icon.svg", () => Buffer.from(iconSvg)],
  ["public/schedule-maskable.svg", () => Buffer.from(maskableSvg)],
  ["scripts/social-card.html", () => Buffer.from(cardHtml)],
];

/** صور: تُقاس بالبكسل. */
const PNG_ASSETS = [
  ["public/schedule-icon-192.png", 192, false],
  ["public/schedule-icon-512.png", 512, false],
  ["public/schedule-maskable-512.png", 512, true],
];

const ASSETS = [
  ...TEXT_ASSETS,
  ...PNG_ASSETS.map(([file, size, masked]) => [file, () => drawIcon(size, masked)]),
];

const checking = process.argv.includes("--check");

if (checking) {
  const problems = auditWordmark();
  for (const [file, build] of TEXT_ASSETS) {
    let onDisk;
    try { onDisk = readFileSync(file); } catch { problems.push(`${file}: مفقود`); continue; }
    if (!onDisk.equals(build())) {
      problems.push(`${file}: يخالف ما يولّده هذا السكربت — حُرِّر يدوياً أو تغيّر لون العلامة`);
    }
  }
  for (const [file, size] of PNG_ASSETS) {
    try { readFileSync(file); } catch { problems.push(`${file}: مفقود`); continue; }
    problems.push(...await probePng(file, size));
  }
  if (problems.length) {
    console.error("فشل تدقيق العلامة:");
    for (const line of problems) console.error(`- ${line}`);
    console.error("\nالإصلاح: node scripts/render-brand.mjs (ثم أعد رسم بطاقة المشاركة بالمتصفح)");
    process.exit(1);
  }
  console.log(
    `العلامة سليمة: ${ASSETS.length} أصلاً مطابقاً للمصدر، ` +
    `و${WORDMARK_SITES.length} مواضع للاسم كلّها على مواصفة واحدة.`,
  );
} else {
  for (const [file, build] of ASSETS) writeFileSync(file, build());
  console.log(`ألوان العلامة من ${FOUNDATION}:  ${JADE} · ${BRASS} · ${GROUND}`);
  for (const [file] of ASSETS) console.log(`  ${file}`);
  console.log("  ملاحظة: بطاقة المشاركة تُرسَم من social-card.html بمتصفح — انظر الترويسة.");
}
