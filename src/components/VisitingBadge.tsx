import React from "react";

export default function VisitingBadge({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  return <span className={`visiting-badge${compact ? " compact" : ""}${className ? ` ${className}` : ""}`}>منتدب</span>;
}
