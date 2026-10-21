import { scheduleDayWindowMinutes, withinScheduleDay } from "../src/utils/scheduleTime";

const assert=(condition:boolean,message:string)=>{if(!condition)throw new Error(message);};
const defaults=scheduleDayWindowMinutes();
assert(defaults.startTime==="08:00"&&defaults.endTime==="20:00","الافتراضي 08:00–20:00");
assert(withinScheduleDay(8*60,20*60),"النطاق الافتراضي يقبل حدّيه");
assert(!withinScheduleDay(7*60+59,9*60),"النطاق الافتراضي يرفض ما قبل البداية");
assert(!withinScheduleDay(19*60,20*60+1),"النطاق الافتراضي يرفض ما بعد النهاية");
const custom=scheduleDayWindowMinutes({scheduleDayStartTime:"07:00",scheduleDayEndTime:"19:00"});
assert(custom.startTime==="07:00"&&custom.endTime==="19:00","قراءة وقت القسم المخصص");
assert(withinScheduleDay(7*60,19*60,{startTime:"07:00",endTime:"19:00"}),"النطاق المخصص يقبل حدّيه");
assert(!withinScheduleDay(6*60+59,8*60,{startTime:"07:00",endTime:"19:00"}),"النطاق المخصص يرفض ما قبل البداية");
const invalid=scheduleDayWindowMinutes({startTime:"19:00",endTime:"07:00"});
assert(invalid.startTime==="08:00"&&invalid.endTime==="20:00","الإعداد غير الصالح يرجع إلى الافتراضي الآمن");
console.log("Schedule day window audit: 8 passed, 0 failed");
