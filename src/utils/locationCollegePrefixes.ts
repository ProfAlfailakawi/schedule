/**
 * Authoritative college/site prefixes supplied by the system owner on 2026-08-24.
 * A building identity is <sitePrefix><two-digit building number>.
 * Example: 012B + building 7 => 012B07.
 */
export const OFFICIAL_COLLEGE_SITE_PREFIXES = [
  { collegeName: "كلية التربية الأساسية - بنات", sitePrefix: "012B", siteLabel: "التربية الأساسية" },
  { collegeName: "كلية التربية الأساسية - بنين", sitePrefix: "011B", siteLabel: "التربية الأساسية - بنين" },
  { collegeName: "كلية التربية الأساسية - بنات - الجهراء", sitePrefix: "012J", siteLabel: "التربية الأساسية - الجهراء" },
  { collegeName: "كلية التربية الأساسية - بنات - الفحيحيل", sitePrefix: "012F", siteLabel: "التربية الأساسية - الفحيحيل" },
  { collegeName: "كلية الدراسات التجارية - بنات", sitePrefix: "022T", siteLabel: "الدراسات التجارية - بنات" },
  { collegeName: "كلية الدراسات التجارية - بنين", sitePrefix: "021T", siteLabel: "الدراسات التجارية - بنين" },
  { collegeName: "كلية العلوم الصحية - بنات", sitePrefix: "032B", siteLabel: "العلوم الصحية - بنات" },
  { collegeName: "كلية العلوم الصحية - بنين", sitePrefix: "031B", siteLabel: "العلوم الصحية - بنين" },
  { collegeName: "كلية التمريض - بنين", sitePrefix: "0510", siteLabel: "التمريض - بنين" },
  { collegeName: "كلية التمريض - بنات", sitePrefix: "0520", siteLabel: "التمريض - بنات" },
  { collegeName: "كلية الدراسات التكنولوجية - بنات", sitePrefix: "0420", siteLabel: "الدراسات التكنولوجية - بنات" },
  { collegeName: "كلية الدراسات التكنولوجية - بنين", sitePrefix: "0410", siteLabel: "الدراسات التكنولوجية - بنين" },
] as const;

export const normalizeCollegeName = (value: unknown): string => String(value ?? "")
  .normalize("NFKC")
  .replace(/[\s\-–—_]+/g, "")
  .trim();

const EXTRA_COLLEGE_NAME_ALIASES: Record<string, string> = {
  [normalizeCollegeName("التربية الأساسية")]: "012B",
  [normalizeCollegeName("التربية الاساسية")]: "012B",
  [normalizeCollegeName("الجهراء")]: "012J",
  [normalizeCollegeName("التربية الأساسية - الجهراء")]: "012J",
  [normalizeCollegeName("كلية التربية الأساسية - الجهراء")]: "012J",
  [normalizeCollegeName("الفحيحيل")]: "012F",
  [normalizeCollegeName("التربية الأساسية - الفحيحيل")]: "012F",
  [normalizeCollegeName("كلية التربية الأساسية - الفحيحيل")]: "012F",
};

const PREFIX_BY_COLLEGE_NAME = new Map<string, string>([
  ...OFFICIAL_COLLEGE_SITE_PREFIXES.map(item => [normalizeCollegeName(item.collegeName), item.sitePrefix] as const),
  ...Object.entries(EXTRA_COLLEGE_NAME_ALIASES),
]);

const SITE_LABEL_BY_PREFIX = new Map<string, string>(
  OFFICIAL_COLLEGE_SITE_PREFIXES.map(item => [item.sitePrefix, item.siteLabel] as const),
);

export const officialCollegeSitePrefix = (collegeName: unknown): string | undefined =>
  PREFIX_BY_COLLEGE_NAME.get(normalizeCollegeName(collegeName));

export const officialSiteLabel = (sitePrefix: unknown, fallback?: unknown): string => {
  const prefix = String(sitePrefix ?? "").trim().toUpperCase();
  return SITE_LABEL_BY_PREFIX.get(prefix) || String(fallback ?? "").trim() || prefix || "موقع غير محدد";
};

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
