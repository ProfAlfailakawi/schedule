/*
 * Instructor-request visuals: the totals funnel, a request's own relay, and
 * its event trail (request.timeline — recorded by the server, now shown).
 * Display only; nothing here reads or writes beyond the props it is given.
 */
import React, { useState, type ReactElement } from "react";
import {
  BadgeCheck, CheckCheck, CircleX, Eye, History, Inbox, Link2, MessageSquare, Replace, Send, ShieldCheck, Wrench,
} from "lucide-react";
import type { InstructorRequest, InstructorRequestEvent, InstructorRequestEventKind } from "../../types";
import { DnaStepper, DnaTimeline, type DnaStep, type DnaTone } from "./index";

const n = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn");

export interface RequestTotals {
  sent: number; answered: number; unchanged: number;
  changed: number; unopened: number; settled: number;
}

/** أُرسل ← فُتح ← أجاب ← انتهى, each with its count; the old three figures stay as pills. */
export function RequestTotalsFunnel({ totals, children }: { totals: RequestTotals | null; children?: React.ReactNode }) {
  const sent = Number(totals?.sent || 0);
  const opened = Math.max(0, sent - Number(totals?.unopened || 0));
  const answered = Number(totals?.answered || 0);
  const settled = Number(totals?.settled || 0);
  const counts = [sent, opened, answered, settled];
  const firstOpen = counts.findIndex(value => value < sent);
  const state = (i: number): DnaStep["state"] =>
    sent > 0 && counts[i] >= sent ? "done" : i === firstOpen ? "current" : "pending";
  const steps: DnaStep[] = [
    { key: "sent", label: "أُرسل", icon: <Send />, state: state(0), badge: n(sent), title: `أُرسل إلى ${n(sent)}` },
    { key: "opened", label: "فُتح", icon: <Eye />, state: state(1), badge: n(opened), title: `فتح الرابط ${n(opened)} من ${n(sent)}` },
    { key: "answered", label: "أجاب", icon: <Inbox />, state: state(2), badge: n(answered), title: `أجاب ${n(answered)} من ${n(sent)}` },
    { key: "settled", label: "انتهى", icon: <CheckCheck />, state: state(3), badge: n(settled), title: `انتهى ${n(settled)}` },
  ];
  return (
    <div className="request-funnel">
      <DnaStepper size="sm" steps={steps} ariaLabel={`أجاب ${n(answered)} من ${n(sent)}`} />
      {children}
    </div>
  );
}

/** One request's relay: link sent → opened → submitted → review → settled. */
export function RequestStatusStepper({ row }: { row: Pick<InstructorRequest, "status" | "linkOpenedAt"> }) {
  const submitted = row.status !== "sent";
  const opened = Boolean(row.linkOpenedAt) || submitted;
  const settled = row.status === "settled";
  const steps: DnaStep[] = [
    { key: "sent", label: "أُرسل الرابط", state: "done" },
    { key: "opened", label: "فُتح الرابط", state: opened ? "done" : "current" },
    { key: "submitted", label: "أرسل الأستاذ", state: submitted ? "done" : opened ? "current" : "pending" },
    { key: "review", label: "قيد المراجعة", state: settled ? "done" : submitted ? "current" : "pending" },
    { key: "settled", label: "انتهى", state: settled ? "done" : "pending" },
  ];
  const now = steps.find(step => step.state === "current") || steps[steps.length - 1];
  return <DnaStepper size="xs" steps={steps} ariaLabel={`مسار الطلب — ${String(now.label)}`} />;
}

const EVENT: Record<InstructorRequestEventKind, { title: string; icon: ReactElement; tone: DnaTone }> = {
  "link-created": { title: "أُنشئ الرابط", icon: <Link2 />, tone: "neutral" },
  "link-opened": { title: "فُتح الرابط", icon: <Eye />, tone: "sky" },
  "submitted": { title: "أرسل الأستاذ طلبه", icon: <Send />, tone: "accent" },
  "received": { title: "استلمه القسم", icon: <Inbox />, tone: "indigo" },
  "item-fixed": { title: "ثُبّت", icon: <Wrench />, tone: "mint" },
  "item-rejected": { title: "رُفض", icon: <CircleX />, tone: "coral" },
  "alternative-offered": { title: "عُرض بديل", icon: <Replace />, tone: "amber" },
  "alternative-chosen": { title: "اختار بديلاً", icon: <BadgeCheck />, tone: "lilac" },
  "settled": { title: "انتهى الطلب", icon: <CheckCheck />, tone: "accent" },
  "schedule-approved": { title: "اعتُمد الجدول", icon: <ShieldCheck />, tone: "mint" },
  "department-replied": { title: "ردّ القسم واقترح", icon: <MessageSquare />, tone: "amber" },
  "instructor-replied": { title: "ردّ الأستاذ", icon: <MessageSquare />, tone: "sky" },
  "proposal-accepted": { title: "وافق الأستاذ على المقترح", icon: <BadgeCheck />, tone: "mint" },
  "study-proposal-sent": { title: "أُرسل مقترح دراسي", icon: <Send />, tone: "indigo" },
  "study-proposal-approved": { title: "وافق الأستاذ على المقترح الدراسي", icon: <BadgeCheck />, tone: "mint" },
  "study-proposal-changes": { title: "طلب الأستاذ تعديل المقترح", icon: <Replace />, tone: "amber" },
  "study-proposal-revised": { title: "أُرسلت نسخةٌ معدّلة من المقترح", icon: <Send />, tone: "indigo" },
  "study-proposal-withdrawn": { title: "سُحب المقترح الدراسي", icon: <CircleX />, tone: "neutral" },
  "study-proposal-committed": { title: "ثُبّت المقترح الدراسي", icon: <CheckCheck />, tone: "mint" },
  "study-proposal-expired": { title: "انتهت صلاحية المقترح", icon: <CircleX />, tone: "coral" },
};

const eventDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ar-KW-u-nu-latn", { month: "long", day: "numeric" });
};

/** The request's trail, folded behind one quiet icon button. */
export function RequestTimelineToggle({ timeline, itemLabel, detailText }: {
  timeline?: InstructorRequest["timeline"];
  /** What an event's item is called on this screen (its course), by index. */
  itemLabel?: (index: number) => string | undefined;
  /** The host's own words for an event's detail (reason label, counts). */
  detailText?: (event: InstructorRequestEvent) => string | undefined;
}) {
  const [open, setOpen] = useState(false);
  const events = timeline || [];
  if (!events.length) return null;
  return (
    <div className="request-trail">
      <button
        type="button"
        className="dna-ibtn request-trail-btn"
        aria-expanded={open}
        aria-label={open ? "إخفاء سجلّ الطلب" : "سجلّ الطلب"}
        title={open ? "إخفاء سجلّ الطلب" : "سجلّ الطلب"}
        data-guide-ignore="طيُّ سجلّ أحداث الطلب وفتحه — عرضٌ لا فعل"
        onClick={() => setOpen(value => !value)}
      >
        <History aria-hidden="true" />
      </button>
      {open ? (
        <DnaTimeline
          className="request-trail-line"
          ariaLabel="سجلّ الطلب"
          maxHeight={260}
          wrapMeta
          items={events.map((event, i) => {
            const spec = EVENT[event.kind] || { title: event.kind, icon: <History />, tone: "neutral" as DnaTone };
            return {
              key: `${event.kind}:${event.at}:${i}`,
              title: spec.title + (typeof event.itemIndex === "number"
                ? (itemLabel?.(event.itemIndex) ? ` — ${itemLabel(event.itemIndex)}` : ` بند ${n(event.itemIndex + 1)}`)
                : ""),
              icon: spec.icon,
              tone: spec.tone,
              date: eventDate(event.at),
              meta: [event.by, detailText ? detailText(event) : event.detail].filter(Boolean).join(" — ") || undefined,
            };
          })}
        />
      ) : null}
    </div>
  );
}
