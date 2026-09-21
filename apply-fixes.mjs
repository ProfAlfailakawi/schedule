import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const mustExist = [
  'package.json',
  'server.ts',
  'src/components/ScheduleChanges.tsx',
  'src/components/ApprovalBar.tsx',
  'src/components/ScheduleReview.tsx',
  'src/styles/01-foundation.css',
  'src/styles/06-intelligence.css',
  'tests/schedule-changes-audit.ts',
];
for (const rel of mustExist) {
  if (!fs.existsSync(path.join(root, rel))) {
    console.error(`ERROR: شغّل الملف من جذر مشروع schedule. الملف غير موجود: ${rel}`);
    process.exit(2);
  }
}

const touched = new Set();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const write = (rel, text) => { fs.writeFileSync(path.join(root, rel), text, 'utf8'); touched.add(rel); };

function replaceRequired(rel, before, after, label, { min = 1, max = Infinity } = {}) {
  let text = read(rel);
  if (text.includes(after) && !text.includes(before)) return 0; // already applied
  let count = 0;
  let at = 0;
  while ((at = text.indexOf(before, at)) !== -1) { count++; at += before.length; }
  if (count < min || count > max) {
    throw new Error(`${rel}: ${label} — expected ${min}..${max === Infinity ? '∞' : max} matches, found ${count}`);
  }
  text = text.split(before).join(after);
  write(rel, text);
  return count;
}

function regexRequired(rel, regex, replacement, label, { min = 1, max = Infinity } = {}) {
  let text = read(rel);
  const matches = [...text.matchAll(regex)];
  if (matches.length < min || matches.length > max) {
    throw new Error(`${rel}: ${label} — expected ${min}..${max === Infinity ? '∞' : max} matches, found ${matches.length}`);
  }
  text = text.replace(regex, replacement);
  write(rel, text);
  return matches.length;
}

function appendOnce(rel, marker, block) {
  const text = read(rel);
  if (text.includes(marker)) return;
  write(rel, `${text.trimEnd()}\n\n${block.trim()}\n`);
}

try {
  /* ------------------------------------------------------------------
     1) بطاقتي: الفصل الذي أُصدر له رابط الأستاذ هو الفصل التشغيلي للرابط.
        إنشاء فصل أحدث للتخطيط لا يحوّل بطاقة الفصل المصدر إلى "فصل سابق".
     ------------------------------------------------------------------ */
  replaceRequired(
    'server.ts',
    'liveTermId: sortTermsNewestServer(terms)[0]?.AdTermId || 0,',
    'liveTermId: link.AdTermId,',
    'staff-card live term must follow the issued link term',
    { min: 1, max: 1 },
  );

  /* ------------------------------------------------------------------
     2) عزل القسم: لا نعيد هوية/تفاصيل قسم آخر داخل تقرير قسم واحد.
        يبقى عدّ الموانع على الخادم كما هو لحماية القاعات والتعارضات؛ الذي
        يُحذف هو كشف تفاصيل النطاق الآخر في payload وشاشة القسم.
     ------------------------------------------------------------------ */
  replaceRequired(
    'server.ts',
    '    suggestions,\n    crossScope,\n    blockingConflicts: await blockingConflictCount(collegeId, sectionId, termId),',
    '    suggestions,\n    blockingConflicts: await blockingConflictCount(collegeId, sectionId, termId),',
    'do not expose cross-department detail in scoped changes response',
    { min: 1, max: 1 },
  );

  let changes = read('src/components/ScheduleChanges.tsx');
  if (changes.includes('className="changes-cross"')) {
    const crossBlock = /\n\s*\{\(report\.crossScope \|\| \[\]\)\.filter\(clash => clash\.scheduleId === scheduleId\)\.map\(\(clash, index\) => \([\s\S]*?\n\s*\)\)\}/g;
    const matches = [...changes.matchAll(crossBlock)];
    if (matches.length !== 1) throw new Error(`ScheduleChanges cross-scope UI block: expected 1, found ${matches.length}`);
    changes = changes.replace(crossBlock, '');
    // The label map existed only for the removed external-scope disclosure.
    changes = changes.replace(/\n\/\*\* ما اصطدم فيه الموعدان:[\s\S]*?const CROSS_KIND_LABEL: Record<string, string> = \{[\s\S]*?\};\n/, '\n');
    write('src/components/ScheduleChanges.tsx', changes);
  }

  /* ------------------------------------------------------------------
     3) اللائحة: مصدر عرض واحد فقط. نحذف العدّاد المكرر من ApprovalBar؛
        بطاقة الملاحظات اللائحية داخل شاشة التغييرات/الاعتماد تبقى هي المصدر.
     ------------------------------------------------------------------ */
  let approval = read('src/components/ApprovalBar.tsx');
  if (approval.includes('approval-sign-notices') || approval.includes('showNotices')) {
    approval = approval.replace('AlertTriangle, CornerUpLeft, Scale, Send, ShieldCheck', 'AlertTriangle, CornerUpLeft, Send, ShieldCheck');
    approval = approval.replace(/\n\s*const \[showNotices, setShowNotices\] = useState\(false\);/, '');
    approval = approval.replace('const { approval, blockingConflicts, regulationNotices } = state;', 'const { approval, blockingConflicts } = state;');
    approval = approval.replace(/\n\s*\{\/\* اللائحة تُعرض ولا تمنع:[\s\S]*?className="approval-sign-notices"[\s\S]*?\) : null\}/, '');
    approval = approval.replace(/\n\s*\{showNotices \? \([\s\S]*?<Notice type="warning">[\s\S]*?<\/Notice>\n\s*\) : null\}/, '');
    if (approval.includes('approval-sign-notices') || approval.includes('showNotices') || approval.includes('setShowNotices')) {
      throw new Error('ApprovalBar: duplicated regulation UI was not fully removed');
    }
    write('src/components/ApprovalBar.tsx', approval);
  }

  /* ------------------------------------------------------------------
     4) الطباعة: شاشة مراجعة الاعتماد تستخدم نفس قاعدة طباعة الاستعلامات
        (letterhead/query report geometry) بدلاً من مسار بصري منفصل.
     ------------------------------------------------------------------ */
  replaceRequired(
    'src/components/ScheduleReview.tsx',
    '<div className="print-report print-wide print-review-report">',
    '<div className="print-report print-wide print-query-report print-review-report">',
    'approval print shares query report shell',
    { min: 1, max: 1 },
  );

  /* ------------------------------------------------------------------
     5) الخط العربي في التطبيق: لا synthetic weights/features ولا tracking
        سلبي على العناوين العربية. Plex Arabic هو المصدر الواحد.
     ------------------------------------------------------------------ */
  replaceRequired(
    'src/styles/01-foundation.css',
    '--brand-word-weight:650;',
    '--brand-word-weight:600;',
    'use an actually loaded brand weight',
    { min: 1, max: 1 },
  );
  replaceRequired(
    'src/styles/01-foundation.css',
    '  font-feature-settings:"ss01","cv01";',
    '  font-feature-settings:normal;\n  font-kerning:normal;\n  font-synthesis:none;',
    'disable Latin-only global OpenType features/synthetic Arabic weight',
    { min: 1, max: 1 },
  );

  appendOnce('src/styles/01-foundation.css', 'SCHEDULE_ARABIC_TYPE_RECOVERY', `
/* SCHEDULE_ARABIC_TYPE_RECOVERY
   Arabic joins should not be tightened with Latin headline tracking. */
html[lang="ar"] body{font-synthesis:none;font-kerning:normal}
html[lang="ar"] h1,
html[lang="ar"] h2,
html[lang="ar"] h3,
html[lang="ar"] h4,
html[lang="ar"] h5,
html[lang="ar"] h6,
html[lang="ar"] .page-heading h1,
html[lang="ar"] .btn,
html[lang="ar"] input,
html[lang="ar"] select,
html[lang="ar"] textarea{letter-spacing:0}
`);

  // A few components asked for an unavailable 650/560 weight. With the Arabic
  // font only shipping 300/400/500/600/700, normalize the obvious UI cases.
  for (const rel of [
    'src/styles/02-primitives.css', 'src/styles/03-shell.css',
    'src/styles/04-screens.css', 'src/styles/05-schedule.css',
    'src/styles/06-intelligence.css', 'src/styles/07-responsive.css',
    'src/styles/09-details.css', 'src/styles/11-approval.css',
  ]) {
    if (!fs.existsSync(path.join(root, rel))) continue;
    let css = read(rel);
    const next = css
      .replace(/font-weight:650\b/g, 'font-weight:600')
      .replace(/font-weight:560\b/g, 'font-weight:600')
      .replace(/font:\s*650\b/g, 'font:600');
    if (next !== css) write(rel, next);
  }

  /* standalone public pages (بطاقتي + الاستبيان) do not load index.css. */
  let server = read('server.ts');
  const publicFontMarker = 'SCHEDULE_PUBLIC_PLEX_ARABIC';
  if (!server.includes(publicFontMarker)) {
    const face = `/* SCHEDULE_PUBLIC_PLEX_ARABIC */@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:400;font-display:swap;src:url("/fonts/plex-arabic-arabic-400.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:500;font-display:swap;src:url("/fonts/plex-arabic-arabic-500.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:600;font-display:swap;src:url("/fonts/plex-arabic-arabic-600.woff2") format("woff2")}@font-face{font-family:"Plex Arabic";font-style:normal;font-weight:700;font-display:swap;src:url("/fonts/plex-arabic-arabic-700.woff2") format("woff2")}`;
    // Inject into each inline HTML style block. This is intentional: public
    // staff/survey pages are isolated documents and otherwise fall back to OS fonts.
    server = server.replace(/<style>/g, `<style>${face}`);
    server = server
      .replace(/font-family:-apple-system,BlinkMacSystemFont,\\"Segoe UI\\",\\"Noto Sans Arabic\\",Tahoma,sans-serif/g,
               'font-family:\\"Plex Arabic\\",-apple-system,BlinkMacSystemFont,\\"Segoe UI\\",\\"Noto Sans Arabic\\",Tahoma,sans-serif')
      .replace(/font-family:-apple-system,\\"Segoe UI\\",\\"Noto Sans Arabic\\",Tahoma,sans-serif/g,
               'font-family:\\"Plex Arabic\\",-apple-system,\\"Segoe UI\\",\\"Noto Sans Arabic\\",Tahoma,sans-serif');
    write('server.ts', server);
  }

  /* ------------------------------------------------------------------
     6) تقرير الأسبوع: لا يخرج code/room/LTR أو اسم طويل من حدود بطاقة اليوم.
     ------------------------------------------------------------------ */
  appendOnce('src/styles/06-intelligence.css', 'SCHEDULE_WEEK_CARD_CONTAINMENT', `
/* SCHEDULE_WEEK_CARD_CONTAINMENT
   Every weekly report cell owns its content; long Arabic names and LTR room
   codes may wrap/clip inside the cell but can never paint into the next day. */
.lens-week,
.lens-week>section,
.lens-week>section>div,
.lens-week article,
.lens-week article>*{min-width:0;max-width:100%}
.lens-week>section{overflow:hidden}
.lens-week article{overflow:hidden;contain:paint}
.lens-week article>div{overflow:hidden}
.lens-week article strong,
.lens-week article span,
.lens-week article small{max-width:100%;word-break:normal;overflow-wrap:break-word}
.lens-week article [dir="ltr"],
.lens-week article .num,
.lens-week article .code{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`);

  /* ------------------------------------------------------------------
     7) Update the existing audit so it protects the NEW privacy/scope rule.
        We keep cross-scope validation internally, but scoped UI/API must not
        expose the other department's identity/details.
     ------------------------------------------------------------------ */
  let audit = read('tests/schedule-changes-audit.ts');
  if (audit.includes('changes.includes("changes-cross")')) {
    audit = audit.replace(
      /check\(server\.includes\("async function crossScopeClashes"\)[\s\S]*?check\(changes\.includes\("changes-cross"\),[^;]*;?/,
      `check(server.includes("async function crossScopeClashes"), "التعارضات بين الأقسام تبقى فحصاً داخلياً لحماية القاعات");\ncheck(!/suggestions,\\s*crossScope,\\s*blockingConflicts/.test(server), "تقرير القسم لا يُرجع تفاصيل قسم آخر في payload");\ncheck(!changes.includes("changes-cross"), "شاشة القسم لا تعرض اسم أو تفاصيل قسم آخر");`
    );
    write('tests/schedule-changes-audit.ts', audit);
  }

  /* ------------------------------------------------------------------
     8) Guard the two toggles the user specified. Current repo already has the
        correct data sources; verify them instead of rewriting working logic.
     ------------------------------------------------------------------ */
  const afterChanges = read('src/components/ScheduleChanges.tsx');
  const requiredSourceGuards = [
    ['ما تحرّك', 'ما تحرّك'],
    ['الجدول كامل', 'الجدول كامل'],
    ['sortedDiffEntries', 'diff-only source'],
    ['sortedFullSchedule', 'full-schedule source'],
    ['setView("changes")', 'changes toggle'],
    ['setView("full")', 'full toggle'],
  ];
  for (const [needle, label] of requiredSourceGuards) {
    if (!afterChanges.includes(needle)) throw new Error(`ScheduleChanges guard missing: ${label}`);
  }

  // Head/dean/vice-dean must enter the inbox/table rather than being forced
  // straight into a single-section report. This is already the intended App
  // rule; assert it so the bundle does not regress a collaborator's current fix.
  const app = read('src/App.tsx');
  if (!app.includes('["departmentHead", "dean", "viceDean"].includes(sessionRole.id)')) {
    throw new Error('App role guard changed: departmentHead/dean/viceDean must keep the inbox/table entry path');
  }

  console.log('DONE — modified files:');
  [...touched].sort().forEach(rel => console.log(`  ${rel}`));
  console.log('\nNo git commit, push, deploy, upload, or network action was performed.');
  console.log('Recommended checks: npm run lint && npm test && npm run build');
} catch (error) {
  console.error(`\nFAILED: ${error?.message || error}`);
  process.exit(1);
}
