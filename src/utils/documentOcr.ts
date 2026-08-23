import type { AdCourse, AdInstructor } from "../types";

const toAscii=(value:string)=>String(value||"")
  .replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
  .replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
const fold=(value:string)=>toAscii(value).replace(/[ً-ْـ]/g,"").replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/[^ء-يa-zA-Z0-9: ]/g," ").replace(/\s+/g," ").trim().toLowerCase();

/** A cell as the scanner saw it: its text and where it sat on the page. */
export type OcrCell={text:string;x0:number;x1:number};
/** One physical table row, right-to-left, with the columns still apart. */
export type OcrRow={cells:OcrCell[];line:string;y:number};
export type OcrPage={rows:OcrRow[]};
export type Legibility={readable:boolean;confidence:number;charactersPerPage:number;reason:string};
export type OcrResult={pages:OcrPage[];text:string;pageCount:number;confidence:number;orientation:-1|0|1;legibility:Legibility};
export type OcrProgress=(stage:{phase:"render"|"orient"|"read";page:number;pages:number;message:string})=>void;

const MAX_PAGES=12;
/** A4 at ~300dpi. The old 157dpi render was the single largest cause of
 *  unreadable rows: Arabic table text at that size loses its dots. */
const TARGET_LONG_EDGE:number=3500;
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
    await page.render({canvasContext:surface.getContext("2d"),viewport}).promise;
    pages.push(surface.toBuffer("image/png"));
  }
  return pages;
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
  context.translate(surface.width/2,surface.height/2);
  context.rotate(quarterTurns*Math.PI/2);
  context.drawImage(image,-image.width/2,-image.height/2);
  return surface.toBuffer("image/png");
}

/**
 * How upright a page is, judged by what a timetable actually contains.
 *
 * Tesseract's own confidence cannot decide this: measured on a real CamScanner
 * scan it scored 48 vs 42 vs 34 across the three turns, and the winner even
 * flipped when the render resolution changed. Counting the marks only a real
 * timetable carries — `1650 - 1530` times and `012B09` building codes — is
 * decisive instead, because a sideways page yields almost none of them.
 */
const orientationScore=(text:string)=>{
  const ascii=toAscii(text).replace(/[Oo]/g,"0");
  const times=(ascii.match(/\b[0-2]\d[0-5]\d\s*[-–—]\s*[0-2]\d[0-5]\d\b/g)||[]).length;
  const rooms=(ascii.match(/\b\d{3}[A-Za-z]\d{2}\b/g)||[]).length;
  const arabic=(text.match(/[ء-ي]/g)||[]).length;
  return times*40+rooms*25+arabic;
};

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
      // Only genuinely long runs count: a straightened rule is one of them.
      if(best>probe.width*0.35)total+=best;
    }
    return total;
  };
  // Coarse sweep, then a fine one around the winner: ten measurements instead
  // of twenty-one for the same quarter-degree answer.
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
function tableFromWords(words:Word[],columns:number[]):OcrRow[]{
  if(!words.length)return[];
  const heights=words.map(word=>word.y1-word.y0).sort((a,b)=>a-b);
  const lineHeight=Math.max(8,heights[Math.floor(heights.length/2)]||12);
  const ordered=[...words].sort((a,b)=>(a.y0+a.y1)/2-(b.y0+b.y1)/2);
  const clusterBy=(tolerance:number)=>{
    const out:Word[][]=[];let current:Word[]=[],centre=Number.NaN;
    for(const word of ordered){
      const middle=(word.y0+word.y1)/2;
      if(!current.length||Math.abs(middle-centre)<=tolerance){current.push(word);centre=Number.isNaN(centre)?middle:(centre*current.length+middle)/(current.length+1);}
      else{out.push(current);current=[word];centre=middle;}
    }
    if(current.length)out.push(current);
    return out;
  };

  /**
   * Rows are found by the table's own pitch, not by the height of a glyph.
   *
   * A tolerance derived from letter height is far smaller than the distance
   * between two table rows, and on a wide table that split one physical row in
   * half: the left side (instructor, days, time) became one row while the right
   * side (course number, reference, section, name) became another or was lost —
   * which is why the course number, the most reliable key on the page, never
   * reached the parser. Measuring the gap between first-pass clusters gives the
   * real row spacing, and half of that pulls the two ends of a row together
   * while still keeping neighbouring rows apart.
   *
   * The printed rules were tried for this and reverted: they are too faint on a
   * scan to be found one per row, so several rows collapsed into one band.
   */
  const first=clusterBy(lineHeight*0.62);
  const centres=first.map(group=>group.reduce((sum,w)=>sum+(w.y0+w.y1)/2,0)/group.length);
  const gaps=centres.slice(1).map((value,index)=>value-centres[index]).filter(gap=>gap>lineHeight*0.4).sort((a,b)=>a-b);
  const pitch=gaps.length?gaps[Math.floor(gaps.length/2)]:lineHeight*1.4;
  const lines=clusterBy(Math.max(lineHeight*0.62,Math.min(pitch*0.45,lineHeight*2.2)));

  const columnOf=(x:number)=>{let index=0;while(index<columns.length&&columns[index]<x)index++;return index;};

  const rows:OcrRow[]=[];
  for(const line of lines){
    // Right to left: the first cell of an Arabic table is the rightmost one.
    const sorted=[...line].sort((a,b)=>b.x1-a.x1);
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
      // No printed grid: fall back to cutting on unusually wide gaps.
      const gaps=sorted.slice(1).map((word,index)=>sorted[index].x0-word.x1).filter(gap=>gap>0).sort((a,b)=>a-b);
      const typical=gaps.length?gaps[Math.floor(gaps.length/2)]:lineHeight*0.4;
      const cut=Math.max(lineHeight*0.55,typical*2.1);
      let bucket:Word[]=[];
      const flush=()=>{
        if(!bucket.length)return;
        cells.push({text:bucket.map(word=>word.text).join(" ").replace(/\s+/g," ").trim(),x0:Math.min(...bucket.map(w=>w.x0)),x1:Math.max(...bucket.map(w=>w.x1))});
        bucket=[];
      };
      for(let index=0;index<sorted.length;index++){
        if(index>0&&sorted[index-1].x0-sorted[index].x1>cut)flush();
        bucket.push(sorted[index]);
      }
      flush();
    }
    const filtered=cells.filter(cell=>cell.text.length>0);
    if(filtered.length)rows.push({cells:filtered,line:filtered.map(cell=>cell.text).join(" | "),y:(line[0].y0+line[0].y1)/2});
  }
  return rows.sort((a,b)=>a.y-b.y).slice(0,4000);
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
  const {createWorker}=await import("tesseract.js");
  const probeImages=await imagePages(input,mime,PROBE_LONG_EDGE,onProgress);
  if(!probeImages.length)throw new Error("تعذر تحويل صفحات الملف إلى صور قابلة للقراءة");

  onProgress?.({phase:"orient",page:1,pages:probeImages.length,message:"تحديد اتجاه الصفحة"});
  const probe=await createWorker("ara+eng");
  let orientation:-1|0|1=0;
  try{
    let best=-Infinity;
    for(const turn of[-1,0,1]as const){
      const result:any=await probe.recognize(await rotateImage(probeImages[0],turn));
      const score=orientationScore(String(result?.data?.text||""));
      if(score>best){best=score;orientation=turn;}
    }
  }finally{await probe.terminate();}

  const images=PROBE_LONG_EDGE===TARGET_LONG_EDGE?probeImages:await imagePages(input,mime,TARGET_LONG_EDGE,onProgress);
  const pages:OcrPage[]=new Array(images.length);
  const texts:string[]=new Array(images.length).fill("");
  const scores:number[]=new Array(images.length).fill(0);
  let done=0;

  /* Pages are independent, so they are read by a small pool rather than one
     after another. Four workers is where added parallelism stops paying for
     the memory each Tesseract instance holds. */
  const lanes=Math.min(4,images.length);
  const queue=images.map((_,index)=>index);
  await Promise.all(Array.from({length:lanes},async()=>{
    const worker=await createWorker("ara+eng");
    try{
      for(;;){
        const index=queue.shift();
        if(index===undefined)break;
        const grid=await spreadColumns(await deskew(await rotateImage(images[index],orientation)));
        const result:any=await worker.recognize(grid.image,{},{text:true,blocks:true});
        const surface=result?.data||{};
        texts[index]=String(surface.text||"");
        scores[index]=Number(surface.confidence||0);
        pages[index]={rows:tableFromWords(wordsOf(surface),grid.columns)};
        done++;
        onProgress?.({phase:"read",page:done,pages:images.length,message:`قراءة الصفحة ${done} من ${images.length}`});
      }
    }finally{await worker.terminate();}
  }));

  const text=texts.join("\n\n--- PAGE ---\n\n");
  const confidence=Math.round(scores.reduce((sum,value)=>sum+value,0)/Math.max(1,scores.length));
  return{
    pages:pages.map(page=>page||{rows:[]}),
    text,
    pageCount:images.length,
    confidence,
    orientation,
    legibility:judgeLegibility(text,images.length,confidence),
  };
}

const minutesOf=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3));
/**
 * `1650 - 1530`, `08:00-09:20`, or a pair with the next column stuck to it.
 *
 * The trailing word boundary was the reason no time ever parsed: the building
 * code sits hard against the closing digits, so a real `1350 - 1230` reaches
 * here as `1350-1230012B09`. Validating the hours and minutes is the check that
 * makes dropping the boundary safe.
 */
/* A zero at the end of a time is the character this scan loses most: measured
   on the Authority's own export, `1000` came back as `100¢`, `1100` as `110(`
   and `1200` as `120¢`. The substitution is only attempted inside a time cell
   and the result still has to be a real hour and minute, so a wrong guess
   cannot survive into the schedule. */
const repairClockDigits=(value:string)=>value.replace(/[Oo°QDﻩ]/g,"0").replace(/[¢()\[\]{}|!lI]/g,"0");
const timePair=(text:string)=>{
  const ascii=repairClockDigits(toAscii(text));
  const compact=[...ascii.matchAll(/([0-2]\d[0-5]\d)\s*[-–—]\s*([0-2]\d[0-5]\d)/g)][0];
  const pieces=compact
    ?[compact[1],compact[2]].map(value=>`${value.slice(0,2)}:${value.slice(2)}`)
    :[...ascii.matchAll(/\b([01]?\d|2[0-3])[:٫.]([0-5]\d)\b/g)].map(match=>`${String(match[1]).padStart(2,"0")}:${match[2]}`);
  if(pieces.length<2)return null;
  const[a,b]=pieces;
  const valid=(value:string)=>Number(value.slice(0,2))<24&&Number(value.slice(3))<60;
  if(!valid(a)||!valid(b))return null;
  return minutesOf(a)<=minutesOf(b)?{start:a,end:b}:{start:b,end:a};
};

const DAY_FIELDS=["fsunday","fmonday","ftuesday","fwednesday","fthursday"]as const;
const EMPTY_DAYS={fsunday:false,fmonday:false,ftuesday:false,fwednesday:false,fthursday:false};
/** The «الأيام» column holds bare day numbers — `4 2`, `5 3 1`, `5 4 3 2 1`. */
const dayFlagsFromCell=(text:string)=>{
  const ascii=toAscii(text);
  if(!/^[\s\d]+$/.test(ascii)||!/\d/.test(ascii))return null;
  const numbers=ascii.match(/\d/g)||[];
  if(!numbers.length||numbers.some(digit=>digit==="0"||Number(digit)>5))return null;
  const flags={...EMPTY_DAYS};
  for(const digit of numbers)flags[DAY_FIELDS[Number(digit)-1]]=true;
  return flags;
};
const dayFlagsFromText=(text:string)=>{
  const value=fold(text);
  const flags={
    fsunday:/الاحد|احد/.test(value),fmonday:/الاثنين|اثنين/.test(value),ftuesday:/الثلاثاء|ثلاثاء/.test(value),
    fwednesday:/الاربعاء|اربعاء/.test(value),fthursday:/الخميس|خميس/.test(value),
  };
  return Object.values(flags).some(Boolean)?flags:null;
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
    const found=lineTokens.some(candidate=>candidate===token||(Math.min(candidate.length,token.length)>=4&&editDistance(candidate,token)<=Math.max(1,Math.floor(token.length*.28))));
    if(found)earned+=weight;
  }
  return total?earned/total:0;
};

export type ParsedScheduleRow={
  sourceOrder:number;referenceNumber:string;AdCourseId:number;AdCourseName:string;SCode:string;AdInstructorId:number;
  fsunday:boolean;fmonday:boolean;ftuesday:boolean;fwednesday:boolean;fthursday:boolean;
  fstarttime:string;fendtime:string;AdRoomCode:string;AdRoomHall:string;ocrLine:string;
};

/**
 * Best-effort table parser for the Authority's scanned timetable.
 *
 * It reads each cell on its own rather than mining a flattened line, and it
 * matches names against the real catalogue instead of inventing identifiers.
 * Anything it cannot resolve is returned as an issue and never published.
 */
export function parseScheduleTable(pages:OcrPage[],courses:AdCourse[],instructors:AdInstructor[]){
  const courseNeedles=courses.map(course=>({course,folded:fold(course.CourseName),code:fold(course.CourseCode)})).sort((a,b)=>b.folded.length-a.folded.length);
  const instructorNeedles=instructors.map(person=>({person,folded:fold(person.AdInstructorName)})).sort((a,b)=>b.folded.length-a.folded.length);
  /* A short course number is only a safe key when it is unambiguous inside this
     department's own catalogue. */
  const uniqueTails:Record<number,Set<string>>={};
  for(const tail of [4,3]){
    const seen=new Map<string,number>();
    for(const item of courseNeedles){
      const code=toAscii(String(item.course.CourseCode||"")).replace(/\D/g,"");
      if(code.length<tail)continue;
      const suffix=code.slice(-tail);
      seen.set(suffix,(seen.get(suffix)||0)+1);
    }
    uniqueTails[tail]=new Set([...seen.entries()].filter(([,count])=>count===1).map(([suffix])=>suffix));
  }
  const rows:ParsedScheduleRow[]=[];const issues:string[]=[];let order=0,scanned=0;

  for(const page of pages)for(const row of page.rows){
    scanned++;
    const cells=row.cells,line=row.line;
    if(line.replace(/[^ء-يa-zA-Z0-9]/g,"").length<8)continue;
    const normalized=fold(line);

    /* The course code is the only key on this page that cannot drift.
       It is printed as the department number followed immediately by the course
       number in one cell — 0101 + 1156 — so the whole row's digits are searched
       for it, tolerating one lost character because a scan routinely drops one.
       A name is matched only when no code was legible: two courses can share
       almost every word of their title, but never a code. */
    const rowDigitsSpaced=cells.map(cell=>toAscii(cell.text)).join(" ");
    const rowDigits=rowDigitsSpaced.replace(/\D/g,"");
    /**
     * Three ways to recognise a course by its number, strongest first.
     *
     * The sheet prints the department number and the course number joined in
     * one cell — 0101 then 1156 — so the full code is searched first, then the
     * course number alone, then its last three digits, which is how the
     * department refers to a course day to day. The short forms are only
     * trusted when exactly one course in this department ends that way; a
     * three-digit tail is otherwise indistinguishable from a section number.
     */
    const codeMatch=(code:string)=>{
      if(!code||rowDigits.length<3)return 0;
      if(code.length>=6){
        if(rowDigits.includes(code))return 1;
        for(let at=0;at+code.length-1<=rowDigits.length;at++)
          for(const width of [code.length,code.length-1]){
            const window=rowDigits.slice(at,at+width);
            if(window.length===width&&editDistance(window,code)<=1)return .97;
          }
      }
      for(const tail of [4,3]){
        if(code.length<tail)continue;
        const suffix=code.slice(-tail);
        if(!uniqueTails[tail]?.has(suffix))continue;
        if(new RegExp(`(^|\\D)${suffix}(\\D|$)`).test(rowDigitsSpaced))return tail===4?.94:.9;
      }
      return 0;
    };
    const ranked=courseNeedles.map(item=>{
      const byCode=item.code?codeMatch(toAscii(String(item.course.CourseCode||"")).replace(/\D/g,"")):0;
      if(byCode)return{item,score:byCode,viaCode:true};
      const direct=item.folded.length>=5&&normalized.includes(item.folded);
      const perCell=cells.reduce((best,cell)=>Math.max(best,fuzzyNameScore(cell.text,item.course.CourseName)),0);
      return{item,score:direct?1:Math.max(perCell,fuzzyNameScore(line,item.course.CourseName)),viaCode:false};
    }).sort((a,b)=>(Number(b.viaCode)-Number(a.viaCode))||b.score-a.score);
    const courseHit=ranked[0]?.score>=.56?ranked[0].item:undefined;
    if(!courseHit)continue;
    const courseName=courseHit.course.CourseName;

    // Each field is read from the cell that carries it, so neighbouring
    // columns can no longer bleed into one another.
    let time:{start:string;end:string}|null=null;
    for(const cell of cells){const found=timePair(cell.text);if(found){time=found;break;}}
    if(!time)time=timePair(line);

    let flags:typeof EMPTY_DAYS|null=null;
    for(const cell of cells){const found=dayFlagsFromCell(cell.text);if(found){flags=found;break;}}
    if(!flags)flags=dayFlagsFromText(line);

    /* The letter in a building code must be read as a letter.
       Restoring it from a digit was tried — Tesseract does turn B into 8 — but
       the pattern then matched any six-digit run in the row and invented codes
       like 315O41. A field left empty is reviewed; a field filled with a
       plausible wrong answer is published. */
    /* Building and hall are read independently. They live in separate columns
       and the scan loses them separately — on a clean export the hall (`F13`)
       came through on every row while the building (`012B09`) was dropped, and
       requiring the pair meant discarding the half that was actually read. */
    let roomCode="",roomHall="";
    for(let index=0;index<cells.length&&!roomCode;index++){
      const value=toAscii(cells[index].text).replace(/\s+/g,"");
      const building=value.match(/(\d{3})([A-Za-z])(\d{2})/);
      if(!building)continue;
      roomCode=`${building[1]}${building[2].toUpperCase()}${building[3]}`;
      const rest=value.slice((building.index||0)+building[0].length);
      const inline=toAscii(rest).replace(/\s+/g,"").match(/^([A-Za-z]\d{1,3})$/);
      if(inline)roomHall=inline[1].toUpperCase();
    }
    if(!roomHall)for(const cell of cells){
      const hall=toAscii(cell.text).replace(/\s+/g,"").match(/^([A-Za-z]\d{1,3})$/);
      if(hall){roomHall=hall[1].toUpperCase();break;}
    }

    /* The reference and section columns often arrive fused with the course
       code, so both are read from the digit runs of the row rather than from
       a cell that happens to hold nothing else. */
    const courseCode=toAscii(String(courseHit.course.CourseCode||"")).replace(/\D/g,"");
    const runs=cells.flatMap(cell=>toAscii(cell.text).match(/\d+/g)||[]);
    const reference=runs.find(value=>value.length===5)||"";
    const section=runs.find(value=>value.length===3&&value!==courseCode.slice(-3))||"";

    const instructorRanked=instructorNeedles.map(item=>{
      const perCell=cells.reduce((best,cell)=>Math.max(best,fuzzyNameScore(cell.text,item.person.AdInstructorName)),0);
      return{item,score:item.folded.length>=5&&normalized.includes(item.folded)?1:perCell};
    }).sort((a,b)=>b.score-a.score);
    const instructorHit=instructorRanked[0]?.score>=.55?instructorRanked[0].item:undefined;

    rows.push({
      sourceOrder:order++,referenceNumber:reference,
      AdCourseId:courseHit.course.AdCourseId,AdCourseName:courseName,SCode:section,
      AdInstructorId:instructorHit?.person.AdInstructorId||0,
      ...(flags||EMPTY_DAYS),
      fstarttime:time?.start||"",fendtime:time?.end||"",
      AdRoomCode:roomCode,AdRoomHall:roomHall,ocrLine:line,
    });

    if(!time)issues.push(`صف «${courseName}»: لم أتعرف على الوقت`);
    if(!flags)issues.push(`صف «${courseName}»: لم أتعرف على الأيام`);
    if(!instructorHit)issues.push(`صف «${courseName}»: لم أتعرف على أستاذ المقرر`);
    if(!section)issues.push(`صف «${courseName}»: لم أتعرف على رقم الشعبة`);
    if(!roomCode&&!roomHall)issues.push(`صف «${courseName}»: لم أتعرف على المبنى والقاعة`);
    else if(!roomCode)issues.push(`صف «${courseName}»: قرأت القاعة ${roomHall} ولم أتعرف على المبنى`);
    else if(!roomHall)issues.push(`صف «${courseName}»: قرأت المبنى ${roomCode} ولم أتعرف على القاعة`);
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
