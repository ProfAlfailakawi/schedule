import type { AdCourse, AdInstructor } from "../types";

const toAscii=(value:string)=>String(value||"")
  /* Generated Authority PDFs often store Arabic as Presentation Forms
     (e.g. «ﺟﺪﻭﻝ» instead of «جدول»). NFKC turns those glyph forms back into
     ordinary Arabic letters before ANY header/course/instructor matching. */
  .normalize("NFKC")
  .replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
const fold=(value:string)=>toAscii(value).replace(/[ً-ْـ]/g,"").replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/[^ء-يa-zA-Z0-9: ]/g," ").replace(/\s+/g," ").trim().toLowerCase();

/** A cell as the scanner saw it: its text and where it sat on the page. */
export type OcrCell={text:string;x0:number;x1:number};
/** One physical table row, right-to-left, with the columns still apart. */
export type OcrRow={cells:OcrCell[];line:string;y:number};
export type OcrPage={rows:OcrRow[];gridRows?:GridRow[]};
export type Legibility={readable:boolean;confidence:number;charactersPerPage:number;reason:string};
export type HeaderTerm={season:"first"|"second"|"summer";years:[number,number];label:string};
export type HeaderBranch={code:string;name:string;label:string};
export type OcrResult={pages:OcrPage[];text:string;pageCount:number;confidence:number;orientation:-1|0|1;legibility:Legibility;headerTerm?:HeaderTerm;headerBranch?:HeaderBranch};
export type OcrProgress=(stage:{phase:"render"|"orient"|"read";page:number;pages:number;message:string})=>void;

const MAX_PAGES=12;
/** A4 at ~300dpi. The old 157dpi render was the single largest cause of
 *  unreadable rows: Arabic table text at that size loses its dots. */
const TARGET_LONG_EDGE:number=3000;
/** The orientation probe runs on a deliberately small render. Deciding which
 *  way is up needs a tenth of the pixels that reading the text needs. */
const PROBE_LONG_EDGE:number=1400;

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
 * so the second upload starts hot. Three Latin-digits workers carry the
 * numeric strips in parallel; one Arabic worker carries the names. A worker
 * serialises its own jobs internally, so the semaphore hands each exactly one
 * job at a time.
 */
type PooledWorker={recognize:Function;setParameters:Function;terminate:Function};
let poolPromise:Promise<{eng:PooledWorker[];ara:PooledWorker;ara2:PooledWorker}>|null=null;
async function getWorkerPool(){
  if(!poolPromise)poolPromise=(async()=>{
    const {createWorker}=await import("tesseract.js");
    const [e1,e2,e3,a1,a2]=await Promise.all([
      createWorker("eng"),createWorker("eng"),createWorker("eng"),createWorker("ara+eng"),createWorker("ara+eng"),
    ]);
    return{eng:[e1,e2,e3] as PooledWorker[],ara:a1 as PooledWorker,ara2:a2 as PooledWorker};
  })();
  return poolPromise;
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

async function pdfTextLayer(input:Buffer,onProgress?:OcrProgress):Promise<OcrResult|null>{
  try{
    const pdfjs:any=await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf=await pdfjs.getDocument({data:new Uint8Array(input),disableWorker:true,useSystemFonts:true}).promise;
    const count=Math.min(Number(pdf.numPages||0),MAX_PAGES);
    if(!count)return null;
    const pages:OcrPage[]=[];const pageTexts:string[]=[];let structuralRows=0,totalChars=0;
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
      structuralRows+=rows.filter(row=>{
        const ascii=toAscii(row.line).replace(/[Oo]/g,"0");
        const hasTime=/\b[0-2]?\d[0-5]\d\s*[-–—]?\s*[0-2]?\d[0-5]\d\b/.test(ascii)
          ||/\b(?:[01]?\d|2[0-3])[:.]?[0-5]\d\s*[-–—]?\s*(?:[01]?\d|2[0-3])[:.]?[0-5]\d\b/.test(ascii);
        const digitRuns=ascii.match(/\d+/g)||[];
        const hasTableKey=digitRuns.some(run=>run.length>=4)||/\b\d{3}[A-Za-z]\d{2}\b/.test(ascii)||/[ء-ي]{4,}/.test(row.line);
        return hasTime||(hasTableKey&&digitRuns.length>=3);
      }).length;
      pages.push({rows});
    }
    const text=pageTexts.join("\n\n--- PAGE ---\n\n");
    /* Require several timetable rows before skipping OCR. */
    if(structuralRows<1||totalChars<80)return null;
    const confidence=99;
    return{
      pages,text,pageCount:count,confidence,orientation:0,
      legibility:{readable:true,confidence,charactersPerPage:Math.round(totalChars/Math.max(1,count)),reason:""},
      headerTerm:readHeaderTerm(text),headerBranch:readHeaderBranch(text),
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

const stripPatterns={
  time:/^\d{3,4}\s*[-–—]?\s*\d{3,4}$/,
  code:/^\d{7}$/,
  refcode:/^\d{11,13}$/,
  reference:/^\d{4,8}$/,
  scode:/^\d{1,4}$/,
  building:/^(?:012|011|010)?B\d{1,3}$/i,
  hall:/^(?!(?:012|011|010)?B\d)[FGACDEMNPLK\d]{1,5}$/i,
  days:/^[1-5](?:[\s,\-–—./]*[1-5])*$/,
};

/**
 * Read the ruled table cell by cell. Returns null when the page carries no
 * usable grid, so the caller can fall back to the flat-text path.
 */
async function readGrid(upright:Buffer,pool:{eng:PooledWorker[];ara:PooledWorker;ara2:PooledWorker}):Promise<GridRow[]|null>{
  const lib=await canvas();
  const image=await lib.loadImage(upright);
  const surface=lib.createCanvas(image.width,image.height);
  surface.getContext("2d").drawImage(image,0,0);
  const bin=otsuBinarize(lib,surface);
  const {cols,rows}=findRules(bin);
  if(cols.length<6||rows.length<5)return null;

  /* Row bands are the regular runs of the pitch; header bands above the first
     regular run and footer bands below the last are dropped. */
  const gaps=rows.slice(1).map((v,i)=>v-rows[i]).filter(g=>g>8).sort((a,b)=>a-b);
  const pitch=gaps[Math.floor(gaps.length/2)];
  if(!pitch||pitch<10)return null;
  const bands:{top:number;bottom:number}[]=[];
  for(let i=0;i<rows.length-1;i++){
    const span=rows[i+1]-rows[i];
    if(span>pitch*0.6&&span<pitch*1.5)bands.push({top:rows[i],bottom:rows[i+1]});
  }
  if(bands.length<3)return null;

  /* Column bands between consecutive rules, plus the open band left of the
     first rule where this layout keeps the instructor names. */
  const columnBands:{left:number;right:number}[]=[];
  const leftOpenStart=Math.max(0,cols[0]-Math.round(image.width*0.20));
  if(cols[0]>image.width*0.02)columnBands.push({left:leftOpenStart,right:cols[0]});
  for(let i=0;i<cols.length-1;i++){
    const width=cols[i+1]-cols[i];
    if(width>=Math.max(18,image.width*0.008))columnBands.push({left:cols[i],right:cols[i+1]});
  }
  if(columnBands.length<5)return null;

  const top=bands[0].top,bottom=bands[bands.length-1].bottom;
  const cropScaled=(source:any,left:number,right:number)=>{
    const width=right-left,height=bottom-top;
    const c=lib.createCanvas(width*2,height*2);
    const ctx=c.getContext("2d");
    ctx.imageSmoothingEnabled=true;
    ctx.drawImage(source,left,top,width,height,0,0,width*2,height*2);
    return c.toBuffer("image/png");
  };

  type StripRead={cells:string[]};
  const readStrip=async(source:any,band:{left:number;right:number},alphabet:string,psm:string,worker:PooledWorker=pool.ara):Promise<StripRead>=>{
    await worker.setParameters({tessedit_char_whitelist:alphabet,tessedit_pageseg_mode:psm as any});
    const result:any=await worker.recognize(cropScaled(source,band.left,band.right),{},{text:true,blocks:true});
    const words:{t:string;x:number;y:number}[]=[];
    for(const block of result?.data?.blocks||[])for(const paragraph of block?.paragraphs||[])for(const line of paragraph?.lines||[])for(const word of line?.words||[]){
      const text=String(word?.text||"").trim();
      if(text)words.push({t:text,x:word.bbox.x0,y:(word.bbox.y0+word.bbox.y1)/2/2+top});
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
  const numericGrey:StripRead[]=await runOnPool(pool.eng,
    columnBands.map(band=>(worker:PooledWorker)=>readStrip(surface,band,NUMERIC,"6",worker)));
  const anyPattern=Object.values(stripPatterns);
  const weak=(read:StripRead)=>{
    const best=Math.max(...anyPattern.map(pattern=>read.cells.filter(cell=>pattern.test(cell.replace(/\s+/g," ").trim())).length));
    return best<bands.length*0.5;
  };
  const binIndices=columnBands.map((_,index)=>index).filter(index=>weak(numericGrey[index]));
  const binReads=await runOnPool(pool.eng,
    binIndices.map(index=>(worker:PooledWorker)=>readStrip(bin,columnBands[index],NUMERIC,"6",worker)));
  const numericBin:StripRead[]=columnBands.map(()=>({cells:bands.map(()=>"")}));
  binIndices.forEach((columnIndex,at)=>{numericBin[columnIndex]=binReads[at];});

  const normalizeCell=(value:string)=>value.replace(/\s+/g," ").trim();
  const validatorHits=(cells:string[],pattern:RegExp)=>cells.filter(cell=>pattern.test(normalizeCell(cell))).length;

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
  const taken=new Set<number>();
  const minimumRows=Math.max(2,Math.floor(bands.length*0.15));
  const timeIndex=claim(stripPatterns.time,minimumRows,taken);if(timeIndex>=0)taken.add(timeIndex);
  const buildingIndex=claim(stripPatterns.building,minimumRows,taken);if(buildingIndex>=0)taken.add(buildingIndex);
  const hallIndex=claim(stripPatterns.hall,minimumRows,taken);if(hallIndex>=0)taken.add(hallIndex);
  const daysIndex=claim(stripPatterns.days,minimumRows,taken);if(daysIndex>=0)taken.add(daysIndex);
  const refcodeIndex=claim(stripPatterns.refcode,minimumRows,taken);if(refcodeIndex>=0)taken.add(refcodeIndex);
  const codeIndex=refcodeIndex>=0?-1:claim(stripPatterns.code,minimumRows,taken);if(codeIndex>=0)taken.add(codeIndex);
  const referenceIndex=refcodeIndex>=0?-1:claim(stripPatterns.reference,minimumRows,taken);if(referenceIndex>=0)taken.add(referenceIndex);
  /* The section column sits beside the reference block in this layout, so its
     neighbours are auditioned first; a free search only if neither validates. */
  const anchorIndex=refcodeIndex>=0?refcodeIndex:codeIndex>=0?codeIndex:referenceIndex;
  let scodeIndex=-1;
  for(const near of [anchorIndex-1,anchorIndex+1]){
    if(near<0||near>=columnBands.length||taken.has(near))continue;
    const hits=Math.max(validatorHits(numericGrey[near].cells,stripPatterns.scode),validatorHits(numericBin[near].cells,stripPatterns.scode));
    if(hits>=minimumRows){scodeIndex=near;break;}
  }
  if(scodeIndex<0)scodeIndex=claim(stripPatterns.scode,minimumRows,taken);
  if(scodeIndex>=0)taken.add(scodeIndex);
  if(timeIndex<0&&refcodeIndex<0&&codeIndex<0)return null;

  const DIGITS="0123456789 -";
  const refineIndices=[daysIndex,refcodeIndex,referenceIndex,codeIndex,scodeIndex].filter(index=>index>=0);
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
    const width=band.right-band.left,height=rowBand.bottom-rowBand.top;
    if(width<6||height<6)return"";
    const cell=lib.createCanvas(width*2,height*2);
    const ctx=cell.getContext("2d");
    ctx.imageSmoothingEnabled=true;
    ctx.drawImage(source,band.left,rowBand.top,width,height,0,0,width*2,height*2);
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

  /* Pass 2 — Arabic. Instructor names are mandatory because the system must
     display every doctor after upload. Course names are only an OCR fallback:
     once the numeric course key is readable on most rows, the authoritative
     name comes from the system catalogue and paying a second Arabic strip adds
     time without adding truth. */
  await pool.ara.setParameters({tessedit_char_whitelist:"",tessedit_pageseg_mode:"4" as any});
  const unclaimed=columnBands.map((band,index)=>({band,index,width:band.right-band.left}))
    .filter(item=>!taken.has(item.index)).sort((a,b)=>b.width-a.width);
  const widest=unclaimed[0];
  const leftOpen=unclaimed.find(item=>item.index===0);
  const instructorBand=leftOpen || unclaimed.find(item=>item.index!==widest?.index);
  const codePattern=refcodeIndex>=0?stripPatterns.refcode:stripPatterns.code;
  const codeSignalIndex=refcodeIndex>=0?refcodeIndex:codeIndex;
  const codeHits=codeSignalIndex>=0
    ? Math.max(validatorHits(numericGrey[codeSignalIndex].cells,codePattern),validatorHits(numericBin[codeSignalIndex].cells,codePattern))
    : 0;
  const needCourseNames=codeHits<Math.max(3,Math.floor(bands.length*0.72));
  const nameBand=needCourseNames?widest:undefined;
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
  const timeAt=pickValidated(timeIndex,stripPatterns.time);
  const buildingAt=pickValidated(buildingIndex,stripPatterns.building);
  const hallAt=pickValidated(hallIndex,stripPatterns.hall);
  const daysAt=pickValidated(daysIndex,stripPatterns.days);
  const refcodeAt=pickValidated(refcodeIndex,stripPatterns.refcode);
  const codeAt=pickValidated(codeIndex,stripPatterns.code);
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
    return cleanBuildingCode(raw);
  };
  const safeHall=(raw:string)=>{
    return cleanHallCode(raw);
  };

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
    const timeText=timeAt(row).replace(/\D+/g," ").trim();
    const pieces=timeText.split(" ").filter(piece=>piece.length>=3&&piece.length<=4);
    let start="",end="";
    /* A 3-digit piece lost one digit, and which end it lost decides the hour:
       «080» is 0800 with its tail gone, «950» is 0950 with its head gone. Try
       both pads and keep the one that lands inside teaching hours — for these
       values exactly one of them ever does. */
    const teaching=(value:string)=>{const h=Number(value.slice(0,2)),m=Number(value.slice(2));return h>=7&&h<21&&m<60;};
    const mend=(piece:string):string|null=>{
      if(piece.length===4)return teaching(piece)?piece:null;
      const padded=[piece.padEnd(4,"0"),piece.padStart(4,"0")].filter(teaching);
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
    if(scode.length>4)scode="";

    const bRaw=buildingAt(row);
    const hRaw=hallAt(row);
    let building=safeBuilding(bRaw)||safeBuilding(hRaw);
    let hall=safeHall(hRaw)||safeHall(bRaw);

    if(!building){
      for(let c=0;c<columnBands.length;c++){
        const val=normalizeCell(numericGrey[c]?.cells[row]||numericBin[c]?.cells[row]||"");
        const b=safeBuilding(val);
        if(b){building=b;break;}
      }
    }
    if(!hall){
      for(let c=0;c<columnBands.length;c++){
        const val=normalizeCell(numericGrey[c]?.cells[row]||numericBin[c]?.cells[row]||"");
        const h=safeHall(val);
        if(h){hall=h;break;}
      }
    }

    let rowDays=daysAt(row).trim();
    if(!parseDays(rowDays)){
      for(let c=0;c<columnBands.length;c++){
        if(c===codeIndex||c===refcodeIndex||c===referenceIndex||c===scodeIndex||c===timeIndex)continue;
        const val=normalizeCell(numericGrey[c]?.cells[row]||numericBin[c]?.cells[row]||"");
        if(parseDays(val)){rowDays=val;break;}
      }
    }

    rowsOut.push({
      code,reference,scode,
      courseText:normalizeCell(nameCells.cells[row]||""),
      instructorText:normalizeCell(instructorCells.cells[row]||""),
      days:rowDays,
      start,end,
      building,
      hall,
    });
  }
  const meaningful=rowsOut.filter(row=>row.code||row.start||row.courseText.length>3);
  return meaningful.length>=3?rowsOut:null;
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
  const ascii=toAscii(text);
  const match=ascii.match(/الفصل\s*الدراسي\s*(الاول|الأول|الثاني|الثانى|الصيفي|الصيفى)\s*(\d{4})\s*-\s*(\d{4})/)
    /* The header strip often garbles «الدراسي» while the season word and the
       year pair survive; they are unambiguous inside a header line. */
    ||ascii.match(/(الاول|الأول|الثاني|الثانى|الصيفي|الصيفى)\s*(\d{4})\s*-\s*(\d{4})/);
  if(!match)return undefined;
  const season=/الاول|الأول/.test(match[1])?"first":/الثاني|الثانى/.test(match[1])?"second":"summer";
  const a=Number(match[2]),b=Number(match[3]);
  const years:[number,number]=[Math.min(a,b),Math.max(a,b)];
  const seasonLabel=season==="first"?"الأول":season==="second"?"الثاني":"الصيفي";
  return{season,years,label:`الفصل الدراسي ${seasonLabel} ${years[0]}/${years[1]}`};
}

/** Branch line printed in the Authority header, e.g.
 * «الفرع: 012 كلية التربية الأساسية بنات». The application does not maintain
 * a separate branch catalogue, so the source header is the authoritative name. */
function readHeaderBranch(text:string):HeaderBranch|undefined{
  const ascii=toAscii(text).replace(/\r/g,"");
  const build=(code:string,nameRaw:string):HeaderBranch=>{
    const name=String(nameRaw||"")
      .replace(/\s+(?:القسم|الكلية|الفصل|التاريخ|رقم\s*المقرر|مسمى\s*المقرر)\s*[:：]?.*$/," ")
      .replace(/^[|:：-]+|[|:：-]+$/g,"").replace(/\s+/g," ").trim();
    return{code,name,label:[code,name].filter(Boolean).join(" ")};
  };
  for(const rawLine of ascii.split("\n")){
    const line=rawLine.replace(/\s+/g," ").trim();
    const match=line.match(/الفرع\s*[:：-]?\s*(\d{3})\s*(.*)$/);
    if(match)return build(match[1],match[2]);
  }
  /* Fast PDF-header preflight joins text-layer items without rebuilding the
     table. Accept that flattened form too, but stop before the next known
     header label so we never swallow a timetable row into the branch name. */
  const flat=ascii.replace(/\s+/g," ").trim();
  const flatMatch=flat.match(/الفرع\s*[:：-]?\s*(\d{3})\s*([^]{0,180}?)(?=\s+(?:القسم|الكلية|الفصل|التاريخ|رقم\s*المقرر|مسمى\s*المقرر)\b|$)/);
  return flatMatch?build(flatMatch[1],flatMatch[2]):undefined;
}

/**
 * Cheap first-page preflight for generated Authority PDFs.
 *
 * This intentionally reads ONLY the embedded text layer of page 1. It does
 * not render the timetable and does not OCR body rows. The server uses it to
 * reject a wrong academic term before spending time parsing the table. A scan
 * without a text layer simply returns an empty header and falls back to the
 * normal OCR path.
 */
export async function readAuthorityPdfHeader(input:Buffer):Promise<{term?:HeaderTerm;branch?:HeaderBranch}>{
  try{
    if(input.subarray(0,4).toString("latin1")!=="%PDF")return{};
    const pdfjs:any=await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf=await pdfjs.getDocument({data:new Uint8Array(input),disableWorker:true,useSystemFonts:true}).promise;
    if(!Number(pdf.numPages||0))return{};
    const page=await pdf.getPage(1);
    const content:any=await page.getTextContent({includeMarkedContent:false,disableNormalization:false});
    const text=(content?.items||[]).map((item:any)=>String(item?.str||"").normalize("NFKC")).filter(Boolean).join(" ");
    return{term:readHeaderTerm(text),branch:readHeaderBranch(text)};
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

/**
 * OCR is deliberately server-side: the PDF import and the public survey share
 * one implementation, and no uploaded document is kept after it is read.
 */
export async function ocrDocument(input:Buffer,mime:string,onProgress?:OcrProgress):Promise<OcrResult>{
  const looksLikePdf=/pdf/i.test(mime)||input.subarray(0,4).toString("latin1")==="%PDF";
  if(looksLikePdf){
    const embedded=await pdfTextLayer(input,onProgress);
    if(embedded)return embedded;
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
  const probeFirst=await probeOf(images[0]);

  /* Orientation costs pixels now, not recognitions: the three turns are scored
     on a small render in well under a second. A page with no grid signal at
     all (a photographed transcript) falls back to one small OCR probe. */
  onProgress?.({phase:"orient",page:1,pages:images.length,message:"تحديد اتجاه الصفحة"});
  let orientation:-1|0|1=0;
  {
    /* Pixels answer the cheap half only: WHICH AXIS. A table turned +90° and
       one turned −90° show identical rule geometry — the first cut of this
       heuristic picked the upside-down twin and read zero rows — so the two
       finalists are separated by one small TEXT probe each: legible Arabic and
       time patterns only appear on the right-side-up twin. Two small
       recognitions, not three big ones. */
    const turns:[-1,0,1]=[-1,0,1];
    const pixelScores=await Promise.all(turns.map(async turn=>({turn,score:await pixelOrientationScore(await rotateImage(probeFirst,turn))})));
    pixelScores.sort((a,b)=>b.score-a.score);
    const [first,second]=pixelScores;
    if(first.score>second.score*1.35){
      orientation=first.turn as -1|0|1;
    }else{
      const finalists=[first.turn,second.turn] as Array<-1|0|1>;
      const textScore=async(turn:-1|0|1)=>{
        const result:any=await pool.ara.recognize(await rotateImage(probeFirst,turn)).catch(()=>null);
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

  /* Pages run one after another, but INSIDE each page the strips fan out over
     the pool — and the full-page recognition, the single most expensive call
     in the old pipeline, is skipped entirely whenever the grid succeeds. The
     header strip (the top of the page) is all the prose the caller still
     needs: the term line for the mismatch warning, and a text sample for the
     legibility verdict. */
  let pagesDone=0;
  /* Do not run whole pages against the same Tesseract workers concurrently.
     The previous Promise.all made three pages race through the same worker
     objects and their setParameters calls, which both slowed recognition and
     made Arabic/numeric settings bleed between pages. Strips still fan out
     across the worker pool inside each page; pages themselves are serialized. */
  for(let index=0;index<images.length;index++){
    const pageImage=images[index];
    let upright=await deskew(await rotateImage(pageImage,orientation));
    let gridRows:GridRow[]|null=null;
    try{gridRows=await readGrid(upright,pool);}catch{/* an unreadable grid falls back */}
    /* Scanned PDFs are often saved with a wrong orientation flag or a camera
       rotation that the first-page probe cannot infer reliably. Do not give up
       after one guess: only when the chosen turn fails, try the two remaining
       quarter-turns and keep the one that produces the strongest physical
       table. This rescue is paid only for failed pages, so clean exports remain
       fast while photographed/CamScanner sheets stop collapsing into prose. */
    if(!gridRows){
      let best:{upright:Buffer;rows:GridRow[]}|null=null;
      const tried=new Set<number>([orientation]);
      for(const turn of [-1,0,1] as const){
        if(tried.has(turn))continue;
        try{
          const candidate=await deskew(await rotateImage(pageImage,turn));
          const candidateRows=await readGrid(candidate,pool);
          const strength=(candidateRows||[]).filter(row=>row.code||row.reference||row.start||row.days).length;
          const bestStrength=(best?.rows||[]).filter(row=>row.code||row.reference||row.start||row.days).length;
          if(candidateRows&&strength>bestStrength)best={upright:candidate,rows:candidateRows};
        }catch{/* try the remaining orientation */}
      }
      if(best){upright=best.upright;gridRows=best.rows;}
    }
    if(gridRows){
      const lib=await canvas();
      const image=await lib.loadImage(upright);
      /* Two proven killers are skirted here: pdfjs's transparent ground reads
         as BLACK to Tesseract, and CamScanner's dark border band along the top
         edge kills page segmentation for the whole crop. White fill plus a
         start just below the band turned this exact crop from empty at every
         psm into a verbatim «الفصل الدراسي الاول 2027-2026». */
      const headerTop=Math.round(image.height*0.03);
      const headerHeight=Math.max(140,Math.round(image.height*0.22)-headerTop);
      /* Half scale: the term line is large print, and halving the pixels
         roughly halves the one Arabic recognition this path still pays. */
      const headScale=0.55;
      const head=lib.createCanvas(Math.round(image.width*headScale),Math.round(headerHeight*headScale));
      const headCtx=head.getContext("2d");
      headCtx.fillStyle="#ffffff";headCtx.fillRect(0,0,head.width,head.height);
      headCtx.drawImage(image,0,headerTop,image.width,headerHeight,0,0,head.width,head.height);
      await pool.ara.setParameters({tessedit_char_whitelist:"",tessedit_pageseg_mode:"6" as any});
      const header:any=await pool.ara.recognize(head.toBuffer("image/png")).catch(()=>null);
      texts[index]=String(header?.data?.text||"");
      const filled=gridRows.filter(row=>row.code||row.start||row.courseText.length>3).length;
      scores[index]=Math.min(85,55+filled*2);
      pages[index]={rows:[],gridRows};
    }else{
      const grid=await spreadColumns(upright);
      await pool.ara.setParameters({tessedit_char_whitelist:"",tessedit_pageseg_mode:"3" as any});
      const result:any=await pool.ara.recognize(grid.image,{},{text:true,blocks:true});
      const surface=result?.data||{};
      texts[index]=String(surface.text||"");
      scores[index]=Number(surface.confidence||0);
      pages[index]={rows:tableFromWords(wordsOf(surface),grid.columns)};
    }
    pagesDone++;
    onProgress?.({phase:"read",page:pagesDone,pages:images.length,message:`قراءة الصفحة ${pagesDone} من ${images.length}`});
  }

  const text=texts.join("\n\n--- PAGE ---\n\n");
  const confidence=Math.round(scores.reduce((sum,value)=>sum+value,0)/Math.max(1,scores.length));
  const anyGrid=pages.some(page=>page?.gridRows?.length);
  /* A page whose grid yielded rows has PROVEN itself readable; the prose-based
     judge only rules on pages that had to be read as prose. */
  const legibility=anyGrid
    ?{readable:true,confidence,charactersPerPage:Math.round(text.replace(/\s+/g,"").length/Math.max(1,images.length)),reason:""}
    :judgeLegibility(text,images.length,confidence);
  return{
    pages:pages.map(page=>page||{rows:[]}),
    text,
    pageCount:images.length,
    confidence,
    orientation,
    legibility,
    headerTerm:readHeaderTerm(text),
    headerBranch:readHeaderBranch(text),
  };
}

const repairClockDigits=(value:string)=>value.replace(/[Oo°QDﻩ]/g,"0").replace(/[¢()\[\]{}|!lI]/g,"0");
const minutesOf = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));

export const cleanBuildingCode = (raw: string): string => {
  const clean = String(raw || "").replace(/\s+/g, "").toUpperCase();
  if (!clean) return "";
  const mFull = clean.match(/(?:012|011|010|[0-9]{3})?([A-Z])(\d{1,3})/);
  if (mFull) {
    const full = clean.match(/^(\d{3})?([A-Z])(\d{1,3})$/);
    if (full) {
      let num = full[3];
      if (num.length === 3 && num.endsWith("0")) num = num.slice(0, 2);
      const prefix = full[1] || "";
      return prefix ? `${prefix}${full[2]}${num.padStart(2, "0")}` : `${full[2]}${num.padStart(2, "0")}`;
    }
  }
  const m = clean.match(/(?:012|011|010)?B\d{1,3}/);
  if (m) {
    let b = m[0];
    if (b.length === 7 && b.endsWith("0")) b = b.slice(0, 6);
    return b;
  }
  if (/^B\d{1,3}$/.test(clean)) return clean;
  return "";
};

export const cleanHallCode = (raw: string): string => {
  const clean = String(raw || "").replace(/\s+/g, "").toUpperCase();
  if (!clean) return "";
  if (/^(?:012|011|010)?B\d{1,3}$/.test(clean)) return "";
  const m = clean.match(/([FGACDEMNPLK]|[A-Z])(\d{1,4})/);
  if (m && !/^B\d+$/.test(m[0])) {
    let numStr = m[2];
    // Remove trailing digits bleeding from adjacent seat columns (e.g. F1501 -> F15, F130 -> F13)
    if (numStr.length >= 3 && (numStr.endsWith("0") || numStr.endsWith("01") || numStr.endsWith("00"))) {
      if (numStr.length === 4 && numStr.endsWith("01")) numStr = numStr.slice(0, 2);
      else if (numStr.endsWith("0")) numStr = numStr.slice(0, -1);
    }
    return `${m[1]}${numStr}`;
  }
  return "";
};

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

  if (/^\d{3,}$/.test(ascii.replace(/\s+/g, ""))) {
    return null;
  }

  // 1. Digits 1-5 with separators or run
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
};

/** Match the abbreviated instructor name printed on the Authority sheet to
 * the exact catalogue record.
 * Supports:
 * - Full names, e.g. «د. علي يوسف أحمد السند»
 * - First + Last names, e.g. «علي السند», «سعد الحيص», «عيسى شقرة»
 * - Truncated / stemmed family names, e.g. «الدر» for «الدرعان»
 * - Department instructor preference weighting
 * - Clean detection of faculty / unassigned roles («هيئة تدريسية») */
function matchInstructorName(raw:string,instructors:AdInstructor[],preferredIds?:Set<number>):AdInstructor|undefined{
  const clean=(value:string)=>fold(value)
    /* Academic titles are presentation, not identity. NFKC/fold removes the
       dots first, so «أ.د.» becomes «ا د» and «أ.» becomes a standalone «ا». */
    .replace(/^(?:(?:دكتور|الدكتور|دكتوره|الدكتوره|استاذ|الاستاذ|ا\s*د|د|م|ا)\s+)+/g," ")
    .replace(/(?:^|\s)(?:دكتور|الدكتور|دكتوره|الدكتوره|استاذ|الاستاذ|ا\s*د)(?=\s|$)/g," ")
    .replace(/\s+/g," ").trim();
  const rawClean=clean(raw);
  if(!rawClean)return undefined;
  if(/هيئه\s*تدريس|هيئة\s*تدريس|عضو\s*هيئه|عضو\s*هيئة|شاغر|منتدب/.test(rawClean))return undefined;

  const rawTokens=rawClean.split(/\s+/).filter(w=>/[ء-ي]/.test(w)&&w.length>=2);
  if(!rawTokens.length)return undefined;

  const candidates=instructors.map(person=>{
    const normalized=clean(person.AdInstructorName);
    const tokens=normalized.split(/\s+/).filter(w=>/[ء-ي]/.test(w)&&w.length>=2);
    const preferred=Boolean(preferredIds?.has(Number(person.AdInstructorId)));
    return{person,normalized,tokens,preferred};
  }).filter(item=>item.tokens.length);

  // 1. Direct normalized full name contains or candidate tokens are exact ordered subset of raw tokens
  const fullMatches=candidates.filter(item=>rawClean.includes(item.normalized));
  if(fullMatches.length===1)return fullMatches[0].person;
  const prefFull=fullMatches.filter(item=>item.preferred);
  if(prefFull.length===1)return prefFull[0].person;

  // 1.1 Candidate tokens are an exact subset of the longer raw name (e.g. system has 2-3 names, PDF has 4-5 names)
  const subsetMatches = candidates.filter(item => {
    if (item.tokens.length < 2) return false;
    let rawIdx = 0;
    for (const t of item.tokens) {
      const foundIdx = rawTokens.findIndex((rt, i) => i >= rawIdx && (rt === t || (rt.length >= 3 && (rt.startsWith(t) || t.startsWith(rt)))));
      if (foundIdx === -1) return false;
      rawIdx = foundIdx + 1;
    }
    return true;
  });
  if (subsetMatches.length === 1) return subsetMatches[0].person;
  const prefSubset = subsetMatches.filter(item => item.preferred);
  if (prefSubset.length === 1) return prefSubset[0].person;

  // 2. First + Last name token presence
  const firstLastMatches=candidates.filter(item=>{
    if(item.tokens.length<2)return false;
    const first=item.tokens[0];
    const last=item.tokens[item.tokens.length-1];
    const hasFirst=rawTokens.some(t=>t===first||(t.length>=3&&(first.startsWith(t)||t.startsWith(first))));
    const hasLast=rawTokens.some(t=>t===last||(t.length>=3&&(last.startsWith(t)||t.startsWith(last))));
    return hasFirst&&hasLast;
  });
  if(firstLastMatches.length===1)return firstLastMatches[0].person;
  const prefFirstLast=firstLastMatches.filter(item=>item.preferred);
  if(prefFirstLast.length===1)return prefFirstLast[0].person;

  // 3. Any 2 common tokens (>= 3 chars)
  const multiTokenMatches=candidates.filter(item=>{
    let count=0;
    for(const it of item.tokens){
      if(rawTokens.some(t=>t===it||(t.length>=4&&(it.startsWith(t)||t.startsWith(it)))))count++;
    }
    return count>=2;
  });
  if(multiTokenMatches.length===1)return multiTokenMatches[0].person;
  const prefMulti=multiTokenMatches.filter(item=>item.preferred);
  if(prefMulti.length===1)return prefMulti[0].person;

  // 4. Distinctive family/last name match in this department
  const lastMatches=candidates.filter(item=>{
    const last=item.tokens[item.tokens.length-1];
    return last.length>=4&&rawTokens.some(t=>t===last||t===last.replace(/^ال/,"")||t==="ال"+last);
  });
  if(lastMatches.length===1)return lastMatches[0].person;
  const prefLast=lastMatches.filter(item=>item.preferred);
  if(prefLast.length===1)return prefLast[0].person;

  // 5. Unique first token match
  if(rawTokens.length<=2){
    const first=rawTokens[0];
    const firstMatches=candidates.filter(item=>item.tokens[0]===first);
    const prefFirst=firstMatches.filter(item=>item.preferred);
    if(prefFirst.length===1)return prefFirst[0].person;
    if(firstMatches.length===1)return firstMatches[0].person;
  }

  // 6. Weighted fuzzy scoring fallback
  const ranked=candidates.map(item=>{
    let score=fuzzyNameScore(rawClean,item.person.AdInstructorName);
    if(item.preferred)score+=0.15;
    return{item,score};
  }).sort((a,b)=>b.score-a.score);
  const top=ranked[0],runner=ranked[1];
  if(top&&top.score>=0.38&&(!runner||top.score-runner.score>=0.06))return top.item.person;
  return undefined;
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
 * course(3). It is matched exactly first, then with one forgiven character,
 * then by its 3-digit tail when that tail is unique in this department — the
 * order the user specified. The Arabic name is the last resort, not the first.
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

function parseGridRows(gridRows:GridRow[],courses:AdCourse[],instructors:AdInstructor[],startOrder:number,preferredInstructorIds?:Set<number>){
  const catalogue=courses.map(course=>({course,digits:toAscii(String(course.CourseCode||"")).replace(/\D/g,""),folded:fold(course.CourseName)}));
  const tails=new Map<string,number>();
  for(const item of catalogue){
    if(item.digits.length>=3){const tail=item.digits.slice(-3);tails.set(tail,(tails.get(tail)||0)+1);}
  }
  const prefixVotes=new Map<string,number>();
  for(const item of catalogue)if(item.digits.length>=6)
    prefixVotes.set(item.digits.slice(0,-3),(prefixVotes.get(item.digits.slice(0,-3))||0)+1);
  const departmentPrefix=[...prefixVotes.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||"";
  const spaceless=(value:string)=>fold(value).replace(/[a-z0-9 ]/g,"");
  const spacelessCatalogue=catalogue.map(item=>({item,flat:spaceless(item.course.CourseName)}));
  const matchBySpacelessName=(nameText:string)=>{
    const flat=spaceless(nameText);
    if(flat.length<6)return null;
    const contained=spacelessCatalogue.filter(entry=>entry.flat.length>=6&&(entry.flat.includes(flat)||flat.includes(entry.flat)));
    if(contained.length===1)return contained[0].item.course;
    let best:{course:AdCourse;ratio:number}|null=null,second=0;
    for(const entry of spacelessCatalogue){
      if(!entry.flat)continue;
      const distance=editDistance(flat,entry.flat);
      const ratio=1-distance/Math.max(flat.length,entry.flat.length);
      if(!best||ratio>best.ratio){second=best?.ratio||0;best={course:entry.item.course,ratio};}
      else if(ratio>second)second=ratio;
    }
    return best&&best.ratio>=0.66&&best.ratio-second>=0.08?best.course:null;
  };
  const matchCourse=(code:string,nameText:string)=>{
    if(isHeaderLine(code)||isHeaderLine(nameText))return null;
    if(code){
      const exact=catalogue.find(item=>item.digits===code);
      if(exact)return exact.course;
      if(departmentPrefix&&code.length>=3){
        const rebuilt=departmentPrefix+code.slice(-3);
        const byPrefix=catalogue.find(item=>item.digits===rebuilt);
        if(byPrefix)return byPrefix.course;
      }
      const close=catalogue.filter(item=>item.digits.length===code.length&&editDistance(item.digits,code)<=1);
      if(close.length===1)return close[0].course;
      const tail=code.slice(-3);
      if(tails.get(tail)===1){
        const byTail=catalogue.find(item=>item.digits.endsWith(tail));
        if(byTail)return byTail.course;
      }
    }
    if(nameText.length>=5){
      const ranked=catalogue.map(item=>({item,score:fuzzyNameScore(nameText,item.course.CourseName)})).sort((a,b)=>b.score-a.score);
      if(ranked[0]&&ranked[0].score>=0.56)return ranked[0].item.course;
      const flat=matchBySpacelessName(nameText);
      if(flat)return flat;
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
  for(let i=0;i<firstPass.length;i++){
    if(firstPass[i].course)continue;
    const previous=firstPass[i-1]?.course,next=firstPass[i+1]?.course;
    if(previous&&next&&previous.AdCourseId===next.AdCourseId)firstPass[i].course=previous;
  }
  const rows:ParsedScheduleRow[]=[];const issues:string[]=[];let order=startOrder;
  for(const {grid,course} of firstPass){
    const combinedCheck = `${grid.code} ${grid.scode} ${grid.courseText} ${grid.instructorText}`;
    if(isHeaderLine(combinedCheck)||isHeaderLine(grid.courseText)||isHeaderLine(grid.code))continue;
    const flags = parseDays(grid.days) || parseDays(grid.courseText) || parseDays(grid.instructorText) || parseDays(`${grid.code} ${grid.courseText}`) || EMPTY_DAYS;
    const instructorHit=matchInstructorName(grid.instructorText||`${grid.courseText} ${grid.code}`,instructors,preferredInstructorIds)
      ||matchInstructorName(grid.instructorText,instructors,preferredInstructorIds);
    const cleanBuilding = cleanBuildingCode(grid.building) || cleanBuildingCode(grid.hall);
    const cleanHall = cleanHallCode(grid.hall) || cleanHallCode(grid.building);

    if(!course){
      const rawLabel = grid.courseText || grid.code || "";
      if(isHeaderLine(rawLabel)||isHeaderLine(grid.courseText)||isHeaderLine(grid.code))continue;
      const hasScheduleData = Boolean(grid.start || grid.days || (grid.scode && Number(grid.scode)>=500) || grid.reference || (grid.code && grid.code.length >= 3));
      if(!hasScheduleData || !rawLabel || rawLabel.length < 3) {
        continue;
      }
      rows.push({
        sourceOrder:order++,
        referenceNumber:grid.reference,
        AdCourseId:0,AdCourseName:rawLabel,SCode:grid.scode,
        AdInstructorId:instructorHit?.AdInstructorId||0,
        TotalHours:3,TotalUnits:3,
        CourseHours:3,CourseCredit:3,
        fcontacthours:3,fcredithours:3,
        ...flags,
        fstarttime:grid.start,fendtime:grid.end,
        AdRoomCode:cleanBuilding,AdRoomHall:cleanHall,
        ocrLine:[grid.code,grid.scode,grid.courseText,grid.days,`${grid.start}-${grid.end}`,cleanBuilding,cleanHall,grid.instructorText].filter(Boolean).join(" | "),
        sourceInstructorText:instructorHit?.AdInstructorName||grid.instructorText,
      });
      issues.push(`صف «${rawLabel}» شعبة ${grid.scode||"—"}: لم يتم العثور على رمز المقرر في كتالوج القسم تلقائياً — يرجى اختياره من القائمة`);
      if(!grid.start)issues.push(`صف «${rawLabel}» شعبة ${grid.scode||"—"}: لم أتعرف على الوقت`);
      if(!Object.values(flags).some(Boolean))issues.push(`صف «${rawLabel}» شعبة ${grid.scode||"—"}: لم أتعرف على الأيام`);
      if(!instructorHit&&grid.instructorText&&!grid.instructorText.includes("هيئة")&&!grid.instructorText.includes("هيئه"))
        issues.push(`صف «${rawLabel}» شعبة ${grid.scode||"—"}: لم أتعرف على أستاذ المقرر («${grid.instructorText}»)`);
      if(!cleanBuilding&&!cleanHall)issues.push(`صف «${rawLabel}» شعبة ${grid.scode||"—"}: لم أتعرف على المبنى والقاعة`);
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
      sourceInstructorText:instructorHit?.AdInstructorName||grid.instructorText,
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

export function parseScheduleTable(pages:OcrPage[],courses:AdCourse[],instructors:AdInstructor[],preferredInstructorIds?:Set<number>){
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
      const parsed=parseGridRows(page.gridRows,activeCourses,instructors,order,preferredInstructorIds);
      rows.push(...parsed.rows);issues.push(...parsed.issues);order=parsed.order;scanned+=page.gridRows.length;
    }
  }
  if(rows.length){
    // Renumber sections sequentially per course (501, 502, 503...)
    const counters = new Map<number, number>();
    for (const row of rows) {
      const courseId = Number(row.AdCourseId || 0);
      if (courseId) {
        const next = (counters.get(courseId) || 500) + 1;
        counters.set(courseId, next);
        row.SCode = String(next);
      } else {
        row.SCode = "501";
      }
    }
    return{rows,issues:[...new Set(issues)],lines:scanned};
  }

  const activityTokens=["محاضرة","مختبر","تمارين","كلينيكي","عملي","نظري","ورشة","تدريب","بحث"];

  for(const page of pages)for(const row of page.rows){
    scanned++;
    const cells=row.cells,line=row.line;
    if(line.replace(/[^ء-يa-zA-Z0-9]/g,"").length<6)continue;
    if(isHeaderLine(line))continue;
    const normalized=fold(line);

    const rowDigitsSpaced=cells.map(cell=>toAscii(cell.text)).join(" ");
    const digitRuns=(rowDigitsSpaced.match(/\d+/g)||[]);

    // Rule 1: Course code extraction - match strictly against department courses
    let matchedCourse:AdCourse|null=null;
    // 1. Check exact code match or 3-digit tail match (e.g. 0101102 ends in 102)
    for(const item of catalogue){
      if(!item.digits)continue;
      const code=item.digits;
      const tail3=code.slice(-3);
      if(digitRuns.some(run=>run===code||(run.length>=5&&run.endsWith(code))||(tail3.length===3&&run.endsWith(tail3)&&run.length>=3&&run.length<=7))){
        matchedCourse=item.course;
        break;
      }
    }
    // 2. Check full/folded Arabic course name in line or cells
    if(!matchedCourse){
      for(const item of catalogue){
        if(item.folded.length>=4&&normalized.includes(item.folded)){
          matchedCourse=item.course;
          break;
        }
      }
    }
    // 3. Fuzzy name match against department courses only
    if(!matchedCourse){
      const ranked=catalogue.map(item=>({item,score:fuzzyNameScore(line,item.course.CourseName)})).sort((a,b)=>b.score-a.score);
      if(ranked[0]&&ranked[0].score>=0.65){
        matchedCourse=ranked[0].item.course;
      }
    }

    if(!matchedCourse){
      const rawCourseText = cells.find(c => /[ء-ي]/.test(c.text) && !activityTokens.some(act => c.text.includes(act)))?.text || line;
      // Extract time, days, room, instructor for unmapped row
      let time:{start:string;end:string}|null=null;
      for(const cell of cells){const found=timePair(cell.text);if(found){time=found;break;}}
      if(!time)time=timePair(line);

      let flags:typeof EMPTY_DAYS|null=null;
      for(const cell of cells){const found=parseDays(cell.text);if(found){flags=found;break;}}
      if(!flags)flags=parseDays(line);

      let roomCode="",roomHall="";
      for(const cell of cells){
        const text=toAscii(cell.text).trim();
        const b=cleanBuildingCode(text);if(b&&!roomCode)roomCode=b;
        const h=cleanHallCode(text);if(h&&!roomHall)roomHall=h;
      }
      if(!roomCode)roomCode=cleanBuildingCode(line);
      if(!roomHall)roomHall=cleanHallCode(line);

      const reference=digitRuns.find(value=>/^\d{4,8}$/.test(value))||"";
      const section=digitRuns.find(v=>Number(v)>=500&&Number(v)<=999)||"501";
      const instructorHit=matchInstructorName(line,instructors,preferredInstructorIds);

      rows.push({
        sourceOrder:order++,referenceNumber:reference,
        AdCourseId:0,AdCourseName:rawCourseText,SCode:section||"501",
        AdInstructorId:instructorHit?.AdInstructorId||0,
        TotalHours:3,TotalUnits:3,CourseHours:3,CourseCredit:3,
        fcontacthours:3,fcredithours:3,
        ...(flags||EMPTY_DAYS),
        fstarttime:time?.start||"",fendtime:time?.end||"",
        AdRoomCode:roomCode,AdRoomHall:roomHall,ocrLine:line,
        sourceInstructorText:instructorHit?.AdInstructorName||"",
      });
      issues.push(`صف «${rawCourseText}»: لم يتم العثور على رمز المقرر في كتالوج القسم تلقائياً — يرجى اختياره من القائمة`);
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

    // Rule 4 & 5: Room and Building extraction (take last 3 e.g. B07)
    let roomCode="",roomHall="";
    for(const cell of cells){
      const text=toAscii(cell.text).trim();
      const b=cleanBuildingCode(text);
      if(b&&!roomCode) roomCode=b;
      const h=cleanHallCode(text);
      if(h&&!roomHall) roomHall=h;
    }
    if(!roomCode){
      roomCode=cleanBuildingCode(line);
    }
    if(!roomHall){
      roomHall=cleanHallCode(line);
    }

    // Section and Reference (CRN) extraction
    const courseCode=toAscii(String(matchedCourse.CourseCode||"")).replace(/\D/g,"");
    const reference=digitRuns.find(value=>/^\d{4,8}$/.test(value)&&value!==courseCode&&value!==time?.start.replace(":","")&&value!==time?.end.replace(":",""))||"";
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
    const instructorHit=matchInstructorName(instructorCandidateText||line,instructors,preferredInstructorIds)
      ||matchInstructorName(line,instructors,preferredInstructorIds);

    rows.push({
      sourceOrder:order++,referenceNumber:reference,
      AdCourseId:matchedCourse.AdCourseId,AdCourseName:courseName,SCode:section,
      AdInstructorId:instructorHit?.AdInstructorId||0,
      TotalHours:matchedCourse.CourseHours,TotalUnits:matchedCourse.CourseCredit,
      CourseHours:matchedCourse.CourseHours,CourseCredit:matchedCourse.CourseCredit,
      fcontacthours:matchedCourse.CourseHours||3,fcredithours:matchedCourse.CourseCredit||3,
      ...(flags||EMPTY_DAYS),
      fstarttime:time?.start||"",fendtime:time?.end||"",
      AdRoomCode:roomCode,AdRoomHall:roomHall,ocrLine:line,sourceInstructorText:instructorHit?.AdInstructorName||instructorCandidateText,
    });

    if(!time)issues.push(`صف «${courseName}»: لم أتعرف على الوقت`);
    if(!flags)issues.push(`صف «${courseName}»: لم أتعرف على الأيام`);
    if(!instructorHit&&instructorCandidateText&&!instructorCandidateText.includes("هيئة")&&!instructorCandidateText.includes("هيئه"))
      issues.push(`صف «${courseName}» شعبة ${section||"—"}: لم أتعرف على أستاذ المقرر («${instructorCandidateText}»)`);
    if(!section)issues.push(`صف «${courseName}»: لم أتعرف على رقم الشعبة`);
    if(!roomCode&&!roomHall)issues.push(`صف «${courseName}»: لم أتعرف على المبنى والقاعة`);
  }

  // Renumber sections sequentially per course (501, 502, 503...)
  const counters = new Map<number, number>();
  for (const row of rows) {
    const courseId = Number(row.AdCourseId || 0);
    if (courseId) {
      const next = (counters.get(courseId) || 500) + 1;
      counters.set(courseId, next);
      row.SCode = String(next);
    } else {
      row.SCode = "501";
    }
  }

  if(!rows.length)issues.push("لم أتعرف على صفوف الجدول. تأكد أن الملف واضح وبنفس نموذج الجدول المعتمد.");
  return{rows,issues:[...new Set(issues)],lines:scanned};
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
