import React from "react";
import { DoorOpen } from "lucide-react";

export default function CourseRoomTypeBadge({ type, compact = false }: { type?: string | null; compact?: boolean }) {
  const value = String(type || "").trim();
  if (!value) return null;
  return <small className={`course-room-type-badge${compact ? " is-compact" : ""}`} title={`نوع القاعة المناسب: ${value}`}><DoorOpen aria-hidden="true"/>{value}</small>;
}
