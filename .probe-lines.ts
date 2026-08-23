import { readFileSync } from "fs";
import { ocrDocument } from "./src/utils/documentOcr";
async function main(){
  const out=await ocrDocument(readFileSync(process.argv[2]),"application/pdf");
  const rows=out.pages[0]?.rows||[];
  console.log("rows:",rows.length);
  for(let i=0;i<rows.length;i++){
    const r=rows[i];
    const xs=r.cells.map(c=>Math.round(c.x0));
    console.log(`#${i} y=${r.y} cells=${r.cells.length} xrange=[${Math.min(...xs)}..${Math.max(...r.cells.map(c=>Math.round(c.x1)))}] :: ${r.line.slice(0,110)}`);
  }
}
main().catch(e=>{console.error(e);process.exit(1)});
