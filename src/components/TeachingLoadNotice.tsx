import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Scale } from "lucide-react";
import { hoursLabel } from "../utils/teachingLoad";

type Over = { id: number; name: string; rank: string; hours: number; allowed: number; extra: number; excess: number };

const num = (value: number) => Number(value || 0).toLocaleString("ar-KW-u-nu-latn", { maximumFractionDigits: 2 });

/**
 * ── تنبيهُ النصاب: شارةٌ صغيرة لا رسالة ──────────────────────────────────────
 *
 * يظهر للمخطّط حين يتجاوز عضوٌ في قسمه نصابَه (الحدّ الأعلى + إضافيّه) في الفصل المفتوح، ولا يظهر شيءٌ غير
 * ذلك: لا نافذة، ولا توست، ولا يُعاد الكلام بعد كل تعديل — الشارةُ نفسُها تتبدّل أرقامُها بهدوء. والتفصيلُ
 * عند الطلب وحده (ضغطةٌ على الشارة). وهو قراءةٌ فقط: لا يمنع حفظ موعدٍ ولا يغيّر شيئاً. مطفأٌ افتراضياً
 * (يفعّله المسؤول من إعدادات الإدارة)، فمن لا يستعمل الميزة لا يرى ولا يدفع ثمن شيء.
 */
export default function TeachingLoadNotice({ collegeId, sectionId, termId, refreshSignal = 0 }: { collegeId: number; sectionId: number; termId: number; refreshSignal?: number }) {
  const [over, setOver] = useState<Over[]>([]);
  const [open, setOpen] = useState(false);
  const holder = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!collegeId || !sectionId || !termId) { setOver([]); return; }
    const controller = new AbortController();
    // تأخيرٌ قصير: تعديلاتٌ متتابعة تُنتج قراءةً واحدة لا قراءةً لكل تعديل.
    const timer = window.setTimeout(() => {
      fetch(`/api/teaching-load/status?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { credentials: "include", cache: "no-store", signal: controller.signal })
        .then(response => (response.ok ? response.json() : null))
        .then(data => setOver(data?.enabled && Array.isArray(data.over) ? data.over : []))
        .catch(() => undefined);
    }, 700);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [collegeId, sectionId, termId, refreshSignal]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const onDown = (event: MouseEvent) => { if (holder.current && !holder.current.contains(event.target as Node)) setOpen(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("mousedown", onDown); };
  }, [open]);

  useEffect(() => { if (!over.length) setOpen(false); }, [over.length]);
  if (!over.length) return null;

  const total = over.reduce((sum, row) => sum + row.excess, 0);
  const label = over.length === 1 ? `${over[0].name} تجاوز نصابه بـ${hoursLabel(over[0].excess)}` : `${over.length.toLocaleString("ar-KW-u-nu-latn")} من الأعضاء تجاوزوا نصابهم`;
  return (
    <div className="tl-notice no-print" ref={holder} data-open={open || undefined}>
      <button type="button" className="tl-notice-chip" aria-expanded={open} aria-controls="teaching-load-detail" data-guide-ignore="شارةُ تنبيه النصاب للمخطّط: تعرض تفصيلاً قراءةً فقط ولا تمنع تعديل الجدول ولا تكتب شيئاً" onClick={() => setOpen(value => !value)} title="تنبيه النصاب التدريسي — للاطّلاع فقط">
        <Scale aria-hidden="true" />
        <span>{label}</span>
        {over.length > 1 ? <b>{hoursLabel(total)}</b> : null}
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div className="tl-notice-pop" id="teaching-load-detail" role="group" aria-label="الأعضاء المتجاوزون نصابهم">
          <ul>
            {over.map(row => (
              <li key={row.id}>
                <span><b>{row.name}</b>{row.rank ? <small>{row.rank}</small> : null}</span>
                <span className="tl-notice-num" dir="ltr">{num(row.hours)} / {num(row.allowed)}</span>
                <em><bdi dir="ltr">+{num(row.excess)}</bdi></em>
              </li>
            ))}
          </ul>
          <p>العبءُ من ساعات المقررات المسجّلة للعضو في الفصل، والمسموح هو الحدّ الأعلى مع الساعات الإضافية. تنبيهٌ فقط: يمكنك متابعة التعديل.</p>
        </div>
      ) : null}
    </div>
  );
}
