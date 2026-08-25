/**
 * Authoritative college/site prefixes supplied by the system owner on 2026-08-24.
 * A building identity is <sitePrefix><two-digit building number>.
 * Example: 012B + building 7 => 012B07.
 */
export const OFFICIAL_COLLEGE_SITE_PREFIXES = [
  { collegeName: "كلية التربية الأساسية - بنات", sitePrefix: "012B", siteLabel: "التربية الأساسية - بنات" },
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

/**
 * Recover an OFFICIAL building code from the already-proven building cell of an
 * Authority/SWRSCHA report. This is deliberately registry constrained.
 *
 * Example for branch 012:
 *   printed 012B09 -> site prefix 012B + building 09.
 * Phone OCR may drop the leading zero or paint a border over it (12B09,
 * 112B09), but the meaningful suffix B09 is still present in the BUILDING
 * cell. We reconstruct only when that suffix points to exactly one CONFIRMED
 * code supplied by the caller for the document branch. No code is invented.
 */
export function recoverOfficialBuildingCodeFromAuthorityCell(
  raw: unknown,
  branchCode: unknown,
  knownOfficialCodes: readonly string[],
): string | null {
  const token=String(raw??"").normalize("NFKC").toUpperCase().replace(/[^A-Z0-9]/g,"");
  if(!token)return null;
  const branch=String(branchCode??"").normalize("NFKC").replace(/[^0-9]/g,"").slice(0,3);
  const codes=[...new Set(knownOfficialCodes.map(code=>String(code||"").trim().toUpperCase()).filter(Boolean))];
  const inBranch=(code:string)=>!branch||code.startsWith(branch);
  const candidates=codes.filter(inBranch);
  const exact=candidates.filter(code=>code===token);
  if(exact.length===1)return exact[0];

  /* Alpha-site colleges: branch 012 + site B + building 09 => 012B09.
     Require at least the last two branch digits immediately before the site
     letter. This rejects a stray room token such as F13 while accepting the
     measured scan artefacts 12B09 / 112B09 / J12B07. */
  const alphaPieces=[...token.matchAll(/([0-9]{2,4})([A-Z])0*([0-9]{1,2})/g)];
  for(const piece of alphaPieces){
    const beforeDigits=piece[1],siteLetter=piece[2],building=String(Number(piece[3])).padStart(2,"0");
    if(branch&&beforeDigits.slice(-2)!==branch.slice(-2))continue;
    const suffix=`${siteLetter}${building}`;
    const hits=candidates.filter(code=>/^\d{3}[A-Z]\d{2}$/.test(code)&&code.slice(-3)===suffix);
    if(hits.length===1)return hits[0];
  }

  /* A clean short site+building token (B09) is accepted only if the supplied
     branch catalogue has one and only one such official code. */
  const short=token.match(/^([A-Z])0*([0-9]{1,2})$/);
  if(short){
    const suffix=`${short[1]}${String(Number(short[2])).padStart(2,"0")}`;
    const hits=candidates.filter(code=>/^\d{3}[A-Z]\d{2}$/.test(code)&&code.slice(-3)===suffix);
    if(hits.length===1)return hits[0];
  }

  /* Numeric-site prefixes (0510/0520/0410/0420) are intentionally conservative:
     only the already-complete official six-digit token is accepted. Without the
     site digit, a two-digit building number alone is not enough evidence. */
  return null;
}
