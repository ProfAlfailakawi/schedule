import React from "react";

type SignatureSize = "micro" | "mini" | "compact" | "hero";

export default function ScheduleSignature({
  size = "compact",
  showTagline = true,
  markOnly = false,
  className = "",
}: {
  size?: SignatureSize;
  showTagline?: boolean;
  markOnly?: boolean;
  className?: string;
}) {
  return (
    <span className={`schedule-signature schedule-signature-${size} ${markOnly ? "schedule-signature-mark-only" : ""} ${className}`.trim()}>
      <span className="schedule-signature-seal" aria-hidden="true">
        <span>S</span>
        <i />
      </span>
      {!markOnly ? (
        <span className="schedule-signature-copy">
          <strong dir="ltr">SCHEDULE</strong>
          {showTagline ? <small>أكثر من عقد من العمل الأكاديمي</small> : null}
        </span>
      ) : null}
    </span>
  );
}
