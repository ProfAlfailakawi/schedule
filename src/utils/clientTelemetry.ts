import { controlLabel } from "./controlLabel";
type TelemetryScope = { collegeId?: number; sectionId?: number; termId?: number };
type Breadcrumb = { at: string; action: string };
type Pending = {
  kind: "api" | "error" | "offline" | "sync" | "guide";
  name: string;
  durationMs?: number;
  status?: number;
  ok?: boolean;
  message?: string;
  timestamp: string;
  collegeId?: number;
  sectionId?: number;
  termId?: number;
  breadcrumbs?: Breadcrumb[];
};

const STORE = "schedule-client-telemetry-v1";
let ownerId = 0;
let scope: TelemetryScope = {};
let crumbs: Breadcrumb[] = [];
let pending: Pending[] = [];
let installed = false;
let flushTimer: number | null = null;

const now = () => new Date().toISOString();
const storeKey = () => `${STORE}:${ownerId || "anonymous"}`;
const safeRead = (): Pending[] => {
  try {
    const raw = localStorage.getItem(storeKey());
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(-60) : [];
  } catch { return []; }
};
const safeWrite = () => {
  try { localStorage.setItem(storeKey(), JSON.stringify(pending.slice(-60))); } catch {}
};

export function setTelemetryOwner(userId: number) {
  const next = Math.max(0, Number(userId) || 0);
  if (next === ownerId) return;
  // Never upload one person's retained diagnostics under the next session.
  safeWrite();
  ownerId = next;
  pending = safeRead();
  crumbs = [];
  scope = {};
  scheduleFlush();
}
export function setTelemetryScope(next: TelemetryScope) { scope = { ...next }; }
export function telemetryBreadcrumb(action: string) {
  const text = String(action || "").trim().slice(0, 90);
  if (!text) return;
  crumbs = [...crumbs, { at: now(), action: text }].slice(-12);
}

function enqueue(item: Omit<Pending, "timestamp" | "collegeId" | "sectionId" | "termId">) {
  const failed = item.kind === "error" || ((item.kind === "api" || item.kind === "sync") && item.ok === false);
  pending.push({ ...item, ...scope, timestamp: now(), breadcrumbs: failed ? [...crumbs] : undefined });
  pending = pending.slice(-60);
  safeWrite();
  scheduleFlush();
}

export function telemetryApi(name: string, durationMs: number, status: number, ok: boolean) {
  if (ok && durationMs < 1800) return;
  enqueue({ kind: "api", name: String(name).slice(0, 140), durationMs: Math.round(durationMs), status, ok, message: ok ? "slow" : `HTTP ${status}` });
}
/** A few UX milestones are cheap and useful even when they are fast: opening the
 * schedule, intelligence workspace and decision center. They let the health
 * view measure what a person felt, not only an individual HTTP request. */
export function telemetryTiming(name: string, durationMs: number) {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  enqueue({ kind: "api", name: `ui.${String(name).replace(/^ui\./, "").slice(0, 120)}`, durationMs: Math.round(durationMs), status: 200, ok: true, message: "milestone" });
}
export function telemetryError(name: string, error: unknown, durationMs?: number) {
  enqueue({ kind: "error", name: String(name).slice(0, 140), durationMs, ok: false, message: String((error as any)?.message || error || "unknown").slice(0, 320) });
}
export function telemetryOffline(name = "offline") { enqueue({ kind: "offline", name, ok: false }); }
export function telemetrySync(name: string, ok: boolean, message?: string) { enqueue({ kind: "sync", name, ok, message: String(message || "").slice(0, 320) || undefined }); }
export function telemetryGuide(name: string, message?: string) { enqueue({ kind: "guide", name: String(name || "guide").slice(0, 140), ok: true, message: String(message || "").slice(0, 160) || undefined }); }
export function telemetryGuideJourney(input: { featureId: string; version?: number; step?: string; outcome: "attempt" | "started" | "completed" | "failed" | "abandoned" | "helped" | "resolvedAfterHelp" }) {
  const featureId = String(input.featureId || "unknown").replace(/[|\n\r]/g, "").slice(0, 80);
  const version = Math.max(0, Number(input.version || 0) || 0);
  const step = String(input.step || "journey").replace(/[|\n\r]/g, "").slice(0, 48);
  const outcome = String(input.outcome || "attempt").replace(/[|\n\r]/g, "").slice(0, 32);
  enqueue({ kind: "guide", name: `journey|${featureId}|${version}|${step}|${outcome}`, ok: outcome !== "failed" && outcome !== "abandoned" });
}

export async function flushTelemetry() {
  if (!navigator.onLine) return;
  if (!pending.length) pending = safeRead();
  if (!pending.length) return;
  const batch = pending.slice(0, 20);
  try {
    const response = await fetch("/api/telemetry/client", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify({ entries: batch }),
    });
    if (!response.ok) return;
    pending = pending.slice(batch.length);
    safeWrite();
    if (pending.length) scheduleFlush();
  } catch { /* retained locally */ }
}

function scheduleFlush() {
  if (flushTimer != null) return;
  flushTimer = window.setTimeout(() => {
    flushTimer = null;
    void flushTelemetry();
  }, 5000);
}

export function installClientTelemetry() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  pending = safeRead();
  const onError = (event: ErrorEvent) => telemetryError("window.error", event.error || event.message);
  const onReject = (event: PromiseRejectionEvent) => telemetryError("unhandledrejection", event.reason);
  const onOffline = () => { telemetryBreadcrumb("فقد الاتصال"); telemetryOffline("browser.offline"); };
  const onOnline = () => { telemetryBreadcrumb("عاد الاتصال"); telemetrySync("browser.online", true); void flushTelemetry(); };
  // A failure replay needs the few actions immediately before the error, but
  // not field values or page content. Record only the control the person used
  // (accessible label/title, or a short button caption) and never input text.
  const onClick = (event: MouseEvent) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('button,a,[role="button"]') : null;
    if (!target) return;
    const label = controlLabel(target, 56);
    const kind = target.tagName === "A" ? "رابط" : "زر";
    telemetryBreadcrumb(label ? `${kind}: ${label}` : kind);
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onReject);
  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);
  window.addEventListener("click", onClick, { capture: true, passive: true });
  scheduleFlush();
}
