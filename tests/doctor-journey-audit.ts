/**
 * ── رحلة عضو هيئة التدريس (بطاقتي، التقويم، رابط الطلب، البديل) ─────────────
 * كل بندٍ هنا يقابل ملاحظةً من تدقيق «الأدوار الستة» (D1…D17). الاختبار سلوكيٌّ
 * حيث تكون القاعدة دالّةً نقيّة، وبنيويٌّ حيث يجب ألّا يكون للقاعدة نسخةٌ ثانية.
 */
import fs from "fs";
import path from "path";
import { createHmac } from "crypto";
import {
  CALENDAR_KEY_LABEL, calendarFeedKey, createCalendarSecretResolver, deriveCalendarSecret,
} from "../src/server/calendarSecret";
import { buildCalendar, calendarSpanForTerm } from "../src/utils/icalendar";
import { createAttemptLimiter, limiterOptionsFromEnv } from "../src/server/publicAttemptLimiter";
import { termPhase } from "../src/utils/termSequence";
import { storableMobile, whatsappNumber } from "../src/utils/reachInstructor";
import { AR, nounFor } from "../src/utils/arabicCount";
import { normalizeCivilId, sameCivilId } from "../src/utils/civilId";
import { coverConflict } from "../src/utils/coverAvailability";
import { chosenAlternativeIndex } from "../src/utils/requestAlternatives";
import { TERM_LINK_FALLBACK_DAYS, personalLinkReadable, requestsCloseAtFromDate, termLinkExpiresAt } from "../src/utils/shareLinkLifetime";

let passed = 0, failed = 0;
function check(condition: unknown, name: string) {
  if (condition) { passed++; console.log(`\x1b[32m✓ ${name}\x1b[0m`); }
  else { failed++; console.log(`\x1b[31m✗ ${name}\x1b[0m`); }
}
const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");
const server = read("server.ts");
const repository = read("src/db/repository.ts");

async function main() {
  /* ── D1: مفتاح التقويم ثابتٌ عبر النسخ والإقلاعات ───────────────────────── */
  {
    const shared = "0".repeat(64);
    check(deriveCalendarSecret(" configured ", shared) === "configured", "D1 CALENDAR_SECRET إن ضُبط هو الحَكَم");
    const derived = deriveCalendarSecret("", shared);
    check(derived === deriveCalendarSecret(undefined, shared), "D1 الاشتقاق حتميّ");
    check(derived !== shared, "D1 لا يُستعمل السرّ المشترك نفسه مفتاحاً للتقويم");
    check(derived !== createHmac("sha256", shared).update("student-case-identity-v1").digest("hex"),
      "D1 وسمُ التقويم غير وسم هوية حالات الطلبة");
    check(CALENDAR_KEY_LABEL.includes("calendar"), "D1 الوسم يسمّي غرضه");
    let threw = false; try { deriveCalendarSecret("", " "); } catch { threw = true; }
    check(threw, "D1 سرٌّ مشترك فارغ خطأٌ صريح لا مفتاحٌ ضعيف");

    /* مخزنٌ مشترك يحاكي Firestore: يُنشأ السرّ مرّةً واحدة، ومن جاء بعدها يقرؤه. */
    let stored = ""; let reads = 0;
    const sharedStore = async () => { reads++; if (!stored) stored = "f".repeat(64); return stored; };
    const instanceA = createCalendarSecretResolver(() => undefined, sharedStore);
    const instanceB = createCalendarSecretResolver(() => "", sharedStore);
    const [a, b] = await Promise.all([instanceA(), instanceB()]);
    check(a === b, "D1 نسختان للخادم (إقلاعان باردان) تعطيان السرّ نفسه");
    check(calendarFeedKey(a, "tok", 7) === calendarFeedKey(b, "tok", 7), "D1 ومفتاحُ الاشتراك نفسه للأستاذ نفسه");
    await instanceA(); await instanceA();
    check(reads === 2, "D1 كل نسخةٍ تقرأ المخزن مرّةً واحدة ثم من الذاكرة");
    const restarted = createCalendarSecretResolver(() => undefined, sharedStore);
    check(await restarted() === a, "D1 إعادة الإقلاع لا تقتل الاشتراكات");
    check(await createCalendarSecretResolver(() => "env-secret", sharedStore)() === "env-secret", "D1 المتغيّر يغلب السرّ المحفوظ");

    let attempts = 0;
    const flaky = createCalendarSecretResolver(() => undefined, async () => { attempts++; if (attempts === 1) throw new Error("down"); return "e".repeat(64); });
    let firstFailed = false; try { await flaky(); } catch { firstFailed = true; }
    check(firstFailed && (await flaky()) === deriveCalendarSecret("", "e".repeat(64)), "D1 فشلُ القراءة لا يُحفظ: الطلب التالي يعيد المحاولة");

    check(!/CALENDAR_SECRET\s*\|\|\s*randomBytes/.test(server), "D1 لا سرّ تقويم عشوائي لكل إقلاع");
    check(server.includes("createCalendarSecretResolver(() => process.env.CALENDAR_SECRET, () => Repository.getSharedServerSecret())"),
      "D1 الخادم يشتقّ من السرّ المشترك المحفوظ");
    check((server.match(/\|\$\{instructorId\}`/g) || []).length === 0, "D1 لا نسخة ثانية من صيغة مفتاح الاشتراك في الخادم");
    check(repository.includes("getSharedServerSecret") && repository.includes("demoSandboxContext.exit(() => getOrCreateStudentCaseSecret())"),
      "D1 السرّ المشترك يُقرأ خارج صندوق العرض");
    check(repository.includes("localStudentCaseSecretCache"), "D1 سرُّ الملف المحلي لا يلوّث ذاكرة السرّ المشترك");
    check(server.includes('if(!legacyCalendarSecret) return "";'), "D1 جسرُ الحالات القديمة يبقى للسرّ المضبوط وحده");
  }


  /* ── D2: بطاقة الأستاذ تعيش الفصل، والموعدُ يحكم الطلبات وحدها ───────────── */
  {
    const now = Date.parse("2026-09-25T10:00:00Z");
    const declared = { AdTermName: "الأول 2026/2027", AdTermStart: "2026-09-13", AdTermWeeks: 16 };
    const end = termLinkExpiresAt(declared, now);
    check(end === new Date(Date.parse("2026-09-13T00:00:00") + 16 * 7 * 86400000).toISOString(), "D2 الرابط ينتهي بنهاية الفصل المعلن");
    const named = termLinkExpiresAt({ AdTermName: "الفصل الثاني 2026/2027" }, now);
    check(Date.parse(named) > Date.parse("2027-05-01") && Date.parse(named) < Date.parse("2027-06-15"), "D2 فصلٌ بلا تاريخ يُستنبط من اسمه (الثاني ينتهي في مايو)");
    const unknown = termLinkExpiresAt({ AdTermName: "فصل" }, now);
    check(unknown === new Date(now + TERM_LINK_FALLBACK_DAYS * 86400000).toISOString(), "D2 فصلٌ مجهول ← ‎+150‎ يوماً");
    const past = termLinkExpiresAt({ AdTermName: "الأول 2020/2021" }, now);
    check(Date.parse(past) > now, "D2 رابطٌ لفصلٍ مضى لا يولد منتهياً");
    check(requestsCloseAtFromDate("2026-10-08") === "2026-10-08T23:59:59.999Z" && requestsCloseAtFromDate("غدا") === "", "D2 صيغةُ آخر موعد واحدة");

    const shareRoute = server.slice(server.indexOf('app.post("/api/share"'), server.indexOf('app.delete("/api/share/:id"'));
    check(shareRoute.includes("termLinkExpiresAt(terms.find(row => row.AdTermId === termId))") && shareRoute.includes('kind === "staff"'),
      "D2 الخادم يحسب عمر البطاقة من الفصل");
    check(shareRoute.includes("requestsCloseAt"), "D2 الرابط يحفظ موعد الطلبات منفصلاً");
    const publish = read("src/components/SchedulePublish.tsx");
    check(publish.includes('const linkDays = kind === "survey" && closesAt'), "D2 المتصفح لا يقصّ عمر البطاقة على موعد الطلبات");
    check(publish.includes("requestsCloseAt: closesAt"), "D2 الموعد يُرسل موعداً للطلبات لا مدّةً للرابط");
    check(!server.includes("اشتراك دائم"), "D2 لا تقول البطاقة «اشتراك دائم» وهي تنتهي");
    check(server.includes("حتى نهاية الفصل"), "D2 البطاقة تقول صراحةً إن الاشتراك حتى نهاية الفصل");
    check(server.includes("window: { opensAt, closesAt: requestsCloseAtFromDate(closesAt) }"), "D2 نافذة الطلب تُحسب بالدالة نفسها");
  }


  /* ── D7: فصلٌ بلا تاريخ بداية لا يُرسى على «اليوم» ──────────────────────── */
  {
    const lecture = { id: 1, title: "t", start: "08:00", end: "09:15", days: [0, 2] };
    const term = { AdTermName: "الأول 2026/2027" };
    const span = calendarSpanForTerm(term, 16);
    check(span.source === "default" && span.startDate === "2026-09-10" && span.endDate === "2026-12-31", "D7 حدّا الفصل من اسمه: ١٠ سبتمبر ← ٣١ ديسمبر");
    const build = (now: string) => buildCalendar({ name: "t", weeks: span.weeks, startDate: span.startDate, endDate: span.endDate, now: new Date(now), lectures: [lecture] })
      .split("\r\n").filter(line => line.startsWith("DTSTART;") || line.startsWith("RRULE:")).join("|");
    const early = build("2026-09-20T08:00:00Z"), late = build("2026-11-20T08:00:00Z");
    check(early === late, "D7 قراءتان للاشتراك في شهرين مختلفين تعطيان السلسلة نفسها");
    check(early.includes("DTSTART;TZID=Asia/Kuwait:20260913T080000"), "D7 السلسلة تبدأ بأول أحدٍ في الفصل لا بعد اليوم");
    check(early.includes("UNTIL=20261231T235959Z"), "D7 وتنتهي بآخر يوم في الفصل");
    const declared = calendarSpanForTerm({ AdTermName: "x", AdTermStart: "2026-09-13", AdTermWeeks: 15 }, 16);
    check(declared.source === "declared" && declared.startDate === "2026-09-13" && declared.weeks === 15, "D7 التاريخ المعلن يبقى الحَكَم");
    const none = calendarSpanForTerm({ AdTermName: "فصل" }, 16);
    check(none.source === "none" && !none.startDate && none.weeks === 16, "D7 فصلٌ مجهولٌ تماماً وحده يعود إلى التقدير");
    const send = server.slice(server.indexOf("async function sendCalendar"), server.indexOf('app.get("/api/public/ics/:token", '));
    check(send.includes("calendarSpanForTerm(term,") && !send.includes("const startDate = term?.AdTermStart"), "D7 sendCalendar يأخذ حدّيه من termWindow");
    check(send.includes("تواريخ الفصل تقديرية"), "D7 والملف يقول إنها تقديرية حين تُستنبط من الاسم");
  }


  /* ── D4: الرقم المدني يُطبَّع في موضعٍ واحد ─────────────────────────────── */
  {
    const ascii = "290010112345";
    check(normalizeCivilId("٢٩٠٠١٠١١٢٣٤٥") === ascii, "D4 الأرقام العربية ← لاتينية");
    check(normalizeCivilId("۲۹۰۰۱۰۱۱۲۳۴۵") === ascii, "D4 الأرقام الفارسية ← لاتينية");
    check(normalizeCivilId(" 2900-1011 2345\u200f") === ascii, "D4 المسافات والشرطات وعلامات الاتجاه تُمحى");
    check(sameCivilId("٢٩٠٠١٠١١٢٣٤٥", ascii) && !sameCivilId("", "") && !sameCivilId(null, undefined), "D4 المطابقة: الفارغ لا يطابق شيئاً");
    check(!/AdInstructorCivil[^\n]{0,40}\.replace\(\/\\D\/g/.test(server), "D4 لا نسخة ‎\\D‎ وحدها على رقم الأستاذ");
    check(!/String\([a-z]+\.AdInstructorCivil[^)]*\)\.trim\(\), ?[a-z]+\]/.test(server) && !server.includes('String(i.AdInstructorCivil).trim()'), "D4 لا فهرس استيرادٍ على النصّ الخام");
    const card = server.slice(server.indexOf("async function buildStaffCard"), server.indexOf('app.get("/api/share"'));
    check(card.includes("normalizeCivilId(civil)") && card.includes("sameCivilId(row.AdInstructorCivil, digits)"), "D4 بطاقتي تطبّع بالدالة الواحدة");
    const note = server.slice(server.indexOf('app.post("/api/public/staff/:token/note"'), server.indexOf('app.post("/api/public/staff/:token/note"') + 4000);
    check(note.includes("normalizeCivilId(body.civil)"), "D4 ملاحظة بطاقتي تطبّع بالدالة الواحدة");
    check(server.includes("const storedCivil = normalizeCivilId(signer?.AdInstructorCivil)"), "D4 التوقيع يطبّع بالدالة الواحدة");
    check(server.includes("new Map(instructors.map(row => [normalizeCivilId(row.AdInstructorCivil), row]))"), "D4 الاستيراد يطبّع بالدالة الواحدة");
    check((server.match(/const AdInstructorCivil = normalizeCivilId\(req\.body\?\.AdInstructorCivil\)/g) || []).length === 2, "D4 إضافة الأستاذ وتعديله يخزّنان الصيغة الواحدة");
  }


  /* ── D5: الفصل القادم ليس «سابقاً» ───────────────────────────────────────── */
  {
    const now = Date.parse("2026-09-25T10:00:00Z");
    const current = { AdTermId: 10, AdTermName: "الأول 2026/2027" };
    const upcoming = { AdTermId: 11, AdTermName: "الثاني 2026/2027" };
    const past = { AdTermId: 9, AdTermName: "الصيفي 2025/2026" };
    check(termPhase(current, 10, now) === "current", "D5 الجاري جارٍ");
    check(termPhase(upcoming, 10, now) === "upcoming", "D5 الفصل الذي لم ينتهِ ليس سابقاً");
    check(termPhase(past, 10, now) === "past", "D5 السابق ما انقضت نهايته");
    check(termPhase({ AdTermId: 12, AdTermName: "فصل" }, 10, now) === "upcoming", "D5 فصلٌ بلا نافذة لا يُوصم بالسابق");
    const card = server.slice(server.indexOf("async function buildStaffCard"), server.indexOf('app.get("/api/share"'));
    check(card.includes("termPhase: termPhase("), "D5 البطاقة تحمل موقع الفصل من الزمن");
    const page = server.slice(server.indexOf("function staffCardPage"), server.indexOf("function surveyPage"));
    check(page.includes('phase === "past"') && page.includes("فصل قادم") && page.includes('calendarOpen = phase !== "past"'), "D5 الصفحة تقول «قادم» وتُبقي التقويم");
    check(page.includes('"term="+encodeURIComponent'), "D5 اشتراك الفصل القادم يحمل رقمه");
    const ics = server.slice(server.indexOf('app.get("/api/public/ics/:token/:key"'), server.indexOf('app.get("/api/public/ics/:token/:key"') + 2000);
    check(ics.includes('termPhase(pinnedTerm as any, currentTermId(terms as any)) === "upcoming"'), "D5 التقويم يخدم الفصل القادم المثبّت ولا يفتح به فصلاً انقضى");
  }


  /* ── D6: الحدّ يعدّ الأخطاء لا الدخول ────────────────────────────────────── */
  {
    let t = 0;
    const limiter = createAttemptLimiter({ maxFailures: 3, windowMs: 60_000, now: () => t });
    check(Array.from({ length: 50 }, () => limiter.blocked("tok|ip")).every(blocked => !blocked), "D6 خمسون دخولاً صحيحاً لا تُغلق الباب");
    limiter.fail("tok|ip"); limiter.fail("tok|ip");
    check(!limiter.blocked("tok|ip"), "D6 خطآن تحت الحدّ");
    limiter.fail("tok|ip");
    check(limiter.blocked("tok|ip"), "D6 الخطأ الثالث يغلق");
    check(!limiter.blocked("tok|other"), "D6 عنوانٌ آخر لا يتأثر");
    t += 61_000;
    check(!limiter.blocked("tok|ip"), "D6 النافذة تنقضي فيعود الباب");
    const env = limiterOptionsFromEnv({ PUBLIC_ATTEMPT_MAX_FAILURES: "25", PUBLIC_ATTEMPT_WINDOW_MINUTES: "5" });
    check(env.maxFailures === 25 && env.windowMs === 300_000, "D6 البيئة تضبط الحدّ والنافذة");
    const fallback = limiterOptionsFromEnv({ PUBLIC_ATTEMPT_MAX_FAILURES: "x" });
    check(fallback.maxFailures === 10 && fallback.windowMs === 600_000, "D6 القيم الافتراضية عشرةٌ في عشر دقائق");
    const legacy = createAttemptLimiter({ maxFailures: 2, windowMs: 60_000, now: () => 0 });
    check(legacy.consume("s") && legacy.consume("s") && !legacy.consume("s"), "D6 الأبواب القديمة (استبيان) تبقى على العدّ الكامل");

    const staffPost = server.slice(server.indexOf('app.post("/api/public/staff/:token", '), server.indexOf('app.post("/api/public/staff/:token", ') + 1200);
    check(staffPost.includes("publicAttemptBlocked(token") && staffPost.includes("if (!card) { publicAttemptFailed(token") && !staffPost.includes("staffLookupAllowed"),
      "D6 بطاقتي تُسأل الحدّ وتسجّل الفشل وحده");
    const note = server.slice(server.indexOf('app.post("/api/public/staff/:token/note"'), server.indexOf('app.post("/api/public/staff/:token/note"') + 1500);
    check(note.includes("publicAttemptBlocked(token") && note.includes("publicAttemptFailed(token") && !note.includes("staffLookupAllowed"), "D6 ملاحظة بطاقتي كذلك");
    check(server.includes("publicAttemptBlocked(signScope") && (server.match(/publicAttemptFailed\(signScope/g) || []).length === 2, "D6 التوقيع يسجّل الرقم الخاطئ وحده");
    check(!server.includes("staffAttempts") && !server.includes("STAFF_MAX_TRIES"), "D6 لا عدّاد ثانٍ في الخادم");
  }


  /* ── D3: القرار وبدائله مقروءان بعد الإغلاق، والرابط حتى نهاية الفصل ─────── */
  {
    const alts = [{ day: "fsunday", start: "10:00" }, { days: ["ftuesday", "fsunday"], start: "08:00" }];
    check(chosenAlternativeIndex(alts, ["fsunday"], "10:00") === 0, "D3 مطابقة بديلٍ بيومٍ واحد");
    check(chosenAlternativeIndex(alts, ["fsunday", "ftuesday"], "8:00") === 1, "D3 مطابقة بديلٍ بأيام بلا اعتبار للترتيب");
    check(chosenAlternativeIndex(alts, ["fsunday"], "11:00") === -1 && chosenAlternativeIndex([], ["fsunday"], "10:00") === -1, "D3 لا مطابقة بلا بديلٍ مطابق");
    const now = Date.parse("2026-10-20T10:00:00Z");
    const term = { AdTermName: "الأول 2026/2027" };
    check(personalLinkReadable("2026-10-09T00:00:00Z", term, now), "D3 رابطٌ قديمٌ انتهى بموعد الطلبات يبقى مقروءاً حتى نهاية الفصل");
    check(!personalLinkReadable("2026-10-09T00:00:00Z", { AdTermName: "الأول 2025/2026" }, now), "D3 فصلٌ انقضى لا يمدّ رابطاً منتهياً");
    check(!personalLinkReadable("2026-10-09T00:00:00Z", { AdTermName: "فصل" }, now), "D3 فصلٌ مجهول لا يمدّ رابطاً منتهياً");

    const page = server.slice(server.indexOf("function decisionBox("), server.indexOf("function planTable()"));
    check(page.includes("alts.length&&!open") && page.includes("alts-ro") && page.includes("أُغلق استقبال الطلبات"), "D3 البدائل تُعرض للاطلاع بعد الإغلاق");
    const submit = server.slice(server.indexOf('app.post("/api/public/request/:token", '), server.indexOf('app.post("/api/public/request/:token/check"'));
    check(submit.includes('kind: "alternative-chosen"') && submit.includes("...alternativeEvents"), "D3 اختيار البديل يُسجَّل في الخط الزمني");
    const issue = server.slice(server.indexOf('app.post("/api/instructor-requests/issue"'), server.indexOf('app.post("/api/instructor-requests/issue"') + 9000);
    check(issue.includes("Date.parse(termLinkExpiresAt(issueTerm))"), "D3 رابط الطلب يصدر حتى نهاية الفصل");
    check(server.includes("if (!await personalLinkStillReadable(link)) return { error: \"انتهت صلاحية هذا الرابط\", status: 410 } as const;"), "D3 رابط الطلب القديم يُقرأ حتى نهاية فصله");
    check(submit.includes("requestWindowOpen(resolved.request)"), "D3 الكتابة تبقى محكومةً بنافذة الطلبات");
  }


  /* ── D8: الحذف من قسمٍ كامل يظهر في الحركة، والبطاقة تُفتح ────────────────── */
  {
    const movement = server.slice(server.indexOf("function movementHistoryScopes("), server.indexOf("async function buildStaffCard"));
    check(movement.includes("for (const scope of options.historyScopes || []) movementScopeMap.set("), "D8 أقسام التاريخ تدخل قائمة أقسام الحركة");
    check(movement.includes("request.AdCollegeId") && movement.includes("...extra"), "D8 أقسام الطلبات والقسمُ المصدِر تُضاف");
    const card = server.slice(server.indexOf("async function buildStaffCard"), server.indexOf('app.get("/api/share"'));
    check(card.includes('if (!trace.some(entry => entry.tone === "gone")) return null;'), "D8 من فقد كل صفوفه تُفتح بطاقته، ومن لم يدرّس قطّ يبقى 404");
    check(!/if \(!linkRows\.length\) return null;/.test(card), "D8 لا بوابة «لا صفوف ← 404» بلا نظرٍ في التاريخ");
    check(card.includes("historyScopes: displayTermId === link.AdTermId ? linkHistoryScopes"), "D8 حركة البطاقة تقرأ أقسام التاريخ");
    check(server.includes("historyScopes: movementHistoryScopes([request])"), "D8 حركة صفحة الطلب تقرأ قسم الطلب");
    const page = server.slice(server.indexOf("function staffCardPage"), server.indexOf("function surveyPage"));
    check(page.includes('selectTab(!d.lectureCount && (d.movementHistory||[]).length ? "movement" : "week")') && page.includes("لا محاضرات لك في هذا الفصل"),
      "D8 البطاقة الفارغة تقول «لا محاضرات لك» وتفتح على الحركة");
  }


  /* ── D9: لا تغطيتان في الساعة نفسها ────────────────────────────────────── */
  {
    const rows = [
      { id: 1, AdInstructorId: 10, fstarttime: "08:00", fendtime: "09:15", fsunday: true },  // المطلوب تغطيتها
      { id: 2, AdInstructorId: 11, fstarttime: "08:30", fendtime: "09:45", fsunday: true },  // موعدٌ آخر في الساعة نفسها
      { id: 3, AdInstructorId: 20, fstarttime: "08:00", fendtime: "09:15", fsunday: true },  // محاضرة المرشّح نفسه
      { id: 4, AdInstructorId: 21, fstarttime: "11:00", fendtime: "12:15", fsunday: true },
    ];
    const base = { date: "2026-10-04", dayKey: "fsunday", start: "08:00", end: "09:15", termRows: rows, coveringScheduleId: 1 };
    check(coverConflict({ ...base, instructorId: 21, exceptions: [] }) === null, "D9 مرشّحٌ حرٌّ في تلك الساعة");
    check(coverConflict({ ...base, instructorId: 20, exceptions: [] })?.kind === "weekly", "D9 محاضرته الأسبوعية في الساعة نفسها تمنع");
    check(coverConflict({ ...base, instructorId: 20, exceptions: [{ scheduleId: 3, date: "2026-10-04", kind: "cancel" }] }) === null,
      "D9 محاضرته الملغاة ذلك اليوم لا تمنع");
    const doubled = [{ scheduleId: 2, date: "2026-10-04", kind: "cover" as const, coverInstructorId: 21 }];
    check(coverConflict({ ...base, instructorId: 21, exceptions: doubled })?.kind === "cover", "D9 تغطيةٌ أخرى في الساعة نفسها تمنع");
    check(coverConflict({ ...base, instructorId: 21, exceptions: doubled.map(e => ({ ...e, date: "2026-10-11" })) }) === null, "D9 تغطيةٌ في تاريخٍ آخر لا تمنع");
    check(coverConflict({ ...base, instructorId: 21, exceptions: [{ scheduleId: 1, date: "2026-10-04", kind: "cover", coverInstructorId: 21 }] }) === null,
      "D9 الموعد نفسه لا يتعارض مع نفسه");

    const record = server.slice(server.indexOf('app.post("/api/schedules/:id/exceptions"'), server.indexOf('app.delete("/api/schedules/:id/exceptions/:exceptionId"'));
    check(record.includes("coverConflict({") && record.includes("res.status(409)") && record.includes('"cover-double-booked"'), "D9 التسجيل يرفض التغطية المزدوجة بـ409");
    const rank = server.slice(server.indexOf('app.get("/api/schedules/:id/substitutes"'), server.indexOf('app.get("/api/schedules/:id/substitutes"') + 3000);
    check(rank.includes("busyAtSlot(person.AdInstructorId)") && rank.includes("coverConflict({") && !rank.includes("mine.some(overlapsSlot)"), "D9 الترتيب يستبعد بالقاعدة نفسها");
  }


  /* ── D10: البطاقة بعقد الوقت الواحد ─────────────────────────────────────── */
  {
    const card = server.slice(server.indexOf("async function buildStaffCard"), server.indexOf('app.get("/api/share"'));
    check(card.includes("timeRange: formatScheduleTimeRange(row.fstarttime, row.fendtime)"), "D10 الخادم يصوغ النطاق بـformatScheduleTimeRange");
    const page = server.slice(server.indexOf("function staffCardPage"), server.indexOf("function surveyPage"));
    check(page.includes("esc(row.timeRange") && !page.includes("esc(row.start)+'<wbr>–'+esc(row.end)"), "D10 الصفحة لا تكتب ترتيب البداية–النهاية بنفسها");
  }


  /* ── D11: فصلٌ فارغ لا يُعلن فتح الطلبات ────────────────────────────────── */
  {
    const issue = server.slice(server.indexOf('app.post("/api/instructor-requests/issue"'), server.indexOf('app.post("/api/instructor-requests/issue"') + 9000);
    check(issue.includes("if (!byInstructor.size) {") && issue.includes("emptyTerm: true"), "D11 الخادم يقول إن الفصل فارغ");
    check(issue.indexOf("emptyTerm: true") < issue.indexOf("for (const [instructorId, own] of byInstructor)"), "D11 قبل أي إصدار");
    const publish = read("src/components/SchedulePublish.tsx");
    check(publish.includes("data?.emptyTerm") && publish.includes("لم تُفتح طلبات تعديل لأحد"), "D11 الشاشة تقول الحقيقة لا «فُتحت»");
    check(!publish.includes('.toLocaleString("ar-KW-u-nu-latn")} أستاذاً') && publish.includes("countOf(issued.created, AR.instructor)"), "D11 العدد بـcountOf");
  }


  /* ── D13: ساعات التدريس غير وحدات النصاب ─────────────────────────────────── */
  {
    check(nounFor(3, AR.unit) === "وحدات" && nounFor(12, AR.unit) === "وحدة", "D13 «وحدة» اسمٌ معدود في المعجم الواحد");
    const card = server.slice(server.indexOf("async function buildStaffCard"), server.indexOf('app.get("/api/share"'));
    check(card.includes("const loadUnits = weeklyLoadOf(rows as any, courseById as any);"), "D13 وحدات النصاب بالقاعدة نفسها التي يحكم بها فحص الطلبات");
    check(card.includes("countNouns:") && card.includes("nounFor(shaped.length, AR.lecture)"), "D13 أسماء الأعداد تُصاغ بالقاعدة الواحدة");
    const page = server.slice(server.indexOf("function staffCardPage"), server.indexOf("function surveyPage"));
    check(page.includes("ساعات تدريس أسبوعية") && page.includes('" نصاب"') && !page.includes('["ساعة أسبوعياً"'), "D13 البطاقة تسمّي الرقمين باسميهما");
  }


  /* ── D16: الأسبوعان القادمان وحالة الاعتماد في البطاقة ───────────────────── */
  {
    const card = server.slice(server.indexOf("async function buildStaffCard"), server.indexOf('app.get("/api/share"'));
    check(card.includes("upcomingExceptions") && card.includes("14 * 86400000") && card.includes('timeZone: "Asia/Kuwait"'), "D16 إلغاءات وتغطيات أربعة عشر يوماً بتقويم الكويت");
    check(card.includes('entry.kind === "cover" && Number(entry.coverInstructorId) === Number(person.AdInstructorId)'), "D16 تغطيته لغيره تظهر، ولا يظهر جدول أحدٍ آخر");
    check(card.includes("departmentApprovals") && card.includes("APPROVAL_STATUS_LABEL[status]") && card.includes('approval?.status || "drafting"'), "D16 حالة اعتماد كل قسمٍ بتسميات الدورة نفسها");
    const page = server.slice(server.indexOf("function staffCardPage"), server.indexOf("function surveyPage"));
    check(page.includes('id="approvals"') && page.includes('id="soon"') && page.includes("خلال الأسبوعين القادمين"), "D16 الصفحة تعرضهما للقراءة فقط");
    check(!/id="approvals"[^>]*<button|id="soon"[^>]*<button/.test(page), "D16 لا أزرار فيهما");
  }


  /* ── D17: القسم يكتب جوّال منتدبيه ──────────────────────────────────────── */
  {
    check(storableMobile("٩٩١٢٣٤٥٦") === "99123456" && whatsappNumber("٩٩١٢٣٤٥٦") === "96599123456", "D17 الأرقام العربية في الجوّال تُقرأ ولا تُمحى");
    check(storableMobile("") === "" && storableMobile("1234") === null && storableMobile("+965 5555 1234") === "96555551234", "D17 فارغٌ مقبول، والناقصُ مرفوض، والدوليّ الكامل مقبول");
    const post = server.slice(server.indexOf('app.post("/api/department-delegates/instructor"'), server.indexOf('app.put("/api/department-delegates/:instructorId"'));
    check(post.includes("isScopeAllowed(req,collegeId,sectionId)") && post.includes("storableMobile(req.body?.AdInstructorMobile)") && post.includes("Repository.createInstructor(civil,name,mobile)"),
      "D17 إضافة المنتدب تحفظ جوّاله ضمن نطاق القسم");
    check(post.includes("mobile&&!whatsappNumber(person.AdInstructorMobile)"), "D17 لا يُكتب فوق رقمٍ سجّله قسمٌ آخر");
    const put = server.slice(server.indexOf('app.put("/api/department-delegates/:instructorId"'), server.indexOf('app.delete("/api/department-delegates/:instructorId"'));
    check(put.includes("if(!directory.includes(instructorId))") && put.includes('hasOwnProperty.call(req.body||{},"AdInstructorMobile")'), "D17 التعديل لمن في قائمة القسم وحده، وغياب الحقل يُبقي الرقم");
    check(put.includes("(existing as any).AdInstructorLoad??null"), "D17 تعديل المنتدب لا يمحو نصابه");
    check(server.includes('app.post("/api/department-delegates/instructor", requirePermission(7)') && server.includes('app.put("/api/department-delegates/:instructorId", requirePermission(7)'), "D17 الشاشة ٧ وحدها");
    const ui = read("src/components/ScheduleTransfer.tsx");
    check(ui.includes("AdInstructorMobile: newMobile.trim()") && ui.includes("AdInstructorMobile: editMobile.trim()") && ui.includes("بلا جوّال — لن تصله بطاقته"), "D17 الواجهة تكتب الجوّال وتنبّه لغيابه");
  }

  console.log(`\nDoctor journey audit: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(error => { console.error(error); process.exit(1); });
