/**
 * ── حارسُ العدد والمعدود ─────────────────────────────────────────────────────
 *
 * The rule lives in src/utils/arabicCount.ts: «موعد واحد»، «موعدان»، «٣ مواعيد»،
 * «١١ موعداً»، «١٠٠ موعد». Every count in the product must go through
 * countOf(n, AR.x) — or nounFor(n, AR.x) when the number is displayed apart.
 *
 * The defect this guards against is the rule spelt a second time, by hand, in
 * one fixed form: `${days} يوماً` is right for 11 and wrong for 1, 2, 3–10 and
 * 100. So this is STRUCTURAL: it scans the source (server.ts, including the
 * public pages' inline JavaScript, and src/**) for an interpolated value —
 * `${…}`, a JSX `{…}`, or a `'+x+'` concatenation — immediately followed by a
 * counted noun in any of its forms. A number written into the text by hand is
 * already inflected; an interpolated one cannot be.
 *
 * The allowlist is for noun-FIRST names that merely sit after an
 * interpolation — «الأحد يوم محجوز», «12/3 قاعة القسم» — not counts. Each
 * entry says why. A new entry needs the same honesty.
 */
import fs from "fs";
import path from "path";
import { AR, countOf } from "../src/utils/arabicCount";

let passed = 0, failed = 0;
const check = (ok: boolean, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};

const ROOT = process.cwd();

/* Every inflected form of every counted noun in the dictionary. The agreement
 * forms (verbs/adjectives, keys ending in Verb/Adj) are not nouns. The dual is
 * never preceded by a numeral, so it is left out. */
const forms = new Set<string>();
for (const [key, noun] of Object.entries(AR)) {
  if (/(Verb|Adj)$/.test(key)) continue;
  for (const form of [noun.one, noun.few, noun.many]) forms.add(form);
}
// Nouns counted in this product that are not (yet) needed in AR as whole
// entries but must still never follow a raw number.
for (const extra of ["موعدا", "طلبة"]) forms.add(extra);
/* Harakat are not letters: «صفّاً» is «صفا» to the matcher, on both sides. */
const bare = (text: string) => text.replace(/[\u064B-\u0652\u0640]/g, "");
const nounAlternation = [...new Set([...forms].map(bare))].sort((a, b) => b.length - a.length).map(f => f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

const ISO = "[\\u2066-\\u2069\\u200e\\u200f\\s]*";
const TAGS = "(?:\\s*<\\/?[a-zA-Z][^<>]*>)*";
const INTERP = [
  "\\$\\{(?:[^{}]|\\{[^{}]*\\})*\\}",          // ${…} (one level of nested braces)
  "\\{(?:[^{}\\n]|\\{[^{}\\n]*\\})*\\}",       // JSX {…}
  "\\+\\s*[\"']",                              // '+x+' / "+x+" — number concatenated in
].join("|");
const PATTERN = new RegExp(`(?:${INTERP})${ISO}${TAGS}${ISO}(?:${nounAlternation})(?![\\u0621-\\u064A\\u0671-\\u06D3])`, "gu");

/* Noun-first names that follow an interpolation. Matched against the source
 * line; each entry must still match something, so a stale one is reported. */
const ALLOW: Array<{ file: string; contains: string; why: string }> = [
];

function sourceFiles(): string[] {
  const out = ["server.ts"];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (entry.name !== "generated") walk(rel); continue; }
      if (/\.(ts|tsx)$/.test(entry.name) && !/arabicCount\.ts$/.test(entry.name)) out.push(rel);
    }
  };
  walk("src");
  return out;
}

/** Comments carry grammar examples («١١ موعداً»); they are not output. */
function codeOf(line: string): string | null {
  const t = line.trim();
  if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*")) return null;
  return line.replace(/\{?\/\*.*?\*\/\}?/g, "");
}

export function scan(files = sourceFiles(), read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8")) {
  const hits: Array<{ file: string; line: number; text: string; allowed: boolean }> = [];
  const used = new Set<number>();
  for (const file of files) {
    read(file).split("\n").forEach((raw, i) => {
      const code = codeOf(raw);
      if (code === null) return;
      const line = bare(code);
      PATTERN.lastIndex = 0;
      for (const m of line.matchAll(PATTERN)) {
        // An interpolation that is itself countOf/nounFor already carries its
        // noun; a word after it («… يوم الأحد») is not what it counts.
        if (/^\$?\{\s*(countOf|nounFor)\(/.test(m[0])) continue;
        const allow = ALLOW.findIndex(a => file.endsWith(a.file) && raw.includes(a.contains));
        if (allow >= 0) used.add(allow);
        hits.push({ file, line: i + 1, text: line.slice(Math.max(0, m.index! - 50), m.index! + m[0].length + 20).trim(), allowed: allow >= 0 });
      }
    });
  }
  return { hits, used };
}

const { hits, used } = scan();
const offending = hits.filter(h => !h.allowed);
for (const h of offending) console.log(`   ${h.file}:${h.line}  …${h.text}`);
check(offending.length === 0, `لا عددَ مُقحَماً قبل معدودٍ مكتوبٍ بيدٍ (${offending.length} موضع خارج arabicCount.ts)`);
ALLOW.forEach((a, i) => check(used.has(i), `الاستثناء ما زال مستعمَلاً: ${a.file} — ${a.why}`));

/* The guard itself must see the defect it exists for. */
const planted = scan(["planted.tsx"], () => "const t = `بقي ${days} يوماً`;\nconst u = <b>{n}</b><small>شعبة</small>;\nh+='<i>'+n+' مقرر</i>';").hits;
check(planted.length === 3, "الحارس يلتقط «بقي ${days} يوماً» و<b>{n}</b><small>شعبة</small> و'+n+' مقرر");
const clean = scan(["clean.tsx"], () => "const t = `بقي ${countOf(days, AR.day)}`;\n// «١١ موعداً»\nconst l = `شعبة ${code}`;").hits;
check(clean.length === 0, "ولا يلتقط countOf ولا التعليق ولا الاسمَ المتقدّم «شعبة ${code}»");

/* One rule, one place: no page or component defines its own counter. */
const second = sourceFiles().filter(f => /function\s+(countOf|nounFor|arCourses)\s*\(/.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
check(second.length === 0, `لا نسخةَ ثانية من قاعدة العدد${second.length ? ": " + second.join("، ") : ""}`);

/* Spot-check the rule the product relies on. */
check(countOf(1, AR.day) === "يوم واحد" && countOf(2, AR.day) === "يومان" && countOf(7, AR.day) === "7 أيام"
  && countOf(14, AR.day) === "14 يوماً" && countOf(100, AR.day) === "100 يوم" && countOf(0, AR.day) === "لا أيام",
  "القاعدة: يوم واحد · يومان · 7 أيام · 14 يوماً · 100 يوم · لا أيام");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
