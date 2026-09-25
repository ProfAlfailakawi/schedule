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
import { TERM_LINK_FALLBACK_DAYS, requestsCloseAtFromDate, termLinkExpiresAt } from "../src/utils/shareLinkLifetime";

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

  console.log(`\nDoctor journey audit: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(error => { console.error(error); process.exit(1); });
