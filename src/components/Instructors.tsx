import React, { useEffect, useMemo, useState } from "react";
import { Phone, Trash2, UserRound } from "lucide-react";
import { validateCivilId } from "../utils/civilId";
import { sortByName } from "../utils/sorting";
import {
  AddButton,
  EmbeddedAction,
  EmptyState,
  Field,
  FormActions,
  ListToolbar,
  MetaPill,
  Notice,
  PageTitle,
  PrimaryButton,
  RecordCard,
  RecordDeck,
  SecondaryButton,
  SkeletonDeck,
  Surface,
  CatalogFormDrawer,
} from "./ui";
type Mode = "index" | "create" | "edit";
/** `embedded` means the academic console already supplies the page identity. */
export default function Instructors({ embedded = false, actionSlot = null }: { embedded?: boolean; actionSlot?: HTMLElement | null }) {
  const [items, setItems] = useState<any[]>([]),
    [mode, setMode] = useState<Mode>("index"),
    [editId, setEditId] = useState<number | null>(null),
    [selectedId, setSelectedId] = useState<number | null>(null),
    [civil, setCivil] = useState(""),
    [name, setName] = useState(""),
    [mobile, setMobile] = useState(""),
    [query, setQuery] = useState(""),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [visibleLimit, setVisibleLimit] = useState(160),
    // Note 2: retired / sabbatical status. Note 1: which instructors are delegates.
    [status, setStatus] = useState<"" | "retired" | "sabbatical">(""),
    [delegateIds, setDelegateIds] = useState<Set<number>>(new Set());
  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/instructors");
      if (!r.ok) throw 0;
      const data = await r.json();
      setItems(data);
      setSelectedId((v) =>
        v && data.some((x: any) => x.AdInstructorId === v)
          ? v
          : data[0]?.AdInstructorId || null,
      );
    } catch {
      setError("فشل تحميل بيانات أستاذ المقرر");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    fetch("/api/delegates")
      .then(r => (r.ok ? r.json() : { instructorIds: [] }))
      .then(d => setDelegateIds(new Set((d.instructorIds || []).map(Number))))
      .catch(() => undefined);
  }, []);
  const back = () => {
      setMode("index");
      setError(null);
    },
    create = () => {
      setEditId(null);
      setCivil("");
      setName("");
      setMobile("");
      setStatus("");
      setMode("create");
      setError(null);
    },
    edit = (x: any) => {
      setEditId(x.AdInstructorId);
      setCivil(x.AdInstructorCivil || "");
      setName(x.AdInstructorName || "");
      setMobile(x.AdInstructorMobile || "");
      setStatus(x.AdInstructorStatus === "retired" || x.AdInstructorStatus === "sabbatical" ? x.AdInstructorStatus : "");
      setMode("edit");
      setError(null);
    };
  const onCivil = (value: string) => {
      if (value && !/^\d*$/.test(value)) {
        setError("الرجاء كتابة الأرقام بالانجليزي");
        return;
      }
      setCivil(value.slice(0, 12));
      setError(null);
    },
    validateCivil = () => {
      if (!civil) return;
      const v = validateCivilId(civil);
      if (!v.isValid) {
        // The typed value stays: a reader correcting a civil ID needs to see
        // the digits they entered, not an empty box and a warning.
        setError(
          v.message ||
            "الرقم المدني المدخل لأستاذ المقرر غير صحيح وفقاً لبيانات البطاقة المدنية",
        );
        return;
      }
      if (
        items.some(
          (x) =>
            String(x.AdInstructorCivil || "") === civil &&
            x.AdInstructorId !== editId,
        )
      ) {
        setError("تم التسجيل من قبل");
      }
    };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!civil || !name.trim()) {
      setError("الرجاء إدخال الحقول المطلوبة بالأحمر");
      return;
    }
    const v = validateCivilId(civil);
    if (!v.isValid) {
      setError(v.message);
      return;
    }
    const r = await fetch(
        mode === "edit" ? `/api/instructors/${editId}` : "/api/instructors",
        {
          method: mode === "edit" ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            AdInstructorCivil: civil,
            AdInstructorName: name.trim(),
            AdInstructorMobile: mobile.trim(),
            AdInstructorStatus: status || null,
          }),
        },
      ),
      d = await r.json();
    if (!r.ok) {
      setError(d.error || "فشل حفظ بيانات أستاذ المقرر");
      return;
    }
    await load();
    back();
  };
  const remove = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف بيانات أستاذ المقرر؟")) return;
    const r = await fetch(`/api/instructors/${id}`, { method: "DELETE" }),
      d = await r.json();
    if (!r.ok) {
      setError(d.error || "فشل حذف بيانات أستاذ المقرر");
      return;
    }
    setSelectedId(null);
    await load();
  };
  useEffect(() => setVisibleLimit(160), [query]);
  const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      const base = q
        ? items.filter((x) =>
            [
              x.AdInstructorCivil,
              x.AdInstructorName,
              x.AdInstructorMobile,
            ].some((v) =>
              String(v || "")
                .toLowerCase()
                .includes(q),
            ),
          )
        : items;
      return sortByName(base, (x: any) => x.AdInstructorName);
    }, [items, query]),
    selected =
      filtered.find((x) => x.AdInstructorId === selectedId) || filtered[0] || null,
    activeId = selected?.AdInstructorId ?? null;
  const editorDrawer = mode !== "index" ? (
      <CatalogFormDrawer onClose={back} label={mode === "create" ? "إنشاء أستاذ جديد" : "تعديل بيانات الأستاذ"}>
        <PageTitle
          eyebrow="البيانات الأكاديمية"
          subtitle="تحقق الرقم المدني فعّال"
        >
          {mode === "create" ? "تسجيل أستاذ مقرر جديد" : "تعديل بيانات الأستاذ"}
        </PageTitle>
        {error ? <Notice>{error}</Notice> : null}
        <Surface className="form-card smart-form">
          <div className="form-intro">
            <span>
              <UserRound />
            </span>
            <div>
              <strong>هوية أستاذ المقرر</strong>
              <p>الرقم المدني للتحقق والبحث</p>
            </div>
          </div>
          <form onSubmit={submit}>
            <div className="form-grid">
              <Field label="الرقم المدني" required>
                <input
                  inputMode="numeric"
                  maxLength={12}
                  value={civil}
                  onChange={(e) => onCivil(e.target.value)}
                  onBlur={validateCivil}
                  aria-label="الرقم المدني"
                  autoComplete="off"
                  autoFocus
                  required
                />
              </Field>
              <Field label="أستاذ المقرر" required>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="اسم أستاذ المقرر"
                  autoComplete="name"
                  required
                />
              </Field>
              <Field label="رقم الهاتف">
                <input
                  inputMode="numeric"
                  maxLength={8}
                  value={mobile}
                  aria-label="رقم الهاتف"
                  autoComplete="tel"
                  onChange={(e) => {
                    if (/^\d*$/.test(e.target.value)) setMobile(e.target.value);
                  }}
                />
              </Field>
              <Field label="الحالة">
                <div className="status-choice" role="radiogroup" aria-label="حالة الأستاذ">
                  {[
                    { value: "", label: "نشط" },
                    { value: "sabbatical", label: "متفرّغ" },
                    { value: "retired", label: "متقاعد" },
                  ].map((opt) => (
                    <button
                      type="button"
                      key={opt.value || "active"}
                      role="radio"
                      aria-checked={status === opt.value}
                      className={status === opt.value ? "on" : ""}
                      onClick={() => setStatus(opt.value as "" | "retired" | "sabbatical")}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            {status ? (
              <p className="smart-term-hint">
                <UserRound aria-hidden="true" />
                {status === "retired" ? "متقاعد" : "متفرّغ"}: يبقى في السجل ويحتفظ بمواعيده السابقة، لكن لا يظهر عند إسناد مواعيد جديدة.
              </p>
            ) : null}
            <FormActions
              onBack={back}
              loading={loading}
              submitLabel={mode === "create" ? "إضافة الأستاذ" : "حفظ التعديلات"}
            />
          </form>
        </Surface>
      </CatalogFormDrawer>
    ) : null;
  return (
    <div className={`content-stack library-page catalog-inspector-page ${embedded ? "embedded-catalog" : ""}`}>
      {embedded ? (
        <EmbeddedAction slot={actionSlot}>
          <AddButton onClick={create}>إضافة أستاذ</AddButton>
        </EmbeddedAction>
      ) : (
        <PageTitle
          eyebrow="الدليل الأكاديمي"
          subtitle="المكتبة والتفاصيل في لوحة واحدة"
          action={<AddButton onClick={create}>إضافة أستاذ</AddButton>}
        >
          أساتذة المقررات
        </PageTitle>
      )}
      {error ? <Notice>{error}</Notice> : null}
      <div className="catalog-workspace" aria-busy={loading}>
        <Surface className="catalog-master">
          <h2 className="sr-only">قائمة أساتذة المقررات</h2>
          <ListToolbar
            value={query}
            onChange={setQuery}
            count={filtered.length}
            placeholder="ابحث بالاسم أو الرقم المدني أو الهاتف"
          />
          {loading ? (
            <SkeletonDeck count={6} />
          ) : filtered.length ? (
            <RecordDeck>
              {filtered.slice(0, visibleLimit).map((x) => (
                <RecordCard
                  key={x.AdInstructorId}
                  onClick={() => setSelectedId(x.AdInstructorId)}
                  className={activeId === x.AdInstructorId ? "selected" : ""}
                  icon={<UserRound />}
                  title={(
                    <>
                      {x.AdInstructorName}
                      {x.AdInstructorStatus === "retired" ? <span className="staff-badge is-retired">متقاعد</span>
                        : x.AdInstructorStatus === "sabbatical" ? <span className="staff-badge is-sabbatical">متفرّغ</span> : null}
                      {delegateIds.has(x.AdInstructorId) ? <span className="staff-badge is-delegate">منتدب</span> : null}
                      {activeId === x.AdInstructorId ? <span className="sr-only">، محدد</span> : null}
                    </>
                  )}
                  subtitle={
                    x.AdInstructorMobile
                      ? `هاتف ${x.AdInstructorMobile}`
                      : "لا يوجد رقم هاتف مسجل"
                  }
                  meta={
                    <MetaPill
                      label="الرقم المدني"
                      value={x.AdInstructorCivil}
                      dir="ltr"
                    />
                  }
                />
              ))}
            </RecordDeck>
          ) : (
            <EmptyState
              title={query ? "لا يوجد أستاذ مطابق" : "لا يوجد أساتذة بعد"}
              detail={query ? "جرّب الاسم أو الرقم المدني أو امسح البحث." : "أضف الأستاذ الأول ليصبح متاحًا عند بناء الجدول."}
              action={query ? <SecondaryButton onClick={() => setQuery("")}>مسح البحث</SecondaryButton> : undefined}
            />
          )}
          {filtered.length > visibleLimit ? (
            <div className="catalog-more">
              <SecondaryButton onClick={() => setVisibleLimit((v) => v + 160)}>
                عرض المزيد ·{" "}
                {(filtered.length - visibleLimit).toLocaleString("ar-KW-u-nu-latn")} متبقٍ
              </SecondaryButton>
            </div>
          ) : null}
        </Surface>
        <aside className="academic-inspector" aria-label="تفاصيل الأستاذ المحدد" aria-live="polite">
          {selected ? (
            <>
              <div className="academic-inspector-icon">
                <UserRound />
              </div>
              <span className="surface-kicker">تفاصيل الأستاذ</span>
              <h2>{selected.AdInstructorName}</h2>
              <p>يظهر في الجدول والتقارير.</p>
              <div className="inspector-facts">
                <article>
                  <span>الرقم المدني</span>
                  <b dir="ltr">{selected.AdInstructorCivil || "—"}</b>
                </article>
                <article>
                  <span>رقم الهاتف</span>
                  <b dir="ltr">{selected.AdInstructorMobile || "—"}</b>
                </article>
                <article>
                  <span>المعرّف</span>
                  <b>{selected.AdInstructorId}</b>
                </article>
              </div>
              <div className="inspector-actions">
                <PrimaryButton onClick={() => edit(selected)}>
                  تعديل
                </PrimaryButton>
                <SecondaryButton
                  className="danger-action"
                  onClick={() => remove(selected.AdInstructorId)}
                >
                  <Trash2 /> حذف
                </SecondaryButton>
              </div>
            </>
          ) : (
            <div className="master-empty">
              <UserRound />
              <strong>اختر أستاذاً</strong>
              <span>التفاصيل ستظهر هنا.</span>
            </div>
          )}
        </aside>
      </div>
      {editorDrawer}
    </div>
  );
}
