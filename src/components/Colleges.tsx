import React, { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, Building2, ChevronDown, Landmark, Route, Save, Search, Trash2, X } from "lucide-react";
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
  visualConfirm,
} from "./ui";
import { DEFAULT_TRAVEL_MINUTES, SAME_BUILDING_MINUTES } from "../utils/campusTravel";
import { sortByName } from "../utils/sorting";
type Mode = "index" | "create" | "edit";
/** `embedded` means the academic console already supplies the page identity. */
export default function Colleges({ embedded = false, actionSlot = null }: { embedded?: boolean; actionSlot?: HTMLElement | null }) {
  const [items, setItems] = useState<any[]>([]),
    [mode, setMode] = useState<Mode>("index"),
    [editId, setEditId] = useState<number | null>(null),
    [selectedId, setSelectedId] = useState<number | null>(null),
    [code, setCode] = useState(""),
    [name, setName] = useState(""),
    [query, setQuery] = useState(""),
    [error, setError] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [mobility, setMobility] = useState<any | null>(null),
    [mobilityOpen, setMobilityOpen] = useState(false),
    [mobilityBusy, setMobilityBusy] = useState(false),
    [mobilitySaved, setMobilitySaved] = useState(false),
    /**
     * A campus of twenty buildings makes a hundred and ninety pairs.
     * Scrolling for the two you came to change is not a task a person should be
     * given, so the matrix is filtered by name — either side matches.
     */
    [mobilityFind, setMobilityFind] = useState("");
  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/colleges");
      if (!r.ok) throw new Error();
      const data = sortByName(await r.json(), (row: any) => row.AdCollegeName);
      setItems(data);
      setSelectedId((v) =>
        v && data.some((x: any) => x.AdCollegeId === v)
          ? v
          : data[0]?.AdCollegeId || null,
      );
    } catch {
      setError("فشل تحميل بيانات الكلية");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!selectedId || mode !== "index" || !mobilityOpen) { setMobility(null); return; }
    let cancelled = false;
    (async () => {
      setMobilityBusy(true);
      setMobilitySaved(false);
      try {
        const r = await fetch(`/api/colleges/${selectedId}/mobility`);
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "تعذر تحميل حركة المباني");
        if (!cancelled) setMobility(d);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "تعذر تحميل حركة المباني");
      } finally { if (!cancelled) setMobilityBusy(false); }
    })();
    return () => { cancelled = true; };
  }, [selectedId, mode, mobilityOpen]);
  useEffect(() => setMobilityFind(""), [selectedId]);
  const openCreate = () => {
      setCode("");
      setName("");
      setEditId(null);
      setError(null);
      setMode("create");
    },
    openEdit = (x: any) => {
      setCode(x.AdCollegeCode);
      setName(x.AdCollegeName);
      setEditId(x.AdCollegeId);
      setError(null);
      setMode("edit");
    },
    back = () => {
      setMode("index");
      setError(null);
    };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!code.trim() || !name.trim()) {
      setError("الرجاء إدخال الحقول المطلوبة بالأحمر");
      return;
    }
    const r = await fetch(
        mode === "edit" ? `/api/colleges/${editId}` : "/api/colleges",
        {
          method: mode === "edit" ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            AdCollegeCode: code.trim(),
            AdCollegeName: name.trim(),
          }),
        },
      ),
      d = await r.json();
    if (!r.ok) {
      setError(d.error || "فشل حفظ بيانات الكلية");
      return;
    }
    await load();
    back();
  };
  const remove = async (id: number) => {
    if (!(await visualConfirm({ title: "حذف الكلية", message: "سيُحذف سجل الكلية من النظام.", confirmLabel: "حذف", tone: "danger", compact: true }))) return;
    const r = await fetch(`/api/colleges/${id}`, { method: "DELETE" }),
      d = await r.json();
    if (!r.ok) {
      setError(d.error || "فشل حذف بيانات الكلية");
      return;
    }
    setSelectedId(null);
    await load();
  };
  const mobilityPairs = useMemo(() => {
    const buildings = (mobility?.buildings || []).map((x: any) => String(x.code));
    const configured = mobility?.profile?.pairs || [];
    const out: Array<{ fromBuilding: string; toBuilding: string; minutes: number }> = [];
    for (let i = 0; i < buildings.length; i++) for (let j = i + 1; j < buildings.length; j++) {
      const a = buildings[i], b = buildings[j];
      const found = configured.find((p: any) => [String(p.fromBuilding).toLowerCase(), String(p.toBuilding).toLowerCase()].sort().join("|") === [a.toLowerCase(), b.toLowerCase()].sort().join("|"));
      out.push({ fromBuilding: a, toBuilding: b, minutes: Number(found?.minutes || mobility?.profile?.defaultTravelMinutes || DEFAULT_TRAVEL_MINUTES) });
    }
    return out;
  }, [mobility]);
  const updateTravelPair = (fromBuilding: string, toBuilding: string, minutes: number) => {
    setMobility((current: any) => {
      if (!current) return current;
      const key = [fromBuilding.toLowerCase(), toBuilding.toLowerCase()].sort().join("|");
      const pairs = [...(current.profile?.pairs || [])].filter((p: any) => [String(p.fromBuilding).toLowerCase(), String(p.toBuilding).toLowerCase()].sort().join("|") !== key);
      pairs.push({ fromBuilding, toBuilding, minutes: Math.max(1, Math.min(120, Number(minutes) || 1)) });
      return { ...current, profile: { ...current.profile, pairs } };
    });
    setMobilitySaved(false);
  };
  const saveMobility = async () => {
    if (!selectedId || !mobility) return;
    setMobilityBusy(true); setMobilitySaved(false); setError(null);
    try {
      const payload = {
        defaultTravelMinutes: Number(mobility.profile?.defaultTravelMinutes || DEFAULT_TRAVEL_MINUTES),
        sameBuildingMinutes: Number(mobility.profile?.sameBuildingMinutes || SAME_BUILDING_MINUTES),
        pairs: mobilityPairs,
      };
      const r = await fetch(`/api/colleges/${selectedId}/mobility`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "تعذر حفظ زمن الانتقال");
      setMobility((current: any) => current ? { ...current, profile: d } : current);
      setMobilitySaved(true);
    } catch (e: any) { setError(e.message || "تعذر حفظ زمن الانتقال"); }
    finally { setMobilityBusy(false); }
  };

  const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      return q
        ? sortByName(items.filter(
            (x) =>
              String(x.AdCollegeCode).toLowerCase().includes(q) ||
              String(x.AdCollegeName).toLowerCase().includes(q),
          ), (x: any) => x.AdCollegeName)
        : sortByName(items, (x: any) => x.AdCollegeName);
    }, [items, query]),
    selected =
      filtered.find((x) => x.AdCollegeId === selectedId) || filtered[0] || null,
    activeId = selected?.AdCollegeId ?? null;
  const editorDrawer = mode !== "index" ? (
      <CatalogFormDrawer onClose={back} label={mode === "create" ? "إنشاء كلية جديدة" : "تعديل بيانات الكلية"}>
        <PageTitle
          eyebrow="البيانات الأكاديمية"
          subtitle="قواعد الحفظ كما هي"
        >
          {mode === "create" ? "إنشاء كلية جديدة" : "تعديل بيانات الكلية"}
        </PageTitle>
        {error ? <Notice>{error}</Notice> : null}
        <Surface className="form-card smart-form">
          <div className="form-intro">
            <span>
              <Landmark />
            </span>
            <div>
              <strong>بيانات الكلية</strong>
              <p>رمز واسم معتمدان</p>
            </div>
          </div>
          <form onSubmit={submit}>
            <div className="form-grid">
              <Field label="رمز الكلية" required>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  aria-label="رمز الكلية"
                  autoComplete="off"
                  autoFocus
                  required
                />
              </Field>
              <Field label="اسم الكلية" required>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="اسم الكلية"
                  autoComplete="organization"
                  required
                />
              </Field>
            </div>
            <FormActions
              onBack={back}
              loading={loading}
              submitLabel={mode === "create" ? "إنشاء الكلية" : "حفظ التعديلات"}
            />
          </form>
        </Surface>
      </CatalogFormDrawer>
    ) : null;
  return (
    <div className={`content-stack library-page catalog-inspector-page visual-minimal ${embedded ? "embedded-catalog" : ""}`}>
      {embedded ? (
        <EmbeddedAction slot={actionSlot}>
          <AddButton onClick={openCreate}>إنشاء كلية</AddButton>
        </EmbeddedAction>
      ) : (
        <PageTitle
          eyebrow="الهيكل الأكاديمي"
          subtitle="المكتبة والتفاصيل في لوحة واحدة"
          action={<AddButton onClick={openCreate}>إنشاء كلية</AddButton>}
        >
          الكليات
        </PageTitle>
      )}
      {error ? <Notice>{error}</Notice> : null}
      <div className="catalog-workspace" aria-busy={loading}>
        <Surface className="catalog-master">
          <h2 className="sr-only">قائمة الكليات</h2>
          <ListToolbar
            value={query}
            onChange={setQuery}
            count={filtered.length}
            placeholder="ابحث باسم الكلية أو رمزها"
          />
          {loading ? (
            <SkeletonDeck />
          ) : filtered.length ? (
            <RecordDeck>
              {filtered.map((x) => (
                <RecordCard
                  key={x.AdCollegeId}
                  onClick={() => setSelectedId(x.AdCollegeId)}
                  className={activeId === x.AdCollegeId ? "selected" : ""}
                  icon={<Landmark />}
                  title={(
                    <>
                      {x.AdCollegeName}
                      {activeId === x.AdCollegeId ? <span className="sr-only">، محددة</span> : null}
                    </>
                  )}
                  subtitle="كيان أكاديمي"
                  meta={<MetaPill label="الرمز" value={x.AdCollegeCode} />}
                />
              ))}
            </RecordDeck>
          ) : (
            <EmptyState
              title={query ? "لا توجد كلية مطابقة" : "لا توجد كليات بعد"}
              detail={query ? "جرّب عبارة أخرى أو امسح البحث." : "أنشئ الكلية الأولى لبناء الهيكل الأكاديمي."}
              action={query ? <SecondaryButton onClick={() => setQuery("")}>مسح البحث</SecondaryButton> : undefined}
            />
          )}
        </Surface>
        <aside className="academic-inspector" aria-label="تفاصيل الكلية المحددة" aria-live="polite">
          {selected ? (
            <>
              <div className="academic-inspector-icon">
                <Landmark />
              </div>
              <span className="surface-kicker">تفاصيل الكلية</span>
              <h2>{selected.AdCollegeName}</h2>
              <p>مرتبط بالأقسام والمقررات.</p>
              <div className="inspector-facts">
                <article>
                  <span>رمز الكلية</span>
                  <b>{selected.AdCollegeCode}</b>
                </article>
                <article>
                  <span>المعرّف</span>
                  <b>{selected.AdCollegeId}</b>
                </article>
              </div>
              <section className="campus-mobility-card" aria-labelledby="college-mobility-title">
                <button
                  type="button"
                  className="campus-mobility-head"
                  onClick={() => setMobilityOpen((open) => !open)}
                  aria-expanded={mobilityOpen}
                  aria-controls="college-mobility-settings"
                  style={{ width: "100%", textAlign: "start", marginBottom: mobilityOpen ? undefined : 0 }}
                >
                  <span><Route /></span>
                  <div>
                    <strong id="college-mobility-title">رادار الانتقال بين المباني</strong>
                    <p>المباني تُكتشف تلقائياً · حدّد زمن المشي مرة واحدة</p>
                  </div>
                  <ChevronDown
                    aria-hidden="true"
                    style={{ marginInlineStart: "auto", transform: mobilityOpen ? "rotate(180deg)" : undefined }}
                  />
                </button>
                {mobilityOpen ? (
                  <div id="college-mobility-settings">
                {mobilityBusy && !mobility ? <div className="mobility-loading">جاري قراءة مباني الكلية…</div> : null}
                {mobility ? <>
                  <div className="detected-buildings">
                    {(mobility.buildings || []).slice(0, 8).map((b: any) => <span key={b.code}><Building2 /> مبنى {b.code}<small>{b.count} استخدام تاريخي</small></span>)}
                  </div>
                  <div className="mobility-defaults">
                    <label><span>افتراضي بين مبنيين غير مضبوطين</span><div><input type="number" min="1" max="120" value={mobility.profile?.defaultTravelMinutes || DEFAULT_TRAVEL_MINUTES} onChange={e=>{setMobility((m:any)=>({...m,profile:{...m.profile,defaultTravelMinutes:Number(e.target.value)}}));setMobilitySaved(false);}}/><b>دقيقة</b></div></label>
                    <label><span>داخل المبنى نفسه</span><div><input type="number" min="0" max="30" value={mobility.profile?.sameBuildingMinutes || SAME_BUILDING_MINUTES} onChange={e=>{setMobility((m:any)=>({...m,profile:{...m.profile,sameBuildingMinutes:Number(e.target.value)}}));setMobilitySaved(false);}}/><b>دقيقة</b></div></label>
                  </div>
                  {mobilityPairs.length ? (() => {
                    const needle = mobilityFind.trim().toLowerCase();
                    const shown = needle
                      ? mobilityPairs.filter(pair =>
                          pair.fromBuilding.toLowerCase().includes(needle) ||
                          pair.toBuilding.toLowerCase().includes(needle))
                      : mobilityPairs;
                    return (
                      <>
                        <label className="travel-search">
                          <Search aria-hidden="true" />
                          <input
                            value={mobilityFind}
                            onChange={e => setMobilityFind(e.target.value)}
                            placeholder="ابحث عن مبنى"
                            aria-label="ابحث عن مبنى"
                          />
                          <b>{shown.length}/{mobilityPairs.length}</b>
                          {mobilityFind ? (
                            <button type="button" data-guide-ignore="مسح بحث حركة المباني فقط" onClick={() => setMobilityFind("")} aria-label="مسح البحث" title="مسح"><X aria-hidden="true" /></button>
                          ) : null}
                        </label>
                        {shown.length ? (
                          <div className="travel-matrix">
                            {shown.map(pair => <label key={`${pair.fromBuilding}-${pair.toBuilding}`}><span className="travel-pair-name"><b>{pair.fromBuilding}</b><ArrowLeftRight aria-hidden="true" /><b>{pair.toBuilding}</b></span><div><input aria-label={`زمن الانتقال بين ${pair.fromBuilding} و${pair.toBuilding}`} type="number" min="1" max="120" value={pair.minutes} onChange={e=>updateTravelPair(pair.fromBuilding,pair.toBuilding,Number(e.target.value))}/><b>دقيقة</b></div></label>)}
                          </div>
                        ) : <p className="mobility-empty">لا مبنى يطابق «{mobilityFind}».</p>}
                      </>
                    );
                  })() : <p className="mobility-empty">يظهر ضبط المسافات تلقائياً بعد أن يكتشف النظام مبنيين أو أكثر من جداول هذه الكلية.</p>}
                  <button type="button" className="mobility-save" onClick={saveMobility} disabled={mobilityBusy}><Save /> {mobilityBusy ? "جاري الحفظ…" : mobilitySaved ? "تم حفظ خريطة الحركة" : "حفظ أزمنة الانتقال"}</button>
                </> : null}
                  </div>
                ) : null}
              </section>
              <div className="inspector-actions">
                <PrimaryButton onClick={() => openEdit(selected)}>
                  تعديل
                </PrimaryButton>
                <SecondaryButton
                  data-guide-ignore="إجراء حذف حساس داخل شاشة الإدارة ويستخدم تأكيد الشاشة نفسه"
                  className="danger-action"
                  onClick={() => remove(selected.AdCollegeId)}
                >
                  <Trash2 /> حذف
                </SecondaryButton>
              </div>
            </>
          ) : (
            <div className="master-empty">
              <Landmark />
              <strong>اختر كلية</strong>
              <span>التفاصيل ستظهر هنا.</span>
            </div>
          )}
        </aside>
      </div>
      {editorDrawer}
    </div>
  );
}
