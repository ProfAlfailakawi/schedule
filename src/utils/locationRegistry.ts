import type { FSchedule, LocationConfidence, MasterBuilding, MasterRoom, ScheduleLocationStatus } from "../types";

export const PENDING_ROOM = "PENDING_ROOM" as const;
const INVALID = new Set(["", "0", "00", "000", "-", "--", "---", "TBA", "N/A", "NA", "NONE", "NULL", "بدون", "بدونقاعة", "الغاء", "إلغاء"]);

export const normalizeLocationToken = (value: unknown): string => String(value ?? "")
  .normalize("NFKC")
  .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
  .trim().toUpperCase().replace(/\s+/g, "");

export const compareLocationCodes = (a: unknown, b: unknown): number =>
  normalizeLocationToken(a).localeCompare(normalizeLocationToken(b), "en", { numeric: true, sensitivity: "base" });

export const isInvalidLocationToken = (value: unknown): boolean => {
  const token=normalizeLocationToken(value);
  if(INVALID.has(token)||token.startsWith("TBA")||token.startsWith("TBD"))return true;
  if(/^(CANCEL|CANCELED|CANCELLED|CANCELATION|CANCELLATION)$/.test(token))return true;
  if(["ملغي","ملغى","ملغيه","ملغية"].includes(token))return true;
  // Pure punctuation/garbage produced by historical placeholders or OCR is not a building/room.
  return /^[#?._\/\\-]+$/.test(token);
};

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
  const token=normalizeLocationToken(raw);
  const roomSectionBuildingIds=context.sectionId?new Set(registry.rooms.filter(r=>r.confidence==="CONFIRMED"&&r.sectionIds.includes(Number(context.sectionId))).map(r=>r.buildingId)):new Set<string>();
  const inContext=(b:MasterBuilding)=>
    (!context.collegeId || b.collegeIds.includes(Number(context.collegeId)) || !b.collegeIds.length) &&
    (!context.sectionId || b.sectionIds.includes(Number(context.sectionId)) || roomSectionBuildingIds.has(b.id) || !b.sectionIds.length);
  const candidates = registry.buildings.filter(b => aliasMatches(b.officialCode,b.aliases,raw)).filter(inContext);
  if (candidates.length === 1) {
    const b=candidates[0]; return {status:b.confidence,value:b,evidence:[...b.evidence,`حُسم داخل سياق الكلية/القسم إلى ${b.officialCode}.`]};
  }
  if (candidates.length > 1) return {status:"REVIEW_REQUIRED",evidence:[`القيمة تطابق ${candidates.length} مبانٍ في السياق.`]};

  const full=canonicalBuildingShape(raw);
  const exact=full ? registry.buildings.filter(b=>b.officialCode===full && inContext(b)) : [];
  if(exact.length===1){const b=exact[0];return {status:b.confidence,value:b,evidence:[`تطابق كود كامل ${b.officialCode}.`]};}

  // Safe historical short-code recovery. A bare building number (8/008), a short
  // site+number (B8/B08), or a code missing only leading zeroes is accepted only
  // when the college/section context leaves one CONFIRMED building.
  if(context.collegeId){
    const contextual=registry.buildings.filter(b=>b.confidence==="CONFIRMED"&&inContext(b));
    let shaped:MasterBuilding[]=[];
    if(/^0*\d{1,3}$/.test(token)){
      const n=Number(token); shaped=contextual.filter(b=>Number(b.buildingNumber)===n);
    }else{
      const short=token.match(/^([A-Z])0*(\d{1,3})$/);
      if(short){const n=Number(short[2]); shaped=contextual.filter(b=>Number(b.buildingNumber)===n&&normalizeLocationToken(b.officialCode).includes(short[1]));}
      if(!shaped.length){const stripped=token.replace(/^0+/,"");shaped=contextual.filter(b=>normalizeLocationToken(b.officialCode).replace(/^0+/,"")===stripped);}
    }
    if(shaped.length===1){const b=shaped[0];return {status:"CONFIRMED",value:b,evidence:[`حُسم الاختصار ${token} سياقيًا إلى المبنى الرسمي ${b.officialCode}؛ لا يوجد منافس داخل الكلية/القسم.`]};}
  }
  return {status:"REVIEW_REQUIRED",evidence:["لا يوجد ربط سياقي وحيد وآمن في السجل."]};
}

export function resolveRoom(registry: LocationRegistry, raw: unknown, buildingId: string, context: ResolveContext = {}): Resolution<MasterRoom> {
  if (normalizeLocationToken(raw)===PENDING_ROOM) return {status:"REVIEW_REQUIRED",evidence:["PENDING_ROOM حالة نظام وليست قاعة."]};
  if (isInvalidLocationToken(raw)) return {status:"INVALID",evidence:["القيمة Placeholder أو فارغة."]};
  const token=normalizeLocationToken(raw);
  const base=registry.rooms.filter(r=>r.buildingId===buildingId&&r.confidence==="CONFIRMED")
    .filter(r=>!context.collegeId||r.collegeIds.includes(Number(context.collegeId))||!r.collegeIds.length);
  const exact=base.filter(r=>aliasMatches(r.canonicalCode,r.aliases,raw));
  if(exact.length===1){const r=exact[0];return {status:"CONFIRMED",value:r,evidence:[...r.evidence,`هوية القاعة مقيدة بالمبنى ${r.buildingCode}.`]};}
  if(exact.length>1)return {status:"REVIEW_REQUIRED",evidence:["أكثر من مرشح للقاعة داخل المبنى."]};

  // F6/f06/F 06 -> F06, but never invent a letter for a bare number.
  const shaped=canonicalRoomShape(raw);
  if(shaped){
    const shapedMatches=base.filter(r=>canonicalRoomShape(r.canonicalCode)===shaped);
    if(shapedMatches.length===1){const r=shapedMatches[0];return {status:"CONFIRMED",value:r,evidence:[`تطبيع آمن لصيغة القاعة ${token} إلى ${r.canonicalCode} داخل المبنى ${r.buildingCode}.`]};}
  }

  // Bare historical numbers are resolved only when the room fingerprint is unique.
  // Prefer the current section if several lettered rooms share the same number.
  if(/^0*\d+$/.test(token)){
    const n=Number(token);
    const sameNumber=base.filter(r=>{const m=normalizeLocationToken(r.canonicalCode).match(/(\d+)[A-Z]?$/);return m&&Number(m[1])===n;});
    if(sameNumber.length===1){const r=sameNumber[0];return {status:"CONFIRMED",value:r,evidence:[`الرقم ${token} يطابق قاعة رسمية واحدة فقط داخل ${r.buildingCode}: ${r.canonicalCode}.`]};}
    if(context.sectionId&&sameNumber.length>1){
      const sectionMatches=sameNumber.filter(r=>r.sectionIds.includes(Number(context.sectionId)));
      if(sectionMatches.length===1){const r=sectionMatches[0];return {status:"CONFIRMED",value:r,evidence:[`الرقم ${token} له عدة احتمالات داخل المبنى، لكن بصمة القسم تحصره في ${r.canonicalCode}.`]};}
    }
    if(sameNumber.length>1)return {status:"REVIEW_REQUIRED",evidence:[`الرقم ${token} يطابق أكثر من قاعة داخل المبنى: ${sameNumber.map(r=>r.canonicalCode).join("، ")}.`]};
  }
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
  const rooms=registry.rooms.filter(r=>r.active&&r.confidence==="CONFIRMED"&&r.buildingId===buildingId).sort((a,b)=>compareLocationCodes(a.canonicalCode,b.canonicalCode));
  return {
    own:rooms.filter(r=>sectionId&&r.sectionIds.includes(sectionId)&&!r.shared),
    shared:rooms.filter(r=>r.shared&&(!sectionId||r.sectionIds.includes(sectionId))),
    other:rooms.filter(r=>!r.shared&&r.sectionIds.length===0),
  };
}
