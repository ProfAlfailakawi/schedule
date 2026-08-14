/**
 * Campus-aware travel defaults.
 *
 * Two things live here:
 *  1. The default walking time between two *unconfigured* buildings inside one
 *     campus (kept in one place so the UI, the API and the conflict engine agree).
 *  2. The far heavier travel time between the college's remote campuses. In this
 *     data set الجهراء (Jahra) and الفحيحيل (Fahaheel) are their own college rows,
 *     physically far from the main campus and from each other, so an instructor
 *     shared across them needs real commuting minutes — not a walk between halls.
 *
 * Campuses are recognised from the college name so no schema changes are needed:
 * an administrator adds "- الجهراء" to a college and the rule applies itself.
 */

export type Campus = "jahra" | "fahaheel" | "main";

/** Default minutes between two buildings on the same campus when no pair is set. */
export const DEFAULT_TRAVEL_MINUTES = 5;

/** Minutes assumed for movement inside the very same building. */
export const SAME_BUILDING_MINUTES = 3;

/** Reads the campus a college belongs to from its (Arabic) name. */
export function campusOf(collegeName: unknown): Campus {
  const name = String(collegeName ?? "");
  if (name.includes("الجهراء")) return "jahra";
  if (name.includes("الفحيحيل")) return "fahaheel";
  return "main";
}

/**
 * Travel minutes between two campuses, or `null` when they are the same campus
 * (the caller should then fall back to the per-building matrix).
 *
 * Rules requested by the schedule owners:
 *   • الفحيحيل ↔ الجهراء … 60 minutes (the two farthest campuses)
 *   • الجهراء ↔ any other campus … 30 minutes
 *   • الفحيحيل ↔ any other campus … 30 minutes
 */
export function interCampusMinutes(a: Campus, b: Campus): number | null {
  if (a === b) return null;
  const remote = new Set<Campus>();
  if (a !== "main") remote.add(a);
  if (b !== "main") remote.add(b);
  if (remote.has("jahra") && remote.has("fahaheel")) return 60;
  return 30;
}

/** Convenience: campus travel straight from two college names. */
export function interCampusMinutesByName(a: unknown, b: unknown): number | null {
  return interCampusMinutes(campusOf(a), campusOf(b));
}
