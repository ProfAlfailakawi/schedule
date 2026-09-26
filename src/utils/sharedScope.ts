/**
 * ── النطاق الواحد: الكلية والقسم والفصل تتبع صاحبها من شاشةٍ إلى شاشة ──────
 *
 * «لما أختار كلية التربية الأساسية — قسم الإسلامية — الفصل الأول، ثم أنتقل إلى
 * أيّ أيقونةٍ أخرى، تظلّ على نفس الكلية والقسم والفصل إلا إذا بدّلته.»
 *
 * كانت كلّ شاشةٍ تحفظ نطاقها بمفتاحها: الجدول في تفضيلاته، والاستعلامات في
 * تفضيلاتها وتفضيلات الجدول معاً، ومركز الذكاء يكتب في تفضيلات الجدول، وتغييرات
 * الجدول وكشف التسجيل وطلبات الأساتذة لا تحفظ شيئاً فتفتح كل مرّة على الفصل
 * الجاري وأوّل كلية. قاعدةٌ واحدة مكتوبة بخمس صيغ — فانجرفت.
 *
 * هذا الملف هو الموضع الوحيد الذي يُحفظ فيه النطاق ويُقرأ:
 *   - لكل حسابٍ مفتاحه (schedule-scope-<userId>) عبر safeStorage، فجهازٌ مشترك
 *     لا يفتح حساباً على نطاق حسابٍ آخر، والتخزين الممنوع لا يُسقط الشاشة.
 *   - في الذاكرة مع اشتراك/إخطار، فالشاشتان المركّبتان معاً تبقيان متّفقتين.
 *   - وحدث `storage` يُبلغ الألسنة الأخرى في المتصفّح نفسه.
 *
 * القاعدة في القراءة (resolveSharedScope): المخزون يُعرض على نطاق القارئ قبل أن
 * يُستعمل — كليةٌ أو قسمٌ خارج نطاقه يُعاد بالدوال القائمة (coerceScopeValues،
 * singleDepartmentOf)، والفصل الذي لم يعد موجوداً يرجع إلى افتراض الشاشة.
 *
 * والقاعدة في الكتابة: لا يُكتب إلا ما اختاره القارئ بيده (منتقٍ، أو هدفٌ صريح
 * كإشعارٍ أو سجلٍّ حُفظ في نطاقٍ آخر). افتراضُ شاشةٍ — «أوّل كلية»، «الفصل
 * الجاري» — يبقى في تلك الشاشة ولا يمحو ما اختاره في غيرها.
 */
import { useCallback, useEffect, useRef } from "react";
import { safeStorage } from "./safeStorage";
import { coerceScopeValues, singleDepartmentOf, type ScopeAssignmentLike } from "./scopeContext";

export interface SharedScope {
  collegeId: number;
  /** صفر = «كل الأقسام» — اختيارٌ مشروع في الشاشات التي تعرضه. */
  sectionId: number;
  termId: number;
}

export const EMPTY_SHARED_SCOPE: SharedScope = Object.freeze({ collegeId: 0, sectionId: 0, termId: 0 }) as SharedScope;

/** بادئة المفتاح — لا تُكتب في أيّ ملفٍّ آخر (يحرسها tests/shared-scope-audit.ts). */
export const SHARED_SCOPE_PREFIX = "schedule-scope-";
/** المفتاح القديم الذي كان الجدول والاستعلامات ومركز الذكاء يتقاسمونه: يُقرأ مرّةً للترحيل. */
const LEGACY_WORKSPACE_PREFIX = "schedule-workspace-prefs-";

export const sharedScopeKey = (userId: number | string) => `${SHARED_SCOPE_PREFIX}${Number(userId) || 0}`;

const whole = (value: unknown) => {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
};

function clean(raw: any): SharedScope {
  const collegeId = whole(raw?.collegeId);
  return {
    collegeId,
    /* قسمٌ بلا كلية لا معنى له في أيّ منتقٍ من منتقيات البرنامج. */
    sectionId: collegeId ? whole(raw?.sectionId) : 0,
    termId: whole(raw?.termId),
  };
}

const same = (a: SharedScope, b: SharedScope) =>
  a.collegeId === b.collegeId && a.sectionId === b.sectionId && a.termId === b.termId;

/* ── الحساب الحاضر ─────────────────────────────────────────────────────── */

let activeUserId = 0;

/** يضبطه App حين يُعرف صاحب الجلسة — قبل أن تُرسم أيّ شاشة. */
export function setSharedScopeUser(userId: number | string): void {
  activeUserId = Number(userId) || 0;
}

export function sharedScopeUser(): number {
  return activeUserId;
}

/* ── الذاكرة والمخزن ───────────────────────────────────────────────────── */

const cache = new Map<number, SharedScope>();

type Listener = (scope: SharedScope, source: string) => void;
const listeners = new Set<{ userId: number; fn: Listener }>();

function notify(userId: number, scope: SharedScope, source: string) {
  for (const entry of [...listeners]) {
    if (entry.userId !== userId) continue;
    try { entry.fn(scope, source); } catch { /* مستمعٌ معطوب لا يوقف البقية */ }
  }
}

function load(userId: number): SharedScope {
  const stored = safeStorage.json<any>(sharedScopeKey(userId), null);
  if (stored && typeof stored === "object") return clean(stored);
  /* ترحيلٌ لمرّةٍ واحدة: آخر نطاقٍ اختاره في الجدول أو الاستعلامات قبل هذا الملف. */
  const legacy = safeStorage.json<any>(`${LEGACY_WORKSPACE_PREFIX}${userId}`, null);
  if (legacy && typeof legacy === "object") {
    return clean({ collegeId: legacy.filterCollege, sectionId: legacy.filterSection, termId: legacy.filterTerm });
  }
  return { ...EMPTY_SHARED_SCOPE };
}

/** النطاق المحفوظ كما هو، بلا عرضٍ على نطاق القارئ — استعمل resolveSharedScope قبل العرض. */
export function readSharedScope(userId: number = activeUserId): SharedScope {
  const id = Number(userId) || 0;
  if (!id) return { ...EMPTY_SHARED_SCOPE };
  let scope = cache.get(id);
  if (!scope) { scope = load(id); cache.set(id, scope); }
  return { ...scope };
}

export interface WriteOptions {
  userId?: number;
  /** من كتب — المستمع لا يُخطَر بما كتبه هو. */
  source?: string;
}

/**
 * يكتب ما اختاره القارئ. تغيُّر الكلية بلا قسمٍ في الرقعة يعني «كل الأقسام»:
 * قسم الكلية السابقة لا يصحّ في الجديدة.
 */
export function writeSharedScope(patch: Partial<SharedScope>, options: WriteOptions = {}): SharedScope {
  const id = Number(options.userId ?? activeUserId) || 0;
  const current = readSharedScope(id);
  if (!id) return current;
  const merged: SharedScope = { ...current };
  if (patch.collegeId !== undefined) {
    merged.collegeId = whole(patch.collegeId);
    if (patch.sectionId === undefined && merged.collegeId !== current.collegeId) merged.sectionId = 0;
  }
  if (patch.sectionId !== undefined) merged.sectionId = whole(patch.sectionId);
  if (patch.termId !== undefined) merged.termId = whole(patch.termId);
  const next = clean(merged);
  if (same(next, current)) return current;
  cache.set(id, next);
  safeStorage.set(sharedScopeKey(id), JSON.stringify({ ...next, at: Date.now() }));
  notify(id, next, options.source || "");
  return { ...next };
}

/** يُخطِر بكل تغيّرٍ لنطاق هذا الحساب — من شاشةٍ أخرى أو لسانٍ آخر. */
export function subscribeSharedScope(fn: Listener, userId: number = activeUserId): () => void {
  installStorageListener();
  const entry = { userId: Number(userId) || 0, fn };
  listeners.add(entry);
  return () => { listeners.delete(entry); };
}

let storageListening = false;
/** لسانٌ آخر غيّر النطاق: تُقرأ نسخته ويُخطَر من في هذا اللسان. */
export function handleSharedScopeStorageEvent(key: string | null): void {
  if (!key || !key.startsWith(SHARED_SCOPE_PREFIX)) return;
  const id = Number(key.slice(SHARED_SCOPE_PREFIX.length)) || 0;
  if (!id) return;
  const before = cache.get(id);
  cache.delete(id);
  const next = readSharedScope(id);
  if (!before || !same(before, next)) notify(id, next, "storage");
}

function installStorageListener() {
  if (storageListening || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
  storageListening = true;
  try { window.addEventListener("storage", (event) => handleSharedScopeStorageEvent(event.key)); } catch { /* لا ألسنة أخرى */ }
}

/** للاختبار وحده. */
export function resetSharedScopeMemory(): void {
  cache.clear();
  listeners.clear();
  activeUserId = 0;
}

/* ── القراءة على نطاق القارئ ───────────────────────────────────────────── */

export interface ScopeReader {
  scopes?: ScopeAssignmentLike[];
  isAdmin?: boolean;
  /** الكتالوج لمن له الكلّ: كليةٌ أو قسمٌ لم يعد فيه يسقط. يُتجاوز حين لا يُعطى. */
  colleges?: Array<{ AdCollegeId: number | string }>;
  sections?: Array<{ AdSectionId: number | string; AdCollegeId: number | string }>;
  /** الفصول الموجودة: فصلٌ محفوظٌ ليس فيها يرجع إلى fallbackTermId. يُتجاوز حين لا تُعطى. */
  terms?: Array<{ AdTermId: number | string }>;
  /** افتراض الشاشة (الفصل الجاري، فصل التخطيط، الأحدث…) — لا يُكتب في المخزن. */
  fallbackTermId?: number;
}

/**
 * يعرض النطاق المحفوظ على من يقرؤه. لا يُظهر ما ليس في نطاقه أبداً:
 *   - الإدارة: الكلية والقسم كما حُفظا ما داما في الكتالوج، والقسم في كليته.
 *   - غيرها: coerceScopeValues، ثم القسم الوحيد (singleDepartmentOf) يُختار له.
 *     وصفرُ القسم («كل الأقسام») يبقى صفراً لمن في كليته أكثر من قسم.
 *   - الفصل: إن لم يعد موجوداً فافتراض الشاشة.
 */
export function resolveSharedScope(stored: Partial<SharedScope> | null | undefined, reader: ScopeReader = {}): SharedScope {
  let { collegeId, sectionId, termId } = clean(stored || {});
  if (reader.isAdmin) {
    if (collegeId && reader.colleges?.length && !reader.colleges.some(row => Number(row.AdCollegeId) === collegeId)) collegeId = 0;
    if (!collegeId) sectionId = 0;
    if (sectionId && reader.sections?.length) {
      const section = reader.sections.find(row => Number(row.AdSectionId) === sectionId);
      if (!section || Number(section.AdCollegeId) !== collegeId) sectionId = 0;
    }
  } else {
    const scopes = reader.scopes || [];
    const coerced = coerceScopeValues(scopes, collegeId, sectionId, false);
    collegeId = coerced.collegeId;
    sectionId = coerced.sectionId;
    const only = singleDepartmentOf(scopes, collegeId, false);
    if (only) sectionId = only;
  }
  if (Array.isArray(reader.terms) && reader.terms.length) {
    if (!reader.terms.some(row => Number(row.AdTermId) === termId)) termId = whole(reader.fallbackTermId);
  } else if (!termId) {
    termId = whole(reader.fallbackTermId);
  }
  return { collegeId, sectionId, termId };
}

/* ── الخطّاف ───────────────────────────────────────────────────────────── */

let sourceSerial = 0;

/**
 * لكل شاشة: `pick` حين يغيّر القارئ منتقياً، و`onExternal` تُنادى حين يتغيّر
 * النطاق من غيرها (شاشةٌ مركّبة معها، لسانٌ آخر، إشعار). القراءة الأولى
 * بـ readSharedScope() ثم resolveSharedScope().
 */
export function useSharedScope(onExternal?: (scope: SharedScope) => void, userId?: number) {
  const source = useRef<string>("");
  if (!source.current) source.current = `screen-${++sourceSerial}`;
  const external = useRef(onExternal);
  external.current = onExternal;
  const owner = Number(userId ?? activeUserId) || 0;
  useEffect(() => {
    if (!owner) return;
    return subscribeSharedScope((scope, from) => {
      if (from === source.current) return;
      external.current?.(scope);
    }, owner);
  }, [owner]);
  const pick = useCallback(
    (patch: Partial<SharedScope>) => writeSharedScope(patch, { userId: owner, source: source.current }),
    [owner],
  );
  const read = useCallback(() => readSharedScope(owner), [owner]);
  return { pick, read };
}
