export type GuideRisk = "read" | "prepare" | "write" | "sensitive";
export type GuideConfidence = "low" | "medium" | "high";
export type GuideOutcome = "attempt" | "started" | "completed" | "failed" | "abandoned" | "helped" | "resolvedAfterHelp";
export type GuideReason = "UNFAMILIAR" | "FORGOTTEN" | "HESITANT" | "BLOCKED" | "UI_CHANGED" | "NORMAL_EXPERT_BEHAVIOR";

export type GuideCommand = {
  scope?: string;
  type: string;
  value?: string;
  target?: string;
  task?: string;
  payload?: any;
  transactionId?: string;
  featureId?: string;
};

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
  safeAction?: GuideCommand;
  simulationAction?: GuideCommand;
  risk?: GuideRisk;
  undoable?: boolean;
  steps?: Array<{ target?: string; selector?: string; text: string; command?: GuideCommand }>;
};

export type GuidePermissionSession = {
  permissions: number[];
  root: boolean;
  admin: boolean;
};

export const GUIDE_SCHEMA_VERSION = 12;

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
  { id:"schedule.action.change-time", title:"تغيير وقت المقرر", summary:"يفتح المقرر المحدد في محرر الجدول لتعديل الوقت، بينما يبقى الحفظ النهائي تحت قرارك.", view:"schedules", group:"الجدول", keywords:["وقت","ساعة","موعد","غير الوقت","تغيير الوقت","قدم","أخر"], version:2, risk:"prepare", safeAction:{scope:"schedule",type:"openEditSelected",task:"time"}, simulationAction:{scope:"app",type:"simulate",value:"intelligence",task:"change-time"}, undoable:true, steps:[{selector:"[data-row-id]",text:"اختر بطاقة الموعد الذي تريد تعديل وقته."},{selector:"[data-guide-editor-field='time']",text:"هذا وقت الموعد داخل المحرر الحقيقي؛ عدّل الوقت ثم راجع النتيجة قبل الحفظ."}] },
  { id:"schedule.action.change-course", title:"تغيير المقرر", summary:"يفتح الموعد المحدد داخل محرر الجدول ويضعك مباشرة على حقل المقرر لتغييره فعليًا.", view:"schedules", group:"الجدول", keywords:["تغيير المقرر","غير المقرر","استبدال المقرر","تغيير المادة","غير المادة"], version:1, risk:"prepare", safeAction:{scope:"schedule",type:"openEditSelected",task:"course"}, undoable:true, steps:[{selector:"[data-row-id]",text:"حدد الموعد الذي تريد تغيير مقرره."},{selector:"[data-guide-editor-field='course-name']",text:"هذا حقل المقرر داخل المحرر الحقيقي؛ اختر المقرر الجديد ثم احفظ بعد المراجعة."}] },
  { id:"schedule.action.change-instructor", title:"تغيير أستاذ المقرر", summary:"يفتح المقرر المحدد لتغيير عضو هيئة التدريس دون اعتماد أي تعديل تلقائي.", view:"schedules", group:"الجدول", keywords:["أستاذ","استاذ","دكتور","مدرس","غير الأستاذ","تغيير الدكتور"], version:2, risk:"prepare", safeAction:{scope:"schedule",type:"openEditSelected",task:"instructor"}, simulationAction:{scope:"app",type:"simulate",value:"intelligence",task:"change-instructor"}, undoable:true, steps:[{selector:"[data-row-id]",text:"اختر بطاقة المقرر الذي تريد تغيير أستاذه."},{selector:"[data-guide-editor-field='instructor']",text:"هذا حقل الأستاذ داخل المحرر الحقيقي؛ اختر الأستاذ الجديد ثم راجع التعارضات قبل الحفظ."}] },
  { id:"schedule.action.find-room", title:"البحث عن قاعة مناسبة", summary:"يجهز عرض القاعات ويبحث عن بدائل آمنة للمقرر المحدد قبل أي نقل فعلي.", view:"schedules", group:"الجدول", keywords:["قاعة فارغة","قاعه فاضيه","قاعة فاضية","قاعة مناسبة","بديل","وين قاعة","ابحث عن قاعة"], version:1, risk:"read", safeAction:{scope:"schedule",type:"findAlternativeSelected"}, steps:[{target:"schedule.view.rooms",text:"سأفتح المباني والقاعات لتظهر الخيارات بصريًا.",command:{scope:"schedule",type:"changeView",value:"rooms"}},{selector:".rooms-track",text:"هنا تقارن القاعات والأوقات المتاحة للمقرر المحدد."}] },
  { id:"schedule.filter.college", title:"اختيار الكلية", summary:"يحدد الكلية التي يعمل عليها الجدول الحالي.", view:"schedules", group:"النطاق", keywords:["كلية","نطاق","اختيار"], version:1, target:"schedule.filter.college", risk:"read", steps:[{target:"schedule.filter.college",text:"اختر الكلية أولًا لتحديد نطاق العمل."}] },
  { id:"schedule.filter.section", title:"اختيار القسم العلمي", summary:"يحدد القسم العلمي داخل الكلية المختارة.", view:"schedules", group:"النطاق", keywords:["قسم","نطاق","اختيار"], version:1, target:"schedule.filter.section", risk:"read", steps:[{target:"schedule.filter.section",text:"اختر القسم العلمي الذي تريد العمل عليه."}] },
  { id:"schedule.filter.term", title:"اختيار الفصل الدراسي", summary:"يحدد الفصل الدراسي الذي ستقرأه وتعدله.", view:"schedules", group:"النطاق", keywords:["فصل","ترم","الفصل الدراسي"], version:1, target:"schedule.filter.term", risk:"read", steps:[{target:"schedule.filter.term",text:"اختر الفصل الدراسي المطلوب."}] },
  { id:"schedule.week.board", title:"مساحة الأسبوع", summary:"المساحة الزمنية التي تعرض المواعيد على أيام الأسبوع.", view:"schedules", group:"الجدول", keywords:["أسبوع","شبكة","مواعيد"], version:1, target:"schedule.week.board", risk:"read" },
  { id:"schedule.rooms.board", title:"مساحة المباني والقاعات", summary:"المساحة البصرية التي تعرض القاعات والمباني والمواعيد المرتبطة بها.", view:"schedules", group:"الجدول", keywords:["قاعات","مباني","مساحة"], version:1, target:"schedule.rooms.board", risk:"read" },
  { id:"schedule.tool.more", title:"المزيد من الأدوات", summary:"يفتح أدوات التركيز والمراجعة والنشر وأدوات البيانات دون ازدحام الشريط الرئيسي.", view:"schedules", group:"الأدوات", keywords:["المزيد","أدوات","مراجعة","نشر"], version:1, target:"schedule.tool.more", risk:"read", steps:[{target:"schedule.tool.more",text:"افتح «المزيد» لإظهار الأدوات الثانوية."}] },
  { id:"schedule.tool.focus", title:"وضع التركيز", summary:"يخفف العناصر الثانوية ويُبقي الجدول نفسه في الواجهة لتقرأ وتعمل بأقل تشتيت.", view:"schedules", group:"الأدوات", keywords:["تركيز","ركز","هدوء","تشتيت"], version:1, target:"schedule.tool.focus", risk:"read", steps:[{target:"schedule.tool.focus",text:"اضغط أيقونة التركيز لتقليل التشتيت، واضغطها مرة أخرى للعودة."}] },
  { id:"schedule.action.quick-fill", title:"املأ كالمعتاد", summary:"يعبّئ أيام ووقت ومكان الموعد من النمط المعتاد لهذا المقرر، ثم يترك القيم أمامك للمراجعة قبل الحفظ.", view:"schedules", group:"المحرر", keywords:["املأ كالمعتاد","تعبئة","نمط معتاد","اقتراح"], version:1, target:"schedule.action.quick-fill", risk:"prepare", steps:[{target:"schedule.action.quick-fill",text:"استخدم «املأ كالمعتاد» لتعبئة النمط التاريخي للمقرر ثم راجع الحقول قبل الحفظ."}] },
  { id:"schedule.undo", title:"التراجع عن آخر تغيير", summary:"يعيد آخر تغيير قابل للتراجع دون البحث في السجل.", view:"schedules", group:"شبكة الأمان", keywords:["تراجع","ارجع","رجع","undo","خطأ","ضيعت","آخر تعديل","اخر تعديل","رجع لي"], version:1, target:"schedule.undo", risk:"write", undoable:true, steps:[{target:"schedule.undo",text:"استخدم «تراجع» لإعادة آخر تغيير قابل للاسترجاع."}] },
  { id:"schedule.undo.log", title:"سجل تغييرات اليوم", summary:"يعرض التغييرات القابلة للتراجع حتى إذا اكتشفت الخطأ بعد عدة خطوات.", view:"schedules", group:"شبكة الأمان", keywords:["سجل","تغييرات","تراجع","تاريخ"], version:1, target:"schedule.undo.log", risk:"read", steps:[{target:"schedule.undo.log",text:"افتح سجل اليوم لرؤية التغييرات القابلة للتراجع."}] },
  { id:"schedule.search.quick", title:"البحث السريع", summary:"يبحث فورًا داخل مواعيد النطاق المفتوح.", view:"schedules", group:"الجدول", keywords:["بحث","أدور","مقرر","أستاذ"], version:1, target:"schedule.search.quick", steps:[{target:"schedule.search.quick",text:"اكتب الاسم أو الرمز أو القاعة هنا."}] },
  { id:"schedule.tool.review", title:"مراجعة الاعتماد", summary:"فحص الجدول قبل الاعتماد وقراءة التداخلات والملاحظات المهمة.", view:"schedules", group:"القرار", keywords:["مراجعة","اعتماد","تعارض","جودة"], version:3, target:"schedule.tool.review", risk:"read", safeAction:{scope:"schedule",type:"openReview"}, steps:[{target:"schedule.tool.more",text:"افتح «المزيد» إن كانت أدوات المراجعة مطوية.",command:{scope:"schedule",type:"showTarget",target:"schedule.tool.review"}},{target:"schedule.tool.review",text:"افتح «مراجعة الاعتماد» لقراءة حالة الجدول قبل تثبيته."}] },
  { id:"schedule.tool.data", title:"أدوات البيانات", summary:"الاستيراد والتصدير والاستبدال والعمليات المنظمة للبيانات.", view:"schedules", group:"البيانات", keywords:["استيراد","تصدير","بيانات","استبدال"], version:2, target:"schedule.tool.data", risk:"prepare", safeAction:{scope:"schedule",type:"openTransfer"}, steps:[{target:"schedule.tool.more",text:"افتح «المزيد»."},{target:"schedule.tool.data",text:"من هنا تدخل إلى أدوات البيانات."}] },
  { id:"schedule.publish", title:"نشر الجدول", summary:"ينشئ رابط قراءة أو ينشر نسخة وفق صلاحيتك، ولا ينفذ المرشد النشر تلقائيًا.", view:"schedules", group:"القرار", keywords:["نشر","رابط قراءة","مشاركة","اعتماد"], version:1, permission:7, adminOnly:true, target:"schedule.publish", risk:"sensitive", steps:[{target:"schedule.tool.more",text:"افتح «المزيد» لإظهار أدوات النشر."},{target:"schedule.publish",text:"هذا هو مدخل النشر. راجع النطاق ثم أكّد القرار بنفسك."}] },
  { id:"page.scheduleCopy", title:"نسخ فصل", summary:"نسخ جدول فصل إلى فصل آخر ضمن صلاحيات الإدارة.", view:"scheduleCopy", group:"الإدارة", keywords:["نسخ","فصل"], permission:7, rootOnly:true, version:1 },
  { id:"page.intelligence", title:"مركز الذكاء", summary:"افهم حالة الجدول، جرّب السيناريوهات ثم اعتمد القرار.", view:"intelligence", group:"القرار", keywords:["ذكاء","افهم","جرب","اعتمد","ماذا لو"], permission:7, version:4 },
  { id:"intelligence.scene.understand", title:"افهم", summary:"قراءات الجودة والضغط والأسئلة الذكية لفهم الجدول.", view:"intelligence", group:"مركز الذكاء", keywords:["افهم","جودة","ضغط","اسأل"], version:2, target:"intelligence.scene.understand", safeAction:{scope:"intelligence",type:"scene",value:"understand"}, steps:[{target:"intelligence.scene.understand",text:"ابدأ بـ«افهم» لقراءة ما يحدث قبل أي تجربة."}] },
  { id:"intelligence.ask-table", title:"اسأل الجدول", summary:"هذا هو المساعد المخصص لأسئلة بيانات الجدول وتحليلها؛ المرشد الحالي يعلّمك استخدام النظام ولا يستبدله.", view:"intelligence", group:"مركز الذكاء", keywords:["منو","من","كم","فراغ","مزدحم","ازدحام","أفضل قاعة","افضل قاعة","حلل الجدول","بيانات الجدول"], version:1, target:"intelligence.ask-table", risk:"read", safeAction:{scope:"intelligence",type:"tab",value:"copilot"}, steps:[{target:"intelligence.ask-table",text:"افتح «اسأل الجدول» عندما يكون سؤالك عن بيانات الجدول نفسه، لا عن طريقة استخدام البرنامج."}] },
  { id:"intelligence.scene.try", title:"جرّب", summary:"مساحة «ماذا لو؟» لتجربة تغييرات دون لمس الجدول الحقيقي.", view:"intelligence", group:"مركز الذكاء", keywords:["جرب","جرّب","ماذا لو","محاكاة"], version:2, target:"intelligence.scene.try", risk:"read", safeAction:{scope:"intelligence",type:"scene",value:"try"}, steps:[{target:"intelligence.scene.try",text:"انتقل إلى «جرّب» لتعمل على نسخة تجريبية خارج الجدول الحقيقي."}] },
  { id:"intelligence.scene.approve", title:"اعتمد", summary:"مقارنة النسخ ومراجعة القرار النهائي قبل النشر.", view:"intelligence", group:"مركز الذكاء", keywords:["اعتمد","نشر","نسخ","مقارنة"], version:2, target:"intelligence.scene.approve", safeAction:{scope:"intelligence",type:"scene",value:"approve"}, steps:[{target:"intelligence.scene.approve",text:"بعد الفهم والتجربة انتقل إلى «اعتمد» لمراجعة القرار النهائي."}] },
  { id:"intelligence.publish-draft", title:"نشر مسودة القرار", summary:"ينشر المسودة المحددة بعد مراجعتها؛ يبقى القرار النهائي والتأكيد بيد المستخدم.", view:"intelligence", group:"مركز الذكاء", keywords:["نشر مسودة","اعتماد مسودة","نشر"], version:1, permission:7, target:"intelligence.publish-draft", risk:"sensitive", steps:[{target:"intelligence.scene.approve",text:"انتقل إلى «اعتمد» أولًا."},{target:"intelligence.publish-draft",text:"هذا زر نشر المسودة. تحقق من النسخة ثم أكّد النشر بنفسك."}] },
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
  { id:"schedule.practice", title:"تجربة آمنة", summary:"وضع تدريبي داخل واجهة الجدول يسمح بالتجربة على نسخة مؤقتة دون تغيير البيانات الحقيقية.", view:"schedules", group:"التعلم", keywords:["تجربة","تدريب","اجرب","بدون حفظ","آمن"], version:1, permission:7, target:"schedule.practice", risk:"read" },
  { id:"guide.ambient-next", title:"الخطوة التالية", summary:"اقتراح صغير يظهر فقط عندما تكون الثقة عالية جدًا في الخطوة التي تأتي عادةً بعد نجاح مهمتك الحالية.", group:"المرشد", keywords:["التالي","بعدها","الخطوة التالية"], version:1, risk:"read" },
];

export const featureById = (id: string) => GUIDE_FEATURES.find(feature => feature.id === id) || null;

/** Single permission predicate. Every guide surface must call this function. */
export function canAccessGuideFeature(feature: GuideFeature | null | undefined, session: GuidePermissionSession) {
  if (!feature) return false;
  if (feature.rootOnly && !session.root) return false;
  if (feature.adminOnly && !session.admin) return false;
  if (feature.permission && !new Set(session.permissions.map(Number)).has(Number(feature.permission))) return false;
  return true;
}

export function allowedGuideFeatures(activeView: string, permissions: number[], root: boolean, admin = root) {
  const session = { permissions, root, admin };
  return GUIDE_FEATURES.filter(feature => canAccessGuideFeature(feature, session) && (!feature.view || feature.view === activeView));
}

export function allAllowedGuideFeatures(permissions: number[], root: boolean, admin = root) {
  const session = { permissions, root, admin };
  return GUIDE_FEATURES.filter(feature => canAccessGuideFeature(feature, session));
}

export type DynamicGuideFeature = { id:string; title:string; summary:string; target?:string; kind:string; stableKey?:string };

function slug(value:string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,"-").replace(/^-|-$/g,"").slice(0,28) || "control";
}
function stableHash(value:string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
export function stableDynamicControlId(activeView:string, descriptor:{title:string;kind?:string;target?:string;featureId?:string;stableKey?:string;name?:string;href?:string;role?:string;parentKey?:string}) {
  const explicit = String(descriptor.featureId || descriptor.target || "").trim();
  if (explicit) return explicit;
  const declaredStable = String(descriptor.stableKey || "").trim();
  if (declaredStable) return `runtime.${slug(activeView)}.${slug(declaredStable)}.${stableHash(`${activeView}|${declaredStable}`)}`;
  const title = String(descriptor.title || "").replace(/\s+/g," ").trim();
  // Ignore only badge-like counters. Meaningful numbers such as «قاعة 101» must remain
  // part of the identity so sibling controls do not collapse into one runtime feature.
  const stableTitle = title
    .replace(/(?:\d+|[٠-٩]+)\s*\+\s*$/u,"#")
    .replace(/((?:الجديد|جديد|إشعارات?|اشعارات?|تنبيهات?|رسائل?|غير\s*مقروء|updates?|notifications?|unread)\s*[:：·-]?\s*)(?:\d+|[٠-٩]+)\s*$/iu,"$1#")
    .replace(/\s+/g," ").trim();
  const strongAnchor = String(descriptor.name || descriptor.href || "").trim();
  const fingerprint = [activeView, descriptor.kind || "control", strongAnchor || stableTitle, descriptor.role || "", descriptor.parentKey || ""].join("|");
  return `runtime.${slug(activeView)}.${slug(strongAnchor || stableTitle)}.${stableHash(fingerprint)}`;
}

/** Runtime discovery is a safety net, not a replacement for registry metadata. */
export function discoverVisibleControls(activeView: string): DynamicGuideFeature[] {
  if (typeof document === "undefined") return [];
  const seen = new Set<string>();
  const result: DynamicGuideFeature[] = [];
  const controls = document.querySelectorAll<HTMLElement>(
    '[data-guide-target],[data-guide-feature-id],[data-guide-stable-id],button:not([aria-hidden="true"]),a[href],[role="button"],select,input[type="search"]',
  );
  controls.forEach((element) => {
    if (element.offsetParent === null) return;
    if (element.closest(".smart-guide,.guide-point-banner,.guide-screen-handoff") || element.closest("[data-guide-ignore]")) return;
    const owner = element.closest<HTMLElement>("[data-guide-feature-id],[data-guide-target]");
    const featureId = element.getAttribute("data-guide-feature-id") || owner?.getAttribute("data-guide-feature-id") || "";
    const target = element.getAttribute("data-guide-target") || owner?.getAttribute("data-guide-target") || "";
    const stableKey = element.getAttribute("data-guide-stable-id") || "";
    const label = String(element.getAttribute("data-guide-title") || element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent || "").replace(/\s+/g," ").trim().slice(0,72);
    if (!label || label.length < 2) return;
    const parent = element.parentElement?.closest<HTMLElement>("[data-guide-feature-id],[data-guide-target],[data-guide-stable-id],[aria-label],section,nav,header,footer");
    const parentKey = String(parent?.getAttribute("data-guide-feature-id") || parent?.getAttribute("data-guide-target") || parent?.getAttribute("data-guide-stable-id") || parent?.getAttribute("aria-label") || parent?.tagName || "");
    const id = stableDynamicControlId(activeView, {
      title:label,
      kind:element.tagName.toLowerCase(),
      featureId,
      target,
      stableKey,
      name:element.getAttribute("name") || element.getAttribute("type") || "",
      href:element.getAttribute("href") || "",
      role:element.getAttribute("role") || "",
      parentKey,
    });
    if (seen.has(id)) return;
    seen.add(id);
    result.push({
      id,
      target: featureId || target || undefined,
      stableKey: stableKey || undefined,
      title: label,
      summary: featureId || target ? "عنصر حي في هذه الشاشة؛ يمكنك الإشارة إليه وسيشرح المرشد وظيفته ضمن السياق الحالي." : "عنصر متاح الآن في الشاشة الحالية.",
      kind: element.tagName.toLowerCase(),
    });
  });
  return result.slice(0,80);
}

export type GuideBaseline = {
  completed:number;
  failed:number;
  abandoned:number;
  totalCompletionMs:number;
  medianCompletionMs:number;
  typicalStepCount:number;
  averageRetries:number;
  successRate:number;
  failureRate:number;
  normalDwellMs:number;
  durationSamples:number[];
  dwellSamples:number[];
  stepSamples:number[];
  retrySamples:number[];
  lastSuccessAt:number;
};

export type GuideMastery = {
  uses:number;
  successes:number;
  failures:number;
  helps:number;
  resolvedAfterHelp:number;
  attempts:number;
  started:number;
  completed:number;
  abandoned:number;
  lastUsed:number;
  lastHelp:number;
  versionSeen:number;
  baseline:GuideBaseline;
};

export type GuideJourneyStep = {
  id:string;
  featureId?:string;
  successSignal:string;
  failureSignal?:string;
  userDecision?:boolean;
};
export type GuideJourneyDefinition = {
  id:string;
  featureId:string;
  goal:string;
  steps:GuideJourneyStep[];
  entryConditions:string[];
  successConditions:string[];
  failureConditions:string[];
  safeActions:string[];
  userDecisionSteps:string[];
  rollback:string;
  timeoutMs:number;
  normalRepetition:number;
  expertThreshold:number;
};

export const GUIDE_JOURNEYS: GuideJourneyDefinition[] = [
  { id:"journey.schedule.move-room", featureId:"schedule.action.move-room", goal:"نقل مقرر إلى قاعة أو موضع جديد دون تعارض", steps:[
    {id:"select",featureId:"schedule.action.move-room",successSignal:"schedule.row.selected"},
    {id:"rooms",featureId:"schedule.view.rooms",successSignal:"schedule.view.rooms.active"},
    {id:"destination",successSignal:"schedule.move.destination.selected",userDecision:true},
    {id:"verify",successSignal:"schedule.move.verified",failureSignal:"schedule.move.conflict"},
    {id:"commit",successSignal:"schedule.move.completed",failureSignal:"schedule.move.failed",userDecision:true},
  ], entryConditions:["selected schedule row"], successConditions:["row placement changed","write verified","no blocking conflict"], failureConditions:["blocking conflict","write rejected","journey timeout"], safeActions:["schedule.action.move-room","schedule.action.find-room"], userDecisionSteps:["destination","commit"], rollback:"schedule undo transaction", timeoutMs:120000, normalRepetition:1, expertThreshold:4 },
  { id:"journey.schedule.change-time", featureId:"schedule.action.change-time", goal:"تغيير وقت مقرر وحفظه بنجاح", steps:[
    {id:"select",successSignal:"schedule.row.selected"},{id:"edit",successSignal:"schedule.editor.open"},{id:"change",successSignal:"schedule.time.changed",userDecision:true},{id:"save",successSignal:"schedule.edit.completed",failureSignal:"schedule.edit.failed",userDecision:true},
  ], entryConditions:["selected schedule row"], successConditions:["saved row time changed"], failureConditions:["blocking conflict","save rejected","journey timeout"], safeActions:["schedule.action.change-time"], userDecisionSteps:["change","save"], rollback:"schedule undo transaction", timeoutMs:120000, normalRepetition:1, expertThreshold:4 },
  { id:"journey.schedule.change-course", featureId:"schedule.action.change-course", goal:"تغيير المقرر المرتبط بموعد وحفظه بنجاح", steps:[
    {id:"select",successSignal:"schedule.row.selected"},{id:"edit",successSignal:"schedule.editor.open"},{id:"change",successSignal:"schedule.course.changed",userDecision:true},{id:"save",successSignal:"schedule.edit.completed",failureSignal:"schedule.edit.failed",userDecision:true},
  ], entryConditions:["selected schedule row"], successConditions:["saved course changed"], failureConditions:["blocking conflict","save rejected","journey timeout"], safeActions:["schedule.action.change-course"], userDecisionSteps:["change","save"], rollback:"schedule undo transaction", timeoutMs:120000, normalRepetition:1, expertThreshold:4 },
  { id:"journey.schedule.change-instructor", featureId:"schedule.action.change-instructor", goal:"تغيير أستاذ مقرر وحفظه بنجاح", steps:[
    {id:"select",successSignal:"schedule.row.selected"},{id:"edit",successSignal:"schedule.editor.open"},{id:"change",successSignal:"schedule.instructor.changed",userDecision:true},{id:"save",successSignal:"schedule.edit.completed",failureSignal:"schedule.edit.failed",userDecision:true},
  ], entryConditions:["selected schedule row"], successConditions:["saved instructor changed"], failureConditions:["blocking conflict","save rejected","journey timeout"], safeActions:["schedule.action.change-instructor"], userDecisionSteps:["change","save"], rollback:"schedule undo transaction", timeoutMs:120000, normalRepetition:1, expertThreshold:4 },
  { id:"journey.schedule.review", featureId:"schedule.tool.review", goal:"فتح مراجعة الاعتماد والوصول إلى قراءتها", steps:[{id:"open",successSignal:"schedule.review.open"}], entryConditions:["schedule workspace"], successConditions:["review panel visible"], failureConditions:["permission denied","journey timeout"], safeActions:["schedule.tool.review"], userDecisionSteps:[], rollback:"none", timeoutMs:30000, normalRepetition:2, expertThreshold:6 },
  { id:"journey.schedule.search", featureId:"schedule.search.quick", goal:"العثور على نتيجة داخل الجدول", steps:[{id:"query",successSignal:"schedule.search.query"},{id:"result",successSignal:"schedule.search.result"}], entryConditions:["schedule workspace"], successConditions:["matching result visible or opened"], failureConditions:["no result","journey timeout"], safeActions:[], userDecisionSteps:["query"], rollback:"none", timeoutMs:60000, normalRepetition:2, expertThreshold:6 },
  { id:"journey.schedule.find-room", featureId:"schedule.action.find-room", goal:"العثور على بديل مناسب للمقرر المحدد", steps:[{id:"select",successSignal:"schedule.row.selected"},{id:"alternatives",successSignal:"schedule.alternatives.ready",failureSignal:"schedule.alternatives.failed"}], entryConditions:["selected schedule row"], successConditions:["room alternatives prepared or comparison view opened"], failureConditions:["no selection","alternative lookup failed","journey timeout"], safeActions:["schedule.action.find-room"], userDecisionSteps:["select"], rollback:"none", timeoutMs:60000, normalRepetition:2, expertThreshold:5 },
  { id:"journey.schedule.data", featureId:"schedule.tool.data", goal:"فتح أدوات البيانات والوصول إلى العملية المطلوبة", steps:[{id:"open",successSignal:"schedule.transfer.open",failureSignal:"schedule.transfer.blocked"}], entryConditions:["schedule workspace"], successConditions:["data tools panel visible"], failureConditions:["mobile read-only gate","permission denied","journey timeout"], safeActions:["schedule.tool.data"], userDecisionSteps:[], rollback:"none", timeoutMs:30000, normalRepetition:2, expertThreshold:6 },
  { id:"journey.schedule.practice", featureId:"schedule.practice", goal:"الدخول في تجربة آمنة دون تعديل الجدول الحقيقي", steps:[{id:"start",successSignal:"schedule.practice.active"}], entryConditions:["schedule workspace"], successConditions:["practice mode active","real schedule snapshot preserved"], failureConditions:["practice mode unavailable","journey timeout"], safeActions:["schedule.practice"], userDecisionSteps:[], rollback:"practice.stop", timeoutMs:30000, normalRepetition:1, expertThreshold:4 },
  { id:"journey.intelligence.try", featureId:"intelligence.scene.try", goal:"فتح مساحة التجربة الآمنة داخل مركز الذكاء", steps:[{id:"open",successSignal:"intelligence.scene.try"}], entryConditions:["intelligence workspace"], successConditions:["try scene visible"], failureConditions:["permission denied","journey timeout"], safeActions:["intelligence.scene.try"], userDecisionSteps:[], rollback:"none", timeoutMs:30000, normalRepetition:2, expertThreshold:6 },
  { id:"journey.intelligence.approve", featureId:"intelligence.scene.approve", goal:"الوصول إلى مساحة اعتماد القرار", steps:[{id:"open",successSignal:"intelligence.scene.approve"}], entryConditions:["intelligence workspace"], successConditions:["approve scene visible"], failureConditions:["permission denied","journey timeout"], safeActions:["intelligence.scene.approve"], userDecisionSteps:[], rollback:"none", timeoutMs:30000, normalRepetition:2, expertThreshold:6 },
];

export const journeyById = (id:string) => GUIDE_JOURNEYS.find(journey => journey.id === id) || null;
export const journeyForFeature = (featureId:string) => GUIDE_JOURNEYS.find(journey => journey.featureId === featureId) || null;

export type GuideJourneyState = {
  journeyId:string;
  featureId:string;
  startedAt:number;
  updatedAt:number;
  stepIndex:number;
  stepCount:number;
  retries:number;
  failures:number;
  status:"active"|"completed"|"failed"|"abandoned";
  lastSignal?:string;
};

export type GuideTransactionOperation = { id:string; featureId:string; label:string; execute?:GuideCommand; rollback?:GuideCommand; verified?:boolean };
export type GuideTransaction = { id:string; title:string; startedAt:number; completedAt?:number; status:"open"|"completed"|"rolledBack"|"failed"; operations:GuideTransactionOperation[] };

export type GuideProfile = {
  schema:number;
  userId:number;
  mastery:Record<string,GuideMastery>;
  routes:Record<string,number>;
  workflows:Record<string,{count:number;last:number;sequence:string[];successful?:number}>;
  sequence:string[];
  ignored:Record<string,number>;
  hintMode:"auto"|"quiet"|"off";
  lastHintAt:number;
  onboardingDone?:boolean;
  launcherIntroduced?:boolean;
  iconHints?:Record<string,boolean>;
  routines?:Record<string,{id:string;name:string;sequence:string[];createdAt:number;lastUsed:number}>;
  friction?:Record<string,{count:number;last:number}>;
  catalog?:Record<string,number>;
  discovered?:Record<string,{id:string;title:string;view:string;target?:string;kind:string;stableKey?:string;firstSeen:number;lastSeen:number;seen:boolean;source?:"runtime"}>;
  discoveryInitializedViews?:Record<string,boolean>;
  currentTask?: { id:string; title:string; featureId?:string; target?:string; command?:any; startedAt:number; updatedAt:number; step?:number; journeyId?:string };
  previousTask?: { id:string; title:string; featureId?:string; target?:string; command?:any; startedAt:number; updatedAt:number; step?:number; journeyId?:string };
  journeys?:Record<string,GuideJourneyState>;
  previousJourney?:GuideJourneyState;
  transactions?:GuideTransaction[];
};

const currentGuideCatalog = () => Object.fromEntries(GUIDE_FEATURES.map(feature => [feature.id, feature.version]));
const blankBaseline = ():GuideBaseline => ({completed:0,failed:0,abandoned:0,totalCompletionMs:0,medianCompletionMs:0,typicalStepCount:0,averageRetries:0,successRate:0,failureRate:0,normalDwellMs:0,durationSamples:[],dwellSamples:[],stepSamples:[],retrySamples:[],lastSuccessAt:0});
const blankMastery = ():GuideMastery => ({uses:0,successes:0,failures:0,helps:0,resolvedAfterHelp:0,attempts:0,started:0,completed:0,abandoned:0,lastUsed:0,lastHelp:0,versionSeen:0,baseline:blankBaseline()});
const profileKey = (userId:number) => `schedule-smart-guide-v${GUIDE_SCHEMA_VERSION}:${Number(userId)||0}`;
const median=(values:number[])=>{const sorted=[...values].filter(Number.isFinite).sort((a,b)=>a-b);if(!sorted.length)return 0;const mid=Math.floor(sorted.length/2);return sorted.length%2?sorted[mid]:Math.round((sorted[mid-1]+sorted[mid])/2);};
const mean=(values:number[])=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:0;

function normalizeMastery(row:any):GuideMastery {
  const base={...blankMastery(),...(row||{})};
  base.attempts=Number(row?.attempts ?? row?.uses ?? 0);
  base.started=Number(row?.started ?? 0);
  base.completed=Number(row?.completed ?? row?.successes ?? 0);
  base.abandoned=Number(row?.abandoned ?? 0);
  base.uses=Number(row?.uses ?? base.attempts);
  base.successes=Number(row?.successes ?? base.completed);
  base.failures=Number(row?.failures ?? 0);
  base.helps=Number(row?.helps ?? 0);
  base.resolvedAfterHelp=Number(row?.resolvedAfterHelp ?? 0);
  base.baseline={...blankBaseline(),...(row?.baseline||{})};
  base.baseline.durationSamples=Array.isArray(base.baseline.durationSamples)?base.baseline.durationSamples.slice(-21):[];
  base.baseline.dwellSamples=Array.isArray(base.baseline.dwellSamples)?base.baseline.dwellSamples.slice(-21):[];
  base.baseline.stepSamples=Array.isArray(base.baseline.stepSamples)?base.baseline.stepSamples.slice(-21):[];
  base.baseline.retrySamples=Array.isArray(base.baseline.retrySamples)?base.baseline.retrySamples.slice(-21):[];
  return base;
}

export function loadGuideProfile(userId:number):GuideProfile {
  const blank:GuideProfile={schema:GUIDE_SCHEMA_VERSION,userId:Number(userId)||0,mastery:{},routes:{},workflows:{},sequence:[],ignored:{},hintMode:"auto",lastHintAt:0,onboardingDone:false,launcherIntroduced:false,iconHints:{},routines:{},friction:{},catalog:currentGuideCatalog(),discovered:{},discoveryInitializedViews:{},journeys:{},transactions:[]};
  try {
    const exact=JSON.parse(localStorage.getItem(profileKey(userId))||"null");
    if(exact && exact.schema===GUIDE_SCHEMA_VERSION){
      const mastery=Object.fromEntries(Object.entries(exact.mastery||{}).map(([id,row])=>[id,normalizeMastery(row)]));
      return {...blank,...exact,mastery,routines:exact.routines||{},friction:exact.friction||{},catalog:exact.catalog||currentGuideCatalog(),discovered:exact.discovered||{},discoveryInitializedViews:exact.discoveryInitializedViews||{},journeys:exact.journeys||{},transactions:Array.isArray(exact.transactions)?exact.transactions.slice(-8):[],iconHints:exact.iconHints||{}};
    }
    for(let version=GUIDE_SCHEMA_VERSION-1;version>=1;version--){
      const legacy=JSON.parse(localStorage.getItem(`schedule-smart-guide-v${version}:${Number(userId)||0}`)||"null");
      if(legacy){
        const mastery=Object.fromEntries(Object.entries(legacy.mastery||{}).map(([id,row])=>[id,normalizeMastery(row)]));
        const legacyDiscovered=Object.fromEntries(Object.entries(legacy.discovered||{}).filter(([id])=>!String(id).startsWith("auto.")).map(([id,row]:any)=>[id,{...row,seen:true,source:"runtime"}]));
        const migrated={...blank,...legacy,mastery,schema:GUIDE_SCHEMA_VERSION,userId:Number(userId)||0,routines:legacy.routines||{},friction:legacy.friction||{},catalog:legacy.catalog||currentGuideCatalog(),discovered:legacyDiscovered,discoveryInitializedViews:{},journeys:legacy.journeys||{},transactions:Array.isArray(legacy.transactions)?legacy.transactions.slice(-8):[],iconHints:legacy.iconHints||{}};
        saveGuideProfile(migrated);return migrated;
      }
    }
  } catch {}
  return blank;
}
export function saveGuideProfile(profile:GuideProfile) {
  try { localStorage.setItem(profileKey(profile.userId), JSON.stringify(profile)); if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent("schedule-smart-guide-profile",{detail:{userId:profile.userId}})); } catch {}
}
export function mutateGuideProfile(userId:number, updater:(p:GuideProfile)=>void) { const p=loadGuideProfile(userId); updater(p); saveGuideProfile(p); return p; }

export function masteryScore(profile:GuideProfile, feature:GuideFeature|string|null):number {
  if(!feature) return 0;
  const f=typeof feature==="string"?featureById(feature):feature;
  const id=typeof feature==="string"?feature:feature.id;
  const m=normalizeMastery(profile.mastery[id]);
  const ageDays=m.lastUsed?Math.max(0,(Date.now()-m.lastUsed)/86400000):365;
  const decay=Math.exp(-ageDays/240);
  const evidence=Math.min(1,(m.completed*1.65 - m.failures*1.55 - m.abandoned*.65 - m.helps*.15)/10);
  const reliability=m.baseline.successRate || (m.attempts?m.completed/Math.max(1,m.attempts):0);
  let raw=Math.max(0,Math.min(1,evidence*.74+reliability*.26));
  if(f && m.versionSeen && m.versionSeen < f.version) raw*=.45;
  return Math.max(0,Math.min(1,raw*decay));
}

function updateBaseline(m:GuideMastery,outcome:GuideOutcome,metrics?:{durationMs?:number;stepCount?:number;retries?:number;dwellMs?:number}){
  const baseline=m.baseline||blankBaseline();
  if(outcome==="completed"){
    baseline.completed+=1;baseline.lastSuccessAt=Date.now();
    if(Number.isFinite(metrics?.durationMs)){baseline.totalCompletionMs+=Math.max(0,Number(metrics!.durationMs));baseline.durationSamples=[...baseline.durationSamples,Math.max(0,Number(metrics!.durationMs))].slice(-21);}
    if(Number.isFinite(metrics?.stepCount))baseline.stepSamples=[...baseline.stepSamples,Math.max(1,Number(metrics!.stepCount))].slice(-21);
    if(Number.isFinite(metrics?.retries))baseline.retrySamples=[...baseline.retrySamples,Math.max(0,Number(metrics!.retries))].slice(-21);
  }
  if(outcome==="failed")baseline.failed+=1;
  if(outcome==="abandoned")baseline.abandoned+=1;
  if(Number.isFinite(metrics?.dwellMs))baseline.dwellSamples=[...baseline.dwellSamples,Math.max(0,Number(metrics!.dwellMs))].slice(-21);
  baseline.medianCompletionMs=median(baseline.durationSamples);
  baseline.normalDwellMs=median(baseline.dwellSamples);
  baseline.typicalStepCount=Math.round(median(baseline.stepSamples));
  baseline.averageRetries=Math.round(mean(baseline.retrySamples)*10)/10;
  const total=Math.max(1,baseline.completed+baseline.failed+baseline.abandoned);
  baseline.successRate=baseline.completed/total;
  baseline.failureRate=baseline.failed/total;
  m.baseline=baseline;
}

export function recordFeatureEvent(userId:number, featureId:string, outcome:GuideOutcome, metrics?:{durationMs?:number;stepCount?:number;retries?:number;dwellMs?:number}) {
  return mutateGuideProfile(userId,p=>{
    const feature=featureById(featureId);const m=normalizeMastery(p.mastery[featureId]);m.lastUsed=Date.now();
    if(outcome==="attempt"){m.attempts+=1;m.uses+=1;}
    if(outcome==="started")m.started+=1;
    if(outcome==="completed"){m.completed+=1;m.successes+=1;if(m.lastHelp&&Date.now()-m.lastHelp<10*60*1000){m.resolvedAfterHelp+=1;}}
    if(outcome==="failed")m.failures+=1;
    if(outcome==="abandoned")m.abandoned+=1;
    if(outcome==="helped"){m.helps+=1;m.lastHelp=Date.now();}
    if(outcome==="resolvedAfterHelp")m.resolvedAfterHelp+=1;
    updateBaseline(m,outcome,metrics);
    if(feature){m.versionSeen=Math.max(m.versionSeen,feature.version);if(!p.catalog)p.catalog={};p.catalog[featureId]=feature.version;}
    p.mastery[featureId]=m;
    if(outcome==="completed")recordSequenceInside(p,featureId,true);
  });
}

/** Backward-compatible alias. New code should use recordFeatureEvent. */
export function recordFeatureUse(userId:number, featureId:string, outcome?:"success"|"failure"|"help") {
  return recordFeatureEvent(userId,featureId,outcome==="success"?"completed":outcome==="failure"?"failed":outcome==="help"?"helped":"attempt");
}

export function recordFeatureDwell(userId:number,featureId:string,dwellMs:number){if(!Number.isFinite(dwellMs)||dwellMs<250)return loadGuideProfile(userId);return mutateGuideProfile(userId,p=>{const m=normalizeMastery(p.mastery[featureId]);updateBaseline(m,"started",{dwellMs:Math.min(30*60*1000,Math.max(0,dwellMs))});p.mastery[featureId]=m;});}

export function markFeatureSeen(userId:number, featureId:string) { return mutateGuideProfile(userId,p=>{const feature=featureById(featureId);if(!feature)return;const m=normalizeMastery(p.mastery[featureId]);m.versionSeen=feature.version;p.mastery[featureId]=m;if(!p.catalog)p.catalog={};p.catalog[featureId]=feature.version;}); }
export function setLauncherIntroduced(userId:number,value=true){return mutateGuideProfile(userId,p=>{p.launcherIntroduced=value;});}
export function markGuideIconHintSeen(userId:number,key:string){return mutateGuideProfile(userId,p=>{if(!p.iconHints)p.iconHints={};p.iconHints[key]=true;});}

function recordSequenceInside(p:GuideProfile,id:string,successful=false){
  if(!id)return;p.sequence=[...p.sequence,id].slice(-12);
  for(const size of [3,4,5]){if(p.sequence.length<size)continue;const seq=p.sequence.slice(-size);const key=seq.join("→");const w=p.workflows[key]||{count:0,last:0,sequence:seq,successful:0};w.count+=1;if(successful)w.successful=Number(w.successful||0)+1;w.last=Date.now();w.sequence=seq;p.workflows[key]=w;}
  p.workflows=Object.fromEntries(Object.entries(p.workflows).sort((a,b)=>b[1].last-a[1].last).slice(0,60));
}
export function recordRoute(userId:number,from:string,to:string){if(!from||!to||from===to)return loadGuideProfile(userId);return mutateGuideProfile(userId,p=>{const key=`${from}>${to}`;p.routes[key]=Number(p.routes[key]||0)+1;recordSequenceInside(p,`page.${to}`);});}
export function commonWorkflows(profile:GuideProfile, activeView:string){return Object.values(profile.workflows).filter(w=>w.count>=5&&w.sequence.some(id=>id===`page.${activeView}`||featureById(id)?.view===activeView)).sort((a,b)=>Number(b.successful||0)-Number(a.successful||0)||b.count-a.count||b.last-a.last).slice(0,3);}

export function changedFeatures(profile:GuideProfile,activeView:string,permissions:number[],root:boolean,admin=root){const catalog=profile.catalog||{};return allowedGuideFeatures(activeView,permissions,root,admin).filter(feature=>catalog[feature.id]==null||feature.version>Number(catalog[feature.id]||0)).sort((a,b)=>b.version-a.version);}
export function rankChangedFeatures(profile:GuideProfile,features:GuideFeature[]){return [...features].sort((a,b)=>{const ma=normalizeMastery(profile.mastery[a.id]),mb=normalizeMastery(profile.mastery[b.id]);const ra=(ma.uses+1)*(1-masteryScore(profile,a))*a.version;const rb=(mb.uses+1)*(1-masteryScore(profile,b))*b.version;return rb-ra;});}

export function canProactivelyHint(profile:GuideProfile,key:string,severity:GuideConfidence|"soft"|"strong"="medium"){
  const normalized:GuideConfidence=severity==="strong"?"high":severity==="soft"?"medium":severity;
  if(profile.hintMode==="off")return false;if(profile.hintMode==="quiet"&&normalized!=="high")return false;const now=Date.now();const cooldown=normalized==="high"?90_000:normalized==="medium"?6*60_000:12*60_000;if(now-profile.lastHintAt<cooldown)return false;if(now-Number(profile.ignored[key]||0)<24*60*60*1000)return false;return true;
}
export function noteHint(userId:number,key:string,ignored=false){return mutateGuideProfile(userId,p=>{p.lastHintAt=Date.now();if(ignored)p.ignored[key]=Date.now();});}
export function setHintMode(userId:number,mode:GuideProfile["hintMode"]){return mutateGuideProfile(userId,p=>{p.hintMode=mode;});}
export function silenceHint(userId:number,key:string){return mutateGuideProfile(userId,p=>{p.ignored[key]=Number.MAX_SAFE_INTEGER;p.lastHintAt=Date.now();});}
export function setGuideTask(userId:number,task:GuideProfile["currentTask"]|undefined){return mutateGuideProfile(userId,p=>{if(task&&p.currentTask&&p.currentTask.id!==task.id)p.previousTask=p.currentTask;if(!task&&p.currentTask)p.previousTask=p.currentTask;p.currentTask=task;});}
export function setOnboardingDone(userId:number,value=true){return mutateGuideProfile(userId,p=>{p.onboardingDone=value;});}

export function startGuideJourney(userId:number,journeyId:string){const def=journeyById(journeyId);if(!def)return loadGuideProfile(userId);return mutateGuideProfile(userId,p=>{if(!p.journeys)p.journeys={};const previous=p.journeys[journeyId]||p.previousJourney?.journeyId===journeyId?p.previousJourney:undefined;p.journeys[journeyId]={journeyId,featureId:def.featureId,startedAt:Date.now(),updatedAt:Date.now(),stepIndex:0,stepCount:0,retries:previous?.status==="failed"?Number(previous.retries||0)+1:0,failures:0,status:"active"};});}
export function ensureGuideJourney(userId:number,journeyId:string){const current=loadGuideProfile(userId);if(current.journeys?.[journeyId]?.status==="active")return current;return startGuideJourney(userId,journeyId);}
function recordFeatureEventInside(p:GuideProfile,featureId:string,outcome:GuideOutcome,metrics?:{durationMs?:number;stepCount?:number;retries?:number;dwellMs?:number}){const feature=featureById(featureId);const m=normalizeMastery(p.mastery[featureId]);m.lastUsed=Date.now();if(outcome==="attempt"){m.attempts++;m.uses++;}if(outcome==="started")m.started++;if(outcome==="completed"){m.completed++;m.successes++;if(m.lastHelp&&Date.now()-m.lastHelp<10*60*1000)m.resolvedAfterHelp++;}if(outcome==="failed")m.failures++;if(outcome==="abandoned")m.abandoned++;if(outcome==="helped"){m.helps++;m.lastHelp=Date.now();}updateBaseline(m,outcome,metrics);if(feature)m.versionSeen=Math.max(m.versionSeen,feature.version);p.mastery[featureId]=m;if(outcome==="completed")recordSequenceInside(p,featureId,true);}
export function advanceGuideJourney(userId:number,journeyId:string,signal:string){const def=journeyById(journeyId);if(!def)return loadGuideProfile(userId);return mutateGuideProfile(userId,p=>{if(!p.journeys)p.journeys={};let state=p.journeys[journeyId];if(!state||state.status!=="active")state={journeyId,featureId:def.featureId,startedAt:Date.now(),updatedAt:Date.now(),stepIndex:0,stepCount:0,retries:0,failures:0,status:"active"};const failure=def.steps.find(step=>step.failureSignal===signal);if(failure){state.failures+=1;state.lastSignal=signal;state.updatedAt=Date.now();p.journeys[journeyId]=state;return;}const nextIndex=def.steps.findIndex((step,index)=>index>=state.stepIndex&&step.successSignal===signal);if(nextIndex>=0){state.stepIndex=Math.min(def.steps.length-1,nextIndex+1);state.stepCount+=1;state.lastSignal=signal;state.updatedAt=Date.now();}p.journeys[journeyId]=state;});}
export function completeGuideJourney(userId:number,journeyId:string){const def=journeyById(journeyId);if(!def)return loadGuideProfile(userId);return mutateGuideProfile(userId,p=>{const state=p.journeys?.[journeyId];if(!state)return;state.status="completed";state.updatedAt=Date.now();p.previousJourney={...state};delete p.journeys![journeyId];});}
export function failGuideJourney(userId:number,journeyId:string,signal="failed"){const def=journeyById(journeyId);if(!def)return loadGuideProfile(userId);return mutateGuideProfile(userId,p=>{const state=p.journeys?.[journeyId]||{journeyId,featureId:def.featureId,startedAt:Date.now(),updatedAt:Date.now(),stepIndex:0,stepCount:0,retries:0,failures:0,status:"active" as const};state.status="failed";state.failures+=1;state.lastSignal=signal;state.updatedAt=Date.now();p.previousJourney={...state};delete p.journeys?.[journeyId];});}
export function abandonGuideJourney(userId:number,journeyId:string){const def=journeyById(journeyId);if(!def)return loadGuideProfile(userId);return mutateGuideProfile(userId,p=>{const state=p.journeys?.[journeyId];if(!state)return;state.status="abandoned";state.updatedAt=Date.now();p.previousJourney={...state};delete p.journeys![journeyId];});}
export function expireGuideJourneys(userId:number, now=Date.now()){return mutateGuideProfile(userId,p=>{if(!p.journeys)return;for(const [journeyId,state] of Object.entries(p.journeys)){const def=journeyById(journeyId);if(!def||state.status!=="active")continue;if(now-state.updatedAt<=def.timeoutMs)continue;state.status="abandoned";state.updatedAt=now;state.lastSignal="journey.timeout";p.previousJourney={...state};recordFeatureEventInside(p,state.featureId,"abandoned",{durationMs:Math.max(0,now-state.startedAt),stepCount:state.stepCount,retries:state.retries});delete p.journeys[journeyId];}});}

export type GuideFrictionSignal={type:string;weight?:number;count?:number;featureId?:string;journeyId?:string;knownFailure?:boolean};
export function evaluateGuideFriction(profile:GuideProfile,feature:GuideFeature|null,signals:GuideFrictionSignal[]){const mastery=feature?masteryScore(profile,feature):0;let score=signals.reduce((sum,s)=>sum+(s.weight??1)*Math.max(1,s.count??1),0);const knownFailure=signals.some(s=>s.knownFailure);if(mastery>=.72)score*=.72;if(feature){const m=normalizeMastery(profile.mastery[feature.id]);if(m.versionSeen&&m.versionSeen<feature.version)score+=1.2;}const confidence:GuideConfidence=knownFailure||score>=5?"high":score>=2.5?"medium":"low";return {score:Math.round(score*100)/100,confidence,mastery};}
export function classifyGuideReason(input:{mastery:number;versionChanged?:boolean;hesitation?:boolean;blocked?:boolean;forgotten?:boolean;anomaly?:boolean}):GuideReason{if(input.blocked)return"BLOCKED";if(input.versionChanged)return"UI_CHANGED";if(input.hesitation)return"HESITANT";if(input.forgotten)return"FORGOTTEN";if(input.mastery>=.72&&!input.anomaly)return"NORMAL_EXPERT_BEHAVIOR";return"UNFAMILIAR";}

export type GuideActionDefinition={id:string;featureId:string;risk:GuideRisk;command?:GuideCommand;prepare?:GuideCommand;preview?:GuideCommand;execute?:GuideCommand;verify:{kind:"context"|"event"|"target";value:string};rollback?:GuideCommand;requiresConfirmation:boolean;permissionFeatureId:string};
export const GUIDE_ACTIONS:GuideActionDefinition[]=[
  {id:"action.schedule.list",featureId:"schedule.view.list",risk:"read",command:{scope:"schedule",type:"changeView",value:"list"},verify:{kind:"context",value:"schedule.view.list"},requiresConfirmation:false,permissionFeatureId:"schedule.view.list"},
  {id:"action.schedule.week",featureId:"schedule.view.week",risk:"read",command:{scope:"schedule",type:"changeView",value:"week"},verify:{kind:"context",value:"schedule.view.week"},requiresConfirmation:false,permissionFeatureId:"schedule.view.week"},
  {id:"action.schedule.rooms",featureId:"schedule.view.rooms",risk:"read",command:{scope:"schedule",type:"changeView",value:"rooms"},verify:{kind:"context",value:"schedule.view.rooms"},requiresConfirmation:false,permissionFeatureId:"schedule.view.rooms"},
  {id:"action.schedule.move-room",featureId:"schedule.action.move-room",risk:"prepare",prepare:{scope:"schedule",type:"assistMoveRoom"},verify:{kind:"event",value:"schedule.move.prepared"},requiresConfirmation:false,permissionFeatureId:"page.schedules"},
  {id:"action.schedule.change-time",featureId:"schedule.action.change-time",risk:"prepare",prepare:{scope:"schedule",type:"openEditSelected",task:"time"},verify:{kind:"event",value:"schedule.editor.open"},requiresConfirmation:false,permissionFeatureId:"page.schedules"},
  {id:"action.schedule.change-course",featureId:"schedule.action.change-course",risk:"prepare",prepare:{scope:"schedule",type:"openEditSelected",task:"course"},verify:{kind:"event",value:"schedule.editor.open"},requiresConfirmation:false,permissionFeatureId:"page.schedules"},
  {id:"action.schedule.change-instructor",featureId:"schedule.action.change-instructor",risk:"prepare",prepare:{scope:"schedule",type:"openEditSelected",task:"instructor"},verify:{kind:"event",value:"schedule.editor.open"},requiresConfirmation:false,permissionFeatureId:"page.schedules"},
  {id:"action.schedule.find-room",featureId:"schedule.action.find-room",risk:"read",command:{scope:"schedule",type:"findAlternativeSelected"},verify:{kind:"event",value:"schedule.alternatives.ready"},requiresConfirmation:false,permissionFeatureId:"page.schedules"},
  {id:"action.schedule.review",featureId:"schedule.tool.review",risk:"read",command:{scope:"schedule",type:"openReview"},verify:{kind:"event",value:"schedule.review.open"},requiresConfirmation:false,permissionFeatureId:"page.schedules"},
  {id:"action.schedule.data",featureId:"schedule.tool.data",risk:"prepare",prepare:{scope:"schedule",type:"openTransfer"},verify:{kind:"event",value:"schedule.transfer.open"},requiresConfirmation:false,permissionFeatureId:"page.schedules"},
  {id:"action.schedule.practice",featureId:"schedule.practice",risk:"read",command:{scope:"schedule",type:"practice.start"},verify:{kind:"event",value:"schedule.practice.active"},rollback:{scope:"schedule",type:"practice.stop"},requiresConfirmation:false,permissionFeatureId:"page.schedules"},
  {id:"action.intelligence.understand",featureId:"intelligence.scene.understand",risk:"read",command:{scope:"intelligence",type:"scene",value:"understand"},verify:{kind:"context",value:"intelligence.scene.understand"},requiresConfirmation:false,permissionFeatureId:"page.intelligence"},
  {id:"action.intelligence.ask-table",featureId:"intelligence.ask-table",risk:"read",command:{scope:"intelligence",type:"tab",value:"copilot"},verify:{kind:"context",value:"intelligence.ask-table"},requiresConfirmation:false,permissionFeatureId:"page.intelligence"},
  {id:"action.intelligence.try",featureId:"intelligence.scene.try",risk:"read",command:{scope:"intelligence",type:"scene",value:"try"},verify:{kind:"context",value:"intelligence.scene.try"},requiresConfirmation:false,permissionFeatureId:"page.intelligence"},
  {id:"action.intelligence.approve",featureId:"intelligence.scene.approve",risk:"read",command:{scope:"intelligence",type:"scene",value:"approve"},verify:{kind:"context",value:"intelligence.scene.approve"},requiresConfirmation:false,permissionFeatureId:"page.intelligence"},
  /* Sensitive/write actions are registered even when the guide deliberately
     refuses to execute them. Their risk and confirmation policy still live in
     the same source of truth used by search, audit and future integrations. */
  {id:"action.schedule.undo",featureId:"schedule.undo",risk:"write",verify:{kind:"target",value:"schedule.undo"},requiresConfirmation:true,permissionFeatureId:"page.schedules"},
  {id:"action.schedule.publish",featureId:"schedule.publish",risk:"sensitive",verify:{kind:"target",value:"schedule.publish"},requiresConfirmation:true,permissionFeatureId:"schedule.publish"},
  {id:"action.intelligence.publish-draft",featureId:"intelligence.publish-draft",risk:"sensitive",verify:{kind:"target",value:"intelligence.publish-draft"},requiresConfirmation:true,permissionFeatureId:"intelligence.publish-draft"},
];
export const guideActionForFeature=(featureId:string)=>GUIDE_ACTIONS.find(action=>action.featureId===featureId)||null;
export function canRunGuideAction(action:GuideActionDefinition,session:GuidePermissionSession){return canAccessGuideFeature(featureById(action.permissionFeatureId),session);}

export function beginGuideTransaction(userId:number,title:string){const id=`guide-tx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`;mutateGuideProfile(userId,p=>{p.transactions=[...(p.transactions||[]),{id,title,startedAt:Date.now(),status:"open" as const,operations:[]}].slice(-8);});return id;}
export function appendGuideTransactionOperation(userId:number,transactionId:string,operation:GuideTransactionOperation){return mutateGuideProfile(userId,p=>{const tx=p.transactions?.find(item=>item.id===transactionId);if(tx&&tx.status==="open")tx.operations.push(operation);});}
export function completeGuideTransaction(userId:number,transactionId:string){return mutateGuideProfile(userId,p=>{const tx=p.transactions?.find(item=>item.id===transactionId);if(tx){tx.status="completed";tx.completedAt=Date.now();}});}
export function failGuideTransaction(userId:number,transactionId:string){return mutateGuideProfile(userId,p=>{const tx=p.transactions?.find(item=>item.id===transactionId);if(tx){tx.status="failed";tx.completedAt=Date.now();}});}
export function transactionRollbackCommands(profile:GuideProfile,transactionId:string){const tx=profile.transactions?.find(item=>item.id===transactionId);return tx?.operations.slice().reverse().map(item=>item.rollback).filter(Boolean) as GuideCommand[]||[];}
export function markGuideTransactionRolledBack(userId:number,transactionId:string){return mutateGuideProfile(userId,p=>{const tx=p.transactions?.find(item=>item.id===transactionId);if(tx)tx.status="rolledBack";});}

export function saveGuideRoutine(userId:number,name:string,sequence:string[]){const clean=String(name||"").trim().slice(0,48)||"مساري المعتاد";const id=`routine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`;return mutateGuideProfile(userId,p=>{if(!p.routines)p.routines={};p.routines[id]={id,name:clean,sequence:sequence.slice(-8),createdAt:Date.now(),lastUsed:0};});}
export function touchGuideRoutine(userId:number,id:string){return mutateGuideProfile(userId,p=>{if(p.routines?.[id])p.routines[id].lastUsed=Date.now();});}
export function removeGuideRoutine(userId:number,id:string){return mutateGuideProfile(userId,p=>{if(p.routines)delete p.routines[id];});}
export function noteFriction(userId:number,key:string){return mutateGuideProfile(userId,p=>{if(!p.friction)p.friction={};const item=p.friction[key]||{count:0,last:0};item.count+=1;item.last=Date.now();p.friction[key]=item;});}

export function commonDestination(profile:GuideProfile,currentId:string){const from=String(currentId||"").replace(/^page\./,"");const rows=Object.entries(profile.routes||{}).filter(([key])=>key.startsWith(`${from}>`)).map(([key,count])=>({id:`page.${key.split(">")[1]}`,count:Number(count||0)})).filter(item=>item.count>=5).sort((a,b)=>b.count-a.count);const total=rows.reduce((sum,item)=>sum+item.count,0);return rows[0]?{...rows[0],confidence:Math.min(1,rows[0].count/Math.max(1,total))}:null;}
export function predictedNextFeature(profile:GuideProfile,currentId:string){
  const candidates=new Map<string,{id:string;count:number;successful:number;last:number}>();
  Object.values(profile.workflows||{}).forEach(workflow=>{
    const sequence=workflow.sequence||[];
    for(let i=0;i<sequence.length-1;i++){
      if(sequence[i]!==currentId)continue;
      const next=sequence[i+1];
      const current=candidates.get(next)||{id:next,count:0,successful:0,last:0};
      current.count+=Number(workflow.count||0);
      current.successful+=Number(workflow.successful||0);
      current.last=Math.max(current.last,Number(workflow.last||0));
      candidates.set(next,current);
    }
  });
  const workflow=[...candidates.values()]
    .filter(item=>item.count>=5&&item.successful>=3)
    .map(item=>{
      const successRate=Math.min(1,item.successful/Math.max(1,item.count));
      const evidence=Math.min(1,Math.log2(item.successful+1)/4);
      const confidence=Math.min(.97,successRate*.72+evidence*.28);
      return {...item,successRate,confidence};
    })
    .filter(item=>item.successRate>=.6)
    .sort((a,b)=>b.confidence-a.confidence||b.successful-a.successful||b.last-a.last)[0];
  if(workflow)return workflow;
  const route=commonDestination(profile,currentId);
  return route?{...route,last:0,confidence:Math.min(.64,Number(route.confidence||0)*.64),successful:0,successRate:0}:null;
}

export function dialectIntentTerms(value:string):string[]{const text=String(value||"").toLowerCase().replace(/[إأآ]/g,"ا").replace(/ى/g,"ي").replace(/[ً-ْٰـ]/g,"");const terms=new Set(text.split(/\s+/).filter(Boolean));const add=(...items:string[])=>items.forEach(item=>terms.add(item));if(/شلون|كيف/.test(text))add("كيف","طريقة","شرح");if(/شنو|ماذا/.test(text))add("ماذا","شرح");if(/وين|اين|وين القى|وين احصل|ما لقيت/.test(text))add("اين","مكان","افتح","بحث");if(/ليش|لماذا/.test(text))add("لماذا","سبب","تعارض","مشكلة");if(/ابي|اريد|ودي|سوي|سو لي|خلني|خله/.test(text))add("اريد","تنفيذ");if(/مادري|ما ادري|ما اعرف|مو عارف|متوهق/.test(text))add("شرح","مساعدة","طريقة");if(/طلع لي|ظهر لي|قاعد يطلع/.test(text))add("رسالة","مشكلة","سبب");if(/ضيعت|ضاع|راح علي|رجع لي/.test(text))add("تراجع","سجل","اخر تعديل");if(/ماده|الماده/.test(text))add("مقرر","نقل");if(/دكتور|الدكتور/.test(text))add("استاذ","عضو هيئة تدريس");if(/مو راضي|ما يرضى|ما يقبل|مو قابل|علق|متوهق/.test(text))add("مشكلة","تعارض","لا يقبل","نقل");if(/قاعه|قاعات|مبنى|مباني/.test(text))add("قاعة","قاعات","مبنى","نقل");if(/اسرع|اختصر|روتين|طريقتي/.test(text))add("مسار","اختصار","روتين");if(/وين كنت|شنو كنت|كنت اسوي|كنت اسوي شنو|ماذا كنت|اين توقفت|وين وقفت/.test(text))add("مهمة","اكمل","سابق");if(/نفس اللي|نفس الي|مثل امس|مثل أمس|سويته امس|سويته أمس|كرر السابق/.test(text))add("مسار","روتين","سابق","كرر");if(/جديد|شنو الجديد|ما الجديد/.test(text))add("جديد","تحديث");if(/الاربعاء|الأربعاء/.test(text))add("fwednesday","الأربعاء");if(/الثلاثاء/.test(text))add("ftuesday","الثلاثاء");if(/الاثنين|الإثنين/.test(text))add("fmonday","الاثنين");if(/الاحد|الأحد/.test(text))add("fsunday","الأحد");if(/الخميس/.test(text))add("fthursday","الخميس");return [...terms];}

export const GUIDE_INTENT_FEATURES:Record<string,string>={
  "move-room":"schedule.action.move-room","change-time":"schedule.action.change-time","change-course":"schedule.action.change-course","change-instructor":"schedule.action.change-instructor","find-room":"schedule.action.find-room",
  "view-list":"schedule.view.list","view-week":"schedule.view.week","view-rooms":"schedule.view.rooms","quick-search":"schedule.search.quick","undo":"schedule.undo","undo-log":"schedule.undo.log","review":"schedule.tool.review","data-tools":"schedule.tool.data","publish":"schedule.publish","practice":"schedule.practice",
  "dashboard":"page.dashboard","schedules":"page.schedules","intelligence":"page.intelligence","intelligence-understand":"intelligence.scene.understand","ask-table":"intelligence.ask-table","intelligence-try":"intelligence.scene.try","intelligence-approve":"intelligence.scene.approve",
  "search-instructor":"page.searchInstructor","search-room":"page.searchRoom","search-time":"page.searchTime","search-room-time":"page.searchRoomTime","search-advanced":"page.searchAdvanced",
  "report-department":"page.reportDepartment","report-instructor":"page.reportInstructor","report-room":"page.reportRoom","report-time":"page.reportTime","report-room-time":"page.reportRoomTime",
  "terms":"page.terms","colleges":"page.colleges","sections":"page.sections","instructors":"page.instructors","courses":"page.courses","users":"page.users","permissions":"page.permissions","scopes":"page.scopes","audit":"page.audit","backup":"page.backup","about":"page.about",
};
export function featureIdForGuideIntentGoal(goal:string){
  const clean=String(goal||"").trim();
  if(clean.startsWith("feature:")){const id=clean.slice(8);return featureById(id)?id:"";}
  return GUIDE_INTENT_FEATURES[clean]||"";
}

export type StructuredGuideIntent={goal:string;entities:{selectedId?:number;course?:string;day?:string;time?:string;room?:string;instructor?:string};constraints:{keepInstructor?:boolean;keepRoom?:boolean;findAlternativeRoom?:boolean};requestedAction:"explain"|"navigate"|"prepare"|"simulate"|"execute"|"unknown";confidence:number;compound:boolean;source:"rules"|"ai";clarification?:string};
function genericGuideIntentFeature(text:string){
  const needle=String(text||"").trim();
  if(!needle)return null;
  const terms=dialectIntentTerms(needle).map(term=>term.trim()).filter(term=>term.length>1);
  let best:{feature:GuideFeature;score:number}|null=null;
  for(const feature of GUIDE_FEATURES){
    const title=feature.title.toLowerCase().replace(/[إأآ]/g,"ا").replace(/ى/g,"ي");
    const hay=[feature.title,feature.summary,feature.group,...(feature.keywords||[])].join(" ").toLowerCase().replace(/[إأآ]/g,"ا").replace(/ى/g,"ي");
    let score=0;
    if(needle.includes(title)||title.includes(needle))score+=12;
    for(const term of terms){if(title.includes(term))score+=5;else if(hay.includes(term))score+=2;}
    if(!best||score>best.score)best={feature,score};
  }
  return best&&best.score>=6?best:null;
}
export function parseStructuredGuideIntent(value:string):StructuredGuideIntent{
  const raw=String(value||"");const text=raw.toLowerCase().replace(/[إأآ]/g,"ا").replace(/ى/g,"ي").replace(/[ً-ْٰـ]/g,"");
  const day=/اربعاء/.test(text)?"fwednesday":/ثلاثاء/.test(text)?"ftuesday":/اثنين/.test(text)?"fmonday":/احد/.test(text)?"fsunday":/خميس/.test(text)?"fthursday":undefined;
  const timeMatch=text.match(/(?:الساعه|الساعة|وقت)\s*(\d{1,2})(?::(\d{2}))?|(?:^|\s)(\d{1,2}):(\d{2})(?:\s|$)/);const timeHour=timeMatch?Number(timeMatch[1]||timeMatch[3]):NaN;const timeMinute=timeMatch?Number(timeMatch[2]||timeMatch[4]||0):NaN;const time=Number.isFinite(timeHour)?`${String(Math.min(23,Math.max(0,timeHour))).padStart(2,"0")}:${String(Math.min(59,Math.max(0,timeMinute))).padStart(2,"0")}`:undefined;
  const move=/(?:نقل|انقل|غير\s+(?:ال)?قاع|غير\s+قاع)/.test(text);const timeChange=/غير.*وقت|تغيير.*وقت|يصير يوم|خله يوم|خليه يوم|موعد/.test(text);const instructor=/غير.*دكتور|غير.*استاذ|تغيير.*استاذ/.test(text);const courseChange=/(?:غير|تغيير|استبدل|استبدال)\s+(?:هذا\s+|هذه\s+)?(?:المقرر|الماده|المادة)(?!\s*(?:وقته|وقت|استاذ|الأستاذ|الاستاذ|دكتور|قاعه|قاعة))/.test(text);const simulate=/جرب|جرّب|ماذا لو|بدون تغيير/.test(text);const explain=/شلون|كيف|وضح|شرح|ليش/.test(text);const navigate=/افتح|روح|اذهب|وين|اين|ابي اشوف|ارني/.test(text);const keepInstructor=/لا.*(?:ابي|اريد).*غير.*(?:دكتور|استاذ)|خله.*(?:دكتور|استاذ)|ابق.*(?:الاستاذ|الأستاذ)/.test(text);const findAlternativeRoom=/اذا.*قاع.*مشغ|دور.*قاع|قاعة.*بديل|قاعه.*بديل/.test(text);
  let goal=move?"move-room":timeChange?"change-time":instructor?"change-instructor":courseChange?"change-course":findAlternativeRoom?"find-room":"unknown";if(goal==="unknown"&&day&&time)goal="change-time";
  let generic:{feature:GuideFeature;score:number}|null=null;if(goal==="unknown"){generic=genericGuideIntentFeature(text);if(generic)goal=`feature:${generic.feature.id}`;}
  let requestedAction:StructuredGuideIntent["requestedAction"]=simulate?"simulate":move||timeChange||instructor||courseChange?"prepare":findAlternativeRoom?"navigate":explain?"explain":navigate?"navigate":"unknown";
  if(generic&&requestedAction==="unknown")requestedAction=generic.feature.risk==="prepare"||generic.feature.risk==="write"?"prepare":generic.feature.view?"navigate":"explain";
  const compound=[day,time,keepInstructor,findAlternativeRoom].filter(Boolean).length>=2;
  let confidence=goal!=="unknown"?.68:.25;if(day)confidence+=.08;if(time)confidence+=.08;if(move||timeChange||instructor||courseChange)confidence+=.08;if(simulate)confidence+=.05;if(compound)confidence+=.03;if(generic)confidence=Math.max(confidence,Math.min(.9,.56+generic.score*.025));
  const clarification=confidence<.62?"هل تقصد أن أشرح لك مكان الوظيفة، أم أجهز الخطوة الآمنة داخل الشاشة؟":undefined;
  return{goal,entities:{day,time},constraints:{keepInstructor,findAlternativeRoom},requestedAction,confidence:Math.min(.98,confidence),compound,source:"rules",clarification};
}
export function needsGuideAIFallback(intent:StructuredGuideIntent,query:string){return intent.confidence<.72||intent.compound||dialectIntentTerms(query).length>=10;}

export function noteDiscoveredControls(userId:number,activeView:string,items:DynamicGuideFeature[]){
  const p=loadGuideProfile(userId);
  if(!p.discovered)p.discovered={};
  if(!p.discoveryInitializedViews)p.discoveryInitializedViews={};
  const baseline=!p.discoveryInitializedViews[activeView];
  const now=Date.now();
  let changed=false;
  for(const item of items){
    if(featureById(item.id)||(item.target&&featureById(item.target)))continue;
    const id=String(item.id||"");
    if(!id)continue;
    const previous=p.discovered[id];
    if(!previous){
      p.discovered[id]={id,title:item.title,view:activeView,target:item.target,kind:item.kind,stableKey:item.stableKey,firstSeen:now,lastSeen:now,seen:baseline,source:"runtime"};
      changed=true;
      continue;
    }
    const materiallyChanged=previous.title!==item.title||previous.view!==activeView||previous.target!==item.target||previous.kind!==item.kind||String(previous.stableKey||"")!==String(item.stableKey||"");
    const refreshTimestamp=now-Number(previous.lastSeen||0)>60_000;
    if(materiallyChanged||refreshTimestamp){
      p.discovered[id]={...previous,title:item.title,view:activeView,target:item.target,kind:item.kind,stableKey:item.stableKey||previous.stableKey,lastSeen:now,seen:previous.seen,source:"runtime"};
      changed=true;
    }
  }
  if(baseline){p.discoveryInitializedViews[activeView]=true;changed=true;}
  const entries=Object.entries(p.discovered);
  const retained=entries.filter(([,item])=>now-Number(item.lastSeen||0)<120*24*60*60*1000).sort((a,b)=>Number(b[1].lastSeen)-Number(a[1].lastSeen)).slice(0,120);
  if(retained.length!==entries.length){p.discovered=Object.fromEntries(retained);changed=true;}
  if(changed)saveGuideProfile(p);
  return p;
}
export function discoveredNew(profile:GuideProfile,activeView?:string){const cutoff=Date.now()-60*24*60*60*1000;return Object.values(profile.discovered||{}).filter(item=>!item.seen&&Number(item.lastSeen||0)>=cutoff&&(!activeView||item.view===activeView)).sort((a,b)=>b.firstSeen-a.firstSeen);}
export function markDiscoveredSeen(userId:number,id:string){return mutateGuideProfile(userId,p=>{if(p.discovered?.[id])p.discovered[id].seen=true;});}
export function markAllDiscoveredSeen(userId:number,activeView?:string){return mutateGuideProfile(userId,p=>{Object.values(p.discovered||{}).forEach(item=>{if(!activeView||item.view===activeView)item.seen=true;});});}
export function unreadGuideProductUpdates(profile:GuideProfile,features:GuideFeature[]){const catalog=profile.catalog||{};return features.filter(feature=>catalog[feature.id]==null||feature.version>Number(catalog[feature.id]||0));}
export function markAllGuideProductUpdatesSeen(userId:number,features:GuideFeature[]){return mutateGuideProfile(userId,p=>{if(!p.catalog)p.catalog={};for(const feature of features){const m=normalizeMastery(p.mastery[feature.id]);m.versionSeen=Math.max(m.versionSeen,feature.version);p.mastery[feature.id]=m;p.catalog[feature.id]=feature.version;}});}
export function guideUnreadSummary(profile:GuideProfile,features:GuideFeature[],activeView:string){const product=unreadGuideProductUpdates(profile,features);const runtime=discoveredNew(profile,activeView);return{product,runtime,total:product.length+runtime.length};}
