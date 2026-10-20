import assert from "node:assert/strict";
import fs from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import TermSelect from "../src/components/TermSelect";
import Courses from "../src/components/Courses";
import ScopeAskBar, { trimScopeSelects, type ScopeAskSelect } from "../src/components/ScopeAskBar";
import { visibleTermIds } from "../src/utils/scopedTerms";
import { currentTermId } from "../src/utils/termSequence";
import { invitationHref, isInvitationHash, parseInvitationHash, photoInvitationHref } from "../src/utils/invitationLink";

let passed = 0;
function check(label: string, run: () => void) { run(); console.log(`✓ ${label}`); passed++; }
const term = { AdTermId: 10, AdTermName: "الفصل الأول 2026/2027" };
const single = [{ AdCollegeId: 1, AdSectionId: 11, AdSectionName: "الحاسب" }];
const sites = [...single, { AdCollegeId: 2, AdSectionId: 21, AdSectionName: "الحاسب" }];
const many = [...sites, { AdCollegeId: 1, AdSectionId: 12, AdSectionName: "الرياضيات" }];
const selects: ScopeAskSelect[] = [
  { key: "college", label: "الكلية", value: 1, placeholder: "اختر الكلية", options: [{ value: 1, label: "الموقع الأول" }, { value: 2, label: "الموقع الثاني" }] },
  { key: "section", label: "القسم", value: 11, placeholder: "اختر القسم", options: [{ value: 11, label: "الحاسب" }, { value: 12, label: "الرياضيات" }] },
  { key: "term", label: "الفصل", value: 10, placeholder: "اختر الفصل", options: [{ value: 10, label: term.AdTermName }] },
];
const render = (scopes: any[], admin = false) => renderToStaticMarkup(<ScopeAskBar ask="" onAskChange={() => {}} onAskSubmit={() => {}} askPlaceholder="بحث" label="النطاق" selects={trimScopeSelects(selects, scopes, admin)} onSelect={() => {}} />);
check("قسم في كلية واحدة: اسم الفصل ثابت، ولا منتقي كلية أو قسم", () => {
  const html = render(single); assert(!html.includes("<select")); assert(html.includes(term.AdTermName));
});
check("قسم متعدد المواقع: منتقي المواقع وحده مع الفصل الثابت", () => {
  const html = render(sites); assert.equal((html.match(/<select/g) || []).length, 1); assert(html.includes("الموقع الأول") && html.includes("الموقع الثاني")); assert(!html.includes("اختر القسم"));
});
check("متعدد الأقسام والإدارة: تبقى خيارات الكلية والقسم", () => {
  for (const html of [render(many), render(single, true)]) { assert.equal((html.match(/<select/g) || []).length, 2); assert(html.includes("الرياضيات")); }
});
check("سجل المقررات يخفي مرشحات القسم الواحد ويُبقي مرشحات الإدارة", () => {
  const own = renderToStaticMarkup(<Courses scopes={single} isAdmin={false} />);
  assert(!own.includes('aria-label="تصفية بالكلية"') && !own.includes('aria-label="تصفية بالقسم"'));
  const admin = renderToStaticMarkup(<Courses scopes={single} isAdmin={true} />);
  assert(admin.includes('aria-label="تصفية بالكلية"') && admin.includes('aria-label="تصفية بالقسم"'));
});
check("فصلان حقيقيان: يظهر المنتقي", () => {
  const html = renderToStaticMarkup(<TermSelect value={10} onValueChange={() => {}}><option value="">اختر</option><option value={10}>الحالي</option><option value={9}>السابق</option></TermSelect>);
  assert(html.includes("<select")); assert(html.includes("الحالي") && html.includes("السابق"));
});
check("قائمة لم تتحقق بعد: لا منتقي بخيارات خام", () => {
  const html = renderToStaticMarkup(<TermSelect value={0} onValueChange={() => {}}><option value="">اختر الفصل</option></TermSelect>);
  assert(!html.includes("<select")); assert(html.includes("الفصول غير متاحة"));
});
check("رابط الدعوة يملأ حقلي الدخول ويمسح بياناته من العنوان بعد القراءة", () => {
  const login = fs.readFileSync("src/components/Login.tsx", "utf8"), invitation = fs.readFileSync("src/components/AccountInvitation.tsx", "utf8");
  const href = invitationHref("https://schedule-kw.com/", "tsbdept+one", "1234&5678");
  const hash = new URL(href).hash;
  assert(isInvitationHash(hash));
  assert.deepEqual(parseInvitationHash(hash), { username: "tsbdept+one", password: "1234&5678" });
  assert.deepEqual(parseInvitationHash("#invite&username=tsbdept&password=12345678"), { username: "tsbdept", password: "12345678" });
  assert.equal(photoInvitationHref("https://schedule-kw.com/", "tsbdept", "12345678"), "https://schedule-kw.com/i/tsbdept");
  assert.equal(photoInvitationHref("https://schedule-kw.com/", "tsbdept", "different"), null);
  assert(login.includes("parseInvitationHash(hash)") && login.includes("setUsername(invite.username)") && login.includes("setPassword(invite.password)"));
  assert(login.includes('window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`)') && invitation.includes("invitationHref(SITE, login, temporaryPassword)"));
  assert(invitation.includes('const displayUrl = "schedule-kw.com"') && invitation.includes('<footer><a href={url}') && invitation.includes('clipboard.writeText(url)'));
});
check("أحدث فصل أُنشئ يبقى فارغًا، والفصل الأقدم الفارغ يختفي", () => {
  const terms = [{ AdTermId: 11, AdTermName: "الفصل الثاني 2026/2027", AdTermClosed: false }, { ...term, AdTermClosed: false }, { AdTermId: 9, AdTermName: "الفصل الثاني 2025/2026", AdTermClosed: true }];
  const current = currentTermId(terms, Date.UTC(2026, 9, 19)); assert.equal(current, 10); assert.deepEqual(visibleTermIds([11, 10, 9], new Map([[9, 3]]), 11), [11, 9]);
});
check("الخادم يبقي أحدث فصل ويخفي مركز الذكاء القسم بحسب شكل النطاق", () => {
  const server = fs.readFileSync("server.ts", "utf8"); assert(server.includes("visibleTermIds(terms.map(term => Number(term.AdTermId)), counts, newest)"));
  const intel = fs.readFileSync("src/components/IntelligenceWorkspace.tsx", "utf8"); assert(intel.includes("hideSection={hidesSection(scopeShape(scopes, isPowerAdmin))}")); assert(intel.includes('compareTermOptions.length > 1 ? [{ value: "compare"'));
});
check("الرادار يستدعي hook الفصول قبل خروج شاشة التحميل", () => {
  const src = fs.readFileSync("src/components/RegistrationRehearsal.tsx", "utf8");
  const hook = src.indexOf("const scopedTerms = useScopedTerms"); const exit = src.indexOf("if (!data && !error && !termPick) return"); assert(hook >= 0 && hook < exit);
});
console.log(`${passed} scope control checks passed`);
