/**
 * ── طلبات الحملات من ملف الشراكة ───────────────────────────────────────────────
 *
 * الشركة تضغط «حملة جديدة» في رابطها وتترك اسمها وجوّالها (وبريدها إن شاءت) وما تريده؛ فيصل
 * الإدارةَ إشعارٌ وتتواصل هي. هذا الملف تنظيفٌ وتحققٌ نقيّان: لا يكتب شيئاً ولا يعرف الشبكة.
 */
import { SEASONS } from "./adSeasons";
import { activeSlots } from "./adsEngine";

export interface LeadFields {
  company: string; name: string; phone: string; email: string; slots: string[]; season: string; note: string;
}
/** إما `error` (رسالةٌ عربية للشركة) وإما `lead` منظَّف. */
export type LeadResult = { error: string; lead?: undefined } | { error?: undefined; lead: LeadFields };

/** رسائل الخطأ المعروفة وحدها تُعرض في الصفحة العامة (لا نعكس نصاً من الرابط). */
export const LEAD_ERRORS = ["اكتب اسم الشركة.", "اكتب اسمك.", "اكتب رقم جوّالٍ صحيحاً.", "البريد غير صحيح."] as const;

const DIGITS = "٠١٢٣٤٥٦٧٨٩";
/** أرقامٌ لاتينية فقط، بلا فواصل أو رموز؛ والأرقام الهندية تُحوَّل. */
export function cleanPhone(raw: unknown): string {
  return String(raw ?? "").replace(/[٠-٩]/g, d => String(DIGITS.indexOf(d))).replace(/\D/g, "");
}
/** رقم واتساب: رقمٌ محلي من ثمانية أرقام يُسبق برمز الكويت. */
export const whatsappPhone = (phone: string): string => (/^\d{8}$/.test(phone) ? `965${phone}` : phone.replace(/^00/, ""));

const clean = (raw: unknown, max: number): string =>
  String(raw ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

const emailOk = (v: string) => v.length <= 120 && /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/.test(v);

export function cleanLead(body: any): LeadResult {
  const company = clean(body?.company, 80);
  const name = clean(body?.name, 60);
  const phone = cleanPhone(body?.phone);
  const email = clean(body?.email, 120).toLowerCase();
  if (company.length < 2) return { error: "اكتب اسم الشركة." };
  if (name.length < 2) return { error: "اكتب اسمك." };
  if (phone.length < 8 || phone.length > 15) return { error: "اكتب رقم جوّالٍ صحيحاً." };
  if (email && !emailOk(email)) return { error: "البريد غير صحيح." };
  const valid = new Set(activeSlots().map(s => s.id));
  const rawSlots = Array.isArray(body?.slots) ? body.slots : body?.slots != null ? [body.slots] : [];
  const slots = [...new Set(rawSlots.map((x: unknown) => String(x)).filter((x: string) => valid.has(x)))].slice(0, 8) as string[];
  const seasonRaw = String(body?.season ?? "");
  const season = SEASONS.some(s => s.id === seasonRaw) ? seasonRaw : "";
  return { lead: { company, name, phone, email, slots, season, note: clean(body?.note, 300) } };
}
