/**
 * ملف الاعتماد — سلوكُ النموذج وحده: عدّاد المضاف والمعدَّل والمحذوف، النسب،
 * الخط الزمني لجولاتٍ متعدّدة، البيانات الناقصة، تغييرٌ فارغ، ونطاقٌ لا يطابق.
 * وما لا يحمله السجلّ لا يُعرض: لا أسبابَ للتغيير، ولا قيمة مختلقة.
 */
import fs from "fs";
import { buildApprovalDossier, proportionalPercents, DOSSIER_ITEM_CAP, type DossierInput, type DossierDiffEntry } from "../src/utils/approvalDossier";
import { approvalScopeKey } from "../src/utils/approvalScope";

let passed = 0, failed = 0;
const check = (ok: unknown, label: string) => {
  if (ok) { passed++; console.log(`\x1b[32m✓ ${label}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${label}\x1b[0m`); }
};

const scope = { collegeId: 1, sectionId: 2, termId: 3 };
const key = approvalScopeKey(scope);
const printedAt = new Date(2026, 9, 2, 12, 0, 0);
const entry = (id: number, kind: DossierDiffEntry["kind"], course = "رياضيات", extra: Partial<DossierDiffEntry> = {}): DossierDiffEntry => ({
  kind, scheduleId: id, row: { AdCollegeId: 1, AdSectionId: 2, AdTermId: 3 },
  changes: kind === "changed" ? [{ label: "القاعة", before: "A1", after: "B2" }] : [],
  display: { courseCode: `C${course}`, course, sectionCode: String(id), days: "الأحد", time: "08:00", room: "A1", instructor: "د. سالم" }, ...extra,
});
const base = (patch: Partial<DossierInput> = {}, data: any = {}): DossierInput => ({
  scope, names: { college: "كلية", section: "قسم", term: "الفصل الأول" },
  report: { scopeKey: key, data: {
    baselineSource: "authority", authoritySource: { sourceFileName: "approved.pdf", publishedAt: "2026-09-01T10:00:00Z" },
    rowCount: 10, statusLabel: "عند التسجيل",
    approval: { AdCollegeId: 1, AdSectionId: 2, AdTermId: 3, status: "submitted", currentRound: 1, signatures: [], rounds: [] },
    diff: { entries: [entry(1, "added"), entry(2, "added"), entry(3, "changed"), entry(4, "removed")], counts: { added: 2, changed: 1, removed: 1, unchanged: 6 } },
    ...data } },
  readiness: { scopeKey: key, data: { blockers: [], warnings: [], blockingConflicts: 0, blockingRows: 0 } },
  printedAt, ...patch,
});

/* ١) العدّادات والنسب */
{
  const m = buildApprovalDossier(base());
  check(m.changes.available && m.changes.added === 2 && m.changes.modified === 1 && m.changes.removed === 1 && m.changes.total === 4, "العدّادات: ٢ مضاف، ١ معدَّل، ١ محذوف");
  check(m.changes.tiles.map(t => t.percent).join() === "50,25,25", "النسب من مجموع التغييرات: 50/25/25");
  check(m.changes.unchanged === 6 && m.changes.stablePercent === 67, "حصة ما لم يُمسّ: 6 من 9 في الجدول الحيّ = 67%");
  check(m.changes.tiles[0].label === "موعدان مضافان" && m.changes.tiles[2].label === "موعد محذوف", "تسميات البطاقات تمرّ بصيغ العدد والمعدود");
  check(m.baseline.title === "منذ الجدول المعتمد" && /approved\.pdf/.test(m.baseline.sourceLine || "") && /2026-09-01/.test(m.baseline.sourceLine || ""), "سطر المصدر يسمّي الوثيقة وتاريخ اعتمادها");
  check(m.printedOn === "02/10/2026", "تاريخ الطباعة بأرقام غربية dd/mm/yyyy");
  check(proportionalPercents([1, 1, 1]).reduce((a, b) => a + b, 0) === 100 && proportionalPercents([0, 0, 0]).join() === "0,0,0", "النسب مجموعها ١٠٠ دائماً، وصفرٌ حين لا تغيير");
}

/* ٢) لا تغييرات */
{
  const m = buildApprovalDossier(base({}, { diff: { entries: [], counts: { added: 0, changed: 0, removed: 0, unchanged: 9 } } }));
  check(m.changes.available && m.changes.total === 0 && m.groups.length === 0 && m.hiddenLabel === null, "مجموعة تغييرات فارغة: متاحة وصفر، لا مجموعات");
  check(m.changes.stablePercent === 100, "لا تغيير: الجدول كلّه ثابت 100%");
}

/* ٣) بياناتٌ ناقصة: لا قيمة مختلقة */
{
  const none = buildApprovalDossier(base({}, { baselineSource: "none" }));
  check(!none.changes.available && !none.baseline.available && none.baseline.sourceLine === null, "بلا أساس: التغييرات غير متوفرة لا أصفار");
  const noReport = buildApprovalDossier(base({ report: null }));
  check(!noReport.changes.available && !noReport.approval.available && noReport.timeline.length === 0 && noReport.state === "ok", "بلا تقرير: الاعتماد والتغييرات غير متوفرين، والموانع من الجاهزية");
  check(noReport.blockers.available && noReport.blockers.source === "readiness" && noReport.blockers.clear, "جاهزيةٌ نظيفة بلا تقرير: لا موانع");
  const noReadiness = buildApprovalDossier(base({ readiness: null }));
  check(noReadiness.blockers.source === "report" || !noReadiness.blockers.available, "بلا جاهزية: لا ادّعاء");
  const nothing = buildApprovalDossier(base({ report: null, readiness: null }));
  check(nothing.state === "loading" && !nothing.blockers.available && !nothing.blockers.clear, "لا شيء وصل: تحميل، ولا يُدّعى أن لا موانع");
  const noUnchanged = buildApprovalDossier(base({}, { diff: { entries: [entry(1, "added")], counts: {} } }));
  check(noUnchanged.changes.unchanged === null && noUnchanged.changes.stablePercent === null, "بلا عدّاد الثابت: لا نسبة مختلقة");
  const reasons = JSON.stringify(buildApprovalDossier(base()));
  check(!/reason|سبب/.test(JSON.stringify(buildApprovalDossier(base()).groups)) && reasons.length > 0, "لا أسباب للتغيير في النموذج (السجل لا يحملها)");
}

/* ٤) اعتمادٌ بجولاتٍ متعدّدة */
{
  const approval = {
    AdCollegeId: 1, AdSectionId: 2, AdTermId: 3, status: "accepted", currentRound: 2,
    rounds: [
      { number: 1, submittedAt: "2026-09-02T09:00:00", submittedBy: "منى", returnedAt: "2026-09-04T09:00:00", returnedBy: "خالد", returnedNoteCount: 3, changedRowCount: 5 },
      { number: 2, submittedAt: "2026-09-06T09:00:00", submittedBy: "منى", acceptedAt: "2026-09-08T09:00:00", acceptedBy: "خالد" },
    ],
    signatures: [
      { stage: "committee", userName: "أحمد", roleLabel: "رئيس لجنة الجدول", at: "2026-09-01T09:00:00", rowCount: 10, verifyCode: "AB12" },
      { stage: "head", userName: "ليلى", at: "2026-09-01T11:00:00", rowCount: 10, regulationNoticeCount: 2, verifyCode: "CD34" },
    ],
    pendingAdditions: [{ scheduleId: 9 }], headReturn: { by: "ليلى", at: "2026-08-30T09:00:00", reason: "ناقص" },
  };
  const m = buildApprovalDossier(base({}, { approval, rowCount: 12 }));
  check(m.approval.available && m.approval.roundLabel === "الجولة 2" && m.approval.tone === "success", "الجولة الحالية وحالة القبول");
  check(m.approval.signedByCommittee && m.approval.signedByHead, "توقيعا اللجنة ورئيس القسم");
  check(m.timeline.map(s => s.kind).join() === "head-returned,signed,signed,submitted,returned,submitted,accepted", "الخط الزمني مرتّبٌ زمنياً عبر الجولات والتوقيعات");
  const signed = m.timeline.filter(s => s.kind === "signed");
  check(signed[0].verifyCode === "AB12" && signed[1].verifyCode === "CD34" && signed[0].date === "01/09/2026", "رمز التحقق والتاريخ من السجلّ نفسه");
  check(signed[1].detail === "على 10 مواعيد مع علمه بملاحظتان لائحيتان" || /مع علمه بـ/.test(signed[1].detail || ""), "تفصيل التوقيع من عدد المواعيد والملاحظات اللائحية");
  const returned = m.timeline.find(s => s.kind === "returned")!;
  check(/3 ملاحظات/.test(returned.detail || "") && /5 صفوف/.test(returned.detail || ""), "الإرجاع: عدد الملاحظات والصفوف المتحرّكة");
  check(m.approval.changedSinceSignature !== null && /10/.test(m.approval.changedSinceSignature) && /12/.test(m.approval.changedSinceSignature), "اختلاف عدد المواعيد عن وقت التوقيع قرينةٌ مكتوبة");
  check(m.approval.pendingAdditions === 1 && m.approval.headReturn?.date === "30/08/2026", "الإضافات المنتظرة وإرجاع رئيس القسم");
  check(m.blockers.summary !== null && !m.blockers.clear, "إضافةٌ تنتظر: لا «لا موانع»");
}

/* ٥) الموانع والتحذيرات */
{
  const m = buildApprovalDossier(base({ readiness: { scopeKey: key, data: {
    blockers: [{ title: "حجز مزدوج", detail: "x" }, { title: "ب" }, { title: "ج" }, { title: "د" }, { title: "هـ" }],
    warnings: [{ title: "w" }], blockingConflicts: 5, blockingRows: 7 } } }));
  check(m.blockers.blockingCount === 5 && m.blockers.blocking.length === 4 && m.blockers.blockingRows === 7 && m.blockers.warningCount === 1 && !m.blockers.clear, "الموانع: عدّ كامل وعرضٌ مسقوف");
  check(/موانع اعتماد/.test(m.blockers.summary || ""), "ملخّص الموانع بصيغة العدد");
  const notes = buildApprovalDossier(base({ readiness: null }, { notes: [{ origin: "registrar", state: "open" }, { origin: "department", state: "open" }], reviewBlockers: [] }));
  check(notes.blockers.openNotes === 1 && notes.blockers.source === "report" && !notes.blockers.clear, "ملاحظةٌ مفتوحة من التسجيل تمنع «لا موانع»");
}

/* ٦) المجموعات والسقف */
{
  const entries = Array.from({ length: 20 }, (_, i) => entry(100 + i, "added", i < 10 ? "أ" : "ب"));
  const m = buildApprovalDossier(base({}, { diff: { entries, counts: { added: 20, unchanged: 0 } } }));
  check(m.shownItems === DOSSIER_ITEM_CAP && m.hiddenItems === 8 && m.hiddenLabel === "و8 مواعيد أخرى", "ما فوق 12 يُطوى: «و8 مواعيد أخرى»");
  check(m.groups.length === 2 && m.groups[0].items.length === 10 && m.groups[1].items.length === 2, "التجميع بحسب المقرر ثم القصّ");
  const mod = buildApprovalDossier(base());
  check(mod.groups.flatMap(g => g.items).find(i => i.kind === "modified")?.lines[0] === "القاعة: A1 ← B2", "سطر التعديل: الخانة قبل ← بعد");
}

/* ٧) النطاق */
{
  const stale = buildApprovalDossier(base({ report: { scopeKey: "9:9:9", data: base().report!.data }, readiness: { scopeKey: "9:9:9", data: { blockers: [{ title: "x" }] } } }));
  check(stale.state === "scope-mismatch" && stale.scopeMismatch.report && stale.scopeMismatch.readiness && !stale.changes.available && !stale.approval.available && !stale.blockers.available, "قراءاتٌ لنطاقٍ آخر تسقط كلّها");
  const sibling = buildApprovalDossier(base({}, { approval: { AdCollegeId: 7, AdSectionId: 2, AdTermId: 3, status: "accepted", signatures: [{ stage: "head", userName: "غريب", at: "2026-09-01", verifyCode: "ZZ" }] } }));
  check(sibling.scopeMismatch.approval && !sibling.approval.available && sibling.timeline.length === 0, "سجلُّ اعتمادٍ لقسمٍ شقيق لا يظهر ولو جاء تحت مفتاح هذا النطاق");
  const foreign = buildApprovalDossier(base({}, { diff: { entries: [entry(1, "added"), { ...entry(2, "added"), row: { AdCollegeId: 5, AdSectionId: 2, AdTermId: 3 } }], counts: { added: 2, unchanged: 5 } } }));
  check(foreign.changes.added === 1 && foreign.changes.droppedOutOfScope === 1 && foreign.changes.unchanged === null, "موعدٌ من كليةٍ أخرى يُسقط من العدّ، ولا يُعتمد عدّاد الثابت");
}

/* ٨) المصدر: لا نصّ عددٍ مكتوبٌ باليد، والزرّ موثّق */
{
  const comp = fs.readFileSync("src/components/ApprovalDossier.tsx", "utf8");
  const model = fs.readFileSync("src/utils/approvalDossier.ts", "utf8");
  check(!/\{[^}]*\.(count|length)\}\s*(موعد|مقرر|ملاحظة|صف|تنبيه)/.test(comp), "المصيِّر لا يكتب «عدد معدود» بيده");
  check(/countOf\(/.test(model) && /nounFor\(/.test(model), "النموذج يستعمل countOf وnounFor");
  check(/approvalScope"/.test(comp) && /createScopeGuard/.test(comp) && /accepts\(token\)/.test(comp), "القراءات محروسةٌ بمفتاح النطاق");
  const changes = fs.readFileSync("src/components/ScheduleChanges.tsx", "utf8");
  check(/ملف الاعتماد/.test(changes) && /setDossierOpen\(false\)/.test(changes), "نقطة الدخول في رأس التقرير وتُغلق عند تبدّل النطاق");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
