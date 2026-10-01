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

/**
 * ── القسم واحد في كلياته — «عائلة القسم» ────────────────────────────────────
 *
 * «قسم تكنولوجيا التعليم» في بنين وفي بنات قسمٌ واحد له سجلّان (AdSection لكل
 * كلية). وما يملكه القسم لا الكلية — منتدبوه أوّلاً — يُقرأ للعائلة كلها:
 * الأقسامُ التي يتطابق اسمُها بعد التطبيع (arabicMatchKey، وبلا «قسم» في أوله).
 * هذا هو الموضع الوحيد لقاعدة العائلة.
 */
import { arabicMatchKey } from "./arabicText";

export function departmentFamilyKey(name: unknown): string {
  return arabicMatchKey(name).replace(/^قسم\s+/, "").trim();
}

type FamilySection = Pick<AdSection, "AdSectionId" | "AdCollegeId" | "AdSectionName">;

/** أعضاء عائلة القسم المفتوح، وهو أوّلهم. قسمٌ مجهول عائلتُه نفسُه وحده. */
export function departmentFamily(sections: readonly FamilySection[], collegeId: number, sectionId: number): Array<{ collegeId: number; sectionId: number }> {
  const self = { collegeId: Number(collegeId), sectionId: Number(sectionId) };
  const target = sections.find(s => Number(s.AdSectionId) === self.sectionId);
  const key = target ? departmentFamilyKey(target.AdSectionName) : "";
  if (!key) return [self];
  const others = sections
    .filter(s => Number(s.AdSectionId) !== self.sectionId && departmentFamilyKey(s.AdSectionName) === key)
    .map(s => ({ collegeId: Number(s.AdCollegeId), sectionId: Number(s.AdSectionId) }));
  return [self, ...others];
}

/** مفتاح العائلة لأي (كلية، قسم) — لمن يجمع صفوفاً من أقسامٍ كثيرة دفعةً واحدة. */
export function departmentFamilyResolver(sections: readonly FamilySection[]): (collegeId: number, sectionId: number) => string {
  const byId = new Map(sections.map(s => [Number(s.AdSectionId), s]));
  return (collegeId, sectionId) => {
    const key = departmentFamilyKey(byId.get(Number(sectionId))?.AdSectionName);
    return key ? `family:${key}` : `${Number(collegeId)}:${Number(sectionId)}`;
  };
}
