export const isBuildingCode = (str: string): boolean => {
  const clean = String(str || "").replace(/\s+/g, "").toUpperCase();
  return /^(?:012|011|010|014|015)?(?:B\d{1,2}|F15|J14)$/.test(clean) || /^(?:B\d{1,2}|F15|J14)$/.test(clean);
};

export const cleanBuildingCode = (raw: string): string => {
  const clean = String(raw || "").replace(/\s+/g, "").toUpperCase();
  if (!clean) return "";
  const mFull = clean.match(/(?:012|011|010|014|015)?(B\d{1,2}|F15|J14)/);
  if (mFull) {
    if (/^(?:012|011|010|014|015)/.test(mFull[0])) return mFull[0];
    return `012${mFull[1]}`;
  }
  const mDigit = clean.match(/^(?:مبنى)?0*(\d{1,2})$/);
  if (mDigit) {
    const n = Number(mDigit[1]);
    const letter = n === 15 ? "F" : n === 14 ? "J" : "B";
    return `012${letter}${String(n).padStart(2, "0")}`;
  }
  return "";
};

export const cleanHallCode = (raw: string): string => {
  const clean = String(raw || "").replace(/\s+/g, "").toUpperCase();
  if (!clean) return "";
  if (isBuildingCode(clean)) return "";
  const m = clean.match(/([FGACDEMNPLKJ]|[A-Z])\d{1,3}/);
  if (m && !isBuildingCode(m[0])) return m[0];
  const mDigit = clean.match(/^0*(\d{1,3})$/);
  if (mDigit) return `F${mDigit[1].padStart(2, "0")}`;
  return "";
};

export const formatDisplayBuilding = (buildingCode: string): string => {
  const clean = String(buildingCode || "").trim().toUpperCase();
  if (!clean) return "—";
  const core = clean.replace(/^(?:012|011|010|014|015)/, "");
  const m = core.match(/(\d+)/) || clean.match(/(\d+)/);
  if (m) return String(parseInt(m[1], 10));
  return clean;
};

export const getBuildingKeys = (raw: string): string[] => {
  const clean = String(raw || "").trim().toUpperCase();
  if (!clean) return [];
  const keys = new Set<string>();
  keys.add(clean);
  const core = clean.replace(/^(?:012|011|010|014|015)/, "");
  if (core) keys.add(core);
  const numMatch = core.match(/(\d+)/) || clean.match(/(\d+)/);
  if (numMatch) {
    const n = String(parseInt(numMatch[1], 10));
    keys.add(n);
    keys.add(n.padStart(2, "0"));
    keys.add(`B${n.padStart(2, "0")}`);
    keys.add(`012B${n.padStart(2, "0")}`);
  }
  const letterNum = core.match(/([A-Z])(\d+)/) || clean.match(/([A-Z])(\d+)/);
  if (letterNum) {
    const letter = letterNum[1];
    const n = String(parseInt(letterNum[2], 10));
    keys.add(`${letter}${n}`);
    keys.add(`${letter}${n.padStart(2, "0")}`);
    keys.add(`012${letter}${n.padStart(2, "0")}`);
  }
  return [...keys];
};

export const getHallKeys = (raw: string): string[] => {
  const clean = String(raw || "").trim().toUpperCase();
  if (!clean) return [];
  const keys = new Set<string>();
  keys.add(clean);
  const m = clean.match(/([A-Z])?0*(\d+)/);
  if (m) {
    const letter = m[1] || "";
    const n = m[2];
    if (letter) {
      keys.add(`${letter}${n}`);
      keys.add(`${letter}${n.padStart(2, "0")}`);
    }
    keys.add(n);
    keys.add(n.padStart(2, "0"));
  }
  return [...keys];
};

export const isRoomKnownInDept = (building: string, hall: string, deptRooms: Array<{ building: string; hall: string }>): boolean => {
  if (!deptRooms || !deptRooms.length) return true; // If no database history exists yet, don't falsely claim unknown
  const bKeys = new Set(getBuildingKeys(building));
  const hKeys = new Set(getHallKeys(hall));
  return deptRooms.some(r => {
    const rBKeys = getBuildingKeys(r.building);
    const rHKeys = getHallKeys(r.hall);
    const bMatch = rBKeys.some(k => bKeys.has(k));
    const hMatch = rHKeys.some(k => hKeys.has(k));
    return bMatch && hMatch;
  });
};


