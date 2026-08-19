import type { AdCourse, AdInstructor, AdTerm, FSchedule, ScheduleVersion } from "../types";
import { SCHEDULE_DAYS, timeToMinutes, minutesToTime, type DayKey } from "./scheduleIntelligence";

export type HistoricalDayModel = {
  minute: number;
  samples: number;
  share: number;
  ladder: string[];
  /** Ranked starts for this exact history slice. Used to distinguish a genuinely unusual start from a merely less-common one. */
  starts: Array<{ time: string; samples: number; share: number }>;
  durationMinutes: number;
  durationSamples: number;
  durationShare: number;
  durationRange: [number, number];
  /** Ranked durations for the same course/day slice. */
  durations: Array<{ minutes: number; samples: number; share: number }>;
  confidence: number;
  /** Evidence from the newest six terms; keeps a 2017-only habit from outranking today's department. */
  modernSamples: number;
  freshness: number;
};

export type HistoricalGroupModel = {
  samples: number;
  days: Partial<Record<DayKey, HistoricalDayModel>>;
};

export type HistoricalTimeModel = {
  years: number;
  learnedFrom: number;
  modernTerms: number[];
  department: HistoricalGroupModel;
  patterns: Record<string, HistoricalGroupModel>;
  courses: Record<string, { samples: number; days: HistoricalGroupModel["days"]; patterns: Record<string, HistoricalGroupModel> }>;
};

const dayKeys = SCHEDULE_DAYS.map(item => item.key as DayKey);
const daysOf = (row: FSchedule) => dayKeys.filter(day => Boolean((row as any)[day]));
export const patternKeyOf = (row: Partial<FSchedule>) => dayKeys.filter(day => Boolean((row as any)[day])).join("+");
const placementKey = (row: Partial<FSchedule>) => [
  patternKeyOf(row), String(row.fstarttime || ""), String(row.fendtime || ""),
  String(row.AdRoomCode || ""), String(row.AdRoomHall || ""), Number(row.AdInstructorId || 0),
].join("|");
const identityKey = (row: Partial<FSchedule>) => `${Number(row.AdCourseId || 0)}:${String(row.SCode || "")}`;

const termChronology = (term: AdTerm) => {
  const name = String(term.AdTermName || "");
  const years = name.match(/(\d{4})\s*\/\s*(\d{4})/);
  const season = name.includes("الصيفي") ? 2 : name.includes("الثاني") ? 1 : name.includes("الأول") ? 0 : 0;
  return years ? Number(years[1]) * 10 + season : Number(term.AdTermId || 0);
};

export function recentTenYearIds(terms: AdTerm[]): Set<number> {
  const sorted = [...terms].sort((a, b) => termChronology(b) - termChronology(a));
  const newest = sorted[0];
  if (!newest) return new Set();
  const newestName = String(newest.AdTermName || "");
  const year = Number(newestName.match(/(\d{4})\s*\//)?.[1] || 0);
  if (!year) return new Set(sorted.slice(0, 30).map(term => Number(term.AdTermId)));
  return new Set(sorted.filter(term => {
    const y = Number(String(term.AdTermName || "").match(/(\d{4})\s*\//)?.[1] || 0);
    return y ? y >= year - 10 : true;
  }).map(term => Number(term.AdTermId)));
}

function percentile(values: number[], share: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * share)));
  return sorted[index] || 0;
}

function weightedMode<T>(values: Array<{ value: T; weight: number }>): { value: T | null; weight: number; total: number } {
  const counts = new Map<T, number>();
  let total = 0;
  for (const item of values) {
    counts.set(item.value, (counts.get(item.value) || 0) + item.weight);
    total += item.weight;
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return { value: ranked[0]?.[0] ?? null, weight: ranked[0]?.[1] || 0, total };
}

function buildGroup(rows: FSchedule[], weights: Map<number, number>, modernTermIds: Set<number>): HistoricalGroupModel {
  const days: HistoricalGroupModel["days"] = {};
  for (const day of dayKeys) {
    const mine = rows.filter(row => Boolean((row as any)[day]) && row.fstarttime && row.fendtime);
    if (!mine.length) continue;
    const minuteValues: Array<{ value: number; weight: number }> = [];
    const startValues: Array<{ value: string; weight: number }> = [];
    const durationValuesWeighted: Array<{ value: number; weight: number }> = [];
    const durationRaw: number[] = [];
    for (const row of mine) {
      const start = String(row.fstarttime || "").slice(0, 5);
      const match = start.match(/^(\d{1,2}):(\d{2})$/);
      const weight = weights.get(Number(row.AdTermId || 0)) || 1;
      if (match) {
        const minute = Number(match[2]);
        if (Number.isFinite(minute) && minute >= 0 && minute <= 59) {
          minuteValues.push({ value: minute, weight });
          startValues.push({ value: start, weight });
        }
      }
      const duration = timeToMinutes(String(row.fendtime || "")) - timeToMinutes(String(row.fstarttime || ""));
      if (duration >= 20 && duration <= 300) {
        durationValuesWeighted.push({ value: duration, weight });
        durationRaw.push(duration);
      }
    }
    const minuteMode = weightedMode(minuteValues);
    const durationMode = weightedMode(durationValuesWeighted);
    const startCounts = new Map<string, number>();
    const startRawCounts = new Map<string, number>();
    for (const item of startValues) {
      startCounts.set(item.value, (startCounts.get(item.value) || 0) + item.weight);
      startRawCounts.set(item.value, (startRawCounts.get(item.value) || 0) + 1);
    }
    const rankedStarts = [...startCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const ladder = rankedStarts.slice(0, 8).map(([time]) => time).sort();
    const starts = rankedStarts.map(([time, weight]) => ({
      time,
      samples: startRawCounts.get(time) || 0,
      share: minuteMode.total ? weight / minuteMode.total : 0,
    }));

    const durationCounts = new Map<number, number>();
    const durationRawCounts = new Map<number, number>();
    for (const item of durationValuesWeighted) {
      durationCounts.set(item.value, (durationCounts.get(item.value) || 0) + item.weight);
      durationRawCounts.set(item.value, (durationRawCounts.get(item.value) || 0) + 1);
    }
    const durations = [...durationCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .map(([minutes, weight]) => ({
        minutes,
        samples: durationRawCounts.get(minutes) || 0,
        share: durationMode.total ? weight / durationMode.total : 0,
      }));
    const minuteShare = minuteMode.total ? minuteMode.weight / minuteMode.total : 0;
    const durationShare = durationMode.total ? durationMode.weight / durationMode.total : 0;
    const modernSamples = mine.filter(row => modernTermIds.has(Number(row.AdTermId || 0))).length;
    const freshness = mine.length ? modernSamples / mine.length : 0;
    const freshnessScore = modernSamples ? Math.min(12, 4 + Math.min(8, modernSamples)) : 0;
    const confidence = Math.round(Math.min(100, (Math.min(1, mine.length / 24) * 28) + minuteShare * 31 + durationShare * 25 + freshnessScore));
    days[day] = {
      minute: Number(minuteMode.value ?? 0),
      samples: minuteValues.length,
      share: minuteShare,
      ladder,
      starts,
      durationMinutes: Number(durationMode.value ?? 0),
      durationSamples: durationValuesWeighted.length,
      durationShare,
      durationRange: durationRaw.length ? [percentile(durationRaw, .1), percentile(durationRaw, .9)] : [0, 0],
      durations,
      confidence,
      modernSamples,
      freshness,
    };
  }
  return { samples: rows.length, days };
}

/**
 * Recency-weighted institutional clock. The newest two terms count almost twice
 * as much as old history, but older rows still prevent one exceptional term
 * from becoming a new "rule" overnight.
 */
export function buildHistoricalTimeModel(rows: FSchedule[], terms: AdTerm[], years = 10, anchorTermId = 0): HistoricalTimeModel {
  const sortedTerms = [...terms].sort((a, b) => termChronology(b) - termChronology(a));
  const anchor = (anchorTermId ? terms.find(term => Number(term.AdTermId) === Number(anchorTermId)) : null) || sortedTerms[0];
  const anchorScore = anchor ? termChronology(anchor) : Number.POSITIVE_INFINITY;
  const anchorYear = Number(String(anchor?.AdTermName || "").match(/(\d{4})\s*\//)?.[1] || 0);
  const allowed = new Set(sortedTerms.filter(term => {
    if (termChronology(term) > anchorScore) return false;
    if (!anchorYear) return true;
    const year = Number(String(term.AdTermName || "").match(/(\d{4})\s*\//)?.[1] || 0);
    return !year || year >= anchorYear - years;
  }).map(term => Number(term.AdTermId)));
  const history = rows.filter(row => allowed.has(Number(row.AdTermId || 0)));
  const rankedTerms = [...terms].filter(term => allowed.has(Number(term.AdTermId || 0))).sort((a, b) => termChronology(b) - termChronology(a));
  const weights = new Map<number, number>();
  rankedTerms.forEach((term, index) => {
    const weight = index < 2 ? 2.2 : index < 5 ? 1.75 : index < 9 ? 1.35 : 1;
    weights.set(Number(term.AdTermId), weight);
  });
  const modernTermIds = new Set(rankedTerms.slice(0, 6).map(term => Number(term.AdTermId)));
  const patterns: Record<string, HistoricalGroupModel> = {};
  const patternRows = new Map<string, FSchedule[]>();
  history.forEach(row => {
    const key = patternKeyOf(row);
    if (!key) return;
    patternRows.set(key, [...(patternRows.get(key) || []), row]);
  });
  for (const [key, list] of patternRows) if (list.length >= 4) patterns[key] = buildGroup(list, weights, modernTermIds);

  const courseRows = new Map<number, FSchedule[]>();
  history.forEach(row => {
    const id = Number(row.AdCourseId || 0);
    if (!id) return;
    courseRows.set(id, [...(courseRows.get(id) || []), row]);
  });
  const courses: HistoricalTimeModel["courses"] = {};
  for (const [courseId, list] of courseRows) {
    if (list.length < 3) continue;
    const coursePatterns: Record<string, HistoricalGroupModel> = {};
    const map = new Map<string, FSchedule[]>();
    list.forEach(row => {
      const key = patternKeyOf(row);
      if (!key) return;
      map.set(key, [...(map.get(key) || []), row]);
    });
    for (const [key, rowsForPattern] of map) if (rowsForPattern.length >= 3) coursePatterns[key] = buildGroup(rowsForPattern, weights, modernTermIds);
    courses[String(courseId)] = { samples: list.length, days: buildGroup(list, weights, modernTermIds).days, patterns: coursePatterns };
  }
  return {
    years,
    learnedFrom: history.length,
    modernTerms: rankedTerms.slice(0, 6).map(term => Number(term.AdTermId)),
    department: buildGroup(history, weights, modernTermIds),
    patterns,
    courses,
  };
}

export function pickHistoricalDayModel(model: HistoricalTimeModel | null | undefined, row: Partial<FSchedule>, day: DayKey): { data: HistoricalDayModel | null; basis: "course-pattern" | "course" | "pattern" | "department" | "none" } {
  if (!model) return { data: null, basis: "none" };
  const course = model.courses[String(Number(row.AdCourseId || 0))];
  const pattern = patternKeyOf(row);
  const candidates: Array<[HistoricalDayModel | undefined, "course-pattern" | "course" | "pattern" | "department"]> = [
    [course?.patterns?.[pattern]?.days?.[day], "course-pattern"],
    [course?.days?.[day], "course"],
    [model.patterns?.[pattern]?.days?.[day], "pattern"],
    [model.department?.days?.[day], "department"],
  ];
  /* Modern evidence wins before specificity. A course pattern seen 60 times in
     2017 is useful memory, but it must not outrank a department/pattern signal
     that is actually present in the newest six terms. Within the same recency
     tier we still prefer the narrowest reliable layer. */
  const reliable = ([data]: typeof candidates[number]) => Boolean(data && data.samples >= 3 && data.confidence >= 42);
  for (const [data, basis] of candidates.filter(reliable)) {
    if (data!.modernSamples >= 1) return { data: data!, basis };
  }
  for (const [data, basis] of candidates.filter(reliable)) {
    if (data!.samples >= 12) return { data: data!, basis };
  }
  return { data: null, basis: "none" };
}

const top = <T>(values: T[]) => {
  const counts = new Map<T, number>();
  values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const total = values.length || 1;
  return ranked[0] ? { value: ranked[0][0], count: ranked[0][1], share: Math.round(ranked[0][1] / total * 100) } : null;
};

function termName(termId: number, terms: AdTerm[]) {
  return terms.find(term => Number(term.AdTermId) === Number(termId))?.AdTermName || String(termId || "—");
}

export function buildCourseLife(courseId: number, history: FSchedule[], terms: AdTerm[], instructors: AdInstructor[]) {
  const rows = history.filter(row => Number(row.AdCourseId) === Number(courseId)).sort((a, b) => Number(a.AdTermId) - Number(b.AdTermId));
  if (!rows.length) return null;
  const termIds = [...new Set(rows.map(row => Number(row.AdTermId)).filter(Boolean))].sort((a, b) => a - b);
  const starts = top(rows.map(row => String(row.fstarttime || "")).filter(Boolean));
  const durations = top(rows.map(row => timeToMinutes(row.fendtime) - timeToMinutes(row.fstarttime)).filter(value => value > 0 && value <= 300));
  const patterns = top(rows.map(patternKeyOf).filter(Boolean));
  const rooms = top(rows.map(row => `${row.AdRoomCode || ""}/${row.AdRoomHall || ""}`).filter(value => value !== "/"));
  const teachers = top(rows.map(row => Number(row.AdInstructorId || 0)).filter(Boolean));
  const placements = top(rows.map(placementKey));
  const sectionsPerTerm = termIds.length ? Math.round(rows.length / termIds.length * 10) / 10 : rows.length;
  return {
    terms: termIds.length,
    observations: rows.length,
    firstTerm: termName(termIds[0], terms),
    latestTerm: termName(termIds[termIds.length - 1], terms),
    usualStart: starts?.value || "",
    usualDuration: durations?.value || 0,
    usualPattern: patterns?.value || "",
    usualRoom: rooms?.value || "",
    usualInstructor: instructors.find(item => Number(item.AdInstructorId) === Number(teachers?.value || 0))?.AdInstructorName || "",
    sectionsPerTerm,
    stability: placements?.share || 0,
    confidence: termIds.length >= 5 && (placements?.share || 0) >= 45 ? "high" : termIds.length >= 2 ? "medium" : "low",
  };
}

export function buildOfferingLife(selected: FSchedule, history: FSchedule[], terms: AdTerm[], instructors: AdInstructor[], versions: ScheduleVersion[] = []) {
  const rows = history.filter(row => Number(row.AdCourseId) === Number(selected.AdCourseId) && String(row.SCode || "") === String(selected.SCode || "")).sort((a, b) => Number(a.AdTermId) - Number(b.AdTermId));
  if (!rows.length) return null;
  const termIds = [...new Set(rows.map(row => Number(row.AdTermId)).filter(Boolean))].sort((a, b) => a - b);
  let transitions = 0;
  let last = "";
  rows.forEach(row => { const key = placementKey(row); if (last && key !== last) transitions += 1; last = key; });
  const starts = top(rows.map(row => row.fstarttime));
  const rooms = top(rows.map(row => `${row.AdRoomCode || ""}/${row.AdRoomHall || ""}`));
  const teachers = top(rows.map(row => Number(row.AdInstructorId || 0)).filter(Boolean));
  const journey = [...versions]
    .filter(version => Array.isArray(version.rows))
    .sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)))
    .map(version => ({ version, row: version.rows.find(row => Number(row.AdCourseId) === Number(selected.AdCourseId) && String(row.SCode || "") === String(selected.SCode || "")) }))
    .filter(item => Boolean(item.row));
  let journeyChanges = 0, journeyLast = "";
  journey.forEach(item => { const key = placementKey(item.row!); if (journeyLast && key !== journeyLast) journeyChanges += 1; journeyLast = key; });
  return {
    terms: termIds.length,
    firstTerm: termName(termIds[0], terms),
    latestTerm: termName(termIds[termIds.length - 1], terms),
    changes: transitions,
    usualStart: starts?.value || "",
    usualRoom: rooms?.value || "",
    usualInstructor: instructors.find(item => Number(item.AdInstructorId) === Number(teachers?.value || 0))?.AdInstructorName || "",
    stability: Math.max(0, 100 - Math.min(100, Math.round(transitions / Math.max(1, rows.length - 1) * 100))),
    currentJourney: journey.length ? {
      snapshots: journey.length,
      changes: journeyChanges,
      firstSeen: journey[0].version.createdAt,
      lastSeen: journey[journey.length - 1].version.createdAt,
    } : null,
  };
}

export function buildDecisionCost(selected: FSchedule, currentRows: FSchedule[], history: FSchedule[]) {
  const active = daysOf(selected);
  const professorLinks = currentRows.filter(row => row.id !== selected.id && row.AdInstructorId === selected.AdInstructorId && active.some(day => Boolean((row as any)[day]))).length;
  const roomLinks = currentRows.filter(row => row.id !== selected.id && row.AdRoomCode === selected.AdRoomCode && row.AdRoomHall === selected.AdRoomHall && active.some(day => Boolean((row as any)[day]))).length;
  const courseLinks = currentRows.filter(row => row.id !== selected.id && row.AdCourseId === selected.AdCourseId).length;
  const historical = history.filter(row => row.AdCourseId === selected.AdCourseId);
  const stable = top(historical.map(placementKey))?.share || 0;
  const score = Math.min(100, professorLinks * 8 + roomLinks * 6 + courseLinks * 3 + Math.round(stable * .35));
  const level = score >= 65 ? "high" : score >= 32 ? "medium" : "low";
  return {
    score,
    level,
    affected: professorLinks + roomLinks + courseLinks,
    factors: [
      professorLinks ? `${professorLinks} ارتباطات للأستاذ` : "",
      roomLinks ? `${roomLinks} حجوزات مرتبطة بالقاعة` : "",
      courseLinks ? `${courseLinks} شعب/مواعيد لنفس المقرر` : "",
      stable >= 60 ? `الموضع تاريخياً ثابت ${stable}٪` : "",
    ].filter(Boolean).slice(0, 3),
  };
}

export function explainWhyHere(selected: FSchedule, courseLife: ReturnType<typeof buildCourseLife>, conflicts: unknown[]) {
  if (Array.isArray(conflicts) && conflicts.length) return "الموضع الحالي يحتاج مراجعة؛ توجد علاقة تعارض ظاهرة حوله.";
  if (!courseLife) return "لا يوجد تاريخ كافٍ لهذا المقرر؛ الموضع الحالي قرار هذا الفصل.";
  const reasons: string[] = [];
  if (courseLife.usualStart === selected.fstarttime) reasons.push("الوقت المعتاد للمقرر");
  if (courseLife.usualRoom === `${selected.AdRoomCode || ""}/${selected.AdRoomHall || ""}`) reasons.push("القاعة المعتادة");
  if (courseLife.usualPattern === patternKeyOf(selected)) reasons.push("نمط الأيام المعتاد");
  if (!reasons.length) return "هذا الموضع مختلف عن النمط التاريخي للمقرر، لكنه لا يملك مانعاً ظاهراً.";
  return `هنا لأنه يطابق ${reasons.slice(0, 2).join(" و")}.`;
}

export function investigateCrowding(rows: FSchedule[], day: DayKey, history: FSchedule[]) {
  const today = rows.filter(row => Boolean((row as any)[day]));
  const currentShare = rows.length ? today.length / rows.length : 0;
  const historyByTerm = new Map<number, FSchedule[]>();
  history.forEach(row => historyByTerm.set(Number(row.AdTermId), [...(historyByTerm.get(Number(row.AdTermId)) || []), row]));
  const historicShares = [...historyByTerm.values()].map(list => list.length ? list.filter(row => Boolean((row as any)[day])).length / list.length : 0).filter(Number.isFinite);
  const historicAverage = historicShares.length ? historicShares.reduce((a,b)=>a+b,0) / historicShares.length : 0;
  const patterns = top(today.map(patternKeyOf).filter(Boolean));
  const roomCount = new Set(today.map(row => `${row.AdRoomCode}/${row.AdRoomHall}`)).size;
  const professorCount = new Set(today.map(row => row.AdInstructorId)).size;
  const concentration = rows.length ? Math.round(currentShare * 100) : 0;
  const inherited = historicAverage ? Math.round(historicAverage * 100) : 0;
  const delta = concentration - inherited;
  const causes = [
    { label: "حصة اليوم من الجدول", value: concentration, max: 100, caption: `${concentration}٪` },
    { label: "المتوسط التاريخي", value: inherited, max: 100, caption: `${inherited}٪` },
    { label: "النمط الأكثر حضوراً", value: patterns?.share || 0, max: 100, caption: `${patterns?.share || 0}٪` },
  ];
  const verdict = delta >= 8
    ? `الازدحام أعلى من تاريخ القسم بنحو ${delta} نقطة؛ ليس مجرد عادة قديمة.`
    : inherited >= 20
      ? "الازدحام متكرر تاريخياً؛ جزء كبير منه نمط متوارث في القسم."
      : "الازدحام يبدو خاصاً بهذا الفصل أكثر من كونه عادة تاريخية.";
  return { current: today.length, currentShare: concentration, historicalShare: inherited, delta, patternShare: patterns?.share || 0, rooms: roomCount, professors: professorCount, verdict, causes };
}

export type UnwrittenRule = { id: string; title: string; detail: string; confidence: number; kind: "start-minute" | "day-light" | "latest-end" | "course-room" };
export function discoverUnwrittenRules(history: FSchedule[], terms: AdTerm[], courses: AdCourse[]): UnwrittenRule[] {
  const allowed = recentTenYearIds(terms);
  const rows = history.filter(row => allowed.has(Number(row.AdTermId || 0)));
  const rules: UnwrittenRule[] = [];
  const model = buildHistoricalTimeModel(rows, terms);
  for (const day of SCHEDULE_DAYS) {
    const data = model.department.days[day.key as DayKey];
    if (data && data.samples >= 30 && data.share >= .82) {
      rules.push({ id:`minute:${day.key}`, kind:"start-minute", confidence:Math.round(data.share*100), title:`${day.label} يبدأ غالباً عند ${data.ladder.find((time:string)=>time.endsWith(`:${String(data.minute).padStart(2,"0")}`)) || data.ladder[0] || `12:${String(data.minute).padStart(2,"0")}`}`, detail:`${data.samples} حالة تاريخية`, });
    }
    const dayRows = rows.filter(row => Boolean((row as any)[day.key]));
    const share = rows.length ? dayRows.length / rows.length : 0;
    if (rows.length >= 100 && share <= .03) rules.push({ id:`light:${day.key}`, kind:"day-light", confidence:Math.round((1-share)*100), title:`${day.label} شبه خالٍ تاريخياً`, detail:`${Math.round(share*100)}٪ فقط من المواعيد`, });
  }
  const ends = rows.map(row=>timeToMinutes(row.fendtime)).filter(v=>v>0).sort((a,b)=>a-b);
  if (ends.length >= 60) {
    const p90 = percentile(ends,.9);
    const within = ends.filter(v=>v<=p90).length/ends.length;
    if (within >= .88) rules.push({ id:"latest-end", kind:"latest-end", confidence:Math.round(within*100), title:`90٪ من اليوم ينتهي قبل ${minutesToTime(p90)}`, detail:`مقروءة من ${ends.length} موعد`, });
  }
  const byCourse = new Map<number,FSchedule[]>(); rows.forEach(row=>byCourse.set(row.AdCourseId,[...(byCourse.get(row.AdCourseId)||[]),row]));
  for (const [courseId,list] of byCourse) {
    if (list.length < 6) continue;
    const room = top(list.map(row=>`${row.AdRoomCode}/${row.AdRoomHall}`).filter(x=>x!=="/"));
    if (room && room.share >= 75) {
      const course = courses.find(c=>Number(c.AdCourseId)===Number(courseId));
      rules.push({ id:`room:${courseId}`, kind:"course-room", confidence:room.share, title:`${course?.CourseCode||course?.CourseName||courseId} يرتبط غالباً بـ ${room.value}`, detail:`${room.share}٪ من الحالات`, });
    }
  }
  return rules.sort((a,b)=>b.confidence-a.confidence).slice(0,8);
}

export function logicalAnomalies(rows: FSchedule[], history: FSchedule[]) {
  const anomalies: Array<{ kind:string; severity:"low"|"medium"|"high"; title:string; detail:string; rowId?:number }> = [];
  const exact = new Map<string,FSchedule[]>();
  rows.forEach(row => {
    const duration = timeToMinutes(row.fendtime) - timeToMinutes(row.fstarttime);
    if (duration <= 0) anomalies.push({ kind:"duration", severity:"high", rowId:row.id, title:"مدة غير منطقية", detail:`${row.AdCourseName} · ${row.fstarttime} → ${row.fendtime}` });
    else if (duration > 300) anomalies.push({ kind:"duration", severity:"medium", rowId:row.id, title:"مدة طويلة جداً", detail:`${row.AdCourseName} · ${duration} دقيقة` });
    const key = `${row.AdCourseId}|${row.SCode}|${patternKeyOf(row)}|${row.fstarttime}|${row.fendtime}`;
    exact.set(key,[...(exact.get(key)||[]),row]);
  });
  exact.forEach(list=>{ if(list.length>1) anomalies.push({kind:"duplicate",severity:"high",rowId:list[0]?.id,title:"سجلان متطابقان تقريباً",detail:`${list[0]?.AdCourseName||"مقرر"} · شعبة ${list[0]?.SCode}`}); });
  const instructorMinutes = new Map<number,number>();
  rows.forEach(row=>{
    const duration=Math.max(0,timeToMinutes(row.fendtime)-timeToMinutes(row.fstarttime));
    instructorMinutes.set(row.AdInstructorId,(instructorMinutes.get(row.AdInstructorId)||0)+duration*Math.max(1,daysOf(row).length));
  });
  instructorMinutes.forEach((minutes,id)=>{if(minutes>24*60)anomalies.push({kind:"load",severity:"medium",title:"حمل أسبوعي غير معتاد",detail:`الأستاذ #${id} · ${Math.round(minutes/60*10)/10} ساعة`});});
  // Compare each course against its own common duration to catch "10:00 → 10:20" style slips.
  const historicalDurations = new Map<number,number[]>();
  history.forEach(row=>{
    const d=timeToMinutes(row.fendtime)-timeToMinutes(row.fstarttime);
    if(d>0&&d<=300)historicalDurations.set(row.AdCourseId,[...(historicalDurations.get(row.AdCourseId)||[]),d]);
  });
  rows.forEach(row=>{
    const list=historicalDurations.get(row.AdCourseId)||[];
    if(list.length<5)return;
    const common=top(list)?.value||0;
    const current=timeToMinutes(row.fendtime)-timeToMinutes(row.fstarttime);
    if(common&&current>0&&Math.abs(current-common)>=25)anomalies.push({kind:"historical-duration",severity:"medium",rowId:row.id,title:"مدة بعيدة عن تاريخ المقرر",detail:`${row.AdCourseName}: ${current}د الآن مقابل ${common}د غالباً`});
  });
  return anomalies.slice(0,40);
}

export function scheduleAccuracyFromVersions(versions: ScheduleVersion[], currentRows: FSchedule[]) {
  const usable = [...versions].filter(v=>Array.isArray(v.rows)&&v.rows.length).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  if (!usable.length) return { available:false, accuracy:null, unchanged:0, changed:0, added:0, removed:0, dimensions:{time:0,room:0,instructor:0,days:0}, postmortem:[] as string[], baseline:"none" as const, baselineAt:"" };
  // Accuracy means "what survived after approval" whenever a publication
  // snapshot exists. Older installations may only have safety/manual versions;
  // those fall back to the earliest stored snapshot and say so explicitly.
  const baselineVersion = usable.find(v => String(v.source || "") === "publish") || usable[0];
  const first = baselineVersion.rows;
  const last = currentRows.length ? currentRows : usable[usable.length-1].rows;
  const a = new Map(first.map(row=>[identityKey(row),row]));
  const b = new Map(last.map(row=>[identityKey(row),row]));
  let unchanged=0,changed=0,added=0,removed=0;
  const dimensions={time:0,room:0,instructor:0,days:0};
  for(const [key,row] of a){
    const now=b.get(key);if(!now){removed++;continue;}
    if(placementKey(row)===placementKey(now)){unchanged++;continue;}
    changed++;
    if(row.fstarttime!==now.fstarttime||row.fendtime!==now.fendtime)dimensions.time++;
    if(row.AdRoomCode!==now.AdRoomCode||row.AdRoomHall!==now.AdRoomHall)dimensions.room++;
    if(row.AdInstructorId!==now.AdInstructorId)dimensions.instructor++;
    if(patternKeyOf(row)!==patternKeyOf(now))dimensions.days++;
  }
  for(const key of b.keys())if(!a.has(key))added++;
  const common=unchanged+changed;
  const accuracy=common?Math.round(unchanged/common*100):100;
  const ranked=Object.entries(dimensions).sort((x,y)=>y[1]-x[1]);
  const labels:Record<string,string>={time:"الوقت",room:"القاعة",instructor:"الأستاذ",days:"الأيام"};
  const postmortem:string[]=[];
  if(changed)postmortem.push(`تغيّر ${changed} موعداً منذ ${baselineVersion.source === "publish" ? "الاعتماد" : "أول نسخة محفوظة"}.`);
  if(ranked[0]?.[1])postmortem.push(`أكثر ما تغيّر: ${labels[ranked[0][0]]} (${ranked[0][1]}).`);
  if(added||removed)postmortem.push(`أضيف ${added} وحُذف ${removed} من هوية الشعب.`);
  if(!postmortem.length)postmortem.push("النسخة بقيت مستقرة بلا تغييرات جوهرية.");
  return {available:true,accuracy,unchanged,changed,added,removed,dimensions,postmortem,baseline:baselineVersion.source === "publish" ? "published" as const : "first-snapshot" as const,baselineAt:baselineVersion.createdAt};
}

export function simulatePolicy(rows: FSchedule[], history: FSchedule[], input: { type:string; day?:DayKey; time?:string; building?:string; growth?:number }) {
  const type=String(input.type||"");
  const affected=(list:FSchedule[])=>list.filter(row=>{
    if(type==="day_off")return Boolean((row as any)[String(input.day||"")]);
    if(type==="close_building")return String(row.AdRoomCode||"").trim().toLowerCase()===String(input.building||"").trim().toLowerCase();
    if(type==="no_classes_after")return timeToMinutes(row.fendtime)>timeToMinutes(String(input.time||"17:00"));
    return false;
  });
  const currentAffected=affected(rows);
  const historicAffected=affected(history);
  const termIds=new Set(history.map(row=>row.AdTermId));
  if(type==="growth"){
    const growth=Math.max(1,Math.min(100,Number(input.growth||10)));
    const projected=Math.ceil(rows.length*growth/100);
    return {type,affected:projected,currentTotal:rows.length,share:Math.round(projected/Math.max(1,rows.length)*100),historicalAffected:0,historicalTotal:history.length,historicalShare:0,terms:termIds.size,summary:`نمو ${growth}٪ يعني تقريباً ${projected} موعد/شعبة إضافية فوق الحمل الحالي قبل حساب السعات الفعلية.`};
  }
  const share=Math.round(currentAffected.length/Math.max(1,rows.length)*100);
  const historicalShare=Math.round(historicAffected.length/Math.max(1,history.length)*100);
  return {type,affected:currentAffected.length,currentTotal:rows.length,share,historicalAffected:historicAffected.length,historicalTotal:history.length,historicalShare,terms:termIds.size,summary:`السياسة تمس ${currentAffected.length} من ${rows.length} موعداً حالياً (${share}٪)، وكانت ستمس ${historicalShare}٪ من التاريخ المتاح.`};
}
