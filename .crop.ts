import { readFileSync, writeFileSync } from "fs";
async function main(){
  const lib:any=await import("@napi-rs/canvas");
  for(const k of ["DOMMatrix","ImageData","Path2D"])if(!(globalThis as any)[k]&&lib[k])(globalThis as any)[k]=lib[k];
  const pdfjs:any=await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf=await pdfjs.getDocument({data:new Uint8Array(readFileSync(process.argv[2])),disableWorker:true,useSystemFonts:true}).promise;
  const page=await pdf.getPage(1); const vp=page.getViewport({scale:4});
  const full=lib.createCanvas(Math.ceil(vp.width),Math.ceil(vp.height));
  await page.render({canvasContext:full.getContext("2d"),viewport:vp}).promise;
  // rotate clockwise so the table is upright
  const rot=lib.createCanvas(full.height,full.width); const rx=rot.getContext("2d");
  rx.translate(rot.width/2,rot.height/2); rx.rotate(Math.PI/2); rx.drawImage(full,-full.width/2,-full.height/2);
  // crop the course-name band (right portion of the upright table)
  const x=Math.round(rot.width*0.60), w=Math.round(rot.width*0.30);
  const y=Math.round(rot.height*0.14), h=Math.round(rot.height*0.62);
  const crop=lib.createCanvas(w,h);
  crop.getContext("2d").drawImage(rot,x,y,w,h,0,0,w,h);
  writeFileSync(process.argv[3],crop.toBuffer("image/png"));
  console.log("crop",w+"x"+h);
}
main().catch(e=>{console.error(e);process.exit(1)});
