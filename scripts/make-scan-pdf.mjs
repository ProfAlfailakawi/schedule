/* يبني PDF ممسوحاً (صورة JPEG لكل صفحة) من صور كشف — لاختبار مسار PDF الحقيقي
   بلا مكتبة: node scripts/make-scan-pdf.mjs out.pdf page1.jpg page2.jpg … */
import fs from "fs";
const [out, ...pages] = process.argv.slice(2);
const jpegSize = buf => { let i = 2; while (i < buf.length) { if (buf[i] !== 0xff) { i++; continue; } const m = buf[i + 1]; if (m >= 0xc0 && m <= 0xc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }; i += 2 + buf.readUInt16BE(i + 2); } throw new Error("not a JPEG"); };
const chunks = []; const offsets = []; let length = 0;
const push = data => { const b = Buffer.isBuffer(data) ? data : Buffer.from(data, "latin1"); chunks.push(b); length += b.length; };
const obj = (id, body) => { offsets[id] = length; push(`${id} 0 obj\n`); push(body); push("\nendobj\n"); };
push("%PDF-1.4\n");
const n = pages.length, kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${n} >>`);
pages.forEach((file, i) => {
  const jpg = fs.readFileSync(file), { w, h } = jpegSize(jpg), id = 3 + i * 3;
  const pw = 842, ph = Math.round(842 * h / w), content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`);
  offsets[id + 1] = length; push(`${id + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`); push(jpg); push("\nendstream\nendobj\n");
  obj(id + 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
});
const xref = length, total = 3 + n * 3;
push(`xref\n0 ${total}\n0000000000 65535 f \n`);
for (let i = 1; i < total; i++) push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
fs.writeFileSync(out, Buffer.concat(chunks));
