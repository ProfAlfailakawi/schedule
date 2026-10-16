/**
 * ── تجهيز الأقسام والحسابات في كليات التربية الأساسية الأربع ──────────────────
 *
 * القسم الواحد (تكنولوجيا التعليم مثلاً) يُدرَّس في أربع كليات: بنات، بنين،
 * الجهراء، الفحيحيل. وكل قسم يلزمه ثلاثة حسابات يغطّي كل منها الكليات الأربع:
 *
 *   <بادئة>dept     رئيس لجنة الجدول («مسؤول الجدول»)
 *   <بادئة>head     رئيس القسم العلمي
 *   <بادئة>advisor  مرشد القسم
 *
 * ما يفعله هذا السكربت، وكلّه آمنٌ لإعادة التشغيل:
 *   ١. القسم الغائب عن إحدى الكليات الأربع يُنشأ فيها بالرمز والاسم نفسيهما.
 *   ٢. الحساب الغائب يُنشأ موقوفاً وبلا كلمة سر (يضع المدير الكلمة ويفعّله
 *      من شاشة المستخدمين).
 *   ٣. الحساب القائم يُوسَّع نطاقه ليشمل كل الكليات الأربع — لا يُحذف له نطاق
 *      ولا تُغيَّر صفته ولا كلمة سره ولا اسم دخوله.
 *   ٤. ما كان ملتبساً (بادئة متعارضة، اسم قسم مكرر برموز مختلفة) لا يُمسّ،
 *      ويُعرض للمراجعة.
 *
 *   npx tsx scripts/provision-department-accounts.ts          معاينة فقط
 *   npx tsx scripts/provision-department-accounts.ts --apply  تنفيذ
 *
 * يلزم ضبط FIREBASE_PROJECT_ID وFIREBASE_DATABASE_ID وبيانات اعتماد Google
 * (GOOGLE_APPLICATION_CREDENTIALS) كما في بقية سكربتات هذا المجلد.
 */
import dotenv from "dotenv";
dotenv.config();
process.env.DATA_MODE = "firestore";
if (!process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_DATABASE_ID) {
  const firebaseConfig = JSON.parse(await (await import("node:fs/promises")).readFile("firebase-applet-config.json", "utf8"));
  process.env.FIREBASE_PROJECT_ID ||= String(firebaseConfig.projectId || "");
  process.env.FIREBASE_DATABASE_ID ||= String(firebaseConfig.firestoreDatabaseId || "");
}

const APPLY = process.argv.includes("--apply");
const { initDatabase, Repository } = await import("../src/db/repository");
const { planAdvisorAccounts, ADVISOR_KIND, HEAD_KIND } = await import("../src/utils/departmentHeadAccounts");
const { roleDefinition } = await import("../src/utils/academicRoles");
const { departmentFamilyKey } = await import("../src/utils/sectionLabel");
const { officialCollegeSitePrefix } = await import("../src/utils/locationCollegePrefixes");

/** المواقع الأربعة لكلية التربية الأساسية: بنات، بنين، الجهراء، الفحيحيل. */
const TARGET_SITES = ["012B", "011B", "012J", "012F"];
const SCHEDULE_KIND = { suffix: "dept", role: "committeeChair", namePrefix: "لجنة الجدول" };
const KINDS = [SCHEDULE_KIND, HEAD_KIND, ADVISOR_KIND];

type Scope = { AdCollegeId: number; AdSectionId: number };
const scopeKey = (s: Scope) => `${Number(s.AdCollegeId)}:${Number(s.AdSectionId)}`;

await initDatabase();
console.log(APPLY ? "تطبيق (--apply)" : "معاينة فقط — لن يُكتب شيء");

let colleges = await Repository.getColleges();
const targetColleges = colleges.filter(c => TARGET_SITES.includes(String(officialCollegeSitePrefix(c.AdCollegeName) || "")));
const found = new Set(targetColleges.map(c => String(officialCollegeSitePrefix(c.AdCollegeName))));
const missingSites = TARGET_SITES.filter(site => !found.has(site));
if (missingSites.length) console.log(`\n⚠ كليات غير مسجلة في النظام (لم تُنشأ تلقائياً): ${missingSites.join("، ")} — أضفها من شاشة الكليات ثم أعد التشغيل.`);
console.log(`\nالكليات المستهدفة (${targetColleges.length}): ${targetColleges.map(c => c.AdCollegeName).join(" | ")}`);
const targetIds = new Set(targetColleges.map(c => Number(c.AdCollegeId)));

/* ── ١. الأقسام الناقصة ───────────────────────────────────────────────────── */
let sections = await Repository.getSections();
const families = new Map<string, any[]>();
for (const s of sections as any[]) {
  if (!targetIds.has(Number(s.AdCollegeId))) continue;
  const key = departmentFamilyKey(s.AdSectionName);
  if (!key) continue;
  (families.get(key) || families.set(key, []).get(key)!).push(s);
}
let sectionsToCreate = 0, sectionsCreated = 0;
console.log("\n── أقسام ستُنشأ في كليات تفتقدها");
for (const [, members] of families) {
  /* المرجع: أقدم سجل (بنات غالباً)، وبرمزه واسمه يُنشأ الشقيق. */
  const reference = [...members].sort((a, b) => Number(a.AdSectionId) - Number(b.AdSectionId))[0];
  const present = new Set(members.map(m => Number(m.AdCollegeId)));
  for (const college of targetColleges) {
    if (present.has(Number(college.AdCollegeId))) continue;
    sectionsToCreate++;
    console.log(`  + ${reference.AdSectionName} [${reference.AdSectionCode}] ← ${college.AdCollegeName}`);
    if (APPLY) {
      await Repository.createSection(Number(college.AdCollegeId), String(reference.AdSectionCode || ""), String(reference.AdSectionName));
      sectionsCreated++;
    }
  }
}
if (!sectionsToCreate) console.log("  (لا شيء — كل قسم موجود في الكليات الأربع)");
if (APPLY && sectionsCreated) sections = await Repository.getSections();

/* ── ٢. الحسابات ──────────────────────────────────────────────────────────── */
/* نطاق الحساب = كل أقسام العائلة في الكليات الأربع. في المعاينة تُحسب الأقسام
   المنتظرة كما لو أُنشئت، فتعرض الخطة صورتها النهائية. */
const [users, assigns] = await Promise.all([Repository.getUsers(), Repository.getCollegeUserAssigns()]);
const live = (users as any[]).filter(u => !u.IsDeleted);
const userByLogin = new Map(live.map(u => [String(u.SystemUserLogin).toLowerCase(), u]));

/* بادئة كل عائلة من مخطط المرشدين نفسه، ليتّسق الاسم مع بقية النظام. */
const plan = planAdvisorAccounts({ users: users as any, assigns, colleges, sections });
const planByFamily = new Map(plan.map(row => [departmentFamilyKey(row.sectionName), row]));

let created = 0, widened = 0, wouldCreate = 0, wouldWiden = 0;
const review: string[] = [];
for (const [familyKey, members] of families) {
  const row = planByFamily.get(familyKey);
  const familyName = String(members[0].AdSectionName).trim();
  if (!row || row.status === "review" && !row.existingLogin && /^s\d+/i.test(row.proposedLogin)) {
    review.push(`${familyName}: لا بادئة معروفة لاسم الدخول — حدّدها يدوياً`);
    continue;
  }
  if (row.status === "review" && row.note) { review.push(`${familyName}: ${row.note}`); continue; }
  const prefix = row.proposedLogin.replace(/advisor$/i, "");
  if (!prefix || /^\d/.test(prefix)) { review.push(`${familyName}: بادئة غير صالحة (${prefix || "فارغة"})`); continue; }

  const familySections = (sections as any[]).filter(s => targetIds.has(Number(s.AdCollegeId)) && departmentFamilyKey(s.AdSectionName) === familyKey);
  const desired: Scope[] = familySections.map(s => ({ AdCollegeId: Number(s.AdCollegeId), AdSectionId: Number(s.AdSectionId) }));
  const desiredColleges = new Set(targetColleges.map(c => Number(c.AdCollegeId)));
  const coveredColleges = new Set(desired.map(d => d.AdCollegeId));
  const pendingColleges = [...desiredColleges].filter(id => !coveredColleges.has(id)).length; // معاينة فقط

  for (const kind of KINDS) {
    const login = `${prefix}${kind.suffix}`;
    const existing = userByLogin.get(login.toLowerCase());
    if (!existing) {
      console.log(`  + حساب ${login} (${kind.namePrefix} ${familyName}) — ${desired.length + pendingColleges} نطاق`);
      if (APPLY) {
        const def = roleDefinition(kind.role);
        const user = await Repository.createUser({
          Name: `${kind.namePrefix} ${familyName}`, SystemUserLogin: login, SystemUserPass: "",
          IsAdminUser: false, IsActive: false, IsLocked: false, IsDeleted: false, AdInstructorId: 0, Role: kind.role,
        } as any);
        await Repository.saveSecurityByUser(user.SystemUserId, def.formIds);
        await Repository.saveUserAssigns(user.SystemUserId, desired);
        userByLogin.set(login.toLowerCase(), user as any);
        created++;
      } else wouldCreate++;
      continue;
    }
    const current = (assigns as any[]).filter(a => Number(a.SystemUserId) === Number(existing.SystemUserId));
    const have = new Set(current.map(scopeKey));
    const missing = desired.filter(d => !have.has(scopeKey(d)));
    if (!missing.length && !pendingColleges) continue;
    console.log(`  ~ توسيع ${existing.SystemUserLogin}: +${missing.length + pendingColleges} نطاق (${familyName})`);
    if (APPLY && missing.length) {
      await Repository.saveUserAssigns(Number(existing.SystemUserId), [...current.map(a => ({ AdCollegeId: Number(a.AdCollegeId), AdSectionId: Number(a.AdSectionId) })), ...missing]);
      widened++;
    } else if (!APPLY) wouldWiden++;
  }
}

if (review.length) { console.log("\n── للمراجعة اليدوية (لم يُمسّ شيء منها)"); for (const line of review) console.log(`  ? ${line}`); }
console.log(APPLY
  ? `\nأُنشئ: ${sectionsCreated} قسماً، ${created} حساباً (موقوفة وبلا كلمة سر)، ووُسّع نطاق ${widened} حساباً.`
  : `\nمعاينة: ${sectionsToCreate} قسماً و${wouldCreate} حساباً سيُنشأ، ونطاق ${wouldWiden} حساباً سيُوسَّع. أعد التشغيل مع --apply.`);
process.exit(0);
