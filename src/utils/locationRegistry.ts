import type { FSchedule, LocationConfidence, MasterBuilding, MasterRoom, ScheduleLocationStatus } from "../types";
import { recoverOfficialBuildingCodeFromAuthorityCell } from "./locationCollegePrefixes";

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
  return /^[#?._\/\\*+=~!|:;,-]+$/.test(token);
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

export type AuthorityLocationMethod =
  | "EXACT_REGISTRY"
  | "CONTEXT_UNIQUE"
  | "BRANCH_RECOVERY"
  | "NUMERIC_SITE_RECOVERY"
  | "BORDER_BLEED_RECOVERY"
  | "UNIQUE_ROOM_FINGERPRINT"
  | "UNRESOLVED";

export interface AuthorityLocationResolution {
  building: Resolution<MasterBuilding>;
  room?: Resolution<MasterRoom>;
  buildingMethod: AuthorityLocationMethod;
  buildingScore: number;
  roomScore: number;
  recoveredBuildingCode?: string;
}

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

/**
 * Last-resort building recovery from a room fingerprint. This is intentionally
 * conservative: the room must already exist in the CONFIRMED registry and,
 * after optional Authority branch/site filtering, it must point to ONE building
 * only. It is useful when a scan damages the building glyph but preserves a
 * distinctive room such as F31. Ambiguous rooms (F10/F12/...) stay unresolved.
 */
export function resolveBuildingFromUniqueRoom(
  registry: LocationRegistry,
  rawRoom: unknown,
  context: ResolveContext & { branchRoot?: string; sitePrefix?: string } = {},
): Resolution<MasterBuilding> {
  if (isInvalidLocationToken(rawRoom)) return {status:"INVALID", evidence:["القاعة فارغة أو Placeholder."]};
  const token=normalizeLocationToken(rawRoom);
  const shaped=canonicalRoomShape(rawRoom);
  const branchRoot=String(context.branchRoot||"").replace(/\D/g,"").slice(0,3);
  const sitePrefix=normalizeLocationToken(context.sitePrefix||"");
  const confirmedBuildings=new Map(registry.buildings
    .filter(b=>b.confidence==="CONFIRMED"&&b.active!==false)
    .filter(b=>!branchRoot||normalizeLocationToken(b.officialCode).startsWith(branchRoot))
    .filter(b=>!sitePrefix||normalizeLocationToken(b.sitePrefix||b.officialCode.slice(0,4))===sitePrefix)
    .map(b=>[b.id,b] as const));
  if(!confirmedBuildings.size)return {status:"REVIEW_REQUIRED",evidence:["لا توجد مبانٍ مؤكدة في نطاق الفرع/الموقع المحدد."]};

  const roomMatches=registry.rooms.filter(r=>r.confidence==="CONFIRMED"&&confirmedBuildings.has(r.buildingId)).filter(r=>{
    if(aliasMatches(r.canonicalCode,r.aliases,rawRoom))return true;
    return Boolean(shaped&&canonicalRoomShape(r.canonicalCode)===shaped);
  });
  const buildingIds=[...new Set(roomMatches.map(r=>r.buildingId))];
  if(buildingIds.length===1){
    const building=confirmedBuildings.get(buildingIds[0]);
    if(building)return{status:"CONFIRMED",value:building,evidence:[`القاعة ${token} موجودة رسمياً تحت مبنى واحد فقط في النطاق: ${building.officialCode}.`]};
  }
  if(buildingIds.length>1)return{status:"REVIEW_REQUIRED",evidence:[`القاعة ${token} موجودة تحت أكثر من مبنى: ${buildingIds.map(id=>confirmedBuildings.get(id)?.officialCode).filter(Boolean).join("، ")}.`]};
  return{status:"REVIEW_REQUIRED",evidence:[`القاعة ${token} لا تعطي بصمة مبنى وحيدة داخل السجل الرسمي.`]};
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

  /* Same-cell OCR repair, still constrained by the OFFICIAL room registry.
     On the photographed Authority sheet F07 is commonly read as FO7: the round
     zero is the only ambiguous glyph. Convert OCR-confusable characters only in
     the numeric tail, then accept the result only when exactly one confirmed
     room under THIS building owns that canonical code. This never creates a new
     room and never borrows a room from another building. */
  const ocrRoom=token.match(/^([A-Z])([0-9OIL]{1,3})$/);
  if(ocrRoom){
    const digits=ocrRoom[2].replace(/O/g,"0").replace(/[IL]/g,"1");
    const repaired=`${ocrRoom[1]}${digits}`;
    if(repaired!==token){
      const repairedMatches=base.filter(r=>canonicalRoomShape(r.canonicalCode)===canonicalRoomShape(repaired));
      if(repairedMatches.length===1){const r=repairedMatches[0];return {status:"CONFIRMED",value:r,evidence:[`استعادة OCR مقيدة بالمبنى: ${token} ← ${r.canonicalCode} داخل ${r.buildingCode}.`]};}
      if(repairedMatches.length>1)return {status:"REVIEW_REQUIRED",evidence:[`إصلاح OCR ${token} يطابق أكثر من قاعة داخل المبنى.`]};
    }
  }

  /* PHANTOM-DIGIT REPAIR, registry-exact. A photographed grid rule beside the
     narrow room cell is read as an extra digit: F11 -> F111, F33 -> F331/F133.
     Official rooms in this family are letter + two digits, so a three-digit
     token that matched nothing is offered exactly two candidates — drop the
     LAST digit or drop the FIRST digit — and is accepted only when precisely
     ONE of them is a CONFIRMED room of THIS building. Two live candidates go
     to review; nothing is ever invented. */
  /* The phantom can also PRECEDE the letter (1F07 -> F07) and may carry the
     usual O/I/L glyph confusion in its numeric tail; normalize the tail the
     same way the ocrRoom repair above does before offering candidates. */
  const leadPhantom=token.match(/^\d([A-Z])([0-9OIL]{2})$/);
  if(leadPhantom){
    const candidate=`${leadPhantom[1]}${leadPhantom[2].replace(/O/g,"0").replace(/[IL]/g,"1")}`;
    const hits=base.filter(r=>canonicalRoomShape(r.canonicalCode)===canonicalRoomShape(candidate));
    if(hits.length===1){const r=hits[0];return {status:"CONFIRMED",value:r,evidence:[`رقم شبح قبل حرف القاعة: ${token} ← ${r.canonicalCode} (قاعة مؤكدة وحيدة داخل ${r.buildingCode}).`]};}
    if(hits.length>1)return {status:"REVIEW_REQUIRED",evidence:[`إصلاح ${token} يطابق أكثر من قاعة داخل المبنى.`]};
  }
  const phantom=token.match(/^([A-Z])(\d{3})$/);
  if(phantom){
    const candidates=[...new Set([`${phantom[1]}${phantom[2].slice(0,2)}`,`${phantom[1]}${phantom[2].slice(1)}`])];
    const hits=candidates
      .map(code=>base.filter(r=>canonicalRoomShape(r.canonicalCode)===canonicalRoomShape(code)))
      .filter(list=>list.length===1).map(list=>list[0]);
    const unique=[...new Set(hits)];
    if(unique.length===1){const r=unique[0];return {status:"CONFIRMED",value:r,evidence:[`رقم شبح من حد الجدول: ${token} ← ${r.canonicalCode} (قاعة مؤكدة وحيدة داخل ${r.buildingCode}).`]};}
    if(unique.length>1)return {status:"REVIEW_REQUIRED",evidence:[`القراءة ${token} تحتمل ${unique.map(r=>r.canonicalCode).join(" أو ")} داخل المبنى؛ تحتاج تأكيدًا يدويًا.`]};
  }

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


/**
 * Single Authority location resolver used by PDF import.
 *
 * The importer is not allowed to invent campus semantics in multiple places.
 * Every row therefore comes through this one finite-state resolver:
 *   source building cell -> CONFIRMED building registry -> room under THAT building.
 *
 * A six-digit number is not a building merely because its shape looks plausible.
 * Numeric campus codes (0510/0520/0410/0420) are accepted only as exact official
 * registry identities, or through a unique recovery tied to the selected site's
 * official prefix. Seat/capacity welds such as 345045/520020 cannot pass.
 */
export function resolveAuthorityLocation(
  registry: LocationRegistry,
  input: {
    rawBuilding: unknown;
    rawRoom: unknown;
    collegeId?: number;
    sectionId?: number;
    branchRoot?: string;
    sitePrefix?: string;
    knownOfficialCodes?: readonly string[];
  },
): AuthorityLocationResolution {
  const rawBuilding=input.rawBuilding;
  const rawRoom=input.rawRoom;
  const token=normalizeLocationToken(rawBuilding);
  const branchRoot=String(input.branchRoot||"").replace(/\D/g,"").slice(0,3);
  const sitePrefix=normalizeLocationToken(input.sitePrefix||"");
  const known=[...new Set((input.knownOfficialCodes?.length?input.knownOfficialCodes:registry.buildings
    .filter(b=>b.active!==false&&b.confidence==="CONFIRMED")
    .map(b=>b.officialCode)).map(code=>normalizeLocationToken(code)).filter(Boolean))];

  let building:Resolution<MasterBuilding>={status:"REVIEW_REQUIRED",evidence:["لم يثبت المبنى بعد."]};
  let buildingMethod:AuthorityLocationMethod="UNRESOLVED";
  let buildingScore=0;
  let recoveredBuildingCode="";

  // 1) Exact registry identity is the strongest possible proof — alpha or numeric.
  if(token&&known.includes(token)){
    building=resolveBuilding(registry,token,{});
    if(building.status==="CONFIRMED"&&building.value){buildingMethod="EXACT_REGISTRY";buildingScore=100;}
  }

  // 2) Contextual shorthand is allowed only for genuinely short building forms.
  // Never send arbitrary six-digit numeric seat/capacity strings to the shorthand resolver.
  if((building.status!=="CONFIRMED"||!building.value)&&/^(?:0*\d{1,3}|[A-Z]0*\d{1,3})$/.test(token)){
    const contextual=resolveBuilding(registry,rawBuilding,{collegeId:input.collegeId,sectionId:input.sectionId});
    if(contextual.status==="CONFIRMED"&&contextual.value){building=contextual;buildingMethod="CONTEXT_UNIQUE";buildingScore=97;}
  }

  // 3) Owner grammar: branch 012 + B09/F15/J14, repaired only against the official registry.
  if(building.status!=="CONFIRMED"||!building.value){
    const recovered=recoverOfficialBuildingCodeFromAuthorityCell(rawBuilding,branchRoot,known)||"";
    if(recovered){
      const resolved=resolveBuilding(registry,recovered,{});
      if(resolved.status==="CONFIRMED"&&resolved.value){
        building=resolved;buildingMethod="BRANCH_RECOVERY";buildingScore=96;recoveredBuildingCode=recovered;
      }
    }
  }

  // 4) Numeric campuses: repair a dropped leading zero only when the selected official
  // site prefix + registry leave exactly ONE canonical code. No free-form numeric guessing.
  if((building.status!=="CONFIRMED"||!building.value)&&/^\d{4}$/.test(sitePrefix)&&/^\d{4,6}$/.test(token)){
    const stripped=token.replace(/^0+/,"");
    const candidates=known.filter(code=>code.startsWith(sitePrefix)&&code.replace(/^0+/,"")===stripped);
    if(candidates.length===1){
      const resolved=resolveBuilding(registry,candidates[0],{});
      if(resolved.status==="CONFIRMED"&&resolved.value){
        building=resolved;buildingMethod="NUMERIC_SITE_RECOVERY";buildingScore=96;recoveredBuildingCode=candidates[0];
      }
    }
  }

  // 5) A ruled border can append ONE room digit to an otherwise exact alpha building code.
  if(building.status!=="CONFIRMED"||!building.value){
    const bleed=token.match(/^(\d{3}[A-Z]\d{2})\d$/);
    if(bleed&&known.includes(bleed[1])){
      const resolved=resolveBuilding(registry,bleed[1],{});
      if(resolved.status==="CONFIRMED"&&resolved.value){
        building=resolved;buildingMethod="BORDER_BLEED_RECOVERY";buildingScore=94;recoveredBuildingCode=bleed[1];
      }
    }
  }

  // 6) Last resort: a distinctive official room may prove ONE building inside the branch.
  if((building.status!=="CONFIRMED"||!building.value)&&!isInvalidLocationToken(rawRoom)){
    const byRoom=resolveBuildingFromUniqueRoom(registry,rawRoom,{branchRoot});
    if(byRoom.status==="CONFIRMED"&&byRoom.value){building=byRoom;buildingMethod="UNIQUE_ROOM_FINGERPRINT";buildingScore=90;}
  }

  if(building.status!=="CONFIRMED"||!building.value){
    return{building,buildingMethod:"UNRESOLVED",buildingScore:0,roomScore:0};
  }

  const room=resolveRoom(registry,rawRoom,building.value.id,{});
  let roomScore=0;
  if(room.status==="CONFIRMED"&&room.value){
    const proof=room.evidence.join(" ");
    roomScore=/استعادة OCR/.test(proof)?96:/تطبيع آمن/.test(proof)?97:/الرقم .* يطابق/.test(proof)?93:100;
  }
  return{building,room,buildingMethod,buildingScore,roomScore,recoveredBuildingCode:recoveredBuildingCode||undefined};
}

/**
 * ── هوية القاعة تُكتب مرة واحدة ─────────────────────────────────────────────
 *
 * Two things in this product ask "is this the same room?" — a schedule row and
 * an approved hall-barter reservation — and each used to spell the answer
 * itself. The registry uppercased and folded Arabic and Persian digits through
 * NFKC; the server's barter key lowercased and did nothing else. On the legacy
 * branch, `legacy:012B08|G20` was compared against `legacy:012b08|g20`, so for
 * any room without a registry id the two could never be equal — and the two
 * findings that comparison guards, «القاعة محجوزة رقمياً عبر استعارة القاعات»
 * and «الموعد يتجاوز نافذة الاستعارة المعتمدة», simply never fired. Silently,
 * because a key that never matches produces no error, only an absence.
 *
 * The spelling lives here now, and both callers spell it by calling this.
 */
export const roomKeyOf = (roomId: unknown, roomCode: unknown, roomHall: unknown): string => {
  const id = String(roomId ?? "").trim();
  if (id) return `id:${id}`;
  const building = normalizeLocationToken(roomCode), room = normalizeLocationToken(roomHall);
  return building && room ? `legacy:${building}|${room}` : "";
};

export const roomIdentityKey = (row: Partial<FSchedule>): string => {
  if(row.locationStatus==="PENDING_ROOM") return "";
  return roomKeyOf(row.roomId, row.AdRoomCode, row.AdRoomHall);
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
