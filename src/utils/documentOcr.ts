import type { AdCourse, AdInstructor } from "../types";
import { academicDigits, assignAuthoritySections, authorityCourseCodeMatches } from "./authorityAcademicCodes";
import { OFFICIAL_COLLEGE_SITE_PREFIXES } from "./locationCollegePrefixes";

const toAscii=(value:string)=>String(value||"")
  /* Generated Authority PDFs often store Arabic as Presentation Forms
     (e.g. «ﺟﺪﻭﻝ» instead of «جدول»). NFKC turns those glyph forms back into
     ordinary Arabic letters before ANY header/course/instructor matching. */
  .normalize("NFKC")
  /* PDF generators also inject bidi-control glyphs around RTL cells. They are
     layout instructions, not document text, and keeping them breaks otherwise
     exact header regexes such as «012 : الفرع». */
  .replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,"")
  .replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
const fold=(value:string)=>toAscii(value).replace(/[ً-ْـ]/g,"").replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/[^ء-يa-zA-Z0-9: ]/g," ").replace(/\s+/g," ").trim().toLowerCase();

/** A cell as the scanner saw it: its text and where it sat on the page. */
export type OcrCell={text:string;x0:number;x1:number};
/** One physical table row, right-to-left, with the columns still apart. */
export type OcrRow={cells:OcrCell[];line:string;y:number};
export type OcrPageDiagnostic={page:number;visualRows:number;extractedRows:number;gridDetected:boolean;orientation:-1|0|1;suspicious:boolean;reason?:string};
export type OcrPage={rows:OcrRow[];gridRows?:GridRow[];diagnostic?:OcrPageDiagnostic};
export type Legibility={readable:boolean;confidence:number;charactersPerPage:number;reason:string};
export type HeaderTerm={season:"first"|"second"|"summer";years:[number,number];label:string};
export type HeaderBranch={code:string;name:string;label:string};
export type HeaderDepartment={code:string;name:string;label:string};
export type AuthorityPdfHeader={
  term?:HeaderTerm;
  branch?:HeaderBranch;
  department?:HeaderDepartment;
  source?:"text"|"scan";
  /**
   * Authority timetable scans are expected to be uploaded already horizontal.
   * We deliberately do NOT silently rotate an image-only PDF anymore: rotating
   * a dense ruled table can make OCR bind the right text to the wrong physical
   * column while still producing plausible-looking rows. Text-layer PDFs keep
   * their old behaviour because their cell geometry is read from coordinates.
   */
  requiresLandscapeUpload?:boolean;
};
export type OcrResult={pages:OcrPage[];text:string;pageCount:number;confidence:number;orientation:-1|0|1;legibility:Legibility;headerTerm?:HeaderTerm;headerBranch?:HeaderBranch;headerDepartment?:HeaderDepartment;pageDiagnostics:OcrPageDiagnostic[];suspiciousExtraction:boolean};
export type OcrProgress=(stage:{phase:"render"|"orient"|"read"|"rescue";page:number;pages:number;message:string})=>void;

const MAX_PAGES=12;
/** A4 at ~300dpi. The old 157dpi render was the single largest cause of
 *  unreadable rows: Arabic table text at that size loses its dots. */
const TARGET_LONG_EDGE:number=2800;
/** The orientation probe runs on a deliberately small render. Deciding which
 *  way is up needs a tenth of the pixels that reading the text needs. */
const PROBE_LONG_EDGE:number=1400;
const headerPreflightCache=new WeakMap<object,{header:AuthorityPdfHeader;orientation:-1|0|1}>();

let canvasModule:any=null;
async function canvas(){
  if(canvasModule)return canvasModule;
  canvasModule=await import("@napi-rs/canvas");
  for(const key of ["DOMMatrix","ImageData","Path2D"])if(!(globalThis as any)[key]&&canvasModule[key])(globalThis as any)[key]=canvasModule[key];
  return canvasModule;
}

/*
 * ═══ THE PERSISTENT WORKER POOL ═══
 *
 * Creating a Tesseract worker costs ~1.5s and the first recognition on a cold
 * worker pays JIT warm-up on top. Every import used to pay that four times
 * over; the pool below is created once per process and lives across requests,
 * so the second upload starts hot. Five Latin-digits workers carry the
 * numeric strips in parallel; one Arabic worker carries the names. A worker
 * serialises its own jobs internally, so the semaphore hands each exactly one
 * job at a time.
 */
type PooledWorker={recognize:Function;setParameters:Function;terminate:Function};
let headerWorkerPromise:Promise<PooledWorker>|null=null;
async function getHeaderWorker(){
  if(!headerWorkerPromise)headerWorkerPromise=(async()=>{
    const {createWorker}=await import("tesseract.js");
    return await createWorker("ara+eng") as PooledWorker;
  })();
  return headerWorkerPromise;
}
type OcrWorkerPool={eng:PooledWorker[];ara:PooledWorker;ara2:PooledWorker};
let poolPromise:Promise<OcrWorkerPool>|null=null;
let fastLanePoolPromise:Promise<OcrWorkerPool>|null=null;
async function getWorkerPool(){
  if(!poolPromise)poolPromise=(async()=>{
    const {createWorker}=await import("tesseract.js");
    /* The page-1 preflight worker is reused as the first Arabic table worker.
       A wrong scanned PDF therefore initializes ONE OCR worker and stops;
       a valid PDF does not pay that cold-start twice. */
    const [e1,e2,e3,e4,e5,a1,a2]=await Promise.all([
      createWorker("eng"),createWorker("eng"),createWorker("eng"),createWorker("eng"),createWorker("eng"),getHeaderWorker(),createWorker("ara+eng"),
    ]);
    return{eng:[e1,e2,e3,e4,e5] as PooledWorker[],ara:a1 as PooledWorker,ara2:a2 as PooledWorker};
  })();
  return poolPromise;
}
/* Independent page lane. It NEVER shares Tesseract workers with the primary
   lane, so setParameters cannot bleed between pages. Four numeric workers are
   enough because each page already batches strip/cell rescue jobs. The lane is
   lazy: text PDFs and one-page scans never pay its memory/startup cost. */
async function getFastLaneWorkerPool(){
  if(!fastLanePoolPromise)fastLanePoolPromise=(async()=>{
    const {createWorker}=await import("tesseract.js");
    const [e1,e2,e3,e4,a1,a2]=await Promise.all([
      createWorker("eng"),createWorker("eng"),createWorker("eng"),createWorker("eng"),
      createWorker("ara+eng"),createWorker("ara+eng"),
    ]);
    return{eng:[e1,e2,e3,e4] as PooledWorker[],ara:a1 as PooledWorker,ara2:a2 as PooledWorker};
  })();
  return fastLanePoolPromise;
}
/** Run jobs over the eng workers, one in flight per worker. */
async function runOnPool<T>(workers:PooledWorker[],jobs:Array<(worker:PooledWorker)=>Promise<T>>):Promise<T[]>{
  const results:T[]=new Array(jobs.length);
  let next=0;
  await Promise.all(workers.map(async worker=>{
    for(;;){
      const index=next++;
      if(index>=jobs.length)break;
      results[index]=await jobs[index](worker);
    }
  }));
  return results;
}

const isHeic=(input:Buffer,mime:string)=>/heic|heif/i.test(mime)
  ||(input.length>12&&input.subarray(4,8).toString("latin1")==="ftyp"&&/^(heic|heix|hevc|heim|heis|hevm|hevs|mif1|msf1)/.test(input.subarray(8,12).toString("latin1")));

/** iPhones photograph in HEIC by default, and neither the canvas backend nor
 *  the OCR engine can decode it. Converting here is the difference between a
 *  student's proof being read and a dead end they cannot act on. */
async function heicToPng(input:Buffer):Promise<Buffer>{
  const {default:decode}=await import("heic-decode");
  const frame:any=await decode({buffer:input as any});
  const lib=await canvas();
  const surface=lib.createCanvas(frame.width,frame.height),context=surface.getContext("2d");
  const image=context.createImageData(frame.width,frame.height);
  image.data.set(new Uint8ClampedArray(frame.data.buffer,frame.data.byteOffset,frame.data.byteLength));
  context.putImageData(image,0,0);
  return surface.toBuffer("image/png");
}

async function renderPdf(input:Buffer,longEdge:number,onProgress?:OcrProgress):Promise<Buffer[]>{
  const lib=await canvas();
  const pdfjs:any=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf=await pdfjs.getDocument({data:new Uint8Array(input),disableWorker:true,useSystemFonts:true}).promise;
  const count=Math.min(Number(pdf.numPages||0),MAX_PAGES),pages:Buffer[]=[];
  for(let index=1;index<=count;index++){
    onProgress?.({phase:"render",page:index,pages:count,message:`تحويل الصفحة ${index} من ${count}`});
    const page=await pdf.getPage(index),base=page.getViewport({scale:1});
    const scale=longEdge/Math.max(base.width,base.height);
    const viewport=page.getViewport({scale});
    const surface=lib.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
    /* pdfjs paints on TRANSPARENT pixels, and Tesseract composites transparency
       as BLACK — a crop that reaches past the scanned photo grows a black band
       that kills page segmentation outright. Measured: a pixel-perfect header
       crop read as empty at every psm until this fill. */
    const ground=surface.getContext("2d");
    ground.fillStyle="#ffffff";ground.fillRect(0,0,surface.width,surface.height);
    await page.render({canvasContext:ground,viewport}).promise;
    pages.push(surface.toBuffer("image/png"));
  }
  return pages;
}


/** Render page 1 only. Header preflight must never rasterize all timetable
 * pages: a wrong semester/college should be rejected before body work starts. */
async function renderPdfFirstPage(input:Buffer,longEdge:number):Promise<Buffer|null>{
  const lib=await canvas();
  const pdfjs:any=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf=await pdfjs.getDocument({data:new Uint8Array(input),disableWorker:true,useSystemFonts:true}).promise;
  if(!Number(pdf.numPages||0))return null;
  const page=await pdf.getPage(1),base=page.getViewport({scale:1});
  const scale=longEdge/Math.max(base.width,base.height),viewport=page.getViewport({scale});
  const surface=lib.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
  const ground=surface.getContext("2d");
  ground.fillStyle="#ffffff";ground.fillRect(0,0,surface.width,surface.height);
  await page.render({canvasContext:ground,viewport}).promise;
  return surface.toBuffer("image/png");
}


/**
 * Fast path for real PDF exports that still contain a text layer.
 *
 * The Authority timetable is frequently a generated PDF, not a photograph. In
 * that case rendering every page and running Tesseract on 15–25 strips per
 * page is both slower and less accurate than using the characters already
 * embedded in the PDF. We rebuild physical rows from the text coordinates and
 * hand them to the exact same catalogue matcher used by OCR. A scanned/image
 * PDF has no useful text layer, so it simply returns null and falls through to
 * the OCR path below.
 */
/** A real Authority timetable body row carries its academic key plus
 * another independent timetable signal. This is deliberately structural:
 * page headers may be one, three or five physical lines and may change wording,
 * while a genuine body row still has the 7-digit course code and a time or
 * canonical-looking building code. */
function isAuthorityBodyRow(line:string):boolean{
  const ascii=toAscii(line).replace(/[Oo]/g,"0").replace(/\s+/g," ").trim();
  const digitRuns=ascii.match(/\d+/g)||[];
  const hasCourseKey=digitRuns.some(run=>/^\d{7}$/.test(run))||digitRuns.some(run=>/^\d{11,13}$/.test(run));
  const hasTime=/\b[0-2]?\d[0-5]\d\s*[-–—]\s*[0-2]?\d[0-5]\d\b/.test(ascii);
  const hasBuilding=/\b\d{3}[A-Za-z]\d{2}\b/.test(ascii);
  return hasCourseKey&&(hasTime||hasBuilding);
}

function authorityBodyOnly(rows:OcrRow[]):OcrRow[]{
  const firstBody=rows.findIndex(row=>isAuthorityBodyRow(row.line));
  return firstBody>=0?rows.slice(firstBody):rows;
}

/**
 * Reconstruct the native SWRSCHA PDF directly from its embedded text
 * coordinates. This path is intentionally separate from camera OCR: generated
 * PDFs already know exactly where each glyph lives, so asking Tesseract to
 * rediscover Building/Room/Instructor is both slower and less accurate.
 *
 * The ratios below are the printed SWRSCHA column geometry, expressed as a
 * fraction of page width (not hard-coded pixels). A row is accepted only when
 * the far-right academic key proves a 7-digit course number. That proof makes
 * the remaining fixed cells safe to read without ever mining capacity columns
 * for a "building".
 */
export function authorityPdfTextGridRows(words:Word[],pageWidth:number):GridRow[]{
  if(!words.length||!Number.isFinite(pageWidth)||pageWidth<=0)return[];
  const center=(word:Word)=>(word.x0+word.x1)/2;
  const yCenter=(word:Word)=>(word.y0+word.y1)/2;
  const heights=words.map(word=>Math.abs(word.y1-word.y0)).filter(Boolean).sort((a,b)=>a-b);
  const medianHeight=Math.max(7,heights[Math.floor(heights.length/2)]||10);
  const tolerance=Math.max(1.5,Math.min(4,medianHeight*.42));
  const groups:{words:Word[];y:number}[]=[];
  for(const word of [...words].sort((a,b)=>yCenter(a)-yCenter(b))){
    const y=yCenter(word);let best=-1,dist=Infinity;
    for(let i=0;i<groups.length;i++){const d=Math.abs(groups[i].y-y);if(d<=tolerance&&d<dist){best=i;dist=d;}}
    if(best<0)groups.push({words:[word],y});
    else{groups[best].words.push(word);groups[best].y=groups[best].words.reduce((sum,item)=>sum+yCenter(item),0)/groups[best].words.length;}
  }
  const zone=(row:Word[],from:number,to:number)=>row.filter(word=>{const x=center(word)/pageWidth;return x>=from&&x<to;});
  const rtlText=(row:Word[])=>[...row].sort((a,b)=>b.x1-a.x1).map(word=>word.text).join(" ").replace(/\s+/g," ").trim();
  const compact=(row:Word[])=>rtlText(row).replace(/\s+/g,"");
  const rows:GridRow[]=[];
  for(const group of groups.sort((a,b)=>a.y-b.y)){
    const row=group.words;
    const rightText=rtlText(zone(row,.885,1.001));
    const rightRuns=(toAscii(rightText).match(/\d+/g)||[]);
    const code=rightRuns.find(run=>/^\d{7}$/.test(run))||"";
    if(!code)continue;

    const referenceText=toAscii(rtlText(zone(row,.895,.945)));
    const reference=(referenceText.match(/\b\d{4,8}\b/g)||[]).find(value=>value!==code)||"";
    const sectionText=toAscii(compact(zone(row,.862,.900)));
    const scode=(sectionText.match(/(?:50[1-9]|5[1-9]\d|[6-9]\d{2})/)||[])[0]||"";
    const courseText=rtlText(zone(row,.718,.872));
    const instructorText=rtlText(zone(row,0,.128));
    const days=toAscii(rtlText(zone(row,.128,.182))).replace(/[^1-5]+/g," ").trim();
    const timeRaw=toAscii(rtlText(zone(row,.225,.300)));
    const pair=timePair(timeRaw);

    /* Building and room are read ONLY from their physical native-PDF cells.
       Capacity/seat columns start to the right of x=.39 and can therefore never
       become 345045/520020 in AdRoomCode. */
    const buildingRaw=toAscii(compact(zone(row,.294,.348))).toUpperCase();
    const hallRaw=toAscii(compact(zone(row,.348,.390))).toUpperCase();
    const located=extractAuthorityLocationEvidence(`${buildingRaw} ${hallRaw}`);
    const building=located.building||cleanBuildingCode(buildingRaw);
    const hall=located.hall||cleanHallCode(hallRaw);

    rows.push({
      code,reference,scode,courseText,instructorText,days,daysRaw:days,timeRaw,
      start:pair?.start||"",end:pair?.end||"",
      building,hall,buildingRaw,hallRaw,sourceMode:"pdf-text",
    });
  }
  return rows;
}

async function pdfTextLayer(input:Buffer,onProgress?:OcrProgress):Promise<OcrResult|null>{
  try{
    const pdfjs:any=await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf=await pdfjs.getDocument({data:new Uint8Array(input),disableWorker:true,useSystemFonts:true}).promise;
    const count=Math.min(Number(pdf.numPages||0),MAX_PAGES);
    if(!count)return null;
    const pages:OcrPage[]=[];const pageTexts:string[]=[];let structuralRows=0,totalChars=0,pagesWithBody=0;
    for(let index=1;index<=count;index++){
      onProgress?.({phase:"render",page:index,pages:count,message:`فحص النص المضمّن في الصفحة ${index} من ${count}`});
      const page=await pdf.getPage(index);
      const viewport=page.getViewport({scale:1});
      const content:any=await page.getTextContent({includeMarkedContent:false,disableNormalization:false});
      const words:Word[]=[];
      for(const item of content?.items||[]){
        const text=String(item?.str||"").normalize("NFKC").replace(/\s+/g," ").trim();
        if(!text||!Array.isArray(item?.transform))continue;
        const transformed=pdfjs.Util?.transform?pdfjs.Util.transform(viewport.transform,item.transform):item.transform;
        const x=Number(transformed?.[4]??item.transform[4]??0);
        const baseline=Number(transformed?.[5]??item.transform[5]??0);
        const width=Math.max(1,Math.abs(Number(item?.width||0)*Number(viewport.scale||1)));
        const height=Math.max(7,Math.abs(Number(item?.height||0)*Number(viewport.scale||1))||10);
        /* viewport.transform uses top-left page coordinates; a text item's
           transform points at its baseline, so this box is intentionally a
           little generous vertically. Row clustering only needs the centre. */
        words.push({text,x0:x,y0:baseline-height,x1:x+width,y1:baseline+height*.15});
        totalChars+=text.replace(/\s+/g,"").length;
      }
      const physicalRows=tableFromWords(words,[],"pdf-text");
      /* Keep the complete text for header term/branch extraction, but hand only
         the table body to the schedule parser. This removes the repeated
         SWRSCHA/term/department header independently on EVERY PDF page. */
      const pageText=physicalRows.map(row=>row.line).join("\n");
      pageTexts.push(pageText);
      const rows=authorityBodyOnly(physicalRows);
      const nativeGridRows=authorityPdfTextGridRows(words,Number(viewport.width||0));
      const fallbackStructuralRows=rows.filter(row=>{
        const ascii=toAscii(row.line).replace(/[Oo]/g,"0");
        const hasTime=/\b[0-2]?\d[0-5]\d\s*[-–—]?\s*[0-2]?\d[0-5]\d\b/.test(ascii)
          ||/\b(?:[01]?\d|2[0-3])[:.]?[0-5]\d\s*[-–—]?\s*(?:[01]?\d|2[0-3])[:.]?[0-5]\d\b/.test(ascii);
        const digitRuns=ascii.match(/\d+/g)||[];
        const hasTableKey=digitRuns.some(run=>run.length>=4)||/\b\d{3}[A-Za-z]\d{2}\b/.test(ascii)||/[ء-ي]{4,}/.test(row.line);
        return hasTime||(hasTableKey&&digitRuns.length>=3);
      }).length;
      /* Native generated PDFs get the coordinate-grid path whenever at least
         one academic row is proven. A one-row tail page is legitimate. */
      const pageStructuralRows=nativeGridRows.length||fallbackStructuralRows;
      structuralRows+=pageStructuralRows;
      if(pageStructuralRows>=2||(index===count&&pageStructuralRows>=1))pagesWithBody++;
      pages.push({
        rows,
        ...(nativeGridRows.length?{gridRows:nativeGridRows}:{}),
        diagnostic:{page:index,visualRows:nativeGridRows.length||rows.length,extractedRows:pageStructuralRows,gridDetected:Boolean(nativeGridRows.length),orientation:0,suspicious:false},
      });
    }
    const text=pageTexts.join("\n\n--- PAGE ---\n\n");
    /* A few metadata characters or one accidental body-looking line must not
       route a hybrid/image PDF into the text parser. Every non-tail page of a
       genuine generated timetable contributes several structural body rows. */
    const requiredBodyPages=count===1?1:Math.max(1,count-1);
    if(structuralRows<Math.max(3,count*2)||pagesWithBody<requiredBodyPages||totalChars<160)return null;
    const confidence=99;
    const header=parseAuthorityHeaderText(text);
    return{
      pages,text,pageCount:count,confidence,orientation:0,
      legibility:{readable:true,confidence,charactersPerPage:Math.round(totalChars/Math.max(1,count)),reason:""},
      headerTerm:header.term,headerBranch:header.branch,headerDepartment:header.department,
      pageDiagnostics:pages.map(page=>page.diagnostic!),suspiciousExtraction:false,
    };
  }catch{return null;}
}

async function imagePages(input:Buffer,mime:string,longEdge:number,onProgress?:OcrProgress):Promise<Buffer[]>{
  if(/pdf/i.test(mime)||input.subarray(0,4).toString("latin1")==="%PDF")return renderPdf(input,longEdge,onProgress);
  const source=isHeic(input,mime)?await heicToPng(input):input;
  const lib=await canvas();
  let image:any;
  try{image=await lib.loadImage(source);}
  catch{throw new Error("صيغة الملف غير مدعومة. ارفع PDF أو صورة JPG أو PNG أو HEIC.");}
  const scale=Math.min(1,longEdge/Math.max(image.width,image.height));
  const surface=lib.createCanvas(Math.round(image.width*scale),Math.round(image.height*scale));
  surface.getContext("2d").drawImage(image,0,0,surface.width,surface.height);
  return[surface.toBuffer("image/png")];
}

async function rotateImage(input:Buffer,quarterTurns:-1|0|1):Promise<Buffer>{
  if(!quarterTurns)return input;
  const lib=await canvas();
  const image=await lib.loadImage(input);
  const surface=lib.createCanvas(image.height,image.width),context=surface.getContext("2d");
  context.fillStyle="#ffffff";context.fillRect(0,0,surface.width,surface.height);
  context.translate(surface.width/2,surface.height/2);
  context.rotate(quarterTurns*Math.PI/2);
  context.drawImage(image,-image.width/2,-image.height/2);
  return surface.toBuffer("image/png");
}

const darkAt=(pixels:Uint8ClampedArray,index:number)=>(pixels[index]*299+pixels[index+1]*587+pixels[index+2]*114)/1000<165;

/**
 * Straighten the scan before anything measures it.
 *
 * A phone-held page is never square, and a single degree of tilt drags a ruled
 * line twelve pixels sideways over the height of a table. That is enough to
 * hide every vertical rule from a column-by-column scan — measured on a real
 * CamScanner page, grid detection found nothing at all until the tilt was taken
 * out. Straightening also lifts plain text accuracy, because Tesseract segments
 * lines on horizontal bands.
 */
async function deskew(input:Buffer):Promise<Buffer>{
  const lib=await canvas();
  const image=await lib.loadImage(input);
  const scale=Math.min(1,620/Math.max(image.width,image.height));
  const probe=lib.createCanvas(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale)));
  const context=probe.getContext("2d");
  const score=(radians:number)=>{
    context.save();
    context.fillStyle="#ffffff";context.fillRect(0,0,probe.width,probe.height);
    context.translate(probe.width/2,probe.height/2);
    context.rotate(radians);
    context.drawImage(image,-probe.width/2,-probe.height/2,probe.width,probe.height);
    context.restore();
    const {data}=context.getImageData(0,0,probe.width,probe.height);
    let total=0;
    for(let y=0;y<probe.height;y++){
      let run=0,best=0;
      for(let x=0;x<probe.width;x++){
        if(darkAt(data,(y*probe.width+x)*4)){run++;if(run>best)best=run;}else run=0;
      }
      if(best>probe.width*0.35)total+=best;
    }
    return total;
  };
  // Coarse sweep, then a fine one around the winner.
  let best=-1,bestDegrees=0;
  for(let degrees=-2.5;degrees<=2.5+1e-9;degrees+=1){
    const value=score(degrees*Math.PI/180);
    if(value>best){best=value;bestDegrees=degrees;}
  }
  for(let degrees=bestDegrees-0.75;degrees<=bestDegrees+0.75+1e-9;degrees+=0.25){
    if(Math.abs(degrees-bestDegrees)<1e-9)continue;
    const value=score(degrees*Math.PI/180);
    if(value>best){best=value;bestDegrees=degrees;}
  }
  if(!bestDegrees)return input;
  const surface=lib.createCanvas(image.width,image.height),painter=surface.getContext("2d");
  painter.fillStyle="#ffffff";painter.fillRect(0,0,surface.width,surface.height);
  painter.translate(surface.width/2,surface.height/2);
  painter.rotate(bestDegrees*Math.PI/180);
  painter.drawImage(image,-image.width/2,-image.height/2);
  return surface.toBuffer("image/png");
}

/**
 * Which way is up, decided by pixels alone.
 *
 * The old probe ran three full OCR passes and asked Tesseract's confidence —
 * fifteen seconds to answer a question the ruled grid answers for free: only
 * the upright turn shows many long VERTICAL rules with a regular row pitch.
 * Scored on a small binarized render, all three turns cost well under a
 * second. The OCR fallback below survives only for pages with no grid at all.
 */
async function pixelOrientationScore(image:Buffer):Promise<number>{
  const lib=await canvas();
  const img=await lib.loadImage(image);
  const scale=Math.min(1,700/Math.max(img.width,img.height));
  const c=lib.createCanvas(Math.max(1,Math.round(img.width*scale)),Math.max(1,Math.round(img.height*scale)));
  const ctx=c.getContext("2d");
  ctx.drawImage(img,0,0,c.width,c.height);
  const {data}=ctx.getImageData(0,0,c.width,c.height);
  const W=c.width,H=c.height;
  const dark=(x:number,y:number)=>(data[(y*W+x)*4]*299+data[(y*W+x)*4+1]*587+data[(y*W+x)*4+2]*114)/1000<150;
  let vertical=0;
  for(let x=0;x<W;x+=2){let run=0,best=0;for(let y=0;y<=H;y++){
    if(y<H&&dark(x,y))run++;else{if(run>best)best=run;run=0;}}
    if(best>H*0.45)vertical++;}
  const rowHits:number[]=[];
  for(let y=0;y<H;y++){let run=0,best=0;for(let x=0;x<=W;x++){
    if(x<W&&dark(x,y))run++;else{if(run>best)best=run;run=0;}}
    if(best>W*0.45)rowHits.push(y);}
  const merged:number[]=[];
  for(const y of rowHits){if(merged.length&&y-merged[merged.length-1]<=2)merged[merged.length-1]=y;else merged.push(y);}
  const gaps=merged.slice(1).map((v,i)=>v-merged[i]).filter(g=>g>4);
  let regular=0;
  if(gaps.length>=4){
    const sorted=[...gaps].sort((a,b)=>a-b);
    const median=sorted[Math.floor(sorted.length/2)];
    regular=gaps.filter(g=>Math.abs(g-median)<=2).length;
  }
  return vertical*3+merged.length*2+regular*6;
}
const orientationScore=(text:string)=>{
  const ascii=toAscii(text).replace(/[Oo]/g,"0");
  const times=(ascii.match(/\b[0-2]\d[0-5]\d\s*[-–—]\s*[0-2]\d[0-5]\d\b/g)||[]).length;
  const rooms=(ascii.match(/\b\d{3}[A-Za-z]\d{2}\b/g)||[]).length;
  const arabic=(text.match(/[ء-ي]/g)||[]).length;
  return times*40+rooms*25+arabic;
};

/**
 * Find the printed grid, then pull the columns apart.
 *
 * Reading the page as flat text welded neighbouring cells together: a lecture
 * ending at 15:30 in building 012B09 came back as the single token
 * `1530012B09`, so neither field could ever match. The long dark runs are the
 * ruled lines and mark the real cell boundaries.
 *
 * Erasing those rules was tried and reverted — the white band clipped digits
 * that touch a line, turning `1050 - 1000` into `1050-6`. Re-drawing each strip
 * with a gutter between them separates the columns just as decisively without
 * altering a single pixel of the content.
 *
 * The grid itself is measured on a small copy. Rules survive downscaling
 * intact, and scanning eight million pixels twice at full size cost about a
 * minute per document for a measurement that needs none of that detail.
 */
async function spreadColumns(input:Buffer):Promise<{image:Buffer;columns:number[];bands:number[]}>{
  const lib=await canvas();
  const image=await lib.loadImage(input);
  const probeScale=Math.min(1,1200/Math.max(image.width,image.height));
  const probe=lib.createCanvas(Math.max(1,Math.round(image.width*probeScale)),Math.max(1,Math.round(image.height*probeScale)));
  probe.getContext("2d").drawImage(image,0,0,probe.width,probe.height);
  const frame=probe.getContext("2d").getImageData(0,0,probe.width,probe.height),pixels=frame.data;
  const {width,height}=probe;
  const minRun=Math.max(40,Math.round(height/6));
  const columnInk=new Int32Array(width);
  for(let x=0;x<width;x++){
    let run=0;
    for(let y=0;y<=height;y++){
      const lit=y<height&&darkAt(pixels,(y*width+x)*4);
      if(lit)run++;else{if(run>=minRun)columnInk[x]+=run;run=0;}
    }
  }
  const threshold=height*0.4,found:number[]=[];
  for(let x=0;x<width;x++){
    if(columnInk[x]<threshold)continue;
    if(found.length&&x-found[found.length-1]<=3)found[found.length-1]=x;
    else found.push(x);
  }

  /* The horizontal rules are the row boundaries, and they matter as much as the
     columns. Grouping words by the height of their glyphs split one physical
     row in half across a wide table: the left side (instructor, days, time)
     became one row and the right side (course number, reference, section,
     course name) either became another or was dropped entirely — which is why
     the course number, the most reliable key on the page, never reached the
     parser. A ruled band holds the whole width of a row together. */
  const rowInk=new Int32Array(height);
  const minRowRun=Math.max(40,Math.round(width/6));
  for(let y=0;y<height;y++){
    let run=0;
    for(let x=0;x<=width;x++){
      const lit=x<width&&darkAt(pixels,(y*width+x)*4);
      if(lit)run++;else{if(run>=minRowRun)rowInk[y]+=run;run=0;}
    }
  }
  const rowThreshold=width*0.4,rowsFound:number[]=[];
  for(let y=0;y<height;y++){
    if(rowInk[y]<rowThreshold)continue;
    if(rowsFound.length&&y-rowsFound[rowsFound.length-1]<=3)rowsFound[rowsFound.length-1]=y;
    else rowsFound.push(y);
  }
  const bands=rowsFound.map(y=>Math.round(y/probeScale)).filter(y=>y>2&&y<image.height-2);

  const edges=found.map(x=>Math.round(x/probeScale)).filter(x=>x>4&&x<image.width-4);
  if(edges.length<4)return{image:input,columns:[],bands};

  const gutter=Math.max(12,Math.round(image.width/260));
  const bounds=[0,...edges,image.width];
  const surface=lib.createCanvas(image.width+gutter*(bounds.length-2),image.height);
  const context=surface.getContext("2d");
  context.fillStyle="#ffffff";context.fillRect(0,0,surface.width,surface.height);
  const columns:number[]=[];let cursor=0;
  for(let index=0;index<bounds.length-1;index++){
    const from=bounds[index],span=bounds[index+1]-from;
    if(span<=0)continue;
    context.drawImage(image,from,0,span,image.height,cursor,0,span,image.height);
    cursor+=span;
    if(index<bounds.length-2){columns.push(cursor+gutter/2);cursor+=gutter;}
  }
  return{image:surface.toBuffer("image/png"),columns,bands};
}

type Word={text:string;x0:number;y0:number;x1:number;y1:number};
const wordsOf=(data:any):Word[]=>{
  const words:Word[]=[];
  for(const block of data?.blocks||[])for(const paragraph of block?.paragraphs||[])for(const line of paragraph?.lines||[])for(const word of line?.words||[]){
    const text=String(word?.text||"").trim();
    if(text&&word?.bbox)words.push({text,x0:word.bbox.x0,y0:word.bbox.y0,x1:word.bbox.x1,y1:word.bbox.y1});
  }
  return words;
};

/**
 * Rebuild the table from where the words physically sit.
 *
 * Reading the flat text lost every column boundary: a lecture ending at 08:00
 * in building 012B07 came back as the single token `0800012BO7`, so neither
 * the time nor the building could ever match. Grouping words by their line and
 * then cutting on the horizontal gaps between them keeps each ruled cell apart,
 * which is what makes times, days, rooms and section numbers recoverable.
 */
function tableFromWords(words:Word[],columns:number[],rowGrouping:"default"|"pdf-text"="default"):OcrRow[]{
  const validWords=words.filter(w=>w.text&&w.text.trim().length>0);
  if(!validWords.length)return[];
  const heights=validWords.map(w=>Math.abs(w.y1-w.y0)).sort((a,b)=>a-b);
  const medianHeight=Math.max(8,heights[Math.floor(heights.length/2)]||12);

  // Generated PDFs expose exact baselines. Their glyph boxes can overlap the
  // next ruled row, so the loose OCR grouping would weld every two timetable
  // rows together. PDF text therefore groups by baseline distance only.
  const strictPdfRows=rowGrouping==="pdf-text";
  const sortedByY=[...validWords].sort((a,b)=>((a.y0+a.y1)/2)-((b.y0+b.y1)/2));
  const rowTolerance=strictPdfRows?Math.max(1.5,Math.min(3.5,medianHeight*0.35)):medianHeight*0.8;
  const lineGroups:{words:Word[];yMin:number;yMax:number;yCenter:number}[]=[];

  for(const word of sortedByY){
    const wCenter=(word.y0+word.y1)/2;
    const wMin=Math.min(word.y0,word.y1);
    const wMax=Math.max(word.y0,word.y1);

    let bestIndex=-1;let minDist=Infinity;
    for(let i=0;i<lineGroups.length;i++){
      const grp=lineGroups[i];
      const dist=Math.abs(wCenter-grp.yCenter);
      const overlaps=(wMin<=grp.yMax+3&&wMax>=grp.yMin-3);
      const samePhysicalRow=strictPdfRows?dist<=rowTolerance:(overlaps||dist<=rowTolerance);
      if(samePhysicalRow&&dist<minDist){minDist=dist;bestIndex=i;}
    }

    if(bestIndex>=0&&minDist<=(strictPdfRows?rowTolerance:rowTolerance*1.5)){
      const grp=lineGroups[bestIndex];
      grp.words.push(word);
      grp.yMin=Math.min(grp.yMin,wMin);
      grp.yMax=Math.max(grp.yMax,wMax);
      grp.yCenter=grp.words.reduce((sum,w)=>(w.y0+w.y1)/2+sum,0)/grp.words.length;
    }else{
      lineGroups.push({words:[word],yMin:wMin,yMax:wMax,yCenter:wCenter});
    }
  }

  lineGroups.sort((a,b)=>a.yCenter-b.yCenter);

  const columnOf=(x:number)=>{let index=0;while(index<columns.length&&columns[index]<x)index++;return index;};

  const rows:OcrRow[]=[];
  for(const line of lineGroups){
    // Right to left: the first cell of an Arabic table is the rightmost one.
    const sorted=[...line.words].sort((a,b)=>b.x1-a.x1);
    const buckets=new Map<number,Word[]>();
    for(const word of sorted){
      const key=columns.length?columnOf((word.x0+word.x1)/2):-1;
      const list=buckets.get(key);if(list)list.push(word);else buckets.set(key,[word]);
    }
    let cells:OcrCell[]=[];
    if(columns.length){
      cells=[...buckets.entries()].sort((a,b)=>b[0]-a[0]).map(([,list])=>({
        text:list.sort((a,b)=>b.x1-a.x1).map(word=>word.text).join(" ").replace(/\s+/g," ").trim(),
        x0:Math.min(...list.map(word=>word.x0)),x1:Math.max(...list.map(word=>word.x1)),
      }));
    }else{
      // No printed grid: group words into cells by horizontal spacing
      const gaps=sorted.slice(1).map((word,index)=>sorted[index].x0-word.x1).filter(gap=>gap>0).sort((a,b)=>a-b);
      const minPosGap=gaps.length?gaps[0]:6;
      const typical=gaps.length?gaps[Math.floor(gaps.length/2)]:medianHeight*0.4;
      const cut=Math.max(12,minPosGap*1.6,typical*1.4);
      let bucket:Word[]=[];
      const flush=()=>{
        if(!bucket.length)return;
        cells.push({text:bucket.map(word=>word.text).join(" ").replace(/\s+/g," ").trim(),x0:Math.min(...bucket.map(w=>w.x0)),x1:Math.max(...bucket.map(w=>w.x1))});
        bucket=[];
      };
      for(let index=0;index<sorted.length;index++){
        if(index>0&&(sorted[index-1].x0-sorted[index].x1)>cut)flush();
        bucket.push(sorted[index]);
      }
      flush();
    }
    const filtered=cells.filter(cell=>cell.text.length>0);
    if(filtered.length)rows.push({cells:filtered,line:filtered.map(cell=>cell.text).join(" | "),y:line.yCenter});
  }
  return rows.sort((a,b)=>a.y-b.y).slice(0,4000);
}


/* ══════════════════════════════════════════════════════════════════════════
   THE GRIDDED READER — the path a ruled Authority table deserves.

   Reading the page as free text was the ceiling on every measurement: columns
   welded, digits misread, the course-code column often lost outright. A ruled
   table offers something free text never does — its own geometry — and this
   path uses all of it:

   · Otsu binarization makes the faint CamScanner rules solid. Measured on the
     real export, the full grid then falls out: every column rule and a row
     rule every 49px, one per printed row.
   · Each column STRIP is cropped from the untouched greyscale at 2× and read
     alone with the alphabet that column is allowed to use. Digits columns
     cannot hallucinate Arabic; the days column can only say 1–5. Measured:
     the reference column jumped to 22/27 rows and instructors went from
     garbage to «د. عبد الرؤوف الكمالى» verbatim.
   · Nobody guesses which column is which. Every strip is read, then columns
     CLAIM their meaning by what validates: the column where most cells look
     like `0920 - 0800` is the time column, wherever it sits. A re-ordered
     export changes nothing.
   · Numeric strips are read from BOTH the greyscale and the binarized image;
     per cell, whichever pass yields a value the column's validator accepts
     wins. Measured: the two passes fail on DIFFERENT rows (8/27 vs 17/27 on
     times), so the union is what neither pass could reach alone.
   ══════════════════════════════════════════════════════════════════════════ */

export type GridRow={
  code:string;reference:string;scode:string;courseText:string;instructorText:string;
  days:string;start:string;end:string;building:string;hall:string;
  /** Literal same-cell evidence kept for field-level provenance. */
  daysRaw?:string;timeRaw?:string;sourceMode?:"pdf-text"|"ocr-grid"|"ocr-fallback";
  /** Same proven physical cells before strict token validation. They are kept as
   * evidence so the registry can reconstruct only an already-known official
   * code (e.g. a dropped leading 0 in 012B09), never invent a location. */
  buildingRaw?:string;hallRaw?:string;
};
type GridPage={gridRows:GridRow[]};

/** Otsu's threshold: the split that maximizes between-class variance. */
function otsuBinarize(lib:any,src:any){
  const ctx=src.getContext("2d");
  const {data}=ctx.getImageData(0,0,src.width,src.height);
  const hist=new Array(256).fill(0);
  const grey=new Uint8Array(src.width*src.height);
  for(let i=0;i<grey.length;i++){
    const g=Math.round((data[i*4]*299+data[i*4+1]*587+data[i*4+2]*114)/1000);
    grey[i]=g;hist[g]++;
  }
  let sum=0;for(let t=0;t<256;t++)sum+=t*hist[t];
  let sumB=0,wB=0,best=0,threshold=127;
  for(let t=0;t<256;t++){
    wB+=hist[t];if(!wB)continue;
    const wF=grey.length-wB;if(!wF)break;
    sumB+=t*hist[t];
    const mB=sumB/wB,mF=(sum-sumB)/wF,between=wB*wF*(mB-mF)*(mB-mF);
    if(between>best){best=between;threshold=t;}
  }
  const out=lib.createCanvas(src.width,src.height),octx=out.getContext("2d");
  const img=octx.createImageData(src.width,src.height);
  for(let i=0;i<grey.length;i++){
    const v=grey[i]<threshold?0:255;
    img.data[i*4]=v;img.data[i*4+1]=v;img.data[i*4+2]=v;img.data[i*4+3]=255;
  }
  octx.putImageData(img,0,0);
  return out;
}

/**
 * Detect the ruled Authority table on a SMALL adaptive-threshold probe.
 *
 * CamScanner pages often have a bright centre and dark/shadowed edges. A
 * single global (Otsu) threshold can therefore erase a real row/column rule on
 * one side of the page while keeping the same rule on the other. That was the
 * structural root cause behind merged rows and column drift (building leaking
 * into room, course name into instructor, etc.). Geometry is now measured with
 * a local mean threshold; OCR still reads the untouched high-resolution image.
 *
 * The table header is also useful evidence: true vertical borders cross the
 * tall header band, while body text should never be used to invent a column
 * boundary. Horizontal rules give row identity; the tall header band followed
 * by the regular body-row pitch tells us exactly where the data starts.
 */
function adaptiveGridGeometry(lib:any,src:any):{cols:number[];bands:{top:number;bottom:number}[]}|null{
  const probeScale=Math.min(1,PROBE_LONG_EDGE/Math.max(src.width,src.height));
  const probe=lib.createCanvas(Math.max(1,Math.round(src.width*probeScale)),Math.max(1,Math.round(src.height*probeScale)));
  const pctx=probe.getContext("2d");
  pctx.fillStyle="#ffffff";pctx.fillRect(0,0,probe.width,probe.height);
  pctx.drawImage(src,0,0,probe.width,probe.height);
  const {data}=pctx.getImageData(0,0,probe.width,probe.height);
  const W=probe.width,H=probe.height;
  if(W<200||H<200)return null;

  const grey=new Uint8Array(W*H);
  const stride=W+1;
  /* 32-bit is safe here: the probe is capped at 1,400px long edge, so even the
     sum of the entire image is well below 2^32. */
  const integral=new Uint32Array((W+1)*(H+1));
  for(let y=0;y<H;y++){
    let rowSum=0;
    for(let x=0;x<W;x++){
      const at=(y*W+x)*4;
      const g=Math.round((data[at]*299+data[at+1]*587+data[at+2]*114)/1000);
      grey[y*W+x]=g;rowSum+=g;
      integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+rowSum;
    }
  }
  const radius=25,offset=5;
  const dark=new Uint8Array(W*H);
  for(let y=0;y<H;y++){
    const y0=Math.max(0,y-radius),y1=Math.min(H-1,y+radius);
    for(let x=0;x<W;x++){
      const x0=Math.max(0,x-radius),x1=Math.min(W-1,x+radius);
      const sum=integral[(y1+1)*stride+x1+1]-integral[y0*stride+x1+1]-integral[(y1+1)*stride+x0]+integral[y0*stride+x0];
      const area=(x1-x0+1)*(y1-y0+1),mean=sum/area;
      if(grey[y*W+x]<mean-offset)dark[y*W+x]=1;
    }
  }

  const cluster=(points:number[],maxGap:number,score?:Int32Array)=>{
    const groups:number[][]=[];
    for(const point of points){
      if(!groups.length||point-groups[groups.length-1][groups[groups.length-1].length-1]>maxGap)groups.push([point]);
      else groups[groups.length-1].push(point);
    }
    return groups.map(group=>{
      if(!score)return Math.round(group.reduce((a,b)=>a+b,0)/group.length);
      let best=group[0];for(const point of group)if(score[point]>score[best])best=point;return best;
    });
  };

  /* A row rule contributes only when it contains a LONG continuous run. This
     rejects ordinary text lines even when the page is densely printed. */
  const rowInk=new Int32Array(H),minHorizontal=Math.max(30,Math.round(W/10));
  for(let y=0;y<H;y++){
    let run=0,total=0;
    for(let x=0;x<=W;x++){
      if(x<W&&dark[y*W+x])run++;
      else{if(run>=minHorizontal)total+=run;run=0;}
    }
    rowInk[y]=total;
  }
  const rowPoints:number[]=[];
  for(let y=0;y<H;y++)if(rowInk[y]>=W*0.18)rowPoints.push(y);
  const rowRules=cluster(rowPoints,5,rowInk);
  if(rowRules.length<3)return null;

  /* Estimate body-row pitch from the small gaps only. The header is roughly
     twice as tall and page title/footer separators are much farther apart. */
  const allGaps=rowRules.slice(1).map((value,index)=>value-rowRules[index]);
  const pitchSamples=allGaps.filter(gap=>gap>=10&&gap<=36).sort((a,b)=>a-b);
  if(!pitchSamples.length)return null;
  const pitch=pitchSamples[Math.floor(pitchSamples.length/2)];
  if(!pitch||pitch<10)return null;

  let best:{header:number;end:number;count:number}|null=null;
  for(let index=0;index<allGaps.length;index++){
    const headerGap=allGaps[index];
    if(headerGap<pitch*1.35||headerGap>pitch*2.6)continue;
    let cursor=index+1,count=0;
    while(cursor<allGaps.length&&allGaps[cursor]>=pitch*0.65&&allGaps[cursor]<=pitch*1.5){count++;cursor++;}
    /* A final page may legitimately contain only ONE timetable row. Geometry
       is still strong evidence when the header band and columns are present. */
    if(count>=1&&(!best||count>best.count))best={header:index,end:cursor,count};
  }
  if(!best)return null;
  const headerTop=rowRules[best.header],headerBottom=rowRules[best.header+1];
  const bodyBounds=rowRules.slice(best.header+1,best.end+1);
  if(bodyBounds.length<2)return null;

  /* Vertical rules are measured INSIDE the tall header band. Over this short
     distance a phone-camera slant is only a pixel or two, so real borders stay
     continuous; measuring them over the full page was what made faint/slanted
     borders disappear. */
  const y0=Math.max(0,headerTop+1),y1=Math.min(H,headerBottom-1),headerHeight=Math.max(1,y1-y0);
  const colInk=new Int32Array(W),colRun=new Int32Array(W),colPoints:number[]=[];
  for(let x=0;x<W;x++){
    let run=0,bestRun=0,ink=0;
    for(let y=y0;y<=y1;y++){
      if(y<y1&&dark[y*W+x]){run++;ink++;if(run>bestRun)bestRun=run;}
      else run=0;
    }
    colInk[x]=ink;colRun[x]=bestRun;
    if(bestRun>=headerHeight*0.55||ink>=headerHeight*0.72)colPoints.push(x);
  }
  const colScore=new Int32Array(W);for(let x=0;x<W;x++)colScore[x]=colRun[x]*4+colInk[x];
  const colsProbe=cluster(colPoints,3,colScore);
  if(colsProbe.length<7)return null;

  const inv=1/probeScale;
  const cols=colsProbe.map(x=>Math.round(x*inv)).filter((x,index,list)=>x>2&&x<src.width-2&&(index===0||x-list[index-1]>=4));
  const bounds=bodyBounds.map(y=>Math.round(y*inv)).filter((y,index,list)=>y>2&&y<src.height-2&&(index===0||y-list[index-1]>=4));
  const bands:{top:number;bottom:number}[]=[];
  for(let index=0;index<bounds.length-1;index++)if(bounds[index+1]-bounds[index]>=8)bands.push({top:bounds[index],bottom:bounds[index+1]});
  return cols.length>=7&&bands.length?{cols,bands}:null;
}

/** Long dark runs, per axis, on the binarized image. */
function findRules(bin:any){
  const ctx=bin.getContext("2d");
  const {data}=ctx.getImageData(0,0,bin.width,bin.height);
  const W=bin.width,H=bin.height;
  const dark=(x:number,y:number)=>data[(y*W+x)*4]<128;
  const colInk=new Int32Array(W),rowInk=new Int32Array(H);
  for(let x=0;x<W;x++){let run=0;for(let y=0;y<=H;y++){
    if(y<H&&dark(x,y))run++;else{if(run>=H/8)colInk[x]+=run;run=0;}}}
  for(let y=0;y<H;y++){let run=0;for(let x=0;x<=W;x++){
    if(x<W&&dark(x,y))run++;else{if(run>=W/8)rowInk[y]+=run;run=0;}}}
  const peaks=(ink:Int32Array,threshold:number)=>{
    const out:number[]=[];
    for(let i=0;i<ink.length;i++){
      if(ink[i]<threshold)continue;
      if(out.length&&i-out[out.length-1]<=6)out[out.length-1]=i;
      else out.push(i);
    }
    return out;
  };
  return{cols:peaks(colInk,H*0.35),rows:peaks(rowInk,W*0.35)};
}

const OFFICIAL_SITE_PREFIXES=[...new Set(OFFICIAL_COLLEGE_SITE_PREFIXES.map(item=>String(item.sitePrefix||"").toUpperCase()).filter(Boolean))];
const escapeRegex=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const officialSitePrefixPattern=OFFICIAL_SITE_PREFIXES.map(escapeRegex).sort((a,b)=>b.length-a.length).join("|");
/* IMPORTANT: a generic six-digit number is NOT a building. Values such as
   345045/520020 are capacity-seat columns welded by OCR and were the exact
   regression visible in the import preview. A building candidate must carry
   one of the owner-supplied site prefixes (012B, 011B, 0520, 0410, ...). */
const OFFICIAL_BUILDING_PATTERN=new RegExp(`^(?:${officialSitePrefixPattern})\\d{2}$`,"i");

export const authorityBuildingCellLooksPlausible=(raw:string):boolean=>{
  const token=toAscii(String(raw||"")).toUpperCase().replace(/[^A-Z0-9]/g,"");
  if(!token)return false;
  if(OFFICIAL_BUILDING_PATTERN.test(token))return true;
  /* Column claiming may tolerate the camera dropping leading zeroes from the
     SITE PREFIX (e.g. 012B09 -> 12B09). This does not canonicalize anything;
     the server still resolves the raw value against the finite official
     registry before it can be imported. */
  return OFFICIAL_SITE_PREFIXES.some(prefix=>{
    const compactPrefix=prefix.replace(/^0+/,"");
    return Boolean(compactPrefix)&&new RegExp(`^${escapeRegex(compactPrefix)}\\d{2}$`,"i").test(token);
  });
};

const stripPatterns={
  /* A building such as 012B09 can OCR as «012-809». The old shape-only
     time regex accepted that and shifted every left-side role by one column:
     days appeared as the instructor and time/building/room went blank. A time
     candidate must now be a plausible teaching clock on BOTH sides. Three-digit
     values are retained only for 7:00–9:59 where the missing leading zero is
     unambiguous (920 => 09:20); «012» can never become a clock. */
  time:/^(?:[7-9][0-5]\d|(?:0[7-9]|1\d|20)[0-5]\d)\s*[-–—]?\s*(?:[7-9][0-5]\d|(?:0[7-9]|1\d|20)[0-5]\d)$/,
  code:/^\d{7}$/,
  refcode:/^\d{11,13}$/,
  reference:/^\d{4,8}$/,
  /* Authority section numbers in this schedule family start at 501. Keeping
     the structural reader to 501–999 stops border artefacts such as 150/450/
     1507 from being presented as confirmed sections. */
  scode:/^(?:50[1-9]|5[1-9]\d|[6-9]\d{2})$/,
  building:OFFICIAL_BUILDING_PATTERN,
  hall:/^[A-Z]\d{1,3}$/i,
  days:/^[1-5](?:[\s,\-–—./]*[1-5])*$/,
};

/**
 * A seven-digit token is not automatically an Authority course key.
 *
 * On photographed SWRSCHA pages the SECTION + CRN columns can weld into a
 * perfectly plausible seven-digit number such as `5011894`. Treating that as
 * the course column is catastrophic because every row then looks structurally
 * valid while the real course column is ignored. When the page header already
 * proved the scientific-department key (for example `0101`), the printed course
 * key must be exactly:
 *
 *   department key + three-digit course number  =>  0101 + 102 = 0101102
 *
 * With no proven department we retain the older shape check and fail closed
 * later at catalogue matching; with a proven department this function is the
 * semantic proof used to CLAIM the physical course column.
 */
export const authorityCourseCellLooksPlausible=(raw:string,departmentCode=""):boolean=>{
  const token=academicDigits(raw);
  if(!/^\d{7}$/.test(token))return false;
  const department=academicDigits(departmentCode);
  if(!department)return true;
  return token.length===department.length+3&&token.startsWith(department);
};

/** Combined CRN/reference + full course key in one OCR span. The only part
 * that carries academic identity is the seven-digit TAIL, which must satisfy
 * the same department proof as a standalone course cell. */
export const authorityReferenceCourseCellLooksPlausible=(raw:string,departmentCode=""):boolean=>{
  const token=academicDigits(raw);
  if(!/^\d{11,13}$/.test(token))return false;
  return authorityCourseCellLooksPlausible(token.slice(-7),departmentCode);
};

/* Claim the TIME column without going back to the old unsafe shape-only regex.
   Phone scans often append one grid-rule digit to a clock (1000 -> 10040) or
   drop the leading zero (0920 -> 920). A candidate still has to contain TWO
   independently plausible teaching clocks and a 30–240 minute interval. A
   building such as 012B09 can therefore never claim the time role. */
export const authorityTimeCellLooksPlausible=(raw:string):boolean=>{
  const text=toAscii(String(raw||"")).toUpperCase().replace(/[Oo]/g,"0");
  const parts=(text.match(/\d{3,5}/g)||[]);
  if(parts.length<2)return false;
  const clocks=(piece:string)=>{
    const variants=new Set<string>();
    if(piece.length===4)variants.add(piece);
    if(piece.length===3){variants.add(piece.padStart(4,"0"));variants.add(piece.padEnd(4,"0"));}
    if(piece.length===5){variants.add(piece.slice(0,4));variants.add(piece.slice(-4));}
    return [...variants].filter(value=>{const h=Number(value.slice(0,2)),m=Number(value.slice(2));return h>=7&&h<21&&m>=0&&m<60;});
  };
  const left=clocks(parts[0]),right=clocks(parts[1]);
  for(const a of left)for(const b of right){
    const am=Number(a.slice(0,2))*60+Number(a.slice(2)),bm=Number(b.slice(0,2))*60+Number(b.slice(2));
    const diff=Math.abs(am-bm);if(diff>=30&&diff<=240)return true;
  }
  return false;
};

/**
 * Read the ruled table cell by cell. Returns null when the page carries no
 * usable grid, so the caller can fall back to the flat-text path.
 */
async function readGrid(
  upright:Buffer,
  pool:{eng:PooledWorker[];ara:PooledWorker;ara2:PooledWorker},
  authorityDepartmentCode="",
):Promise<GridRow[]|null>{
  const lib=await canvas();
  const image=await lib.loadImage(upright);
  const surface=lib.createCanvas(image.width,image.height);
  surface.getContext("2d").drawImage(image,0,0);
  const bin=otsuBinarize(lib,surface);
  const geometry=adaptiveGridGeometry(lib,surface);
  if(!geometry)return null;
  const {cols,bands}=geometry;

  /* The adaptive detector includes the OUTER table borders, therefore every
     physical cell is exactly the space between two consecutive rules. Do not
     invent an open margin column: doing so shifts TIME/BUILDING/ROOM by one and
     is precisely how a building token used to land in the room field. */
  const columnBands:{left:number;right:number}[]=[];
  for(let i=0;i<cols.length-1;i++){
    const width=cols[i+1]-cols[i];
    if(width>=Math.max(10,image.width*0.004))columnBands.push({left:cols[i],right:cols[i+1]});
  }
  if(columnBands.length<6)return null;

  const top=bands[0].top,bottom=bands[bands.length-1].bottom;
  /* 2× is deliberate. At 1.5× the real four-page CamScanner retained all 28
     geometric rows on page 2 but lost the academic key in 13 of them. That is
     faster-looking failure, not useful speed. */
  const stripScale=2;
  const cropScaled=(source:any,left:number,right:number)=>{
    const rawWidth=right-left,height=bottom-top;
    /* Do not feed the two vertical grid rules to OCR. On narrow numeric cells a
       ruled border is easily hallucinated as «1», which created 1501/1507 and
       bled room digits into 012B09. The semantic cell remains unchanged; only a
       tiny border inset is removed from the recognition image. */
    const insetX=Math.max(1,Math.min(4,Math.round(rawWidth*.045)));
    const x=left+insetX,width=Math.max(1,rawWidth-insetX*2);
    const c=lib.createCanvas(Math.max(1,Math.round(width*stripScale)),Math.max(1,Math.round(height*stripScale)));
    const ctx=c.getContext("2d");
    ctx.imageSmoothingEnabled=true;
    ctx.drawImage(source,x,top,width,height,0,0,c.width,c.height);
    return c.toBuffer("image/png");
  };

  type StripRead={cells:string[]};
  const readStrip=async(source:any,band:{left:number;right:number},alphabet:string,psm:string,worker:PooledWorker=pool.ara):Promise<StripRead>=>{
    await worker.setParameters({tessedit_char_whitelist:alphabet,tessedit_pageseg_mode:psm as any});
    const result:any=await worker.recognize(cropScaled(source,band.left,band.right),{},{text:true,blocks:true});
    const words:{t:string;x:number;y:number}[]=[];
    for(const block of result?.data?.blocks||[])for(const paragraph of block?.paragraphs||[])for(const line of paragraph?.lines||[])for(const word of line?.words||[]){
      const text=String(word?.text||"").trim();
      if(text)words.push({t:text,x:word.bbox.x0,y:(word.bbox.y0+word.bbox.y1)/2/stripScale+top});
    }
    const cells=bands.map(row=>words.filter(w=>w.y>=row.top&&w.y<row.bottom).sort((a,b)=>b.x-a.x).map(w=>w.t).join(" ").trim());
    return{cells};
  };

  /* Pass 1 — numerics, from grey AND binarized. The two fail on different
     rows; per cell, the value the validator accepts wins. */
  const NUMERIC="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ -";
  /* Grey strips fan out over the pool. The binarized pass — an equal second
     bill — is paid only for the columns the grey pass left weak: on the real
     scan most columns validate from grey alone, so most of that bill vanishes. */
  /* Import only needs the identity/scheduling edges of this report. Capacity,
     reserved-seat and bundle columns in the middle do not participate in course,
     time, location or instructor resolution, so OCRing all ~21 strips was pure
     latency. Keep a safety window on both edges; validators still prove which
     strip is which before any value is accepted. */
  const edgeIndices=[...Array.from({length:Math.min(6,Math.max(0,columnBands.length-1))},(_,index)=>index+1),
    ...Array.from({length:Math.min(5,columnBands.length)},(_,offset)=>columnBands.length-1-offset)]
    .filter((index,pos,list)=>index>=0&&list.indexOf(index)===pos).sort((a,b)=>a-b);
  const greyReads=await runOnPool(pool.eng,edgeIndices.map(index=>(worker:PooledWorker)=>readStrip(surface,columnBands[index],NUMERIC,"6",worker)));
  const numericGrey:StripRead[]=columnBands.map(()=>({cells:bands.map(()=>"")}));
  edgeIndices.forEach((columnIndex,at)=>{numericGrey[columnIndex]=greyReads[at];});
  const anyPattern=Object.values(stripPatterns);
  const bestPatternHits=(read:StripRead)=>Math.max(...anyPattern.map(pattern=>read.cells.filter(cell=>pattern.test(cell.replace(/\s+/g," ").trim())).length));
  const likelyStructural=new Set<number>([1,3,4,5,...Array.from({length:Math.min(5,columnBands.length)},(_,offset)=>columnBands.length-1-offset)]);
  const binIndices=edgeIndices.filter(index=>{
    const best=bestPatternHits(numericGrey[index]);
    return best<bands.length*0.5&&(best>0||likelyStructural.has(index));
  });
  const binReads=await runOnPool(pool.eng,
    binIndices.map(index=>(worker:PooledWorker)=>readStrip(bin,columnBands[index],NUMERIC,"6",worker)));
  const numericBin:StripRead[]=columnBands.map(()=>({cells:bands.map(()=>"")}));
  binIndices.forEach((columnIndex,at)=>{numericBin[columnIndex]=binReads[at];});

  const normalizeCell=(value:string)=>value.replace(/\s+/g," ").trim();
  const validatorHits=(cells:string[],pattern:RegExp)=>cells.filter(cell=>pattern.test(normalizeCell(cell))).length;
  const validatorHitsBy=(cells:string[],test:(value:string)=>boolean)=>cells.filter(cell=>test(normalizeCell(cell))).length;
  const courseCellTest=(value:string)=>authorityCourseCellLooksPlausible(value,authorityDepartmentCode);
  const refCourseCellTest=(value:string)=>authorityReferenceCourseCellLooksPlausible(value,authorityDepartmentCode);

  /* Columns claim their meaning by what validates in them. */
  const claim=(pattern:RegExp,minimum:number,exclude:Set<number>)=>{
    let bestIndex=-1,bestHits=0;
    for(let i=0;i<columnBands.length;i++){
      if(exclude.has(i))continue;
      const hits=Math.max(validatorHits(numericGrey[i].cells,pattern),validatorHits(numericBin[i].cells,pattern));
      if(hits>bestHits){bestHits=hits;bestIndex=i;}
    }
    return bestHits>=minimum?bestIndex:-1;
  };
  const claimBy=(test:(value:string)=>boolean,minimum:number,exclude:Set<number>)=>{
    let bestIndex=-1,bestHits=0;
    for(let i=0;i<columnBands.length;i++){
      if(exclude.has(i))continue;
      const hits=Math.max(validatorHitsBy(numericGrey[i].cells,test),validatorHitsBy(numericBin[i].cells,test));
      if(hits>bestHits){bestHits=hits;bestIndex=i;}
    }
    return bestHits>=minimum?bestIndex:-1;
  };
  const taken=new Set<number>();
  /* A final report page can contain one or two rows. Requiring two validator
     hits made those legitimate tail pages disappear entirely. Geometry has
     already proved the table, so one row is sufficient evidence here. */
  const minimumRows=Math.max(1,Math.floor(bands.length*0.15));
  const timeIndex=claimBy(authorityTimeCellLooksPlausible,minimumRows,taken);if(timeIndex>=0)taken.add(timeIndex);

  /* SWRSCHA's semantic block is:
       instructor | days | activity | time | building | room | ...
     but photographed pages can contain FALSE vertical strokes inside a wide
     cell. Therefore `time + 1` is only a starting hypothesis, not proof. Probe
     a tiny bounded window to the right of TIME and let the OWNER-SUPPLIED site
     prefixes prove the building column. This is what stops seat/capacity text
     such as 345045 or 520020 from ever being displayed as a building. */
  const geometryHits=(index:number,pattern:RegExp)=>index>=0&&index<columnBands.length
    ? Math.max(validatorHits(numericGrey[index].cells,pattern),validatorHits(numericBin[index].cells,pattern))
    : 0;
  const boundedIndices=(from:number,to:number)=>Array.from({length:Math.max(0,to-from+1)},(_,offset)=>from+offset)
    .filter(index=>index>=0&&index<columnBands.length);
  const locationProbeIndices=timeIndex>=0?boundedIndices(timeIndex+1,timeIndex+6):[];
  if(locationProbeIndices.length){
    /* These strips are cheap and were previously outside the first-six edge
       window on scans with a false instructor rule. Reading them now prevents
       the later rescue from being locked onto the wrong physical column. */
    const locationReads=await runOnPool(pool.eng,locationProbeIndices.flatMap(index=>[
      (worker:PooledWorker)=>readStrip(surface,columnBands[index],"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ","6",worker),
      (worker:PooledWorker)=>readStrip(bin,columnBands[index],"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ","6",worker),
    ]));
    locationProbeIndices.forEach((index,at)=>{numericGrey[index]=locationReads[at*2];numericBin[index]=locationReads[at*2+1];});
  }
  const bestBy=(indices:number[],test:(value:string)=>boolean,minimum:number)=>{
    let bestIndex=-1,bestHits=0;
    for(const index of indices){
      const hits=Math.max(validatorHitsBy(numericGrey[index].cells,test),validatorHitsBy(numericBin[index].cells,test));
      if(hits>bestHits){bestHits=hits;bestIndex=index;}
    }
    return bestHits>=minimum?bestIndex:-1;
  };
  const provenBuilding=bestBy(locationProbeIndices,authorityBuildingCellLooksPlausible,minimumRows);
  const geometricBuilding=timeIndex>=0&&timeIndex+1<columnBands.length?timeIndex+1:-1;
  const buildingIndex=provenBuilding>=0?provenBuilding:geometricBuilding;
  if(buildingIndex>=0)taken.add(buildingIndex);

  /* Room is resolved only AFTER the building column. If a false rule split the
     building cell, scan at most the next three strips and pick the first column
     with real room-shaped evidence; never search the capacities block. */
  const roomProbeIndices=buildingIndex>=0?boundedIndices(buildingIndex+1,buildingIndex+3):[];
  const provenHall=bestBy(roomProbeIndices,value=>stripPatterns.hall.test(normalizeCell(value)),minimumRows);
  const geometricHall=buildingIndex>=0&&buildingIndex+1<columnBands.length?buildingIndex+1:-1;
  const hallIndex=provenHall>=0?provenHall:geometricHall;
  if(hallIndex>=0)taken.add(hallIndex);

  const geometricDays=timeIndex>=2?timeIndex-2:-1;
  const daysIndex=geometryHits(geometricDays,stripPatterns.days)>=minimumRows?geometricDays:claim(stripPatterns.days,minimumRows,taken);
  if(daysIndex>=0)taken.add(daysIndex);

  /* The academic key lives near the RIGHT edge, but the photographed PDF also
     carries a vertical CamScanner/page artefact beyond the real table border.
     The previous implementation blindly anchored the course code to the final
     physical band; on pages 2–3 that meant the watermark margin became part of
     the key, shifting section/course-name extraction. Search a bounded right-
     edge window instead, and let the 7-digit/11–13-digit validators prove the
     actual span. False rules INSIDE the course code are still repaired by
     joining at most three adjacent bands. */
  type Span={from:number;to:number};
  const joinedCells=(reads:StripRead[],span:Span)=>bands.map((_,row)=>{
    let value="";for(let index=span.from;index<=span.to;index++)value+=normalizeCell(reads[index]?.cells[row]||"").replace(/\s+/g,"");
    return value;
  });
  const spanHits=(span:Span,pattern:RegExp)=>Math.max(validatorHits(joinedCells(numericGrey,span),pattern),validatorHits(joinedCells(numericBin,span),pattern));
  const spanHitsBy=(span:Span,test:(value:string)=>boolean)=>Math.max(validatorHitsBy(joinedCells(numericGrey,span),test),validatorHitsBy(joinedCells(numericBin,span),test));
  const lastBand=columnBands.length-1,maxJoin=Math.min(3,columnBands.length);
  const keySearchFrom=Math.max(0,columnBands.length-7);
  let codeSpan:Span|null=null,refcodeSpan:Span|null=null,bestCodeHits=0,bestRefcodeHits=0;
  for(let end=lastBand;end>=keySearchFrom;end--){
    for(let width=1;width<=maxJoin;width++){
      const from=end-width+1;if(from<keySearchFrom)continue;
      const span={from,to:end};
      const codeHits=spanHitsBy(span,courseCellTest);
      if(codeHits>bestCodeHits||(codeHits===bestCodeHits&&codeHits>0&&codeSpan&&(span.to>codeSpan.to||(span.to===codeSpan.to&&width<(codeSpan.to-codeSpan.from+1))))){bestCodeHits=codeHits;codeSpan=span;}
      const bothHits=spanHitsBy(span,refCourseCellTest);
      if(bothHits>bestRefcodeHits||(bothHits===bestRefcodeHits&&bothHits>0&&refcodeSpan&&(span.to>refcodeSpan.to||(span.to===refcodeSpan.to&&width<(refcodeSpan.to-refcodeSpan.from+1))))){bestRefcodeHits=bothHits;refcodeSpan=span;}
    }
  }
  if(bestCodeHits<minimumRows)codeSpan=null;
  /* Prefer a proven 7-digit code span over a wider reference+code span: false
     vertical strokes inside the code are common; a genuinely missing separator
     still falls through to refcode below. */
  if(codeSpan)refcodeSpan=null;else if(bestRefcodeHits<minimumRows)refcodeSpan=null;
  for(const span of [codeSpan,refcodeSpan])if(span)for(let index=span.from;index<=span.to;index++)taken.add(index);

  let refcodeIndex=-1,codeIndex=-1,referenceIndex=-1;
  if(!codeSpan&&!refcodeSpan){
    refcodeIndex=claimBy(refCourseCellTest,minimumRows,taken);if(refcodeIndex>=0)taken.add(refcodeIndex);
    codeIndex=refcodeIndex>=0?-1:claimBy(courseCellTest,minimumRows,taken);if(codeIndex>=0)taken.add(codeIndex);
  }
  if(codeSpan){
    const expected=codeSpan.from-1;
    referenceIndex=geometryHits(expected,stripPatterns.reference)>=minimumRows?expected:claim(stripPatterns.reference,minimumRows,taken);
  }else if(!refcodeSpan&&refcodeIndex<0){
    referenceIndex=claim(stripPatterns.reference,minimumRows,taken);
  }
  if(referenceIndex>=0)taken.add(referenceIndex);

  /* The section column sits immediately left of reference (or of a merged
     reference+course cell). Test that structural neighbour first; only a failed
     structural read may use the general validator search. */
  const anchorIndex=refcodeSpan?.from??(refcodeIndex>=0?refcodeIndex:(referenceIndex>=0?referenceIndex:(codeSpan?.from??codeIndex)));
  let scodeIndex=-1;
  for(const near of [anchorIndex-1,anchorIndex+1]){
    if(near<0||near>=columnBands.length||taken.has(near))continue;
    const hits=Math.max(validatorHits(numericGrey[near].cells,stripPatterns.scode),validatorHits(numericBin[near].cells,stripPatterns.scode));
    if(hits>=minimumRows){scodeIndex=near;break;}
  }
  if(scodeIndex<0)scodeIndex=claim(stripPatterns.scode,minimumRows,taken);
  if(scodeIndex>=0)taken.add(scodeIndex);
  if(timeIndex<0&&!codeSpan&&!refcodeSpan&&refcodeIndex<0&&codeIndex<0)return null;

  const DIGITS="0123456789 -";
  const spanIndices=[codeSpan,refcodeSpan].filter((span):span is Span=>Boolean(span)).flatMap(span=>Array.from({length:span.to-span.from+1},(_,offset)=>span.from+offset));
  const refineIndices=[daysIndex,refcodeIndex,referenceIndex,codeIndex,scodeIndex,...spanIndices].filter((index,pos,list)=>index>=0&&list.indexOf(index)===pos);
  const refined=await runOnPool(pool.eng,refineIndices.flatMap(index=>[
    (worker:PooledWorker)=>readStrip(surface,columnBands[index],DIGITS,"6",worker),
    (worker:PooledWorker)=>readStrip(bin,columnBands[index],DIGITS,"6",worker),
  ]));
  refineIndices.forEach((index,at)=>{numericGrey[index]=refined[at*2];numericBin[index]=refined[at*2+1];});

  /* Cell-by-cell is the expensive rescue path, not the default path. The old
     reader re-ran EVERY time cell even when the strip had already read it
     correctly. On a 27-row page that meant 27 extra OCR calls per page. Now
     only cells that fail the time validator are re-read, preserving the fast
     strip result for the majority of rows. */
  const readCell=async(source:any,band:{left:number;right:number},rowBand:{top:number;bottom:number},alphabet:string,worker:PooledWorker=pool.ara):Promise<string>=>{
    const rawWidth=band.right-band.left,rawHeight=rowBand.bottom-rowBand.top;
    if(rawWidth<6||rawHeight<6)return"";
    const insetX=Math.max(1,Math.min(4,Math.round(rawWidth*.05)));
    const insetY=Math.max(1,Math.min(3,Math.round(rawHeight*.08)));
    const left=band.left+insetX,topCell=rowBand.top+insetY;
    const width=Math.max(1,rawWidth-insetX*2),height=Math.max(1,rawHeight-insetY*2);
    const cell=lib.createCanvas(Math.max(1,Math.round(width*stripScale)),Math.max(1,Math.round(height*stripScale)));
    const ctx=cell.getContext("2d");
    ctx.imageSmoothingEnabled=true;
    ctx.drawImage(source,left,topCell,width,height,0,0,cell.width,cell.height);
    await worker.setParameters({tessedit_char_whitelist:alphabet,tessedit_pageseg_mode:"7" as any});
    try{
      const result:any=await worker.recognize(cell.toBuffer("image/png"));
      return String(result?.data?.text||"").replace(/\s+/g," ").trim();
    }catch{return"";}
  };
  if(timeIndex>=0){
    const needsTimeCell=bands.map((_,row)=>{
      const grey=normalizeCell(numericGrey[timeIndex].cells[row]||"");
      const binary=normalizeCell(numericBin[timeIndex].cells[row]||"");
      return !stripPatterns.time.test(grey)&&!stripPatterns.time.test(binary);
    });
    const missingRows=needsTimeCell.map((missing,row)=>missing?row:-1).filter(row=>row>=0);
    if(missingRows.length){
      const rescued=await runOnPool(pool.eng,missingRows.map(row=>(worker:PooledWorker)=>readCell(surface,columnBands[timeIndex],bands[row],DIGITS,worker)));
      const next=[...numericGrey[timeIndex].cells];
      missingRows.forEach((row,at)=>{if(rescued[at])next[row]=rescued[at];});
      numericGrey[timeIndex]={cells:next};
    }
  }

  /* A weak/shadowed page may prove the whole strip but drop isolated row keys.
     Rescue only the SAME already-proven physical cell; never search a neighbour
     and never trim a value. The catalogue/registry still canonicalize later. */
  const rescueIndex=async(index:number,pattern:RegExp,alphabet:string)=>{
    if(index<0)return;
    const missing=bands.map((_,row)=>{
      const grey=normalizeCell(numericGrey[index].cells[row]||"");
      const binary=normalizeCell(numericBin[index].cells[row]||"");
      return !pattern.test(grey)&&!pattern.test(binary)?row:-1;
    }).filter(row=>row>=0);
    if(!missing.length)return;
    const rescued=await runOnPool(pool.eng,missing.map(row=>(worker:PooledWorker)=>readCell(surface,columnBands[index],bands[row],alphabet,worker)));
    const next=[...numericGrey[index].cells];
    missing.forEach((row,at)=>{const value=normalizeCell(rescued[at]||"");if(pattern.test(value))next[row]=value;});
    numericGrey[index]={cells:next};
  };
  const rescueSpan=async(span:Span|null,pattern:RegExp,alphabet:string)=>{
    if(!span)return;
    const current=(reads:StripRead[],row:number)=>{let value="";for(let index=span.from;index<=span.to;index++)value+=normalizeCell(reads[index]?.cells[row]||"").replace(/\s+/g,"");return value;};
    const missing=bands.map((_,row)=>!pattern.test(current(numericGrey,row))&&!pattern.test(current(numericBin,row))?row:-1).filter(row=>row>=0);
    if(!missing.length)return;
    const band={left:columnBands[span.from].left,right:columnBands[span.to].right};
    const rescued=await runOnPool(pool.eng,missing.map(row=>(worker:PooledWorker)=>readCell(surface,band,bands[row],alphabet,worker)));
    const first=[...numericGrey[span.from].cells];
    missing.forEach((row,at)=>{const value=normalizeCell(rescued[at]||"").replace(/\s+/g,"");if(pattern.test(value))first[row]=value;});
    numericGrey[span.from]={cells:first};
    for(let index=span.from+1;index<=span.to;index++){
      const rest=[...numericGrey[index].cells];missing.forEach(row=>{if(pattern.test(first[row]||""))rest[row]="";});numericGrey[index]={cells:rest};
    }
  };
  const KEY_DIGITS="0123456789";
  const LOCATION_ALNUM="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if(codeSpan)await rescueSpan(codeSpan,stripPatterns.code,KEY_DIGITS);
  else if(refcodeSpan)await rescueSpan(refcodeSpan,stripPatterns.refcode,KEY_DIGITS);
  else if(refcodeIndex>=0)await rescueIndex(refcodeIndex,stripPatterns.refcode,KEY_DIGITS);
  else await rescueIndex(codeIndex,stripPatterns.code,KEY_DIGITS);
  await rescueIndex(scodeIndex,stripPatterns.scode,KEY_DIGITS);
  await rescueIndex(daysIndex,stripPatterns.days,"12345 ");
  await rescueIndex(buildingIndex,stripPatterns.building,LOCATION_ALNUM);

  /* Rooms are the narrowest identity cells in SWRSCHA. Whole-column OCR can
     legitimately turn F32 into 32 while still producing a syntactically valid
     token; an "invalid-only" rescue would therefore miss exactly the dangerous
     cases. Once geometry has PROVEN the room column, re-read each room cell in
     isolation (PSM 7) and prefer that same-cell value only when it validates.
     The five-worker pool keeps this bounded, and no neighbouring column is ever
     consulted or used as evidence. */
  if(hallIndex>=0){
    const isolated=await runOnPool(pool.eng,bands.map(row=>(worker:PooledWorker)=>readCell(surface,columnBands[hallIndex],row,LOCATION_ALNUM,worker)));
    const next=[...numericGrey[hallIndex].cells];
    isolated.forEach((raw,row)=>{const value=normalizeCell(raw||"").replace(/\s+/g,"").toUpperCase();if(stripPatterns.hall.test(value))next[row]=value;});
    numericGrey[hallIndex]={cells:next};
  }

  /* Pass 2 — Arabic. Instructor names are mandatory because the system must
     display every doctor after upload. Course names are only an OCR fallback:
     once the numeric course key is readable on most rows, the authoritative
     name comes from the system catalogue and paying a second Arabic strip adds
     time without adding truth. */
  await pool.ara.setParameters({tessedit_char_whitelist:"",tessedit_pageseg_mode:"4" as any});
  const unclaimed=columnBands.map((band,index)=>({band,index,width:band.right-band.left}))
    .filter(item=>!taken.has(item.index));
  /* Instructor is the semantic field immediately LEFT of DAYS, but a phone
     photo can draw one or two false "vertical rules" through the wide Arabic
     name cell. `time - 3` then reads only the LAST fragment of the doctor's
     name, which destroyed the previously-good exact instructor matching.
     Rejoin up to three contiguous physical bands ending immediately before DAYS.
     On a clean PDF this is exactly one band; on the measured photo it rejoins
     the three fragments of the same instructor cell. No neighbouring semantic
     field is crossed because DAYS is the hard right boundary. */
  const instructorEnd=daysIndex>0?daysIndex-1:(timeIndex>=3?timeIndex-3:-1);
  const instructorStart=instructorEnd>=0?Math.max(0,instructorEnd-2):-1;
  const instructorBand=instructorEnd>=0?{
    index:instructorEnd,
    band:{left:columnBands[instructorStart].left,right:columnBands[instructorEnd].right},
    width:columnBands[instructorEnd].right-columnBands[instructorStart].left,
  }:undefined;
  const codeSignalIndex=refcodeIndex>=0?refcodeIndex:codeIndex;
  const codeHits=codeSpan?spanHitsBy(codeSpan,courseCellTest)
    :refcodeSpan?spanHitsBy(refcodeSpan,refCourseCellTest)
    :(codeSignalIndex>=0?Math.max(
      validatorHitsBy(numericGrey[codeSignalIndex].cells,refcodeIndex>=0?refCourseCellTest:courseCellTest),
      validatorHitsBy(numericBin[codeSignalIndex].cells,refcodeIndex>=0?refCourseCellTest:courseCellTest),
    ):0);
  /* Always preserve the printed Arabic course-name column. Course catalogues in
     this system often store the short 3-digit code (101/156/201), while the
     Authority PDF prints the full 7-digit institutional key. Skipping names
     merely because the 7-digit strip OCR looked strong made unresolved rows
     appear as «0101156» instead of their course name. One Arabic strip per page
     buys both a human-readable preview and an exact-name fallback. */
  const needCourseNames=true;
  const preferredNameIndex=scodeIndex>0?scodeIndex-1:-1;
  const fallbackNameIndex=anchorIndex>1?anchorIndex-2:-1;
  const nameBand=needCourseNames
    ? (unclaimed.find(item=>item.index===preferredNameIndex)||unclaimed.find(item=>item.index===fallbackNameIndex))
    : undefined;
  const arabicRead=async(item?:{band:{left:number;right:number}})=>{
    if(!item)return{cells:bands.map(()=>"")};
    return readStrip(surface,item.band,"","4");
  };
  const namePromise=arabicRead(nameBand);
  let instructorPromise:Promise<{cells:string[]}>=Promise.resolve({cells:bands.map(()=>"")});
  if(instructorBand&&instructorBand.index!==nameBand?.index){
    instructorPromise=(async()=>{
      const sparse=await readStrip(surface,instructorBand.band,"","4",pool.ara2);
      const dense=await readStrip(surface,instructorBand.band,"","6",pool.ara2);
      return{cells:bands.map((_,row)=>{
        const a=(sparse.cells[row]||"").trim(),b=(dense.cells[row]||"").trim();
        return a.length>=b.length?a:b;
      })};
    })();
  }
  const nameCells=await namePromise;
  const instructorCells=await instructorPromise;

  /* The claiming pass shares one alphanumeric alphabet so building and hall
     can be recognised at all — but that same freedom lets stray strokes become
     letters inside the time and days columns and break their patterns. Once a
     column has claimed a purely-numeric meaning, it is read AGAIN with digits
     only, from both sources. Two small strips; measured, the difference is the
     majority of the time column. */


  const pickValidated=(index:number,pattern:RegExp)=>(row:number)=>{
    if(index<0)return"";
    const grey=normalizeCell(numericGrey[index].cells[row]||"");
    const binary=normalizeCell(numericBin[index].cells[row]||"");
    if(pattern.test(grey))return grey;
    if(pattern.test(binary))return binary;
    return grey||binary;
  };
  const pickValidatedBy=(index:number,test:(value:string)=>boolean)=>(row:number)=>{
    if(index<0)return"";
    const grey=normalizeCell(numericGrey[index].cells[row]||"");
    const binary=normalizeCell(numericBin[index].cells[row]||"");
    if(test(grey))return grey;
    if(test(binary))return binary;
    return grey||binary;
  };
  const timeAt=pickValidated(timeIndex,stripPatterns.time);
  const buildingAt=pickValidated(buildingIndex,stripPatterns.building);
  const hallAt=pickValidated(hallIndex,stripPatterns.hall);
  const daysAt=pickValidated(daysIndex,stripPatterns.days);
  const pickSpanValidated=(span:Span|null,pattern:RegExp)=>(row:number)=>{
    if(!span)return"";
    const joined=(reads:StripRead[])=>{let value="";for(let index=span.from;index<=span.to;index++)value+=normalizeCell(reads[index]?.cells[row]||"").replace(/\s+/g,"");return value;};
    const grey=joined(numericGrey),binary=joined(numericBin);
    if(pattern.test(grey))return grey;
    if(pattern.test(binary))return binary;
    return grey||binary;
  };
  const pickSpanValidatedBy=(span:Span|null,test:(value:string)=>boolean)=>(row:number)=>{
    if(!span)return"";
    const joined=(reads:StripRead[])=>{let value="";for(let index=span.from;index<=span.to;index++)value+=normalizeCell(reads[index]?.cells[row]||"").replace(/\s+/g,"");return value;};
    const grey=joined(numericGrey),binary=joined(numericBin);
    if(test(grey))return grey;
    if(test(binary))return binary;
    return grey||binary;
  };
  const refcodeAt=refcodeSpan?pickSpanValidatedBy(refcodeSpan,refCourseCellTest):pickValidatedBy(refcodeIndex,refCourseCellTest);
  const codeAt=codeSpan?pickSpanValidatedBy(codeSpan,courseCellTest):pickValidatedBy(codeIndex,courseCellTest);
  const referenceAt=pickValidated(referenceIndex,stripPatterns.reference);
  const scodeAt=pickValidated(scodeIndex,stripPatterns.scode);

  /* «الفرع: 012» in the header is the building prefix for every row, so the
     rows themselves vote it in: the majority prefix among the cells that
     validated. A cell that failed then only needs its letter and two digits
     recovered — and the letter, when the scan turned it into a digit, morphs
     back at a KNOWN position, anchored by the prefix. This is what the free-
     floating letter repair reverted earlier could never promise. */
  // Rooms are identifiers, not prose. Never reconstruct a plausible room from
  // ambiguous OCR. A wrong room is more dangerous than an empty one because it
  // can be published unnoticed; only validator-clean values survive.
  const safeBuilding=(raw:string)=>{
    const value=toAscii(raw).replace(/\s+/g,"").trim().toUpperCase();
    if(stripPatterns.building.test(value))return cleanBuildingCode(value);
    /* Preserve one very specific extraction artefact as RAW evidence:
       012B09 + a neighbouring room digit can become 012B091. The server only
       repairs this when the six-character prefix resolves to one CONFIRMED
       canonical building, so we neither invent nor silently shorten a code. */
    if(/^\d{3}[A-Z]\d{3}$/.test(value))return value;
    return"";
  };
  const safeHall=(raw:string)=>{
    const value=toAscii(raw).replace(/\s+/g,"").trim().toUpperCase();
    if(!/^(?:[A-Z]\d{1,3}|\d{1,4}[A-Z]?)$/.test(value))return"";
    return cleanHallCode(value);
  };

  /* The printed Authority clocks on one page share a stable one-minute
     lattice. A ruled right border is sometimes OCR'd as the last digit (0800 →
     0801, 1400 → 1406). Derive the dominant final digit from the many intact
     four-digit clocks on THIS page; correction is then page evidence rather
     than a hard-coded schedule assumption. */
  const clockTailCounts=new Map<string,number>();let clockTailSamples=0;
  for(let row=0;row<bands.length;row++){
    for(const piece of timeAt(row).replace(/\D+/g," ").trim().split(" ").filter(Boolean)){
      if(!/^\d{4}$/.test(piece))continue;
      clockTailSamples++;const tail=piece.slice(-1);clockTailCounts.set(tail,(clockTailCounts.get(tail)||0)+1);
    }
  }
  const dominantClockTail=[...clockTailCounts.entries()].sort((a,b)=>b[1]-a[1])[0];
  const pageClockTail=dominantClockTail&&dominantClockTail[1]>=Math.max(4,Math.ceil(clockTailSamples*.55))?dominantClockTail[0]:"";
  const teachingClock=(value:string)=>{const h=Number(value.slice(0,2)),m=Number(value.slice(2));return /^\d{4}$/.test(value)&&h>=7&&h<21&&m<60;};

  const rowsOut:GridRow[]=[];
  for(let row=0;row<bands.length;row++){
    /* A table border read as «1» prefixes the digits; the tail is the value. */
    let refcode=refcodeAt(row).replace(/\D/g,"");
    if(refcode.length>13)refcode=refcode.slice(-13);
    let reference=referenceAt(row).replace(/\D/g,""),code=codeAt(row).replace(/\D/g,"");
    if(reference.length>6)reference=reference.slice(-6);
    if(code.length>7)code=code.slice(-7);
    /* Authority exports across years use 4–6 digit reference numbers but the
       academic course key is consistently the 7-digit tail. Split from the
       tail instead of hard-coding a 5+7 layout. */
    if(refcode.length>=11&&refcode.length<=13){
      code=refcode.slice(-7);
      reference=refcode.slice(0,-7);
    }
    const rawTime=timeAt(row);
    const timeText=rawTime.replace(/\D+/g," ").trim();
    let pieces=timeText.split(" ").filter(piece=>piece.length>=3&&piece.length<=4);
    /* Some OCR passes retain all eight clock digits but lose only the printed
       dash. The column has already been semantically proven as TIME, so 09200800
       can be split into its two four-digit clocks without consulting a neighbour. */
    if(pieces.length<2){
      const packed=rawTime.replace(/\D/g,"");
      if(/^\d{8}$/.test(packed))pieces=[packed.slice(0,4),packed.slice(4)];
    }
    let start="",end="";
    /* A 3-digit piece lost one digit, and which end it lost decides the hour:
       «080» is 0800 with its tail gone, «950» is 0950 with its head gone. Try
       both pads and keep the one that lands inside teaching hours — for these
       values exactly one of them ever does. */
    const mend=(piece:string):string|null=>{
      if(piece.length===4){
        let value=piece;
        /* Only a one-character tail correction is permitted, only when a
           dominant tail was independently learned from this same page. */
        if(pageClockTail&&value.slice(-1)!==pageClockTail&&teachingClock(value)){
          const corrected=value.slice(0,-1)+pageClockTail;
          if(teachingClock(corrected)&&Math.abs(Number(value.slice(-1))-Number(pageClockTail))<=6)value=corrected;
        }
        return teachingClock(value)?value:null;
      }
      const padded=[piece.padEnd(4,"0"),piece.padStart(4,"0")].filter(teachingClock);
      return padded.length===1?padded[0]:null;
    };
    const mended=pieces.map(mend).filter((value):value is string=>Boolean(value));
    if(mended.length>=2){
      const toMinutes=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(2));
      const sorted=[...mended].sort((a,b)=>toMinutes(a)-toMinutes(b));
      start=`${sorted[0].slice(0,2)}:${sorted[0].slice(2)}`;
      end=`${sorted[sorted.length-1].slice(0,2)}:${sorted[sorted.length-1].slice(2)}`;
    }
    let scode=scodeAt(row).replace(/\D/g,"");
    if(!/^\d{3}$/.test(scode)||Number(scode)<501)scode="";

    const bRaw=buildingAt(row);
    const hRaw=hallAt(row);
    /* Column identity is stronger evidence than a token that merely “looks
       like” a room/building. Never rescue one field from another column. */
    const building=safeBuilding(bRaw);
    const hall=safeHall(hRaw);

    /* Days stay in the days cell. Do not “rescue” them from units/capacity
       columns where values such as 3 or 5 are valid digits but wrong evidence. */
    const rowDays=daysAt(row).trim();

    rowsOut.push({
      code,reference,scode,
      courseText:normalizeCell(nameCells.cells[row]||""),
      instructorText:normalizeCell(instructorCells.cells[row]||""),
      days:rowDays,daysRaw:rowDays,timeRaw:rawTime,
      start,end,
      building,
      hall,
      buildingRaw:bRaw,
      hallRaw:hRaw,
      sourceMode:"ocr-grid",
    });
  }
  const meaningful=rowsOut.filter(row=>row.code||row.start||row.courseText.length>3);
  /* The final physical page may contain only one or two legitimate rows. The
     adaptive grid/header proof above is what makes this safe. */
  return meaningful.length>=1?rowsOut:null;
}

/**
 * The term the sheet says it belongs to: «الفصل الدراسي الاول 2027-2026».
 *
 * The header names the term on every export, and uploading last year's sheet
 * into this year's term is the one mistake nothing downstream can catch — the
 * rows are all valid, just a year old. Read it here so the caller can compare
 * it with the term the person actually selected.
 */
function readHeaderTerm(text:string):HeaderTerm|undefined{
  const ascii=toAscii(text).replace(/\r/g,"");
  const seasonOf=(value:string):HeaderTerm["season"]=>/الاول|الأول/.test(value)?"first":/الثاني|الثانى/.test(value)?"second":"summer";
  const build=(seasonRaw:string,aRaw:string,bRaw:string):HeaderTerm=>{
    const season=seasonOf(seasonRaw),a=Number(aRaw),b=Number(bRaw);
    const years:[number,number]=[Math.min(a,b),Math.max(a,b)];
    const seasonLabel=season==="first"?"الأول":season==="second"?"الثاني":"الصيفي";
    return{season,years,label:`الفصل الدراسي ${seasonLabel} ${years[0]}/${years[1]}`};
  };
  /* Logical-order text (what a browser normally gives us). */
  let match=ascii.match(/الفصل\s*الدراسي\s*(الاول|الأول|الثاني|الثانى|الصيفي|الصيفى)\s*(\d{4})\s*[-/]\s*(\d{4})/)
    ||ascii.match(/(الاول|الأول|الثاني|الثانى|الصيفي|الصيفى)\s*(\d{4})\s*[-/]\s*(\d{4})/);
  if(match)return build(match[1],match[2],match[3]);
  /* Oracle/Quartz RTL exports can expose the same visible header in physical
     order: «2027-2026 الاول الدراسي الفصل». The year pair appearing BEFORE
     the season is still explicit page-header evidence and must not force OCR. */
  match=ascii.match(/(\d{4})\s*[-/]\s*(\d{4})\s*(الاول|الأول|الثاني|الثانى|الصيفي|الصيفى)(?:\s*الدراسي)?(?:\s*الفصل)?/);
  if(match)return build(match[3],match[1],match[2]);
  return undefined;
}

/** Branch line printed in the Authority header, e.g.
 * «الفرع: 012 كلية التربية الأساسية بنات». RTL PDF text layers sometimes
 * expose the exact same visible cell as «012 كلية التربية الأساسية بنات : الفرع»;
 * both are document evidence, not an inferred campus. */
function readHeaderBranch(text:string):HeaderBranch|undefined{
  const ascii=toAscii(text).replace(/\r/g,"");
  const build=(code:string,nameRaw:string):HeaderBranch=>{
    const name=String(nameRaw||"")
      .replace(/\s+(?:القسم|الكلية|الفصل|التاريخ|رقم\s*المقرر|مسمى\s*المقرر)\s*[:：]?.*$/," ")
      .replace(/^[|:：-]+|[|:：-]+$/g,"").replace(/\s+/g," ").trim();
    return{code,name,label:[code,name].filter(Boolean).join(" ")};
  };
  const campusName=String.raw`(?:كلي[هة]\s+)?(?:التربي[هة]\s+الاساسي[هة]|التربي[هة]\s+الأساسي[هة]|الدراسات[^\n]{0,40}|العلوم[^\n]{0,40}|التمريض[^\n]{0,40})[^\n]{0,70}?(?:بنات|بنين|الجهراء|الفحيحيل)`;
  for(const rawLine of ascii.split("\n")){
    const line=rawLine.replace(/\s+/g," ").trim();
    let match=line.match(/الفرع\s*[:：-]?\s*(\d{3})\s*(.*)$/);
    if(match)return build(match[1],match[2]);
    /* Some Oracle/PDF extractors glue the code to the Arabic word visually:
       «012كليه التربية الاساسيه بنات الفرع». A word boundary or mandatory
       space rejects a perfectly valid Authority header, so the campus phrase
       itself is the boundary evidence. */
    match=line.match(new RegExp(`(?:^|\\s)(\\d{3})\\s*(${campusName})\\s*[:：-]?\\s*الفرع(?:\\s|$)`));
    if(match)return build(match[1],match[2]);
    /* Some raw layers split the campus name away but keep «012 : الفرع». */
    match=line.match(/(?:^|\s)(\d{3})\s*[:：-]?\s*الفرع(?:\s|$)/);
    if(match)return build(match[1],"");
  }
  const flat=ascii.replace(/\s+/g," ").trim();
  let flatMatch=flat.match(/الفرع\s*[:：-]?\s*(\d{3})\s*([^]{0,180}?)(?=\s+(?:القسم|الكلية|الفصل|التاريخ|رقم\s*المقرر|مسمى\s*المقرر)\b|$)/);
  if(flatMatch)return build(flatMatch[1],flatMatch[2]);
  flatMatch=flat.match(new RegExp(`(?:^|\\s)(\\d{3})\\s*(${campusName})\\s*[:：-]?\\s*الفرع(?:\\s|$)`));
  if(flatMatch)return build(flatMatch[1],flatMatch[2]);
  const reversedCode=flat.match(/(?:^|\s)(\d{3})\s*[:：-]?\s*الفرع(?:\s|$)/);
  if(reversedCode){
    /* Search immediately BEFORE the code for the visible campus wording. */
    const at=reversedCode.index||0, before=flat.slice(Math.max(0,at-150),at).trim();
    const nameMatch=before.match(new RegExp(`(${campusName})$`));
    return build(reversedCode[1],nameMatch?.[1]||"");
  }
  const structural=flat.match(new RegExp(`(?:^|\\s)(\\d{3})\\s*(${campusName})(?=\\s|$)`));
  return structural?build(structural[1],structural[2]):undefined;
}

/** Department printed in the document header, e.g. «القسم: 0101 التربية الإسلامية». */
function readHeaderDepartment(text:string):HeaderDepartment|undefined{
  const ascii=toAscii(text).replace(/\r/g,"");
  const cleanName=(value:string)=>String(value||"")
    .replace(/\s+(?:الفرع|الكلية|الفصل|التاريخ|رقم\s*المقرر|مسمى\s*المقرر)\s*[:：]?.*$/," ")
    /* College/header numbers can sit physically beside the department cell in
       RTL text extraction (e.g. department 0101 followed by college 01). They
       are not part of the department name. Keep Arabic identity text only. */
    .replace(/(?:^|\s)\d{1,6}(?=\s|$)/g," ")
    .replace(/^[|:：_-]+|[|:：_-]+$/g,"").replace(/\s+/g," ").trim();
  const nearestDepartmentName=(value:string)=>{
    /* Physical RTL extraction may place the whole branch phrase before the
       department, e.g. «012كلية... الفرع : التربية الاسلامية 0101 القسم».
       Only the Arabic phrase nearest the department code belongs to القسم. */
    const afterBranch=String(value||"").split(/(?:^|\s)الفرع\s*[:：_-]?\s*/).pop()||value;
    return cleanName(afterBranch);
  };
  const build=(code:string,nameRaw:string):HeaderDepartment=>{
    const name=nearestDepartmentName(nameRaw);return{code,name,label:[code,name].filter(Boolean).join(" ")};
  };
  for(const rawLine of ascii.split("\n")){
    const line=rawLine.replace(/\s+/g," ").trim();
    let match=line.match(/القسم\s*[:：_-]?\s*(\d{3,6})\s*(.*)$/);
    if(match)return build(match[1],match[2]);
    /* Physical RTL order may be either «التربية الاسلامية : القسم 0101» or
       «التربية الاسلامية 0101 القسم :». Support both explicitly. */
    match=line.match(/([ء-ي][ء-ي\s:：_-]{3,140}?)\s*[:：_-]?\s*القسم\s*[:：_-]?\s*(\d{3,6})(?:\s|$)/);
    if(match)return build(match[2],match[1]);
    match=line.match(/([ء-ي][ء-ي\s:：_-]{3,180}?)\s*(\d{4,6})\s*[:：_-]?\s*القسم(?:\s*[:：_-]?|$)/);
    if(match)return build(match[2],match[1]);
    match=line.match(/(?:^|\s)(\d{3,6})\s*[:：_-]?\s*القسم(?:\s|$)/);
    if(match){
      const before=line.slice(0,match.index||0).replace(/\d+/g," ").replace(/[^ء-ي\s:：_-]/g," ").replace(/\s+/g," ").trim();
      return build(match[1],before);
    }
  }
  const flat=ascii.replace(/\s+/g," ").trim();
  let flatMatch=flat.match(/القسم\s*[:：_-]?\s*(\d{3,6})\s*([^]{0,180}?)(?=\s+(?:الفرع|الكلية|الفصل|التاريخ|رقم\s*المقرر|مسمى\s*المقرر)\b|$)/);
  if(flatMatch)return build(flatMatch[1],flatMatch[2]);
  flatMatch=flat.match(/([ء-ي][ء-ي\s:：_-]{3,140}?)\s*[:：_-]?\s*القسم\s*[:：_-]?\s*(\d{3,6})(?=\s|$)/);
  if(flatMatch)return build(flatMatch[2],flatMatch[1]);
  flatMatch=flat.match(/([ء-ي][ء-ي\s:：_-]{3,180}?)\s*(\d{4,6})\s*[:：_-]?\s*القسم(?:\s*[:：_-]?|$)/);
  if(flatMatch)return build(flatMatch[2],flatMatch[1]);
  /* When the label/code glyphs are damaged but the department name survives,
     retain that raw Arabic evidence for a conservative name comparison on the
     server. Stop at the independently detected branch code/site name. */
  for(const rawLine of ascii.split("\n")){
    const branchAt=rawLine.search(/\b\d{3}\s*(?:كلي[هة]|التربي[هة]|الدراسات|العلوم|التمريض)/);
    if(branchAt<0)continue;
    const before=rawLine.slice(0,branchAt);
    const code=before.match(/\b(\d{4,6})\b/)?.[1]||"";
    const name=nearestDepartmentName(before.replace(/\d+/g," ").replace(/[^ء-ي\s:：_-]/g," ").replace(/(?:^|\s)(?:القسم|العم|جح)(?=\s|$)/g," ").replace(/\s+/g," ").trim());
    if(name.length>=5)return{code,name,label:[code,name].filter(Boolean).join(" ")};
  }
  return undefined;
}

/** Pure parser used by both text-layer and scan header paths, and by regression
 * tests. Keeping one parser prevents the fast preflight and the full OCR path
 * from disagreeing about the same visible Authority header. */
export function parseAuthorityHeaderText(text:string):AuthorityPdfHeader{
  return{term:readHeaderTerm(text),branch:readHeaderBranch(text),department:readHeaderDepartment(text)};
}

/**
 * Cheap, deterministic guard for scanned Authority timetables.
 *
 * A portrait PDF page is not automatically "wrong" in general, but the
 * Authority timetable template is a landscape table. We apply this rule only
 * when the page has no meaningful embedded text layer; native text PDFs are
 * reconstructed from glyph coordinates and are therefore exempt.
 */
export function authorityScanRequiresLandscape(
  width:number,
  height:number,
  embeddedCharacters:number,
  embeddedItems:number,
):boolean{
  const imageOnly=embeddedCharacters<120&&embeddedItems<12;
  return imageOnly&&height>width*1.05;
}

/**
 * Cheap first-page preflight for Authority PDFs.
 *
 * It first inspects ONLY page 1's embedded text. For image-only/CamScanner
 * PDFs it renders ONLY page 1 at probe resolution, fixes 90-degree orientation,
 * and OCRs ONLY the header band. It never reads timetable body rows here.
 */
export async function readAuthorityPdfHeader(input:Buffer):Promise<AuthorityPdfHeader>{
  try{
    const cached=headerPreflightCache.get(input);
    if(cached)return cached.header;
    if(input.subarray(0,4).toString("latin1")!=="%PDF")return{};
    const pdfjs:any=await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf=await pdfjs.getDocument({data:new Uint8Array(input),disableWorker:true,useSystemFonts:true}).promise;
    if(!Number(pdf.numPages||0))return{};
    const page=await pdf.getPage(1);
    const viewport=page.getViewport({scale:1});
    const content:any=await page.getTextContent({includeMarkedContent:false,disableNormalization:false});
    const logicalText=(content?.items||[]).map((item:any)=>String(item?.str||"").normalize("NFKC")).filter(Boolean).join(" ");
    /* RTL Oracle reports do not promise logical item order. Rebuild the same
       page once by physical baselines as well; this is still embedded text and
       costs milliseconds, but restores visible lines such as
       «012 كلية التربية الأساسية بنات : الفرع» before OCR is considered. */
    const headerWords:Word[]=[];
    for(const item of content?.items||[]){
      const value=String(item?.str||"").normalize("NFKC").replace(/\s+/g," ").trim();
      if(!value||!Array.isArray(item?.transform))continue;
      const transformed=pdfjs.Util?.transform?pdfjs.Util.transform(viewport.transform,item.transform):item.transform;
      const x=Number(transformed?.[4]??item.transform[4]??0),baseline=Number(transformed?.[5]??item.transform[5]??0);
      const width=Math.max(1,Math.abs(Number(item?.width||0)*Number(viewport.scale||1)));
      const height=Math.max(7,Math.abs(Number(item?.height||0)*Number(viewport.scale||1))||10);
      headerWords.push({text:value,x0:x,y0:baseline-height,x1:x+width,y1:baseline+height*.15});
    }
    const physicalText=tableFromWords(headerWords,[],"pdf-text").map(row=>row.line).join("\n");
    const text=[logicalText,physicalText].filter(Boolean).join("\n");
    const embeddedParsed=parseAuthorityHeaderText(text);
    const embedded:AuthorityPdfHeader={...embeddedParsed,source:"text"};
    if(embedded.term&&embedded.branch&&embedded.department){headerPreflightCache.set(input,{header:embedded,orientation:0});return embedded;}

    /* ROOT SAFETY GUARD — image-only portrait scans are refused BEFORE table
       OCR. The old auto-rotation made a sideways page readable to Tesseract,
       but could also shift the dense SWRSCHA columns and turn seat/capacity or
       reference values into courses/buildings. The user can fix the source in
       seconds by rotating the PDF once; silently guessing orientation is not a
       safe trade-off for schedule data. */
    const embeddedCharacters=text.replace(/\s+/g,"").length;
    if(authorityScanRequiresLandscape(
      Number(viewport.width||0),
      Number(viewport.height||0),
      embeddedCharacters,
      headerWords.length,
    )){
      const rotated:AuthorityPdfHeader={...embedded,source:"scan",requiresLandscapeUpload:true};
      headerPreflightCache.set(input,{header:rotated,orientation:0});
      return rotated;
    }

    /* A PARTIAL text-layer hit is not success. The regression that prompted
       this guard returned immediately after finding only the term, then told
       the user the branch was missing. OCR now fills only whatever the text
       layer could not prove. */
    const probe=await renderPdfFirstPage(input,PROBE_LONG_EDGE);
    if(!probe){if(embedded.term||embedded.branch||embedded.department)return embedded;return{};}
    const probeImage=await (await canvas()).loadImage(probe);
    /* Authority timetables are landscape reports. Prefer the turn that makes a
       portrait camera/PDF page landscape; pixel grid scores cannot distinguish
       a dense ruled table from its sideways twin reliably. */
    const turns:Array<-1|0|1>=probeImage.height>probeImage.width?[-1,1,0]:[0,-1,1];
    const scored=await Promise.all(turns.map(async turn=>({turn,score:await pixelOrientationScore(await rotateImage(probe,turn))})));
    scored.sort((a,b)=>turns.indexOf(a.turn)-turns.indexOf(b.turn)||b.score-a.score);
    /* +90 and -90 have identical grid geometry. OCR the best candidate first;
       stop as soon as the three independent header authorities are present. */
    /* Keep the third turn as a bounded fallback. Camera/PDF rotation metadata can
       make the two pixel-axis finalists tie while the textual header sits in the
       remaining turn; semantic header fields, not a geometric tie-break, decide. */
    const candidates=scored;
    const worker=await getHeaderWorker();
    let best:{header:AuthorityPdfHeader;score:number;turn:-1|0|1}|null=null;
    const lib=await canvas();
    const semanticScore=(header:AuthorityPdfHeader,ocrText:string)=>(header.term?120:0)+(header.branch?80:0)+(header.department?80:0)
      +(ocrText.match(/الفصل|الفرع|القسم|الكلية/g)||[]).length*8;
    const remember=(header:AuthorityPdfHeader,ocrText:string,turn:-1|0|1)=>{
      const score=semanticScore(header,ocrText);
      if(!best||score>best.score)best={header,score,turn};
    };
    for(const candidate of candidates){
      const upright=await rotateImage(probe,candidate.turn as -1|0|1);
      const image=await lib.loadImage(upright);
      const headerTop=Math.round(image.height*0.005);
      const headerHeight=Math.max(130,Math.round(image.height*0.27));
      /* The probe is intentionally small for speed, but the printed department
         line is fine. Upscaling only this narrow band made the real CamScanner
         header deterministic while keeping preflight to a few seconds. */
      const headerScale=1.65;
      const crop=lib.createCanvas(Math.round(image.width*headerScale),Math.round(headerHeight*headerScale)),ctx=crop.getContext("2d");
      ctx.fillStyle="#ffffff";ctx.fillRect(0,0,crop.width,crop.height);
      ctx.drawImage(image,0,headerTop,image.width,headerHeight,0,0,crop.width,crop.height);
      await worker.setParameters({tessedit_char_whitelist:"",tessedit_pageseg_mode:"6" as any});
      const result:any=await worker.recognize(crop.toBuffer("image/png")).catch(()=>null);
      const ocrText=String(result?.data?.text||"").normalize("NFKC");
      const parsed=parseAuthorityHeaderText(ocrText);
      const header:AuthorityPdfHeader={...parsed,source:"scan"};
      remember(header,ocrText,candidate.turn);
      if(header.term&&header.branch&&header.department)break;
    }

    let merged:AuthorityPdfHeader={
      term:embedded.term||best?.header.term,
      branch:embedded.branch||best?.header.branch,
      department:embedded.department||best?.header.department,
      source:(embedded.term&&embedded.branch&&embedded.department)?"text":best?.header.source||embedded.source,
    };

    /* A landscape PDF can still contain a sideways raster. If semantic header
       evidence becomes stronger only after a ±90° turn, stop here rather than
       carrying that automatic rotation into body-column extraction. */
    if(best&&best.turn!==0){
      const rotated:AuthorityPdfHeader={...merged,source:"scan",requiresLandscapeUpload:true};
      headerPreflightCache.set(input,{header:rotated,orientation:best.turn});
      return rotated;
    }

    /* Deep header rescue: cheap 1400px preflight can still lose tiny Arabic
       dots in a phone-scanned/CamScanner page. Do NOT reject the document at
       that point. Re-render page 1 only at the same 2800px quality used by the
       table reader, crop a slightly taller header band, and try sparse-text
       segmentation as a second pass. This is bounded to page 1 and only runs
       when at least one required authority field is still unresolved. */
    if(!merged.term||!merged.branch||!merged.department){
      const deep=await renderPdfFirstPage(input,TARGET_LONG_EDGE);
      if(deep){
        const deepTurns:Array<-1|0|1>=[...(best?[best.turn]:[]),...candidates.map(item=>item.turn)].filter((turn,index,array)=>array.indexOf(turn)===index) as Array<-1|0|1>;
        for(const turn of deepTurns){
          let upright=await rotateImage(deep,turn);
          upright=await deskew(upright);
          const image=await lib.loadImage(upright);
          const headerTop=0,headerHeight=Math.max(220,Math.round(image.height*0.34));
          const crop=lib.createCanvas(image.width,headerHeight),ctx=crop.getContext("2d");
          ctx.fillStyle="#ffffff";ctx.fillRect(0,0,crop.width,crop.height);
          ctx.drawImage(image,0,headerTop,image.width,headerHeight,0,0,crop.width,headerHeight);
          let deepText="";
          for(const psm of [6,11]){
            await worker.setParameters({tessedit_char_whitelist:"",tessedit_pageseg_mode:String(psm) as any});
            const result:any=await worker.recognize(crop.toBuffer("image/png")).catch(()=>null);
            deepText=String(result?.data?.text||"").normalize("NFKC");
            const parsed=parseAuthorityHeaderText(deepText);
            const header:AuthorityPdfHeader={...parsed,source:"scan"};
            remember(header,deepText,turn);
            merged={term:embedded.term||header.term||merged.term,branch:embedded.branch||header.branch||merged.branch,department:embedded.department||header.department||merged.department,source:"scan"};
            if(merged.term&&merged.branch&&merged.department)break;
          }
          if(merged.term&&merged.branch&&merged.department)break;
        }
      }
    }

    if(merged.term||merged.branch||merged.department){
      headerPreflightCache.set(input,{header:merged,orientation:best?.turn||0});return merged;
    }
    return{};
  }catch{return{};}
}

/**
 * Is this scan worth reading at all?
 *
 * Handing back a half-empty table from an unreadable photo is worse than
 * refusing it: the reader cannot tell which blanks are the document and which
 * are the camera. Two signals decide it — how much text came off the page, and
 * how sure the engine was — and the thresholds sit well under the Authority's
 * own exports, measured at 54 and 63, so a real document is never turned away.
 */
const LEGIBLE_MIN_CONFIDENCE=42;
const LEGIBLE_MIN_CHARS_PER_PAGE=140;
function judgeLegibility(text:string,pages:number,confidence:number):Legibility{
  const meaningful=(text.match(/[ء-يa-zA-Z0-9]/g)||[]).length;
  const charactersPerPage=Math.round(meaningful/Math.max(1,pages));
  if(charactersPerPage<LEGIBLE_MIN_CHARS_PER_PAGE)
    return{readable:false,confidence,charactersPerPage,reason:"لم أتبيّن نصاً كافياً في الصورة. الرجاء رفع صورة أوضح أو ملف PDF أعلى دقة."};
  if(confidence<LEGIBLE_MIN_CONFIDENCE)
    return{readable:false,confidence,charactersPerPage,reason:"الصورة غير واضحة بما يكفي للقراءة. صوّر الورقة في إضاءة جيدة ومن زاوية مستقيمة، أو ارفع نسخة PDF أوضح."};
  return{readable:true,confidence,charactersPerPage,reason:""};
}

/** Read only the authority band from an already upright high-resolution page.
 * This is the safety net used when grid extraction succeeds (so full-page OCR
 * is intentionally skipped) but the cheap preflight could not prove all three
 * scope fields. The table body is never used as a substitute for the header. */
async function readAuthorityHeaderBand(upright:Buffer,worker:PooledWorker):Promise<string>{
  const lib=await canvas(),image=await lib.loadImage(upright);
  const height=Math.max(220,Math.round(image.height*0.34));
  const crop=lib.createCanvas(image.width,height),ctx=crop.getContext("2d");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,crop.width,crop.height);
  ctx.drawImage(image,0,0,image.width,height,0,0,crop.width,height);
  let bestText="",bestScore=-1;
  for(const psm of [6,11]){
    await worker.setParameters({tessedit_char_whitelist:"",tessedit_pageseg_mode:String(psm) as any});
    const result:any=await worker.recognize(crop.toBuffer("image/png")).catch(()=>null);
    const text=String(result?.data?.text||"").normalize("NFKC");
    const header=parseAuthorityHeaderText(text);
    const score=(header.term?120:0)+(header.branch?80:0)+(header.department?80:0)+(text.match(/الفصل|الفرع|القسم|الكلية/g)||[]).length*8;
    if(score>bestScore){bestScore=score;bestText=text;}
    if(header.term&&header.branch&&header.department)break;
  }
  return bestText;
}

/* Short-lived result cache: keeps no uploaded bytes, only the parsed result.
   Re-opening the same scan during review is therefore effectively instant. */
const OCR_RESULT_TTL_MS=10*60*1000;
const OCR_RESULT_CACHE_MAX=12;
const ocrResultCache=new Map<string,{at:number;value:OcrResult}>();
async function documentFingerprint(input:Buffer){
  const {createHash}=await import("node:crypto");
  return createHash("sha256").update(input).digest("hex");
}
function cachedOcr(key:string){
  const hit=ocrResultCache.get(key);
  if(!hit||Date.now()-hit.at>OCR_RESULT_TTL_MS){if(hit)ocrResultCache.delete(key);return null;}
  ocrResultCache.delete(key);ocrResultCache.set(key,hit);
  return structuredClone(hit.value);
}
function rememberOcr(key:string,value:OcrResult){
  ocrResultCache.set(key,{at:Date.now(),value:structuredClone(value)});
  while(ocrResultCache.size>OCR_RESULT_CACHE_MAX)ocrResultCache.delete(ocrResultCache.keys().next().value!);
}

/**
 * OCR is deliberately server-side: the PDF import and the public survey share
 * one implementation. Uploaded bytes are never retained; only a short-lived
 * parsed-result cache is kept to make repeat review of the same scan instant.
 */
export async function ocrDocument(input:Buffer,mime:string,onProgress?:OcrProgress):Promise<OcrResult>{
  const fingerprint=await documentFingerprint(input);
  const cacheHit=cachedOcr(fingerprint);
  if(cacheHit){onProgress?.({phase:"read",page:cacheHit.pageCount,pages:cacheHit.pageCount,message:"تم استرجاع القراءة المحفوظة"});return cacheHit;}
  const looksLikePdf=/pdf/i.test(mime)||input.subarray(0,4).toString("latin1")==="%PDF";
  if(looksLikePdf){
    const embedded=await pdfTextLayer(input,onProgress);
    if(embedded){rememberOcr(fingerprint,embedded);return embedded;}
  }
  /* One render. The old flow paid pdfjs twice — a probe pass and a full pass —
     when a probe is only a downscale of the full page it already had. */
  const images=await imagePages(input,mime,TARGET_LONG_EDGE,onProgress);
  if(!images.length)throw new Error("تعذر تحويل صفحات الملف إلى صور قابلة للقراءة");
  const pool=await getWorkerPool();
  const lib0=await canvas();
  const probeOf=async(buffer:Buffer)=>{
    const image=await lib0.loadImage(buffer);
    const scale=Math.min(1,PROBE_LONG_EDGE/Math.max(image.width,image.height));
    const c=lib0.createCanvas(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale)));
    c.getContext("2d").drawImage(image,0,0,c.width,c.height);
    return c.toBuffer("image/png") as Buffer;
  };
  const cachedPreflight=headerPreflightCache.get(input);
  const probeFirst=cachedPreflight?.header.source==="scan"?null:await probeOf(images[0]);

  /* Orientation costs pixels now, not recognitions: the three turns are scored
     on a small render in well under a second. A page with no grid signal at
     all (a photographed transcript) falls back to one small OCR probe. */
  onProgress?.({phase:"orient",page:1,pages:images.length,message:"تحديد اتجاه الصفحة"});
  let orientation:-1|0|1=cachedPreflight?.header.source==="scan"?cachedPreflight.orientation:0;
  if(!cachedPreflight||cachedPreflight.header.source!=="scan"){
    /* Pixels answer the cheap half only: WHICH AXIS. A table turned +90° and
       one turned −90° show identical rule geometry — the first cut of this
       heuristic picked the upside-down twin and read zero rows — so the two
       finalists are separated by one small TEXT probe each: legible Arabic and
       time patterns only appear on the right-side-up twin. Two small
       recognitions, not three big ones. */
    const turns:[-1,0,1]=[-1,0,1];
    const pixelScores=await Promise.all(turns.map(async turn=>({turn,score:await pixelOrientationScore(await rotateImage(probeFirst!,turn))})));
    pixelScores.sort((a,b)=>b.score-a.score);
    const [first,second]=pixelScores;
    if(first.score>second.score*1.35){
      orientation=first.turn as -1|0|1;
    }else{
      const finalists=[first.turn,second.turn] as Array<-1|0|1>;
      const textScore=async(turn:-1|0|1)=>{
        const result:any=await pool.ara.recognize(await rotateImage(probeFirst!,turn)).catch(()=>null);
        const text=String(result?.data?.text||"");
        const ascii=toAscii(text).replace(/[Oo]/g,"0");
        /* Structural marks only. An upside-down page still yields hundreds of
           GARBAGE Arabic characters — counting them once waved the flipped twin
           through — but it yields zero legible time ranges and building codes. */
        const structural=(ascii.match(/\b[0-2]\d[0-5]\d\s*[-–—]\s*[0-2]\d[0-5]\d\b/g)||[]).length*40
          +(ascii.match(/\b\d{3}[A-Za-z]\d{2}\b/g)||[]).length*25;
        return{structural,total:structural+(text.match(/[ء-ي]/g)||[]).length};
      };
      const firstScore=await textScore(finalists[0]);
      if(firstScore.structural>=120)orientation=finalists[0];
      else{
        const secondScore=await textScore(finalists[1]);
        orientation=secondScore.total>firstScore.total?finalists[1]:finalists[0];
      }
    }
  }

  const pages:OcrPage[]=new Array(images.length);
  const texts:string[]=new Array(images.length).fill("");
  const scores:number[]=new Array(images.length).fill(0);
  /* The page-1 preflight already proved the scientific department before the
     body is allowed to publish. Feed that proof into grid-column claiming so a
     welded SECTION+CRN token such as 5011894 can never impersonate 0101102. */
  const authorityGridDepartment=academicDigits(cachedPreflight?.header.department?.code);

  /* FAST OCR LANES
     ----------------
     Page work is parallel only across completely independent worker pools.
     This preserves the safety property that fixed the historical parameter
     bleed, while allowing a four-page scan to use two CPU lanes. Each lane is
     serial internally; strip/cell jobs still fan out over that lane's workers.
     One-page scans keep the old path and allocate no secondary workers. */
  let pagesDone=0;
  const secondaryPool=images.length>1?await getFastLaneWorkerPool():null;
  const processPage=async(index:number,lanePool:OcrWorkerPool)=>{
    const pageImage=images[index];
    let pageOrientation=orientation;
    let upright=await deskew(await rotateImage(pageImage,orientation));
    let gridRows:GridRow[]|null=null;
    try{gridRows=await readGrid(upright,lanePool,authorityGridDepartment);}catch{/* an unreadable grid falls back */}
    /* Scanned PDFs are often saved with a wrong orientation flag or a camera
       rotation that the first-page probe cannot infer reliably. Do not give up
       after one guess: only when the chosen turn fails, try the two remaining
       quarter-turns and keep the one that produces the strongest physical
       table. This rescue is paid only for failed pages, so clean exports remain
       fast while photographed/CamScanner sheets stop collapsing into prose. */
    if(!gridRows){
      let best:{upright:Buffer;rows:GridRow[];turn:-1|0|1}|null=null;
      const tried=new Set<number>([orientation]);
      for(const turn of [-1,0,1] as const){
        if(tried.has(turn))continue;
        try{
          const candidate=await deskew(await rotateImage(pageImage,turn));
          const candidateRows=await readGrid(candidate,lanePool,authorityGridDepartment);
          const strength=(candidateRows||[]).filter(row=>row.code||row.reference||row.start||row.days).length;
          const bestStrength=(best?.rows||[]).filter(row=>row.code||row.reference||row.start||row.days).length;
          if(candidateRows&&strength>bestStrength)best={upright:candidate,rows:candidateRows,turn};
        }catch{/* try the remaining orientation */}
      }
      if(best){upright=best.upright;gridRows=best.rows;pageOrientation=best.turn;}
    }
    if(gridRows){
      if(index===0){
        const cachedHeader=cachedPreflight?.header;
        const cachedText=[cachedHeader?.term?.label,cachedHeader?.branch?.label,cachedHeader?.department?.label].filter(Boolean).join("\n");
        /* A successful grid deliberately skips expensive whole-page OCR. If the
           preflight header is incomplete, however, recover the header from this
           already-upright 2800px page before returning recognition metadata. */
        const needsHeaderRescue=!cachedHeader?.term||!cachedHeader?.branch||!cachedHeader?.department;
        const rescued=needsHeaderRescue?await readAuthorityHeaderBand(upright,lanePool.ara):"";
        texts[index]=[cachedText,rescued].filter(Boolean).join("\n");
      }else texts[index]="";
      const filled=gridRows.filter(row=>row.code||row.start||row.courseText.length>3).length;
      scores[index]=Math.min(85,55+filled*2);
      const suspicious=gridRows.length>=3&&filled<Math.ceil(gridRows.length*0.55);
      pages[index]={rows:[],gridRows,diagnostic:{page:index+1,visualRows:gridRows.length,extractedRows:filled,gridDetected:true,orientation:pageOrientation,suspicious,reason:suspicious?"عدد الصفوف المقروءة أقل بكثير من حدود الجدول المرئية":undefined}};
    }else{
      const grid=await spreadColumns(upright);
      await lanePool.ara.setParameters({tessedit_char_whitelist:"",tessedit_pageseg_mode:"3" as any});
      const result:any=await lanePool.ara.recognize(grid.image,{},{text:true,blocks:true});
      const surface=result?.data||{};
      texts[index]=String(surface.text||"");
      scores[index]=Number(surface.confidence||0);
      const flatRows=tableFromWords(wordsOf(surface),grid.columns);
      pages[index]={rows:flatRows,diagnostic:{page:index+1,visualRows:grid.bands.length>1?grid.bands.length-1:0,extractedRows:flatRows.length,gridDetected:false,orientation:pageOrientation,suspicious:true,reason:"لم يتم إثبات هندسة الجدول في هذه الصفحة؛ أوقفت المعاينة الآمنة"}};
    }
    pagesDone++;
    onProgress?.({phase:"read",page:pagesDone,pages:images.length,message:`قراءة الصفحة ${pagesDone} من ${images.length}`});
  
  };
  const laneA=async()=>{for(let index=0;index<images.length;index+=2)await processPage(index,pool);};
  const laneB=async()=>{if(!secondaryPool)return;for(let index=1;index<images.length;index+=2)await processPage(index,secondaryPool);};
  await Promise.all([laneA(),laneB()]);

  /* SAFE FALLBACK — suspicious pages only
     ---------------------------------------
     The fast lanes are never allowed to trade correctness for speed. Once both
     lanes finish, ONLY pages whose geometry/row yield is suspicious are retried
     through the other, isolated worker pool. Clean pages are never re-read.
     This is intentionally page-scoped (not document-scoped): a weak page 3 in a
     four-page scan no longer makes pages 1, 2 and 4 pay the slow path again. */
  const suspiciousIndexes=pages.map((page,index)=>page?.diagnostic?.suspicious?index:-1).filter(index=>index>=0);
  if(suspiciousIndexes.length){
    onProgress?.({phase:"rescue",page:0,pages:suspiciousIndexes.length,message:`تدقيق ${suspiciousIndexes.length} صفحة تحتاج مراجعة دقيقة`});
    let rescuedCount=0;
    for(const index of suspiciousIndexes){
      const rescuePool=(index%2===0&&secondaryPool)?secondaryPool:pool;
      const pageImage=images[index];
      let bestRows=pages[index]?.gridRows||[];
      let bestFilled=bestRows.filter(row=>row.code||row.start||row.courseText.length>3).length;
      let bestOrientation=(pages[index]?.diagnostic?.orientation??orientation) as -1|0|1;
      let bestUpright=await deskew(await rotateImage(pageImage,bestOrientation));
      /* Re-read the same page in a clean worker context, then try the remaining
         quarter-turns only if they improve the number of semantically useful
         rows. This is the conservative Safe Path behind the fast lanes. */
      for(const turn of [bestOrientation,-1,0,1] as Array<-1|0|1>){
        try{
          const upright=turn===bestOrientation?bestUpright:await deskew(await rotateImage(pageImage,turn));
          const rows=await readGrid(upright,rescuePool,authorityGridDepartment);
          const filled=(rows||[]).filter(row=>row.code||row.start||row.courseText.length>3).length;
          if(rows&&filled>bestFilled){bestRows=rows;bestFilled=filled;bestOrientation=turn;bestUpright=upright;}
        }catch{/* retain the fast-lane result when rescue cannot improve it */}
      }
      if(bestRows.length){
        const suspicious=bestRows.length>=3&&bestFilled<Math.ceil(bestRows.length*0.55);
        pages[index]={rows:[],gridRows:bestRows,diagnostic:{page:index+1,visualRows:bestRows.length,extractedRows:bestFilled,gridDetected:true,orientation:bestOrientation,suspicious,reason:suspicious?"عدد الصفوف المقروءة أقل بكثير من حدود الجدول المرئية":undefined}};
        scores[index]=Math.min(92,60+bestFilled*2);
        if(index===0&&(!texts[index]||!parseAuthorityHeaderText(texts[index]).term||!parseAuthorityHeaderText(texts[index]).branch||!parseAuthorityHeaderText(texts[index]).department)){
          const cachedHeader=cachedPreflight?.header;
          const cachedText=[cachedHeader?.term?.label,cachedHeader?.branch?.label,cachedHeader?.department?.label].filter(Boolean).join("\n");
          const rescuedHeader=await readAuthorityHeaderBand(bestUpright,rescuePool.ara);
          texts[index]=[cachedText,rescuedHeader].filter(Boolean).join("\n");
        }
      }
      rescuedCount++;
      onProgress?.({phase:"rescue",page:rescuedCount,pages:suspiciousIndexes.length,message:`تدقيق الصفحة ${index+1} بدقة`});
    }
  }

  const text=texts.join("\n\n--- PAGE ---\n\n");
  const confidence=Math.round(scores.reduce((sum,value)=>sum+value,0)/Math.max(1,scores.length));
  const pageDiagnostics=pages.map((page,index)=>page?.diagnostic||{page:index+1,visualRows:0,extractedRows:0,gridDetected:false,orientation,suspicious:true,reason:"لم تنتج الصفحة نتيجة قابلة للمراجعة"});
  const suspiciousExtraction=pageDiagnostics.some(page=>page.suspicious);
  const allGrid=pageDiagnostics.every(page=>page.gridDetected);
  const proseLegibility=judgeLegibility(text,images.length,confidence);
  /* ocrDocument is also used by non-timetable documents. Preserve their prose
     legibility verdict here and expose table safety separately through
     suspiciousExtraction. The authority-PDF endpoint explicitly blocks that
     flag, while transcript/survey OCR is not accidentally forced to contain a
     timetable grid. */
  const legibility=allGrid
    ?(!suspiciousExtraction
      ?{readable:true,confidence,charactersPerPage:Math.round(text.replace(/\s+/g,"").length/Math.max(1,images.length)),reason:""}
      :{...proseLegibility,readable:false,reason:pageDiagnostics.find(page=>page.suspicious)?.reason||proseLegibility.reason||"استخراج الجدول غير مكتمل ويحتاج إلى ملف أوضح"})
    :proseLegibility;
  const header=parseAuthorityHeaderText(text);
  const finalResult:OcrResult={
    pages:pages.map(page=>page||{rows:[]}),
    text,
    pageCount:images.length,
    confidence,
    orientation,
    legibility,
    headerTerm:header.term,
    headerBranch:header.branch,
    headerDepartment:header.department,
    pageDiagnostics,
    suspiciousExtraction,
  };
  rememberOcr(fingerprint,finalResult);
  return finalResult;
}

const repairClockDigits=(value:string)=>value.replace(/[Oo°QDﻩ]/g,"0").replace(/[¢()\[\]{}|!lI]/g,"0");
const minutesOf = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));

export const cleanBuildingCode = (raw: string): string => {
  const clean=toAscii(String(raw||"")).replace(/\s+/g,"").toUpperCase();
  if(!clean)return"";
  /* A numeric six-digit value is NOT automatically a building. SWRSCHA has
     adjacent capacity columns whose text layer can weld into values such as
     345045 / 520020 / 320020. Accept a full building only when it starts with
     one of the owner-supplied official site prefixes. */
  if(OFFICIAL_BUILDING_PATTERN.test(clean))return clean;
  /* Legacy short alpha-site evidence (B09/F15/J14) is kept only as evidence;
     the server can canonicalize it against the proven document branch + finite
     registry. It is never enough by itself to create a building identity. */
  const short=clean.match(/^([A-Z])(\d{1,2})$/);
  if(short)return`${short[1]}${short[2].padStart(2,"0")}`;
  return"";
};

export const cleanHallCode = (raw: string): string => {
  const clean=toAscii(String(raw||"")).replace(/\s+/g,"").toUpperCase();
  if(!clean)return"";
  /* A proven official building token can never be a room, even if it contains
     a room-looking suffix such as F15. */
  if(OFFICIAL_BUILDING_PATTERN.test(clean))return"";
  return /^[A-Z]\d{1,3}$/.test(clean)?clean:"";
};

/** Extract location evidence from a REAL text-layer row without trusting cell
 * splitting. Generated Authority PDFs often place `012B09 F13` in one physical
 * text item, while seat/capacity columns can be welded into `345045`. The site
 * prefix is therefore the identity anchor; only an owner-supplied prefix may
 * produce a building. */
export function extractAuthorityLocationEvidence(raw:string):{building:string;hall:string}{
  const ascii=toAscii(String(raw||"")).toUpperCase();
  const chunks=ascii.match(/[A-Z0-9]+/g)||[];
  let building="",hall="";
  const prefixPattern=officialSitePrefixPattern;
  const joinedBuilding=new RegExp(`(?:${prefixPattern})\\d{2}`,"i");
  const joinedPair=new RegExp(`((?:${prefixPattern})\\d{2})([A-Z]\\d{1,3})?`,"i");

  for(const chunk of chunks){
    const pair=chunk.match(joinedPair);
    if(pair){
      const candidate=String(pair[1]||"").toUpperCase();
      if(OFFICIAL_BUILDING_PATTERN.test(candidate)){building=candidate;if(pair[2])hall=String(pair[2]).toUpperCase();break;}
    }
  }
  if(!building){
    /* Spaced text items, e.g. `012 B 09`, are compacted only for the narrow
       official-prefix search. This cannot turn capacity digits into a building
       because the distinctive official prefix is mandatory. */
    const compact=ascii.replace(/[^A-Z0-9]/g,"");
    const match=compact.match(joinedBuilding);
    if(match&&OFFICIAL_BUILDING_PATTERN.test(String(match[0]).toUpperCase()))building=String(match[0]).toUpperCase();
  }

  if(building&&!hall){
    /* Remove the building before looking for a room so the site letter/digits
       can never masquerade as a hall. Status columns A/Y have no digits and do
       not match this rule. */
    const withoutBuilding=ascii.replace(new RegExp(escapeRegex(building),"i")," ");
    const hallMatches=withoutBuilding.match(/(?:^|[^A-Z0-9])([A-Z]\d{1,3})(?=$|[^A-Z0-9])/g)||[];
    for(const token of hallMatches){
      const candidate=token.replace(/[^A-Z0-9]/g,"").toUpperCase();
      if(/^[A-Z]\d{1,3}$/.test(candidate)){hall=candidate;break;}
    }
  }
  return{building,hall};
}


const timePair=(text:string)=>{
  const ascii=repairClockDigits(toAscii(text));
  
  // 1. Explicit colon/dot format: 15:30 - 16:50 or 08:00 - 09:20 or 11:00-11:50
  const colonMatches = [...ascii.matchAll(/\b([01]?\d|2[0-3])[:٫.]([0-5]\d)\b/g)];
  if (colonMatches.length >= 2) {
    for (let i = 0; i < colonMatches.length - 1; i++) {
      const h1 = Number(colonMatches[i][1]), m1 = Number(colonMatches[i][2]);
      const h2 = Number(colonMatches[i+1][1]), m2 = Number(colonMatches[i+1][2]);
      const t1 = `${String(h1).padStart(2, "0")}:${String(m1).padStart(2, "0")}`;
      const t2 = `${String(h2).padStart(2, "0")}:${String(m2).padStart(2, "0")}`;
      const min1 = h1 * 60 + m1, min2 = h2 * 60 + m2;
      const start = min1 <= min2 ? t1 : t2;
      const end = min1 <= min2 ? t2 : t1;
      const diff = Math.abs(min1 - min2);
      if (diff >= 30 && diff <= 240 && Math.min(min1, min2) >= 7 * 60 && Math.max(min1, min2) <= 22 * 60) {
        return { start, end };
      }
    }
  }

  // 2. Military format with REQUIRED separator: 1650 - 1530, 0800 - 0920, 1150-1100
  // REQUIRED SEPARATOR: [-–—~] or "to" or "إلى"
  const militaryMatches = [...ascii.matchAll(/\b([0-2]\d[0-5]\d)\s*[-–—~]\s*([0-2]\d[0-5]\d)\b/g)];
  for (const match of militaryMatches) {
    const rawA = match[1], rawB = match[2];
    const hA = Number(rawA.slice(0, 2)), mA = Number(rawA.slice(2));
    const hB = Number(rawB.slice(0, 2)), mB = Number(rawB.slice(2));
    if (hA < 24 && mA < 60 && hB < 24 && mB < 60) {
      const minA = hA * 60 + mA, minB = hB * 60 + mB;
      const tA = `${String(hA).padStart(2, "0")}:${String(mA).padStart(2, "0")}`;
      const tB = `${String(hB).padStart(2, "0")}:${String(mB).padStart(2, "0")}`;
      const start = minA <= minB ? tA : tB;
      const end = minA <= minB ? tB : tA;
      const diff = Math.abs(minA - minB);
      if (diff >= 30 && diff <= 240 && Math.min(minA, minB) >= 7 * 60 && Math.max(minA, minB) <= 22 * 60) {
        return { start, end };
      }
    }
  }

  return null;
};

const DAY_FIELDS=["fsunday","fmonday","ftuesday","fwednesday","fthursday"]as const;
const EMPTY_DAYS={fsunday:false,fmonday:false,ftuesday:false,fwednesday:false,fthursday:false};

export const parseDays = (raw: string): { fsunday: boolean; fmonday: boolean; ftuesday: boolean; fwednesday: boolean; fthursday: boolean } | null => {
  if (!raw) return null;
  const ascii = toAscii(raw).trim();

  // 1. Digits 1-5 with separators or an Authority day run (531 / 42).
  // Column identity is enforced upstream, so a valid three-day run must not be
  // rejected merely because removing spaces turns «5 3 1» into «531».
  const separatedMatch = ascii.match(/(?:^|[\s|،,;:\-_/])([1-5](?:[\s,\-_/]+[1-5])+)(?=$|[\s|،,;:\-_/])/);
  if (separatedMatch) {
    const digits = separatedMatch[1].replace(/[^1-5]/g, "");
    if (digits.length >= 1 && digits.length <= 5) {
      const flags = { ...EMPTY_DAYS };
      for (const d of digits) {
        flags[DAY_FIELDS[Number(d) - 1]] = true;
      }
      return flags;
    }
  }

  const directDigits = ascii.replace(/\s+/g, "");
  const runMatch = directDigits.match(/^(?:54321|12345|531|135|42|24|31|13|[1-5])$/);
  if (runMatch) {
    const flags = { ...EMPTY_DAYS };
    for (const d of runMatch[0]) {
      flags[DAY_FIELDS[Number(d) - 1]] = true;
    }
    return flags;
  }

  const cleanDigits = ascii.replace(/[^1-5]/g, "");
  if (cleanDigits.length >= 1 && cleanDigits.length <= 5) {
    const nonAllowedDigits = ascii.replace(/[^0-9]/g, "").replace(/[1-5]/g, "");
    if (nonAllowedDigits.length === 0 && !/\d{3,}/.test(ascii)) {
      const flags = { ...EMPTY_DAYS };
      for (const d of cleanDigits) {
        flags[DAY_FIELDS[Number(d) - 1]] = true;
      }
      return flags;
    }
  }

  // 2. Arabic day initials or names (e.g. ح ث خ, ن ر, الأحد, الاثنين, الثلاثاء, الأربعاء, الخميس)
  const cleanAr = raw.replace(/[ً-ْـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه");
  const hasSun = /الاحد|احد|(?:^|[\s،,\-\/])ح(?=$|[\s،,\-\/])/.test(cleanAr);
  const hasMon = /الاثنين|اثنين|(?:^|[\s،,\-\/])ن(?=$|[\s،,\-\/])/.test(cleanAr);
  const hasTue = /الثلاثاء|ثلاثاء|(?:^|[\s،,\-\/])ث(?=$|[\s،,\-\/])/.test(cleanAr);
  const hasWed = /الاربعاء|اربعاء|(?:^|[\s،,\-\/])ر(?=$|[\s،,\-\/])/.test(cleanAr);
  const hasThu = /الخميس|خميس|(?:^|[\s،,\-\/])خ(?=$|[\s،,\-\/])/.test(cleanAr);

  if (hasSun || hasMon || hasTue || hasWed || hasThu) {
    return {
      fsunday: hasSun,
      fmonday: hasMon,
      ftuesday: hasTue,
      fwednesday: hasWed,
      fthursday: hasThu,
    };
  }

  return null;
};

const dayFlagsFromCell = parseDays;
const dayFlagsFromText = parseDays;

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
    const found=lineTokens.some(candidate=>candidate===token||(Math.min(candidate.length,token.length)>=4&&editDistance(candidate,token)<=Math.max(1,Math.floor(token.length*.28))));
    if(found)earned+=weight;
  }
  return total?earned/total:0;
};

export type ParsedScheduleRow={
  sourceOrder:number;referenceNumber:string;AdCourseId:number;AdCourseName:string;SCode:string;AdInstructorId:number;
  TotalHours?:number;TotalUnits?:number;CourseCredit?:number;CourseHours?:number;fcredithours?:number;fcontacthours?:number;
  fsunday:boolean;fmonday:boolean;ftuesday:boolean;fwednesday:boolean;fthursday:boolean;
  fstarttime:string;fendtime:string;AdRoomCode:string;AdRoomHall:string;ocrLine:string;sourceInstructorText?:string;
  sourceCourseCode?:string;sourceCourseText?:string;sourceSectionText?:string;sourceBuildingText?:string;sourceRoomText?:string;
  sourceDaysText?:string;sourceTimeText?:string;sourceReadMode?:"pdf-text"|"ocr-grid"|"ocr-fallback";
  instructorMatchMethod?:string;instructorMatchScore?:number;instructorMatchedTokens?:number;
};

/** Match an instructor printed on the Authority sheet to the registry.
 *
 * Restores the successful behaviour of the original importer without bringing
 * back unsafe fuzzy guessing:
 * - د. / أ. / ا. / أ.د. / ا.د. are titles, not identity.
 * - an exact full system name wins immediately;
 * - otherwise TWO or THREE real name tokens may identify the instructor, but
 *   only when the result is unique (department candidates first, then global);
 * - a truncated fourth/family name does not hurt a three-token proof;
 * - «هيئة…» maps only to the system's own «هيئة تدريسية» identity;
 * - ambiguous names stay blank. The PDF spelling is never saved as a new name.
 */
type InstructorIdentityMatch={person:AdInstructor;method:"EXACT_FULL"|"FACULTY_IDENTITY"|"COURSE_TWO_NAME"|"DEPARTMENT_TWO_NAME"|"GLOBAL_THREE_NAME";score:number;matchedTokens:number};

function matchInstructorIdentity(raw:string,instructors:AdInstructor[],preferredIds?:Set<number>,coursePreferredIds?:Set<number>):InstructorIdentityMatch|undefined{
  const clean=(value:string)=>fold(value)
    /* Titles are presentation only. fold() removes punctuation first, so
       «أ.د.» -> «ا د», «د.» -> «د», and «أ.» -> «ا». */
    .replace(/^(?:(?:ا\s*د|دكتور|الدكتور|دكتوره|الدكتوره|استاذ|الاستاذ|بروفيسور|د|ا|م)\s+)+/g," ")
    .replace(/\s+/g," ").trim();

  /* Authority/system spellings alternate constantly between «عبد الله» and
     «عبدالله» (same for عبدالرحمن/عبد العزيز/عبد اللطيف...). Canonicalize the
     pair as ONE identity token on both sides before comparing names. */
  const identityTokens=(value:string)=>{
    const source=clean(value).split(/\s+/).filter(token=>/[ء-ي]/.test(token)&&token.length>=2);
    const out:string[]=[];
    for(let i=0;i<source.length;i++){
      if(source[i]==="عبد"&&i+1<source.length&&source[i+1].length>=2){out.push(`عبد${source[i+1]}`);i++;continue;}
      out.push(source[i]);
    }
    return out;
  };
  const rawClean=clean(raw),rawTokens=identityTokens(raw);
  if(!rawClean||!rawTokens.length)return undefined;

  const catalogue=instructors.map(person=>({
    person,
    normalized:identityTokens(person.AdInstructorName).join(" "),
    tokens:identityTokens(person.AdInstructorName),
    preferred:Boolean(preferredIds?.has(Number(person.AdInstructorId))),
  })).filter(item=>item.normalized&&item.tokens.length);

  /* «هيئة» is an explicit system identity, not a fuzzy person-name query. */
  if(/^هيئه(?:\s|$)/.test(rawClean)){
    const faculty=catalogue.filter(item=>item.normalized==="هيئه تدريسيه"||item.normalized.startsWith("هيئه تدريسيه "));
    const preferred=faculty.filter(item=>item.preferred);
    if(preferred.length===1)return{person:preferred[0].person,method:"FACULTY_IDENTITY",score:100,matchedTokens:2};
    return faculty.length===1?{person:faculty[0].person,method:"FACULTY_IDENTITY",score:100,matchedTokens:2}:undefined;
  }
  if(/عضو\s*هيئه|شاغر|منتدب/.test(rawClean))return undefined;

  const normalizedRaw=rawTokens.join(" ");
  const haystack=` ${normalizedRaw} `;
  const exact=catalogue.filter(item=>normalizedRaw===item.normalized||haystack.includes(` ${item.normalized} `));
  if(exact.length===1)return{person:exact[0].person,method:"EXACT_FULL",score:100,matchedTokens:Math.min(rawTokens.length,exact[0].tokens.length)};
  const preferredExact=exact.filter(item=>item.preferred);
  if(preferredExact.length===1)return{person:preferredExact[0].person,method:"EXACT_FULL",score:100,matchedTokens:Math.min(rawTokens.length,preferredExact[0].tokens.length)};

  const tokenEqual=(a:string,b:string)=>a===b;
  const stemEqual=(a:string,b:string)=>a===b||(Math.min(a.length,b.length)>=3&&(a.startsWith(b)||b.startsWith(a)));
  const orderedEvidence=(candidate:string[],observed:string[])=>{
    let at=0,exactCount=0,stemCount=0,total=0;
    for(const token of candidate){
      let found=-1,exact=false;
      for(let i=at;i<observed.length;i++){
        if(tokenEqual(token,observed[i])){found=i;exact=true;break;}
        if(found<0&&stemEqual(token,observed[i]))found=i;
      }
      if(found<0)continue;
      total++;if(exact)exactCount++;else stemCount++;at=found+1;
    }
    return{total,exactCount,stemCount};
  };
  const commonExact=(candidate:string[],observed:string[])=>[...new Set(candidate.filter(token=>observed.includes(token)))].length;

  const choose=(pool:typeof catalogue,allowTwo:boolean)=>{
    const ranked=pool.map(item=>{
      const forward=orderedEvidence(item.tokens,rawTokens);
      const reverse=orderedEvidence(rawTokens,item.tokens);
      const ordered=forward.total>=reverse.total?forward:reverse;
      const exactCommon=commonExact(item.tokens,rawTokens);
      const first=item.tokens[0],last=item.tokens[item.tokens.length-1];
      const firstHit=rawTokens.some(token=>tokenEqual(first,token));
      const lastHit=rawTokens.some(token=>stemEqual(last,token));
      /* Three ordered names are strong evidence even when the printed family
         name is cut at the cell edge. Two names are accepted only in the
         department/preferred pool and only when no rival receives the same
         evidence. This restores the old high hit-rate without saving OCR text. */
      const threeProof=ordered.total>=3&&ordered.exactCount>=2;
      const twoExactProof=allowTwo&&exactCommon>=2&&ordered.total>=2;
      const firstLastProof=allowTwo&&item.tokens.length>=2&&firstHit&&lastHit&&ordered.total>=2;
      const qualified=threeProof||twoExactProof||firstLastProof;
      const score=qualified?(ordered.total*100+ordered.exactCount*20+exactCommon*10+(firstHit?3:0)+(lastHit?3:0)-ordered.stemCount):0;
      return{item,qualified,score,ordered,exactCommon};
    }).filter(entry=>entry.qualified).sort((a,b)=>b.score-a.score||b.exactCommon-a.exactCommon||b.item.tokens.length-a.item.tokens.length);
    if(!ranked.length)return undefined;
    const top=ranked[0],runner=ranked[1];
    if(runner&&runner.score===top.score)return undefined;
    return top;
  };

  /* Course history is a tie-breaker, never identity by itself. Two-name proof is
     allowed here only when the printed tokens leave ONE existing system person
     among instructors who have actually taught this canonical course. */
  const coursePool=coursePreferredIds?.size?catalogue.filter(item=>coursePreferredIds.has(Number(item.person.AdInstructorId))):[];
  const courseHit=coursePool.length?choose(coursePool,true):undefined;
  if(courseHit)return{person:courseHit.item.person,method:"COURSE_TWO_NAME",score:99,matchedTokens:courseHit.ordered.total};

  const preferred=catalogue.filter(item=>item.preferred);
  const preferredHit=preferred.length?choose(preferred,true):undefined;
  if(preferredHit)return{person:preferredHit.item.person,method:"DEPARTMENT_TWO_NAME",score:98,matchedTokens:preferredHit.ordered.total};
  /* Outside the department, require three-name proof; two-name university-wide
     matches are deliberately left blank unless the FULL identity matched above. */
  const globalHit=choose(catalogue,false);
  return globalHit?{person:globalHit.item.person,method:"GLOBAL_THREE_NAME",score:96,matchedTokens:globalHit.ordered.total}:undefined;
}

function matchInstructorName(raw:string,instructors:AdInstructor[],preferredIds?:Set<number>,coursePreferredIds?:Set<number>):AdInstructor|undefined{
  return matchInstructorIdentity(raw,instructors,preferredIds,coursePreferredIds)?.person;
}

/**
 * Best-effort table parser for the Authority's scanned timetable.
 *
 * It reads each cell on its own rather than mining a flattened line, and it
 * matches names against the real catalogue instead of inventing identifiers.
 * Anything it cannot resolve is returned as an issue and never published.
 */
/**
 * Structured rows from the gridded reader, matched against the catalogue.
 *
 * The course code is the key that cannot drift: college(2) + department(2) +
 * course(3). Only that number may create a canonical course identity. The
 * Arabic name is evidence for the reviewer; the displayed canonical name comes
 * exclusively from the selected system catalogue row.
 */
function isHeaderLine(text:string):boolean{
  if(!text) return false;
  
  // Strict alphanumeric exact checks bypassing any folding
  const alphanumeric = text.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (alphanumeric.includes("swrscha")) return true;
  if (alphanumeric.includes("swrscha:")) return true;
  
  const f=fold(text);
  
  // Any line that strongly starts with these keywords
  if(
    f.startsWith("القسم") || 
    f.startsWith("الفصل") || 
    f.startsWith("التقرير") || 
    f.startsWith("جدول") || 
    f.startsWith("كليه") || 
    f.startsWith("كلية") || 
    f.startsWith("الفرع")
  ) {
    return true;
  }
  
  // Highly specific header substrings
  if(
    f.includes("جدول الفصل") || 
    f.includes("جميع الشعب") || 
    f.includes("التربيه الاساسيه") || 
    f.includes("التربية الاساسية") || 
    f.includes("كليه التربيه") || 
    f.includes("كلية التربية") || 
    f.includes("صفحة :") || 
    f.includes("صفحه :") || 
    f.includes("صفحة رقم") || 
    f.includes("تاريخ :") || 
    f.includes("من أصل") || 
    f.includes("من اصل") || 
    f.includes("التسجيل التقرير")
  ) {
    return true;
  }

  const headerPhrases=[
    "رقم المقرر", "مسمى مقرر", "الرقم المرجعي", "الرقم المرجعى",
    "الحد الاقصى", "مقاعد مسجلة", "مقاعد مسجله", "الحالة في الرزم", "عدد الرزم",
    "تاريخ الطباعة", "طبع في",
    "القسم :", "القسم:", "الفرع :", "الفرع:", "الكلية :", "الكلية:", "الفصل :", "الفصل:"
  ];
  if(headerPhrases.some(phrase => {
    const foldedPhrase = fold(phrase);
    return foldedPhrase.length > 2 && f.includes(foldedPhrase);
  })) {
    return true;
  }
  
  return false;
}

function parseGridRows(gridRows:GridRow[],courses:AdCourse[],instructors:AdInstructor[],startOrder:number,preferredInstructorIds?:Set<number>,authorityDepartment="",courseInstructorIds?:Map<number,Set<number>>){
  const catalogue=courses.map(course=>({course,digits:academicDigits(course.CourseCode),folded:fold(course.CourseName)}));
  const tailCounts=new Map<string,number>();
  for(const item of catalogue){
    if(item.digits.length>=3){const tail=item.digits.slice(-3);tailCounts.set(tail,(tailCounts.get(tail)||0)+1);}
  }
  const matchCourse=(code:string,nameText:string)=>{
    if(isHeaderLine(code)||isHeaderLine(nameText))return null;
    const source=academicDigits(code);
    if(!source)return null;
    const matches=catalogue.filter(item=>authorityCourseCodeMatches(source,item.digits,authorityDepartment));
    if(matches.length===1)return matches[0].course;
    /* A 3-digit source can only resolve when that tail is unique in the selected
       department. Course NAMES are display evidence only and never create ID. */
    if(source.length===3&&tailCounts.get(source)===1){
      const unique=catalogue.find(item=>item.digits.slice(-3)===source);
      if(unique)return unique.course;
    }
    return null;
  };

  const validGrids=gridRows.filter(grid=>{
    const combined = `${grid.code} ${grid.scode} ${grid.courseText} ${grid.instructorText} ${grid.building} ${grid.hall}`;
    if(isHeaderLine(combined)||isHeaderLine(grid.courseText)||isHeaderLine(grid.code))return false;
    const hasData = Boolean(grid.code || grid.reference || grid.start || grid.days || (grid.scode && Number(grid.scode)>=500) || grid.courseText.length > 2);
    return hasData;
  });
  const firstPass=validGrids.map(grid=>({grid,course:matchCourse(grid.code,grid.courseText)}));
  /* A missing course key stays unresolved. Neighbouring rows and edit-distance
     similarity are not identity evidence and must never create canonical data. */
  const rows:ParsedScheduleRow[]=[];const issues:string[]=[];let order=startOrder;
  for(const {grid,course} of firstPass){
    const combinedCheck = `${grid.code} ${grid.scode} ${grid.courseText} ${grid.instructorText}`;
    if(isHeaderLine(combinedCheck)||isHeaderLine(grid.courseText)||isHeaderLine(grid.code))continue;
    const flags = parseDays(grid.days) || EMPTY_DAYS;
    const coursePreferred=course?courseInstructorIds?.get(Number(course.AdCourseId)):undefined;
    const instructorMatch=matchInstructorIdentity(grid.instructorText,instructors,preferredInstructorIds,coursePreferred);
    const instructorHit=instructorMatch?.person;
    const cleanBuilding = cleanBuildingCode(grid.building);
    const cleanHall = cleanHallCode(grid.hall);

    if(!course){
      const rawEvidence = grid.courseText || grid.code || "";
      if(isHeaderLine(rawEvidence)||isHeaderLine(grid.courseText)||isHeaderLine(grid.code))continue;
      const hasScheduleData = Boolean(grid.start || grid.days || (grid.scode && Number(grid.scode)>=500) || grid.reference || (grid.code && grid.code.length >= 3));
      if(!hasScheduleData || !rawEvidence || rawEvidence.length < 3) {
        continue;
      }
      /* Canonical course display is system-owned. A raw OCR number/text is
         audit evidence only and must never occupy AdCourseName when the course
         ID was not proven. This is the final display guard against welded
         section+CRN values such as 5011894 looking like a real course. */
      const readableCourseEvidence=/[ء-يA-Za-z]/.test(rawEvidence)&&!/^\s*\d[\d\s._/-]*\s*$/.test(rawEvidence)
        ?rawEvidence.trim()
        :"";
      const issueLabel=readableCourseEvidence||"مقرر غير محسوم";
      rows.push({
        sourceOrder:order++,
        referenceNumber:grid.reference,
        AdCourseId:0,AdCourseName:"",SCode:grid.scode,
        AdInstructorId:instructorHit?.AdInstructorId||0,
        TotalHours:3,TotalUnits:3,
        CourseHours:3,CourseCredit:3,
        fcontacthours:3,fcredithours:3,
        ...flags,
        fstarttime:grid.start,fendtime:grid.end,
        AdRoomCode:cleanBuilding,AdRoomHall:cleanHall,
        ocrLine:[grid.code,grid.scode,grid.courseText,grid.days,`${grid.start}-${grid.end}`,cleanBuilding,cleanHall,grid.instructorText].filter(Boolean).join(" | "),
        sourceInstructorText:grid.instructorText,
        sourceCourseCode:grid.code,sourceCourseText:grid.courseText,sourceSectionText:grid.scode,
        sourceBuildingText:grid.buildingRaw||grid.building,sourceRoomText:grid.hallRaw||grid.hall,
        sourceDaysText:grid.daysRaw||grid.days,sourceTimeText:grid.timeRaw||[grid.start,grid.end].filter(Boolean).join(" - "),sourceReadMode:grid.sourceMode||"ocr-grid",
        instructorMatchMethod:instructorMatch?.method,instructorMatchScore:instructorMatch?.score,instructorMatchedTokens:instructorMatch?.matchedTokens,
      });
      issues.push(`صف «${issueLabel}» شعبة ${grid.scode||"—"}: لم يتم إثبات رقم المقرر من كتالوج القسم — يرجى اختياره من القائمة`);
      if(!grid.start)issues.push(`صف «${issueLabel}» شعبة ${grid.scode||"—"}: لم أتعرف على الوقت`);
      if(!Object.values(flags).some(Boolean))issues.push(`صف «${issueLabel}» شعبة ${grid.scode||"—"}: لم أتعرف على الأيام`);
      if(!instructorHit&&grid.instructorText&&!grid.instructorText.includes("هيئة")&&!grid.instructorText.includes("هيئه"))
        issues.push(`صف «${issueLabel}» شعبة ${grid.scode||"—"}: لم أتعرف على أستاذ المقرر («${grid.instructorText}»)`);
      if(!cleanBuilding&&!cleanHall)issues.push(`صف «${issueLabel}» شعبة ${grid.scode||"—"}: لم أتعرف على المبنى والقاعة`);
      continue;
    }

    rows.push({
      sourceOrder:order++,
      referenceNumber:grid.reference,
      AdCourseId:course.AdCourseId,AdCourseName:course.CourseName,SCode:grid.scode,
      AdInstructorId:instructorHit?.AdInstructorId||0,
      TotalHours:course.CourseHours,TotalUnits:course.CourseCredit,
      CourseHours:course.CourseHours,CourseCredit:course.CourseCredit,
      fcontacthours:course.CourseHours||3,fcredithours:course.CourseCredit||3,
      ...flags,
      fstarttime:grid.start,fendtime:grid.end,
      AdRoomCode:cleanBuilding,AdRoomHall:cleanHall,
      ocrLine:[grid.code,grid.scode,grid.courseText,grid.days,`${grid.start}-${grid.end}`,cleanBuilding,cleanHall,grid.instructorText].filter(Boolean).join(" | "),
      sourceInstructorText:grid.instructorText,
      sourceCourseCode:grid.code,sourceCourseText:grid.courseText,sourceSectionText:grid.scode,
      sourceBuildingText:grid.buildingRaw||grid.building,sourceRoomText:grid.hallRaw||grid.hall,
      sourceDaysText:grid.daysRaw||grid.days,sourceTimeText:grid.timeRaw||[grid.start,grid.end].filter(Boolean).join(" - "),sourceReadMode:grid.sourceMode||"ocr-grid",
      instructorMatchMethod:instructorMatch?.method,instructorMatchScore:instructorMatch?.score,instructorMatchedTokens:instructorMatch?.matchedTokens,
    });
    const label=course.CourseName;
    if(!grid.start)issues.push(`صف «${label}» شعبة ${grid.scode||"—"}: لم أتعرف على الوقت`);
    if(!Object.values(flags).some(Boolean))issues.push(`صف «${label}» شعبة ${grid.scode||"—"}: لم أتعرف على الأيام`);
    if(!instructorHit&&grid.instructorText&&!grid.instructorText.includes("هيئة")&&!grid.instructorText.includes("هيئه"))
      issues.push(`صف «${label}» شعبة ${grid.scode||"—"}: لم أتعرف على أستاذ المقرر («${grid.instructorText}»)`);
    if(!grid.scode)issues.push(`صف «${label}»: لم أتعرف على رقم الشعبة`);
    if(!cleanBuilding&&!cleanHall)issues.push(`صف «${label}» شعبة ${grid.scode||"—"}: لم أتعرف على المبنى والقاعة`);
  }
  return{rows,issues,order};
}

export function parseScheduleTable(pages:OcrPage[],courses:AdCourse[],instructors:AdInstructor[],preferredInstructorIds?:Set<number>,options?:{authorityDepartmentCode?:string;sequentialSections?:boolean;courseInstructorIds?:Map<number,Set<number>>}){
  const activeCourses=courses;
  const catalogue=activeCourses.map(course=>({
    course,
    digits:toAscii(String(course.CourseCode||"")).replace(/\D/g,""),
    folded:fold(course.CourseName),
  }));

  const tails=new Map<string,number>();
  for(const item of catalogue){
    if(item.digits.length>=3){const tail=item.digits.slice(-3);tails.set(tail,(tails.get(tail)||0)+1);}
  }

  const rows:ParsedScheduleRow[]=[];const issues:string[]=[];let order=0,scanned=0;

  for(const page of pages){
    if(page.gridRows?.length){
      const parsed=parseGridRows(page.gridRows,activeCourses,instructors,order,preferredInstructorIds,academicDigits(options?.authorityDepartmentCode),options?.courseInstructorIds);
      rows.push(...parsed.rows);issues.push(...parsed.issues);order=parsed.order;scanned+=page.gridRows.length;
    }
  }
  const assignSequentialSections=()=>{
    if(options?.sequentialSections===false)return;
    const numbered=assignAuthoritySections(rows);
    rows.splice(0,rows.length,...numbered);
  };
  if(rows.length){
    /* Owner rule: the canonical section code is generated per canonical course,
       starting 501 for the first imported row of that course, then 502, 503… .
       The PDF cell remains in sourceSectionText for audit only. */
    assignSequentialSections();
    return{rows,issues:[...new Set(issues).values()].filter(issue=>!/لم أتعرف على رقم الشعبة/.test(issue)),lines:scanned};
  }

  const activityTokens=["محاضرة","مختبر","تمارين","كلينيكي","عملي","نظري","ورشة","تدريب","بحث"];

  for(const page of pages)for(const row of page.rows){
    scanned++;
    const cells=row.cells,line=row.line;
    if(line.replace(/[^ء-يa-zA-Z0-9]/g,"").length<6)continue;
    if(isHeaderLine(line))continue;
    const rowDigitsSpaced=cells.map(cell=>toAscii(cell.text)).join(" ");
    const digitRuns=(rowDigitsSpaced.match(/\d+/g)||[]);

    // Rule 1: Course identity comes from its NUMBER only. The Arabic name is
    // never allowed to manufacture a canonical course ID.
    let matchedCourse:AdCourse|null=null;
    const authorityDepartment=academicDigits(options?.authorityDepartmentCode);
    const sourceCourseRuns=digitRuns.filter(run=>run.length===3||run.length===7);
    const courseMatches=catalogue.filter(item=>sourceCourseRuns.some(run=>authorityCourseCodeMatches(run,item.digits,authorityDepartment)));
    if(courseMatches.length===1)matchedCourse=courseMatches[0].course;
    if(!matchedCourse){
      const rawCourseText = cells.find(c => /[ء-ي]/.test(c.text) && !activityTokens.some(act => c.text.includes(act)))?.text || line;
      // Extract time, days, room, instructor for unmapped row
      let time:{start:string;end:string}|null=null;
      for(const cell of cells){const found=timePair(cell.text);if(found){time=found;break;}}
      if(!time)time=timePair(line);

      let flags:typeof EMPTY_DAYS|null=null;
      for(const cell of cells){const found=parseDays(cell.text);if(found){flags=found;break;}}
      if(!flags)flags=parseDays(line);

      const lineLocation=extractAuthorityLocationEvidence(line);
      let roomCode=lineLocation.building,roomHall=lineLocation.hall;
      for(const cell of cells){
        if(roomCode&&roomHall)break;
        const text=toAscii(cell.text).trim();
        const embedded=extractAuthorityLocationEvidence(text);
        if(!roomCode&&embedded.building)roomCode=embedded.building;
        if(!roomHall&&embedded.hall)roomHall=embedded.hall;
        const b=cleanBuildingCode(text);
        if(b&&!roomCode){roomCode=b;continue;}
        const h=cleanHallCode(text);if(h&&!roomHall)roomHall=h;
      }

      const reference=digitRuns.find(value=>/^\d{4,8}$/.test(value))||"";
      const section=digitRuns.find(v=>Number(v)>=500&&Number(v)<=999)||"";
      const instructorHit=matchInstructorName(line,instructors,preferredInstructorIds);

      rows.push({
        sourceOrder:order++,referenceNumber:reference,
        /* Raw prose belongs to sourceCourseText only. Canonical course display
           remains empty until a real catalogue ID is proven. */
        AdCourseId:0,AdCourseName:"",SCode:section,
        AdInstructorId:instructorHit?.AdInstructorId||0,
        TotalHours:3,TotalUnits:3,CourseHours:3,CourseCredit:3,
        fcontacthours:3,fcredithours:3,
        ...(flags||EMPTY_DAYS),
        fstarttime:time?.start||"",fendtime:time?.end||"",
        AdRoomCode:roomCode,AdRoomHall:roomHall,ocrLine:line,
        /* Keep what the document said. Canonical instructor identity is stored
           separately in AdInstructorId and must never overwrite raw evidence. */
        sourceInstructorText:line,
        sourceCourseCode:sourceCourseRuns[0]||"",sourceCourseText:rawCourseText,sourceSectionText:section,
        sourceBuildingText:roomCode,sourceRoomText:roomHall,
        sourceDaysText:Object.keys(flags||{}).filter(key=>(flags as any)?.[key]).join(" "),sourceTimeText:time?[time.start,time.end].join(" - "):"",sourceReadMode:"ocr-fallback",
      });
      issues.push(`صف «${/[ء-يA-Za-z]/.test(rawCourseText)?rawCourseText:"مقرر غير محسوم"}»: لم يتم إثبات رقم المقرر من كتالوج القسم — يرجى اختياره من القائمة`);
      continue;
    }
    const courseName=matchedCourse.CourseName;

    // Rule 6: Exact time extraction with valid university lecture range
    let time:{start:string;end:string}|null=null;
    for(const cell of cells){const found=timePair(cell.text);if(found){time=found;break;}}
    if(!time)time=timePair(line);

    // Rule 7: Exact days extraction
    let flags:typeof EMPTY_DAYS|null=null;
    for(const cell of cells){
      const found=parseDays(cell.text);
      if(found){flags=found;break;}
    }
    if(!flags){
      const actIdx=cells.findIndex(c=>activityTokens.some(act=>c.text.includes(act)));
      if(actIdx>=0){
        for(const offset of [1,-1,2,-2]){
          const idx=actIdx+offset;
          if(idx>=0&&idx<cells.length){
            const found=parseDays(cells[idx].text);
            if(found){flags=found;break;}
          }
        }
      }
    }
    if(!flags)flags=parseDays(line);

    // Rule 4 & 5: location identity is anchored by the official site prefix,
    // not by "any six digits" and not by fragile PDF text-item boundaries.
    const lineLocation=extractAuthorityLocationEvidence(line);
    let roomCode=lineLocation.building,roomHall=lineLocation.hall;
    for(const cell of cells){
      if(roomCode&&roomHall)break;
      const text=toAscii(cell.text).trim();
      const embedded=extractAuthorityLocationEvidence(text);
      if(!roomCode&&embedded.building)roomCode=embedded.building;
      if(!roomHall&&embedded.hall)roomHall=embedded.hall;
      const b=cleanBuildingCode(text);
      if(b&&!roomCode){roomCode=b;continue;}
      const h=cleanHallCode(text);
      if(h&&!roomHall)roomHall=h;
    }

    // Section and Reference (CRN) extraction. The full seven-digit Authority
    // course key must never be mistaken for the reference number when the live
    // catalogue stores only its three-digit tail.
    const courseCode=toAscii(String(matchedCourse.CourseCode||"")).replace(/\D/g,"");
    const sourceCourseCode=sourceCourseRuns.find(run=>authorityCourseCodeMatches(run,courseCode,authorityDepartment))||"";
    const reference=digitRuns.find(value=>/^\d{4,8}$/.test(value)&&value!==courseCode&&value!==sourceCourseCode&&value!==time?.start.replace(":","")&&value!==time?.end.replace(":",""))||"";
    const referenceCellIndex=reference ? cells.findIndex(c=>toAscii(c.text).includes(reference)) : -1;
    let section="";
    if(referenceCellIndex>=0){
      const adjacentCells=cells.slice(Math.max(0,referenceCellIndex-2),referenceCellIndex+3);
      const exactCell=adjacentCells.find(c=>{
        const t=toAscii(c.text).trim();
        return /^\d{1,4}$/.test(t) && t!==courseCode.slice(-3) && t!==reference;
      });
      if(exactCell) section=toAscii(exactCell.text).trim();
    }
    if(!section){
      const secCandidate=digitRuns.find(v=>/^(50[1-9]|5[1-9]\d|\d{3})$/.test(v)&&v!==reference&&v!==courseCode.slice(-3));
      if(secCandidate)section=secCandidate;
    }

    // Rule 8: Instructor extraction with department priority
    const foldedCourse=fold(courseName).replace(/\s+/g,"");
    const arabicCells=cells
      .map(cell=>String(cell.text||"").trim())
      .filter(value=>/[ء-ي]/.test(value)&&!activityTokens.some(act=>value.includes(act)));

    const instructorCandidates=arabicCells.filter(cellText=>{
      const fCell=fold(cellText).replace(/\s+/g,"");
      if(!fCell)return false;
      if(fCell===foldedCourse||foldedCourse.includes(fCell)||fCell.includes(foldedCourse))return false;
      return true;
    });

    const instructorCandidateText=instructorCandidates.join(" ");
    const fallbackCoursePreferred=options?.courseInstructorIds?.get(Number(matchedCourse.AdCourseId));
    const instructorIdentity=matchInstructorIdentity(instructorCandidateText||line,instructors,preferredInstructorIds,fallbackCoursePreferred)
      ||matchInstructorIdentity(line,instructors,preferredInstructorIds,fallbackCoursePreferred);
    const instructorHit=instructorIdentity?.person;

    rows.push({
      sourceOrder:order++,referenceNumber:reference,
      AdCourseId:matchedCourse.AdCourseId,AdCourseName:courseName,SCode:section,
      AdInstructorId:instructorHit?.AdInstructorId||0,
      TotalHours:matchedCourse.CourseHours,TotalUnits:matchedCourse.CourseCredit,
      CourseHours:matchedCourse.CourseHours,CourseCredit:matchedCourse.CourseCredit,
      fcontacthours:matchedCourse.CourseHours||3,fcredithours:matchedCourse.CourseCredit||3,
      ...(flags||EMPTY_DAYS),
      fstarttime:time?.start||"",fendtime:time?.end||"",
      AdRoomCode:roomCode,AdRoomHall:roomHall,ocrLine:line,sourceInstructorText:instructorCandidateText,
      sourceCourseCode,sourceCourseText:cells.find(cell=>fold(cell.text)===fold(courseName))?.text||courseName,sourceSectionText:section,
      sourceBuildingText:roomCode,sourceRoomText:roomHall,
      sourceDaysText:Object.keys(flags||{}).filter(key=>(flags as any)?.[key]).join(" "),sourceTimeText:time?[time.start,time.end].join(" - "):"",sourceReadMode:"ocr-fallback",
      instructorMatchMethod:instructorIdentity?.method,instructorMatchScore:instructorIdentity?.score,instructorMatchedTokens:instructorIdentity?.matchedTokens,
    });

    if(!time)issues.push(`صف «${courseName}»: لم أتعرف على الوقت`);
    if(!flags)issues.push(`صف «${courseName}»: لم أتعرف على الأيام`);
    if(!instructorHit&&instructorCandidateText&&!instructorCandidateText.includes("هيئة")&&!instructorCandidateText.includes("هيئه"))
      issues.push(`صف «${courseName}» شعبة ${section||"—"}: لم أتعرف على أستاذ المقرر («${instructorCandidateText}»)`);
    if(!section)issues.push(`صف «${courseName}»: لم أتعرف على رقم الشعبة`);
    if(!roomCode&&!roomHall)issues.push(`صف «${courseName}»: لم أتعرف على المبنى والقاعة`);
  }

  if(!rows.length)issues.push("لم أتعرف على صفوف الجدول. تأكد أن الملف واضح وبنفس نموذج الجدول المعتمد.");
  assignSequentialSections();
  return{rows,issues:[...new Set(issues).values()].filter(issue=>!/لم أتعرف على رقم الشعبة/.test(issue)),lines:scanned};
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
