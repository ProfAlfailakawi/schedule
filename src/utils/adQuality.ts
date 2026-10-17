/**
 * ── فحصُ جودة الصورة الإعلانية ────────────────────────────────────────────────────
 *
 * المقاسُ والوزنُ لا يكفيان: صورةٌ فارغة أو باهتة أو شفافة تمرّ منهما وتُحرج صاحبها. هنا
 * نقيس من البكسلات نفسها (RGBA) أربعة أشياء، ونُرجع أسباب الرفض بالعربية:
 *
 *   الإعتام      نسبة البكسلات غير الشفافة.
 *   الفراغ       أكبر لونٍ يغطّي كم من الصورة (لونٌ واحد = لا محتوى).
 *   التباين      نسبة سطوع الفاتح إلى الداكن (WCAG) بين المئين ٥ و٩٥؛ تحت ٢ لا يُقرأ نصٌّ.
 *   التفاصيل     نسبة البكسلات على حوافّ واضحة؛ لا حوافّ = لا نصّ ولا أشكال.
 *
 * دالةٌ نقيّة قابلة للاختبار بلا مكتبات؛ فكُّ الصورة نفسه في server/adQuality.
 */
export interface QualityMetrics {
  opaque: number;
  dominant: number;
  contrast: number;
  edges: number;
  stdev: number;
}

export const QUALITY_LIMITS = { minOpaque: 0.9, maxDominant: 0.97, minContrast: 2, minEdges: 0.004 } as const;

const lin = (c: number): number => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const LIN = Array.from({ length: 256 }, (_, i) => lin(i));

export function measureQuality(rgba: ArrayLike<number>, width: number, height: number): QualityMetrics {
  const n = width * height;
  if (!n || rgba.length < n * 4) return { opaque: 0, dominant: 1, contrast: 1, edges: 0, stdev: 0 };
  const luma = new Float32Array(n);
  const rel = new Float32Array(n);
  const buckets = new Map<number, number>();
  let opaque = 0, sum = 0, sumSq = 0;
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2], a = rgba[i * 4 + 3];
    if (a >= 250) opaque++;
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    luma[i] = y; sum += y; sumSq += y * y;
    rel[i] = 0.2126 * LIN[r] + 0.7152 * LIN[g] + 0.0722 * LIN[b];
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  const mean = sum / n;
  const stdev = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  let top = 0;
  for (const count of buckets.values()) if (count > top) top = count;
  const sorted = Float32Array.from(rel).sort();
  const p5 = sorted[Math.floor(n * 0.05)], p95 = sorted[Math.min(n - 1, Math.floor(n * 0.95))];
  let edge = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const dx = x + 1 < width ? Math.abs(luma[i] - luma[i + 1]) : 0;
      const dy = y + 1 < height ? Math.abs(luma[i] - luma[i + width]) : 0;
      if (dx > 32 || dy > 32) edge++;
    }
  }
  return { opaque: opaque / n, dominant: top / n, contrast: (p95 + 0.05) / (p5 + 0.05), edges: edge / n, stdev };
}

const pct = (v: number) => `${Math.round(v * 100)}٪`;

/** أسبابُ الرفض بالعربية، مرتَّبةً من الأخطر؛ فارغةٌ إن صلحت الصورة. */
export function qualityProblems(m: QualityMetrics): string[] {
  const out: string[] = [];
  if (m.opaque < QUALITY_LIMITS.minOpaque) out.push(`الصورة شفافةٌ في معظمها (المعتم ${pct(m.opaque)} فقط)؛ ستظهر على خلفيةٍ لا تعرفها. استعمل خلفيةً معتمة.`);
  if (m.dominant > QUALITY_LIMITS.maxDominant) out.push(`الصورة شبه فارغة: لونٌ واحد يغطي ${pct(m.dominant)} منها. أضف النص أو الشعار أو العرض.`);
  else if (m.edges < QUALITY_LIMITS.minEdges) out.push("لا تفاصيل واضحة في الصورة (لا نصَّ ولا أشكالاً بحوافّ حادّة)؛ لن يفهم الطالبُ ما هو الإعلان.");
  if (m.dominant <= QUALITY_LIMITS.maxDominant && m.contrast < QUALITY_LIMITS.minContrast) {
    out.push(`التباين بين الفاتح والداكن ضعيف (${m.contrast.toFixed(1)} من ${QUALITY_LIMITS.minContrast} على الأقل)؛ النص لن يُقرأ على الجوال.`);
  }
  return out;
}
