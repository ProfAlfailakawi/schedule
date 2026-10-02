import React, { useEffect, useRef, useState } from "react";
import { SCHEDULE_DAY_END_TIME, SCHEDULE_DAY_START_TIME } from "../utils/scheduleTime";

/**
 * ── حقلُ الوقت بأرقامٍ إنجليزية ──────────────────────────────────────────────
 *
 * `<input type="time">` يرسمه المتصفحُ بأرقام الجهاز وبـ«ص/م»: على هاتفٍ عربيٍّ
 * يُكتب الوقتُ بأرقامٍ هندية، وفي الصفحة نفسها أرقامُ الجدول إنجليزية. هذا حقلٌ
 * نصيٌّ بالقيمة نفسها «HH:MM» (وهي ما يحفظه النظام)، يقبل ما تكتبه اللوحةُ العربية
 * ويحوّله: 930 ← 09:30، ويرفض ما خارج الدوام.
 *
 * يسدّ مكان <input type="time"> بلا تغييرٍ في موضع الاستعمال: القيمةُ نصٌّ
 * «HH:MM»، وonChange يتلقى كائناً فيه target.value، ولا يُستدعى إلا والقيمةُ
 * كاملةٌ سليمة (أو فارغةٌ حين يمسحها صاحبُها).
 */
const LATIN = (value: string) => value
  .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
  .replace(/\D/g, "");

export function normalizeClock(raw: string, min = SCHEDULE_DAY_START_TIME, max = SCHEDULE_DAY_END_TIME): string {
  let digits = LATIN(raw);
  if (digits.length === 3) digits = `0${digits}`;
  if (digits.length !== 4) return "";
  const hour = Number(digits.slice(0, 2)), minute = Number(digits.slice(2));
  if (hour > 23 || minute > 59) return "";
  const clock = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  return clock < min || clock > max ? "" : clock;
}

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "min" | "max" | "step"> & {
  value: string;
  min?: string;
  max?: string;
  step?: number;
  onChange: (event: { target: { value: string } }) => void;
};

export function TimeField({ value, onChange, min = SCHEDULE_DAY_START_TIME, max = SCHEDULE_DAY_END_TIME, step: _step, className, onBlur, ...rest }: Props) {
  const [text, setText] = useState(value || "");
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) { setText(value || ""); setBad(false); } }, [value]);

  const handle = (raw: string) => {
    let digits = LATIN(raw).slice(0, 4);
    if (digits.length === 1 && Number(digits) > 2) digits = `0${digits}`;
    const shown = digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits;
    setText(shown);
    if (!digits) { setBad(false); onChange({ target: { value: "" } }); return; }
    if (digits.length < 4) { setBad(false); return; }
    const clock = normalizeClock(digits, min, max);
    setBad(!clock);
    if (clock) onChange({ target: { value: clock } });
  };

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      dir="ltr"
      maxLength={5}
      autoComplete="off"
      placeholder={rest.placeholder || "--:--"}
      className={["time-field", className].filter(Boolean).join(" ")}
      value={text}
      aria-invalid={bad || rest["aria-invalid"] || undefined}
      onFocus={e => { focused.current = true; rest.onFocus?.(e); }}
      onBlur={e => { focused.current = false; setText(value || ""); setBad(false); onBlur?.(e); }}
      onChange={e => handle(e.target.value)}
    />
  );
}

export default TimeField;
