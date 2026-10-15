/**
 * ── حسابات رؤساء الأقسام: خطةٌ تُعرض قبل أن تُكتب ────────────────────────────
 *
 * لكل قسمٍ حسابٌ واحد بصفة «رئيس القسم العلمي» واسمُه `<بادئة>head`. والبادئة
 * تُؤخذ من حساب القسم القائم `<بادئة>dept` (مثل Techdept ← Techhead)، فيعرف
 * المدير الحسابين زوجاً. وإن تكرّرت البادئة نفسها في كليتين، أو صادف الاسمُ
 * حساباً قائماً لقسمٍ آخر، أُلحق بالاسم رمزُ الكلية حتى لا يتصادما.
 *
 * والخطة وظيفةٌ خالصة: لا تقرأ قاعدة بيانات ولا تكتب. الخادم يمرّر إليها ما
 * قرأه، ويعرضها كما هي، ثم يُنشئ ما وُسم «create» وحده. وتكرارُ التشغيل لا
 * يُنشئ شيئاً مرتين: القسم الذي له رئيسٌ (بالصفة والنطاق، أو بالاسم المقترح
 * نفسه) يُعدّ موجوداً ويُترك كما هو.
 *
 * ولا كلمة سرّ هنا أبداً: الحساب يُنشأ موقوفاً وبلا كلمة سر، فلا يدخل به
 * أحد حتى يعيّن المدير كلمته من شاشة المستخدمين ويفعّله.
 */

export interface HeadPlanUser {
  SystemUserId: number;
  Name?: string;
  SystemUserLogin: string;
  Role?: string;
  IsDeleted?: boolean;
  IsActive?: boolean;
  SystemUserPass?: string;
  SystemUserPassVault?: string;
}
export interface HeadPlanAssign { SystemUserId: number; AdCollegeId: number; AdSectionId: number }
export interface HeadPlanCollege { AdCollegeId: number; AdCollegeCode?: string; AdCollegeName: string }
export interface HeadPlanSection { AdSectionId: number; AdCollegeId: number; AdSectionCode?: string; AdSectionName: string }

/** review: لا يُنشأ شيء حتى يحسم المدير أمراً مبهماً (انظر note). */
export type HeadPlanStatus = "create" | "exists" | "review";
export interface HeadPlanRow {
  collegeId: number;
  collegeName: string;
  sectionId: number;
  sectionName: string;
  /** حساب القسم القائم الذي اشتُقّت منه البادئة، إن وُجد. */
  deptLogin: string | null;
  proposedLogin: string;
  proposedName: string;
  status: HeadPlanStatus;
  /** الحساب الموجود حين تكون الحالة «exists». */
  existingUserId?: number;
  existingLogin?: string;
  /** تنبيهٌ للمدير: بادئةٌ بديلة، أو حسابٌ بالاسم نفسه صفتُه أو نطاقه غير متوقَّعين. */
  note?: string;
  /** حساب المرشد الواحد يشمل الأقسام المتناظرة في كليات البنين والبنات. */
  collegeIds?: number[];
  collegeNames?: string[];
  sectionIds?: number[];
  scopeAssignments?: Array<{ AdCollegeId: number; AdSectionId: number }>;
  /** حسابات قديمة مكررة للقسم نفسه؛ لا تُدمج إلا بعد تحقق الخادم من أمانها. */
  duplicateUserIds?: number[];
  consolidationReady?: boolean;
}

const DEPT_SUFFIX = /dept$/i;
export const DEPARTMENT_HEAD_ROLE = "departmentHead";
export const ADVISOR_ROLE = "advisor";

/** ما يتغيّر بين حسابات رؤساء الأقسام وحسابات الإرشاد: لاحقة الاسم والصفة وعنوانه. */
export interface AccountKind { suffix: string; role: string; namePrefix: string }
export const HEAD_KIND: AccountKind = { suffix: "head", role: DEPARTMENT_HEAD_ROLE, namePrefix: "رئيس" };
export const ADVISOR_KIND: AccountKind = { suffix: "advisor", role: ADVISOR_ROLE, namePrefix: "إرشاد" };

function lower(value: string) { return String(value || "").trim().toLowerCase(); }
function accountPrefix(value: string) {
  return String(value || "").replace(/^(?:01)+/i, "");
}

/** رمز الكلية صالحاً لاسم دخول: حروف وأرقام لاتينية فقط، وإلا رقمُها. */
function collegeTag(college: HeadPlanCollege | undefined, collegeId: number): string {
  const code = String(college?.AdCollegeCode || "").replace(/[^A-Za-z0-9]/g, "");
  return code || String(collegeId);
}

export function planAdvisorAccounts(input: Parameters<typeof planDepartmentHeadAccounts>[0]): HeadPlanRow[] {
  const users = input.users.filter(user => !user.IsDeleted);
  const userById = new Map(users.map(user => [Number(user.SystemUserId), user]));
  const collegeById = new Map(input.colleges.map(college => [Number(college.AdCollegeId), college]));
  const normalizeSection = (value: string) => String(value || "")
    .normalize("NFKD").replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/^\s*قسم\s+/i, "").replace(/\s+/g, " ").trim().toLowerCase();
  const sectionNameByKey = new Map<string, string>();
  const grouped = new Map<string, HeadPlanSection[]>();
  const ambiguousKeys = new Set<string>();
  for (const section of input.sections) {
    if (!collegeById.has(Number(section.AdCollegeId))) continue;
    const normalized = normalizeSection(section.AdSectionName);
    if (!normalized) continue;
    const inCollege = `${Number(section.AdCollegeId)}:${normalized}`;
    const peers = input.sections.filter(candidate => Number(candidate.AdCollegeId) === Number(section.AdCollegeId) && normalizeSection(candidate.AdSectionName) === normalized);
    const codes = new Set(peers.map(candidate => String(candidate.AdSectionCode || "").trim().toLowerCase()));
    /* قد يتكرر سجل القسم في الكلية نفسها بالاسم والرمز نفسيهما (مثل 49 و74).
       يظل قسماً واحداً للإرشاد، وتُضم كل سجلاته إلى نطاق الحساب. اختلاف
       الرمز أو غيابه في سجل مكرر يبقيه ملتبساً حتى يراجعه المدير. */
    const ambiguousPeers = peers.length > 1 && (codes.size !== 1 || codes.has(""));
    const key = ambiguousPeers ? `${inCollege}:${Number(section.AdSectionId)}` : normalized;
    if (ambiguousPeers) ambiguousKeys.add(key);
    const list = grouped.get(key) || [];
    list.push(section); grouped.set(key, list);
    sectionNameByKey.set(key, String(section.AdSectionName || "").trim());
  }

  const sectionGroups = Array.from(grouped.entries()).map(([key, rows]) => {
    const ambiguousSection = ambiguousKeys.has(key);
    const sectionIds = new Set(rows.map(row => Number(row.AdSectionId)));
    const collegeIds = new Set(rows.map(row => Number(row.AdCollegeId)));
    const scopeAssignments = rows.map(row => ({ AdCollegeId: Number(row.AdCollegeId), AdSectionId: Number(row.AdSectionId) }));
    const assignedAdvisors = new Set<number>();
    for (const assign of input.assigns) {
      if (!sectionIds.has(Number(assign.AdSectionId)) || !collegeIds.has(Number(assign.AdCollegeId))) continue;
      const user = userById.get(Number(assign.SystemUserId));
      if (user && user.Role === ADVISOR_ROLE) assignedAdvisors.add(Number(user.SystemUserId));
    }

    const sortedRows = [...rows].sort((a,b) => Number(a.AdCollegeId) - Number(b.AdCollegeId) || Number(a.AdSectionId) - Number(b.AdSectionId));
    const departmentLoginCounts = new Map<string, number>();
    for (const assign of input.assigns) {
      if (!sectionIds.has(Number(assign.AdSectionId)) || !collegeIds.has(Number(assign.AdCollegeId))) continue;
      const owner = userById.get(Number(assign.SystemUserId));
      if (owner && DEPT_SUFFIX.test(String(owner.SystemUserLogin || ""))) {
        const prefix = String(owner.SystemUserLogin).replace(DEPT_SUFFIX, "");
        departmentLoginCounts.set(prefix, (departmentLoginCounts.get(prefix) || 0) + 1);
      }
    }
    const codes = sortedRows.map(row => accountPrefix(String(row.AdSectionCode || "").replace(/[^A-Za-z0-9]/g, ""))).filter(Boolean);
    const rankedDeptPrefixes = Array.from(departmentLoginCounts.entries()).sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const prefixConflict = rankedDeptPrefixes.length > 1 && rankedDeptPrefixes[0][1] === rankedDeptPrefixes[1][1];
    const chosenDeptPrefix = !prefixConflict ? rankedDeptPrefixes[0]?.[0] : undefined;
    const derivedPrefix = accountPrefix(chosenDeptPrefix || codes[0] || `s${sortedRows[0]?.AdSectionId}`)
      .replace(/^0+(?=\d)/, "") || `s${sortedRows[0]?.AdSectionId}`;
    const semanticPrefixes: Record<string, string> = {
      "التربيه الاسلاميه": "Islamic",
      "وحده اللغه الانجليزيه": "EnglishUnit",
      "وحده الكهرباء": "Electric",
    };
    const prefix = !chosenDeptPrefix && (/^\d/.test(derivedPrefix) || /^s\d+$/i.test(derivedPrefix))
      ? semanticPrefixes[key] || derivedPrefix
      : derivedPrefix;
    const proposedLogin = `${prefix}${ADVISOR_KIND.suffix}`;
    const scopedAdvisors = Array.from(assignedAdvisors).map(id => userById.get(id)!).filter(Boolean);
    const accountScopeCount = (id: number) => input.assigns.filter(assign => Number(assign.SystemUserId) === id).length;
    const duplicateUserIds = scopedAdvisors.map(user => Number(user.SystemUserId));
    const canonical = scopedAdvisors.find(user => String(user.SystemUserLogin).toLowerCase() === proposedLogin.toLowerCase())
      || [...scopedAdvisors].sort((a,b) => Number(a.SystemUserId) - Number(b.SystemUserId))[0];
    const colleges = Array.from(collegeIds).sort((a,b) => a-b).map(id => collegeById.get(id)!).filter(Boolean);
    const first = sortedRows[0];
    const row: HeadPlanRow = {
      collegeId: Number(first.AdCollegeId), collegeName: colleges.map(college => String(college.AdCollegeName)).join("، "),
      sectionId: Number(first.AdSectionId), sectionName: sectionNameByKey.get(key) || String(first.AdSectionName || ""),
      deptLogin: chosenDeptPrefix ? `${chosenDeptPrefix}dept` : null,
      proposedLogin, proposedName: `${ADVISOR_KIND.namePrefix} ${String(first.AdSectionName || "").trim()}`.trim(),
      status: prefixConflict || ambiguousSection ? "review" : scopedAdvisors.length ? "exists" : "create",
      collegeIds: Array.from(collegeIds).sort((a,b) => a-b), collegeNames: colleges.map(college => String(college.AdCollegeName)),
      sectionIds: Array.from(sectionIds).sort((a,b) => a-b), scopeAssignments, duplicateUserIds,
    };
    if (scopedAdvisors.length === 1) {
      row.existingUserId = Number(canonical!.SystemUserId); row.existingLogin = String(canonical!.SystemUserLogin);
      const currentAssignments = input.assigns.filter(assign => Number(assign.SystemUserId) === Number(canonical!.SystemUserId));
      if (currentAssignments.length !== scopeAssignments.length) row.note = "الحساب موجود؛ سيُستكمل نطاقه ليشمل كليات القسم المتناظرة";
      if (canonical!.SystemUserLogin.toLowerCase() !== proposedLogin.toLowerCase()) row.note = `${row.note ? `${row.note}؛ ` : ""}اسم الحساب المقترح الموحد: ${proposedLogin}`;
      if (prefixConflict) row.note = `${row.note ? `${row.note}؛ ` : ""}تعارضت بادئات حسابات الأقسام؛ احتفظنا بالحساب الحالي دون إعادة تسميته`;
      if (ambiguousSection) row.note = `${row.note ? `${row.note}؛ ` : ""}اسم القسم مكرر داخل الكلية برموز مختلفة؛ يلزم مراجعة النطاق`;
    } else if (scopedAdvisors.length > 1) {
      row.existingUserId = Number(canonical!.SystemUserId); row.existingLogin = String(canonical!.SystemUserLogin);
      const targetKeys = new Set(scopeAssignments.map(assign => `${assign.AdCollegeId}:${assign.AdSectionId}`));
      const scopesAreLocal = scopedAdvisors.every(user => input.assigns
        .filter(assign => Number(assign.SystemUserId) === Number(user.SystemUserId))
        .every(assign => targetKeys.has(`${Number(assign.AdCollegeId)}:${Number(assign.AdSectionId)}`)));
      const credentialsAreBlank = scopedAdvisors.every(user => !String(user.SystemUserPass || "").trim() && !String(user.SystemUserPassVault || "").trim());
      const loginOwner = users.find(user => String(user.SystemUserLogin).toLowerCase() === proposedLogin.toLowerCase());
      const loginIsLocal = !loginOwner || duplicateUserIds.includes(Number(loginOwner.SystemUserId));
      row.consolidationReady = !prefixConflict && !ambiguousSection && scopesAreLocal && credentialsAreBlank && loginIsLocal && scopedAdvisors.every(user => !user.IsActive);
      row.status = "review";
      row.note = "توجد حسابات مرشدين مكررة لهذا القسم؛ يلزم توحيدها مع الحفاظ على سجل الحسابات";
      if (!row.consolidationReady) row.note += loginIsLocal ? "؛ يلزم مراجعة الحسابات النشطة أو التي لها كلمة سر أو نطاق آخر يدوياً" : "؛ اسم الدخول المقترح متعارض مع حساب آخر";
    } else {
      if (prefixConflict) row.note = "تعارضت بادئات حسابات الأقسام بين الكليات؛ حدّد اسم الدخول الموحد قبل إنشاء الحساب";
      if (ambiguousSection) row.note = `${row.note ? `${row.note}؛ ` : ""}اسم القسم مكرر داخل الكلية برموز مختلفة؛ يلزم مراجعة النطاق`;
      const existing = users.find(user => String(user.SystemUserLogin).toLowerCase() === proposedLogin.toLowerCase());
      if (existing && !prefixConflict && !ambiguousSection) {
        row.status = "exists"; row.existingUserId = Number(existing.SystemUserId); row.existingLogin = String(existing.SystemUserLogin);
        row.note = "الحساب موجود بلا نطاق لهذا القسم؛ راجعه قبل الإسناد";
      }
    }
    return row;
  });
  const loginGroups = new Map<string, HeadPlanRow[]>();
  for (const row of sectionGroups) {
    const key = lower(row.proposedLogin);
    const list = loginGroups.get(key) || [];
    list.push(row); loginGroups.set(key, list);
  }
  for (const [login, rows] of loginGroups) {
    if (rows.length < 2) continue;
    for (const row of rows) {
      row.status = "review";
      row.consolidationReady = false;
      row.note = `${row.note ? `${row.note}؛ ` : ""}اسم الدخول ${login} يتكرر لقسمين مختلفين؛ يلزم تحديد بادئة فريدة`;
    }
  }
  return sectionGroups;
}

export function planDepartmentHeadAccounts(input: {
  users: HeadPlanUser[];
  assigns: HeadPlanAssign[];
  colleges: HeadPlanCollege[];
  sections: HeadPlanSection[];
}, kind: AccountKind = HEAD_KIND): HeadPlanRow[] {
  const users = input.users.filter(user => !user.IsDeleted);
  const userById = new Map(users.map(user => [Number(user.SystemUserId), user]));
  const userByLogin = new Map(users.map(user => [lower(user.SystemUserLogin), user]));
  const collegeById = new Map(input.colleges.map(college => [Number(college.AdCollegeId), college]));
  const sectionKey = (collegeId: number, sectionId: number) => `${collegeId}:${sectionId}`;

  const usersBySection = new Map<string, HeadPlanUser[]>();
  for (const row of input.assigns) {
    const sectionId = Number(row.AdSectionId);
    if (!(sectionId > 0)) continue;
    const user = userById.get(Number(row.SystemUserId));
    if (!user) continue;
    const key = sectionKey(Number(row.AdCollegeId), sectionId);
    const list = usersBySection.get(key) || [];
    if (!list.includes(user)) list.push(user);
    usersBySection.set(key, list);
  }

  const sectionsByUser = new Map<number, number>();
  for (const list of usersBySection.values()) for (const user of list) sectionsByUser.set(Number(user.SystemUserId), (sectionsByUser.get(Number(user.SystemUserId)) || 0) + 1);

  const sections = input.sections
    .filter(section => collegeById.has(Number(section.AdCollegeId)))
    .sort((a, b) => Number(a.AdCollegeId) - Number(b.AdCollegeId) || Number(a.AdSectionId) - Number(b.AdSectionId));

  /* الخطوة الأولى: البادئة لكل قسم، ومن يرأسه اليوم إن وُجد. */
  const drafts = sections.map(section => {
    const collegeId = Number(section.AdCollegeId), sectionId = Number(section.AdSectionId);
    const scoped = usersBySection.get(sectionKey(collegeId, sectionId)) || [];
    const dept = scoped
      .filter(user => DEPT_SUFFIX.test(String(user.SystemUserLogin || "").trim()))
      .sort((a, b) => Number(a.SystemUserId) - Number(b.SystemUserId))[0];
    const deptLogin = dept ? String(dept.SystemUserLogin).trim() : null;
    /* Use the department's own short code when no `<prefix>dept` account exists.
       This keeps advisor identities predictable (Math → Mathadvisor) without
       requiring a placeholder account or silently choosing an unrelated ID. */
    const sectionCode = accountPrefix(String(section.AdSectionCode || "").replace(/[^A-Za-z0-9]/g, ""));
    const sourcePrefix = deptLogin ? deptLogin.replace(DEPT_SUFFIX, "") : sectionCode;
    /* A section code such as 0109 is institutional metadata, not part of the
       department's human-facing account name. Strip only leading 01 so the
       advisor identity stays Arabicadvisor, Techadvisor, etc. */
    const prefix = accountPrefix(sourcePrefix).replace(/^0+(?=\d)/, "") || `s${sectionId}`;
    const currentHead = scoped.find(user => user.Role === kind.role);
    return { section, collegeId, sectionId, deptLogin, prefix, currentHead };
  });

  /* الخطوة الثانية: الاسم المقترح، وفضّ التصادم بين الكليات. */
  const prefixCount = new Map<string, number>();
  for (const draft of drafts) prefixCount.set(lower(draft.prefix), (prefixCount.get(lower(draft.prefix)) || 0) + 1);
  const claimed = new Set<string>();

  return drafts.map(draft => {
    const college = collegeById.get(draft.collegeId);
    const base = `${draft.prefix}${kind.suffix}`;
    const scopedIds = new Set((usersBySection.get(sectionKey(draft.collegeId, draft.sectionId)) || []).map(user => Number(user.SystemUserId)));
    const ownsLogin = (login: string) => {
      const holder = userByLogin.get(lower(login));
      return holder && scopedIds.has(Number(holder.SystemUserId)) ? holder : undefined;
    };
    /* الاسم محجوزٌ لغير هذا القسم إن ادّعاه قسمٌ قبله في الخطة، أو كان صاحبُه
       مقيّداً بأقسامٍ ليس هذا منها. وحسابٌ بلا نطاق قسمٍ لا يحجز شيئاً. */
    const takenByOther = (login: string) => {
      if (claimed.has(lower(login))) return true;
      const holder = userByLogin.get(lower(login));
      if (!holder || scopedIds.has(Number(holder.SystemUserId))) return false;
      return (sectionsByUser.get(Number(holder.SystemUserId)) || 0) > 0;
    };
    let proposedLogin = base;
    if ((prefixCount.get(lower(draft.prefix)) || 0) > 1 || takenByOther(base)) {
      /* البادئة مشتركة بين كليتين: يبقى الاسم الأساسي لمن يملكه نطاقاً، ويأخذ
         الآخرون رمزَ كليتهم. */
      proposedLogin = ownsLogin(base) ? base : `${base}${collegeTag(college, draft.collegeId)}`;
      let n = 2;
      while (takenByOther(proposedLogin) && !ownsLogin(proposedLogin)) proposedLogin = `${base}${collegeTag(college, draft.collegeId)}${n++}`;
    }
    claimed.add(lower(proposedLogin));

    const row: HeadPlanRow = {
      collegeId: draft.collegeId,
      collegeName: String(college?.AdCollegeName || ""),
      sectionId: draft.sectionId,
      sectionName: String(draft.section.AdSectionName || ""),
      deptLogin: draft.deptLogin,
      proposedLogin,
      proposedName: `${kind.namePrefix} ${String(draft.section.AdSectionName || "").trim()}`.trim(),
      status: "create",
    };
    if (!draft.deptLogin) row.note = "لا يوجد حساب «…dept» لهذا القسم؛ استُخدم رمز القسم أو رقمه";

    const sameLogin = userByLogin.get(lower(proposedLogin));
    const baseHolder = userByLogin.get(lower(base));
    const baseUnscoped = baseHolder && !(sectionsByUser.get(Number(baseHolder.SystemUserId)) || 0);
    if (draft.currentHead) {
      row.status = "exists";
      row.existingUserId = Number(draft.currentHead.SystemUserId);
      row.existingLogin = draft.currentHead.SystemUserLogin;
    } else if (baseUnscoped && (prefixCount.get(lower(draft.prefix)) || 0) > 1) {
      /* «Techhead» موجودٌ بلا نطاق، والبادئة في أكثر من كلية: لا يُعرف لأيّها
         هو، فلا يُنشأ لأيٍّ منها حسابٌ ثانٍ قبل أن يحدّد المدير نطاقه. */
      row.status = "review";
      row.existingUserId = Number(baseHolder!.SystemUserId);
      row.existingLogin = baseHolder!.SystemUserLogin;
      row.note = `الحساب ${baseHolder!.SystemUserLogin} موجود بلا نطاق والبادئة مشتركة بين كليات — حدّد نطاقه ثم أعد المعاينة`;
    } else if (sameLogin) {
      /* الاسم موجود (مثل Techhead الذي أنشأه المالك يدوياً): لا يُنشأ ثانيةً
         ولا يُعدَّل — يُعرض ليكمله المدير إن نقصته الصفة أو النطاق. */
      row.status = "exists";
      row.existingUserId = Number(sameLogin.SystemUserId);
      row.existingLogin = sameLogin.SystemUserLogin;
      const gaps: string[] = [];
      if (sameLogin.Role !== kind.role) gaps.push(kind.role === ADVISOR_ROLE ? "صفته ليست «مرشد القسم»" : "صفته ليست «رئيس القسم العلمي»");
      if (!scopedIds.has(Number(sameLogin.SystemUserId))) gaps.push("نطاقه لا يشمل هذا القسم");
      if (gaps.length) row.note = `الحساب موجود بالاسم نفسه، لكن ${gaps.join(" و")} — يُكمَل من شاشة المستخدمين`;
    }
    return row;
  });
}
