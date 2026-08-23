export const cleanBuildingCode = (raw: string): string => {
  const clean = String(raw || "").replace(/\s+/g, "").toUpperCase();
  if (!clean) return "";
  const mB = clean.match(/(?:012|011|010)?(B\d{1,3})/);
  if (mB) return mB[1];
  if (/^B\d{1,3}$/.test(clean)) return clean;
  return "";
};

export const cleanHallCode = (raw: string): string => {
  const clean = String(raw || "").replace(/\s+/g, "").toUpperCase();
  if (!clean) return "";
  if (/^(?:012|011|010)?B\d{1,3}$/.test(clean)) return "";
  const mH = clean.match(/\b([FG]\d{1,4}|[A-Z]\d{1,3})\b/);
  if (mH && !/^B\d{1,3}$/.test(mH[1])) return mH[1];
  return clean;
};
