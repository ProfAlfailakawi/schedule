import type { FSchedule } from "../types";
import { SCHEDULE_DAYS, findConflicts, type DayKey } from "./scheduleIntelligence";

/**
 * ── لماذا لم يعد الموضع السابق ممكناً؟ ──────────────────────────────────────
 *
 * «تشريح القرار» already tells a lecture's life from the department's own
 * publications: born here, moved there, moved again. What it has never been
 * able to say is the one thing a person actually asks —
 *
 *     **ليش انتقل؟**
 *
 * It could see that a clash count went up or down and said so in the abstract:
 * «ظهر تعارض في هذه المرحلة». Which tells the reader that something was wrong
 * somewhere, and leaves them to open the board of a date months past and find
 * it themselves.
 *
 * The archive can answer it exactly, and the method is almost embarrassingly
 * direct: take the placement the lecture was moved AWAY from, put it back into
 * the week as it stood the day it moved, and run the same conflict sweep
 * everybody already trusts. Whatever it hits is what had taken that slot — and
 * the row it hits carries a course name, a section code and a department.
 *
 *     «القاعة G12/17 كانت مشغولة بـ‹الإدارة المدرسية› شعبة ٣١٢»
 *
 * That is not an interpretation of the record. It is the record, replayed.
 *
 * **What it will not do.** It returns nothing when the old placement was clean —
 * a move can be a preference, a request, a decision nobody wrote down, and this
 * has no business inventing a cause for it. Silence is the correct output for
 * "the archive does not say", and every caller is expected to print it as
 * silence rather than as an absence of problems.
 */

export interface MoveReason {
  /** One sentence, ready to print. */
  text: string;
  /** The appointment that had taken the old slot, named where it can be. */
  against?: string;
  kind: "room" | "instructor" | "doorway" | "other";
}

const DAY_KEYS = SCHEDULE_DAYS.map(day => day.key as DayKey);

export interface OldPlacement {
  day: DayKey | null;
  start: string;
  end: string;
  roomCode: string;
  roomHall: string;
  instructorId: number;
}

/**
 * @param row       the appointment, for its identity — course, section, term
 * @param before    where it used to sit
 * @param week      the term exactly as it stood in the version that moved it
 * @param nameOf    instructor id → name, for a sentence that names a person
 * @param doorway   the department's own turnaround, so a tight gap counts
 */
export function reasonForMove(
  row: FSchedule,
  before: OldPlacement,
  week: FSchedule[],
  nameOf: (id: number) => string,
  doorway = 0,
): MoveReason | null {
  if (!before.day || !before.start || !before.end) return null;

  const asItWas: any = { ...row };
  for (const key of DAY_KEYS) asItWas[key] = false;
  asItWas[before.day] = true;
  asItWas.fstarttime = before.start;
  asItWas.fendtime = before.end;
  asItWas.AdRoomCode = before.roomCode;
  asItWas.AdRoomHall = before.roomHall;
  asItWas.AdInstructorId = before.instructorId;

  const others = week.filter(item => Number(item.id) !== Number(row.id));
  const hits = findConflicts([asItWas as FSchedule], [...others, asItWas as FSchedule], { doorwayMinutes: doorway });
  if (!hits.length) return null;

  /* A hall taken is the plainest explanation and the one a reader can verify at
     a glance, so it leads when a move has more than one cause. */
  const rank = (type: string) => (type === "room" ? 0 : type === "instructor" ? 1 : type === "doorway" ? 2 : 3);
  const hit = [...hits].sort((a, b) => rank(a.type) - rank(b.type))[0];
  const other = others.find(item => Number(item.id) === Number(hit.otherId));
  const naming = other
    ? `${other.AdCourseName || "موعد آخر"}${other.SCode ? ` · شعبة ${other.SCode}` : ""}`
    : "";

  const room = `${before.roomCode || ""}${before.roomHall ? `/${before.roomHall}` : ""}`;
  const teacher = nameOf(before.instructorId);

  if (hit.type === "room" || hit.reasons?.includes("room"))
    return {
      kind: "room",
      against: naming || undefined,
      text: naming
        ? `القاعة ${room} كانت مشغولة بـ«${naming}» في نفس الوقت.`
        : `القاعة ${room} كانت مشغولة في نفس الوقت.`,
    };

  if (hit.type === "instructor" || hit.reasons?.includes("instructor"))
    return {
      kind: "instructor",
      against: naming || undefined,
      text: naming
        ? `${teacher || "الأستاذ"} كان مرتبطاً بـ«${naming}» في نفس الوقت.`
        : `${teacher || "الأستاذ"} كان مرتبطاً بموعد آخر في نفس الوقت.`,
    };

  if (hit.type === "doorway" || hit.reasons?.includes("doorway"))
    return {
      kind: "doorway",
      against: naming || undefined,
      text: naming
        ? `لم تبقَ فترة كافية بين هذا الموعد و«${naming}» في القاعة ${room}.`
        : `لم تبقَ فترة التبديل المعتادة في القاعة ${room}.`,
    };

  return {
    kind: "other",
    against: naming || undefined,
    text: naming
      ? `الموضع السابق صار متعارضاً مع «${naming}».`
      : "الموضع السابق صار متعارضاً مع موعد آخر.",
  };
}
