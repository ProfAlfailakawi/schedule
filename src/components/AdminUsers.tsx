import React, { useEffect, useMemo, useState } from "react";
import { sortByName } from "../utils/sorting";
import {
  Activity,
  Building2,
  Check,
  ChevronLeft,
  KeyRound,
  Landmark,
  ScrollText,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  UsersRound,
} from "lucide-react";
import {
  AddButton,
  Badge,
  ConsoleRail,
  Field,
  FormActions,
  Notice,
  PageTitle,
  PrimaryButton,
  SecondaryButton,
  Surface,
  CatalogFormDrawer,
} from "./ui";
import {
  AdCollege,
  AdCollegeUserAssign,
  AdSection,
  AuditLogEntry,
  FormName,
  FormSecurity,
} from "../types";

export type AdminMode = "users" | "permissions" | "scopes" | "audit";
type PageMode = "index" | "create" | "edit";
interface SafeUser {
  SystemUserId: number;
  Name: string;
  SystemUserLogin: string;
  /** Whether an account has a password at all. The value itself never leaves the server. */
  HasPassword?: boolean;
  IsAdminUser: boolean;
  IsActive: boolean;
  IsLocked: boolean;
  AdInstructorId?: number;
}
interface Props {
  mode: AdminMode;
  onNavigate?: (mode: AdminMode) => void;
  permissions?: number[];
}

/**
 * Declared here, not inside the screen — and that is the whole fix.
 *
 * A component defined in another component's body is a NEW component type on
 * every render, so React cannot reconcile it: it unmounts the old input and
 * mounts a fresh one. The visible symptom was that the admin search boxes lost
 * focus and the caret after every single keystroke, on all four screens, and
 * the only way to type a name was to click back into the field each letter.
 * At module scope the type is stable and the input simply keeps its focus.
 */
function SearchBox({
  value,
  onChange,
  placeholder = "بحث...",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="master-search">
      <Search />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value ? (
        <button type="button" onClick={() => onChange("")} aria-label="مسح">
          ×
        </button>
      ) : null}
    </label>
  );
}

function EmptyInspector({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="master-empty">
      {icon}
      <strong>{title}</strong>
      <span>اختر عنصراً من القائمة</span>
    </div>
  );
}

export default function AdminUsers({
  mode,
  onNavigate,
  permissions = [],
}: Props) {
  const [page, setPage] = useState<PageMode>("index"),
    [error, setError] = useState<string | null>(null),
    [users, setUsers] = useState<SafeUser[]>([]),
    [forms, setForms] = useState<FormName[]>([]),
    [perms, setPerms] = useState<FormSecurity[]>([]),
    [assigns, setAssigns] = useState<AdCollegeUserAssign[]>([]),
    [colleges, setColleges] = useState<AdCollege[]>([]),
    [sections, setSections] = useState<AdSection[]>([]),
    [instructors, setInstructors] = useState<any[]>([]),
    [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [query, setQuery] = useState(""),
    [filterUser, setFilterUser] = useState(0),
    [selectedUserId, setSelectedUserId] = useState<number | null>(null),
    [selectedPermKey, setSelectedPermKey] = useState<string | null>(null),
    [selectedScopeKey, setSelectedScopeKey] = useState<string | null>(null),
    [selectedLogId, setSelectedLogId] = useState<string | number | null>(null);
  const [editUserId, setEditUserId] = useState<number | null>(null),
    [name, setName] = useState(""),
    [login, setLogin] = useState(""),
    [password, setPassword] = useState(""),
    [isAdmin, setIsAdmin] = useState(false),
    [isActive, setIsActive] = useState(true),
    [isLocked, setIsLocked] = useState(false),
    [linkedInstructor, setLinkedInstructor] = useState(0);
  const [permUser, setPermUser] = useState(0),
    [permForm, setPermForm] = useState(0),
    [permSelections, setPermSelections] = useState<number[]>([]),
    [oldPerm, setOldPerm] = useState<FormSecurity | null>(null),
    [scopeUser, setScopeUser] = useState(0),
    [scopeCollege, setScopeCollege] = useState(0),
    [scopeSection, setScopeSection] = useState(0);
  const api = async (url: string, init?: RequestInit) => {
    const r = await fetch(url, init),
      d = await r.json();
    if (!r.ok) throw new Error(d.error || "تعذر تنفيذ العملية");
    return d;
  };
  const permKey = (p: FormSecurity) =>
      String(p.legacyId ?? `${p.SystemUserId}-${p.FormNameId}`),
    scopeKey = (a: AdCollegeUserAssign, index = 0) =>
      String(
        a.legacyId ??
          `${a.SystemUserId}-${a.AdCollegeId}-${a.AdSectionId}-${index}`,
      );
  const load = async () => {
    setError(null);
    try {
      const base = await Promise.all([
        api(mode === "users" ? "/api/users" : "/api/admin-user-options"),
        api("/api/colleges"),
        api("/api/sections"),
      ]);
      setUsers(sortByName(base[0], (row:any)=>row.Name));
      setColleges(sortByName(base[1], (row:any)=>row.AdCollegeName));
      setSections(sortByName(base[2], (row:any)=>row.AdSectionName));
      if (mode === "users")
        try {
          setInstructors(sortByName(await api("/api/admin-instructor-options"), (row:any)=>row.AdInstructorName));
        } catch {
          setInstructors([]);
        }
      // Note 26: permissions are edited inside the users screen now, so the users
      // mode needs the same forms + grants the standalone screen used to load.
      if (mode === "permissions" || mode === "users") {
        const d = await Promise.all([
          api("/api/permissions/forms"),
          api("/api/permissions"),
        ]);
        setForms(d[0]);
        setPerms(d[1]);
      }
      if (mode === "scopes") setAssigns(await api("/api/user-scopes"));
      if (mode === "audit") setLogs(await api("/api/audit-logs?limit=500"));
    } catch (e: any) {
      setError(e.message);
    }
  };
  useEffect(() => {
    setPage("index");
    setQuery("");
    setFilterUser(0);
    setError(null);
    setSelectedUserId(null);
    setSelectedPermKey(null);
    setSelectedScopeKey(null);
    setSelectedLogId(null);
    void load();
  }, [mode]);
  useEffect(() => {
    if (mode === "users" && users.length && !selectedUserId)
      setSelectedUserId(users[0].SystemUserId);
  }, [mode, users.length]);
  // Note 26: keep the inline permission grid bound to the selected user, seeded
  // from their current grants (re-seeds after a save reloads `perms`).
  useEffect(() => {
    if (mode !== "users" || !selectedUserId) return;
    setPermUser(selectedUserId);
    setPermSelections(perms.filter((item) => item.SystemUserId === selectedUserId).map((item) => item.FormNameId));
  }, [mode, selectedUserId, perms]);
  useEffect(() => {
    if (mode === "permissions" && perms.length && !selectedPermKey)
      setSelectedPermKey(permKey(perms[0]));
  }, [mode, perms.length]);
  useEffect(() => {
    if (mode === "scopes" && assigns.length && !selectedScopeKey)
      setSelectedScopeKey(scopeKey(assigns[0], 0));
  }, [mode, assigns.length]);
  useEffect(() => {
    if (mode === "audit" && logs.length && selectedLogId == null)
      setSelectedLogId(logs[0].id);
  }, [mode, logs.length]);

  const userById = useMemo(
      () => new Map(users.map((u) => [u.SystemUserId, u])),
      [users],
    ),
    formById = useMemo(
      () => new Map(forms.map((f) => [f.FormNameId, f])),
      [forms],
    ),
    collegeById = useMemo(
      () => new Map(colleges.map((c) => [c.AdCollegeId, c])),
      [colleges],
    ),
    sectionById = useMemo(
      () => new Map(sections.map((s) => [s.AdSectionId, s])),
      [sections],
    );
  const filteredSections = sections.filter(
    (s) => !scopeCollege || s.AdCollegeId === scopeCollege,
  );
  const resetUser = () => {
    setEditUserId(null);
    setName("");
    setLogin("");
    setPassword("");
    setIsAdmin(false);
    setIsActive(true);
    setIsLocked(false);
    setLinkedInstructor(0);
  };
  const back = () => {
    setPage("index");
    setError(null);
    resetUser();
    setOldPerm(null);
    setPermUser(0);
    setPermForm(0);
    setPermSelections([]);
    setScopeUser(0);
    setScopeCollege(0);
    setScopeSection(0);
  };
  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !login.trim() || (!editUserId && !password)) {
      setError("الرجاء إدخال الحقول المطلوبة بالأحمر");
      return;
    }
    try {
      await api(editUserId ? `/api/users/${editUserId}` : "/api/users", {
        method: editUserId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Name: name.trim(),
          SystemUserLogin: login.trim(),
          password: password || undefined,
          IsAdminUser: isAdmin,
          IsActive: isActive,
          IsLocked: isLocked,
          AdInstructorId: linkedInstructor || undefined,
        }),
      });
      const id = editUserId;
      await load();
      back();
      if (id) setSelectedUserId(id);
    } catch (e: any) {
      setError(e.message);
    }
  };
  const editUser = (u: SafeUser) => {
    setEditUserId(u.SystemUserId);
    setName(u.Name);
    setLogin(u.SystemUserLogin);
    // Empty means "leave the current password untouched" — the old value is
    // never sent to the browser, so there is nothing here to prefill.
    setPassword("");
    setIsAdmin(u.IsAdminUser);
    setIsActive(u.IsActive);
    setIsLocked(u.IsLocked);
    setLinkedInstructor(Number(u.AdInstructorId || 0));
    setPage("edit");
  };
  const deleteUser = async (id: number) => {
    // Deletion now removes the account's permissions and departments with it,
    // so the sentence says so — a confirmation that hides half the consequence
    // is not a confirmation.
    const who = users.find(user => user.SystemUserId === id);
    if (!confirm(
      `حذف «${who?.Name || "المستخدم"}»؟\nستُحذف معه صلاحياته وارتباطه بالأقسام العلمية، ولا يمكن التراجع.`,
    )) return;
    try {
      await api(`/api/users/${id}`, { method: "DELETE" });
      setSelectedUserId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const savePermission = async (e?: React.FormEvent) => {
    e?.preventDefault?.();
    setError(null);
    // No lower bound on selections here: clearing every permission is a valid,
    // deliberate action from the inline editor (removes all of the user's grants).
    if (!permUser) {
      setError("اختر المستخدم");
      return;
    }
    try {
      const current = perms.filter((item) => item.SystemUserId === permUser);
      const selected = new Set(permSelections);
      const currentIds = new Set(current.map((item) => item.FormNameId));
      const removals = current.filter((item) => !selected.has(item.FormNameId));
      const additions = permSelections.filter((id) => !currentIds.has(id));
      for (const item of removals) {
        if (item.legacyId)
          await api(`/api/permissions/${item.legacyId}`, { method: "DELETE" });
      }
      for (const formId of additions)
        await api("/api/permissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ SystemUserId: permUser, FormNameId: formId }),
        });
      await load();
      back();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const editPermission = (p: FormSecurity) => {
    setOldPerm(p);
    setPermUser(p.SystemUserId);
    setPermForm(p.FormNameId);
    setPermSelections(
      perms
        .filter((item) => item.SystemUserId === p.SystemUserId)
        .map((item) => item.FormNameId),
    );
    setPage("edit");
  };
  const deletePermission = async (p: FormSecurity) => {
    if (!confirm("هل أنت متأكد من حذف صلاحية المستخدم؟")) return;
    try {
      if (!p.legacyId) throw new Error("الصلاحية غير موجودة");
      await api(`/api/permissions/${p.legacyId}`, { method: "DELETE" });
      setSelectedPermKey(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const saveScope = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!scopeUser || !scopeCollege || !scopeSection) {
      setError("الرجاء إدخال الحقول المطلوبة بالأحمر");
      return;
    }
    try {
      await api("/api/user-scopes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          SystemUserId: scopeUser,
          AdCollegeId: scopeCollege,
          AdSectionId: scopeSection,
        }),
      });
      await load();
      back();
    } catch (e: any) {
      setError(e.message);
    }
  };
  const deleteScope = async (a: AdCollegeUserAssign) => {
    if (!confirm("هل أنت متأكد من حذف صلاحية المستخدم؟")) return;
    try {
      if (!a.legacyId)
        throw new Error("صلاحية الكلية والقسم العلمي غير موجودة");
      await api(`/api/user-scopes/${a.legacyId}`, { method: "DELETE" });
      setSelectedScopeKey(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Only the open section's records are loaded, so the rail stays purely
  // navigational rather than showing counts it would have to guess at.
  const tabs = [
    permissions.length === 0 || permissions.includes(11)
      ? { value: "users", label: "المستخدمون", icon: <UsersRound /> }
      : null,
    // Note 26: the standalone "الصلاحيات" tab is gone — permissions are edited
    // inline on the users screen, so there is nothing useful to show on its own.
    permissions.length === 0 || permissions.includes(15)
      ? { value: "scopes", label: "النطاقات", icon: <Building2 /> }
      : null,
    { value: "audit", label: "السجل", icon: <ScrollText /> },
  ].filter(Boolean) as Array<{ value: string; label: string; icon: React.ReactNode }>;
  // One header line for the whole console: the section rail plus whatever the
  // open section can create. Editor pages get the message only — switching
  // section mid-edit would throw away what was typed.
  const consoleHead = (action?: React.ReactNode) => (
    <>
      <h1 className="sr-only">إدارة النظام</h1>
      <div className="console-head">
        <ConsoleRail
          label="إدارة النظام"
          value={mode}
          onChange={(v) => onNavigate?.(v as AdminMode)}
          options={tabs}
        />
        {action ? <div className="console-action-slot no-print">{action}</div> : null}
      </div>
      {error ? <Notice>{error}</Notice> : null}
    </>
  );

  const usersFormDrawer = (mode === "users" && page !== "index") ? (
      <CatalogFormDrawer onClose={back} label={page === "create" ? "إنشاء مستخدم" : "تعديل المستخدم"}>
        <PageTitle
          eyebrow="إدارة النظام"
          subtitle="يمكن ربطه بأستاذ مقرر"
        >
          {page === "create" ? "إنشاء مستخدم" : "تعديل المستخدم"}
        </PageTitle>
        {error ? <Notice>{error}</Notice> : null}
        <Surface className="form-card smart-form">
          <div className="form-intro">
            <span>
              <UserCog />
            </span>
            <div>
              <strong>حساب مسؤول الجدول</strong>
              <p>دخول · حالة · ربط اختياري</p>
            </div>
          </div>
          <form onSubmit={saveUser}>
            <div className="form-grid">
              <Field label="الاسم" required>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>
              <Field label="اسم المستخدم" required>
                <input
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  required
                />
              </Field>
              <Field
                label="كلمة السر"
                required={!editUserId}
                hint={editUserId ? "اتركها فارغة للإبقاء على كلمة السر الحالية" : undefined}
              >
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  placeholder={editUserId ? "••••••••" : ""}
                  onChange={(e) => setPassword(e.target.value)}
                  required={!editUserId}
                />
              </Field>
              <Field
                label="ربط بلوحة أستاذ المقرر"
                hint="اختياري — لتفعيل اللوحة الشخصية"
              >
                <select
                  value={linkedInstructor || ""}
                  onChange={(e) =>
                    setLinkedInstructor(Number(e.target.value) || 0)
                  }
                >
                  <option value="">بدون ربط</option>
                  {instructors.map((i) => (
                    <option key={i.AdInstructorId} value={i.AdInstructorId}>
                      {i.AdInstructorName} — {i.AdInstructorCivil}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="حالة الحساب">
                <div className="checkbox-row day-pills">
                  <label>
                    <input
                      type="checkbox"
                      checked={isAdmin}
                      onChange={(e) => setIsAdmin(e.target.checked)}
                    />
                    <span>مدير</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                    />
                    <span>فعال</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={isLocked}
                      onChange={(e) => setIsLocked(e.target.checked)}
                    />
                    <span>مقفل</span>
                  </label>
                </div>
              </Field>
            </div>
            <FormActions onBack={back} />
          </form>
        </Surface>
      </CatalogFormDrawer>
    ) : null;
  const permissionsFormDrawer = (mode === "permissions" && page !== "index") ? (
      <CatalogFormDrawer onClose={back} label="صلاحيات المستخدم" wide>
        <PageTitle
          eyebrow="إدارة النظام"
          subtitle="مستخدم واحد · صلاحياته فقط"
        >
          صلاحيات المستخدم
        </PageTitle>
        {error ? <Notice>{error}</Notice> : null}
        <Surface className="form-card smart-form permission-picker-card">
          <div className="form-intro">
            <span><KeyRound /></span>
            <div>
              <strong>اختيار بصري مباشر</strong>
              <p>مستخدم واحد · كل صلاحياته</p>
            </div>
          </div>
          <form onSubmit={savePermission}>
            <Field label="المستخدم" required>
              <select
                value={permUser || ""}
                onChange={(e) => {
                  const id = Number(e.target.value) || 0;
                  setPermUser(id);
                  setPermSelections(
                    perms.filter((item) => item.SystemUserId === id).map((item) => item.FormNameId),
                  );
                }}
                required
              >
                <option value="">اختر المستخدم ...</option>
                {users.map((u) => (
                  <option key={u.SystemUserId} value={u.SystemUserId}>
                    {u.Name} · {u.SystemUserLogin}
                  </option>
                ))}
              </select>
            </Field>
            <div className="permission-choice-grid" aria-label="اختيار الصلاحيات">
              {forms.map((f) => {
                const active = permSelections.includes(f.FormNameId);
                return (
                  <button
                    type="button"
                    key={f.FormNameId}
                    className={active ? "active" : ""}
                    onClick={() =>
                      setPermSelections((current) =>
                        current.includes(f.FormNameId)
                          ? current.filter((id) => id !== f.FormNameId)
                          : [...current, f.FormNameId],
                      )
                    }
                  >
                    <span className="permission-check" aria-hidden="true">{active ? <Check /> : <KeyRound />}</span>
                    <strong>{f.FormName}</strong>
                    <small title="رقم الشاشة في النظام">{f.FormNameId}</small>
                  </button>
                );
              })}
            </div>
            <div className="permission-selection-summary">
              <span><b>{permSelections.length}</b> صلاحية محددة من <b>{forms.length}</b></span>
              {permSelections.length ? (
                <button type="button" onClick={() => setPermSelections([])}>مسح الاختيار</button>
              ) : null}
            </div>
            <FormActions onBack={back} submitDisabled={!permUser || !permSelections.length} />
          </form>
        </Surface>
      </CatalogFormDrawer>
    ) : null;
  const scopesFormDrawer = (mode === "scopes" && page !== "index") ? (
      <CatalogFormDrawer onClose={back} label="إنشاء نطاق أكاديمي">
        <PageTitle
          eyebrow="إدارة النظام"
          subtitle="الكلية والقسم يحددان ما يظهر"
        >
          إنشاء نطاق أكاديمي
        </PageTitle>
        {error ? <Notice>{error}</Notice> : null}
        <Surface className="form-card smart-form">
          <div className="form-intro">
            <span>
              <Landmark />
            </span>
            <div>
              <strong>نطاق المستخدم</strong>
              <p>كلية وقسم مسموحان</p>
            </div>
          </div>
          <form onSubmit={saveScope}>
            <div className="form-grid">
              <Field label="اسم المستخدم" required>
                <select
                  value={scopeUser || ""}
                  onChange={(e) => setScopeUser(Number(e.target.value) || 0)}
                  required
                >
                  <option value="">اختر ...</option>
                  {users.map((u) => (
                    <option key={u.SystemUserId} value={u.SystemUserId}>
                      {u.Name} · {u.SystemUserLogin}
                    </option>
                  ))}
                </select>
                {/* Note 27: show which departments this user is already scoped to,
                    right under their name, before adding another. */}
                {scopeUser ? (
                  <p className="smart-term-hint scope-current-hint">
                    <Building2 aria-hidden="true" />
                    {(() => {
                      const mine = assigns.filter((a) => a.SystemUserId === scopeUser);
                      if (!mine.length) return "لا أقسام مسندة لهذا المستخدم بعد.";
                      const names = [...new Set(mine.map((a) => sectionById.get(a.AdSectionId)?.AdSectionName).filter(Boolean))];
                      return `مسند حالياً إلى: ${names.join(" · ")}`;
                    })()}
                  </p>
                ) : null}
              </Field>
              <Field label="اسم الكلية" required>
                <select
                  value={scopeCollege || ""}
                  onChange={(e) => {
                    setScopeCollege(Number(e.target.value) || 0);
                    setScopeSection(0);
                  }}
                  required
                >
                  <option value="">اختر ...</option>
                  {colleges.map((c) => (
                    <option key={c.AdCollegeId} value={c.AdCollegeId}>
                      {c.AdCollegeName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="اسم القسم العلمي" required>
                <select
                  value={scopeSection || ""}
                  disabled={!scopeCollege}
                  onChange={(e) => setScopeSection(Number(e.target.value) || 0)}
                  required
                >
                  <option value="">اختر ...</option>
                  {filteredSections.map((s) => (
                    <option key={s.AdSectionId} value={s.AdSectionId}>
                      {s.AdSectionName}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <FormActions onBack={back} />
          </form>
        </Surface>
      </CatalogFormDrawer>
    ) : null;

  if (mode === "users") {
    const filtered = users.filter((u) =>
        `${u.Name} ${u.SystemUserLogin}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
      selected = users.find((u) => u.SystemUserId === selectedUserId) || null,
      linked = instructors.find(
        (x) => x.AdInstructorId === selected?.AdInstructorId,
      );
    return (
      <>
      <div className="content-stack admin-page master-detail-page">
        {consoleHead(
          <AddButton
            onClick={() => {
              resetUser();
              setPage("create");
            }}
          >
            مستخدم جديد
          </AddButton>,
        )}
        <div className="admin-quiet-summary">
          <span>
            <UsersRound />
            <b>{users.length}</b> مستخدم
          </span>
          <span>
            <ShieldCheck />
            <b>{users.filter((u) => u.IsAdminUser).length}</b> مدير
          </span>
          <span>
            <UserCog />
            <b>{users.filter((u) => u.AdInstructorId).length}</b> لوحة شخصية
          </span>
        </div>
        <div className="master-detail-shell">
          <section className="master-pane">
            <header>
              <SearchBox value={query} onChange={setQuery} placeholder="الاسم أو اسم المستخدم" />
              <span>{filtered.length}</span>
            </header>
            <div className="master-list">
              {filtered.map((u) => (
                <button
                  type="button"
                  key={u.SystemUserId}
                  className={
                    selected?.SystemUserId === u.SystemUserId ? "active" : ""
                  }
                  onClick={() => setSelectedUserId(u.SystemUserId)}
                >
                  <span className="master-avatar">
                    {u.Name.trim().charAt(0) || "د"}
                  </span>
                  <div>
                    <strong>{u.Name}</strong>
                    <small>@{u.SystemUserLogin}</small>
                  </div>
                  <Badge
                    tone={
                      u.IsLocked ? "danger" : u.IsActive ? "success" : "warning"
                    }
                  >
                    {u.IsLocked ? "مقفل" : u.IsActive ? "فعال" : "متوقف"}
                  </Badge>
                  <ChevronLeft />
                </button>
              ))}
            </div>
          </section>
          <aside className="inspector-pane">
            {selected ? (
              <>
                <div className="inspector-hero">
                  <span className="inspector-avatar">
                    {selected.Name.trim().charAt(0) || "د"}
                  </span>
                  <div>
                    <small>حساب مسؤول جدول</small>
                    <h2>{selected.Name}</h2>
                    <p>@{selected.SystemUserLogin}</p>
                  </div>
                </div>
                <div className="inspector-status">
                  <Badge tone={selected.IsAdminUser ? "info" : "neutral"}>
                    {selected.IsAdminUser ? "مدير" : "مستخدم"}
                  </Badge>
                  <Badge
                    tone={
                      selected.IsLocked
                        ? "danger"
                        : selected.IsActive
                          ? "success"
                          : "warning"
                    }
                  >
                    {selected.IsLocked
                      ? "مقفل"
                      : selected.IsActive
                        ? "فعال"
                        : "غير فعال"}
                  </Badge>
                </div>
                <div className="inspector-facts">
                  <article>
                    <span>اسم المستخدم</span>
                    <b dir="ltr">{selected.SystemUserLogin}</b>
                  </article>
                  {/* A password is a state to confirm, never a value to read:
                      the vault stays on the server, and this row answers the
                      only question an administrator has — is one set at all? */}
                  <article>
                    <span>كلمة السر</span>
                    <b className={selected.HasPassword === false ? "fact-warn" : ""}>
                      {selected.HasPassword === false ? "غير مضبوطة" : "محفوظة ومشفّرة"}
                    </b>
                  </article>
                  <article>
                    <span>لوحة الأستاذ</span>
                    <b>{linked?.AdInstructorName || "غير مربوطة"}</b>
                  </article>
                  <article>
                    <span>رقم الحساب</span>
                    <b>{selected.SystemUserId}</b>
                  </article>
                </div>
                {/* Note 26: the permission editor lives here now — pick a user on the
                    left and set exactly what they can reach, with no separate tab. */}
                <section className="inspector-permissions" aria-label="صلاحيات المستخدم">
                  <div className="inspector-perm-head">
                    <span className="surface-kicker"><KeyRound aria-hidden="true" /> صلاحيات الوصول</span>
                    <b>{permSelections.length} من {forms.length || "…"}</b>
                  </div>
                  {forms.length ? (
                    <>
                      <div className="permission-choice-grid" aria-label="اختيار صلاحيات المستخدم">
                        {forms.map((f) => {
                          const active = permSelections.includes(f.FormNameId);
                          return (
                            <button
                              type="button"
                              key={f.FormNameId}
                              className={active ? "active" : ""}
                              aria-pressed={active}
                              onClick={() =>
                                setPermSelections((current) =>
                                  current.includes(f.FormNameId)
                                    ? current.filter((id) => id !== f.FormNameId)
                                    : [...current, f.FormNameId],
                                )
                              }
                            >
                              <span className="permission-check" aria-hidden="true">{active ? <Check /> : <KeyRound />}</span>
                              <strong>{f.FormName}</strong>
                              <small title="رقم الشاشة في النظام">{f.FormNameId}</small>
                            </button>
                          );
                        })}
                      </div>
                      <div className="inspector-perm-actions">
                        <PrimaryButton onClick={() => savePermission()}>حفظ الصلاحيات</PrimaryButton>
                        {permSelections.length ? (
                          <SecondaryButton onClick={() => setPermSelections([])}>مسح الاختيار</SecondaryButton>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <p className="soft-copy">جارٍ تحميل الصلاحيات…</p>
                  )}
                </section>
                <div className="inspector-actions">
                  <PrimaryButton onClick={() => editUser(selected)}>
                    تعديل الحساب
                  </PrimaryButton>
                  <SecondaryButton
                    className="danger-action"
                    onClick={() => deleteUser(selected.SystemUserId)}
                  >
                    <Trash2 /> حذف
                  </SecondaryButton>
                </div>
              </>
            ) : (
              <EmptyInspector icon={<UsersRound />} title="اختر مستخدماً" />
            )}
          </aside>
        </div>
      </div>
      {usersFormDrawer}
      </>
    );
  }

  if (mode === "permissions") {
    const filtered = perms.filter(
      (p) =>
        (!filterUser || p.SystemUserId === filterUser) &&
        `${userById.get(p.SystemUserId)?.Name || ""} ${formById.get(p.FormNameId)?.FormName || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
    const selected =
      filtered.find((p) => permKey(p) === selectedPermKey) ||
      perms.find((p) => permKey(p) === selectedPermKey) ||
      null;
    return (
      <>
      <div className="content-stack admin-page master-detail-page">
        {consoleHead(
          <AddButton
            onClick={() => {
              setOldPerm(null);
              setPermUser(0);
              setPermForm(0);
              setPermSelections([]);
              setPage("create");
            }}
          >
            صلاحية جديدة
          </AddButton>,
        )}
        <div className="master-detail-shell">
          <section className="master-pane">
            <header className="master-filter-stack">
              <SearchBox value={query} onChange={setQuery} placeholder="بحث بالمستخدم أو الوظيفة" />
              <select
                value={filterUser || ""}
                onChange={(e) => setFilterUser(Number(e.target.value) || 0)}
              >
                <option value="">كل المستخدمين</option>
                {users.map((u) => (
                  <option key={u.SystemUserId} value={u.SystemUserId}>
                    {u.Name}
                  </option>
                ))}
              </select>
            </header>
            <div className="master-list permission-master">
              {filtered.map((p) => (
                <button
                  type="button"
                  key={permKey(p)}
                  className={
                    selected && permKey(selected) === permKey(p) ? "active" : ""
                  }
                  onClick={() => setSelectedPermKey(permKey(p))}
                >
                  <span className="master-symbol">
                    <KeyRound />
                  </span>
                  <div>
                    <strong>
                      {formById.get(p.FormNameId)?.FormName || "صلاحية"}
                    </strong>
                    <small>{userById.get(p.SystemUserId)?.Name || ""}</small>
                  </div>
                  <ChevronLeft />
                </button>
              ))}
            </div>
          </section>
          <aside className="inspector-pane">
            {selected ? (
              <>
                <div className="inspector-hero icon">
                  <span className="inspector-avatar">
                    <KeyRound />
                  </span>
                  <div>
                    <small>صلاحية وظيفة</small>
                    <h2>
                      {formById.get(selected.FormNameId)?.FormName || "صلاحية"}
                    </h2>
                    <p>{userById.get(selected.SystemUserId)?.Name || ""}</p>
                  </div>
                </div>
                <div className="inspector-facts">
                  <article>
                    <span>المستخدم</span>
                    <b>
                      {userById.get(selected.SystemUserId)?.SystemUserLogin ||
                        "—"}
                    </b>
                  </article>
                  <article>
                    <span>رقم الصلاحية</span>
                    <b>{selected.FormNameId}</b>
                  </article>
                  <article>
                    <span>المعرّف</span>
                    <b>{selected.legacyId || "—"}</b>
                  </article>
                </div>
                <div className="inspector-actions">
                  <PrimaryButton onClick={() => editPermission(selected)}>
                    تعديل
                  </PrimaryButton>
                  <SecondaryButton
                    className="danger-action"
                    onClick={() => deletePermission(selected)}
                  >
                    <Trash2 /> حذف
                  </SecondaryButton>
                </div>
              </>
            ) : (
              <EmptyInspector icon={<KeyRound />} title="اختر صلاحية" />
            )}
          </aside>
        </div>
      </div>
      {permissionsFormDrawer}
      </>
    );
  }

  if (mode === "scopes") {
    const filtered = assigns.filter(
      (a) =>
        (!filterUser || a.SystemUserId === filterUser) &&
        `${userById.get(a.SystemUserId)?.Name || ""} ${collegeById.get(a.AdCollegeId)?.AdCollegeName || ""} ${sectionById.get(a.AdSectionId)?.AdSectionName || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
    const selectedIndex = assigns.findIndex(
        (a, i) => scopeKey(a, i) === selectedScopeKey,
      ),
      selected = selectedIndex >= 0 ? assigns[selectedIndex] : null;
    return (
      <>
      <div className="content-stack admin-page master-detail-page">
        {consoleHead(
          <AddButton
            onClick={() => {
              setScopeUser(0);
              setScopeCollege(0);
              setScopeSection(0);
              setPage("create");
            }}
          >
            نطاق جديد
          </AddButton>,
        )}
        <div className="master-detail-shell">
          <section className="master-pane">
            <header className="master-filter-stack">
              <SearchBox value={query} onChange={setQuery} placeholder="بحث بالمستخدم أو القسم" />
              <select
                value={filterUser || ""}
                onChange={(e) => setFilterUser(Number(e.target.value) || 0)}
              >
                <option value="">كل المستخدمين</option>
                {users.map((u) => (
                  <option key={u.SystemUserId} value={u.SystemUserId}>
                    {u.Name}
                  </option>
                ))}
              </select>
            </header>
            <div className="master-list">
              {filtered.map((a, i) => {
                const key = scopeKey(a, assigns.indexOf(a));
                return (
                  <button
                    type="button"
                    key={key}
                    className={selectedScopeKey === key ? "active" : ""}
                    onClick={() => setSelectedScopeKey(key)}
                  >
                    <span className="master-symbol">
                      <Landmark />
                    </span>
                    <div>
                      <strong>
                        {sectionById.get(a.AdSectionId)?.AdSectionName || "قسم"}
                      </strong>
                      <small>{userById.get(a.SystemUserId)?.Name || ""}</small>
                    </div>
                    <ChevronLeft />
                  </button>
                );
              })}
            </div>
          </section>
          <aside className="inspector-pane">
            {selected ? (
              <>
                <div className="inspector-hero icon">
                  <span className="inspector-avatar">
                    <Landmark />
                  </span>
                  <div>
                    <small>نطاق أكاديمي</small>
                    <h2>
                      {sectionById.get(selected.AdSectionId)?.AdSectionName ||
                        "القسم"}
                    </h2>
                    <p>
                      {collegeById.get(selected.AdCollegeId)?.AdCollegeName ||
                        ""}
                    </p>
                  </div>
                </div>
                <div className="inspector-facts">
                  <article>
                    <span>المستخدم</span>
                    <b>{userById.get(selected.SystemUserId)?.Name || "—"}</b>
                  </article>
                  <article>
                    <span>اسم المستخدم</span>
                    <b dir="ltr">
                      {userById.get(selected.SystemUserId)?.SystemUserLogin ||
                        "—"}
                    </b>
                  </article>
                  <article>
                    <span>الكلية</span>
                    <b>
                      {collegeById.get(selected.AdCollegeId)?.AdCollegeName ||
                        "—"}
                    </b>
                  </article>
                  <article>
                    <span>القسم العلمي</span>
                    <b>
                      {sectionById.get(selected.AdSectionId)?.AdSectionName ||
                        "—"}
                    </b>
                  </article>
                </div>
                <div className="inspector-actions">
                  <SecondaryButton
                    className="danger-action"
                    onClick={() => deleteScope(selected)}
                  >
                    <Trash2 /> حذف النطاق
                  </SecondaryButton>
                </div>
              </>
            ) : (
              <EmptyInspector icon={<Landmark />} title="اختر نطاقاً" />
            )}
          </aside>
        </div>
      </div>
      {scopesFormDrawer}
      </>
    );
  }

  /* The change sentence is searchable too, so «القاعة» finds every room move,
     and the user filter matches the sibling permission and scope screens. */
  const filteredLogs = logs.filter((x) =>
      (!filterUser || Number(x.SystemUserId) === filterUser) &&
      `${x.userName} ${x.action} ${x.entity} ${x.path} ${x.method} ${x.entityId || ""} ${x.changes || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
    selectedLog =
      logs.find((x) => String(x.id) === String(selectedLogId)) || null;
  return (
    <div className="content-stack admin-page master-detail-page">
      {consoleHead(
        <SecondaryButton type="button" onClick={() => void load()}>
          تحديث السجل
        </SecondaryButton>,
      )}
      <div className="master-detail-shell audit-master-detail">
        <section className="master-pane">
          <header>
            <SearchBox value={query} onChange={setQuery} placeholder="المستخدم، العملية أو ما تغيّر" />
            <select
              className="audit-user-filter"
              value={filterUser || ""}
              onChange={(e) => setFilterUser(Number(e.target.value) || 0)}
              aria-label="تصفية السجل بالمستخدم"
            >
              <option value="">كل المستخدمين</option>
              {users.map((u) => (
                <option key={u.SystemUserId} value={u.SystemUserId}>{u.Name}</option>
              ))}
            </select>
            <span>{filteredLogs.length}</span>
          </header>
          <div className="master-list audit-master">
            {filteredLogs.map((x) => (
              <button
                type="button"
                key={x.id}
                className={
                  String(selectedLogId) === String(x.id) ? "active" : ""
                }
                onClick={() => setSelectedLogId(x.id)}
              >
                <span className="master-symbol">
                  <Activity />
                </span>
                <div>
                  <strong>
                    {x.action} · {x.entity}
                  </strong>
                  {/* What changed, in the row itself — the log is read by
                      scanning, and the answer should not need a second click. */}
                  {x.changes ? <em className="audit-change">{x.changes}</em> : null}
                  <small>
                    {x.userName} ·{" "}
                    {new Date(x.timestamp).toLocaleString("ar-KW-u-nu-latn")}
                  </small>
                </div>
                <Badge
                  tone={
                    x.action === "حذف"
                      ? "danger"
                      : x.action === "إضافة"
                        ? "success"
                        : "info"
                  }
                >
                  {x.status}
                </Badge>
                <ChevronLeft />
              </button>
            ))}
          </div>
        </section>
        <aside className="inspector-pane">
          {selectedLog ? (
            <>
              <div className="inspector-hero icon">
                <span className="inspector-avatar">
                  <Activity />
                </span>
                <div>
                  <small>عملية مسجلة</small>
                  <h2>
                    {selectedLog.action} · {selectedLog.entity}
                  </h2>
                  <p>
                    {new Date(selectedLog.timestamp).toLocaleString("ar-KW-u-nu-latn")}
                  </p>
                </div>
              </div>
              {selectedLog.changes ? (
                <div className="audit-change-card">
                  <span>ما الذي تغيّر</span>
                  <p>{selectedLog.changes}</p>
                </div>
              ) : null}
              <div className="inspector-facts">
                <article>
                  <span>المستخدم</span>
                  <b>{selectedLog.userName}</b>
                </article>
                <article>
                  <span>الطريقة</span>
                  <b dir="ltr">{selectedLog.method}</b>
                </article>
                <article>
                  <span>المسار</span>
                  <b dir="ltr" className="inspector-path">
                    {selectedLog.path}
                  </b>
                </article>
                <article>
                  <span>العنصر</span>
                  <b>
                    {selectedLog.entityId ? `#${selectedLog.entityId}` : "—"}
                  </b>
                </article>
                <article>
                  <span>الحالة</span>
                  <b>{selectedLog.status}</b>
                </article>
              </div>
            </>
          ) : (
            <EmptyInspector icon={<Activity />} title="اختر عملية" />
          )}
        </aside>
      </div>
    </div>
  );
}
