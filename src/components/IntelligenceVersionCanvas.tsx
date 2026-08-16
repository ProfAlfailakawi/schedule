import React from "react";
import type { FSchedule } from "../types";

export const intelligenceDayLabels: Record<string, string> = {
  fsunday: "الأحد",
  fmonday: "الاثنين",
  ftuesday: "الثلاثاء",
  fwednesday: "الأربعاء",
  fthursday: "الخميس",
};

export const intelligenceMinutes = (value: string) => {
  const [hour, minute] = String(value || "0:0").split(":").map(Number);
  return (hour || 0) * 60 + (minute || 0);
};

export function IntelligenceVersionCanvas({
  rows,
  label,
  isAfter,
}: {
  rows: FSchedule[];
  label: string;
  isAfter?: boolean;
}) {
  return (
    <div className={`time-travel-canvas ${isAfter ? "canvas-after" : "canvas-before"}`}>
      <div className="time-travel-label">{label}</div>
      <div className="time-travel-days">
        {Object.entries(intelligenceDayLabels).map(([key, day]) => {
          const dayRows = rows
            .filter((row) => Boolean((row as any)[key]))
            .sort((a, b) => intelligenceMinutes(a.fstarttime) - intelligenceMinutes(b.fstarttime));
          return (
            <section key={key}>
              <header>
                <span>{day}</span>
                <small>{dayRows.length}</small>
              </header>
              <div className="time-travel-track">
                {dayRows.length ? (
                  dayRows.map((row) => (
                    <article key={`${key}-${row.id}`} className="time-travel-card">
                      <time dir="ltr">{row.fstarttime}–{row.fendtime || ""}</time>
                      <strong>{row.AdCourseName || "مقرر"}</strong>
                      <small>{row.SCode} · {row.AdRoomCode ? `قاعة ${row.AdRoomCode}/${row.AdRoomHall}` : "بلا قاعة"}</small>
                      {(row as any).AdInstructorName ? <span>{(row as any).AdInstructorName}</span> : null}
                    </article>
                  ))
                ) : (
                  <div className="time-travel-empty-day">لا توجد محاضرات</div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

const versionRowSignature = (row: FSchedule) => [
  row.AdCourseId,
  row.SCode,
  row.AdInstructorId,
  Object.keys(intelligenceDayLabels).filter(key => Boolean((row as any)[key])).join(","),
  row.fstarttime,
  row.fendtime,
  row.AdRoomCode,
  row.AdRoomHall,
].join("|");

const versionRowWhen = (row?: FSchedule) => {
  if (!row) return "—";
  const days = Object.entries(intelligenceDayLabels)
    .filter(([key]) => Boolean((row as any)[key]))
    .map(([, label]) => label)
    .join(" · ") || "بلا يوم";
  return `${days} · ${row.fstarttime || "—"}–${row.fendtime || "—"}`;
};
const versionRowRoom = (row?: FSchedule) => row
  ? [row.AdRoomCode, row.AdRoomHall].filter(Boolean).join("/") || "بلا قاعة"
  : "—";

/**
 * The visual wipe answers “what did the week look like?”. This table answers
 * the second question that immediately follows it: “which rows actually
 * changed?”. It is deliberately under the wipe, never inside it, so it cannot
 * disappear behind clip-path or horizontal overflow.
 */
export function IntelligenceVersionDiffTable({ comparison }: { comparison: any }) {
  const fromRows: FSchedule[] = Array.isArray(comparison?.from?.rows) ? comparison.from.rows : [];
  const toRows: FSchedule[] = Array.isArray(comparison?.to?.rows) ? comparison.to.rows : [];
  const from = new Map(fromRows.map(row => [Number(row.id), row]));
  const to = new Map(toRows.map(row => [Number(row.id), row]));
  const ids = [...new Set([...from.keys(), ...to.keys()])];
  const changed = ids.map(id => {
    const before = from.get(id), after = to.get(id);
    const state = !before ? "added" : !after ? "removed" : versionRowSignature(before) !== versionRowSignature(after) ? "changed" : "same";
    return { id, before, after, state };
  }).filter(item => item.state !== "same");

  return (
    <section className="version-detail-table" aria-label="تفاصيل الفروق بين النسختين">
      <header>
        <div>
          <span>التفاصيل الفعلية</span>
          <strong>ما الذي تغيّر صفاً بصف</strong>
        </div>
        <b>{changed.length.toLocaleString("ar-KW-u-nu-latn")}</b>
      </header>
      {changed.length ? (
        <div className="version-detail-scroll">
          <table>
            <thead>
              <tr>
                <th>الحالة</th>
                <th>المقرر</th>
                <th>الشعبة</th>
                <th>قبل</th>
                <th>بعد</th>
                <th>القاعة</th>
              </tr>
            </thead>
            <tbody>
              {changed.map(item => {
                const row = item.after || item.before!;
                return (
                  <tr key={item.id}>
                    <td><span className={`version-state ${item.state}`}>{item.state === "added" ? "أضيف" : item.state === "removed" ? "أزيل" : "تغيّر"}</span></td>
                    <td><strong>{row.AdCourseName || "مقرر"}</strong></td>
                    <td dir="ltr">{row.SCode || "—"}</td>
                    <td>{versionRowWhen(item.before)}<small dir="ltr">{versionRowRoom(item.before)}</small></td>
                    <td>{versionRowWhen(item.after)}<small dir="ltr">{versionRowRoom(item.after)}</small></td>
                    <td dir="ltr">{item.before && item.after && versionRowRoom(item.before) !== versionRowRoom(item.after) ? `${versionRowRoom(item.before)} ← ${versionRowRoom(item.after)}` : versionRowRoom(item.after || item.before)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p>لا يوجد اختلاف صفّي بين النسختين المختارتين.</p>
      )}
    </section>
  );
}
