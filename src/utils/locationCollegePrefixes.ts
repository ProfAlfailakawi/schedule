/**
 * Authoritative college/site prefixes supplied by the system owner on 2026-08-24.
 * A building identity is <sitePrefix><two-digit building number>.
 * Example: 012B + building 7 => 012B07.
 */
export const OFFICIAL_COLLEGE_SITE_PREFIXES = [
  { collegeName: "كلية التربية الأساسية - بنات", sitePrefix: "012B" },
  { collegeName: "كلية التربية الأساسية - بنين", sitePrefix: "011B" },
  { collegeName: "كلية التربية الأساسية - بنات - الجهراء", sitePrefix: "012J" },
  { collegeName: "كلية التربية الأساسية - بنات - الفحيحيل", sitePrefix: "012F" },
  { collegeName: "كلية الدراسات التجارية - بنات", sitePrefix: "022T" },
  { collegeName: "كلية الدراسات التجارية - بنين", sitePrefix: "021T" },
  { collegeName: "كلية العلوم الصحية - بنات", sitePrefix: "032B" },
  { collegeName: "كلية العلوم الصحية - بنين", sitePrefix: "031B" },
  { collegeName: "كلية التمريض - بنين", sitePrefix: "0510" },
  { collegeName: "كلية التمريض - بنات", sitePrefix: "0520" },
  { collegeName: "كلية الدراسات التكنولوجية - بنات", sitePrefix: "0420" },
  { collegeName: "كلية الدراسات التكنولوجية - بنين", sitePrefix: "0410" },
] as const;

export const normalizeCollegeName = (value: unknown): string => String(value ?? "")
  .normalize("NFKC")
  .replace(/[\s\-–—_]+/g, "")
  .trim();

const PREFIX_BY_COLLEGE_NAME = new Map(
  OFFICIAL_COLLEGE_SITE_PREFIXES.map(item => [normalizeCollegeName(item.collegeName), item.sitePrefix] as const),
);

export const officialCollegeSitePrefix = (collegeName: unknown): string | undefined =>
  PREFIX_BY_COLLEGE_NAME.get(normalizeCollegeName(collegeName));

export function officialBuildingCode(sitePrefix: string, buildingNumber: unknown): string | null {
  const prefix = String(sitePrefix || "").trim().toUpperCase();
  const raw = String(buildingNumber ?? "").trim().replace(/^0+/, "") || "0";
  if (!/^\d{1,3}$/.test(raw) || Number(raw) <= 0 || !/^[A-Z0-9]{4}$/.test(prefix)) return null;
  return `${prefix}${String(Number(raw)).padStart(2, "0")}`;
}

export function parseOfficialBuildingCode(code: unknown, sitePrefix?: string): { sitePrefix: string; buildingNumber: string; officialCode: string } | null {
  const token = String(code ?? "").normalize("NFKC").trim().toUpperCase().replace(/\s+/g, "");
  const prefix = String(sitePrefix || "").trim().toUpperCase();
  if (prefix) {
    const m = token.match(new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}0*(\\d{1,3})$`));
    if (!m || Number(m[1]) <= 0) return null;
    const canonical = officialBuildingCode(prefix, Number(m[1]));
    return canonical ? { sitePrefix: prefix, buildingNumber: String(Number(m[1])), officialCode: canonical } : null;
  }
  // Without a college context only the already-unambiguous alpha form is parsed.
  // Numeric site prefixes (0510/0520/0410/0420) MUST have college context.
  const alpha = token.match(/^(\d{3}[A-Z])0*(\d{1,3})$/);
  if (!alpha || Number(alpha[2]) <= 0) return null;
  const canonical = officialBuildingCode(alpha[1], Number(alpha[2]));
  return canonical ? { sitePrefix: alpha[1], buildingNumber: String(Number(alpha[2])), officialCode: canonical } : null;
}

export const buildingNumberLabel = (building: { buildingNumber?: string; officialCode: string; sitePrefix?: string }): string => {
  const n = Number(building.buildingNumber);
  return Number.isFinite(n) && n > 0 ? String(n) : building.officialCode;
};
