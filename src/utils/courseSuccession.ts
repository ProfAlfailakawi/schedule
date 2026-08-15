import type { AdCourse, StudentNeed } from "../types";
import { AR, countOf } from "./arabicCount";

/**
 * ── الطلبة يتغيّرون كل فصل ──────────────────────────────────────────────────
 *
 * The survey answers one term at a time, and that is correct — the people in
 * the room are not the same people. But it leaves the feature blind at the one
 * moment it matters most: **a new term opens with zero answers**, and that is
 * exactly when the schedule is being built. By the time forty students have
 * answered, the timetable is already written.
 *
 * The way out was already in the store and nobody had looked at it. A civil ID
 * is hashed with no term in the hash, so the same fingerprint appearing in
 * autumn and again in spring is the same person — recognised without anybody
 * knowing, or being able to know, who they are. One answer per person per term
 * is enforced at the write; across terms they line up into a path.
 *
 * A few hundred of those paths are a department's curriculum as students
 * actually walk it: **مَن أخذ «مدخل إلى المناهج» يحتاج «تصميم التدريس» بعده.**
 * Nobody wrote that down. It is not in the catalogue, which says what may be
 * taken, not what is taken next. It comes out of the answers for free.
 *
 * So a term with nothing in it is no longer blind. It inherits a prediction
 * from the term before it — expected demand, and the pairs that will collide —
 * and the department can place the timetable before the first student answers.
 *
 * **What it refuses to say.** A succession supported by fewer than three
 * students is not reported at all. Two people who happen to have walked the
 * same path are a coincidence, and at those numbers a "pattern" starts being a
 * description of one identifiable person's timetable. Everything here is
 * counted; nothing here is anybody.
 *
 * **And it never pretends to be an answer.** A prediction is labelled a
 * prediction wherever it appears. The moment real answers arrive for a term,
 * they replace it — a guess about students is never allowed to outrank the
 * students.
 */

/** Below this a path is an anecdote, and reporting it starts describing a person. */
export const SUCCESSION_FLOOR = 3;

export interface Succession {
  from: number;
  to: number;
  fromName: string;
  toName: string;
  /** Students who took `from` and then needed `to` the following term. */
  students: number;
  /** Of those who took `from` and answered again at all — the base. */
  base: number;
  /** students / base, as a percentage. Always shown with its base. */
  confidence: number;
}

export interface SuccessionReading {
  links: Succession[];
  /** Students followed across two terms or more — the base of everything here. */
  pathsSeen: number;
  /** Term pairs the paths span, so a reader knows how much history this is. */
  termsSpanned: number;
  headline: string;
}

export interface Turnover {
  total: number;
  /** Answered in an earlier term too. */
  returning: number;
  /** Never seen before in this section. */
  fresh: number;
  headline: string;
}

export interface PredictedDemand {
  courseId: number;
  name: string;
  code: string;
  /** Expected students, rounded — never presented as a count of real answers. */
  expected: number;
  /** The strongest path that produced it, for a reader who asks why. */
  because: string;
}

export interface Prediction {
  courses: PredictedDemand[];
  /** Pairs expected to need separating, strongest first. */
  pairs: Array<{ a: number; b: number; nameA: string; nameB: string; expected: number }>;
  /** How many real answers this was projected from. */
  from: number;
  fromTermName: string;
  headline: string;
}

const ordered = (needs: StudentNeed[]) =>
  [...needs].sort((a, b) => Number(a.AdTermId) - Number(b.AdTermId));

/**
 * What follows what, learned from students who answered in more than one term.
 *
 * @param needs  every answer this section has ever collected, all terms
 */
export function readCourseSuccession(needs: StudentNeed[], courses: AdCourse[]): SuccessionReading {
  const byId = new Map(courses.map(course => [course.AdCourseId, course]));
  const paths = new Map<string, StudentNeed[]>();
  for (const need of needs) {
    const list = paths.get(need.fingerprint) || [];
    list.push(need);
    paths.set(need.fingerprint, list);
  }

  const followed = [...paths.values()].filter(list => list.length >= 2);
  if (!followed.length)
    return { links: [], pathsSeen: 0, termsSpanned: 0, headline: "" };

  /* A succession is only ever read between a term and the term that FOLLOWED it
     for that same student — not across a gap of two years, which says nothing
     about sequence. */
  const moves = new Map<string, number>();
  const bases = new Map<number, number>();
  const terms = new Set<number>();

  for (const path of followed) {
    const steps = ordered(path);
    for (let index = 0; index + 1 < steps.length; index += 1) {
      const before = steps[index], after = steps[index + 1];
      terms.add(Number(before.AdTermId));
      terms.add(Number(after.AdTermId));
      const took = [...new Set(before.courseIds)];
      const next = new Set(after.courseIds);
      for (const from of took) {
        bases.set(from, (bases.get(from) || 0) + 1);
        for (const to of next) {
          if (to === from) continue;
          const key = `${from}|${to}`;
          moves.set(key, (moves.get(key) || 0) + 1);
        }
      }
    }
  }

  const links: Succession[] = [...moves.entries()]
    .filter(([, students]) => students >= SUCCESSION_FLOOR)
    .map(([key, students]) => {
      const [from, to] = key.split("|").map(Number);
      const base = bases.get(from) || students;
      return {
        from, to,
        fromName: byId.get(from)?.CourseName || "",
        toName: byId.get(to)?.CourseName || "",
        students, base,
        confidence: Math.round((students / base) * 100),
      };
    })
    .sort((a, b) => b.confidence - a.confidence || b.students - a.students);

  return {
    links, pathsSeen: followed.length, termsSpanned: terms.size,
    headline: links.length
      ? `${countOf(links.length, AR.link)} في تسلسل المقررات — مقروءة من ${countOf(followed.length, AR.student)} ` +
        `تابعناهم عبر ${countOf(terms.size, AR.term)}.`
      : "",
  };
}

/**
 * How much of a term's answer set is new.
 *
 * The department asked the honest question — the students are different every
 * term — and this is the number that answers it.
 */
export function cohortTurnover(all: StudentNeed[], termId: number): Turnover {
  const here = all.filter(need => Number(need.AdTermId) === Number(termId));
  if (!here.length) return { total: 0, returning: 0, fresh: 0, headline: "" };
  const earlier = new Set(
    all.filter(need => Number(need.AdTermId) < Number(termId)).map(need => need.fingerprint),
  );
  const returning = here.filter(need => earlier.has(need.fingerprint)).length;
  const fresh = here.length - returning;
  return {
    total: here.length, returning, fresh,
    /* A counted phrase must not be the subject of a verb here: «٧ طلاب يجيب»
       is wrong, «يجيبون» is wrong for one, and «يجيبان» is wrong for both. A
       label has no agreement to get wrong. */
    headline: returning
      ? `جديد هذا الفصل: ${countOf(fresh, AR.student)} · أجاب في فصل سابق: ${countOf(returning, AR.student)}.`
      : `${countOf(here.length, AR.student)} — كلهم جدد على هذا القسم.`,
  };
}

/**
 * What the coming term will probably need, before anybody has said a word.
 *
 * Built by walking the previous term's real answers forward along the learned
 * successions. Every number is an expectation and is labelled as one.
 */
export function predictDemand(
  succession: SuccessionReading,
  previousTermNeeds: StudentNeed[],
  courses: AdCourse[],
  previousTermName: string,
): Prediction {
  const byId = new Map(courses.map(course => [course.AdCourseId, course]));
  if (!succession.links.length || !previousTermNeeds.length)
    return { courses: [], pairs: [], from: 0, fromTermName: previousTermName, headline: "" };

  const byFrom = new Map<number, Succession[]>();
  for (const link of succession.links) {
    const list = byFrom.get(link.from) || [];
    list.push(link);
    byFrom.set(link.from, list);
  }

  /* Each previous-term student contributes their own expected basket, so the
     pair counts below are per-student and mean the same thing the real ones do:
     "this many people would need both at once". */
  const expected = new Map<number, number>();
  const together = new Map<string, number>();
  const reason = new Map<number, string>();

  for (const need of previousTermNeeds) {
    const basket = new Map<number, number>();
    for (const took of new Set(need.courseIds))
      for (const link of byFrom.get(took) || []) {
        const chance = link.confidence / 100;
        basket.set(link.to, Math.max(basket.get(link.to) || 0, chance));
        if (!reason.has(link.to) || link.confidence > Number(reason.get(link.to)!.split("|")[1]))
          reason.set(link.to, `${link.fromName}|${link.confidence}|${link.students}|${link.base}`);
      }
    // Only what is more likely than not; a coin flip is not a plan.
    const likely = [...basket.entries()].filter(([, chance]) => chance >= 0.5).map(([id]) => id).sort((a, b) => a - b);
    for (const id of likely) expected.set(id, (expected.get(id) || 0) + 1);
    for (let i = 0; i < likely.length; i += 1)
      for (let j = i + 1; j < likely.length; j += 1) {
        const key = `${likely[i]}|${likely[j]}`;
        together.set(key, (together.get(key) || 0) + 1);
      }
  }

  const predicted: PredictedDemand[] = [...expected.entries()]
    .filter(([, count]) => count >= SUCCESSION_FLOOR)
    .map(([courseId, count]) => {
      const parts = (reason.get(courseId) || "").split("|");
      return {
        courseId,
        name: byId.get(courseId)?.CourseName || "",
        code: byId.get(courseId)?.CourseCode || "",
        expected: count,
        because: parts[0]
          ? `${parts[2]} من ${parts[3]} ممن أخذوا «${parts[0]}» احتاجوه بعده`
          : "",
      };
    })
    .sort((a, b) => b.expected - a.expected);

  const pairs = [...together.entries()]
    .filter(([, count]) => count >= SUCCESSION_FLOOR)
    .map(([key, expectedCount]) => {
      const [a, b] = key.split("|").map(Number);
      return {
        a, b,
        nameA: byId.get(a)?.CourseName || "",
        nameB: byId.get(b)?.CourseName || "",
        expected: expectedCount,
      };
    })
    .sort((x, y) => y.expected - x.expected);

  return {
    courses: predicted, pairs, from: previousTermNeeds.length, fromTermName: previousTermName,
    /* Labels again, and for the same reason: «مقرران متوقَّع طلبها» needs طلبهما,
       «زوج واحد يُتوقَّع أن تحتاج» needs يحتاج — a pronoun or a verb tied to the
       count is wrong at some number however it is written. A label is not. */
    headline: predicted.length
      ? `توقُّع لهذا الفصل — لا إجابات فيه بعد · مقررات متوقَّعة: ${countOf(predicted.length, AR.course)}` +
        ` · أزواج يُنصح بالفصل بينها: ${countOf(pairs.length, AR.pair)}. ` +
        `مبنيّ على إجابات «${previousTermName}» وعلى تسلسل المقررات، لا على بيانات تسجيل.`
      : "",
  };
}

/** The predicted pairs in the shape the conflict engine speaks, for planning. */
export function predictedPairs(prediction: Prediction): Set<string> {
  const set = new Set<string>();
  for (const pair of prediction.pairs)
    set.add(`${Math.min(pair.a, pair.b)}|${Math.max(pair.a, pair.b)}`);
  return set;
}
