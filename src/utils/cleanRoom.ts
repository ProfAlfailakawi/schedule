/** Conservative cleanup: never infer campus/prefix or a room letter. */
const compact = (raw: unknown) => String(raw ?? "").normalize("NFKC")
  .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
  .replace(/\s+/g, "").trim().toUpperCase();

export const isBuildingCode = (str: string): boolean => /^(?:\d{3}[A-Z]\d{1,3}|\d{6})$/.test(compact(str));

export const cleanBuildingCode = (raw: string): string => {
  const value=compact(raw); if(!value)return "";
  const full=value.match(/^(\d{3})([A-Z])(\d{1,3})$/);
  if(full)return `${full[1]}${full[2]}${full[3].padStart(2,"0")}`;
  if(/^\d{6}$/.test(value))return value;
  return /^[A-Z]?\d{1,3}$/.test(value)?value:"";
};

export const cleanHallCode = (raw: string): string => {
  const value=compact(raw); if(!value)return "";
  if(isBuildingCode(value))return "";
  const alpha=value.match(/^([A-Z]+)0*(\d+)([A-Z]?)$/);
  if(alpha)return `${alpha[1]}${Number(alpha[2])<100?String(Number(alpha[2])).padStart(2,"0"):Number(alpha[2])}${alpha[3]}`;
  return /^\d{1,4}[A-Z]?$/.test(value)?value:"";
};

export const formatDisplayBuilding = (buildingCode: string): string => cleanBuildingCode(buildingCode)||compact(buildingCode)||"—";

export const getBuildingKeys = (raw: string): string[] => {
  const value=compact(raw);if(!value)return[];const keys=new Set([value]);
  const full=value.match(/^(\d{3})([A-Z])0*(\d+)$/);if(full){const n=String(Number(full[3]));keys.add(`${full[1]}${full[2]}${n.padStart(2,"0")}`);keys.add(`${full[2]}${n}`);keys.add(`${full[2]}${n.padStart(2,"0")}`);}
  const short=value.match(/^([A-Z])0*(\d+)$/);if(short){const n=String(Number(short[2]));keys.add(`${short[1]}${n}`);keys.add(`${short[1]}${n.padStart(2,"0")}`);}
  return [...keys];
};
export const getHallKeys = (raw: string): string[] => {
  const value=compact(raw);if(!value)return[];const keys=new Set([value]);const alpha=value.match(/^([A-Z]+)0*(\d+)([A-Z]?)$/);if(alpha){const n=String(Number(alpha[2]));keys.add(`${alpha[1]}${n}${alpha[3]}`);keys.add(`${alpha[1]}${n.padStart(2,"0")}${alpha[3]}`);}return[...keys];
};
export const isRoomKnownInDept = (building:string,hall:string,deptRooms:Array<{building:string;hall:string}>):boolean => {
  if(!deptRooms?.length)return false;const bk=new Set(getBuildingKeys(building)),hk=new Set(getHallKeys(hall));return deptRooms.some(r=>getBuildingKeys(r.building).some(k=>bk.has(k))&&getHallKeys(r.hall).some(k=>hk.has(k)));
};
