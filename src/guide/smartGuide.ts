export type GuideFeature = {
  id: string;
  title: string;
  summary: string;
  view?: string;
  group: string;
  keywords: string[];
  version: number;
  addedAt?: string;
  permission?: number;
  rootOnly?: boolean;
  adminOnly?: boolean;
  target?: string;
  safeAction?: { scope: string; type: string; value?: string; target?: string; task?: string };
  simulationAction?: { scope: string; type: string; value?: string; target?: string; task?: string };
  risk?: "read" | "prepare" | "write" | "sensitive";
  undoable?: boolean;
  steps?: Array<{ target?: string; selector?: string; text: string; command?: { scope: string; type: string; value?: string; target?: string; task?: string } }>;
};

export const GUIDE_SCHEMA_VERSION = 7;

export const GUIDE_FEATURES: GuideFeature[] = [
  { id:"page.dashboard", title:"الرئيسية", summary:"ملخص سريع للعمل الأكاديمي والوجهات الأكثر استخدامًا.", view:"dashboard", group:"العمل اليومي", keywords:["الرئيسية","بداية","لوحة"], version:1 },
  { id:"page.terms", title:"الفصول الدراسية", summary:"إدارة الفصول الدراسية المرجعية التي تُبنى عليها الجداول.", view:"terms", group:"المرجع الأكاديمي", keywords:["فصل","فصول","ترم"], permission:5, adminOnly:true, version:1 },
  { id:"page.colleges", title:"الكليات", summary:"إدارة كليات النظام والهيكل الأكاديمي الأعلى.", view:"colleges", group:"المرجع الأكاديمي", keywords:["كلية","كليات"], permission:2, adminOnly:true, version:1 },
  { id:"page.sections", title:"الأقسام العلمية", summary:"إدارة الأقسام وربطها بالكليات والنطاقات.", view:"sections", group:"المرجع الأكاديمي", keywords:["قسم","أقسام"], permission:4, adminOnly:true, version:1 },
  { id:"page.instructors", title:"أعضاء هيئة التدريس", summary:"إدارة بيانات الأساتذة واستخدامهم داخل الجدول.", view:"instructors", group:"المرجع الأكاديمي", keywords:["أستاذ","دكتور","عضو هيئة تدريس"], permission:3, adminOnly:true, version:1 },
  { id:"page.courses", title:"المقررات", summary:"إدارة المقررات والرموز والبيانات المرتبطة بالجدولة.", view:"courses", group:"المرجع الأكاديمي", keywords:["مقرر","مادة","كورس"], permission:6, adminOnly:true, version:1 },
  { id:"page.schedules", title:"الجدول الدراسي", summary:"المساحة الأساسية لبناء الجدول ومراجعته ونقله بين العروض.", view:"schedules", group:"العمل اليومي", keywords:["جدول","أسبوع","قاعات","مواعيد"], permission:7, version:4 },
  { id:"schedule.view.list", title:"عرض القائمة", summary:"قائمة مباشرة لكل المواعيد؛ مناسبة للبحث والتحرير السريع والهاتف.", view:"schedules", group:"الجدول", keywords:["قائمة","تحرير","مواعيد"], version:2, target:"schedule.view.list", safeAction:{scope:"schedule",type:"changeView",value:"list"}, steps:[{target:"schedule.view.list",text:"اضغط «قائمة» لعرض المواعيد كسجل مباشر."}] },
  { id:"schedule.view.week", title:"عرض الأسبوع", summary:"الخريطة الزمنية للجدول خلال أيام الأسبوع.", view:"schedules", group:"الجدول", keywords:["أسبوع","الاسبوع","زمن","شبكة"], version:2, target:"schedule.view.week", safeAction:{scope:"schedule",type:"changeView",value:"week"}, steps:[{target:"schedule.view.week",text:"افتح «أسبوع» لرؤية توزيع المواعيد زمنيًا."},{selector:".week-surface",text:"هذه هي مساحة الأسبوع؛ كل بطاقة تحتفظ بمكانها ووقتها."}] },
  { id:"schedule.view.rooms", title:"المباني والقاعات", summary:"عرض بصري لنقل المقررات ومقارنة إشغال القاعات والمباني.", view:"schedules", group:"الجدول", keywords:["قاعات","مباني","قاعة","مبنى","نقل"], version:4, target:"schedule.view.rooms", safeAction:{scope:"schedule",type:"changeView",value:"rooms"}, steps:[{target:"schedule.view.rooms",text:"افتح «المباني والقاعات»."},{selector:".rooms-surface",text:"هذه مساحة القاعات؛ هنا ترى الإشغال وتنفذ النقل بالسحب."},{selector:".rooms-card",text:"أمسك بطاقة المقرر من هنا."},{selector:".rooms-track",text:"واسحبها إلى القاعة أو الوقت المطلوب. لا يُعتمد تغيير غير مسموح به."}] },
  { id:"schedule.action.move-room", title:"نقل مقرر إلى قاعة أخرى", summary:"يجهز عرض المباني والقاعات ويقودك إلى البطاقة والوجهة المناسبة دون تنفيذ تغيير نهائي نيابةً عنك.", view:"schedules", group:"الجدول", keywords:["نقل","انقل","مادة","مقرر","قاعة","مبنى","غرفة","مو راضي","لا يقبل"], version:5, target:"schedule.view.rooms", risk:"prepare", safeAction:{scope:"schedule",type:"assistMoveRoom"}, simulationAction:{scope:"app",type:"simulate",value:"intelligence",task:"move-room"}, undoable:true, steps:[{target:"schedule.view.rooms",text:"سأفتح عرض المباني والقاعات أولًا.",command:{scope:"schedule",type:"changeView",value:"rooms"}},{selector:".rooms-card",text:"هذه بطاقة المقرر التي يمكن سحبها."},{selector:".rooms-track",text:"وهنا تظهر القاعات والأوقات المتاحة للنقل."}] },
  { id:"schedule.action.change-time", title:"تغيير وقت المقرر", summary:"يفتح المقرر المحدد في محرر الجدول لتعديل الوقت، بينما يبقى الحفظ النهائي تحت قرارك.", view:"schedules", group:"الجدول", keywords:["وقت","ساعة","موعد","غير الوقت","تغيير الوقت","قدم","أخر"], version:1, risk:"prepare", safeAction:{scope:"schedule",type:"openEditSelected",task:"time"}, simulationAction:{scope:"app",type:"simulate",value:"intelligence",task:"change-time"}, undoable:true, steps:[{selector:"[data-row-id]",text:"حدد المقرر الذي تريد تعديل وقته."},{selector:".editor-card,.schedule-editor,.form-card",text:"سأفتح محرر المقرر؛ غيّر الوقت ثم راجع النتيجة قبل الحفظ."}] },
  { id:"schedule.action.change-instructor", title:"تغيير أستاذ المقرر", summary:"يفتح المقرر المحدد لتغيير عضو هيئة التدريس دون اعتماد أي تعديل تلقائي.", view:"schedules", group:"الجدول", keywords:["أستاذ","استاذ","دكتور","مدرس","غير الأستاذ","تغيير الدكتور"], version:1, risk:"prepare", safeAction:{scope:"schedule",type:"openEditSelected",task:"instructor"}, simulationAction:{scope:"app",type:"simulate",value:"intelligence",task:"change-instructor"}, undoable:true, steps:[{selector:"[data-row-id]",text:"حدد المقرر الذي تريد تغيير أستاذه."},{selector:".editor-card,.schedule-editor,.form-card",text:"سأفتح محرر المقرر؛ اختر الأستاذ ثم راجع التعارضات قبل الحفظ."}] },
  { id:"schedule.action.find-room", title:"البحث عن قاعة مناسبة", summary:"يجهز عرض القاعات ويبحث عن بدائل آمنة للمقرر المحدد قبل أي نقل فعلي.", view:"schedules", group:"الجدول", keywords:["قاعة فارغة","قاعه فاضيه","قاعة فاضية","قاعة مناسبة","بديل","وين قاعة","ابحث عن قاعة"], version:1, risk:"read", safeAction:{scope:"schedule",type:"findAlternativeSelected"}, steps:[{target:"schedule.view.rooms",text:"سأفتح المباني والقاعات لتظهر الخيارات بصريًا.",command:{scope:"schedule",type:"changeView",value:"rooms"}},{selector:".rooms-track",text:"هنا تقارن القاعات والأوقات المتاحة للمقرر المحدد."}] },
  { id:"schedule.filter.college", title:"اختيار الكلية", summary:"يحدد الكلية التي يعمل عليها الجدول الحالي.", view:"schedules", group:"النطاق", keywords:["كلية","نطاق","اختيار"], version:1, target:"schedule.filter.college", risk:"read", steps:[{target:"schedule.filter.college",text:"اختر الكلية أولًا لتحديد نطاق العمل."}] },
  { id:"schedule.filter.section", title:"اختيار القسم العلمي", summary:"يحدد القسم العلمي داخل الكلية المختارة.", view:"schedules", group:"النطاق", keywords:["قسم","نطاق","اختيار"], version:1, target:"schedule.filter.section", risk:"read", steps:[{target:"schedule.filter.section",text:"اختر القسم العلمي الذي تريد العمل عليه."}] },
  { id:"schedule.filter.term", title:"اختيار الفصل الدراسي", summary:"يحدد الفصل الدراسي الذي ستقرأه وتعدله.", view:"schedules", group:"النطاق", keywords:["فصل","ترم","الفصل الدراسي"], version:1, target:"schedule.filter.term", risk:"read", steps:[{target:"schedule.filter.term",text:"اختر الفصل الدراسي المطلوب."}] },
  { id:"schedule.week.board", title:"مساحة الأسبوع", summary:"المساحة الزمنية التي تعرض المواعيد على أيام الأسبوع.", view:"schedules", group:"الجدول", keywords:["أسبوع","شبكة","مواعيد"], version:1, target:"schedule.week.board", risk:"read" },
  { id:"schedule.rooms.board", title:"مساحة المباني والقاعات", summary:"المساحة البصرية التي تعرض القاعات والمباني والمواعيد المرتبطة بها.", view:"schedules", group:"الجدول", keywords:["قاعات","مباني","مساحة"], version:1, target:"schedule.rooms.board", risk:"read" },
  { id:"schedule.tool.more", title:"المزيد من الأدوات", summary:"يفتح أدوات التركيز والمراجعة والنشر وأدوات البيانات دون ازدحام الشريط الرئيسي.", view:"schedules", group:"الأدوات", keywords:["المزيد","أدوات","مراجعة","نشر"], version:1, target:"schedule.tool.more", risk:"read", steps:[{target:"schedule.tool.more",text:"افتح «المزيد» لإظهار الأدوات الثانوية."}] },
  { id:"schedule.undo", title:"التراجع عن آخر تغيير", summary:"يعيد آخر تغيير قابل للتراجع دون البحث في السجل.", view:"schedules", group:"شبكة الأمان", keywords:["تراجع","ارجع","رجع","undo","خطأ","ضيعت","آخر تعديل","اخر تعديل","رجع لي"], version:1, target:"schedule.undo", risk:"write", undoable:true, steps:[{target:"schedule.undo",text:"استخدم «تراجع» لإعادة آخر تغيير قابل للاسترجاع."}] },
  { id:"schedule.undo.log", title:"سجل تغييرات اليوم", summary:"يعرض التغييرات القابلة للتراجع حتى إذا اكتشفت الخطأ بعد عدة خطوات.", view:"schedules", group:"شبكة الأمان", keywords:["سجل","تغييرات","تراجع","تاريخ"], version:1, target:"schedule.undo.log", risk:"read", steps:[{target:"schedule.undo.log",text:"افتح سجل اليوم لرؤية التغييرات القابلة للتراجع."}] },
  { id:"schedule.search.quick", title:"البحث السريع", summary:"يبحث فورًا داخل مواعيد النطاق المفتوح.", view:"schedules", group:"الجدول", keywords:["بحث","أدور","مقرر","أستاذ"], version:1, target:"schedule.search.quick", steps:[{target:"schedule.search.quick",text:"اكتب الاسم أو الرمز أو القاعة هنا."}] },
  { id:"schedule.tool.review", title:"مراجعة الاعتماد", summary:"فحص الجدول قبل الاعتماد وقراءة التداخلات والملاحظات المهمة.", view:"schedules", group:"القرار", keywords:["مراجعة","اعتماد","تعارض","جودة"], version:3, target:"schedule.tool.review", risk:"read", safeAction:{scope:"schedule",type:"openReview"}, steps:[{target:"schedule.tool.more",text:"افتح «المزيد» إن كانت أدوات المراجعة مطوية.",command:{scope:"schedule",type:"showTarget",target:"schedule.tool.review"}},{target:"schedule.tool.review",text:"افتح «مراجعة الاعتماد» لقراءة حالة الجدول قبل تثبيته."}] },
  { id:"schedule.tool.data", title:"أدوات البيانات", summary:"الاستيراد والتصدير والاستبدال والعمليات المنظمة للبيانات.", view:"schedules", group:"البيانات", keywords:["استيراد","تصدير","بيانات","استبدال"], version:2, target:"schedule.tool.data", risk:"prepare", safeAction:{scope:"schedule",type:"openTransfer"}, steps:[{target:"schedule.tool.more",text:"افتح «المزيد»."},{target:"schedule.tool.data",text:"من هنا تدخل إلى أدوات البيانات."}] },
  { id:"page.scheduleCopy", title:"نسخ فصل", summary:"نسخ جدول فصل إلى فصل آخر ضمن صلاحيات الإدارة.", view:"scheduleCopy", group:"الإدارة", keywords:["نسخ","فصل"], permission:7, rootOnly:true, version:1 },
  { id:"page.intelligence", title:"مركز الذكاء", summary:"افهم حالة الجدول، جرّب السيناريوهات ثم اعتمد القرار.", view:"intelligence", group:"القرار", keywords:["ذكاء","افهم","جرب","اعتمد","ماذا لو"], permission:7, version:4 },
  { id:"intelligence.scene.understand", title:"افهم", summary:"قراءات الجودة والضغط والأسئلة الذكية لفهم الجدول.", view:"intelligence", group:"مركز الذكاء", keywords:["افهم","جودة","ضغط","اسأل"], version:2, target:"intelligence.scene.understand", safeAction:{scope:"intelligence",type:"scene",value:"understand"}, steps:[{target:"intelligence.scene.understand",text:"ابدأ بـ«افهم» لقراءة ما يحدث قبل أي تجربة."}] },
  { id:"intelligence.ask-table", title:"اسأل الجدول", summary:"هذا هو المساعد المخصص لأسئلة بيانات الجدول وتحليلها؛ المرشد الحالي يعلّمك استخدام النظام ولا يستبدله.", view:"intelligence", group:"مركز الذكاء", keywords:["منو","من","كم","فراغ","مزدحم","ازدحام","أفضل قاعة","افضل قاعة","حلل الجدول","بيانات الجدول"], version:1, target:"intelligence.ask-table", risk:"read", safeAction:{scope:"intelligence",type:"tab",value:"copilot"}, steps:[{target:"intelligence.ask-table",text:"افتح «اسأل الجدول» عندما يكون سؤالك عن بيانات الجدول نفسه، لا عن طريقة استخدام البرنامج."}] },
  { id:"intelligence.scene.try", title:"جرّب", summary:"مساحة «ماذا لو؟» لتجربة تغييرات دون لمس الجدول الحقيقي.", view:"intelligence", group:"مركز الذكاء", keywords:["جرب","جرّب","ماذا لو","محاكاة"], version:2, target:"intelligence.scene.try", risk:"read", safeAction:{scope:"intelligence",type:"scene",value:"try"}, steps:[{target:"intelligence.scene.try",text:"انتقل إلى «جرّب» لتعمل على نسخة تجريبية خارج الجدول الحقيقي."}] },
  { id:"intelligence.scene.approve", title:"اعتمد", summary:"مقارنة النسخ ومراجعة القرار النهائي قبل النشر.", view:"intelligence", group:"مركز الذكاء", keywords:["اعتمد","نشر","نسخ","مقارنة"], version:2, target:"intelligence.scene.approve", safeAction:{scope:"intelligence",type:"scene",value:"approve"}, steps:[{target:"intelligence.scene.approve",text:"بعد الفهم والتجربة انتقل إلى «اعتمد» لمراجعة القرار النهائي."}] },
  { id:"living.scene.pulse", title:"نظرة عامة", summary:"قراءة سريعة لحالة الجدول وأهم ما يستحق الانتباه الآن.", view:"schedules", group:"ذكاء الجدول", keywords:["نظرة","حالة","قرار","الآن"], version:1, target:"living.scene.pulse", risk:"read", steps:[{target:"living.scene.pulse",text:"افتح «نظرة عامة» لقراءة الحالة الحالية بسرعة."}] },
  { id:"living.scene.topology", title:"خريطة الضغط", summary:"توضح أين يتجمع الضغط داخل الجدول وما الذي يسببه.", view:"schedules", group:"ذكاء الجدول", keywords:["ضغط","خريطة","ازدحام"], version:1, target:"living.scene.topology", risk:"read", steps:[{target:"living.scene.topology",text:"افتح «خريطة الضغط» لترى مناطق الازدحام بصريًا."}] },
  { id:"living.scene.health", title:"الصحة والعدالة", summary:"قراءة مؤشرات الجودة والمرونة والعدالة في توزيع الجدول.", view:"schedules", group:"ذكاء الجدول", keywords:["صحة","عدالة","مرونة","جودة"], version:1, target:"living.scene.health", risk:"read", steps:[{target:"living.scene.health",text:"افتح «الصحة والعدالة» لقراءة المؤشرات الأساسية."}] },
  { id:"living.scene.brief", title:"ملخص الدقيقة", summary:"ملخص شديد الاختصار لأهم ما يحدث في الجدول الآن.", view:"schedules", group:"ذكاء الجدول", keywords:["ملخص","دقيقة","مختصر"], version:1, target:"living.scene.brief", risk:"read", steps:[{target:"living.scene.brief",text:"افتح «ملخص الدقيقة» لقراءة سريعة جدًا."}] },
  { id:"living.scene.genesis", title:"بداية الفصل", summary:"يبني مسودة أولية للفصل ضمن مساحة القرار وبضوابط النظام.", view:"schedules", group:"ذكاء الجدول", keywords:["بداية","فصل","مسودة","بناء"], version:1, target:"living.scene.genesis", risk:"prepare", steps:[{target:"living.scene.genesis",text:"افتح «بداية الفصل» لإعداد مسودة أولية قبل اعتماد أي تغيير."}] },
  { id:"living.scene.safety", title:"شبكة الأمان", summary:"أدوات التراجع والإصلاح التي تحمي العمل من الفقدان.", view:"schedules", group:"ذكاء الجدول", keywords:["أمان","تراجع","إصلاح","استعادة"], version:1, target:"living.scene.safety", risk:"read", steps:[{target:"living.scene.safety",text:"افتح «شبكة الأمان» لرؤية خيارات التراجع والإصلاح."}] },
  { id:"page.searchInstructor", title:"استعلام أستاذ", summary:"البحث في جدول عضو هيئة تدريس ضمن نطاقك.", view:"searchInstructor", group:"الاستعلامات", keywords:["استعلام","أستاذ","فاضي","متاح","فراغ","متى فاضي"], permission:8, version:1 },
  { id:"page.searchRoom", title:"استعلام قاعة", summary:"البحث في استخدام القاعات ومواعيدها.", view:"searchRoom", group:"الاستعلامات", keywords:["استعلام","قاعة"], permission:9, version:1 },
  { id:"page.searchTime", title:"استعلام وقت", summary:"البحث عن المواعيد حسب الوقت.", view:"searchTime", group:"الاستعلامات", keywords:["استعلام","وقت"], permission:10, version:1 },
  { id:"page.searchRoomTime", title:"قاعة ووقت", summary:"البحث المركب عن القاعة والوقت معًا.", view:"searchRoomTime", group:"الاستعلامات", keywords:["قاعة","وقت","فارغة"], permission:16, version:1 },
  { id:"page.searchAdvanced", title:"الاستعلام المتقدم", summary:"بحث مركب في عناصر الجدول بعدة شروط.", view:"searchAdvanced", group:"الاستعلامات", keywords:["متقدم","بحث","استعلام"], permission:17, version:1 },
  { id:"page.reportDepartment", title:"تقرير القسم", summary:"تقرير جدول القسم ضمن نطاق الصلاحية.", view:"reportDepartment", group:"التقارير", keywords:["تقرير","قسم"], permission:14, version:1 },
  { id:"page.reportInstructor", title:"تقرير الأستاذ", summary:"تقرير تفصيلي لجدول عضو هيئة تدريس.", view:"reportInstructor", group:"التقارير", keywords:["تقرير","أستاذ"], permission:8, version:1 },
  { id:"page.reportRoom", title:"تقرير القاعة", summary:"تقرير استخدام القاعة ومواعيدها.", view:"reportRoom", group:"التقارير", keywords:["تقرير","قاعة"], permission:9, version:1 },
  { id:"page.reportTime", title:"تقرير الوقت", summary:"تقرير المواعيد حسب الفترات الزمنية.", view:"reportTime", group:"التقارير", keywords:["تقرير","وقت"], permission:10, version:1 },
  { id:"page.reportRoomTime", title:"تقرير القاعة والوقت", summary:"تقرير مركب للقاعة والوقت.", view:"reportRoomTime", group:"التقارير", keywords:["تقرير","قاعة","وقت"], permission:16, version:1 },
  { id:"page.users", title:"إدارة المستخدمين", summary:"إنشاء المستخدمين وإدارة حالتهم ضمن صلاحيات الإدارة.", view:"users", group:"الإدارة", keywords:["مستخدم","يوزر","إدارة"], permission:11, adminOnly:true, version:1 },
  { id:"page.permissions", title:"الصلاحيات", summary:"إدارة ما يستطيع كل مستخدم الوصول إليه وتنفيذه.", view:"permissions", group:"الإدارة", keywords:["صلاحيات","إذن"], permission:12, adminOnly:true, version:1 },
  { id:"page.scopes", title:"نطاقات المستخدمين", summary:"تحديد الكليات والأقسام المسموحة لكل مستخدم.", view:"scopes", group:"الإدارة", keywords:["نطاق","قسم","كلية"], permission:15, adminOnly:true, version:1 },
  { id:"page.audit", title:"سجل النظام", summary:"قراءة الأحداث والتغييرات الإدارية المهمة.", view:"audit", group:"الإدارة", keywords:["سجل","تدقيق","تاريخ"], adminOnly:true, version:1 },
  { id:"page.backup", title:"النسخ والاستعادة", summary:"إدارة النسخ الاحتياطية والاستعادة للمسؤول الرئيسي.", view:"backup", group:"الإدارة", keywords:["نسخة","استعادة","احتياط"], rootOnly:true, version:1 },
  { id:"page.about", title:"عن النظام", summary:"معلومات موجزة عن SCHEDULE ورحلته ووظيفته داخل العمل الأكاديمي.", view:"about", group:"المرجع", keywords:["عن","النظام","رحلة"], adminOnly:true, version:1 },
];

export const featureById = (id: string) => GUIDE_FEATURES.find(feature => feature.id === id) || null;

export function allowedGuideFeatures(activeView: string, permissions: number[], root: boolean, admin = root) {
  const set = new Set(permissions.map(Number));
  return GUIDE_FEATURES.filter(feature => {
    if (feature.rootOnly && !root) return false;
    if (feature.adminOnly && !admin) return false;
    if (feature.permission && !set.has(feature.permission)) return false;
    return !feature.view || feature.view === activeView;
  });
}

export type DynamicGuideFeature = { id:string; title:string; summary:string; target?:string; kind:string };

/**
 * Runtime discovery is the automatic safety net: any new visible control becomes
 * discoverable even before a hand-written rich guide exists. Known registry
 * features replace these generic descriptions when available.
 */
export function discoverVisibleControls(activeView: string): DynamicGuideFeature[] {
  if (typeof document === "undefined") return [];
  const seen = new Set<string>();
  const result: DynamicGuideFeature[] = [];
  const controls = document.querySelectorAll<HTMLElement>(
    '[data-guide-target],button:not([aria-hidden="true"]),a[href],[role="button"],select,input[type="search"]',
  );
  controls.forEach((element, index) => {
    if (element.offsetParent === null) return;
    if (element.closest(".smart-guide") || element.closest("[data-guide-ignore='true']")) return;
    const explicit = element.getAttribute("data-guide-target") || element.closest<HTMLElement>("[data-guide-target]")?.getAttribute("data-guide-target") || "";
    const label = String(
      element.getAttribute("data-guide-title") ||
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.textContent ||
      ""
    ).replace(/\s+/g," ").trim().slice(0,72);
    if (!label || label.length < 2) return;
    const id = explicit || `auto.${activeView}.${slug(label)}.${index}`;
    if (seen.has(id)) return;
    seen.add(id);
    result.push({
      id,
      target: explicit || undefined,
      title: label,
      summary: explicit ? "عنصر حي في هذه الشاشة؛ يمكنك الإشارة إليه وسيشرح المرشد وظيفته ضمن السياق الحالي." : "عنصر متاح الآن في الشاشة الحالية.",
      kind: element.tagName.toLowerCase(),
    });
  });
  return result.slice(0,80);
}

function slug(value:string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-|-$/g,"").slice(0,28) || "control";
}

export type GuideMastery = {
  uses:number;
  successes:number;
  failures:number;
  helps:number;
  resolvedAfterHelp:number;
  lastUsed:number;
  lastHelp:number;
  versionSeen:number;
};

export type GuideProfile = {
  schema:number;
  userId:number;
  mastery:Record<string,GuideMastery>;
  routes:Record<string,number>;
  workflows:Record<string,{count:number;last:number;sequence:string[]}>;
  sequence:string[];
  ignored:Record<string,number>;
  hintMode:"auto"|"quiet"|"off";
  lastHintAt:number;
  onboardingDone?:boolean;
  routines?:Record<string,{id:string;name:string;sequence:string[];createdAt:number;lastUsed:number}>;
  friction?:Record<string,{count:number;last:number}>;
  catalog?:Record<string,number>;
  discovered?:Record<string,{id:string;title:string;view:string;target?:string;kind:string;firstSeen:number;lastSeen:number;seen:boolean}>;
  currentTask?: { id:string; title:string; featureId?:string; target?:string; command?:any; startedAt:number; updatedAt:number; step?:number };
  previousTask?: { id:string; title:string; featureId?:string; target?:string; command?:any; startedAt:number; updatedAt:number; step?:number };
};

const currentGuideCatalog = () => Object.fromEntries(GUIDE_FEATURES.map(feature => [feature.id, feature.version]));
const blankMastery = ():GuideMastery => ({uses:0,successes:0,failures:0,helps:0,resolvedAfterHelp:0,lastUsed:0,lastHelp:0,versionSeen:0});
const profileKey = (userId:number) => `schedule-smart-guide-v${GUIDE_SCHEMA_VERSION}:${Number(userId)||0}`;

export function loadGuideProfile(userId:number):GuideProfile {
  const blank:GuideProfile={schema:GUIDE_SCHEMA_VERSION,userId:Number(userId)||0,mastery:{},routes:{},workflows:{},sequence:[],ignored:{},hintMode:"auto",lastHintAt:0,onboardingDone:false,routines:{},friction:{},catalog:currentGuideCatalog(),discovered:{}};
  try {
    const exact=JSON.parse(localStorage.getItem(profileKey(userId))||"null");
    if(exact && exact.schema===GUIDE_SCHEMA_VERSION) return {...blank,...exact,routines:exact.routines||{},friction:exact.friction||{},catalog:exact.catalog||currentGuideCatalog(),discovered:exact.discovered||{}};
    for(let version=GUIDE_SCHEMA_VERSION-1;version>=1;version--){
      const legacy=JSON.parse(localStorage.getItem(`schedule-smart-guide-v${version}:${Number(userId)||0}`)||"null");
      if(legacy){
        const migrated={...blank,...legacy,schema:GUIDE_SCHEMA_VERSION,userId:Number(userId)||0,routines:legacy.routines||{},friction:legacy.friction||{},catalog:legacy.catalog||currentGuideCatalog(),discovered:legacy.discovered||{}};
        Object.values(migrated.mastery||{}).forEach((row:any)=>{if(row && typeof row.resolvedAfterHelp!=="number")row.resolvedAfterHelp=0;});
        saveGuideProfile(migrated);return migrated;
      }
    }
  } catch {}
  return blank;
}
export function saveGuideProfile(profile:GuideProfile) {
  try { localStorage.setItem(profileKey(profile.userId), JSON.stringify(profile)); window.dispatchEvent(new CustomEvent("schedule-smart-guide-profile",{detail:{userId:profile.userId}})); } catch {}
}
export function mutateGuideProfile(userId:number, updater:(p:GuideProfile)=>void) {
  const p=loadGuideProfile(userId); updater(p); saveGuideProfile(p); return p;
}

export function masteryScore(profile:GuideProfile, feature:GuideFeature|string|null):number {
  if(!feature) return 0;
  const f=typeof feature==="string"?featureById(feature):feature;
  const id=typeof feature==="string"?feature:feature.id;
  const m=profile.mastery[id]||blankMastery();
  const ageDays=m.lastUsed?Math.max(0,(Date.now()-m.lastUsed)/86400000):365;
  const decay=Math.exp(-ageDays/240);
  let raw=Math.min(1,(m.successes*1.4 + m.uses*.45 - m.failures*1.6 - m.helps*.2)/10);
  if(f && m.versionSeen && m.versionSeen < f.version) raw*=.45;
  return Math.max(0,Math.min(1,raw*decay));
}

export function recordFeatureUse(userId:number, featureId:string, outcome?:"success"|"failure"|"help") {
  return mutateGuideProfile(userId,p=>{
    const feature=featureById(featureId);
    const m=p.mastery[featureId]||blankMastery();
    m.uses+=1;m.lastUsed=Date.now();
    if(outcome==="success"){m.successes+=1;if(m.lastHelp && Date.now()-m.lastHelp<10*60*1000)m.resolvedAfterHelp=Number(m.resolvedAfterHelp||0)+1;}
    if(outcome==="failure")m.failures+=1;
    if(outcome==="help"){m.helps+=1;m.lastHelp=Date.now();}
    if(feature){m.versionSeen=Math.max(m.versionSeen,feature.version);if(!p.catalog)p.catalog={};p.catalog[featureId]=feature.version;}
    p.mastery[featureId]=m;
    recordSequenceInside(p,featureId);
  });
}

export function markFeatureSeen(userId:number, featureId:string) {
  return mutateGuideProfile(userId,p=>{
    const feature=featureById(featureId); if(!feature)return;
    const m=p.mastery[featureId]||blankMastery();m.versionSeen=feature.version;p.mastery[featureId]=m;if(!p.catalog)p.catalog={};p.catalog[featureId]=feature.version;
  });
}

function recordSequenceInside(p:GuideProfile,id:string){
  if(!id)return;
  p.sequence=[...p.sequence,id].slice(-12);
  for(const size of [3,4,5]){
    if(p.sequence.length<size)continue;
    const seq=p.sequence.slice(-size);
    const key=seq.join("→");
    const w=p.workflows[key]||{count:0,last:0,sequence:seq};
    w.count+=1;w.last=Date.now();w.sequence=seq;p.workflows[key]=w;
  }
  const entries=Object.entries(p.workflows).sort((a,b)=>b[1].last-a[1].last).slice(0,60);
  p.workflows=Object.fromEntries(entries);
}

export function recordRoute(userId:number,from:string,to:string){
  if(!from||!to||from===to)return loadGuideProfile(userId);
  return mutateGuideProfile(userId,p=>{const key=`${from}>${to}`;p.routes[key]=Number(p.routes[key]||0)+1;recordSequenceInside(p,`page.${to}`);});
}

export function commonWorkflows(profile:GuideProfile, activeView:string){
  return Object.values(profile.workflows)
    .filter(w=>w.count>=5 && w.sequence.some(id=>id===`page.${activeView}` || featureById(id)?.view===activeView))
    .sort((a,b)=>b.count-a.count || b.last-a.last)
    .slice(0,3);
}

export function changedFeatures(profile:GuideProfile,activeView:string,permissions:number[],root:boolean,admin=root){
  const catalog=profile.catalog||{};
  return allowedGuideFeatures(activeView,permissions,root,admin)
    .filter(feature=>catalog[feature.id] == null || feature.version>Number(catalog[feature.id]||0))
    .sort((a,b)=>b.version-a.version);
}

export function canProactivelyHint(profile:GuideProfile,key:string,severity:"soft"|"strong"="soft"){
  if(profile.hintMode==="off")return false;
  if(profile.hintMode==="quiet" && severity==="soft")return false;
  const now=Date.now();
  const cooldown=severity==="strong"?90_000:6*60_000;
  if(now-profile.lastHintAt<cooldown)return false;
  if(now-Number(profile.ignored[key]||0)<24*60*60*1000)return false;
  return true;
}

export function noteHint(userId:number,key:string,ignored=false){
  return mutateGuideProfile(userId,p=>{p.lastHintAt=Date.now();if(ignored)p.ignored[key]=Date.now();});
}

export function setHintMode(userId:number,mode:GuideProfile["hintMode"]){
  return mutateGuideProfile(userId,p=>{p.hintMode=mode;});
}

export function setGuideTask(userId:number,task:GuideProfile["currentTask"]|undefined){
  return mutateGuideProfile(userId,p=>{
    if(task && p.currentTask && p.currentTask.id!==task.id) p.previousTask=p.currentTask;
    if(!task && p.currentTask) p.previousTask=p.currentTask;
    p.currentTask=task;
  });
}


export function setOnboardingDone(userId:number,value=true){
  return mutateGuideProfile(userId,p=>{p.onboardingDone=value;});
}

export function saveGuideRoutine(userId:number,name:string,sequence:string[]){
  const clean=String(name||"").trim().slice(0,48)||"مساري المعتاد";
  const id=`routine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;
  return mutateGuideProfile(userId,p=>{
    if(!p.routines)p.routines={};
    p.routines[id]={id,name:clean,sequence:sequence.slice(-8),createdAt:Date.now(),lastUsed:0};
  });
}

export function touchGuideRoutine(userId:number,id:string){
  return mutateGuideProfile(userId,p=>{if(p.routines?.[id])p.routines[id].lastUsed=Date.now();});
}

export function removeGuideRoutine(userId:number,id:string){
  return mutateGuideProfile(userId,p=>{if(p.routines)delete p.routines[id];});
}

export function noteFriction(userId:number,key:string){
  return mutateGuideProfile(userId,p=>{
    if(!p.friction)p.friction={};
    const item=p.friction[key]||{count:0,last:0};item.count+=1;item.last=Date.now();p.friction[key]=item;
  });
}

export function predictedNextFeature(profile:GuideProfile,currentId:string){
  const candidates=new Map<string,{id:string;count:number;last:number}>();
  Object.values(profile.workflows||{}).forEach(workflow=>{
    const sequence=workflow.sequence||[];
    for(let i=0;i<sequence.length-1;i++){
      if(sequence[i]!==currentId)continue;
      const next=sequence[i+1];const current=candidates.get(next)||{id:next,count:0,last:0};
      current.count+=workflow.count;current.last=Math.max(current.last,workflow.last);candidates.set(next,current);
    }
  });
  return [...candidates.values()].filter(item=>item.count>=5).sort((a,b)=>b.count-a.count||b.last-a.last)[0]||null;
}

export function dialectIntentTerms(value:string):string[]{
  const text=String(value||"").toLowerCase().replace(/[إأآ]/g,"ا").replace(/ى/g,"ي").replace(/[ً-ْٰـ]/g,"");
  const terms=new Set(text.split(/\s+/).filter(Boolean));
  const add=(...items:string[])=>items.forEach(item=>terms.add(item));
  if(/شلون|كيف/.test(text))add("كيف","طريقة","شرح");
  if(/شنو|ماذا/.test(text))add("ماذا","شرح");
  if(/وين|اين|وين القى|وين احصل|ما لقيت/.test(text))add("اين","مكان","افتح","بحث");
  if(/ليش|لماذا/.test(text))add("لماذا","سبب","تعارض","مشكلة");
  if(/ابي|اريد|ودي|سوي|سو لي|خلني|خله/.test(text))add("اريد","تنفيذ");
  if(/مادري|ما ادري|ما اعرف|مو عارف|متوهق/.test(text))add("شرح","مساعدة","طريقة");
  if(/طلع لي|ظهر لي|قاعد يطلع/.test(text))add("رسالة","مشكلة","سبب");
  if(/ضيعت|ضاع|راح علي|رجع لي/.test(text))add("تراجع","سجل","اخر تعديل");
  if(/ماده|الماده/.test(text))add("مقرر","نقل");
  if(/دكتور|الدكتور/.test(text))add("استاذ","عضو هيئة تدريس");
  if(/مو راضي|ما يرضى|ما يقبل|مو قابل|علق|متوهق/.test(text))add("مشكلة","تعارض","لا يقبل","نقل");
  if(/قاعه|قاعات|مبنى|مباني/.test(text))add("قاعة","قاعات","مبنى","نقل");
  if(/اسرع|اختصر|روتين|طريقتي/.test(text))add("مسار","اختصار","روتين");
  if(/وين كنت|شنو كنت|كنت اسوي|كنت اسوي شنو|ماذا كنت|اين توقفت|وين وقفت/.test(text))add("مهمة","اكمل","سابق");
  if(/نفس اللي|نفس الي|مثل امس|مثل أمس|سويته امس|سويته أمس|كرر السابق/.test(text))add("مسار","روتين","سابق","كرر");
  if(/جديد|شنو الجديد|ما الجديد/.test(text))add("جديد","تحديث");
  return [...terms];
}

export function silenceHint(userId:number,key:string){
  return mutateGuideProfile(userId,p=>{p.ignored[key]=Number.MAX_SAFE_INTEGER;p.lastHintAt=Date.now();});
}


export function noteDiscoveredControls(userId:number,activeView:string,items:DynamicGuideFeature[]){
  const current=loadGuideProfile(userId);
  const shelf={...(current.discovered||{})};
  let changed=false;
  const now=Date.now();
  for(const item of items){
    if(featureById(item.id) || (item.target && featureById(item.target))) continue;
    const id=String(item.id||""); if(!id) continue;
    const previous=shelf[id];
    if(!previous){
      shelf[id]={id,title:item.title,view:activeView,target:item.target,kind:item.kind,firstSeen:now,lastSeen:now,seen:false};
      changed=true;
      continue;
    }
    const titleChanged=previous.title!==item.title || previous.target!==item.target || previous.view!==activeView;
    const needsTouch=now-Number(previous.lastSeen||0)>60_000;
    if(titleChanged || needsTouch){
      shelf[id]={...previous,title:item.title,view:activeView,target:item.target,kind:item.kind,lastSeen:now,seen:titleChanged?false:previous.seen};
      changed=true;
    }
  }
  const trimmed=Object.fromEntries(Object.entries(shelf).sort((a,b)=>Number(b[1].lastSeen)-Number(a[1].lastSeen)).slice(0,160));
  if(changed){current.discovered=trimmed;saveGuideProfile(current);return current;}
  return current;
}

export function discoveredNew(profile:GuideProfile,activeView?:string){
  return Object.values(profile.discovered||{})
    .filter(item=>!item.seen && (!activeView || item.view===activeView))
    .sort((a,b)=>b.firstSeen-a.firstSeen);
}

export function markDiscoveredSeen(userId:number,id:string){
  return mutateGuideProfile(userId,p=>{if(p.discovered?.[id])p.discovered[id].seen=true;});
}
