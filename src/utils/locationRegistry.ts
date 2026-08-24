import type { FSchedule, LocationConfidence, MasterBuilding, MasterRoom, ScheduleLocationStatus } from "../types";

export const PENDING_ROOM = "PENDING_ROOM" as const;
const INVALID = new Set(["", "0", "00", "000", "-", "--", "---", "TBA", "N/A", "NA", "NONE", "NULL", "بدون", "بدونقاعة", "الغاء", "إلغاء"]);

export const normalizeLocationToken = (value: unknown): string => String(value ?? "")
  .normalize("NFKC")
  .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
  .trim().toUpperCase().replace(/\s+/g, "");

export const isInvalidLocationToken = (value: unknown): boolean => INVALID.has(normalizeLocationToken(value));

export const canonicalBuildingShape = (value: unknown): string | null => {
  const token = normalizeLocationToken(value);
  if (isInvalidLocationToken(token)) return null;
  const alpha = token.match(/^(\d{1,6})([A-Z])(\d{1,3})$/);
  if (alpha) {
    let num = alpha[3];
    if (num.length === 3 && num.endsWith("0")) num = num.slice(0, 2);
    return `${alpha[1]}${alpha[2]}${num.padStart(2,"0")}`;
  }
  return /^\d{4,10}$/.test(token) ? token : null;
};

export const canonicalRoomShape = (value: unknown): string | null => {
  const token = normalizeLocationToken(value);
  if (isInvalidLocationToken(token) || token === PENDING_ROOM) return null;
  const alpha = token.match(/^([A-Z]+)0*(\d+)([A-Z]?)$/);
  if (alpha) return `${alpha[1]}${Number(alpha[2]) < 100 ? String(Number(alpha[2])).padStart(2,"0") : Number(alpha[2])}${alpha[3]}`;
  return /^[A-Z0-9]{1,12}$/.test(token) && /\d/.test(token) ? token : null;
};

export interface LocationRegistry { buildings: MasterBuilding[]; rooms: MasterRoom[]; }
export interface ResolveContext { collegeId?: number; sectionId?: number; buildingId?: string; }
export interface Resolution<T> { status: LocationConfidence; value?: T; evidence: string[]; }

const aliasMatches = (canonical: string, aliases: readonly {value:string}[], raw: unknown) => {
  const n = normalizeLocationToken(raw);
  return normalizeLocationToken(canonical) === n || aliases.some(a => normalizeLocationToken(a.value) === n);
};

export function resolveBuilding(registry: LocationRegistry, raw: unknown, context: ResolveContext = {}): Resolution<MasterBuilding> {
  if (isInvalidLocationToken(raw)) return {status:"INVALID", evidence:["القيمة Placeholder أو فارغة."]};
  const candidates = registry.buildings.filter(b => aliasMatches(b.officialCode,b.aliases,raw))
    .filter(b => !context.collegeId || b.collegeIds.includes(Number(context.collegeId)) || !b.collegeIds.length)
    .filter(b => !context.sectionId || b.sectionIds.includes(Number(context.sectionId)) || !b.sectionIds.length);
  if (candidates.length === 1) {
    const b=candidates[0]; return {status:b.confidence,value:b,evidence:[...b.evidence,`حُسم داخل سياق الكلية/القسم إلى ${b.officialCode}.`]};
  }
  if (candidates.length > 1) return {status:"REVIEW_REQUIRED",evidence:[`القيمة تطابق ${candidates.length} مبانٍ في السياق.`]};
  const full=canonicalBuildingShape(raw);
  const exact=full ? registry.buildings.filter(b=>b.officialCode===full && (!context.collegeId||b.collegeIds.includes(Number(context.collegeId))||!b.collegeIds.length)) : [];
  if(exact.length===1){const b=exact[0];return {status:b.confidence,value:b,evidence:[`تطابق كود كامل ${b.officialCode}.`]};}
  return {status:"REVIEW_REQUIRED",evidence:["لا يوجد ربط سياقي وحيد وآمن في السجل."]};
}

export function resolveRoom(registry: LocationRegistry, raw: unknown, buildingId: string, context: ResolveContext = {}): Resolution<MasterRoom> {
  if (normalizeLocationToken(raw)===PENDING_ROOM) return {status:"REVIEW_REQUIRED",evidence:["PENDING_ROOM حالة نظام وليست قاعة."]};
  if (isInvalidLocationToken(raw)) return {status:"INVALID",evidence:["القيمة Placeholder أو فارغة."]};
  const candidates=registry.rooms.filter(r=>r.buildingId===buildingId && aliasMatches(r.canonicalCode,r.aliases,raw))
    .filter(r=>!context.collegeId||r.collegeIds.includes(Number(context.collegeId))||!r.collegeIds.length);
  if(candidates.length===1){const r=candidates[0];return {status:r.confidence,value:r,evidence:[...r.evidence,`هوية القاعة مقيدة بالمبنى ${r.buildingCode}.`]};}
  if(candidates.length>1)return {status:"REVIEW_REQUIRED",evidence:["أكثر من مرشح للقاعة داخل المبنى."]};
  return {status:"REVIEW_REQUIRED",evidence:["القاعة غير موجودة رسميًا داخل هذا المبنى."]};
}

export const roomIdentityKey = (row: Partial<FSchedule>): string => {
  if(row.locationStatus==="PENDING_ROOM") return "";
  if(row.roomId) return `id:${row.roomId}`;
  const b=normalizeLocationToken(row.AdRoomCode), r=normalizeLocationToken(row.AdRoomHall);
  return b&&r?`legacy:${b}|${r}`:"";
};

export const buildingIdentityKey = (row: Partial<FSchedule>): string => row.buildingId ? `id:${row.buildingId}` : normalizeLocationToken(row.AdRoomCode);
export const isPendingRoom = (row: Partial<FSchedule>): boolean => row.locationStatus === "PENDING_ROOM";
export const roomDisplay = (row: Partial<FSchedule>): string => isPendingRoom(row) ? "بانتظار تثبيت القاعة" : [row.AdRoomCode,row.AdRoomHall].filter(Boolean).join("/");
export const historicalLocationNeedsReview = (row: Partial<FSchedule>): boolean => row.locationStatus === "LOCATION_REVIEW_REQUIRED" || row.locationStatus === "INVALID_HISTORICAL";

export function locationStats(rows: readonly Partial<FSchedule>[]) {
  const verified=rows.filter(r=>r.locationStatus==="VERIFIED"||Boolean(r.roomId));
  return {
    officialRoomCount:new Set(verified.map(roomIdentityKey).filter(Boolean)).size,
    pendingRoomSchedules:rows.filter(isPendingRoom).length,
    historicalUnverified:rows.filter(r=>r.locationStatus==="LOCATION_REVIEW_REQUIRED").length,
    invalidHistorical:rows.filter(r=>r.locationStatus==="INVALID_HISTORICAL").length,
  };
}

export function roomGroups(registry: LocationRegistry, buildingId: string, sectionId?: number) {
  const rooms=registry.rooms.filter(r=>r.active&&r.confidence==="CONFIRMED"&&r.buildingId===buildingId);
  return {
    own:rooms.filter(r=>sectionId&&r.sectionIds.includes(sectionId)&&!r.shared),
    shared:rooms.filter(r=>r.shared&&(!sectionId||r.sectionIds.includes(sectionId))),
    other:rooms.filter(r=>!r.shared&&r.sectionIds.length===0),
  };
}
