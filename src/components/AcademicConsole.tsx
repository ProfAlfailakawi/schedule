import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { BookOpen, Building2, GraduationCap, Landmark, UsersRound } from "lucide-react";
import { ConsoleRail } from "./ui";

/**
 * One console for the whole academic reference.
 *
 * The five catalogues (terms, colleges, sections, instructors, courses) used to
 * be five sidebar entries and five separate pages, even though they are edited
 * in the same sitting by the same person. They are now one destination with a
 * tab rail that doubles as a census: each tab carries its own count, so the
 * rail answers "how much is in here?" before anything is opened.
 *
 * Routing is unchanged — every tab is still its own URL, so deep links,
 * bookmarks and the browser's back button behave exactly as before.
 */

/**
 * The catalogue, drawn as light while its chunk arrives.
 *
 * A spinner says «wait»; a skeleton says «this is what is coming». Every one of
 * the five catalogues opens in the same master-detail shape — a searchable list
 * on one side, the selected record on the other — so the placeholder can be that
 * exact shape and the real screen simply resolves into it. Inert: no data, no
 * interaction, no state.
 */
function CatalogSkeleton() {
  return (
    <div className="catalog-skeleton" role="status" aria-busy="true">
      <span className="sr-only">يجري تحميل السجل الأكاديمي</span>
      {/* Master first, exactly as the real workspace orders it: the searchable
          list holds the 34% column, the open record takes the rest. */}
      <div className="csk-list">
        <span className="csk-line csk-search" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="csk-row" key={i} style={{ ["--i" as any]: i }}>
            <span className="csk-line" style={{ width: `${64 - (i % 3) * 11}%` }} />
            <span className="csk-line csk-dim" style={{ width: `${40 + (i % 4) * 7}%` }} />
          </div>
        ))}
      </div>
      <div className="csk-detail">
        <span className="csk-mark" />
        <span className="csk-line csk-kicker" />
        <span className="csk-line csk-title" />
        <span className="csk-line csk-sub" />
        <div className="csk-grid">
          {Array.from({ length: 5 }).map((_, i) => (
            <span className="csk-box" key={i} style={{ ["--i" as any]: i }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function safeLazy<T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().catch((err) => {
      console.warn("Lazy chunk import failed in AcademicConsole:", err);
      const key = "miras_console_chunk_reload";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
      }
      throw err;
    })
  );
}

const Terms = safeLazy(() => import("./Terms"));
const Colleges = safeLazy(() => import("./Colleges"));
const Sections = safeLazy(() => import("./Sections"));
const Instructors = safeLazy(() => import("./Instructors"));
const Courses = safeLazy(() => import("./Courses"));

export type AcademicTab = "terms" | "colleges" | "sections" | "instructors" | "courses";

interface TabSpec {
  value: AcademicTab;
  label: string;
  icon: React.ReactNode;
  endpoint: string;
  /** Permission id that unlocks this catalogue. */
  perm: number;
}

const TABS: TabSpec[] = [
  { value: "terms", label: "الفصول", icon: <GraduationCap />, endpoint: "/api/terms", perm: 5 },
  { value: "colleges", label: "الكليات", icon: <Landmark />, endpoint: "/api/colleges", perm: 2 },
  { value: "sections", label: "الأقسام", icon: <Building2 />, endpoint: "/api/sections", perm: 4 },
  { value: "instructors", label: "الأساتذة", icon: <UsersRound />, endpoint: "/api/instructors", perm: 3 },
  { value: "courses", label: "المقررات", icon: <BookOpen />, endpoint: "/api/courses", perm: 6 },
];

const arabicNumber = (value: number) => value.toLocaleString("ar-KW-u-nu-latn");

export default function AcademicConsole({
  tab,
  onTab,
  hasPerm,
}: {
  tab: AcademicTab;
  onTab: (tab: AcademicTab) => void;
  hasPerm: (id: number) => boolean;
}) {
  const visible = useMemo(() => TABS.filter(spec => hasPerm(spec.perm)), [hasPerm]);
  const [counts, setCounts] = useState<Partial<Record<AcademicTab, number>>>({});

  // The counts are a nicety, never a blocker: the rail renders immediately and
  // each number fades in as its catalogue answers. Reads are already cached by
  // the fetch layer, so re-entering the console costs nothing.
  useEffect(() => {
    let alive = true;
    visible.forEach(spec => {
      fetch(spec.endpoint)
        .then(response => (response.ok ? response.json() : null))
        .then(data => {
          if (!alive || !Array.isArray(data)) return;
          setCounts(prev => (prev[spec.value] === data.length ? prev : { ...prev, [spec.value]: data.length }));
        })
        .catch(() => undefined);
    });
    return () => {
      alive = false;
    };
  }, [visible]);

  const active = visible.some(spec => spec.value === tab) ? tab : visible[0]?.value;
  // The open catalogue lends its one creation action to the console header, so
  // the page keeps a single header line instead of a stray button underneath.
  const [actionSlot, setActionSlot] = useState<HTMLElement | null>(null);

  return (
    <div className="content-stack academic-console">
      <h1 className="sr-only">البيانات الأكاديمية</h1>
      <div className="console-head">
        <ConsoleRail
          label="البيانات الأكاديمية"
          value={active || ""}
          onChange={next => onTab(next as AcademicTab)}
          options={visible.map(spec => ({
            value: spec.value,
            label: spec.label,
            icon: spec.icon,
            count: counts[spec.value] ?? null,
          }))}
        />
        <div className="console-action-slot no-print" ref={setActionSlot} />
      </div>
      <Suspense fallback={<CatalogSkeleton />}>
        {active === "terms" ? <Terms embedded actionSlot={actionSlot} /> : null}
        {active === "colleges" ? <Colleges embedded actionSlot={actionSlot} /> : null}
        {active === "sections" ? <Sections embedded actionSlot={actionSlot} /> : null}
        {active === "instructors" ? <Instructors embedded actionSlot={actionSlot} /> : null}
        {active === "courses" ? <Courses embedded actionSlot={actionSlot} /> : null}
      </Suspense>
    </div>
  );
}
