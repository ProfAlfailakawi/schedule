import { randomUUID } from "crypto";
import type { FSchedule, LocationMigrationLog, LocationReviewCase, LocationMigrationRun, MasterBuilding, MasterRoom } from "../types";
import { LOCATION_REGISTRY_SEED } from "../generated/locationRegistrySeed";
import { PENDING_ROOM, canonicalRoomShape, isInvalidLocationToken, normalizeLocationToken, resolveBuilding, resolveRoom, type LocationRegistry } from "../utils/locationRegistry";

export const LOCATION_MIGRATION_VERSION = `${String(LOCATION_REGISTRY_SEED.version)}-smart3`;

export function seedRegistry(): { buildings: MasterBuilding[]; rooms: MasterRoom[]; reviewCases: LocationReviewCase[] } {
  const seeded=JSON.parse(JSON.stringify({buildings:LOCATION_REGISTRY_SEED.buildings,rooms:LOCATION_REGISTRY_SEED.rooms,reviewCases:LOCATION_REGISTRY_SEED.reviewCases}));
  seeded.rooms=seeded.rooms.map((room:MasterRoom)=>({...room,shared:room.sectionIds.length>1,sharedConfidence:room.sectionIds.length>1?"CONFIRMED":room.sharedConfidence}));
  return seeded;
}

export function mergeRegistryWithSeed(existing: LocationRegistry): LocationRegistry {
  const seed=seedRegistry();
  const buildings=new Map(existing.buildings.map(x=>[x.id,x]));
  for(const row of seed.buildings) if(!buildings.has(row.id)) buildings.set(row.id,row);
  const rooms=new Map(existing.rooms.map(x=>[x.id,x]));
  for(const row of seed.rooms) if(!rooms.has(row.id)) rooms.set(row.id,row);
  return {buildings:[...buildings.values()],rooms:[...rooms.values()].map(room=>({...room,shared:room.sectionIds.length>1,sharedConfidence:room.sectionIds.length>1?"CONFIRMED":room.sharedConfidence}))};
}

export type PreflightIssue={type:string;severity:"high"|"warning";message:string};
export function locationPreflight(row: Partial<FSchedule>, registry: LocationRegistry, opts:{allowHistoricalView?:boolean; sectionId?:number; collegeId?:number; allowOutOfScopeRoom?:boolean}={}): {ok:boolean;issues:PreflightIssue[];canonical?:Partial<FSchedule>} {
  const issues:PreflightIssue[]=[];
  if(opts.allowHistoricalView && (row.locationStatus==="LOCATION_REVIEW_REQUIRED"||row.locationStatus==="INVALID_HISTORICAL")) return {ok:true,issues:[]};
  const building=registry.buildings.find(b=>b.id===row.buildingId);
  if(!building){issues.push({type:"unknown_building",severity:"high",message:"اختر مبنى رسميًا من سجل المباني."});return {ok:false,issues};}
  if(!building.active||building.confidence!=="CONFIRMED")issues.push({type:"inactive_building",severity:"high",message:"المبنى غير فعال أو لم يعتمد بعد."});
  if(opts.collegeId && building.collegeIds.length && !building.collegeIds.includes(Number(opts.collegeId)))issues.push({type:"building_scope",severity:"high",message:"المبنى غير مرتبط بالكلية المختارة."});
  if(row.locationStatus==="PENDING_ROOM" || row.roomId===PENDING_ROOM){
    return {ok:!issues.some(x=>x.severity==="high"),issues:[...issues,{type:"pending_room",severity:"warning",message:"القاعة بانتظار التثبيت."}],canonical:{...row,buildingId:building.id,roomId:undefined,AdRoomCode:building.officialCode,AdRoomHall:"",locationStatus:"PENDING_ROOM"}};
  }
  const room=registry.rooms.find(r=>r.id===row.roomId);
  if(!room){issues.push({type:"unknown_room",severity:"high",message:"اختر قاعة رسمية من سجل القاعات أو اختر «بانتظار تثبيت القاعة»."});return {ok:false,issues};}
  if(!room.active||room.confidence!=="CONFIRMED")issues.push({type:"inactive_room",severity:"high",message:"القاعة غير فعالة أو لم تعتمد بعد."});
  if(room.buildingId!==building.id)issues.push({type:"room_building",severity:"high",message:"القاعة المختارة لا تنتمي إلى المبنى المختار."});
  if(opts.sectionId && !opts.allowOutOfScopeRoom && !room.shared && room.sectionIds.length && !room.sectionIds.includes(Number(opts.sectionId)))issues.push({type:"room_scope",severity:"high",message:"القاعة مرتبطة بقسم آخر وليست مصنفة كقاعة مشتركة أو مستعارة بنافذة معتمدة."});
  return {ok:!issues.some(x=>x.severity==="high"),issues,canonical:{...row,buildingId:building.id,roomId:room.id,AdRoomCode:building.officialCode,AdRoomHall:room.canonicalCode,locationStatus:"VERIFIED",locationResolvedAt:new Date().toISOString()}};
}

function resolveStrongHistoricalProbableRoom(registry:LocationRegistry, raw:string, buildingId:string, sectionId:number, collegeId:number):MasterRoom|undefined {
  const token=normalizeLocationToken(raw);
  const shaped=canonicalRoomShape(raw);
  const numeric=/^0*\d+$/.test(token)?Number(token):null;
  const candidates=registry.rooms.filter(room=>
    room.buildingId===buildingId&&room.confidence==="PROBABLE"&&
    Number(room.historicalUsageCount||0)>=20&&
    (!collegeId||!room.collegeIds.length||room.collegeIds.includes(collegeId))&&
    (!sectionId||room.sectionIds.includes(sectionId))
  ).filter(room=>{
    const roomToken=normalizeLocationToken(room.canonicalCode);
    if(shaped&&canonicalRoomShape(room.canonicalCode)===shaped)return true;
    if(room.aliases?.some(alias=>normalizeLocationToken(alias.value)===token))return true;
    if(numeric!==null){const m=roomToken.match(/(\d+)[A-Z]?$/);return Boolean(m&&Number(m[1])===numeric);}
    return roomToken===token;
  });
  if(candidates.length!==1)return undefined;
  const chosen=candidates[0];
  // A probable candidate is promoted for historical migration only when no
  // other confirmed/probable room in the same building+section competes for
  // the same raw value. It remains PROBABLE/inactive in the live registry.
  const competitors=registry.rooms.filter(room=>room.id!==chosen.id&&room.buildingId===buildingId&&["CONFIRMED","PROBABLE"].includes(room.confidence)&&(!sectionId||!room.sectionIds.length||room.sectionIds.includes(sectionId))).filter(room=>{
    if(shaped&&canonicalRoomShape(room.canonicalCode)===shaped)return true;
    if(numeric!==null){const m=normalizeLocationToken(room.canonicalCode).match(/(\d+)[A-Z]?$/);return Boolean(m&&Number(m[1])===numeric);}
    return normalizeLocationToken(room.canonicalCode)===token||room.aliases?.some(alias=>normalizeLocationToken(alias.value)===token);
  });
  return competitors.length?undefined:chosen;
}

export function resolveHistoricalLocation(row: Partial<FSchedule>, registry: LocationRegistry): {patch:Partial<FSchedule>;confidence:"CONFIRMED"|"PROBABLE"|"REVIEW_REQUIRED"|"INVALID";rule:string} {
  const braw=String(row.AdRoomCode||""), rraw=String(row.AdRoomHall||"");
  const collegeId=Number(row.AdCollegeId||0),sectionId=Number(row.AdSectionId||0);

  // If the building cell is a historical placeholder but the room itself uniquely
  // identifies one confirmed building+room in this department, recover the pair.
  // This turns obvious rows such as "- / F12" into verified history without guessing.
  if(isInvalidLocationToken(braw)&&!isInvalidLocationToken(rraw)){
    const recovered=registry.buildings.filter(b=>b.confidence==="CONFIRMED"&&(!collegeId||b.collegeIds.includes(collegeId)||!b.collegeIds.length)).flatMap(b=>{
      const room=resolveRoom(registry,rraw,b.id,{collegeId,sectionId});
      if(room.status!=="CONFIRMED"||!room.value)return [];
      if(sectionId&&room.value.sectionIds.length&&!room.value.sectionIds.includes(sectionId))return [];
      return [{building:b,room:room.value}];
    });
    const unique=new Map(recovered.map(x=>[x.room.id,x]));
    if(unique.size===1){const hit=[...unique.values()][0];return {patch:{buildingId:hit.building.id,roomId:hit.room.id,AdRoomCode:hit.building.officialCode,AdRoomHall:hit.room.canonicalCode,locationStatus:"VERIFIED",sourceBuildingText:braw,sourceRoomText:rraw,locationResolvedAt:new Date().toISOString()},confidence:"CONFIRMED",rule:"RECOVERED_FROM_UNIQUE_ROOM_FINGERPRINT"};}
    return {patch:{locationStatus:"INVALID_HISTORICAL",sourceBuildingText:braw,sourceRoomText:rraw},confidence:"INVALID",rule:"INVALID_BUILDING_PLACEHOLDER"};
  }
  if(isInvalidLocationToken(braw)) return {patch:{locationStatus:"INVALID_HISTORICAL",sourceBuildingText:braw,sourceRoomText:rraw},confidence:"INVALID",rule:"INVALID_BUILDING_PLACEHOLDER"};
  const b=resolveBuilding(registry,braw,{collegeId,sectionId});
  if(b.status!=="CONFIRMED"||!b.value) return {patch:{locationStatus:"LOCATION_REVIEW_REQUIRED",sourceBuildingText:braw,sourceRoomText:rraw},confidence:b.status,rule:"BUILDING_CONTEXT_REVIEW"};
  if(isInvalidLocationToken(rraw)) return {patch:{buildingId:b.value.id,AdRoomCode:b.value.officialCode,locationStatus:"INVALID_HISTORICAL",sourceBuildingText:braw,sourceRoomText:rraw},confidence:"INVALID",rule:"INVALID_ROOM_PLACEHOLDER"};
  const r=resolveRoom(registry,rraw,b.value.id,{collegeId,sectionId});
  if(r.status!=="CONFIRMED"||!r.value){
    const strongProbable=resolveStrongHistoricalProbableRoom(registry,rraw,b.value.id,sectionId,collegeId);
    if(strongProbable)return {patch:{buildingId:b.value.id,AdRoomCode:b.value.officialCode,locationStatus:"LOCATION_REVIEW_REQUIRED",sourceBuildingText:braw,sourceRoomText:rraw},confidence:"REVIEW_REQUIRED",rule:"HISTORICAL_STRONG_PROBABLE_REVIEW"};
    return {patch:{buildingId:b.value.id,AdRoomCode:b.value.officialCode,locationStatus:"LOCATION_REVIEW_REQUIRED",sourceBuildingText:braw,sourceRoomText:rraw},confidence:r.status,rule:"ROOM_CONTEXT_REVIEW"};
  }
  return {patch:{buildingId:b.value.id,roomId:r.value.id,AdRoomCode:b.value.officialCode,AdRoomHall:r.value.canonicalCode,locationStatus:"VERIFIED",sourceBuildingText:braw,sourceRoomText:rraw,locationResolvedAt:new Date().toISOString()},confidence:"CONFIRMED",rule:"HISTORICAL_CONTEXT_CONFIRMED"};
}

export function buildMigrationPlan(rows: readonly FSchedule[], registry: LocationRegistry, migrationId=`location_${Date.now()}`) {
  const logs:LocationMigrationLog[]=[]; const patches:Array<{id:number;fields:Partial<FSchedule>}>=[];
  const stats={scanned:rows.length,verified:0,buildingChanged:0,roomChanged:0,review:0,invalid:0,unchanged:0};
  for(const row of rows){
    if(row.locationMigrationVersion===LOCATION_MIGRATION_VERSION) {stats.unchanged++;continue;}
    const resolved=resolveHistoricalLocation(row,registry); const patch={...resolved.patch,locationMigrationId:migrationId,locationMigrationVersion:LOCATION_MIGRATION_VERSION};
    if(resolved.confidence==="CONFIRMED") stats.verified++; else if(resolved.confidence==="INVALID") stats.invalid++; else stats.review++;
    if(patch.AdRoomCode!==undefined&&patch.AdRoomCode!==row.AdRoomCode)stats.buildingChanged++;
    if(patch.AdRoomHall!==undefined&&patch.AdRoomHall!==row.AdRoomHall)stats.roomChanged++;
    // REVIEW rows preserve raw values; only attach status/source evidence.
    patches.push({id:row.id,fields:patch});
    logs.push({id:randomUUID(),migrationId,scheduleId:row.id,timestamp:new Date().toISOString(),oldBuilding:String(row.AdRoomCode||""),newBuilding:patch.AdRoomCode,oldRoom:String(row.AdRoomHall||""),newRoom:patch.AdRoomHall,oldBuildingId:row.buildingId,newBuildingId:patch.buildingId,oldRoomId:row.roomId,newRoomId:patch.roomId,oldStatus:row.locationStatus,newStatus:patch.locationStatus,oldMigrationVersion:row.locationMigrationVersion,newMigrationVersion:LOCATION_MIGRATION_VERSION,confidence:resolved.confidence,rule:resolved.rule});
  }
  const ruleCounts=logs.reduce<Record<string,number>>((acc,log)=>{acc[log.rule]=(acc[log.rule]||0)+1;return acc;},{});
  const reviewReasons={building:ruleCounts.BUILDING_CONTEXT_REVIEW||0,room:ruleCounts.ROOM_CONTEXT_REVIEW||0};
  const invalidReasons={buildingPlaceholder:ruleCounts.INVALID_BUILDING_PLACEHOLDER||0,roomPlaceholder:ruleCounts.INVALID_ROOM_PLACEHOLDER||0};
  const smartRecovered=(ruleCounts.RECOVERED_FROM_UNIQUE_ROOM_FINGERPRINT||0);
  return {migrationId,version:LOCATION_MIGRATION_VERSION,stats,patches,logs,details:{ruleCounts,reviewReasons,invalidReasons,smartRecovered}};
}

export function rollbackPatch(log: LocationMigrationLog): Partial<FSchedule> {
  return {AdRoomCode:log.oldBuilding,AdRoomHall:log.oldRoom,buildingId:log.oldBuildingId,roomId:log.oldRoomId,locationStatus:log.oldStatus,locationMigrationId:undefined,locationMigrationVersion:log.oldMigrationVersion,locationResolvedAt:undefined};
}

/**
 * ── ما يحمله السجل ولا يراه أحد ─────────────────────────────────────────────
 *
 * The six numbers here counted what the registry HAS. What it is carrying and
 * nobody can see had no number at all, and that is the half a steward needs:
 *
 *   • 90 rooms — a quarter of the registry — sit at PROBABLE confidence, so
 *     every picker filters them out. They are not lost and not wrong; they are
 *     waiting for a person to say yes or no, and nothing on the screen said
 *     there was a queue.
 *   • 10 buildings hold no active confirmed room, so they appear in the master
 *     list and can never produce a hall — but they are two different things,
 *     and the split is the whole point (see below).
 * A third candidate was dropped on purpose: nine rooms carry a stored `shared`
 * flag that contradicts their own section list, but `mergeRegistryWithSeed`
 * recomputes that flag on every read — so a counter here would be fed the
 * corrected value and could only ever report zero. A number that cannot move
 * is worse than no number: it reads as an all-clear. The drift is harmless for
 * the same reason, and it is recorded in the round\'s note instead.
 *
 * Counting only. Nothing here changes a record; the steward decides.
 */
export function registryHealth(registry: LocationRegistry, rows: readonly Partial<FSchedule>[], reviewCases:readonly LocationReviewCase[]) {
  const usable=(room:LocationRegistry["rooms"][number])=>room.active&&room.confidence==="CONFIRMED";
  const activeBuildings=registry.buildings.filter(x=>x.active&&x.confidence==="CONFIRMED");
  return {
    officialBuildings:activeBuildings.length,
    officialRooms:registry.rooms.filter(usable).length,
    sharedRooms:registry.rooms.filter(room=>usable(room)&&room.sectionIds.length>1).length,
    pendingRooms:rows.filter(x=>x.locationStatus==="PENDING_ROOM").length,
    historicalReview:rows.filter(x=>x.locationStatus==="LOCATION_REVIEW_REQUIRED"||x.locationStatus==="INVALID_HISTORICAL").length,
    openReviewCases:reviewCases.filter(x=>x.status==="open").length,
    /** Rooms hidden from every picker until somebody confirms or retires them. */
    awaitingConfirmation:registry.rooms.filter(room=>!usable(room)).length,
    /* ── مبنى بلا قاعة ليس نوعاً واحداً ────────────────────────────────────
     * Ten buildings hold no usable hall, and treating them as one list would
     * invite exactly the wrong action. Four of them carry real history — one
     * has thirty-six appointments behind it — and their halls are merely
     * unconfirmed; retiring the building would orphan the rows that point at
     * it and break the canonicalisation of ten years of schedules. The other
     * six have never been used at all: no hall, no row, no term.
     *
     * So the number is split. One is a queue of halls to confirm; the other is
     * a list safe to retire. Counting only — nothing here retires anything. */
    emptyBuildingsWithHistory:activeBuildings.filter(building=>
      !registry.rooms.some(room=>usable(room)&&room.buildingId===building.id) &&
      (Number(building.historicalUsageCount||0)+registry.rooms.filter(room=>room.buildingId===building.id)
        .reduce((sum,room)=>sum+Number(room.historicalUsageCount||0),0))>0).length,
    emptyBuildingsUnused:activeBuildings.filter(building=>
      !registry.rooms.some(room=>usable(room)&&room.buildingId===building.id) &&
      (Number(building.historicalUsageCount||0)+registry.rooms.filter(room=>room.buildingId===building.id)
        .reduce((sum,room)=>sum+Number(room.historicalUsageCount||0),0))===0).length,
  };
}

export function newMigrationRun(byUserId:number,stats:Record<string,number>,restorePointId?:string):LocationMigrationRun{return {id:`migration_${Date.now()}`,version:LOCATION_MIGRATION_VERSION,createdAt:new Date().toISOString(),byUserId,status:"running",restorePointId,stats};}
