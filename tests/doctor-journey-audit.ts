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

  console.log(`\nDoctor journey audit: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
main().catch(error => { console.error(error); process.exit(1); });
