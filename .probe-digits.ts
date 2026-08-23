import { readFileSync } from "fs";
import { ocrDocument } from "./src/utils/documentOcr";
async function main(){
  const out=await ocrDocument(readFileSync(process.argv[2]),"application/pdf");
  const rows=out.pages[0]?.rows||[];
  console.log("rows:",rows.length);
  for(const r of rows.slice(4,20)){
    const digits=r.cells.map(c=>c.text).join(" ").replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).match(/\d+/g)||[];
    console.log(`runs=[${digits.join(",")}]`);
  }
}
main().catch(e=>{console.error(e);process.exit(1)});
