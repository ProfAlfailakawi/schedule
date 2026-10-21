import React, { useEffect, useState } from "react";
import { Check, DoorOpen, Pencil, Plus } from "lucide-react";
import { AR, countOf } from "../utils/arabicCount";
import { Notice, PrimaryButton, SecondaryButton, Surface } from "./ui";

async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "تعذر إكمال العملية");
  return data;
}

export default function LocationRoomTypeManager({ demoReadOnly = false, onTypesChange }: { demoReadOnly?: boolean; onTypesChange?: (types: string[]) => void }) {
  const [types, setTypes] = useState<string[]>([]), [newType, setNewType] = useState("");
  const [editing, setEditing] = useState<string | null>(null), [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const refresh = async () => { const result = await request("/api/location-room-types"); const next = Array.isArray(result.types) ? result.types.map(String) : []; setTypes(next); onTypesChange?.(next); };
  useEffect(() => { void refresh().catch((e: any) => setError(e?.message || "تعذر تحميل أنواع القاعات")); }, []);
  const add = async () => {
    const name = newType.normalize("NFKC").trim(); if (!name) return;
    setBusy(true); setError(""); setNotice("");
    try { const result = await request("/api/admin/location-room-types", { method: "POST", body: JSON.stringify({ name }) }); const next = result.types || []; setTypes(next); onTypesChange?.(next); setNewType(""); setNotice(`أُضيف نوع القاعة «${name}»`); }
    catch (e: any) { setError(e?.message || "تعذرت إضافة نوع القاعة"); } finally { setBusy(false); }
  };
  const rename = async (oldName: string) => {
    const name = draft.normalize("NFKC").trim(); if (!name) return;
    setBusy(true); setError(""); setNotice("");
    try { const result = await request(`/api/admin/location-room-types/${encodeURIComponent(oldName)}`, { method: "PUT", body: JSON.stringify({ name }) }); const next = result.types || []; setTypes(next); onTypesChange?.(next); setEditing(null); setDraft(""); setNotice(`تم تغيير «${oldName}» إلى «${name}» وتحديث ${countOf(Number(result.updatedRooms || 0), AR.room)} و${countOf(Number(result.updatedCourses || 0), AR.course)} مرتبطة.`); }
    catch (e: any) { setError(e?.message || "تعذر تغيير نوع القاعة"); } finally { setBusy(false); }
  };
  return <Surface className="location-type-manager">
    <div className="location-type-manager-heading"><span><DoorOpen/></span><div><h2>أنواع القاعات</h2><p>أضف النوع مرة واحدة، ثم اختره عند إضافة القاعات أو ربط المقرر.</p></div></div>
    {error ? <Notice>{error}</Notice> : null}{notice ? <Notice>{notice}</Notice> : null}
    <div className="location-type-list">{types.map(type=><div className="location-type-row" key={type}>{editing===type?<><input aria-label={`الاسم الجديد لنوع ${type}`} value={draft} maxLength={60} autoFocus onChange={event=>setDraft(event.target.value)}/><SecondaryButton type="button" data-guide-ignore="إدارة أنواع القاعات متاحة للمدير الرئيسي فقط" disabled={!draft.trim()||busy||demoReadOnly} onClick={()=>void rename(type)}><Check/>حفظ الاسم</SecondaryButton><button type="button" data-guide-ignore="إلغاء تحرير اسم نوع القاعة" className="location-type-cancel" onClick={()=>{setEditing(null);setDraft("");}}>إلغاء</button></>:<><strong>{type}</strong><button type="button" data-guide-ignore="تغيير اسم نوع القاعة" className="location-type-edit" disabled={busy||demoReadOnly} aria-label={`تغيير اسم ${type}`} onClick={()=>{setEditing(type);setDraft(type);}}><Pencil/>تغيير الاسم</button></>}</div>)}</div>
    <div className="location-type-add"><input aria-label="نوع قاعة جديد" placeholder="مثال: مختبر كيمياء" value={newType} maxLength={60} onChange={event=>setNewType(event.target.value)}/><PrimaryButton type="button" data-guide-ignore="إضافة نوع قاعة جديد للمدير الرئيسي" disabled={!newType.trim()||busy||demoReadOnly} onClick={()=>void add()}><Plus/>إضافة نوع</PrimaryButton></div>
    <small className="location-type-hint">تغيير الاسم يحدّث القاعات والمقررات التي تستخدمه.</small>
  </Surface>;
}
