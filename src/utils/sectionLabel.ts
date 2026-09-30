/**
 * One rule for naming a department (AdSection) in a picker or list.
 *
 * The same department name exists once per college («قسم تكنولوجيا التعليم»
 * in بنين and in بنات), so a bare name is ambiguous. The short college form is
 * appended only when the name actually repeats in the list being shown.
 */
import type { AdCollege, AdSection } from "../types";

/** «كلية التربية الأساسية - بنات» → «بنات»; a name without a suffix loses «كلية». */
export function collegeShortName(name: unknown): string {
  const text = String(name ?? "").trim();
  const dash = text.split(/\s+[-–—]\s+/);
  if (dash.length > 1) return dash[dash.length - 1].trim();
  return text.replace(/^كلية\s+/, "").trim();
}

type SectionLike = Pick<AdSection, "AdSectionId" | "AdSectionName" | "AdCollegeId">;
type CollegeLike = Pick<AdCollege, "AdCollegeId" | "AdCollegeName">;

/** Map of section id → label, disambiguated by college only where names collide. */
export function sectionLabels(sections: readonly SectionLike[], colleges: readonly CollegeLike[]): Map<number, string> {
  const collegeName = new Map(colleges.map((c) => [Number(c.AdCollegeId), c.AdCollegeName]));
  const seen = new Map<string, Set<number>>();
  for (const s of sections) {
    const name = String(s.AdSectionName || "").trim();
    const set = seen.get(name) || new Set<number>();
    set.add(Number(s.AdCollegeId));
    seen.set(name, set);
  }
  return new Map(sections.map((s) => {
    const name = String(s.AdSectionName || "").trim();
    const college = collegeShortName(collegeName.get(Number(s.AdCollegeId)));
    return [Number(s.AdSectionId), (seen.get(name)?.size || 0) > 1 && college ? `${name} · ${college}` : name];
  }));
}
