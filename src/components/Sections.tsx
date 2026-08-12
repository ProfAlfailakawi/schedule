import React, { useEffect, useMemo, useState } from "react";
import { Building2, Landmark, Trash2 } from "lucide-react";
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
} from "./ui";
type Mode = "index" | "create" | "edit";
/** `embedded` means the academic console already supplies the page identity. */
export default function Sections({ embedded = false, actionSlot = null }: { embedded?: boolean; actionSlot?: HTMLElement | null }) {
  const [items, setItems] = useState<any[]>([]),
    [colleges, setColleges] = useState<any[]>([]),
    [mode, setMode] = useState<Mode>("index"),
    [editId, setEditId] = useState<number | null>(null),
    [selectedId, setSelectedId] = useState<number | null>(null),
    [collegeId, setCollegeId] = useState(""),
    [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [query, setQuery] = useState(""),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        fetch("/api/sections"),
        fetch("/api/colleges"),
      ]);
      if (!a.ok || !b.ok) throw 0;
      const data = await a.json();
      setItems(data);
      setColleges(sortByName(await b.json(), (row:any)=>row.AdCollegeName));
      setSelectedId((v) =>
        v && data.some((x: any) => x.AdSectionId === v)
          ? v
          : data[0]?.AdSectionId || null,
      );
    } catch {
      setError("فشل تحميل بيانات القسم العلمي");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const back = () => {
      setMode("index");
      setError(null);
    },
    create = () => {
      setEditId(null);
      setCollegeId("");
      setCode("");
      setName("");
      setMode("create");
      setError(null);
    },
    edit = (x: any) => {
      setEditId(x.AdSectionId);
      setCollegeId(String(x.AdCollegeId));
      setCode(x.AdSectionCode);
      setName(x.AdSectionName);
      setMode("edit");
      setError(null);
    };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!collegeId || !code.trim() || !name.trim()) {
      setError("الرجاء إدخال الحقول المطلوبة بالأحمر");
      return;
    }
    const r = await fetch(
        mode === "edit" ? `/api/sections/${editId}` : "/api/sections",
        {
          method: mode === "edit" ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            AdCollegeId: Number(collegeId),
            AdSectionCode: code.trim(),
            AdSectionName: name.trim(),
          }),
        },
      ),
      d = await r.json();
    if (!r.ok) {
      setError(d.error || "فشل حفظ بيانات القسم العلمي");
      return;
    }
    await load();
    back();
  };
  const remove = async (id: number) => {
    if (!confirm("هل أنت متأكد من حذف بيانات القسم العلمي؟")) return;
    const r = await fetch(`/api/sections/${id}`, { method: "DELETE" }),
      d = await r.json();
    if (!r.ok) {
      setError(d.error || "فشل حذف بيانات القسم العلمي");
      return;
    }
    setSelectedId(null);
    await load();
  };
  const collegeName = (id: number) =>
    colleges.find((c) => c.AdCollegeId === id)?.AdCollegeName || "";
  const filtered = useMemo(() => {
      const q = query.trim();
      return q
        ? items.filter((x) =>
            [x.AdSectionCode, x.AdSectionName, collegeName(x.AdCollegeId)].some(
              (v) => String(v).includes(q),
            ),
          )
        : items;
    }, [items, colleges, query]),
    selected = items.find((x) => x.AdSectionId === selectedId) || null;
  if (mode !== "index")
    return (
      <div className="content-stack editor-page">
        <PageTitle
          eyebrow="البيانات الأكاديمية"
          subtitle="القسم مرتبط بكليته"
        >
          {mode === "create" ? "إنشاء قسم علمي جديد" : "تعديل القسم العلمي"}
        </PageTitle>
        {error ? <Notice>{error}</Notice> : null}
        <Surface className="form-card smart-form">
          <div className="form-intro">
            <span>
              <Building2 />
            </span>
            <div>
              <strong>بيانات القسم العلمي</strong>
              <p>كلية · رمز · اسم</p>
            </div>
          </div>
          <form onSubmit={submit}>
            <div className="form-grid">
              <Field label="الكلية" required>
                <select
                  value={collegeId}
                  onChange={(e) => setCollegeId(e.target.value)}
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
              <Field label="رمز القسم العلمي" required>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                />
              </Field>
              <Field label="اسم القسم العلمي" required>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </Field>
            </div>
            <FormActions onBack={back} loading={loading} />
          </form>
        </Surface>
      </div>
    );
  return (
    <div className={`content-stack library-page catalog-inspector-page ${embedded ? "embedded-catalog" : ""}`}>
      {embedded ? (
        <EmbeddedAction slot={actionSlot}>
          <AddButton onClick={create}>إنشاء قسم</AddButton>
        </EmbeddedAction>
      ) : (
        <PageTitle
          eyebrow="الهيكل الأكاديمي"
          subtitle="المكتبة والتفاصيل في لوحة واحدة"
          action={<AddButton onClick={create}>إنشاء قسم</AddButton>}
        >
          الأقسام العلمية
        </PageTitle>
      )}
      {error ? <Notice>{error}</Notice> : null}
      <div className="catalog-workspace">
        <Surface className="catalog-master">
          <ListToolbar
            value={query}
            onChange={setQuery}
            count={filtered.length}
            placeholder="ابحث باسم القسم أو رمزه أو الكلية"
          />
          {loading ? (
            <SkeletonDeck />
          ) : filtered.length ? (
            <RecordDeck>
              {filtered.map((x) => (
                <RecordCard
                  key={x.AdSectionId}
                  onClick={() => setSelectedId(x.AdSectionId)}
                  className={selectedId === x.AdSectionId ? "selected" : ""}
                  icon={<Building2 />}
                  title={x.AdSectionName}
                  subtitle={
                    <span className="record-path">
                      <Landmark />
                      {collegeName(x.AdCollegeId)}
                    </span>
                  }
                  meta={<MetaPill label="رمز القسم" value={x.AdSectionCode} />}
                />
              ))}
            </RecordDeck>
          ) : (
            <EmptyState title="لا يوجد قسم مطابق" />
          )}
        </Surface>
        <aside className="academic-inspector">
          {selected ? (
            <>
              <div className="academic-inspector-icon">
                <Building2 />
              </div>
              <span className="surface-kicker">تفاصيل القسم</span>
              <h2>{selected.AdSectionName}</h2>
              <p>{collegeName(selected.AdCollegeId)}</p>
              <div className="inspector-facts">
                <article>
                  <span>رمز القسم</span>
                  <b>{selected.AdSectionCode}</b>
                </article>
                <article>
                  <span>الكلية</span>
                  <b>{collegeName(selected.AdCollegeId) || "—"}</b>
                </article>
                <article>
                  <span>المعرّف</span>
                  <b>{selected.AdSectionId}</b>
                </article>
              </div>
              <div className="inspector-actions">
                <PrimaryButton onClick={() => edit(selected)}>
                  تعديل
                </PrimaryButton>
                <SecondaryButton
                  className="danger-action"
                  onClick={() => remove(selected.AdSectionId)}
                >
                  <Trash2 /> حذف
                </SecondaryButton>
              </div>
            </>
          ) : (
            <div className="master-empty">
              <Building2 />
              <strong>اختر قسماً</strong>
              <span>التفاصيل ستظهر هنا.</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
