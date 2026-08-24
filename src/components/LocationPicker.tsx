import React, { useEffect, useMemo, useState } from "react";
import type { FSchedule, MasterBuilding, MasterRoom } from "../types";
import { PENDING_ROOM, roomGroups } from "../utils/locationRegistry";
import { buildingNumberLabel } from "../utils/locationCollegePrefixes";

type LocationValue=Pick<FSchedule,"AdRoomCode"|"AdRoomHall"|"buildingId"|"roomId"|"locationStatus"|"sourceBuildingText"|"sourceRoomText">;
type RegistryPayload={buildings:MasterBuilding[];rooms:MasterRoom[];borrowedRoomIds:string[]};

function useRegistry(collegeId:number,sectionId:number,termId?:number){
  const [data,setData]=useState<RegistryPayload>({buildings:[],rooms:[],borrowedRoomIds:[]});
  const [loading,setLoading]=useState(false);
  useEffect(()=>{let alive=true;const controller=new AbortController();setLoading(true);const q=new URLSearchParams({collegeId:String(collegeId||0),sectionId:String(sectionId||0)});if(termId)q.set("termId",String(termId));fetch(`/api/location-registry?${q}`,{signal:controller.signal}).then(r=>r.ok?r.json():Promise.reject()).then(payload=>{if(!alive)return;setData({buildings:Array.isArray(payload?.buildings)?payload.buildings:[],rooms:Array.isArray(payload?.rooms)?payload.rooms:[],borrowedRoomIds:Array.isArray(payload?.borrowedRoomIds)?payload.borrowedRoomIds.map(String):[]});}).catch(()=>{if(alive)setData({buildings:[],rooms:[],borrowedRoomIds:[]});}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;controller.abort();};},[collegeId,sectionId,termId]);
  return {...data,loading};
}

export function BuildingPicker({collegeId,sectionId,termId,value,onChange,disabled=false}:{collegeId:number;sectionId:number;termId?:number;value?:string;onChange:(building?:MasterBuilding)=>void;disabled?:boolean}){
  const {buildings,loading}=useRegistry(collegeId,sectionId,termId);
  return <select aria-label="المبنى الرسمي" value={value||""} disabled={disabled||loading} onChange={e=>onChange(buildings.find(item=>item.id===e.target.value))}>
    <option value="">{loading?"جارٍ تحميل المباني…":"اختر المبنى الرسمي"}</option>
    {buildings.map(building=><option key={building.id} value={building.id}>{`مبنى ${buildingNumberLabel(building)} — ${building.officialCode}`}{building.branchName?` — ${building.branchName}`:""}</option>)}
  </select>;
}

export default function LocationPicker({collegeId,sectionId,termId,value,onChange,disabled=false,showRaw=false,allowPending=true}:{collegeId:number;sectionId:number;termId?:number;value:Partial<LocationValue>;onChange:(patch:Partial<LocationValue>)=>void;disabled?:boolean;showRaw?:boolean;allowPending?:boolean}){
  const {buildings,rooms,borrowedRoomIds,loading}=useRegistry(collegeId,sectionId,termId);
  const registry=useMemo(()=>({buildings,rooms}),[buildings,rooms]);
  const groups=useMemo(()=>value.buildingId?roomGroups(registry,value.buildingId,sectionId):{own:[],shared:[],other:[]},[registry,value.buildingId,sectionId]);
  const borrowed=useMemo(()=>{const ids=new Set(borrowedRoomIds);const already=new Set([...groups.own,...groups.shared,...groups.other].map(r=>r.id));return value.buildingId?rooms.filter(room=>room.buildingId===value.buildingId&&ids.has(room.id)&&!already.has(room.id)):[];},[borrowedRoomIds,groups,rooms,value.buildingId]);
  const selectedBuilding=buildings.find(b=>b.id===value.buildingId);
  const locationPending=value.locationStatus==="PENDING_ROOM";
  const chooseBuilding=(id:string)=>{const b=buildings.find(x=>x.id===id);onChange({buildingId:b?.id,roomId:undefined,AdRoomCode:b?.officialCode||"",AdRoomHall:"",locationStatus:undefined});};
  const chooseRoom=(id:string)=>{if(id===PENDING_ROOM){onChange({roomId:undefined,AdRoomHall:"",locationStatus:"PENDING_ROOM"});return;}const r=rooms.find(x=>x.id===id);onChange({roomId:r?.id,AdRoomHall:r?.canonicalCode||"",locationStatus:r?"VERIFIED":undefined});};
  return <div className="location-registry-picker" data-location-registry-picker="true">
    <label><span>المبنى <b>*</b></span><select aria-label="المبنى الرسمي" value={value.buildingId||""} disabled={disabled||loading} onChange={e=>chooseBuilding(e.target.value)} required><option value="">{loading?"جارٍ تحميل المباني…":"اختر المبنى الرسمي"}</option>{buildings.map(b=><option key={b.id} value={b.id}>{`مبنى ${buildingNumberLabel(b)} — ${b.officialCode}`}{b.branchName?` — ${b.branchName}`:""}</option>)}</select></label>
    <label><span>القاعة <b>*</b></span><select aria-label="القاعة الرسمية" value={locationPending?PENDING_ROOM:(value.roomId||"")} disabled={disabled||!selectedBuilding} onChange={e=>chooseRoom(e.target.value)} required><option value="">{selectedBuilding?"اختر القاعة الرسمية":"اختر المبنى أولاً"}</option>{groups.own.length?<optgroup label="قاعات قسمك">{groups.own.map(r=><option key={r.id} value={r.id}>{r.canonicalCode}</option>)}</optgroup>:null}{groups.shared.length?<optgroup label="القاعات المشتركة">{groups.shared.map(r=><option key={r.id} value={r.id}>{r.canonicalCode} — مشتركة</option>)}</optgroup>:null}{borrowed.length?<optgroup label="قاعات مستعارة معتمدة">{borrowed.map(r=><option key={r.id} value={r.id}>{r.canonicalCode} — استعارة معتمدة</option>)}</optgroup>:null}{groups.other.length?<optgroup label="قاعات المبنى غير المخصصة">{groups.other.map(r=><option key={r.id} value={r.id}>{r.canonicalCode}</option>)}</optgroup>:null}{allowPending?<option value={PENDING_ROOM}>بانتظار تثبيت القاعة</option>:null}</select></label>
    {locationPending?<small className="location-pending-badge">بانتظار تثبيت القاعة</small>:null}
    {showRaw&&(value.sourceBuildingText||value.sourceRoomText)&&((value.sourceBuildingText||"")!==value.AdRoomCode||(value.sourceRoomText||"")!==value.AdRoomHall)?<small className="location-source-value">القيمة المقروءة: {[value.sourceBuildingText,value.sourceRoomText].filter(Boolean).join("/")}</small>:null}
  </div>;
}
