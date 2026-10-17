/**
 * ── مواسم الجمهور: متى يكون الطالب في أي حال ──────────────────────────────────────
 *
 * الشركةُ تختار موسمَ منتجها (كتبٌ عند بدء الفصل، مراجعةٌ في النهاية، تقنيةٌ عند التسجيل…).
 * المواسم تُشتقّ كلُّها مما يعرفه النظام أصلاً، لا من تخمين:
 *
 *   التسجيل          من مراحل الطلبة (utils/termStudentPhases): الرغبات، التجميد، جولات التسجيل،
 *                    وما بينها حتى إغلاق الطلبات.
 *   بدء الفصل        أول ٣ أسابيع من نافذة الفصل الجاري (termWindow).
 *   منتصف الفصل      ما بين البدء والنهاية.
 *   نهاية الفصل      آخر ٣ أسابيع من نافذة الفصل (الاختبارات والتسليم).
 *   بين الفصول       لا فصلَ جارٍ الآن.
 *
 * قد يتزامن أكثر من موسمٍ (التسجيل للفصل القادم يجري في نهاية الجاري)، فالنتيجة قائمة.
 * حدُّ الأسابيع الثلاثة اصطلاحٌ للعرض لا لائحة، ويُعرض كما هو للشركات.
 */
import type { AdTerm } from "../types";
import { kuwaitDateISO } from "./approvalWorkflow";
import { readStudentPhase, hasStudentPhases } from "./termStudentPhases";
import { currentTermId, termWindow } from "./termSequence";

export const SEASONS = [
  { id: "registration", label: "التسجيل", hint: "الرغبات وتجميد الجدول وجولات التسجيل حتى إغلاق الطلبات" },
  { id: "start", label: "بدء الفصل", hint: "أول ٣ أسابيع من الفصل" },
  { id: "middle", label: "منتصف الفصل", hint: "بين بدء الفصل ونهايته" },
  { id: "finals", label: "نهاية الفصل", hint: "آخر ٣ أسابيع: المراجعة والاختبارات والتسليم" },
  { id: "break", label: "بين الفصول", hint: "لا فصل جارٍ" },
] as const;
export type SeasonId = typeof SEASONS[number]["id"];

export const SEASON_IDS: readonly string[] = SEASONS.map(s => s.id);
export const seasonLabel = (id: string): string => SEASONS.find(s => s.id === id)?.label || id;

const DAY_MS = 86_400_000;
const EDGE_WEEKS = 3;
const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** المواسم الفاعلة الآن. */
export function activeSeasons(terms: readonly AdTerm[], now: number = Date.now(), today: string = kuwaitDateISO(new Date(now))): SeasonId[] {
  const out = new Set<SeasonId>();
  for (const term of terms) {
    if (hasStudentPhases(term.AdTermStudentPhases)) {
      const key = readStudentPhase(term.AdTermStudentPhases, today).key;
      if (key === "wishes" || key === "frozen" || key === "round" || key === "between") out.add("registration");
    }
  }
  const current = terms.find(term => Number(term.AdTermId) === currentTermId(terms as any, now));
  const win = termWindow(current);
  if (win && now >= win.from && now < win.to) {
    const edge = EDGE_WEEKS * 7 * DAY_MS;
    if (now - win.from < edge) out.add("start");
    else if (win.to - now <= edge) out.add("finals");
    else out.add("middle");
  } else {
    out.add("break");
  }
  return SEASONS.map(s => s.id).filter(id => out.has(id));
}

export interface CalendarItem { season: SeasonId; label: string; term: string; from: string; to: string; now: boolean }

/** تقويمُ المواسم القادمة والجارية للعرض (للإدارة وفي ملف الشراكة). مرتّبٌ بالتاريخ، بلا ما انقضى. */
export function seasonCalendar(terms: readonly AdTerm[], now: number = Date.now(), today: string = kuwaitDateISO(new Date(now))): CalendarItem[] {
  const items: CalendarItem[] = [];
  const push = (season: SeasonId, term: AdTerm, from: string, to: string) => {
    if (!from || !to || to < today) return;
    items.push({ season, label: seasonLabel(season), term: term.AdTermName, from, to, now: from <= today && today <= to });
  };
  for (const term of terms) {
    if (term.AdTermClosed === true && !termWindow(term)) continue;
    const win = termWindow(term);
    if (win) {
      const edge = EDGE_WEEKS * 7 * DAY_MS;
      const last = dayOf(win.to - DAY_MS);
      const from = dayOf(win.from);
      const startEnd = dayOf(Math.min(win.from + edge - DAY_MS, win.to - DAY_MS));
      const finalsFrom = dayOf(Math.max(win.from + edge, win.to - edge));
      push("start", term, from, startEnd);
      if (finalsFrom > startEnd) {
        const midFrom = dayOf(win.from + edge);
        const midTo = dayOf(Date.parse(`${finalsFrom}T00:00:00Z`) - DAY_MS);
        if (midTo >= midFrom) push("middle", term, midFrom, midTo);
      }
      push("finals", term, finalsFrom, last);
    }
    const p = term.AdTermStudentPhases;
    if (hasStudentPhases(p)) {
      const dates = [p?.wishesOpen, p?.wishesClose, ...(p?.rounds || []).flatMap(r => [r.start, r.end]), p?.requestsClose].filter((d): d is string => Boolean(d)).sort();
      if (dates.length) push("registration", term, dates[0], dates[dates.length - 1]);
    }
  }
  return items.sort((a, b) => a.from.localeCompare(b.from) || a.season.localeCompare(b.season));
}

/** نصّ المواسم المستهدَفة للعرض: «كل المواسم» إن فرغت. */
export const seasonsText = (ids: readonly string[] | undefined): string =>
  !ids || !ids.length ? "كل المواسم" : ids.map(seasonLabel).join("، ");
