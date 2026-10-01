/**
 * إزالة أربع حركاتٍ أُثبتت خطأً في «سجلّ» اعتماد قسمٍ واحد.
 *
 * النطاق: قسم الدراسات الاجتماعية · كلية التربية الأساسية - بنات · الفصل الأول 2026/2027
 * الحركات: «توقيع» برمزي WA9WRV و SXKP5Z، و«سحب توقيع» مرّتين — كلّها باسم
 * د. أحمد الفيلكاوي يوم 27 سبتمبر 2026 (بتوقيت الكويت).
 *
 * أين تُخزَّن: وثيقة scheduleApprovals/<college>_<section>_<term>، الحقل events.
 * وما اشتُقّ منها: نسختا «توقيع …» اللتان التقطهما كل توقيع في scheduleVersions
 * (تُعرفان بالرمز: verificationCode(versionId, userId, at) يطابق رمز التوقيع).
 * سجلّ التدقيق (auditLogs) لا يُمسّ: هو أثرُ من فعل ماذا، لا حالة الجدول.
 *
 * النتيجة: الحالة «قيد الإعداد» — وإن لم يبق في الوثيقة شيءٌ غير الافتراضي
 * تُحذف كلها، فـ«قيد الإعداد» هي الحالة الضمنية لقسمٍ بلا وثيقة.
 *
 * يرفض أن يعمل إن لم يجد الأربع بالضبط، أو وجد توقيعاً قائماً أو جولةً مرسلة.
 *
 *   npx tsx scripts/remove-signature-events.ts            # معاينة
 *   npx tsx scripts/remove-signature-events.ts --apply    # تطبيق
 *   (اختياري) --college=ID --section=ID --term=ID --date=2026-09-27 --actor="أحمد الفيلكاوي"
 */
import { APPLY, argValue, connectFirestore, finish, kuwaitDate } from "./lib/firestoreScript";
import { arabicMatchKey } from "../src/utils/arabicText";
import { verificationCode } from "../src/utils/approvalWorkflow";
import type { ScheduleApproval, ScheduleApprovalEvent } from "../src/types";

const CODES = ["WA9WRV", "SXKP5Z"];
const DATE = argValue("date") || "2026-09-27";
const ACTOR = arabicMatchKey(argValue("actor") || "أحمد الفيلكاوي");
const COLLEGE_NAME = "كلية التربية الأساسية - بنات";
const SECTION_NAME = "قسم الدراسات الاجتماعية";
const TERM_NAME = "الفصل الأول 2026/2027";

async function main() {
  const db = await connectFirestore();

  const find = async (collection: string, idField: string, nameField: string, wanted: string, override?: string, extra?: (row: any) => boolean) => {
    const rows = (await db.collection(collection).get()).docs.map(doc => doc.data());
    const hits = override
      ? rows.filter(row => Number(row[idField]) === Number(override))
      : rows.filter(row => arabicMatchKey(row[nameField]) === arabicMatchKey(wanted) && (!extra || extra(row)));
    if (hits.length !== 1) throw new Error(`«${wanted}» في ${collection}: وُجد ${hits.length} (المطلوب واحد). مرّر --${collection.replace(/s$/, "")}=ID.`);
    return hits[0];
  };
  const college = await find("colleges", "AdCollegeId", "AdCollegeName", COLLEGE_NAME, argValue("college"));
  const section = await find("sections", "AdSectionId", "AdSectionName", SECTION_NAME, argValue("section"), row => Number(row.AdCollegeId) === Number(college.AdCollegeId));
  const term = await find("terms", "AdTermId", "AdTermName", TERM_NAME, argValue("term"));
  const collegeId = Number(college.AdCollegeId), sectionId = Number(section.AdSectionId), termId = Number(term.AdTermId);
  console.log(`النطاق: ${section.AdSectionName} (#${sectionId}) · ${college.AdCollegeName} (#${collegeId}) · ${term.AdTermName} (#${termId})`);

  const ref = db.collection("scheduleApprovals").doc(`${collegeId}_${sectionId}_${termId}`);
  const snap = await ref.get();
  if (!snap.exists) { console.log("لا وثيقة اعتماد لهذا النطاق — لا شيء يُزال."); finish(0); return; }
  const approval = snap.data() as ScheduleApproval;
  const events = approval.events || [];

  const byActorOnDate = (event: ScheduleApprovalEvent) => arabicMatchKey(event.by).includes(ACTOR) && kuwaitDate(event.at) === DATE;
  const signs = events.filter(event => event.action === "sign" && byActorOnDate(event) && CODES.some(code => String(event.detail || "").includes(code)));
  const withdraws = events.filter(event => event.action === "withdraw" && byActorOnDate(event));
  const targets = new Set([...signs, ...withdraws]);

  console.log(`\nالحالة الآن: ${approval.status} · تواقيع قائمة ${approval.signatures?.length || 0} · جولات ${approval.rounds?.length || 0} · حركات ${events.length}`);
  for (const event of events) console.log(`  ${targets.has(event) ? "✗ تُزال " : "  تبقى  "} ${event.at}  ${event.action}  ${event.by}  ${event.detail || ""}`);

  if (!targets.size) { finish(0); return; }
  if (signs.length !== 2 || withdraws.length !== 2) throw new Error(`المتوقع توقيعان وسحبان، ووُجد ${signs.length} و${withdraws.length}. لم يُكتب شيء.`);
  if ((approval.signatures || []).length) throw new Error("في الوثيقة توقيعٌ قائم — الحركات ليست كما وُصفت. لم يُكتب شيء.");
  if ((approval.rounds || []).length || Number(approval.currentRound || 0) > 0) throw new Error("الجدول أُرسل في جولة — لا يُمسّ بهذا السكربت. لم يُكتب شيء.");

  /* النسختان اللتان التقطهما التوقيعان: تُعرفان بأن رمزهما يُشتقّ منهما. */
  const versions = (await db.collection("scheduleVersions").where("scopeKey", "==", `${collegeId}:${sectionId}:${termId}`).get()).docs
    .map(doc => doc.data() as any)
    .filter(version => kuwaitDate(version.createdAt) === DATE && String(version.label || "").startsWith("توقيع"));
  const derived = versions.filter(version => CODES.some(code => {
    /* التوقيع يُختم بلحظته هو لا بلحظة النسخة؛ فيُجرَّب كل ميلّيثانية في ثوانٍ عشر بعدها. */
    const base = Date.parse(version.createdAt);
    for (let ms = 0; ms <= 10_000; ms++) if (verificationCode(String(version.id), Number(version.SystemUserId), new Date(base + ms).toISOString()) === code) return true;
    return false;
  }));
  console.log(`\nنسخ «توقيع» مشتقّة تُحذف: ${derived.length}`);
  for (const version of derived) console.log(`  scheduleVersions/${version.id}  ${version.createdAt}  ${version.label}  (${version.userName})`);
  if (derived.length !== 2) console.log("  تنبيه: لم تُطابَق النسختان كلتاهما بالرمز — يُحذف ما طوبق فقط.");

  const kept = events.filter(event => !targets.has(event));
  const rest: Partial<ScheduleApproval> = { ...approval, events: kept, status: "drafting" };
  const trivial = !kept.length && !(approval.pendingAdditions || []).length && !approval.extensionUntil && !approval.extensionRequest && !approval.headReturn && !approval.amendmentPending;
  console.log(trivial
    ? `\nالوثيقة لا يبقى فيها شيء: تُحذف scheduleApprovals/${ref.id} (قيد الإعداد ضمنية).`
    : `\nتُحدَّث scheduleApprovals/${ref.id}: ${kept.length} حركة تبقى، والحالة «قيد الإعداد».`);

  if (APPLY) {
    await db.runTransaction(async transaction => {
      const fresh = await transaction.get(ref);
      if (Number((fresh.data() as any)?.revision || 0) !== Number(approval.revision || 0)) throw new Error("تغيّرت الوثيقة أثناء التشغيل — أعد المعاينة.");
      if (trivial) transaction.delete(ref);
      else transaction.set(ref, { ...rest, revision: Number(approval.revision || 0) + 1, updatedAt: new Date().toISOString() });
      for (const version of derived) transaction.delete(db.collection("scheduleVersions").doc(String(version.id)));
    });
  }
  finish(targets.size + derived.length);
}

main().catch(error => { console.error(`\n✗ ${error instanceof Error ? error.message : error}`); process.exit(1); });
