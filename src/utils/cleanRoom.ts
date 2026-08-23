export const cleanBuildingCode = (raw: string): string => {
  const clean = String(raw || "").replace(/\s+/g, "").toUpperCase();
  if (!clean) return "";
  const mFull = clean.match(/(?:012|011|010)?B\d{1,3}/);
  if (mFull) return mFull[0];
  if (/^B\d{1,3}$/.test(clean)) return clean;
  return "";
};

export const cleanHallCode = (raw: string): string => {
  const clean = String(raw || "").replace(/\s+/g, "").toUpperCase();
  if (!clean) return "";
  if (/^(?:012|011|010)?B\d{1,3}$/.test(clean)) return "";
  const m = clean.match(/([FGACDEMNPLK]|[A-Z])\d{1,4}/);
  if (m && !/^B\d+$/.test(m[0])) return m[0];
  return "";
};

