import type { FSchedule } from "../types";

export type DayKey = "fsunday" | "fmonday" | "ftuesday" | "fwednesday" | "fthursday";

export const scheduleDays: Array<{ key: DayKey; label: string; short: string }> = [
  { key: "fsunday", label: "الأحد", short: "أحد" },
  { key: "fmonday", label: "الاثنين", short: "اثنين" },
  { key: "ftuesday", label: "الثلاثاء", short: "ثلاثاء" },
  { key: "fwednesday", label: "الأربعاء", short: "أربعاء" },
  { key: "fthursday", label: "الخميس", short: "خميس" },
];

export const blankSchedule = (): Omit<FSchedule, "id" | "AdCourseName"> => ({
  AdCollegeId: 0,
  AdSectionId: 0,
  AdTermId: 0,
  AdCourseId: 0,
  SCode: "",
  AdInstructorId: 0,
  fsunday: false,
  fmonday: false,
  ftuesday: false,
  fwednesday: false,
  fthursday: false,
  fstarttime: "",
  fendtime: "",
  AdRoomCode: "",
  AdRoomHall: "",
  fdetail: "",
});

export const scheduleArabicDays = (row: Partial<FSchedule>) =>
  scheduleDays.filter((day) => Boolean(row[day.key])).map((day) => day.label).join(" - ");

export const scheduleFriendlyError = (value: any) => {
  const text = String(value?.message || value || "تعذر تنفيذ العملية");
  if (/Failed to fetch|NetworkError/i.test(text))
    return "تعذر الاتصال بالخادم. لم يتم حفظ أي تغيير؛ تحقق من الإنترنت ثم أعد المحاولة.";
  if (/Unexpected token|JSON/i.test(text))
    return "وصل رد غير متوقع من الخادم. أعد تحميل الصفحة، وإذا استمرت المشكلة ارفع ملفات التحديث كاملة.";
  return text;
};

export const scheduleMinutes = (time: string) => {
  const [hour, minute] = String(time || "0:0").split(":").map(Number);
  return (hour || 0) * 60 + (minute || 0);
};

export const scheduleTimeFromMinutes = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
