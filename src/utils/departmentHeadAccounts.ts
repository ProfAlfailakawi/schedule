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
}

const DEPT_SUFFIX = /dept$/i;
export const DEPARTMENT_HEAD_ROLE = "departmentHead";

function lower(value: string) { return String(value || "").trim().toLowerCase(); }

/** رمز الكلية صالحاً لاسم دخول: حروف وأرقام لاتينية فقط، وإلا رقمُها. */
function collegeTag(college: HeadPlanCollege | undefined, collegeId: number): string {
  const code = String(college?.AdCollegeCode || "").replace(/[^A-Za-z0-9]/g, "");
  return code || String(collegeId);
}

export function planDepartmentHeadAccounts(input: {
  users: HeadPlanUser[];
  assigns: HeadPlanAssign[];
  colleges: HeadPlanCollege[];
  sections: HeadPlanSection[];
}): HeadPlanRow[] {
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
    const prefix = deptLogin ? deptLogin.replace(DEPT_SUFFIX, "") : `s${sectionId}`;
    const currentHead = scoped.find(user => user.Role === DEPARTMENT_HEAD_ROLE);
    return { section, collegeId, sectionId, deptLogin, prefix, currentHead };
  });

  /* الخطوة الثانية: الاسم المقترح، وفضّ التصادم بين الكليات. */
  const prefixCount = new Map<string, number>();
  for (const draft of drafts) prefixCount.set(lower(draft.prefix), (prefixCount.get(lower(draft.prefix)) || 0) + 1);
  const claimed = new Set<string>();

  return drafts.map(draft => {
    const college = collegeById.get(draft.collegeId);
    const base = `${draft.prefix}head`;
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
      proposedName: `رئيس ${String(draft.section.AdSectionName || "").trim()}`.trim(),
      status: "create",
    };
    if (!draft.deptLogin) row.note = "لا يوجد حساب «…dept» لهذا القسم؛ اقتُرح اسمٌ من رقمه";

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
      if (sameLogin.Role !== DEPARTMENT_HEAD_ROLE) gaps.push("صفته ليست «رئيس القسم العلمي»");
      if (!scopedIds.has(Number(sameLogin.SystemUserId))) gaps.push("نطاقه لا يشمل هذا القسم");
      if (gaps.length) row.note = `الحساب موجود بالاسم نفسه، لكن ${gaps.join(" و")} — يُكمَل من شاشة المستخدمين`;
    }
    return row;
  });
}
