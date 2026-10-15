import { createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * ── بابُ الطالب: ما يحرسه الخادمُ ──────────────────────────────────────────
 *
 * الرقمُ المدنيُّ ليس سرّاً (يعرفه الزميلُ والقريب)، فلا يكفي مفتاحاً لملفٍ
 * يُبنى عليه جدولُ طالب. فالملفُّ له **رمزٌ شخصيّ** يختاره صاحبُه، يُخزَّن
 * مُلحَّماً (scrypt) لا نصّاً، وخطؤه يُعدّ ويقفل.
 *
 * والجلسةُ بعد الدخول **رمزٌ موقَّع** في كوكي HttpOnly: لا يحمل الرقمَ المدني
 * ولا الاسم، بل البصمةَ وتاريخَ الانتهاء ونسخةً من الرمز الشخصي — فتغييرُ الرمز
 * يُنهي كلَّ الجلسات القديمة. «هذا جهازي» جلسةٌ طويلة؛ وغيرُه جلسةٌ تنتهي بإغلاق
 * المتصفح (والمتصفحُ الخفيُّ يغلقها بإغلاقه) — الملفُّ نفسُه على الخادم لا يضيع.
 */

export const DOOR_COOKIE = "sh_session";

const scryptAsync = (secret: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => scrypt(secret, salt, 32, { N: 16384, r: 8, p: 1 }, (error, key) => (error ? reject(error) : resolve(key as Buffer))));

export async function hashCode(code: string, saltB64?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltB64 ? Buffer.from(saltB64, "base64url") : randomBytes(16);
  const key = await scryptAsync(code, salt);
  return { hash: key.toString("base64url"), salt: salt.toString("base64url") };
}

export async function verifyCode(code: string, hash: string | undefined, salt: string | undefined): Promise<boolean> {
  if (!hash || !salt) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = Buffer.from((await hashCode(code, salt)).hash, "base64url");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export interface DoorSession { fingerprint: string; exp: number; cv: string }

/** نسخةُ الرمز في الجلسة: أولُ ثمانيةٍ من تجزئته، فيُنهي تغييرُه الجلساتِ القديمة. */
export const codeVersion = (codeHash: string | undefined): string => String(codeHash || "").slice(0, 8);

export function signDoorSession(key: Buffer, session: DoorSession): string {
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${body}.${createHmac("sha256", key).update(`door|${body}`).digest("base64url")}`;
}

export function readDoorSession(key: Buffer, token: string | undefined, now: number): DoorSession | null {
  try {
    const [body, signature] = String(token || "").split(".");
    if (!body || !signature) return null;
    const expected = createHmac("sha256", key).update(`door|${body}`).digest("base64url");
    const a = Buffer.from(signature), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const session = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as DoorSession;
    if (!session.fingerprint || !Number.isFinite(session.exp) || session.exp <= now) return null;
    return session;
  } catch { return null; }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of String(header || "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) return decodeURIComponent(part.slice(at + 1).trim());
  }
  return undefined;
}

/** سطرُ Set-Cookie. `remember` يعطيه عمراً؛ بدونه يزول بإغلاق المتصفح. */
export function doorCookie(token: string, options: { remember: boolean; maxAgeSeconds: number; secure: boolean }): string {
  return `${DOOR_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${options.remember ? `; Max-Age=${options.maxAgeSeconds}` : ""}${options.secure ? "; Secure" : ""}`;
}

export const clearDoorCookie = (secure: boolean): string =>
  `${DOOR_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
