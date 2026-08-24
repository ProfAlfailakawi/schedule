import React, { useEffect, useMemo, useState } from "react";
import type { FSchedule, MasterBuilding, MasterRoom } from "../types";
import { PENDING_ROOM, compareLocationCodes, roomGroups } from "../utils/locationRegistry";
import { buildingNumberLabel } from "../utils/locationCollegePrefixes";

type LocationValue=Pick<FSchedule,"AdRoomCode"|"AdRoomHall"|"buildingId"|"roomId"|"locationStatus"|"sourceBuildingText"|"sourceRoomText">;
type RegistryPayload={buildings:MasterBuilding[];rooms:MasterRoom[];borrowedRoomIds:string[]};

function useRegistry(collegeId:number,sectionId:number,termId?:number){
  const [data,setData]=useState<RegistryPayload>({buildings:[],rooms:[],borrowedRoomIds:[]});
  const [loading,setLoading]=useState(false);
  useEffect(()=>{let alive=true;const controller=new AbortController();setLoading(true);const q=new URLSearchParams({collegeId:String(collegeId||0),sectionId:String(sectionId||0)});if(termId)q.set("termId",String(termId));fetch(`/api/location-registry?${q}`,{signal:controller.signal}).then(r=>r.ok?r.json():Promise.reject()).then(payload=>{if(!alive)return;setData({buildings:(Array.isArray(payload?.buildings)?payload.buildings:[]).slice().sort((a:any,b:any)=>(Number(buildingNumberLabel(a))||9999)-(Number(buildingNumberLabel(b))||9999)||String(a.officialCode||"").localeCompare(String(b.officialCode||""))),rooms:Array.isArray(payload?.rooms)?payload.rooms:[],borrowedRoomIds:Array.isArray(payload?.borrowedRoomIds)?payload.borrowedRoomIds.map(String):[]});}).catch(()=>{if(alive)setData({buildings:[],rooms:[],borrowedRoomIds:[]});}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;controller.abort();};},[collegeId,sectionId,termId]);
  return {...data,loading};
}

export function BuildingPicker({collegeId,sectionId,termId,value,onChange,disabled=false}:{collegeId:number;sectionId:number;termId?:number;value?:string;onChange:(building?:MasterBuilding)=>void;disabled?:boolean}){
  const {buildings,loading}=useRegistry(collegeId,sectionId,termId);
  return <select aria-label="المبنى الرسمي" value={value||""} disabled={disabled||loading} onChange={e=>onChange(buildings.find(item=>item.id===e.target.value))}>
    <option value="">{loading?"جارٍ تحميل المباني…":"اختر المبنى"}</option>
    {buildings.map(building=><option key={building.id} value={building.id}>{buildingNumberLabel(building)}</option>)}
  </select>;
}

export function RoomPicker({collegeId,sectionId,termId,buildingId,roomId,locationStatus,onChange,disabled=false,allowPending=true}:{collegeId:number;sectionId:number;termId?:number;buildingId?:string;roomId?:string;locationStatus?:string;onChange:(patch:{roomId?:string;canonicalCode:string;locationStatus?:"VERIFIED"|"PENDING_ROOM"})=>void;disabled?:boolean;allowPending?:boolean}){
  const {buildings,rooms,borrowedRoomIds,loading}=useRegistry(collegeId,sectionId,termId);
  const registry=useMemo(()=>({buildings,rooms}),[buildings,rooms]);
  const groups=useMemo(()=>buildingId?roomGroups(registry,buildingId,sectionId):{own:[],shared:[],other:[]},[registry,buildingId,sectionId]);
  const departmentRooms=useMemo(()=>[...groups.own,...groups.shared].sort((a,b)=>compareLocationCodes(a.canonicalCode,b.canonicalCode)),[groups]);
  const borrowed=useMemo(()=>{const ids=new Set(borrowedRoomIds);const already=new Set(departmentRooms.map(r=>r.id));return buildingId?rooms.filter(room=>room.buildingId===buildingId&&ids.has(room.id)&&!already.has(room.id)).sort((a,b)=>compareLocationCodes(a.canonicalCode,b.canonicalCode)):[];},[borrowedRoomIds,departmentRooms,rooms,buildingId]);
  const locationPending=locationStatus==="PENDING_ROOM";
  const chooseRoom=(id:string)=>{if(id===PENDING_ROOM){onChange({roomId:undefined,canonicalCode:"",locationStatus:"PENDING_ROOM"});return;}const r=rooms.find(x=>x.id===id);onChange({roomId:r?.id,canonicalCode:r?.canonicalCode||"",locationStatus:r?"VERIFIED":undefined});};
  return <select aria-label="القاعة الرسمية" value={locationPending?PENDING_ROOM:(roomId||"")} disabled={disabled||!buildingId||loading} onChange={e=>chooseRoom(e.target.value)}>
    <option value="">{buildingId?"اختر القاعة الرسمية":"اختر المبنى أولاً"}</option>
    {departmentRooms.length?<optgroup label="قاعات القسم">{departmentRooms.map(r=><option key={r.id} value={r.id}>{r.canonicalCode}</option>)}</optgroup>:null}
    {borrowed.length?<optgroup label="قاعات مستعارة معتمدة">{borrowed.map(r=><option key={r.id} value={r.id}>{r.canonicalCode}</option>)}</optgroup>:null}
    {allowPending?<option value={PENDING_ROOM}>بانتظار تثبيت القاعة</option>:null}
  </select>;
}

export default function LocationPicker({collegeId,sectionId,termId,value,onChange,disabled=false,showRaw=false,allowPending=true}:{collegeId:number;sectionId:number;termId?:number;value:Partial<LocationValue>;onChange:(patch:Partial<LocationValue>)=>void;disabled?:boolean;showRaw?:boolean;allowPending?:boolean}){
  const {buildings,rooms,borrowedRoomIds,loading}=useRegistry(collegeId,sectionId,termId);
  const registry=useMemo(()=>({buildings,rooms}),[buildings,rooms]);
  const groups=useMemo(()=>value.buildingId?roomGroups(registry,value.buildingId,sectionId):{own:[],shared:[],other:[]},[registry,value.buildingId,sectionId]);
  const departmentRooms=useMemo(()=>[...groups.own,...groups.shared].sort((a,b)=>compareLocationCodes(a.canonicalCode,b.canonicalCode)),[groups]);
  const borrowed=useMemo(()=>{const ids=new Set(borrowedRoomIds);const already=new Set(departmentRooms.map(r=>r.id));return value.buildingId?rooms.filter(room=>room.buildingId===value.buildingId&&ids.has(room.id)&&!already.has(room.id)).sort((a,b)=>compareLocationCodes(a.canonicalCode,b.canonicalCode)):[];},[borrowedRoomIds,departmentRooms,rooms,value.buildingId]);
  const selectedBuilding=buildings.find(b=>b.id===value.buildingId);
  const locationPending=value.locationStatus==="PENDING_ROOM";
  const chooseBuilding=(id:string)=>{const b=buildings.find(x=>x.id===id);onChange({buildingId:b?.id,roomId:undefined,AdRoomCode:b?.officialCode||"",AdRoomHall:"",locationStatus:undefined});};
  const chooseRoom=(id:string)=>{if(id===PENDING_ROOM){onChange({roomId:undefined,AdRoomHall:"",locationStatus:"PENDING_ROOM"});return;}const r=rooms.find(x=>x.id===id);onChange({roomId:r?.id,AdRoomHall:r?.canonicalCode||"",locationStatus:r?"VERIFIED":undefined});};
  return <div className="location-registry-picker" data-location-registry-picker="true">
    <label><span>المبنى <b>*</b></span><select aria-label="المبنى الرسمي" value={value.buildingId||""} disabled={disabled||loading} onChange={e=>chooseBuilding(e.target.value)} required><option value="">{loading?"جارٍ تحميل المباني…":"اختر المبنى"}</option>{buildings.map(b=><option key={b.id} value={b.id}>{buildingNumberLabel(b)}</option>)}</select></label>
    <label><span>القاعة <b>*</b></span><select aria-label="القاعة الرسمية" value={locationPending?PENDING_ROOM:(value.roomId||"")} disabled={disabled||!selectedBuilding} onChange={e=>chooseRoom(e.target.value)} required><option value="">{selectedBuilding?"اختر القاعة الرسمية":"اختر المبنى أولاً"}</option>{departmentRooms.length?<optgroup label="قاعات القسم">{departmentRooms.map(r=><option key={r.id} value={r.id}>{r.canonicalCode}</option>)}</optgroup>:null}{borrowed.length?<optgroup label="قاعات مستعارة معتمدة">{borrowed.map(r=><option key={r.id} value={r.id}>{r.canonicalCode}</option>)}</optgroup>:null}{allowPending?<option value={PENDING_ROOM}>بانتظار تثبيت القاعة</option>:null}</select></label>
    {locationPending?<small className="location-pending-badge">بانتظار تثبيت القاعة</small>:null}
    {showRaw&&(value.sourceBuildingText||value.sourceRoomText)&&((value.sourceBuildingText||"")!==value.AdRoomCode||(value.sourceRoomText||"")!==value.AdRoomHall)?<small className="location-source-value">القيمة المقروءة: {[value.sourceBuildingText,value.sourceRoomText].filter(Boolean).join("/")}</small>:null}
  </div>;
}
