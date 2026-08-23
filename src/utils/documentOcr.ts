import type { AdCourse, AdInstructor } from "../types";

const toAscii=(value:string)=>String(value||"")
  .replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
const fold=(value:string)=>toAscii(value).replace(/[ً-ْـ]/g,"").replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/[^ء-يa-zA-Z0-9: ]/g," ").replace(/\s+/g," ").trim().toLowerCase();

async function imageBuffers(input:Buffer,mime:string):Promise<Buffer[]>{
  if(!/pdf/i.test(mime))return[input];
  const canvasLib:any=await import("@napi-rs/canvas");
  for(const key of ["DOMMatrix","ImageData","Path2D"])if(!(globalThis as any)[key]&&canvasLib[key])(globalThis as any)[key]=canvasLib[key];
  const pdfjs:any=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf=await pdfjs.getDocument({data:new Uint8Array(input),disableWorker:true,useSystemFonts:true}).promise;
  const pages:Buffer[]=[];
  for(let index=1;index<=Math.min(Number(pdf.numPages||0),12);index++){
    const page=await pdf.getPage(index),base=page.getViewport({scale:1});
    const scale=Math.min(2.2,Math.max(1.35,2400/Math.max(base.width,base.height)));
    const viewport=page.getViewport({scale}),canvas=canvasLib.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;
    pages.push(canvas.toBuffer("image/png"));
  }
  return pages;
}

async function rotateImage(input:Buffer,quarterTurns:-1|0|1):Promise<Buffer>{
  if(!quarterTurns)return input;
  const canvasLib:any=await import("@napi-rs/canvas");
  const image=await canvasLib.loadImage(input);
  const canvas=canvasLib.createCanvas(image.height,image.width),context=canvas.getContext("2d");
  context.translate(canvas.width/2,canvas.height/2);
  context.rotate(quarterTurns*Math.PI/2);
  context.drawImage(image,-image.width/2,-image.height/2);
  return canvas.toBuffer("image/png");
}

/** OCR is deliberately server-side: public survey and admin PDF import share
 * one implementation, and no civil/document image is persisted after reading. */
export async function ocrDocument(input:Buffer,mime:string):Promise<{text:string;pages:number;confidence:number}>{
  const images=await imageBuffers(input,mime);
  if(!images.length)throw new Error("تعذر تحويل صفحات الملف إلى صور قابلة للقراءة");
  const {createWorker}=await import("tesseract.js");
  const worker=await createWorker("ara+eng");
  const texts:string[]=[];let confidence=0,orientation:-1|0|1=0;
  try{
    // CamScanner commonly stores landscape schedules sideways inside portrait
    // PDF pages. Probe the first page in all quarter-turn orientations and then
    // reuse the winning direction for every page. This costs only two extra
    // recognitions per document and also makes phone photos self-correcting.
    const firstCandidates:{turn:-1|0|1;result:any;confidence:number}[]=[];
    for(const turn of [-1,0,1] as const){
      const result=await worker.recognize(await rotateImage(images[0],turn));
      firstCandidates.push({turn,result,confidence:Number(result.data.confidence||0)});
    }
    const first=firstCandidates.sort((a,b)=>b.confidence-a.confidence)[0];
    orientation=first.turn;texts.push(String(first.result.data.text||""));confidence+=first.confidence;
    for(let index=1;index<images.length;index++){
      const result=await worker.recognize(await rotateImage(images[index],orientation));
      texts.push(String(result.data.text||""));confidence+=Number(result.data.confidence||0);
    }
  }finally{await worker.terminate();}
  return{text:texts.join("\n\n--- PAGE ---\n\n"),pages:images.length,confidence:Math.round(confidence/Math.max(1,images.length))};
}

const timePair=(line:string)=>{
  const ascii=toAscii(line).replace(/[Oo]/g,"0");
  const compact=ascii.match(/([01]\d[0-5]\d)\s*[-–—]\s*([01]\d[0-5]\d)/);
  const compactTimes=compact?[compact[1],compact[2]].map(value=>`${value.slice(0,2)}:${value.slice(2)}`):[];
  const matches=compactTimes.length?compactTimes:[...ascii.matchAll(/\b([01]?\d|2[0-3])[:٫.]([0-5]\d)\b/g)].map(match=>`${String(match[1]).padStart(2,"0")}:${match[2]}`);
  if(matches.length<2)return null;
  const minutes=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3));
  const a=matches[0],b=matches[1];return minutes(a)<=minutes(b)?{start:a,end:b}:{start:b,end:a};
};
const dayFlags=(line:string)=>{
  const value=fold(line),ascii=toAscii(line);
  const lectureIndex=value.search(/محاضر|مخاضر|محاضز/);
  const numericWindow=lectureIndex>=0?ascii.slice(Math.max(0,lectureIndex-55),lectureIndex+55):ascii;
  const odd=/(?:^|\D)(?:1\D{0,4}3\D{0,4}5|5\D{0,4}3\D{0,4}1)(?:\D|$)/.test(numericWindow);
  const even=/(?:^|\D)(?:2\D{0,4}4|4\D{0,4}2)(?:\D|$)/.test(numericWindow);
  return{
    fsunday:/الاحد|احد/.test(value)||odd,fmonday:/الاثنين|اثنين/.test(value)||even,ftuesday:/الثلاثاء|ثلاثاء/.test(value)||odd,
    fwednesday:/الاربعاء|اربعاء/.test(value)||even,fthursday:/الخميس|خميس/.test(value)||odd,
  };
};

const editDistance=(a:string,b:string)=>{
  const previous=Array.from({length:b.length+1},(_,index)=>index);
  for(let i=1;i<=a.length;i++){
    let diagonal=previous[0];previous[0]=i;
    for(let j=1;j<=b.length;j++){
      const above=previous[j],cost=a[i-1]===b[j-1]?0:1;
      previous[j]=Math.min(previous[j]+1,previous[j-1]+1,diagonal+cost);diagonal=above;
    }
  }
  return previous[b.length];
};
const wordTokens=(value:string)=>fold(value).split(" ").filter(token=>token.length>=3&&!/^\d+$/.test(token));
const fuzzyNameScore=(line:string,name:string)=>{
  const normalized=fold(line),needle=fold(name);
  if(!needle)return 0;if(normalized.includes(needle))return 1;
  const lineTokens=wordTokens(line),tokens=wordTokens(name);if(!tokens.length)return 0;
  let earned=0,total=0;
  for(const token of tokens){
    const weight=Math.max(3,token.length);total+=weight;
    const found=lineTokens.some(candidate=>candidate===token||(Math.min(candidate.length,token.length)>=4&&editDistance(candidate,token)<=Math.max(1,Math.floor(token.length*.22))));
    if(found)earned+=weight;
  }
  return total?earned/total:0;
};

/** Best-effort table parser for the Authority's scanned timetable. It matches
 * names against the real section catalogue rather than inventing identifiers;
 * unresolved lines are returned as issues and never silently published. */
export function parseScheduleOcrText(text:string,courses:AdCourse[],instructors:AdInstructor[]){
  const lines=text.split(/\r?\n/).map(value=>value.replace(/\s+/g," ").trim()).filter(value=>value.length>4);
  const courseNeedles=courses.map(course=>({course,folded:fold(course.CourseName),code:fold(course.CourseCode)})).sort((a,b)=>b.folded.length-a.folded.length);
  const instructorNeedles=instructors.map(person=>({person,folded:fold(person.AdInstructorName)})).sort((a,b)=>b.folded.length-a.folded.length);
  const parsed:any[]=[];const issues:string[]=[];let order=0;
  for(const line of lines){
    const normalized=fold(line);
    const rankedCourses=courseNeedles.map(item=>({item,score:(item.folded.length>=5&&normalized.includes(item.folded))?1:(item.code&&new RegExp(`(^| )${item.code.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}( |$)`).test(normalized))?1:fuzzyNameScore(line,item.course.CourseName)})).sort((a,b)=>b.score-a.score);
    const courseHit=rankedCourses[0]?.score>=.56?rankedCourses[0].item:undefined;
    if(!courseHit)continue;
    const time=timePair(line),flags=dayFlags(line);
    const rankedInstructors=instructorNeedles.map(item=>({item,score:item.folded.length>=5&&normalized.includes(item.folded)?1:fuzzyNameScore(line,item.person.AdInstructorName)})).sort((a,b)=>b.score-a.score);
    const instructorHit=rankedInstructors[0]?.score>=.62?rankedInstructors[0].item:undefined;
    const numerals=[...toAscii(line).matchAll(/\b\d{1,8}\b/g)].map(match=>match[0]).filter(value=>!String(courseHit.course.CourseCode).includes(value));
    const packed=[...toAscii(line).matchAll(/\b(5\d{2})\d{8,}(\d{3})\b/g)].map(match=>({reference:match[1],section:match[2]}))[0];
    const section=packed?.section||numerals.find(value=>value.length===3&&!/^5\d{2}$/.test(value))||"";
    const reference=packed?.reference||numerals.find(value=>/^5\d{2}$/.test(value))||"";
    const room=toAscii(line).replace(/[Oo]/g,"0").match(/(\d{3}[A-Za-z]\d{2})\s*[|\[\] ]{0,4}([A-Za-z]\d{1,3})/);
    const row:any={sourceOrder:order++,referenceNumber:reference,AdCourseId:courseHit.course.AdCourseId,AdCourseName:courseHit.course.CourseName,SCode:section,AdInstructorId:instructorHit?.person.AdInstructorId||0,...flags,fstarttime:time?.start||"",fendtime:time?.end||"",AdRoomCode:room?.[1]||"",AdRoomHall:room?.[2]||"",ocrLine:line};
    parsed.push(row);
    if(!time)issues.push(`صف «${courseHit.course.CourseName}»: لم أتعرف على الوقت`);
    if(!Object.values(flags).some(Boolean))issues.push(`صف «${courseHit.course.CourseName}»: لم أتعرف على الأيام`);
    if(!instructorHit)issues.push(`صف «${courseHit.course.CourseName}»: لم أتعرف على أستاذ المقرر`);
    if(!section)issues.push(`صف «${courseHit.course.CourseName}»: لم أتعرف على رقم الشعبة`);
    if(!room)issues.push(`صف «${courseHit.course.CourseName}»: لم أتعرف على المبنى والقاعة`);
  }
  if(!parsed.length)issues.push("لم أتعرف على صفوف الجدول. تأكد أن الملف واضح وبنفس نموذج الجدول المعتمد.");
  return{rows:parsed,issues:[...new Set(issues)],lines:lines.length};
}

export function transcriptFacts(text:string){
  const plain=toAscii(text),folded=fold(text);
  const civil=[...plain.matchAll(/\b\d{12}\b/g)].map(match=>match[0])[0]||"";
  const labelled=[
    /(?:الوحدات|الساعات)\s*(?:المجتاز[ةه]|المكتسب[ةه]|الناجح[ةه])\s*[:\-]?\s*(\d{2,3})/i,
    /(?:earned|passed)\s*(?:credits|hours)?\s*[:\-]?\s*(\d{2,3})/i,
  ];
  let passedUnits=0;for(const pattern of labelled){const match=folded.match(pattern);if(match){passedUnits=Number(match[1]);break;}}
  // Never infer eligibility from the largest number in a transcript: that is
  // usually a programme total, course code, or academic year. A missing label
  // must fail closed and be reviewed instead of falsely approving a student.
  return{civil,passedUnits,text:plain.slice(0,16000)};
}
