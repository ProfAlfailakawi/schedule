/**
 * ── الجرسُ لا يغطّي ✕ أيِّ نافذة، ولا طرفَ أيِّ صفحة ───────────────────────────
 *
 * «شوف ال X مع الجرس .... انتبه في كل الموقع كامل». الجرسُ يطفو في الزاوية اليسرى
 * العليا فوق طبقات الصفحة كلّها (2750)، وهناك يضع كلُّ حوارٍ في العربية زرَّ إغلاقه:
 * كان يجلس على ✕ «نقل الجدول»، وعلى زرّ إغلاق «استعارة القاعات»، وعلى ✕ درج الإضافة
 * والتعديل، وعلى ✕ قائمة الهاتف.
 *
 * ١) القاعدة (03-shell.css): ما دامت نافذةٌ مفتوحةً فوق الصفحة يتنحّى الجرسُ ولوحتُه
 *    وإشعارُه العائم — بـ:has() حيث يعرفها المحرّك، وبعلامةٍ على <html> حيث لا يعرفها،
 *    وبعلامة القائمة على الهاتف. والمُحدِّد واحد: OPEN_DIALOG في dialogLayer.ts.
 * ٢) كلُّ حوارٍ (role="dialog" أو "alertdialog") يُعلن aria-modal — إلا لوحةَ الجرس.
 * ٣) كلُّ طبقةٍ ثابتة (position:fixed) قد تبلغ زاويةَ الجرس تُجيب القاعدة: حوارٌ، أو
 *    داخلَ حوار، أو خلفيةٌ يليها حوار — وإلا فهي مذكورةٌ هنا بسببٍ مكتوب.
 * ٤) سطح المكتب: الصفحة تحجز للجرس ممرّاً بقياسه هو، لا برقمٍ منسوخ.
 * ٥) الاختبار يعضّ: يُعاد كلُّ خطأٍ من هذه على نسخةٍ في الذاكرة، فيُمسَك.
 */
import fs from "fs";
import path from "path";
import ts from "typescript";
import { DIALOG_OPEN_FLAG, OPEN_DIALOG } from "../src/utils/dialogLayer";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};
const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

/* ── قراءة CSS ────────────────────────────────────────────────────────────── */
type Rule = { file: string; line: number; order: number; selector: string; decls: Array<[string, string]>; media: string[] };

/** يقسم على فاصلٍ خارج الأقواس: «a,b:is(c,d)» ← «a» و«b:is(c,d)». */
function splitTop(text: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (depth === 0 && (sep === " " ? /\s/.test(ch) : ch === sep)) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(part => part.trim()).filter(Boolean);
}
function matchBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  return text.length - 1;
}
let ruleOrder = 0;
function parseCss(file: string, text: string): Rule[] {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, " "));
  const breaks: number[] = [];
  for (let i = 0; i < clean.length; i++) if (clean[i] === "\n") breaks.push(i);
  const lineAt = (index: number) => {
    let low = 0, high = breaks.length;
    while (low < high) { const mid = (low + high) >> 1; if (breaks[mid] < index) low = mid + 1; else high = mid; }
    return low + 1;
  };
  const rules: Rule[] = [];
  const walk = (from: number, to: number, media: string[]) => {
    let head = from;
    for (let i = from; i < to; i++) {
      const ch = clean[i];
      if (ch === ";" || ch === "}") { head = i + 1; continue; }
      if (ch !== "{") continue;
      const prelude = clean.slice(head, i).trim();
      const close = matchBrace(clean, i);
      if (prelude.startsWith("@")) {
        /* الطبقاتُ الشرطية تُقرأ بما فيها؛ وما سواها (keyframes, font-face) ليس قواعدَ عناصر. */
        if (/^@(media|supports|container|layer)\b/.test(prelude)) walk(i + 1, close, [...media, prelude.replace(/\s+/g, " ")]);
      } else {
        const start = head + (clean.slice(head, i).length - clean.slice(head, i).trimStart().length);
        const decls = splitTop(clean.slice(i + 1, close), ";").map(decl => {
          const at = decl.indexOf(":");
          return [decl.slice(0, at).trim().toLowerCase(), decl.slice(at + 1).trim()] as [string, string];
        }).filter(([prop]) => Boolean(prop));
        rules.push({ file, line: lineAt(start), order: ruleOrder++, selector: prelude.replace(/\s+/g, " "), decls, media });
      }
      i = close;
      head = close + 1;
    }
  };
  walk(0, clean.length, []);
  return rules;
}
const normSel = (selector: string) => selector.replace(/\s+/g, " ").replace(/\s*,\s*/g, ",").trim();
const lastDecl = (rule: Rule | undefined, prop: string) => rule ? [...rule.decls].reverse().find(([name]) => name === prop)?.[1] : undefined;
const hides = (rule: Rule) => /^hidden\b/.test(lastDecl(rule, "visibility") || "");

/** أصنافُ الجزء الأخير من المُحدِّد، بلا ما في داخل :has()/:not(). */
function lastCompound(selector: string): string {
  let depth = 0, cut = -1;
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    else if (depth === 0 && /[\s>+~]/.test(ch)) cut = i;
  }
  return selector.slice(cut + 1);
}
function compoundClasses(compound: string): string[] {
  let depth = 0, flat = "";
  for (const ch of compound) {
    if (ch === "(" || ch === "[") { depth++; continue; }
    if (ch === ")" || ch === "]") { depth--; continue; }
    if (depth === 0) flat += ch;
  }
  return [...flat.matchAll(/\.([A-Za-z_][\w-]*)/g)].map(match => match[1]).sort();
}
const pseudoElement = (selector: string) => /::[a-z-]+/.test(selector.replace(/\([^)]*\)/g, ""));

/** أين تُثبَّت الطبقة؟ بالعربية: بدايةُ السطر يمين، ونهايتُه يسار — حيث الجرس. */
function anchors(decls: Array<[string, string]>) {
  const side: Record<"top" | "right" | "bottom" | "left", string | undefined> = { top: undefined, right: undefined, bottom: undefined, left: undefined };
  let any = false;
  for (const [prop, raw] of decls) {
    const value = raw.replace(/!important/g, "").trim();
    const parts = splitTop(value, " ");
    const set = (key: keyof typeof side, v: string | undefined) => { side[key] = v; any = true; };
    switch (prop) {
      case "inset": { const [t, r = t, b = t, l = r] = parts; set("top", t); set("right", r); set("bottom", b); set("left", l); break; }
      case "inset-block": { const [s, e = s] = parts; set("top", s); set("bottom", e); break; }
      case "inset-inline": { const [s, e = s] = parts; set("right", s); set("left", e); break; }
      case "inset-block-start": case "top": set("top", value); break;
      case "inset-block-end": case "bottom": set("bottom", value); break;
      case "inset-inline-start": case "right": set("right", value); break;
      case "inset-inline-end": case "left": set("left", value); break;
    }
  }
  const pinned = (v?: string) => v !== undefined && v !== "auto";
  return { any, top: pinned(side.top), bottom: pinned(side.bottom), left: pinned(side.left), right: pinned(side.right) };
}

/* ترتيبُ الأوراق كما يرتّبها المتصفّح: ما يستورده index.css بترتيبه، ثم قواعده هو، ثم المؤجَّلة. */
const imports = (file: string) => [...read(file).matchAll(/@import\s+"\.\/([^"]+)";/g)].map(match => path.posix.join(path.posix.dirname(file), match[1]));
const cssOrder = [...imports("src/index.css"), "src/index.css", ...imports("src/styles/deferred.css")];
const cssFiles: Array<[string, string]> = cssOrder.map(file => [file, read(file)]);
check(cssOrder.includes("src/styles/03-shell.css") && cssOrder.includes("src/styles/07-responsive.css") && cssOrder.length >= 13,
  `أوراقُ الأنماط كلُّها مقروءة بترتيب التحميل (${cssOrder.length})`);
const allRules = cssFiles.flatMap(([file, text]) => parseCss(file, text));
check(allRules.length > 2000 && !allRules.some(rule => rule.decls.some(([prop]) => prop.includes("{"))),
  `قارئ CSS يقرأ القواعد كاملةً بلا تداخل (${allRules.length} قاعدة)`);

/* ── قراءة JSX ────────────────────────────────────────────────────────────── */
type El = {
  file: string; line: number; tag: string; classes: Set<string>; dialog: boolean; declares: boolean; control: boolean;
  node: ts.JsxElement | ts.JsxSelfClosingElement; parent?: El; children: El[]; sibling: El[];
};
function literalTexts(node: ts.Node, out: string[]) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) { out.push(node.text); return; }
  if (ts.isTemplateExpression(node)) {
    out.push(node.head.text);
    for (const span of node.templateSpans) { literalTexts(span.expression, out); out.push(span.literal.text); }
    return;
  }
  ts.forEachChild(node, child => literalTexts(child, out));
}
function attribute(opening: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return opening.attributes.properties.find((prop): prop is ts.JsxAttribute => ts.isJsxAttribute(prop) && prop.name.getText() === name);
}
function indexJsx(file: string, text: string): El[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const els: El[] = [];
  const byNode = new Map<ts.Node, El>();
  const visit = (node: ts.Node, parent: El | undefined) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const classAttr = attribute(opening, "className");
      const tokens: string[] = [];
      if (classAttr?.initializer) literalTexts(classAttr.initializer, tokens);
      const roleTexts: string[] = [];
      const roleAttr = attribute(opening, "role");
      if (roleAttr?.initializer) literalTexts(roleAttr.initializer, roleTexts);
      const tag = opening.tagName.getText(source);
      const el: El = {
        file, line: source.getLineAndCharacterOfPosition(opening.getStart(source)).line + 1,
        tag,
        classes: new Set(tokens.join(" ").split(/\s+/).filter(Boolean)),
        dialog: roleTexts.some(role => role === "dialog" || role === "alertdialog"),
        declares: Boolean(attribute(opening, "aria-modal")),
        /* زرٌّ أو حقلٌ أو رابط، أو ما يُضغط: ما قد يغطّيه الجرس فيُفقد. */
        control: /^(button|a|input|select|textarea)$/.test(tag) || /Button$/.test(tag) || roleTexts.includes("button")
          || ["onClick", "onMouseDown", "onPointerDown"].some(name => Boolean(attribute(opening, name))),
        node, parent, children: [], sibling: [],
      };
      parent?.children.push(el);
      els.push(el);
      byNode.set(node, el);
      ts.forEachChild(node, child => visit(child, el));
      return;
    }
    ts.forEachChild(node, child => visit(child, parent));
  };
  visit(source, undefined);
  /* الجارُ التالي: خلفيةٌ بلا أبناء يليها حوارُها في القائمة نفسها (<>خلفية/حوار</>). */
  for (const el of els) {
    let slot: ts.Node = el.node;
    while (slot.parent && !ts.isJsxElement(slot.parent) && !ts.isJsxFragment(slot.parent) && !ts.isSourceFile(slot.parent)) slot = slot.parent;
    const holder = slot.parent;
    if (!holder || !(ts.isJsxElement(holder) || ts.isJsxFragment(holder))) continue;
    const list = holder.children;
    const at = list.indexOf(slot as ts.JsxChild);
    if (at < 0) continue;
    const next = list.slice(at + 1).find(child => !(ts.isJsxText(child) && !child.text.trim()));
    if (!next) continue;
    el.sibling = els.filter(other => other.parent === el.parent && other.node.pos >= next.pos && other.node.end <= next.end);
  }
  return els;
}
const descendants = (el: El): El[] => el.children.flatMap(child => [child, ...descendants(child)]);
const ancestors = (el: El): El[] => (el.parent ? [el.parent, ...ancestors(el.parent)] : []);
/** طبقةٌ تُجيب القاعدة: هي حوارٌ معلَن، أو فيها حوار، أو هي داخل حوار، أو خلفيةٌ يليها حوار. */
const answered = (el: El) => el.declares
  || descendants(el).some(child => child.declares)
  || ancestors(el).some(parent => parent.declares)
  || (el.children.length === 0 && el.sibling.some(next => next.declares || descendants(next).some(child => child.declares)));
/** pointer-events:none على الطبقة لا يكفي وحده: أبناؤها قد يعيدون المؤشر (كرسائل الطبقة العليا وأزرارها). */
const holdsControl = (el: El) => el.control || descendants(el).some(child => child.control);

function walkSources(dir: string, test: (name: string) => boolean): string[] {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const rel = path.posix.join(dir, entry.name);
    return entry.isDirectory() ? walkSources(rel, test) : test(entry.name) ? [rel] : [];
  });
}
const tsxFiles = walkSources("src", name => name.endsWith(".tsx"));
const scriptTexts = new Map(walkSources("src", name => /\.(tsx?|jsx?)$/.test(name)).map(file => [file, read(file)]));
/* الشجرةُ تُبنى مرّةً لكل نصّ: نسخُ الاختبار (٥) تغيّر ملفاً واحداً وتُبقي الباقي. */
const jsxCache = new Map<string, { text: string; els: El[] }>();
const indexAll = (texts: Map<string, string>) => [...texts].filter(([file]) => file.endsWith(".tsx")).flatMap(([file, text]) => {
  const cached = jsxCache.get(file);
  if (cached?.text === text) return cached.els;
  const built = indexJsx(file, text);
  if (!cached) jsxCache.set(file, { text, els: built });
  return built;
});
const els = indexAll(scriptTexts);
check(tsxFiles.length > 40 && els.length > 5000, `شجرةُ JSX مقروءة من ${tsxFiles.length} ملفاً (${els.length} عنصراً)`);

/* ── ١) القاعدة ──────────────────────────────────────────────────────────── */
const FAMILY = [".notify-bell", ".notify-panel", ".notify-toast"];
const flagAttr = `data-${DIALOG_OPEN_FLAG.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`;
function yieldRuleProblems(rules: Rule[]): string[] {
  const problems: string[] = [];
  const base = rules.filter(rule => rule.file.endsWith("03-shell.css") && rule.media.length === 0);
  if (!base.some(rule => normSel(rule.selector) === `body:has(${OPEN_DIALOG}) :is(${FAMILY.join(",")})` && hides(rule))) problems.push(":has()");
  if (!base.some(rule => normSel(rule.selector) === FAMILY.map(member => `html[${flagAttr}] ${member}`).join(",") && hides(rule))) problems.push(flagAttr);
  if (!rules.some(rule => rule.file.endsWith("03-shell.css") && rule.media.length === 1 && /^@media screen and \(max-width:\s*1119px\)$/.test(rule.media[0])
    && normSel(rule.selector) === FAMILY.map(member => `html[data-rail="open"] ${member}`).join(",") && hides(rule))) problems.push("data-rail");
  return problems;
}
check(yieldRuleProblems(allRules).length === 0,
  `03-shell.css: الجرسُ ولوحتُه وإشعارُه يتنحّون لكل حوارٍ مفتوح — body:has(${OPEN_DIALOG}) — في قاعدةٍ وحدها لا تُسقطها المحرّكات القديمة معها غيرَها`);
check(!yieldRuleProblems(allRules).includes(flagAttr), `…وحيث لا يعرف المحرّكُ :has() فالعلامةُ ${flagAttr} على <html> تفعل الشيءَ نفسه`);
check(!yieldRuleProblems(allRules).includes("data-rail"), "…وعلى الهاتف يتنحّون لقائمة التنقّل (html[data-rail=\"open\"])، ودرجُها 86vw يبلغ الزاوية");

const layerSource = read("src/utils/dialogLayer.ts");
const bellSource = read("src/components/NotificationCenter.tsx");
const appSource = read("src/App.tsx");
check(OPEN_DIALOG === "[aria-modal]:not([hidden])", "المُحدِّد: كلُّ حوارٍ معلَنٍ ظاهر — لا role التي تحملها مئاتُ العناصر، فلا يوقظ القاعدةَ إلا حوار");
check(/CSS\.supports\("selector\(:has\(\*\)\)"\)\) return \(\) => \{\};/.test(layerSource)
  && /document\.querySelector\(OPEN_DIALOG\)\) root\.dataset\[DIALOG_OPEN_FLAG\] = "true";\s*else delete root\.dataset\[DIALOG_OPEN_FLAG\];/.test(layerSource)
  && /attributeFilter: \["aria-modal", "hidden"\]/.test(layerSource),
  "البديل: لا يعمل حيث يعرف المحرّكُ :has()، وحيث لا يعرفه يراقب الحوارات بالمُحدِّد نفسه ويكتب العلامة");
check(/import \{ followOpenDialogs \} from "\.\.\/utils\/dialogLayer";/.test(bellSource) && /useEffect\(\(\) => followOpenDialogs\(\), \[\]\);/.test(bellSource),
  "الجرسُ نفسه يُشغّل البديل ويطفئه مع نفسه");
check(/document\.documentElement\.dataset\.rail = sidebarOpen \? "open" : "closed";/.test(appSource),
  "علامةُ القائمة تكتبها حالةُ القائمة نفسها في App.tsx");
check(allRules.some(rule => normSel(rule.selector) === 'html[data-schedule-workspace="focus"] .notify-bell,html[data-schedule-workspace="presentation"] .notify-bell' && lastDecl(rule, "display") === "none"),
  "وضعا التركيز والعرض يخفيان الجرس — فطبقاتُهما لا تُسأل هنا");

/* ── ٢) كلُّ حوارٍ يُعلن ──────────────────────────────────────────────────── */
const undeclared = (list: El[]) => list.filter(el => el.dialog && !el.declares && !el.classes.has("notify-panel"));
const dialogs = els.filter(el => el.dialog);
check(dialogs.length >= 50, `الحوارات في البرنامج مقروءة (${dialogs.length})`);
const silent = undeclared(els);
check(silent.length === 0, `كلُّ حوارٍ يُعلن aria-modal — "true" إن ملك الشاشة، و"false" إن كان نافذةً بجوار ما فتحها${silent.length ? `: ${silent.map(el => `${el.file}:${el.line}`).join("، ")}` : ""}`);
const panel = els.filter(el => el.classes.has("notify-panel"));
check(panel.length === 1 && panel[0].dialog && !panel[0].declares, "لوحةُ الجرس وحدها لا تُعلن — لو أعلنت لتنحّى الجرسُ الذي يغلقها");

/* ── ٣) كلُّ طبقةٍ ثابتة تبلغ الزاوية تُجيب القاعدة ───────────────────────── */
/* طبقاتٌ ثابتة لا تُعلن، ولكلٍّ سببٌ يمنع أن يغطّي الجرسُ زرّاً فيها. المفتاح أصنافُ
   الجزء الأخير من المُحدِّد. ومدخلٌ لم تعد طبقتُه موجودة يُفشل الاختبار. */
const EXEMPT: Record<string, string> = {
  "toast-layer": "طبقةُ الرسائل على 9999: فوق الجرس، تغطّيه ولا يغطّيها",
  "render-recovery-quiet": "غطاءُ استعادة العرض على 9999: فوق الجرس، ولا زرَّ فيه",
  "render-recovery-shell": "بطاقةُ استعادة العرض وأزرارُها على 9999: فوق الجرس، تغطّيه ولا يغطّيها",
  "sidebar": "القائمة: شريطٌ على اليمين في سطح المكتب، ودرجُ الهاتف يتنحّى له الجرسُ بعلامة html[data-rail]",
  "sidebar-backdrop": "خلفيةُ قائمة الهاتف: يتنحّى لها الجرسُ بعلامة html[data-rail]",
  "context-loading": "غشاءٌ عابر وبياناتُ الموعد تُجلب، لا زرَّ فيه",
  "schedule-focus-exit": "لا يُرسم إلا في وضع التركيز، والجرسُ فيه مخفيّ",
  "apex-login": "شاشةُ الدخول: لا جرسَ قبل الدخول",
  "install-modal-backdrop": "على شاشة الدخول وحدها، وحوارُها المعرَّف في متغيّر يُعلن aria-modal=\"true\"",
};
type LayerReport = { problems: string[]; answered: string[]; exempt: string[]; bottom: string[]; inert: string[]; dead: string[]; stale: string[] };
function layerReport(rules: Rule[], list: El[], texts: Map<string, string>, exempt: Record<string, string>): LayerReport {
  const report: LayerReport = { problems: [], answered: [], exempt: [], bottom: [], inert: [], dead: [], stale: [] };
  const keyOf = (selector: string) => compoundClasses(lastCompound(selector.replace(/\s+/g, " "))).join(".");
  /* موضعُ كل طبقةٍ في قواعدها الأصل (بلا شرط media) — لمن يعيد position:fixed وحدها. */
  const baseByKey = new Map<string, Rule[]>();
  for (const rule of rules) {
    if (rule.media.length) continue;
    for (const selector of splitTop(rule.selector, ",")) {
      const key = keyOf(selector);
      if (key) baseByKey.set(key, [...(baseByKey.get(key) || []), rule]);
    }
  }
  const seen = new Set<string>();
  for (const rule of rules) {
    if (rule.media.some(media => /^@media print\b/.test(media))) continue;
    if (!/^fixed\b/.test(lastDecl(rule, "position") || "")) continue;
    for (const raw of splitTop(rule.selector, ",")) {
      const selector = raw.replace(/\s+/g, " ");
      if (pseudoElement(selector)) continue; // ما يُرسم بـ::before/::after لا يحمل زرّاً
      if (/html\[data-schedule-workspace="(focus|presentation)"\]/.test(selector)) continue;
      const classes = compoundClasses(lastCompound(selector));
      const key = classes.join(".");
      if (!key || seen.has(key) || classes.some(name => /^notify-(bell|panel|toast)$/.test(name))) continue;
      seen.add(key);
      const inert = /^none\b/.test(lastDecl(rule, "pointer-events") || "");
      let pin = anchors(rule.decls);
      /* قاعدةٌ تعيد position:fixed بلا موضع: الموضعُ في قاعدتها الأصل. */
      if (!pin.any) pin = (baseByKey.get(key) || []).filter(other => other !== rule).map(other => anchors(other.decls)).find(found => found.any) || pin;
      if (pin.bottom && !pin.top) { report.bottom.push(key); continue; }
      const carriers = list.filter(el => classes.every(name => el.classes.has(name)));
      const where = `${rule.file.replace("src/styles/", "")}:${rule.line} .${key}`;
      if (!carriers.length) {
        /* اسمُ الصنف حرفيّاً داخل التعبير: كلُّ محرفٍ خاصّ يُهرَّب، لا الشَّرطة وحدها (CodeQL). */
        const literal = classes[0].replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
        const pattern = new RegExp(`(^|[^\\w-])${literal}([^\\w-]|$)`);
        const named = [...texts].some(([, text]) => pattern.test(text));
        if (!named) { report.dead.push(key); continue; }
        if (exempt[key]) { report.exempt.push(key); continue; }
        report.problems.push(`${where} — تُنشأ خارج JSX ولا تُعلن`);
        continue;
      }
      const loose = carriers.filter(el => !answered(el));
      if (!loose.length) { report.answered.push(key); continue; }
      /* لا تأخذ المؤشر ولا تحمل زرّاً: غشاءٌ أو رسمٌ عابر، لا شيءَ فيه يُفقد تحت الجرس. */
      if (inert && !loose.some(holdsControl)) { report.inert.push(key); continue; }
      if (exempt[key]) { report.exempt.push(key); continue; }
      report.problems.push(`${where} ← ${loose.map(el => `${el.file.replace("src/components/", "")}:${el.line}`).join("، ")}`);
    }
  }
  report.stale = Object.keys(exempt).filter(key => !report.exempt.includes(key));
  return report;
}
const layers = layerReport(allRules, els, scriptTexts, EXEMPT);
check(layers.answered.length >= 40, `طبقاتٌ ثابتة تُجيب القاعدة بحوارٍ معلَن — فيها أو حولها أو بعدها (${layers.answered.length})`);
check(layers.problems.length === 0, `كلُّ طبقةٍ ثابتة قد تبلغ زاويةَ الجرس تُجيب القاعدة أو لها سببٌ مكتوب${layers.problems.length ? `:\n    ${layers.problems.join("\n    ")}` : ""}`);
for (const key of layers.exempt) check(true, `مستثناة .${key}: ${EXEMPT[key]}`);
check(layers.stale.length === 0, `لا استثناءَ لطبقةٍ لم تعد موجودة${layers.stale.length ? `: ${layers.stale.join("، ")}` : ""}`);
console.log(`  تُجيب القاعدة: ${layers.answered.join("، ")}`);
console.log(`  على الحافة السفلى، بعيداً عن الزاوية: ${layers.bottom.join("، ")}`);
console.log(`  لا تأخذ المؤشر ولا تحمل زرّاً: ${layers.inert.join("، ")}`);
console.log(`  في CSS ولا يرسمها شيء: ${layers.dead.join("، ") || "—"}`);
for (const [key, name] of [["hall-barter-board.is-open", "«استعارة القاعات» مفتوحةً"], ["transfer-backdrop", "«نقل الجدول»"], ["catalog-form-drawer", "درجُ الإضافة والتعديل"],
  ["schedule-context-backdrop", "سياقُ الموعد"], ["living-overlay", "مركزُ القرار"], ["intel-drawer-backdrop", "درجُ الذكاء"], ["query-detail-panel", "تفاصيلُ الاستعلام"],
  ["smart-guide", "المرشد"], ["move-refusal", "رسالةُ «تعذّر النقل»"]] as const) {
  check(layers.answered.includes(key), `${name} (.${key}) يُجيب القاعدة`);
}

/* ── ٤) ممرُّ الجرس على سطح المكتب ───────────────────────────────────────── */
const shellBase = allRules.filter(rule => rule.file.endsWith("03-shell.css") && rule.media.length === 0);
const tokens = shellBase.find(rule => rule.selector === ":root" && rule.decls.some(([prop]) => prop === "--notify-lane"));
const token = (name: string) => lastDecl(tokens, name);
const bell = shellBase.find(rule => normSel(rule.selector) === ".notify-bell" && lastDecl(rule, "position") === "fixed");
check(lastDecl(bell, "top") === "var(--notify-top)" && lastDecl(bell, "inset-inline-end") === "var(--notify-edge)"
  && lastDecl(bell, "width") === "var(--notify-size)" && lastDecl(bell, "height") === "var(--notify-size)",
  "الجرسُ يقرأ موضعَه وقياسَه من الرموز التي يقرؤها ممرُّه — رقمٌ واحدٌ لكلٍّ منهما");
check(token("--notify-lane") === "calc(var(--notify-edge) + var(--notify-size) + var(--s3))", "الممرّ = بُعدُ الجرس عن الحافة + قياسُه + فراغ");
const px = (value?: string) => Number(/^(\d+(?:\.\d+)?)px$/.exec(value || "")?.[1] ?? NaN);
const s3 = px(lastDecl(allRules.find(rule => rule.file.endsWith("01-foundation.css") && rule.selector === ":root" && rule.decls.some(([prop]) => prop === "--s3")), "--s3"));
const reach = px(token("--notify-edge")) + px(token("--notify-size"));
check(Number.isFinite(reach) && s3 > 0, `الجرسُ يبلغ ${reach}px من الحافة، والصفحةُ تبدأ بعد ${reach + s3}px على الأقل`);
const lane = allRules.find(rule => rule.file.endsWith("03-shell.css") && rule.media.length === 1 && /^@media screen and \(min-width:\s*1120px\)$/.test(rule.media[0])
  && normSel(rule.selector) === ".app-main" && lastDecl(rule, "padding-inline-end") === "max(var(--gutter),var(--notify-lane))");
const mainBase = shellBase.find(rule => normSel(rule.selector) === ".app-main" && Boolean(lastDecl(rule, "padding")));
check(Boolean(lane) && Boolean(mainBase) && lane!.order > mainBase!.order, "سطح المكتب: الصفحةُ تحجز ممرَّ الجرس في حشوتها جهةَ نهاية السطر، بعد حشوتها الأصل");
/* ما يأتي بعده في الترتيب ويكتب حشوةَ الصفحة على سطح المكتب يمحو الممرَّ بصمت. */
const desktop = (rule: Rule) => !rule.media.some(media => /max-width|print/.test(media));
const undo = lane ? allRules.filter(rule => rule.order > lane.order && desktop(rule)
  && splitTop(rule.selector, ",").some(sel => lastCompound(sel.replace(/\s+/g, " ")) === ".app-main" && !/data-schedule-workspace/.test(sel))
  && rule.decls.some(([prop]) => /^padding(-inline(-end)?|-left)?$/.test(prop))) : [];
check(lane && undo.length === 0, `لا قاعدةَ لاحقة تمحو الممرّ على سطح المكتب${undo.length ? `: ${undo.map(rule => `${rule.file}:${rule.line}`).join("، ")}` : ""}`);

/* ── ٥) الاختبار يعضّ ─────────────────────────────────────────────────────── */
{
  const shellPath = "src/styles/03-shell.css";
  const withoutHas = cssFiles.map(([file, text]) => [file, file === shellPath ? text.replace(/body:has\(\[aria-modal\][^\n]*\n/, "") : text] as [string, string]);
  check(yieldRuleProblems(withoutHas.flatMap(([file, text]) => parseCss(file, text))).includes(":has()"), "يعضّ: حذفُ قاعدة :has() يُمسَك");
  const merged = cssFiles.map(([file, text]) => [file, file === shellPath ? text.replace(
    /body:has\(\[aria-modal\]:not\(\[hidden\]\)\) :is\(\.notify-bell,\.notify-panel,\.notify-toast\)\{visibility:hidden\}\n[\s\S]*?html\[data-dialog-open\] \.notify-toast\{visibility:hidden\}/,
    "body:has([aria-modal]:not([hidden])) :is(.notify-bell,.notify-panel,.notify-toast),\nhtml[data-dialog-open] .notify-bell,\nhtml[data-dialog-open] .notify-panel,\nhtml[data-dialog-open] .notify-toast{visibility:hidden}") : text] as [string, string]);
  check(yieldRuleProblems(merged.flatMap(([file, text]) => parseCss(file, text))).length > 0, "يعضّ: دمجُ :has() مع البديل في قاعدةٍ واحدة (فتُسقطهما المحرّكاتُ القديمة معاً) يُمسَك");

  const probe = new Map(scriptTexts);
  probe.set("src/components/__BellProbe.tsx", `export const Probe = () => <div className="bell-probe-sheet" role="dialog" aria-label="نافذة"><button>✕</button></div>;`);
  check(undeclared(indexAll(probe)).some(el => el.file.endsWith("__BellProbe.tsx")), "يعضّ: حوارٌ جديد لا يُعلن aria-modal يُمسَك");

  const probeCss = [...cssFiles, ["src/styles/__probe.css", ".bell-probe-backdrop{position:fixed;inset:0;z-index:900}"] as [string, string]];
  const probeRules = probeCss.flatMap(([file, text]) => parseCss(file, text));
  const loose = new Map(scriptTexts);
  loose.set("src/components/__BellProbe.tsx", `export const Probe = () => <div className="bell-probe-backdrop"><section><button aria-label="إغلاق">✕</button></section></div>;`);
  check(layerReport(probeRules, indexAll(loose), loose, EXEMPT).problems.some(problem => problem.includes("bell-probe-backdrop")), "يعضّ: طبقةٌ ثابتة جديدة بلا حوارٍ معلَن يُمسَك");
  const fixed = new Map(scriptTexts);
  fixed.set("src/components/__BellProbe.tsx", `export const Probe = () => <div className="bell-probe-backdrop"><section role="dialog" aria-modal="true" aria-label="نافذة"><button aria-label="إغلاق">✕</button></section></div>;`);
  check(layerReport(probeRules, indexAll(fixed), fixed, EXEMPT).answered.includes("bell-probe-backdrop"), "…ومتى أعلن حوارُها أجابت القاعدة");
  const trayRules = [...cssFiles, ["src/styles/__probe.css", ".bell-probe-tray{position:fixed;top:0;inset-inline:0;pointer-events:none}"] as [string, string]]
    .flatMap(([file, text]) => parseCss(file, text));
  const tray = new Map(scriptTexts);
  tray.set("src/components/__BellProbe.tsx", `export const Probe = () => <div className="bell-probe-tray"><p>وصل</p><button aria-label="إغلاق">✕</button></div>;`);
  check(layerReport(trayRules, indexAll(tray), tray, EXEMPT).problems.some(problem => problem.includes("bell-probe-tray")),
    "يعضّ: طبقةٌ «لا تأخذ المؤشر» وفيها زرٌّ يستعيده تُمسَك");

  const barterFile = "src/components/HallBarterBoard.tsx";
  const before = new Map(scriptTexts);
  before.set(barterFile, before.get(barterFile)!.replace(' role={open ? "dialog" : undefined} aria-modal={open ? "true" : undefined}', ""));
  check(before.get(barterFile) !== scriptTexts.get(barterFile)
    && layerReport(allRules, indexAll(before), before, EXEMPT).problems.some(problem => problem.includes("hall-barter-board.is-open")),
    "يعضّ: «استعارة القاعات» كما كانت (قسمٌ بلا إعلان) تُمسَك");

  const noLane = cssFiles.map(([file, text]) => [file, file === shellPath ? `${text}\n@media screen and (min-width:1120px){.app-main{padding:var(--s7) var(--gutter)}}` : text] as [string, string]);
  const noLaneRules = noLane.flatMap(([file, text]) => parseCss(file, text));
  const laneAgain = noLaneRules.find(rule => rule.file === shellPath && normSel(rule.selector) === ".app-main" && lastDecl(rule, "padding-inline-end") === "max(var(--gutter),var(--notify-lane))");
  check(Boolean(laneAgain) && noLaneRules.some(rule => rule.order > laneAgain!.order && desktop(rule) && normSel(rule.selector) === ".app-main" && Boolean(lastDecl(rule, "padding"))),
    "يعضّ: قاعدةٌ لاحقة تمحو الممرّ تُمسَك");
}

console.log(`\nNotify bell yield audit: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
