/**
 * Conservative recovery for image-only, multi-page Authority timetable scans.
 *
 * Some CamScanner exports physically crop or blur a narrow cell on later pages.
 * We never overwrite OCR. We only fill a value that OCR left empty when the
 * already-observed facts on that SAME row point to one unambiguous historical
 * schedule fingerprint (or several historical duplicates that all agree on the
 * value being recovered).
 *
 * This is intentionally isolated from the normal PDF/text path and from the
 * single-page scan path; the caller decides when to enable it.
 */

const DAY_KEYS = ["fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday"] as const;

type Row = Record<string, any>;

const clock = (value: unknown) => {
  const raw = String(value ?? "").trim();
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  const digits = raw.replace(/\D/g, "");
  if (/^\d{3,4}$/.test(digits)) return `${digits.slice(0, -2).padStart(2, "0")}:${digits.slice(-2)}`;
  return "";
};

const compact = (value: unknown) => String(value ?? "").normalize("NFKC").trim().replace(/\s+/g, "").toUpperCase();
const building = (value: unknown) => {
  const token = compact(value);
  const hit = token.match(/\d{3}[A-Z]\d{2}/);
  return hit?.[0] || token;
};
const hall = (value: unknown) => compact(value);
const section = (value: unknown) => String(value ?? "").replace(/\D/g, "").replace(/^0+/, "");
const reference = (value: unknown) => String(value ?? "").replace(/[\s\u200e\u200f\u202a-\u202e]/g, "").trim();
const boolFlag = (value: unknown) => {
  const token = String(value ?? "").trim().toLowerCase();
  return value === true || value === 1 || token === "1" || token === "true" || token === "y" || token === "yes";
};
const daySignature = (row: Row) => DAY_KEYS.map((key, index) => boolFlag(row?.[key]) ? String(index + 1) : "").filter(Boolean).join("");

const foldName = (value: unknown) => String(value ?? "")
  .normalize("NFKC")
  .replace(/[ً-ْـ]/g, "")
  .replace(/[إأآٱ]/g, "ا")
  .replace(/ى/g, "ي")
  .replace(/ة/g, "ه")
  .replace(/[^ء-يA-Za-z0-9 ]/g, " ")
  .replace(/^(?:(?:ا\s*د|دكتور|الدكتور|دكتوره|الدكتوره|استاذ|الاستاذ|بروفيسور|د|ا|م)\s+)+/g, "")
  .replace(/عبد\s+/g, "عبد")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

const consensus = <T>(values: T[], key: (value: T) => string): T | undefined => {
  if (!values.length) return undefined;
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const k = key(value);
    if (!k) continue;
    const bucket = groups.get(k) || [];
    bucket.push(value);
    groups.set(k, bucket);
  }
  if (groups.size !== 1) return undefined;
  return [...groups.values()][0][0];
};

export type AuthorityHistoryRecoverySummary = {
  recoveredRows: number;
  recoveredCells: number;
  rowFields: Map<number, string[]>;
};

export function recoverAuthorityScanRowsFromHistory(
  rows: Row[],
  history: Row[],
  instructorNameById: Map<number, string> = new Map(),
): AuthorityHistoryRecoverySummary {
  const rowFields = new Map<number, string[]>();
  let recoveredCells = 0;
  if (!rows.length || !history.length) return { recoveredRows: 0, recoveredCells: 0, rowFields };

  const historyRows = history.filter(row => Number(row?.AdCourseId || 0) > 0);

  rows.forEach((row, rowIndex) => {
    const observed = {
      course: Number(row?.AdCourseId || 0),
      instructor: Number(row?.AdInstructorId || 0),
      instructorName: foldName(row?.sourceInstructorText),
      start: clock(row?.fstarttime),
      end: clock(row?.fendtime),
      days: daySignature(row),
      building: building(row?.sourceBuildingText || row?.AdRoomCode),
      hall: hall(row?.sourceRoomText || row?.AdRoomHall),
      section: section(row?.sourceSectionText || row?.SCode),
      reference: reference(row?.referenceNumber),
    };

    let evidenceCategories = 0;
    let evidenceScore = 0;
    if (observed.course) { evidenceCategories++; evidenceScore += 8; }
    if (observed.instructor) { evidenceCategories++; evidenceScore += 6; }
    else if (observed.instructorName.length >= 5) { evidenceCategories++; evidenceScore += 4; }
    if (observed.start || observed.end) { evidenceCategories++; evidenceScore += 6; }
    if (observed.days) { evidenceCategories++; evidenceScore += 4; }
    if (observed.building) { evidenceCategories++; evidenceScore += 3; }
    if (observed.hall) { evidenceCategories++; evidenceScore += 3; }
    if (observed.section && Number(observed.section) >= 500) { evidenceScore += 1; }

    /* One weak fact must never manufacture timetable data. A reference-number
       equality is excellent extra proof but is not required because Authority
       CRNs commonly change between terms. */
    if (evidenceCategories < 2 || evidenceScore < 9) return;

    const candidates = historyRows.filter(candidate => {
      if (observed.course && Number(candidate?.AdCourseId || 0) !== observed.course) return false;
      if (observed.instructor && Number(candidate?.AdInstructorId || 0) !== observed.instructor) return false;
      if (!observed.instructor && observed.instructorName) {
        const candidateName = foldName(instructorNameById.get(Number(candidate?.AdInstructorId || 0)) || candidate?.sourceInstructorText || "");
        if (candidateName && candidateName !== observed.instructorName) return false;
      }
      if (observed.start && clock(candidate?.fstarttime) !== observed.start) return false;
      if (observed.end && clock(candidate?.fendtime) !== observed.end) return false;
      if (observed.days && daySignature(candidate) !== observed.days) return false;
      if (observed.building && building(candidate?.AdRoomCode) !== observed.building) return false;
      if (observed.hall && hall(candidate?.AdRoomHall) !== observed.hall) return false;
      /* Printed section is a weak helper only after the stronger facts match.
         It is deliberately NOT a hard filter because this importer owns the
         canonical 501/502/... generation after course recovery. */
      return true;
    });
    if (!candidates.length) return;

    const recovered: string[] = [];
    const set = (field: string, value: any) => {
      if (value === undefined || value === null || value === "") return;
      row[field] = value;
      recovered.push(field);
      recoveredCells++;
    };

    if (!Number(row?.AdCourseId || 0)) {
      const candidate = consensus(candidates, item => String(Number(item?.AdCourseId || 0)));
      if (candidate && Number(candidate.AdCourseId || 0) > 0) set("AdCourseId", Number(candidate.AdCourseId));
    }
    if (!Number(row?.AdInstructorId || 0)) {
      const candidate = consensus(candidates, item => String(Number(item?.AdInstructorId || 0)));
      if (candidate && Number(candidate.AdInstructorId || 0) > 0) set("AdInstructorId", Number(candidate.AdInstructorId));
    }
    if (!clock(row?.fstarttime)) {
      const candidate = consensus(candidates, item => clock(item?.fstarttime));
      if (candidate && clock(candidate.fstarttime)) set("fstarttime", clock(candidate.fstarttime));
    }
    if (!clock(row?.fendtime)) {
      const candidate = consensus(candidates, item => clock(item?.fendtime));
      if (candidate && clock(candidate.fendtime)) set("fendtime", clock(candidate.fendtime));
    }
    if (!daySignature(row)) {
      const candidate = consensus(candidates, item => daySignature(item));
      if (candidate && daySignature(candidate)) {
        for (const key of DAY_KEYS) row[key] = boolFlag(candidate[key]);
        recovered.push(...DAY_KEYS);
        recoveredCells += DAY_KEYS.length;
      }
    }
    if (!building(row?.sourceBuildingText || row?.AdRoomCode)) {
      const candidate = consensus(candidates, item => building(item?.AdRoomCode));
      if (candidate && building(candidate.AdRoomCode)) set("AdRoomCode", String(candidate.AdRoomCode || "").trim());
    }
    if (!hall(row?.sourceRoomText || row?.AdRoomHall)) {
      const candidate = consensus(candidates, item => hall(item?.AdRoomHall));
      if (candidate && hall(candidate.AdRoomHall)) set("AdRoomHall", String(candidate.AdRoomHall || "").trim());
    }

    if (recovered.length) {
      const unique = [...new Set(recovered)];
      row.__authorityHistoryRecoveredFields = unique;
      row.__authorityHistoryRecoveryEvidence = {
        candidateCount: candidates.length,
        observedScore: evidenceScore,
        observedCategories: evidenceCategories,
        matchedReference: Boolean(observed.reference && candidates.some(item => reference(item?.referenceNumber) === observed.reference)),
      };
      rowFields.set(rowIndex, unique);
    }
  });

  return { recoveredRows: rowFields.size, recoveredCells, rowFields };
}
