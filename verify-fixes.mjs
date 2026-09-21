import fs from 'node:fs';
const read = p => fs.readFileSync(p, 'utf8');
const checks = [];
const check = (ok, msg) => { checks.push([Boolean(ok), msg]); };

try {
  const server = read('server.ts');
  const changes = read('src/components/ScheduleChanges.tsx');
  const approval = read('src/components/ApprovalBar.tsx');
  const review = read('src/components/ScheduleReview.tsx');
  const foundation = read('src/styles/01-foundation.css');
  const intelligence = read('src/styles/06-intelligence.css');
  const app = read('src/App.tsx');

  check(server.includes('liveTermId: link.AdTermId,'), 'بطاقتي: الفصل التشغيلي يتبع الفصل الذي أُصدر له الرابط');
  check(!/suggestions,\s*crossScope,\s*blockingConflicts/.test(server), 'API القسم لا يعيد تفاصيل crossScope');
  check(!changes.includes('className="changes-cross"'), 'شاشة القسم لا تعرض اسم/تفاصيل قسم آخر');
  check(changes.includes('sortedDiffEntries') && changes.includes('setView("changes")'), 'ما تحرّك = diff فقط');
  check(changes.includes('sortedFullSchedule') && changes.includes('setView("full")'), 'الجدول كامل = كل الصفوف');
  check(!approval.includes('approval-sign-notices') && !approval.includes('showNotices'), 'حُذف عداد الملاحظات اللائحية المكرر');
  check(review.includes('print-query-report print-review-report'), 'طباعة الاعتماد تشترك مع shell طباعة الاستعلامات');
  check(foundation.includes('SCHEDULE_ARABIC_TYPE_RECOVERY') && foundation.includes('font-synthesis:none'), 'طبقة الخط العربي موحدة بلا synthetic weight');
  check(server.includes('SCHEDULE_PUBLIC_PLEX_ARABIC'), 'بطاقتي والاستبيان يحملان Plex Arabic ذاتياً');
  check(intelligence.includes('SCHEDULE_WEEK_CARD_CONTAINMENT'), 'بطاقات تقرير الأسبوع محصورة داخل الإطار');
  check(app.includes('["departmentHead", "dean", "viceDean"].includes(sessionRole.id)'), 'رئيس القسم/العميد يدخلان مسار الجدول/الوارد نفسه بحسب النطاق');

  let failed = 0;
  for (const [ok, msg] of checks) {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
    if (!ok) failed++;
  }
  if (failed) process.exit(1);
} catch (e) {
  console.error(e?.message || e);
  process.exit(2);
}
