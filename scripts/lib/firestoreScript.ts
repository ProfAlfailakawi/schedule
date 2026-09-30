/**
 * ── سكربتات البيانات الحقيقية: قراءةٌ أولاً، وكتابةٌ بطلبٍ صريح ─────────────
 *
 * كل سكربتٍ تحت scripts/ يمسّ Firestore يمرّ من هنا: الاتصال بالمتغيّرات
 * نفسها التي يقرؤها الخادم (.env)، وطباعة الهدف قبل أي شيء، و«--apply» وحده
 * يفتح الكتابة. بلا «--apply» لا تُكتب وثيقةٌ واحدة.
 */
import dotenv from "dotenv";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

export const APPLY = process.argv.includes("--apply");

export function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find(arg => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : undefined;
}

export async function connectFirestore(): Promise<Firestore> {
  dotenv.config();
  if (process.env.DATA_MODE && process.env.DATA_MODE !== "firestore") {
    throw new Error(`DATA_MODE=${process.env.DATA_MODE}: هذا السكربت لبيانات Firestore فقط.`);
  }
  if (!getApps().length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      initializeApp({ credential: cert(account), projectId: process.env.FIREBASE_PROJECT_ID || account.project_id });
    } else if (process.env.FIREBASE_PROJECT_ID) initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
    else initializeApp();
  }
  const db = process.env.FIREBASE_DATABASE_ID ? getFirestore(getApps()[0], process.env.FIREBASE_DATABASE_ID) : getFirestore();
  db.settings({ ignoreUndefinedProperties: true });
  const project = String(getApps()[0]?.options?.projectId || process.env.FIREBASE_PROJECT_ID || "(default)");
  console.log(`الهدف: مشروع ${project} · قاعدة ${process.env.FIREBASE_DATABASE_ID || "(default)"} · ${APPLY ? "تطبيق (--apply)" : "معاينة فقط — لن يُكتب شيء"}`);
  return db;
}

export function finish(changes: number) {
  if (!changes) console.log("\nلا شيء يحتاج تغييراً.");
  else if (APPLY) console.log(`\nطُبّق: ${changes}.`);
  else console.log(`\nمعاينة: ${changes} تغيير مقترح. أعد التشغيل مع --apply للتطبيق.`);
}

/** تاريخ اليوم بتوقيت الكويت، YYYY-MM-DD — كما يقرأ المستخدم «٢٧ سبتمبر». */
export function kuwaitDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Kuwait" });
}
