/**
 * A free-room search must see every occupant of a hall — the ones linked to the
 * registry by id AND the ones (imports, legacy rows) that only carry the
 * building/hall as text. Both go through rowOccupiesRoom, the single rule the
 * slot advisor, «اقترح قاعة متاحة» and the barter free-window scan share.
 */
import { readFileSync } from "node:fs";
import { rowOccupiesRoom } from "../src/utils/locationRegistry";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => { if (ok) { passed++; console.log(`✓ ${name}`); } else { failed++; console.log(`✗ ${name}`); } };

const hall = { roomId: "r-17-f20", room: "17", hall: "F20" };
const at = (row: any) => rowOccupiesRoom(row, hall.roomId, hall.room, hall.hall);

check("حجزٌ مربوط بالسجل يشغل القاعة", at({ roomId: "r-17-f20", AdRoomCode: "17", AdRoomHall: "F20", locationStatus: "VERIFIED" }));
check("حجزٌ نصيّ بلا ربط يشغل القاعة نفسها", at({ AdRoomCode: "17", AdRoomHall: "F20" }));
check("النص يُطبَّع (مسافات وحالة الأحرف)", at({ AdRoomCode: " 17 ", AdRoomHall: "f20" }));
check("قاعة أخرى بالنص لا تشغلها", !at({ AdRoomCode: "17", AdRoomHall: "F21" }));
check("قاعة أخرى بالمعرّف لا تشغلها وإن تشابه النص", !at({ roomId: "r-other", AdRoomCode: "18", AdRoomHall: "F20" }));
check("صفٌّ بانتظار تثبيت القاعة لا يشغل شيئاً", !at({ AdRoomCode: "17", AdRoomHall: "F20", locationStatus: "PENDING_ROOM" }));
check("صفٌّ بلا قاعة لا يشغل شيئاً", !at({}));

const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
const advisor = server.slice(server.indexOf('app.post("/api/schedules/suggest-slots"'));
const advisorBody = advisor.slice(0, advisor.indexOf("\napp."));
check("مقترح القاعات يقرأ الإشغال بالقاعدة الواحدة", advisorBody.includes("rowOccupiesRoom(row, hall.roomId, hall.room, hall.hall)"));
check("لا فحص إشغال بالمعرّف وحده في مقترح القاعات", !/row\.roomId\s*&&\s*String\(row\.roomId\)\s*===\s*hall\.roomId/.test(advisorBody));

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
