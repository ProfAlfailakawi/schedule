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

export function IntelligenceVersionCanvas({ rows, label }: { rows: FSchedule[]; label: string }) {
  return (
    <div className="time-travel-canvas">
      <div className="time-travel-label">{label}</div>
      <div className="time-travel-days">
        {Object.entries(intelligenceDayLabels).map(([key, day]) => (
          <section key={key}>
            <header>{day}</header>
            <div className="time-travel-track">
              {rows
                .filter((row) => Boolean((row as any)[key]))
                .sort((a, b) => intelligenceMinutes(a.fstarttime) - intelligenceMinutes(b.fstarttime))
                .slice(0, 12)
                .map((row) => (
                  <article key={`${key}-${row.id}`}>
                    <time dir="ltr">{row.fstarttime}</time>
                    <strong>{row.AdCourseName || "مقرر"}</strong>
                    <small>{row.SCode} · {row.AdRoomCode}/{row.AdRoomHall}</small>
                  </article>
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
