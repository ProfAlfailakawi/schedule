import React, { useState } from "react";
import { CalendarPlus, CalendarX, ChevronDown, Pencil } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { groupOverwriteChanges, type OverwriteKind } from "../utils/scopeOverwriteGroups";

const KIND_ICON = { added: CalendarPlus, modified: Pencil, removed: CalendarX } as const;
const KIND_LABEL: Record<OverwriteKind, string> = { added: "أُضيفت", modified: "عُدّلت", removed: "حُذفت" };
const SHOWN = 4;

/** Body of the «تغيّر الجدول بعد هذه النسخة» dialog: big count, one row per course. */
export function ScopeOverwriteBody({ changes }: { changes: string[] }) {
  const [all, setAll] = useState(false);
  const groups = groupOverwriteChanges(changes);
  const shown = all ? groups : groups.slice(0, SHOWN);
  const hidden = groups.length - shown.length;
  return (
    <div className="so-body">
      <div className="so-count" aria-label={`ستُمحى ${countOf(changes.length, AR.change)}`}>
        <b>{changes.length}</b>
        <span><Pencil aria-hidden="true" /> تغييراً ستُمحى</span>
      </div>
      <ul className="so-courses">
        {shown.map(group => (
          <li key={group.course} className="so-course">
            <strong>{group.course}</strong>
            <span className="so-chips">
              {group.sections.map(item => {
                const Icon = KIND_ICON[item.kind];
                return (
                  <span className="so-chip" data-kind={item.kind} key={`${item.kind}:${item.section}`} title={KIND_LABEL[item.kind]}>
                    <Icon aria-hidden="true" />{item.section ? <bdi>{item.section}</bdi> : null}
                  </span>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 ? (
        <button type="button" className="so-more" data-guide-ignore="توسيع قائمة المقررات داخل حوار التأكيد" onClick={() => setAll(true)}>
          +{hidden} أخرى <ChevronDown aria-hidden="true" />
        </button>
      ) : null}
      <p className="so-warn">ستُمحى إن تابعت · لم يُكتب شيء بعد</p>
    </div>
  );
}
