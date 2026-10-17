/**
 * Groups the server's «ما تغيّر بعد هذه النسخة» lines by course, so the dialog
 * names each course once with its section numbers instead of repeating a line
 * per section. Pure — the dialog body and the tests both read it.
 */
export type OverwriteKind = "added" | "modified" | "removed";
export interface OverwriteCourseGroup {
  course: string;
  /** Section numbers per kind, each in first-seen order. */
  sections: Array<{ kind: OverwriteKind; section: string }>;
  count: number;
}

const VERBS: Array<[string, OverwriteKind]> = [["أُضيف بعدها:", "added"], ["عُدّل بعدها:", "modified"], ["حُذف بعدها:", "removed"]];

export function groupOverwriteChanges(changes: string[]): OverwriteCourseGroup[] {
  const groups = new Map<string, OverwriteCourseGroup>();
  for (const raw of changes) {
    const line = String(raw).trim();
    const verb = VERBS.find(([prefix]) => line.startsWith(prefix));
    const kind: OverwriteKind = verb ? verb[1] : "modified";
    const rest = verb ? line.slice(verb[0].length).trim() : line;
    const match = rest.match(/^(.*?)\s*·\s*شعبة\s*(\S+)\s*$/);
    const course = (match ? match[1] : rest).trim() || "مقرر";
    const section = match ? match[2] : "";
    const group = groups.get(course) || { course, sections: [], count: 0 };
    group.count += 1;
    if (!group.sections.some(item => item.kind === kind && item.section === section)) group.sections.push({ kind, section });
    groups.set(course, group);
  }
  return [...groups.values()];
}
