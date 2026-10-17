/**
 * فكُّ الصورة وقياسُها. المكتبةُ (@napi-rs/canvas) موجودةٌ أصلاً في المشروع لقراءة الجداول الممسوحة.
 * إن لم تتوفر في بيئةٍ ما يُتخطّى الفحص ويُقال ذلك (لا يُرفض أحدٌ بسبب خللٍ عندنا)؛ وإن توفّرت وفشل فكُّ
 * الملف نفسه فالملفُّ تالف ويُرفض.
 */
import { measureQuality, qualityProblems, type QualityMetrics } from "../utils/adQuality";

export interface QualityReport { checked: boolean; metrics?: QualityMetrics; problems: string[] }

let lib: any = null;
let libFailed = false;
async function canvasLib(): Promise<any> {
  if (lib) return lib;
  if (libFailed) return null;
  try { lib = await import("@napi-rs/canvas"); return lib; }
  catch { libFailed = true; return null; }
}

export async function analyzeCreative(buf: Buffer): Promise<QualityReport> {
  const canvas = await canvasLib();
  if (!canvas) return { checked: false, problems: [] };
  let image: any;
  try { image = await canvas.loadImage(buf); }
  catch { return { checked: true, problems: ["تعذّر فكّ الصورة؛ الملف تالف أو غير مكتمل. صدّره من جديد."] }; }
  const w = Number(image.width), h = Number(image.height);
  if (!w || !h || w * h > 4_000_000) return { checked: true, problems: ["أبعاد الصورة غير صالحة."] };
  const surface = canvas.createCanvas(w, h);
  const ctx = surface.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const metrics = measureQuality(ctx.getImageData(0, 0, w, h).data, w, h);
  return { checked: true, metrics, problems: qualityProblems(metrics) };
}
