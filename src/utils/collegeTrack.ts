/**
 * ── المسار (بنات / بنين) ومواقع البنات ────────────────────────────────────────
 *
 * قرارُ المالك: القسمُ نفسه موجودٌ في أكثر من كلية، لكن **للبنات صحيفةٌ واحدة** في التربية الأساسية بنات
 * والجهراء والفحيحيل، وللبنين صحيفتُهم (قد تطابق وقد تختلف). فلا يُعرض للقسم إلا مساران: بنات وبنين؛
 * وما يثبت للبنات يُنسخ كما هو إلى الجهراء والفحيحيل.
 *
 * اسمُ الكلية هو القرينة (لا جدولَ آخر): «… - بنين» بنين، «… - بنات» (وبنات - الجهراء/الفحيحيل) بنات،
 * وغيرُ ذلك (كلية العلوم…) لا مسارَ له فيبقى قسمُه وحدَه بلا دمجٍ ولا نسخ.
 */
export type Track = "girls" | "boys" | "";
export const TRACK_LABEL: Record<Exclude<Track, "">, string> = { girls: "بنات", boys: "بنين" };

export const trackOf = (collegeName: string): Track => /بنين/.test(collegeName) ? "boys" : /بنات/.test(collegeName) ? "girls" : "";
/** موقعُ البنات الفرعي (الجهراء/الفحيحيل): يُنسخ إليه ولا يُعرض وحده. */
export const isCampusCollege = (collegeName: string): boolean => trackOf(collegeName) === "girls" && /الجهراء|الفحيحيل/.test(collegeName);

/** عائلةُ الكلية: اسمُها بلا المسار ولا الحرم («كلية التمريض - بنات» ← «كلية التمريض»). لكل عائلةٍ صحيفتُها المستقلة للقسم نفسه. */
export const familyOf = (collegeName: string): string => String(collegeName || "").replace(/\s*-\s*(بنات|بنين).*$/, "").replace(/\s+/g, " ").trim() || String(collegeName || "").trim();
const shortFamily = (family: string) => family.replace(/^كلية\s+/, "");

export interface SectionLike { AdSectionId: number; AdCollegeId: number; AdSectionName: string }
export interface CollegeLike { AdCollegeId: number; AdCollegeName: string }
export interface DeptTrack {
  /** مفتاحٌ ثابت للمسار: `اسم القسم|المسار`. */
  key: string;
  deptName: string;
  track: Track;
  /** القسمُ الأصل الذي يُعتمد وتُقرأ منه الصحيفة. */
  canonical: SectionLike;
  /** مواقعُ البنات الفرعية التي تُنسخ إليها الصحيفةُ نفسها. */
  mirrors: SectionLike[];
  collegeName: string;
  /** عائلة الكلية (التربية الأساسية، التمريض…). */
  family: string;
}

const norm = (value: string) => String(value || "").replace(/\s+/g, " ").trim();

/** يجمع أقسامَ الكليات في مساراتٍ: بناتُ القسم الواحد (بمواقعهنّ) مساراً واحداً، وكلُّ قسمٍ آخر وحدَه. */
export function groupDeptTracks(sections: readonly SectionLike[], colleges: readonly CollegeLike[]): DeptTrack[] {
  const collegeName = new Map(colleges.map(row => [Number(row.AdCollegeId), String(row.AdCollegeName || "")]));
  const out: DeptTrack[] = [];
  const girls = new Map<string, SectionLike[]>();
  for (const section of [...sections].sort((a, b) => Number(a.AdSectionId) - Number(b.AdSectionId))) {
    const college = collegeName.get(Number(section.AdCollegeId)) || "";
    const track = trackOf(college);
    if (track === "girls") {
      /* بناتُ القسم يجتمعن داخل عائلة الكلية الواحدة فقط: صحيفةُ التمريض غير صحيفة التربية الأساسية. */
      const name = `${familyOf(college)}|${norm(section.AdSectionName)}`;
      girls.set(name, [...(girls.get(name) || []), section]);
    } else {
      out.push({ key: `${familyOf(college)}|${norm(section.AdSectionName)}|${track || section.AdSectionId}`, deptName: norm(section.AdSectionName), track, canonical: section, mirrors: [], collegeName: college, family: familyOf(college) });
    }
  }
  for (const [, list] of girls) {
    const main = list.find(section => !isCampusCollege(collegeName.get(Number(section.AdCollegeId)) || "")) || list[0];
    const mainCollege = collegeName.get(Number(main.AdCollegeId)) || "";
    out.push({ key: `${familyOf(mainCollege)}|${norm(main.AdSectionName)}|girls`, deptName: norm(main.AdSectionName), track: "girls", canonical: main, mirrors: list.filter(section => section !== main), collegeName: mainCollege, family: familyOf(mainCollege) });
  }
  return out.sort((a, b) => a.deptName.localeCompare(b.deptName, "ar") || a.family.localeCompare(b.family, "ar") || a.track.localeCompare(b.track));
}

/**
 * اسمُ العرض: «قسم X — بنات»، وتُضاف الكلية («— التمريض —») حين يوجد القسمُ نفسه في أكثر من عائلة كلياتٍ
 * (مثل الدراسات الإسلامية في التربية الأساسية والتمريض والعلوم الصحية…) ليتميّز عن صحيفته المستقلة هناك.
 */
export function trackLabels(tracks: readonly DeptTrack[]): Map<string, string> {
  const families = new Map<string, Set<string>>();
  for (const track of tracks) families.set(track.deptName, new Set([...(families.get(track.deptName) || []), track.family]));
  const out = new Map<string, string>();
  for (const track of tracks) {
    const base = /^قسم\s/.test(track.deptName) ? track.deptName : `قسم ${track.deptName}`;
    out.set(track.key, [base, (families.get(track.deptName)?.size || 0) > 1 ? shortFamily(track.family) : "", track.track ? TRACK_LABEL[track.track] : ""].filter(Boolean).join(" — "));
  }
  return out;
}

/** مفتاحُ مطابقة صحيفتين في كليتين: السنةُ إن وُجدت («صحيفة 2026» ≈ «BA-0115 2026/2027»)، وإلا الاسمُ نفسه («الصحيفة السابقة»). */
export const planMatchKey = (planName: string): string => {
  const name = norm(planName);
  return name.match(/(?:19|20)\d{2}/)?.[0] || name;
};
