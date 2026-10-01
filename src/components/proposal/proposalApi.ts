/**
 * واجهة المقترح الدراسي من جهة القسم: نداءاتٌ رقيقةٌ فوق /api/study-proposals.
 * لا منطقَ هنا: الخادمُ هو الحَكَم، وهذه تُترجم الأخطاء إلى رسائل تُقرأ.
 */
import type {
  AdCourse, StudyProposal, StudyProposalDayKey, StudyProposalMetrics, StudyProposalOp, StudyProposalResponseMode,
} from "../../types";
import type { CourseHistory, DecisionState, GridItem, ProposalEvaluation } from "../../utils/studyProposal";

export class ProposalApiError extends Error {
  status: number;
  code?: string;
  body: any;
  constructor(message: string, status: number, body: any) {
    super(message);
    this.status = status;
    this.code = body?.code;
    this.body = body;
  }
  get isRevisionConflict() { return this.status === 409 && this.body?.conflict === "revision"; }
}

async function call<T>(url: string, init?: RequestInit & { signal?: AbortSignal }): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { credentials: "same-origin", ...init }); }
  catch (error) {
    if ((error as any)?.name === "AbortError") throw error;
    throw new ProposalApiError("تعذّر الاتصال بالخادم. تحقّق من الشبكة ثم أعد المحاولة.", 0, { code: "offline" });
  }
  const raw = await response.text();
  let body: any = {};
  if (raw) {
    try { body = JSON.parse(raw); }
    catch { throw new ProposalApiError(response.ok ? "وصل ردٌّ غير متوقّع من الخادم." : `الخادم مشغول الآن (${response.status}).`, response.status, {}); }
  }
  if (!response.ok) throw new ProposalApiError(String(body.error || "تعذّر تنفيذ العملية"), response.status, body);
  return body as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

export interface ContextCourse {
  id: number; code: string; name: string; hours: number; collegeId: number; collegeName: string; sectionId: number;
}
export interface FacultyEntry {
  snapshot: NonNullable<StudyProposalOp["source"]>;
  item: GridItem;
}
export interface StaffProposalView {
  proposal: StudyProposal;
  status: StudyProposal["status"];
  statusLabel: string;
  decision: DecisionState;
  gate: { open: boolean; reason?: string };
  commitReadiness: { ok: boolean; opIds: string[]; partial: boolean; code?: string; message?: string };
  alreadySent?: boolean;
  alreadyCommitted?: boolean;
  committed?: boolean;
  evaluation?: ProposalEvaluation;
}
export interface ProposalContext {
  request: {
    id: string; linkId: string; status: string; collegeId: number; sectionId: number;
    items: Array<{ index: number; action: string; courseName: string; sectionCode: string; decision: string }>;
  };
  instructor: { id: number; name: string; mobile?: string; loadCap: number | null; retired: boolean };
  term: { id: number; name: string; closed: boolean };
  scope: { collegeId: number; collegeName: string; sectionId: number; sectionName: string };
  courses: ContextCourse[];
  usedCodes: Record<string, number[]>;
  faculty: FacultyEntry[];
  current: { items: GridItem[]; metrics: StudyProposalMetrics };
  hasPlaceholder: boolean;
  proposals: StaffProposalView[];
  proposal: StaffProposalView | null;
  serverNow: string;
}
export interface AlternativeSuggestion {
  days: StudyProposalDayKey[]; start: string; end: string; reasons: string[]; blockers: number; reviews: number; gapDelta: number;
}

export const proposalApi = {
  context: (requestId: string, proposalId?: string, signal?: AbortSignal) =>
    call<ProposalContext>(`/api/study-proposals/context?requestId=${encodeURIComponent(requestId)}${proposalId ? `&proposalId=${encodeURIComponent(proposalId)}` : ""}`, { signal }),
  courseHistory: (q: { courseId: number; collegeId: number; sectionId: number; termId: number }, signal?: AbortSignal) =>
    call<CourseHistory>(`/api/study-proposals/course-history?courseId=${q.courseId}&collegeId=${q.collegeId}&sectionId=${q.sectionId}&termId=${q.termId}`, { signal }),
  list: (collegeId: number, sectionId: number, termId: number, signal?: AbortSignal) =>
    call<{ proposals: StaffProposalView[] }>(`/api/study-proposals?collegeId=${collegeId}&sectionId=${sectionId}&termId=${termId}`, { signal }),
  evaluate: (body: { requestId: string; proposalId?: string; ops: StudyProposalOp[] }, signal?: AbortSignal) =>
    call<{ evaluation: ProposalEvaluation }>("/api/study-proposals/evaluate", { ...json(body), signal }),
  alternatives: (body: { requestId: string; proposalId?: string; ops: StudyProposalOp[]; opId: string }, signal?: AbortSignal) =>
    call<{ suggestions: AlternativeSuggestion[]; note?: string }>("/api/study-proposals/alternatives", { ...json(body), signal }),
  create: (body: Record<string, unknown>) => call<StaffProposalView>("/api/study-proposals", json(body)),
  save: (id: string, body: Record<string, unknown>) =>
    call<StaffProposalView>(`/api/study-proposals/${encodeURIComponent(id)}`, { ...json(body), method: "PUT" }),
  send: (id: string, body: { rev: number; message: string; expiryDays: number }) =>
    call<StaffProposalView>(`/api/study-proposals/${encodeURIComponent(id)}/send`, json(body)),
  withdraw: (id: string, rev: number) =>
    call<StaffProposalView>(`/api/study-proposals/${encodeURIComponent(id)}/withdraw`, json({ rev })),
  commit: (id: string, rev: number, confirm: boolean) =>
    call<any>(`/api/study-proposals/${encodeURIComponent(id)}/commit`, json({ rev, confirm })),
};

export type { AdCourse, StudyProposalResponseMode };
