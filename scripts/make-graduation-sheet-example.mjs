/* Generates public/graduation-sheet-example.jpg — the visual example shown on
   the public graduate survey. It is SYNTHETIC by construction: a fictional
   student («طالب تجريبي»), a checksum-valid but invented civil ID, and a
   watermark saying the data is illustrative. Never replace this asset with a
   screenshot of a real student portal (name + civil ID are personal data).
   Run: node scripts/make-graduation-sheet-example.mjs */
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const weight of [400, 600, 700]) {
  GlobalFonts.registerFromPath(path.join(root, `public/fonts/plex-arabic-arabic-${weight}.woff2`), "PlexArabic");
  GlobalFonts.registerFromPath(path.join(root, `public/fonts/plex-arabic-latin-${weight}.woff2`), "PlexLatin");
  GlobalFonts.registerFromPath(path.join(root, `public/fonts/plex-arabic-latin-ext-${weight}.woff2`), "PlexLatinExt");
}

export const SYNTHETIC_EXAMPLE = Object.freeze({
  name: "طالب تجريبي",
  civil: "300010100122",
  program: "تربية خاصة — نموذج",
  required: "134",
  passed: "114",
});

const W = 945, H = 640;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#f4f6f8"; ctx.fillRect(0, 0, W, H);
ctx.fillStyle = "#1f4e79"; ctx.fillRect(0, 0, W, 92);
ctx.direction = "rtl"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
ctx.fillStyle = "#ffffff"; ctx.font = "700 30px PlexArabic, PlexLatin, PlexLatinExt";
ctx.fillText("الهيئة العامة للتعليم التطبيقي والتدريب", W - 36, 36);
ctx.font = "400 20px PlexArabic, PlexLatin, PlexLatinExt";
ctx.fillText("بوابة الطالب · الخطة الدراسية", W - 36, 70);

ctx.fillStyle = "#ffffff"; ctx.strokeStyle = "#c9d3dd"; ctx.lineWidth = 2;
ctx.fillRect(36, 124, W - 72, 440); ctx.strokeRect(36, 124, W - 72, 440);

const rows = [
  ["اسم الطالب", SYNTHETIC_EXAMPLE.name],
  ["الرقم المدني", SYNTHETIC_EXAMPLE.civil],
  ["البرنامج", SYNTHETIC_EXAMPLE.program],
  ["الوحدات المطلوبة", SYNTHETIC_EXAMPLE.required],
  ["الوحدات المجتازة", SYNTHETIC_EXAMPLE.passed],
];
rows.forEach(([label, value], index) => {
  const y = 176 + index * 80;
  if (index % 2 === 0) { ctx.fillStyle = "#eef3f8"; ctx.fillRect(38, y - 38, W - 76, 76); }
  ctx.fillStyle = "#44546a"; ctx.font = "600 24px PlexArabic, PlexLatin, PlexLatinExt"; ctx.textAlign = "right";
  ctx.fillText(label, W - 70, y);
  ctx.fillStyle = "#111827"; ctx.font = "700 28px PlexArabic, PlexLatin, PlexLatinExt";
  ctx.fillText(value, W - 330, y);
});

ctx.save();
ctx.translate(W / 2, H / 2 + 40); ctx.rotate(-0.32);
ctx.textAlign = "center"; ctx.fillStyle = "rgba(200, 30, 30, 0.18)"; ctx.font = "700 64px PlexArabic, PlexLatin, PlexLatinExt";
ctx.fillText("نموذج توضيحي — بيانات وهمية", 0, 0);
ctx.restore();

ctx.fillStyle = "#7a2020"; ctx.font = "600 20px PlexArabic, PlexLatin, PlexLatinExt"; ctx.textAlign = "center";
ctx.fillText("نموذج توضيحي ببيانات وهمية — ارفع صفحتك الرسمية التي تُظهر الرقم المدني والبرنامج والوحدات", W / 2, 600);

const out = path.join(root, "public/graduation-sheet-example.jpg");
writeFileSync(out, canvas.toBuffer("image/jpeg", 88));
console.log("wrote", path.relative(root, out));
