import assert from "node:assert/strict";
import { recoverAuthorityScanRowsFromHistory } from "../src/utils/authorityScanRecovery.ts";

const base = {
  AdCourseId: 102, AdInstructorId: 7,
  fsunday: false, fmonday: true, ftuesday: false, fwednesday: true, fthursday: false,
  fstarttime: "09:00:00", fendtime: "10:20:00",
  AdRoomCode: "012B07", AdRoomHall: "F31", SCode: "501",
};
const names = new Map([[7, "د. خالد محمد سالم المطوع"]]);

{
  const rows:any[]=[{...base,AdCourseId:0,AdRoomHall:"",sourceRoomText:"",sourceInstructorText:"د. خالد محمد سالم المطوع",fstarttime:"09:00",fendtime:"10:20"}];
  const history:any[]=[base,{...base,AdTermId:2}];
  const result=recoverAuthorityScanRowsFromHistory(rows,history,names);
  assert.equal(result.recoveredRows,1);
  assert.equal(rows[0].AdCourseId,102);
  assert.equal(rows[0].AdRoomHall,"F31");
  assert.equal(rows[0].fstarttime,"09:00"); // existing OCR is never overwritten
}

{
  const rows:any[]=[{AdCourseId:0,AdInstructorId:7,fstarttime:"09:00",fendtime:"10:20",AdRoomCode:"012B07",AdRoomHall:"",fmonday:true,fwednesday:true}];
  const history:any[]=[base,{...base,AdCourseId:999,AdRoomHall:"F33"}];
  recoverAuthorityScanRowsFromHistory(rows,history,names);
  assert.equal(rows[0].AdCourseId,0,"ambiguous history must not invent a course");
  assert.equal(rows[0].AdRoomHall,"","ambiguous history must not invent a room");
}

{
  const rows:any[]=[{...base,fstarttime:"09:00",fendtime:"10:20",AdRoomHall:"F10"}];
  recoverAuthorityScanRowsFromHistory(rows,[base],names);
  assert.equal(rows[0].AdRoomHall,"F10","non-empty OCR room must never be overwritten");
}

console.log("authority scan recovery: 3/3 passed");
