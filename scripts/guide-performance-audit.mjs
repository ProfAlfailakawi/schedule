import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root=process.cwd();
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"schedule-guide-perf-"));
const isolatedTypes=path.join(tmp,"types");fs.mkdirSync(isolatedTypes,{recursive:true});
// Compile the full guide dependency graph into an isolated CommonJS package.
// The guide imports shared helpers, so tsc may emit guide/smartGuide.js rather
// than smartGuide.js at the temp root.
fs.writeFileSync(path.join(tmp,"package.json"),'{"type":"commonjs"}\n');
const candidates=[path.join(root,"node_modules/.bin/tsc"),"/opt/nvm/versions/node/v22.16.0/bin/tsc","tsc"];
let compiled=null;
for(const bin of candidates){const result=spawnSync(bin,["src/guide/smartGuide.ts","--target","ES2022","--module","CommonJS","--lib","ES2022,DOM","--skipLibCheck","--moduleResolution","node","--typeRoots",isolatedTypes,"--outDir",tmp],{cwd:root,encoding:"utf8"});if(!result.error){compiled=result;break;}}
if(!compiled||compiled.status!==0){console.error("تعذر تشغيل فحص أداء المرشد:\n"+String(compiled?.stderr||compiled?.stdout||"لم يوجد tsc"));process.exit(1);}
const emittedGuideCandidates=[path.join(tmp,"guide","smartGuide.js"),path.join(tmp,"src","guide","smartGuide.js"),path.join(tmp,"smartGuide.js")];
const emittedGuide=emittedGuideCandidates.find(candidate=>fs.existsSync(candidate));
if(!emittedGuide){console.error("تعذر العثور على ملف smartGuide.js بعد تحويل محرك المرشد.");process.exit(1);}
const guide=await import(pathToFileURL(emittedGuide).href+`?t=${Date.now()}`);
const query="أبي هذا المقرر يصير يوم الأربعاء الساعة 11 بس لا أبي أغير الدكتور وإذا القاعة مشغولة دور لي أقرب قاعة";
for(let warm=0;warm<3;warm++){for(let i=0;i<3000;i++){guide.dialectIntentTerms(query);guide.parseStructuredGuideIntent(query);}}
const iterations=20000,start=performance.now();
for(let i=0;i<iterations;i++){guide.dialectIntentTerms(query);guide.parseStructuredGuideIntent(query);}
const elapsed=performance.now()-start,perQuery=elapsed/iterations;
fs.rmSync(tmp,{recursive:true,force:true});
if(perQuery>.1){console.error(`فشل ميزانية أداء فهم المرشد: ${perQuery.toFixed(4)}ms للسؤال المحلي.`);process.exit(1);}
const app=fs.readFileSync(path.join(root,"src/App.tsx"),"utf8"),smart=fs.readFileSync(path.join(root,"src/components/SmartGuide.tsx"),"utf8");
if(/new MutationObserver/.test(smart)){console.error("واجهة المرشد لا يجوز أن تملك MutationObserver خاصًا بها.");process.exit(1);}
if(!app.includes('querySelector(".app-main")')){console.error("مراقبة السياق يجب أن تبقى محصورة داخل app-main.");process.exit(1);}
if(!smart.includes("2200")){console.error("اكتشاف العناصر الحية يجب أن يبقى منخفض التردد.");process.exit(1);}
console.log(`ميزانية أداء المرشد ناجحة: ${perQuery.toFixed(5)}ms للسؤال المحلي · لا AI لكل نقرة · المراقبة محصورة ومجمعة.`);
