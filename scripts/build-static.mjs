#!/usr/bin/env node
/**
 * بعد `vite build` — يولّد:
 *   1) صفحة HTML ثابتة لكل مسار مع وسوم SEO و OG و Schema صحيحة
 *      (روبوتات واتساب/تويتر/غوغل لا تشغّل JS — هذا ما يجعلها تراك)
 *   2) sitemap.xml
 *   3) feed.xml  (RSS)
 *   4) 404.html
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import sharp from 'sharp'
import { buildSitemapDocuments, sitemapLocsFromDist } from './archive-sitemap.mjs'
import { isPublicArticle, readCanonicalCms } from './canonical-cms.mjs'
import { INDEXNOW_KEY } from './indexnow-ping.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = resolve(ROOT, 'dist')
/* خطوط بطاقات المشاركة: على لينكس (CI) يقرأ fontconfig خطوط الموقع TTF من
   scripts/og-fonts فتخرج البطاقات بخط الهوية، وعلى ماك يتكفل CoreText بخط
   عربي نظيف. يُضبط هنا قبل أول تصيير SVG. */
process.env.FONTCONFIG_FILE = resolve(ROOT, 'scripts/og-fonts/fonts.conf')
if (!existsSync(DIST)) { console.error('✘ شغّل `npm run build` أولاً.'); process.exit(1) }

/* لا نسمح ببناء ينسخ أصواتاً لا يعرفها bundle. لأن Vite يعمل قبل هذا
   السكربت، فالحل الآمن عند الاختلاف هو إيقاف البناء وطلب المزامنة ثم الإعادة. */
const audioCheck = spawnSync(process.execPath, [resolve(ROOT, 'scripts/sync-audio.mjs'), '--check'], {
  cwd: ROOT,
  encoding: 'utf8',
})
if (audioCheck.status !== 0) {
  console.error(audioCheck.stderr.trim() || 'audio.json غير متزامن')
  console.error('شغّل: node scripts/sync-audio.mjs ثم أعد npm run build')
  if (process.env.CI === 'true') {
    console.warn('⚠️ تم تجاوز الخطأ لأننا في بيئة بناء متواصل (CI). سنكمل البناء.')
  } else {
    process.exit(1)
  }
}

try { process.loadEnvFile(resolve(ROOT, '.env')) } catch { /* .env اختياري */ }
// النطاق المركزي نفسه الذي يقرؤه العميل (VITE_SITE_URL) — canonical/OG/RSS/sitemap/robots كلها منه.
const OFFICIAL_SITE = 'https://dr-alfailakawi.com'
const SITE = (process.env.VITE_SITE_URL || OFFICIAL_SITE).replace(/\/+$/, '')
if (SITE !== OFFICIAL_SITE) {
  console.error(`✘ VITE_SITE_URL يجب أن يكون ${OFFICIAL_SITE} فقط، والقيمة الحالية: ${SITE}`)
  process.exit(1)
}
const AUDIO_PUBLIC_BASE_URL = (process.env.AUDIO_PUBLIC_BASE_URL || process.env.VITE_AUDIO_BASE_URL || '').replace(/\/+$/, '')
const SITE_HOST = new URL(SITE).hostname
const HOME_OG_AR = '/og/canonical-ar.jpg'
const HOME_OG_EN = '/og/canonical-en.jpg'
const HOME_OG = HOME_OG_AR
const AUTHOR = 'د. أحمد حسين الفيلكاوي'
const logoDataUri = `data:image/png;base64,${readFileSync(resolve(ROOT, 'public/logo.png')).toString('base64')}`
const portraitDataUri = `data:image/jpeg;base64,${readFileSync(resolve(ROOT, 'public/portrait.jpg')).toString('base64')}`
// ── المعرّفات الرسمية للهوية ─────────────────────────────────────────────
// أقوى أدوات فكّ تلوّث الاسم وتمييزك كشخصية أكاديمية واحدة محددة.
// ORCID: معرّف الباحث العالمي (16 رقماً بالصيغة 0000-0000-0000-0000).
// WIKIDATA: كِيان ويكيداتا (يبدأ بحرف Q ثم أرقام، مثل Q12345678).
// اتركهما فارغين إن لم يتوفّرا؛ يُضافان تلقائياً إلى الهوية حالما تُملأ القيمة.
const ORCID = '0000-0002-1767-4963'  // معرّف الباحث العالمي — موثّق باسم Dr. Ahmad Alfailakawi
const WIKIDATA = 'Q141131823'  // كِيان ويكيداتا الرسمي — Ahmad H. Alfailakawi

// كيان الهوية المركزي (Person) — يُربط عبر @id في كل Schema، فيبني غوغل كِيان المؤلف الواحد
const PERSON = {
  '@type': 'Person',
  '@id': `${SITE}/#person`,
  mainEntityOfPage: `${SITE}/`,
  name: AUTHOR,
  alternateName: ['Dr. Ahmad H. Alfailakawi', 'Ahmad Hussain Alfailakawi', 'Ahmad Alfailakawi', 'أحمد حسين الفيلكاوي'],
  honorificPrefix: 'د.',
  givenName: 'أحمد',
  additionalName: 'حسين',
  familyName: 'الفيلكاوي',
  gender: 'Male',
  nationality: { '@type': 'Country', name: 'Kuwait' },
  url: SITE,
  image: `${SITE}/portrait.jpg`,
  description: 'أستاذ تكنولوجيا التعليم والذكاء الاصطناعي، كاتب وباحث كويتي؛ مؤلّف موسوعة تكنولوجيا التعليم. شغل سابقاً مهامّ استشارية حكومية، منها مستشار الشؤون التنظيمية والعلاقات الدولية بمكتب وزير الدولة لشؤون الشباب، وعضو اللجنة الاستشارية العليا لمتحف الكويت الوطني.',
  jobTitle: 'أستاذ مشارك في تكنولوجيا التعليم',
  hasOccupation: [
    { '@type': 'Role', roleName: 'مستشار سابق — الشؤون التنظيمية والعلاقات الدولية', memberOf: { '@type': 'GovernmentOrganization', name: 'مكتب وزير الدولة لشؤون الشباب — الهيئة العامة للشباب' } },
    { '@type': 'Role', roleName: 'عضو سابق — اللجنة الاستشارية العليا لمتحف الكويت الوطني', memberOf: { '@type': 'GovernmentOrganization', name: 'المجلس الوطني للثقافة والفنون والآداب' } },
  ],
  affiliation: [
    { '@type': 'CollegeOrUniversity', name: 'كلية التربية الأساسية — الهيئة العامة للتعليم التطبيقي والتدريب (PAAET)', sameAs: 'https://www.paaet.edu.kw' },
    { '@type': 'CollegeOrUniversity', name: 'جامعة الكويت', sameAs: 'https://www.ku.edu.kw' },
  ],
  worksFor: { '@type': 'CollegeOrUniversity', name: 'الهيئة العامة للتعليم التطبيقي والتدريب (PAAET)', sameAs: 'https://www.paaet.edu.kw' },
  alumniOf: { '@type': 'CollegeOrUniversity', name: 'University of Northern Colorado', sameAs: 'https://www.unco.edu' },
  knowsAbout: [
    'تكنولوجيا التعليم', 'الذكاء الاصطناعي في التعليم', 'التعلّم الرقمي',
    'التلعيب (Gamification)', 'الواقع الافتراضي والواقع المعزّز', 'المدارس الذكية',
    'حوكمة الذكاء الاصطناعي والبيانات الضخمة', 'تصميم بيئات التعلّم',
  ],
  knowsLanguage: ['ar', 'en'],
  sameAs: [
    'https://scholar.google.com/citations?user=WVAtInIAAAAJ&hl=en',
    'https://www.researchgate.net/profile/Ahmad-Alfailakawi',
    'https://www.linkedin.com/in/dr-ahmad-alfailakawi',
    'https://x.com/drahmadkw',
    'https://www.instagram.com/drahmadkw/',
    'https://www.facebook.com/d.ahmd.alfylkawy',
    'https://youtube.com/@drahmadalfailakawi',
    'https://www.goodreads.com/user/show/203649232-dr-ahmad',
    'https://www.webofscience.com/wos/author/record/LXA-2190-2024',
    ...(ORCID ? [`https://orcid.org/${ORCID}`] : []),
    ...(WIKIDATA ? [`https://www.wikidata.org/wiki/${WIKIDATA}`] : []),
  ],
  ...(ORCID ? { identifier: { '@type': 'PropertyValue', propertyID: 'https://orcid.org/', value: `https://orcid.org/${ORCID}` } } : {}),
}
const PUBLISHER = { '@type': 'Person', '@id': `${SITE}/#person`, name: AUTHOR, description: PERSON.description }
const podcastStatePath = resolve(ROOT, '.podcast-state.json')
const hasPodcastState = existsSync(podcastStatePath)
const podcastState = hasPodcastState ? JSON.parse(readFileSync(podcastStatePath, 'utf8')) : { done: {} }
const audioMetaPath = resolve(ROOT, 'src/data/audio-meta.json')
const audioMeta = AUDIO_PUBLIC_BASE_URL && existsSync(audioMetaPath) ? JSON.parse(readFileSync(audioMetaPath, 'utf8')) : {}
const sha256File = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
const acceptedArabicDialogue = (slug, audioFile, transcriptFile = '') => {
  const accepted = podcastState?.done?.[`${slug}:ar`]
  if (!accepted || typeof accepted !== 'object' || accepted.status !== 'accepted_automated') return false
  const audioName = `${slug}.dialogue.mp3`
  const transcriptName = `${slug}.dialogue.json`
  const localAudioOk = Boolean(audioFile && existsSync(audioFile) && accepted.audioHash && sha256File(audioFile) === accepted.audioHash)
  const externalAudioOk = Boolean(AUDIO_PUBLIC_BASE_URL && audioMeta?.[audioName]?.sha256
    && audioMeta[audioName].sha256 === accepted.audioHash && Number(audioMeta[audioName].bytes || 0) >= 200_000)
  if (!localAudioOk && !externalAudioOk) return false
  if (transcriptFile) {
    const localTranscriptOk = Boolean(existsSync(transcriptFile) && accepted.transcriptHash
      && sha256File(transcriptFile) === accepted.transcriptHash)
    const externalTranscriptOk = Boolean(AUDIO_PUBLIC_BASE_URL && audioMeta?.[transcriptName]?.sha256
      && audioMeta[transcriptName].sha256 === accepted.transcriptHash && Number(audioMeta[transcriptName].bytes || 0) > 100)
    if (!localTranscriptOk && !externalTranscriptOk) return false
  }
  return true
}
const visibleDialogueAsset = (slug, audioFile, transcriptFile = '') =>
  acceptedArabicDialogue(slug, audioFile, transcriptFile)
const audioPublicUrl = (rel) => AUDIO_PUBLIC_BASE_URL ? `${AUDIO_PUBLIC_BASE_URL}/${rel}` : `${SITE}/audio/${rel}`
const src = readFileSync(resolve(ROOT, 'src/data.ts'), 'utf8')
const srcEn = readFileSync(resolve(ROOT, 'src/data-en.ts'), 'utf8')
const researchSource = readFileSync(resolve(ROOT, 'src/data/research-papers.ts'), 'utf8')
const researchRuntime = ts.transpileModule(researchSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(/\bexport\s+/g, '')
/* ═══ حذف الدكتور نهائيٌّ في كل مكان ═══
   ما يحذفه من اللوحة — مقالاً كان أو بحثاً أو كتاباً أو لقاءً — يجب ألا يبقى
   له أثر: لا صفحة، ولا سطر في الخريطة، ولا مدخل في RSS، ولا رقم في عدّاد.
   كان المولّد يقرأ الملفات الثابتة وحدها فيعلن ١٦٤ مقالاً بينما الموقع يعرض
   ١٤٣، ويبني صفحات لمقالات محذوفة، ويبثّها في التغذية. نقرأ قرارات الحذف من
   Firestore قبل بناء أي شيء، فيصير مصدر الحقيقة واحداً.
   وإن تعذّر الوصول (بناء محلي بلا مفاتيح) نبني بالملفات كما كان — لا نُسقط
   البناء، لكن نُعلن ذلك بوضوح كي لا يُنشر بناءٌ أعمى دون أن ندري. */
const normalizeArabicTypographyStatic = (input = '') => String(input)
  .normalize('NFC')
  .replace(/\u064B\u0627/g, '\u0627\u064B')
  .replace(/([\u0621-\u064A\u0671-\u06D3])[ \t]+([\u064B-\u064D])/g, '$1$2')
  .replace(/([\u064B-\u064D])\1+/g, '$1')
const normalizeArabicTanweenDeep = (value) => {
  if (typeof value === 'string') return normalizeArabicTypographyStatic(value)
  if (Array.isArray(value)) return value.map(normalizeArabicTanweenDeep)
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeArabicTanweenDeep(item)]))
  }
  return value
}
const deletedKeys = new Set()
const overridePatches = new Map()
const cloudCms = { articles: [], books: [], papers: [], media: [] }
let panelDecisionsLoaded = false
const applyPanelSnapshot = (snapshot) => {
  const normalized = normalizeArabicTanweenDeep(snapshot || {})
  cloudCms.articles = Array.isArray(normalized.articles) ? normalized.articles : []
  cloudCms.books = Array.isArray(normalized.books) ? normalized.books : []
  cloudCms.papers = Array.isArray(normalized.papers) ? normalized.papers : []
  cloudCms.media = Array.isArray(normalized.media) ? normalized.media : []
  const reasons = { deleted: 0, hidden: 0, unpublished: 0 }
  for (const row of Array.isArray(normalized.overrides) ? normalized.overrides : []) {
    const id = String(row?.id || '')
    const patch = row?.patch && typeof row.patch === 'object' && !Array.isArray(row.patch) ? row.patch : null
    if (patch) overridePatches.set(id, patch)
    if (row?.deleted === true) { deletedKeys.add(id); reasons.deleted += 1; continue }
    if (row?.hidden === true) { deletedKeys.add(id); reasons.hidden += 1; continue }
    if (id.startsWith('article:') && patch && !isPublicArticle(patch)) { deletedKeys.add(id); reasons.unpublished += 1 }
  }
  panelDecisionsLoaded = true
  console.log(`قرارات اللوحة: ${deletedKeys.size} عنصراً لن يُبنى ولا يُحصى `
    + `(محذوف ${reasons.deleted} · مخفيّ ${reasons.hidden} · مسودة أو مجدول ${reasons.unpublished}).`)
}

/* Canonical Publishing Pipeline: build-static no longer performs a second,
   potentially different Firestore read. The snapshot taken before the graph,
   archive shards and Vite is the same source of truth used here for SEO/RSS. */
const canonicalCms = readCanonicalCms(ROOT)
if (canonicalCms.source === 'firestore') {
  applyPanelSnapshot(canonicalCms)
} else {
  try {
    const saPath = resolve(ROOT, process.env.FIREBASE_SERVICE_ACCOUNT || 'sa.json')
    if (existsSync(saPath) && process.env.FIREBASE_PROJECT_ID) {
      const { initializeApp, cert, getApps } = await import('firebase-admin/app')
      const { getFirestore } = await import('firebase-admin/firestore')
      const app = getApps()[0] || initializeApp({ credential: cert(JSON.parse(readFileSync(saPath, 'utf8'))) })
      const db = getFirestore(app)
      const [overridesSnapshot, articlesSnapshot, booksSnapshot, papersSnapshot, mediaSnapshot] = await Promise.all([
        db.collection('content_overrides').get(),
        db.collection('site_articles').get(),
        db.collection('site_books').get(),
        db.collection('site_papers').get(),
        db.collection('site_media').get(),
      ])
      const snapshotRows = (value) => value.docs.map((document) => ({ id: document.id, ...document.data() }))
      applyPanelSnapshot({
        overrides: snapshotRows(overridesSnapshot),
        articles: snapshotRows(articlesSnapshot),
        books: snapshotRows(booksSnapshot),
        papers: snapshotRows(papersSnapshot),
        media: snapshotRows(mediaSnapshot),
      })
    } else {
      console.log('⚠ بناء بلا Canonical CMS أو مفاتيح Firestore: لن تُطبَّق قرارات اللوحة.')
    }
  } catch (error) {
    console.log(`⚠ تعذّرت قراءة قرارات اللوحة (${String(error.message).slice(0, 80)}) — البناء بالملفات الثابتة.`)
  }
}

/* ما حذفه الدكتور من اللوحة يجب ألا يُنشر أبداً. وكان يُنشر: نشرُ الموقع يبني
   بلا مفاتيح Firestore، فيبقى `deletedKeys` فارغاً وتُبنى صفحاتُ اثنين
   وعشرين عنصراً حذفها بيده — بـHTTP 200 وفي خريطة الموقع، فتفهرسها جوجل.
   والتحذير وحده لا يكفي: سطرٌ رماديّ في سجلٍّ لا يقرؤه أحد. فمتى أُعلن هذا
   البناءُ بناءَ نشرٍ، صار غيابُ المفاتيح خطأً يُسقطه — أهونُ من موقعٍ يعرض
   ما أمر صاحبُه بمحوه. */
if (process.env.REQUIRE_PANEL_DECISIONS === '1' && !panelDecisionsLoaded) {
  console.error('\n✘ بناء نشرٍ بلا قرارات اللوحة.')
  console.error('  السبب: تعذّر الوصول إلى Firestore، فلا يعرف البناءُ ما حذفتَه.')
  console.error('  الأثر لو مضى: تُنشر الصفحات المحذوفة وتُفهرَس.')
  console.error('  الإصلاح: تأكّد من كتابة sa.json وضبط FIREBASE_PROJECT_ID قبل خطوة البناء.\n')
  process.exit(1)
}
/* قرار البناء يُكتب ليقرأه فحص الدخان: كان يقرأ `src/data.ts` وحدها فيطالب
   بصفحةٍ لمقالٍ حذفه الدكتور، فيُسقط النشر كلَّه. مصدر الحقيقة واحد. */
if (!existsSync(DIST)) mkdirSync(DIST, { recursive: true })
writeFileSync(resolve(DIST, '.panel-deleted.json'), `${JSON.stringify([...deletedKeys], null, 2)}\n`)

const isDeleted = (kind, slug) => deletedKeys.has(`${kind}:${slug}`)
const keepAlive = (kind) => (item) => item && item.slug && !isDeleted(kind, item.slug)

const papersAll = new Function(`${researchRuntime}; return researchPapers`)()
const esc = (s = '') => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const attr = (s = '') => esc(s).replace(/'/g, '&#39;')

/* ---------- قراءة البيانات من data.ts ---------- */
const grab = (name) => (src.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\n\\]`)) || [])[1] || ''
const grabObject = (source, name) => (source.match(new RegExp(`export const ${name}[^{]*= \\{([\\s\\S]*?)\\n\\}`)) || [])[1] || ''
const paperTitlesEn = Object.fromEntries([...grabObject(srcEn, 'paperTitlesEn').matchAll(/'([^']+)':\s*\n?\s*'([^']+)'/g)]
  .map((m) => [m[1], m[2].replace(/\\'/g, "'")]))

const localArticles = [...grab('articles').matchAll(
  /\{ slug: '([^']+)', title: '([^']+)', date: '([^']*)', iso: '([^']*)', cat: '([^']*)',\s*excerpt: '([^']*)'/g
)].map((m) => ({ slug: m[1], title: m[2].replace(/\\'/g, "'"), date: m[3], iso: m[4], cat: m[5], excerpt: m[6].replace(/\\'/g, "'") }))
  .filter(keepAlive('article'))

const localBooks = [...grab('books').matchAll(/\{ slug: '([^']+)'[\s\S]*?title: '([^']+)'[\s\S]*?isbn: '([^']*)'[\s\S]*?cover: '([^']*)'[\s\S]*?pdf: '([^']*)'[\s\S]*?desc: '([^']*)'/g)]
  .map((m) => ({ slug: m[1], title: m[2], isbn: m[3], cover: m[4], pdf: m[5], desc: m[6] }))
  .filter(keepAlive('book'))

const literalField = (block, name) => {
  const match = block.match(new RegExp(`\\b${name}:\\s*'((?:\\\\'|[^'])*)'`))
  return match ? match[1].replace(/\\'/g, "'") : ''
}
const localMedia = [...grab('media').matchAll(/\{[^\n{}]*\}/g)]
  .map((m, index) => {
    const block = m[0]
    const url = literalField(block, 'url')
    const id = (url.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{6,})/) || [])[1] || String(index + 1)
    return {
      slug: `media-${id}`,
      title: literalField(block, 'title'),
      outlet: literalField(block, 'outlet'),
      channel: literalField(block, 'channel'),
      program: literalField(block, 'program'),
      url,
      iso: literalField(block, 'iso'),
      date: literalField(block, 'date'),
      duration: literalField(block, 'duration'),
      topics: literalField(block, 'topics'),
      thumbnail: literalField(block, 'thumbnail'),
      clipStart: literalField(block, 'clipStart'),
      clipEnd: literalField(block, 'clipEnd'),
      transcript: literalField(block, 'transcript'),
    }
  })
  .filter(keepAlive('media'))

const localPapers = papersAll.filter(keepAlive('paper'))

const cloudSlug = (document) => String(document?.slug || document?.id || '').trim()
const visibleCloud = (kind, document) => {
  if (!document || document.hidden === true || document.deleted === true) return false
  const slug = cloudSlug(document)
  if (!slug || isDeleted(kind, slug)) return false
  if (kind !== 'article') return true
  const status = String(document.status || 'published')
  const scheduledAt = document.scheduledAt ? Date.parse(String(document.scheduledAt)) || 0 : 0
  if (status === 'draft') return false
  if (status === 'scheduled') return scheduledAt > 0 && scheduledAt <= Date.now()
  if (scheduledAt > Date.now()) return false
  return status === 'published' || !status
}
const patchOriginals = (kind, source) => source.map((item) => {
  const patch = overridePatches.get(`${kind}:${item.slug}`)
  return patch && typeof patch === 'object' ? { ...item, ...patch, slug: item.slug } : item
}).filter(keepAlive(kind))
const mergeCloudAdditions = (kind, base, additions) => {
  const map = new Map(patchOriginals(kind, base).map((item) => [item.slug, item]))
  for (const document of additions || []) {
    const slug = cloudSlug(document)
    // سجلات الأساس تُعدل عبر content_overrides؛ مجموعة site_* مخصصة للإضافات الجديدة.
    if (!visibleCloud(kind, document) || map.has(slug)) continue
    map.set(slug, { ...document, slug })
  }
  return [...map.values()]
}

const articles = mergeCloudAdditions('article', localArticles, cloudCms.articles)
  .filter((item) => item.title && item.slug)
  .sort((a, b) => String(b.iso || '').localeCompare(String(a.iso || '')))
/* بيانات نشر الكتاب — سنةٌ وطبعةٌ وناشرٌ وعدد صفحات — موجودة كلّها في
   `src/data.ts` منذ البداية، وبنّاء البيانات المنظَّمة أدناه يعرف كيف
   يبثّها (`datePublished` و`bookEdition` و`publisher` و`numberOfPages`).
   لكنها **لم تكن تصله قطّ**: التعبير النمطي أعلاه يلتقط ستة حقول فقط،
   وهذه الأربعة تقع خارجها فتُفقد صامتة. النتيجة: تسعة كتب على الموقع
   بلا سنة نشرٍ ولا ناشرٍ في نظر محركات البحث.

   ولا يُمسّ ذلك التعبير: توسيعه قد يُسقط كتاباً كاملاً بلا خطأ. نقرأ
   كتلة كل كتاب على حدة ونستخرج منها بـ`literalField` نفسها المستعملة
   في الوسائط. إضافةٌ محضة: ما كان يُلتقط يبقى كما هو. */
const booksSource = grab('books')
const bookBlock = (slug) => {
  const start = booksSource.indexOf(`slug: '${slug}'`)
  if (start < 0) return ''
  const next = booksSource.indexOf("{ slug: '", start + 1)
  return booksSource.slice(start, next < 0 ? undefined : next)
}
const withPublishing = (list) => list.map((book) => {
  const block = bookBlock(book.slug)
  if (!block) return book
  const pick = (name) => book[name] || literalField(block, name) || undefined
  return {
    ...book,
    year: pick('year'),
    edition: pick('edition'),
    publisher: pick('publisher'),
    pageCount: pick('pageCount'),
  }
})

const books = withPublishing(mergeCloudAdditions('book', localBooks, cloudCms.books))
  .filter((item) => item.title && item.slug)
/* مواد الأرشيف الصوتية تسكن media-archive.json ولا يوجد لها سطر في data.ts،
   وكانت تسقط من التوليد الساكن فيصير رابطها المباشر 404 ولا تدخل خريطة الموقع. */
const mediaArchivePath = resolve(ROOT, 'src/data/media-archive.json')
const archiveMedia = existsSync(mediaArchivePath)
  ? (JSON.parse(readFileSync(mediaArchivePath, 'utf8')).items || [])
    // اللقاءات المرئية لها سطورها في data.ts؛ هنا نضيف المواد الصوتية وحدها لتفادي تكرار الصفحات.
    .filter((item) => item.title && item.slug && !item.url && (item.audioUrl || item.audioFile))
  : []
const media = mergeCloudAdditions('media', [...localMedia, ...archiveMedia], cloudCms.media)
  .filter((item) => item.title && item.slug && (item.url || item.audioUrl || item.audioFile))
const mediaTranscriptsPath = resolve(ROOT, 'src/data/media-transcripts.json')
const mediaTranscripts = existsSync(mediaTranscriptsPath)
  ? JSON.parse(readFileSync(mediaTranscriptsPath, 'utf8'))
  : {}
const papers = mergeCloudAdditions('paper', localPapers, cloudCms.papers)
  .filter((item) => item.title && item.slug)

const siteArticlesFeedPath = resolve(ROOT, 'src/data/site-articles-feed.json')
const siteArticlesFeed = existsSync(siteArticlesFeedPath)
  ? JSON.parse(readFileSync(siteArticlesFeedPath, 'utf8')).filter((item) => item?.slug && item?.title && item?.iso)
  : []

/* أعداد وسنوات تُحسب من المحتوى — تتجدّد أوصاف SEO تلقائياً مع أي إضافة */
const artYears = articles.map((a) => Number(String(a.iso || '').slice(0, 4))).filter((y) => y >= 1990)
const firstYear = 2015
const nArticles = Math.floor(articles.length / 10) * 10   // «أكثر من ١٦٠»
const nBooks = books.length
const nPapers = papers.length

const STATIC = [
  { path: '/', title: 'د. أحمد حسين الفيلكاوي — أستاذ تكنولوجيا التعليم والذكاء الاصطناعي', desc: `الموقع الرسمي للدكتور أحمد حسين الفيلكاوي، أستاذ تكنولوجيا التعليم والذكاء الاصطناعي، والكاتب والباحث والمستشار الكويتي. ${nBooks} كتب، ${nPapers} بحثاً محكّماً، وأكثر من ${nArticles} مقالاً منذ ${firstYear}.` },
  { path: '/publications', title: 'الكتب المنشورة', desc: `كتب د. أحمد حسين الفيلكاوي في التعليم وتكنولوجيا التعليم والذكاء الاصطناعي والتحول المجتمعي.` },
  { path: '/research', title: 'المساهمات العلمية', desc: `أبحاث د. أحمد حسين الفيلكاوي المحكمة في تكنولوجيا التعليم والتعلم الإلكتروني والذكاء الاصطناعي.` },
  { path: '/articles', title: 'مقالاتي الفكرية', desc: `مقالات د. أحمد حسين الفيلكاوي الفكرية في التعليم والتقنية والمجتمع، منذ ${firstYear}.` },
  { path: '/atlas', title: 'سماء المقالات', desc: `خريطة بصرية لأكثر من ${nArticles} مقالاً عبر السنوات.` },
  /* بلا هذا السطر لا تُبنى صفحةٌ ثابتة لـ/listen، ولا rewrite شاملاً في
     firebase.json — فالرابط المباشر يعطي 404 ولا تدخل خريطة الموقع. الصفحة
     تعمل داخل التطبيق وتموت خارجه: عطبٌ لا يُرى إلا بعد النشر. */
  { path: '/listen', title: 'مجلس الفكرة', desc: 'حلقات حوارية مسموعة من مقالات د. أحمد حسين الفيلكاوي، بصوتين ونصٍّ يسير مع الصوت.' },
  { path: '/radio', title: 'الإذاعة', desc: 'بثٌّ متواصل من فكر د. أحمد حسين الفيلكاوي: حلقةٌ تتلو حلقة بساعة الكويت، والجملة المنطوقة أمامك لحظةً بلحظة.' },
  { path: '/media', title: 'الظهور الإعلامي', desc: 'لقاءات تلفزيونية وإذاعية.' },
  { path: '/questions', title: 'سؤال يُقلق التعليم', desc: 'زاوية متجددة: سؤال جديد كل يومين يوقظ التفكير في التعليم، بصياغة عربية واضحة.' },
  { path: '/radar', title: 'أرشيف الرادار', desc: 'نافذة أسبوعية على أفكار ودراسات ومستجدات تستحق المتابعة، محفوظة في أرشيف زمني واضح.' },
  { path: '/upcoming', title: 'اللقاءات القادمة', desc: 'محاضرات وورش عمل ومؤتمرات قادمة.' },
  { path: '/curated', title: 'من اختياراتي', desc: 'كتاب، ومقالة، وأداة، واقتباس — مساحة تتجدّد.' },
  { path: '/inbox', title: 'رسائل على الهامش', desc: 'رسائل قصيرة وأسئلة تفتح زوايا جديدة على التعليم والتربية والتقنية.' },
  { path: '/cv', title: 'السيرة الأكاديمية', desc: 'التعليم والخبرات والعضويات والمؤتمرات.' },
  { path: '/cv-file/ar', title: 'السيرة الذاتية PDF', desc: 'تجهيز النسخة العربية من السيرة الذاتية.', robots: 'noindex, nofollow' },
  { path: '/cv-file/en', title: 'Curriculum Vitae PDF', desc: 'Preparing the English curriculum vitae PDF.', robots: 'noindex, nofollow', lang: 'en' },
  { path: '/about', title: 'حول الموقع', desc: 'فضاءٌ مُنتقى بعناية… حيث لكل قسم غاية، ولكل اختيار فلسفة.' },
  { path: '/contact', title: 'للاستشارة أو التعاون', desc: 'استشارات ومحاضرات ومشاريع تحوّل رقمي.' },
  { path: '/privacy', title: 'سياسة الخصوصية', desc: 'سياسة الخصوصية للموقع الرسمي وأداة Dr Alfailakawi Publishing وربط Meta وLinkedIn.', robots: 'noindex, nofollow' },
  { path: '/terms', title: 'شروط الاستخدام', desc: 'شروط استخدام الموقع وأداة إدارة المحتوى والنشر على المنصات المرتبطة.', robots: 'noindex, nofollow' },
  { path: '/data-deletion', title: 'تعليمات حذف البيانات', desc: 'تعليمات إلغاء الربط وطلب حذف بيانات Facebook وInstagram وLinkedIn.', robots: 'noindex, nofollow' },
  { path: '/ask', title: 'العقل الحي', desc: 'اسأل سؤالاً حقيقياً، فيبني الموقع إجابة موثقة من أرشيف د. أحمد حسين الفيلكاوي فقط: مقالات، تطور زمني، ومصادر.' },
  { path: '/thought', title: 'الخريطة الفكرية', desc: 'الباب الجامع لسماء المقالات ومسارات الفكرة ووثيقة العقد وسجل الأثر.' },
  { path: '/decade', title: 'وثيقة العقد', desc: 'سيرة فكرية حيّة تقرأ أكثر من عشر سنوات من الكتابة وتكشف تحولات الأسئلة والموضوعات الأكثر إلحاحاً.' },
  { path: '/impact', title: 'سجل الأثر الموثق', desc: 'رحلات موثقة تُظهر انتقال الأفكار من المقال والبحث إلى الحوار العام والمؤلفات والتطبيق، مع رابط لكل محطة ظاهرة.' },
  { path: '/cv/impact', title: 'سجل الأثر الموثق', desc: 'مسار توافق قديم ينقلك إلى سجل الأثر الموثق.', robots: 'noindex, follow' },
  { path: '/thought-paths', title: 'مسار الفكرة', desc: 'رحلات تربط المقال بالسؤال والبحث والكتاب واللقاء لتكشف كيف تطورت الفكرة عبر السنوات.' },
  { path: '/search', title: 'البحث العميق', desc: 'بحث متقدم في عناوين المقالات ونصوصها وتصنيفاتها وسنواتها.' },
  { path: '/admin', title: 'لوحة التحكم', desc: 'لوحة إدارة خاصة.', robots: 'noindex, nofollow' },
  /* المرآة الإنجليزية */
  { path: '/en', title: 'Dr. Ahmad H. Alfailakawi — Professor of Educational Technology & AI', desc: `Official website of Dr. Ahmad H. Alfailakawi, Professor of Educational Technology and Artificial Intelligence in Kuwait. ${nBooks} books, ${nPapers} peer-reviewed papers, and over ${nArticles} essays since ${firstYear}.`, lang: 'en' },
  { path: '/en/cv', title: 'Curriculum Vitae', desc: 'Education, academic appointments, advisory roles and international memberships of Dr. Ahmad H. Alfailakawi.', lang: 'en' },
  { path: '/en/research', title: 'Research', desc: `${nPapers} peer-reviewed papers on educational technology, e-learning systems and emerging technologies in higher education.`, lang: 'en' },
  { path: '/en/contact', title: 'Book a meeting', desc: 'Consulting, keynotes, workshops, media interviews and research collaboration with Dr. Ahmad H. Alfailakawi.', lang: 'en' },
]

const routes = [
  ...STATIC,
  ...books.map((b) => ({ path: `/publications/${b.slug}`, title: b.title, desc: b.longDescription || b.desc, image: b.cover, isbn: b.isbn, year: b.year, edition: b.edition, publisher: b.publisher, pageCount: b.pageCount })),
  ...papers.map((p) => ({ path: `/research/${p.slug}`, title: p.title, desc: p.abstractAr || `بحث محكّم — ${p.meta}`, type: 'article' })),
  ...media.map((item) => {
    const id = youtubeId(item.url)
    const thumbnail = item.thumbnail || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '')
    return { ...item, path: `/media/${item.slug}`, title: item.title, desc: item.topics || `${item.program || 'لقاء إعلامي'} — ${item.channel || item.outlet || ''}`, type: item.url ? 'video.other' : 'website', iso: item.iso, image: thumbnail, thumbnail }
  }),
  ...articles.map((a) => ({ path: `/articles/${a.slug}`, title: a.title, desc: a.excerpt, type: 'article', iso: a.iso, cat: a.cat, image: `/og/articles/${a.slug}.jpg` })),
  ...siteArticlesFeed.map((a) => ({ path: `/articles/${a.slug}`, title: a.title, desc: a.excerpt || a.title, type: 'article', iso: a.iso, cat: a.cat || 'مقال', image: `/og/articles/${a.slug}.jpg` })),
]

const LEGACY_REDIRECTS = [
  ['/articles/a-society-that-fears-the-different-scheduledarabbic', '/articles/a-society-that-fears-the-different-arabic'],
  ['/signature_articles/a-society-that-fears-the-different-scheduledarabbic', '/articles/a-society-that-fears-the-different-arabic'],
]

const uniqueRoutes = (items) => {
  const seen = new Set()
  return items.filter((item) => {
    const key = item.path.replace(/\/+$/, '') || '/'
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
const uniqueBySlug = (items) => {
  const seen = new Set()
  return items.filter((item) => {
    if (!item.slug || seen.has(item.slug)) return false
    seen.add(item.slug)
    return true
  })
}

/* ---------- حقن الوسوم ---------- */
const shell = readFileSync(resolve(DIST, 'index.html'), 'utf8')

function stripManagedHead(html) {
  return html
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']robots["'][^>]*>/gi, '')
    .replace(/<meta\s+(?:property|name)=["'](?:og:[^"']+|twitter:[^"']+)["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<script\s+type=["']application\/ld\+json["'][\s\S]*?<\/script>/gi, '')
}

/* المرآة الإنجليزية — أزواج hreflang بين اللغتين.
   ما دام زرّها مخفياً (SHOW_EN_TOGGLE=false) تبقى صفحاتها noindex وبلا hreflang وخارج sitemap. */
const SHOW_EN = /export const SHOW_EN_TOGGLE = true/.test(src)
const LANG_PAIRS = SHOW_EN ? { '/': '/en', '/cv': '/en/cv', '/research': '/en/research', '/contact': '/en/contact' } : {}

const bodiesPath = resolve(ROOT, 'src/data/bodies.json')
const bodies = existsSync(bodiesPath) ? JSON.parse(readFileSync(bodiesPath, 'utf8')) : {}

const LEGAL_STATIC = {
  '/privacy': {
    arTitle: 'سياسة الخصوصية', enTitle: 'Privacy Policy',
    ar: [
      ['من نحن ونطاق السياسة', 'تنطبق هذه السياسة على الموقع الرسمي للدكتور أحمد حسين الفيلكاوي وأداة Dr Alfailakawi Publishing. وهي تغطي زيارة الموقع، رسائل التواصل، لوحة الإدارة، والربط الاختياري مع Meta وLinkedIn.'],
      ['البيانات التي قد نعالجها', 'قد نعالج الاسم والبريد ومحتوى الرسالة، بيانات تشغيل وأمان محدودة، تفضيلات محفوظة محلياً في المتصفح، بيانات مصادقة المسؤول، وعند ربط حساب اجتماعي: معرّفات الحساب أو الصفحة، الصلاحيات، رموز الوصول المشفرة، المحتوى المختار ونتيجة النشر.'],
      ['أغراض الاستخدام', 'نستخدم البيانات لتشغيل الموقع وتأمينه، الرد على الرسائل، تحسين الأداء، إنشاء محتوى أو صوت عند الطلب، وربط الحسابات والنشر فقط بعد موافقة مستخدم مخول.'],
      ['الخدمات التقنية', 'قد نستعين بـ Google Cloud وFirebase وGemini وMicrosoft Azure Speech وMeta وLinkedIn بالقدر اللازم للوظيفة المطلوبة. لا نبيع البيانات الشخصية ولا نؤجرها.'],
      ['الذكاء الاصطناعي', 'قد يرسل نص يختاره المسؤول إلى Gemini لتجهيز مسودة أو إلى Azure Speech لإنشاء صوت. يجب عدم إدخال أسرار أو بيانات حساسة، ومراجعة المخرجات قبل النشر.'],
      ['الاحتفاظ والحماية', 'نحتفظ بالبيانات للمدة اللازمة للتشغيل والأمان والالتزامات القانونية. تُحذف أو تُعطل رموز الوصول بعد فصل الحساب أو قبول طلب حذف موثق، مع احتمال بقاء نسخ محدودة مؤقتاً في النسخ الاحتياطية.'],
      ['حقوقك', 'يمكنك طلب الوصول أو التصحيح أو الحذف حيث ينطبق، وإلغاء صلاحيات Meta أو LinkedIn من إعدادات المنصة، ومسح بيانات الموقع المحلية من المتصفح.'],
      ['التواصل', 'لطلبات الخصوصية: ah.alfailakawi@paaet.edu.kw. آخر تحديث: 13 يوليو 2026.'],
    ],
    en: [
      ['Scope', 'This policy applies to the official website of Dr. Ahmad Hussein Alfailakawi and Dr Alfailakawi Publishing, including website visits, contact messages, authorized administration and optional Meta or LinkedIn connections.'],
      ['Data we may process', 'We may process submitted contact details, limited operational and security data, browser-local preferences, administrator authentication records and, when a social account is connected, account or Page identifiers, granted scopes, encrypted access tokens, selected content and publishing results.'],
      ['Purposes', 'Data is used to operate and secure the service, respond to inquiries, improve performance, generate content or audio when requested, and publish only after authorization.'],
      ['Providers', 'We may use Google Cloud, Firebase, Gemini, Microsoft Azure Speech, Meta and LinkedIn as necessary. We do not sell or rent personal data.'],
      ['AI', 'Text selected by an administrator may be sent to Gemini or Azure Speech. Do not submit secrets or sensitive personal information, and review all output before publication.'],
      ['Retention and security', 'We retain data only as reasonably necessary. Connection data and tokens are deleted or disabled after verified deletion or disconnection, subject to limited backup and security-log retention.'],
      ['Your choices', 'You may request access, correction or deletion where applicable, revoke platform permissions, and clear local website data through your browser.'],
      ['Contact', 'Privacy requests: ah.alfailakawi@paaet.edu.kw. Last updated: July 13, 2026.'],
    ],
  },
  '/terms': {
    arTitle: 'شروط الاستخدام', enTitle: 'Terms of Use',
    ar: [
      ['قبول الشروط', 'باستخدام الموقع أو أداة Dr Alfailakawi Publishing فإنك توافق على هذه الشروط وعلى شروط الخدمات الخارجية التي تختار ربطها.'],
      ['الخدمة', 'يوفر الموقع محتوى أكاديمياً وأداة لإدارة المقالات وتجهيز محتوى السوشيال وربط منصات النشر. لا تمثل المواد استشارة قانونية أو طبية أو مالية.'],
      ['الحسابات', 'يجب أن تكون مخولاً لربط الحساب أو الصفحة، وأن تحمي بيانات الدخول والأسرار، وألا تربط حساباً لا تملكه أو لا تديره.'],
      ['المراجعة قبل النشر', 'لا يُفترض نشر محتوى إلا بعد اختيار الوجهة واعتماد المحتوى من مستخدم مخول. المستخدم مسؤول عن الدقة والحقوق والالتزام بسياسة المنصة.'],
      ['الذكاء الاصطناعي', 'قد تحتوي المسودات على أخطاء. يجب مراجعة الحقائق والاستشهادات وحقوق النشر، وعدم إدخال معلومات سرية دون سلطة قانونية.'],
      ['الاستخدام المحظور', 'يُحظر الوصول غير المصرح، تجاوز الأمان، نشر محتوى غير قانوني أو مضلل، إساءة استخدام الرموز، أو تنفيذ رسائل مزعجة ونشر مخالف لسياسات المنصات.'],
      ['الخدمات الخارجية', 'قد تتغير Firebase وGemini وAzure وMeta وLinkedIn أو تتوقف أو تفرض حدوداً أو مراجعات أو أسعاراً. لا نضمن استمرار أي واجهة خارجية.'],
      ['القانون والتواصل', 'تخضع الشروط للقوانين السارية في دولة الكويت مع مراعاة الحقوق الإلزامية المنطبقة. التواصل: ah.alfailakawi@paaet.edu.kw. آخر تحديث: 13 يوليو 2026.'],
    ],
    en: [
      ['Acceptance', 'By using the website or Dr Alfailakawi Publishing, you accept these terms and the terms of any third-party service you choose to connect.'],
      ['Service', 'The website provides academic content and a tool for article management, social content preparation and publishing connections. Content is not legal, medical or financial advice.'],
      ['Accounts', 'You must be authorized to connect each account or Page, protect credentials and secrets, and never connect an account you do not own or administer.'],
      ['Approval before publishing', 'Content should be published only after an authorized user selects the destination and approves it. The user remains responsible for accuracy, rights and platform compliance.'],
      ['AI', 'AI drafts may contain errors. Facts, citations and rights must be reviewed, and confidential information must not be submitted without authority.'],
      ['Prohibited use', 'Unauthorized access, security bypass, unlawful or deceptive content, token misuse, spam and automation that violates platform rules are prohibited.'],
      ['Third-party services', 'Firebase, Gemini, Azure, Meta and LinkedIn may change, stop, impose limits, require review or change pricing. Continued API availability is not guaranteed.'],
      ['Law and contact', 'These terms are governed by applicable Kuwait law, subject to mandatory rights that may apply. Contact: ah.alfailakawi@paaet.edu.kw. Last updated: July 13, 2026.'],
    ],
  },
  '/data-deletion': {
    arTitle: 'تعليمات حذف البيانات', enTitle: 'Data Deletion Instructions',
    ar: [
      ['إلغاء صلاحية المنصة', 'يمكنك إزالة التطبيق من إعدادات التطبيقات والمواقع أو تكاملات الأعمال في Facebook وInstagram، أو من أذونات البيانات والخدمات المسموح بها في LinkedIn.'],
      ['إرسال طلب مباشر', 'أرسل إلى ah.alfailakawi@paaet.edu.kw بعنوان «طلب حذف بيانات التطبيق»، واذكر المنصة واسم الحساب أو الصفحة ورابط الملف أو المعرّف والبريد الذي يمكن الرد عليه. لا ترسل كلمة مرور أو App Secret أو Access Token.'],
      ['التحقق والتنفيذ', 'قد نطلب إثباتاً مناسباً لملكية الحساب دون طلب كلمة المرور. بعد التحقق نحذف أو نعطل رموز الوصول ومعرّفات الربط وبيانات الحساب وسجلات النشر القابلة للتحديد. تتم المعالجة عادة خلال 30 يوماً.'],
      ['حدود الحذف', 'حذف البيانات من خدمتنا لا يحذف منشوراً سبق نشره على منصة خارجية؛ احذفه من المنصة مباشرة. قد تبقى نسخة مؤقتة في نسخة احتياطية آمنة إلى أن تدور دورة النسخ الاعتيادية.'],
      ['التأكيد', 'نرسل تأكيداً عند إتمام المعالجة ما لم يمنع القانون أو الأمن ذلك. آخر تحديث: 13 يوليو 2026.'],
    ],
    en: [
      ['Revoke platform access', 'Remove the app from Apps and Websites or Business Integrations in Facebook and Instagram, or from permitted services and data permissions in LinkedIn.'],
      ['Send a direct request', 'Email ah.alfailakawi@paaet.edu.kw with the subject “App Data Deletion Request”. Include the platform, account or Page name, profile link or identifier and a reply email. Never send a password, App Secret or access token.'],
      ['Verification and action', 'We may request proportionate proof of account ownership without asking for a password. After verification, we delete or disable tokens, connection identifiers, stored account details and identifiable publishing logs. Requests are normally processed within 30 days.'],
      ['Deletion limits', 'Deleting data from our service does not remove a post already published on a third-party platform. Delete it directly on that platform. A limited backup copy may remain until routine backup rotation.'],
      ['Confirmation', 'We send confirmation after processing unless law or security prevents it. Last updated: July 13, 2026.'],
    ],
  },
}

function legalStaticHtml(path) {
  const doc = LEGAL_STATIC[path]
  if (!doc) return ''
  const sections = (items, dir) => items.map(([title, body]) => `
    <section style="padding:1.5rem 0;border-bottom:1px solid rgba(62,92,120,.12);text-align:${dir === 'rtl' ? 'right' : 'left'};">
      <h2 style="font-size:1.35rem;margin:0 0 .65rem;color:#15161A;">${esc(title)}</h2>
      <p style="margin:0;color:#3D4650;line-height:1.9;font-size:1rem;">${esc(body)}</p>
    </section>`).join('')
  return `
    <main style="max-width:900px;margin:4rem auto;padding:0 1rem;">
      <article dir="rtl" lang="ar" style="padding:2rem;border:1px solid rgba(62,92,120,.14);border-radius:18px;background:#fff;">
        <h1 style="font-size:2.4rem;margin:0 0 .5rem;color:#15161A;">${esc(doc.arTitle)}</h1>
        <p style="color:#626A76;margin:0 0 1rem;">آخر تحديث: 13 يوليو 2026</p>
        ${sections(doc.ar, 'rtl')}
      </article>
      <article dir="ltr" lang="en" style="margin-top:2rem;padding:2rem;border:1px solid rgba(62,92,120,.14);border-radius:18px;background:#F7F8F8;">
        <h1 style="font-size:2.2rem;margin:0 0 .5rem;color:#15161A;">${esc(doc.enTitle)}</h1>
        <p style="color:#626A76;margin:0 0 1rem;">Last updated: July 13, 2026</p>
        ${sections(doc.en, 'ltr')}
      </article>
    </main>`
}


function richStaticHtml(path) {
  const shell = (title, lead, sections, links = []) => `
    <main style="max-width:860px;margin:4rem auto;padding:0 1rem;" dir="rtl">
      <header style="margin-bottom:2.8rem;text-align:right;">
        <h1 style="font-size:2.55rem;font-family:'El Messiri',serif;font-weight:700;margin:0 0 .9rem;color:#15161A;line-height:1.35;">${esc(title)}</h1>
        <p style="font-size:1.12rem;color:#626A76;line-height:1.9;margin:0;font-family:'Tajawal',sans-serif;">${esc(lead)}</p>
      </header>
      ${sections.map(([heading, body]) => `<section style="padding:1.55rem 0;border-top:1px solid rgba(62,92,120,.11);text-align:right;"><h2 style="font-size:1.35rem;font-family:'El Messiri',serif;margin:0 0 .6rem;color:#15161A;">${esc(heading)}</h2><p style="margin:0;color:#3D4650;line-height:1.95;font-size:1rem;font-family:'Tajawal',sans-serif;">${body}</p></section>`).join('')}
      ${links.length ? `<nav aria-label="مسارات مرتبطة" style="display:flex;flex-wrap:wrap;gap:.7rem;padding-top:1.6rem;border-top:1px solid rgba(62,92,120,.11);font-family:'Tajawal',sans-serif;">${links.map(([href,label]) => `<a href="${attr(href)}" style="border:1px solid rgba(62,92,120,.18);border-radius:999px;padding:.6rem .9rem;color:#3E5C78;text-decoration:none;font-weight:600;">${esc(label)}</a>`).join('')}</nav>` : ''}
    </main>`

  if (path === '/about') return shell(
    'حول الموقع — فضاءٌ مُنتقى',
    'مرحباً بك في فضاءٍ مُنتقى بعناية… حيث لكل قسم غاية، ولكل اختيار فلسفة.',
    [
      ['الرؤية والهدف', 'هذا الموقع ليس مجرد سيرة ذاتية؛ بل تجربة فكرية ومختبر تربوي مفتوح يصل بين البحث والكلمة والممارسة.'],
      ['لماذا هذا الموقع؟', 'لأن الكلمة يجب أن تتحرر من أرشيف المجلات والمؤتمرات وتصل إلى من يحتاجها، ولأن التعليم يحتاج إلى صوت يثير السؤال ولا يكتفي بتكرار المألوف.'],
      ['ما الذي يميّزه؟', 'يجمع المشروع الأكاديمي والفكري، والمقالات المنشورة، والأبحاث المحكّمة، والمؤلفات، واللقاءات، ومسارات تربط الفكرة بمصادرها وتطورها.'],
      ['لمن؟', 'للطالب والمعلم والباحث والمهتم بالتعليم وصاحب القرار الذي يبحث عن معنى موثق يتجاوز عرض الأرقام وحدها.'],
    ],
    [['/decade','وثيقة العقد'], ['/impact','سجل الأثر'], ['/cv','السيرة الأكاديمية']]
  )

  if (path === '/contact') return shell(
    'للاستشارة أو التعاون',
    'استشارات في تكنولوجيا التعليم، محاضرات وورش عمل، ومشاريع تحول رقمي في المؤسسات التعليمية.',
    [
      ['استشارة', 'رأي خبير في مشروع أو تحدٍّ تعليمي أو تكنولوجي، مع مساحة لشرح السياق والجهة والنتيجة المطلوبة.'],
      ['محاضرة أو ورشة', 'طلبات الجهات والمؤتمرات للحضور المباشر أو عن بُعد، مع تحديد الموضوع والتوقيت والمكان التقريبي.'],
      ['لقاء إعلامي', 'للتلفزيون والإذاعة والبودكاست والصحافة، مع محور اللقاء وموعد التسجيل أو البث.'],
      ['نموذج مباشر', 'النموذج التفاعلي في هذه الصفحة يبدأ بنوع الطلب ثم يُظهر الحقول الضرورية فقط، ويمنح كل رسالة مرجعاً للمتابعة بعد الإرسال.'],
    ],
    [['/files/Dr-Ahmad-Training-Profile.pdf','ملف الاستشارات والبرامج'], ['/files/Dr-Ahmad-Media-Kit.pdf','الملف الإعلامي']]
  )

  if (path === '/impact' || path === '/cv/impact') return shell(
    'سجل الأثر الموثق',
    'مسارات قابلة للتحقق تتبع انتقال الفكرة بين المقال والبحث والكتاب والحوار العام، مع فصل واضح بين القرابة الموضوعية والأثر المثبت.',
    [
      ['من الفكرة إلى الميدان', 'لا يكتفي السجل بعرض مادة منشورة؛ بل يجمع المحطات التي يمكن توثيق صلتها بالفكرة ويُبقي رابط المصدر ظاهراً كلما كان متاحاً.'],
      ['أثر علمي وإعلامي وأرشيفي', `يمتد السجل عبر ${nPapers} بحثاً محكّماً و${nBooks} كتب وأرشيف المقالات والظهور الإعلامي، مع تصفية المسارات بحسب نوع الدليل.`],
      ['درجة الثقة', 'تُفصل الإشارات المباشرة الموثقة عن القرابة الموضوعية حتى لا تتحول الخريطة إلى ادعاء أثر بلا دليل.'],
    ],
    [['/research','الأبحاث المحكمة'], ['/media','الظهور الإعلامي'], ['/thought-paths','مسار الفكرة']]
  )

  if (path === '/thought-paths') return shell(
    'مسار الفكرة',
    'رحلات فكرية تربط المقال بالسؤال والبحث والكتاب واللقاء لتكشف كيف تطورت الفكرة عبر الأرشيف.',
    [
      ['قراءة عابرة للأنواع', 'المسار لا يعامل المقال والبحث والكتاب كجزر منفصلة؛ بل يعرض المحطات الأقرب إلى السؤال نفسه بترتيب يوضح الحركة الفكرية.'],
      ['بداية وتحول وموقف أحدث', 'كل رحلة تبحث عن البدايات والمواد العلمية أو المؤلفات واللقاءات ذات الصلة ثم تقارنها بما نُشر لاحقاً.'],
      ['مسار قابل للاستكشاف', 'يمكن للزائر الانتقال من كل محطة إلى مادتها الأصلية ومتابعة الفكرة داخل الأرشيف بدلاً من الاكتفاء بملخص مغلق.'],
    ],
    [['/atlas','سماء المقالات'], ['/ask','العقل الحي'], ['/impact','سجل الأثر الموثق']]
  )

  if (path === '/atlas') return shell(
    'سماء المقالات',
    `خريطة بصرية لأرشيف المقالات؛ كل نجمة تمثل مقالاً، وتسمح برؤية السنوات والموضوعات والصلات بين الأفكار في مشهد واحد.`,
    [
      ['خريطة لا قائمة', `تضع الخريطة أرشيفاً يتجاوز ${nArticles} مقالاً في مساحة قابلة للاستكشاف بدلاً من تحويله إلى قائمة طويلة فقط.`],
      ['زمن وموضوع وصلات', 'يمكن قراءة المقالات كتسلسل زمني أو كشبكة أفكار؛ اللون والموقع والحجم أدوات مساعدة لفهم المشهد وليست بديلاً عن النص الأصلي.'],
      ['بحث داخل الخريطة', 'يوفر العرض بحثاً عن الفكرة ثم يضيء المواد المرتبطة بها، مع انتقال مباشر إلى صفحة كل مقال.'],
    ],
    [['/articles','كل المقالات'], ['/thought-paths','مسار الفكرة'], ['/search','البحث العميق']]
  )

  if (path === '/ask') return shell(
    'العقل الحي — اسأل الأرشيف سؤالاً حقيقياً',
    'يعيد الموقع ترتيب مواد د. أحمد حسين الفيلكاوي المنشورة للإجابة من الأرشيف نفسه: مقالات، تطور زمني، كتب وأبحاث مرتبطة، ومصادر قابلة للفتح.',
    [
      ['إجابة مؤسَّسة على الأرشيف', 'لا يبدأ المسار من إجابة عامة على الإنترنت؛ بل يبحث أولاً في المواد المنشورة ويُظهر الاقتباسات والعناوين التي بُنيت عليها النتيجة.'],
      ['تطور السؤال عبر الزمن', 'عندما تمتد الفكرة إلى أكثر من سنة، تظهر المواد الأقدم والأحدث حتى يستطيع القارئ رؤية ما استمر وما تغير.'],
      ['اتصالات أوسع', `يربط السؤال عند الحاجة بين المقالات و${nBooks} كتب و${nPapers} بحثاً محكّماً، مع إبقاء الرابط إلى المادة الأصلية.`],
    ],
    [['/articles','أرشيف المقالات'], ['/research','الأبحاث المحكمة'], ['/publications','المؤلفات']]
  )

  if (path === '/decade') return shell(
    'وثيقة العقد',
    'سيرة فكرية حيّة تقرأ أكثر من عشر سنوات من الكتابة وتكشف تحولات الأسئلة والموضوعات الأكثر إلحاحاً.',
    [
      ['العقد بوصفه مساراً', `تقرأ الوثيقة أرشيف المقالات منذ ${firstYear} باعتباره مساراً زمنياً للأفكار لا مجرد عدّاد للمنشورات.`],
      ['تحولات الأسئلة', 'تُبرز الموضوعات التي استمرت، والمفاهيم التي ظهرت لاحقاً، والانتقال بين التعليم والتقنية والمجتمع والهوية.'],
      ['بوابة لفهم المشروع', 'من يريد صورة واسعة عن المسار الفكري يمكنه البدء من هذه الوثيقة ثم الانتقال إلى المقالات والأبحاث والكتب ذاتها.'],
    ],
    [['/articles','المقالات'], ['/research','الأبحاث'], ['/publications','الكتب'], ['/impact','سجل الأثر']]
  )

  return ''
}

function generateBodyHtml(path, lang = 'ar') {
  if (path === '/admin') {
    return `
      <main style="min-height:100vh;display:grid;place-items:center;background:#FCFCFA;padding:2rem;" dir="rtl">
        <div style="width:min(440px,100%);border:1px solid rgba(62,92,120,.14);border-radius:22px;background:#fff;padding:2rem;text-align:center;">
          <div style="width:42px;height:42px;margin:0 auto 1rem;border:2px solid rgba(62,92,120,.18);border-top-color:#3E5C78;border-radius:999px;animation:admin-spin .8s linear infinite;"></div>
          <p style="margin:0;color:#3E5C78;font:600 1rem 'Tajawal',sans-serif;">جاري فتح لوحة التحكم الآمنة…</p>
          <style>@keyframes admin-spin{to{transform:rotate(360deg)}}</style>
        </div>
      </main>`
  }

  const en = lang === 'en'
  const isAdmin = path === '/admin'
  // Header
  const headerHtml = en ? `
    <header style="border-bottom: 1px solid rgba(62, 92, 120, 0.1); padding: 1.5rem 1rem;">
      <div style="max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
        <div style="font-size: 1.5rem; font-weight: bold; color: #15161A;">د. أحمد حسين الفيلكاوي</div>
        <nav style="display: flex; gap: 1.5rem; flex-wrap: wrap;">
          <a href="/en" style="color: #3E5C78; text-decoration: none; font-weight: 500;">Home</a>
          <a href="/en/cv" style="color: #3E5C78; text-decoration: none; font-weight: 500;">CV</a>
          <a href="/en/research" style="color: #3E5C78; text-decoration: none; font-weight: 500;">Research</a>
          <a href="/en/contact" style="color: #3E5C78; text-decoration: none; font-weight: 500;">Contact</a>
        </nav>
      </div>
    </header>
  ` : `
    <header style="border-bottom: 1px solid rgba(62, 92, 120, 0.1); padding: 1.5rem 1rem;" dir="rtl">
      <div style="max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
        <div style="font-size: 1.5rem; font-weight: bold; font-family: 'El Messiri', serif; color: #15161A;">د. أحمد حسين الفيلكاوي</div>
        <nav style="display: flex; gap: 1.5rem; flex-wrap: wrap;">
          <a href="/" style="color: #3E5C78; text-decoration: none; font-weight: 500;">الرئيسية</a>
          <a href="/articles" style="color: #3E5C78; text-decoration: none; font-weight: 500;">المقالات</a>
          <a href="/publications" style="color: #3E5C78; text-decoration: none; font-weight: 500;">الكتب</a>
          <a href="/research" style="color: #3E5C78; text-decoration: none; font-weight: 500;">الأبحاث</a>
          <a href="/cv" style="color: #3E5C78; text-decoration: none; font-weight: 500;">السيرة</a>
          <a href="/thought" style="color: #3E5C78; text-decoration: none; font-weight: 500;">الخريطة الفكرية</a>
          <a href="/contact" style="color: #3E5C78; text-decoration: none; font-weight: 500;">اتصل بي</a>
        </nav>
      </div>
    </header>
  `

  // Footer
  const footerHtml = en ? `
    <footer style="background: #111215; color: #EAEAE7; padding: 3rem 1rem; margin-top: 4rem; text-align: center;">
      <div style="max-width: 1200px; margin: 0 auto;">
        <p style="margin-bottom: 1rem; font-weight: bold;">د. أحمد حسين الفيلكاوي</p>
        <p style="color: #8AADCC; font-size: 0.9rem;">Professor of Educational Technology and Artificial Intelligence</p>
        <p style="margin-top: 1.25rem;">
          <a href="https://tebyan.dr-alfailakawi.com" target="_blank" rel="noopener noreferrer" title="تبيان — منصة عامة مستقلة" style="display: inline-flex; align-items: center; gap: .45rem; color: #8AADCC; font-size: .82rem; text-decoration: none;">
            <img src="/tebyan-icon.png" alt="" style="width: 20px; height: 20px; border-radius: 999px;" /> Tebyan ↗
          </a>
          <span style="display:inline-block; width: .75rem;"></span>
          <a href="https://schedule.dr-alfailakawi.com" target="_blank" rel="noopener noreferrer" title="برنامج الجدول الدراسي" style="display: inline-flex; align-items: center; gap: .35rem; color: #8AADCC; font-size: .76rem; text-decoration: none; opacity: .84;">
            <span style="display:inline-flex; width: 16px; height: 16px; align-items:center; justify-content:center; border: 1px solid currentColor; border-radius: 5px; font-size: 10px;">▦</span> Schedule ↗
          </a>
        </p>
        <p style="font-size: 0.8rem; color: #626A76; margin-top: 1.5rem;">&copy; ${new Date().getFullYear()} All Rights Reserved.</p>
      </div>
    </footer>
  ` : `
    <footer style="background: #111215; color: #EAEAE7; padding: 3rem 1rem; margin-top: 4rem; text-align: center;" dir="rtl">
      <div style="max-width: 1200px; margin: 0 auto;">
        <p style="margin-bottom: 1rem; font-weight: bold; font-family: 'El Messiri', serif; font-size: 1.25rem;">د. أحمد حسين الفيلكاوي</p>
        <p style="color: #8AADCC; font-size: 0.9rem;">أستاذ تكنولوجيا التعليم والذكاء الاصطناعي</p>
        <p style="margin-top: 1.25rem;">
          <a href="https://tebyan.dr-alfailakawi.com" target="_blank" rel="noopener noreferrer" title="تبيان — منصة عامة مستقلة" style="display: inline-flex; align-items: center; gap: .45rem; color: #8AADCC; font-size: .82rem; text-decoration: none;">
            <img src="/tebyan-icon.png" alt="" style="width: 20px; height: 20px; border-radius: 999px;" /> تبيان ↗
          </a>
          <span style="display:inline-block; width: .75rem;"></span>
          <a href="https://schedule.dr-alfailakawi.com" target="_blank" rel="noopener noreferrer" title="برنامج الجدول الدراسي" style="display: inline-flex; align-items: center; gap: .35rem; color: #8AADCC; font-size: .76rem; text-decoration: none; opacity: .84;">
            <span style="display:inline-flex; width: 16px; height: 16px; align-items:center; justify-content:center; border: 1px solid currentColor; border-radius: 5px; font-size: 10px;">▦</span> الجدول الدراسي ↗
          </a>
        </p>
        <p style="font-size: 0.8rem; color: #626A76; margin-top: 1.5rem;">&copy; ${new Date().getFullYear()} جميع الحقوق محفوظة.</p>
      </div>
    </footer>
  `

  let contentHtml = ''

  if (LEGAL_STATIC[path]) {
    contentHtml = legalStaticHtml(path)
  } else if (path === '/' || path === '/en') {
    if (en) {
      contentHtml = `
        <main style="max-width: 800px; margin: 4rem auto; padding: 0 1rem; text-align: center;">
          <h1 style="font-size: 3rem; margin-bottom: 1rem; font-weight: bold; color: #15161A;">I keep the human at the heart of the machine.</h1>
          <p style="font-size: 1.25rem; color: #626A76; line-height: 1.6; margin-bottom: 2rem;">
            Official website of Dr. Ahmad H. Alfailakawi, Professor of Educational Technology and Artificial Intelligence in Kuwait.
          </p>
          <div style="background: rgba(62, 92, 120, 0.05); padding: 2rem; border-radius: 8px; margin-bottom: 3rem; text-align: left;">
            <h2 style="font-size: 1.5rem; margin-bottom: 1rem; font-weight: bold; color: #3E5C78;">Academic Bio</h2>
            <p style="line-height: 1.7; color: #15161A;">
              Ph.D. in Education, Educational Technology major from University of Northern Colorado. Associate Professor at College of Basic Education (PAAET) and delegated professor at College of Education in Kuwait University. Expert and Consultant at Ministry of Information.
            </p>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-top: 3rem;">
            <div style="padding: 1.5rem; border: 1px solid rgba(62, 92, 120, 0.1); border-radius: 6px;">
              <h3 style="font-size: 2rem; color: #3E5C78; font-weight: bold; margin-bottom: 0.5rem;">${nBooks}</h3>
              <p style="color: #626A76; font-size: 0.9rem; margin: 0;">Published Books</p>
            </div>
            <div style="padding: 1.5rem; border: 1px solid rgba(62, 92, 120, 0.1); border-radius: 6px;">
              <h3 style="font-size: 2rem; color: #3E5C78; font-weight: bold; margin-bottom: 0.5rem;">${nPapers}</h3>
              <p style="color: #626A76; font-size: 0.9rem; margin: 0;">Peer-reviewed Papers</p>
            </div>
            <div style="padding: 1.5rem; border: 1px solid rgba(62, 92, 120, 0.1); border-radius: 6px;">
              <h3 style="font-size: 2rem; color: #3E5C78; font-weight: bold; margin-bottom: 0.5rem;">${articles.length}</h3>
              <p style="color: #626A76; font-size: 0.9rem; margin: 0;">Intellectual Articles</p>
            </div>
          </div>
        </main>
      `
    } else {
      contentHtml = `
        <main style="max-width: 800px; margin: 4rem auto; padding: 0 1rem; text-align: center;" dir="rtl">
          <h1 style="font-size: 3rem; margin-bottom: 1.5rem; font-family: 'El Messiri', serif; font-weight: bold; color: #15161A; line-height: 1.2;">أُبقي الإنسان<br>في قلب الآلة.</h1>
          <p style="font-size: 1.25rem; color: #626A76; line-height: 1.7; margin-bottom: 2.5rem; font-family: 'Tajawal', sans-serif;">
            الموقع الرسمي للدكتور أحمد حسين الفيلكاوي، أستاذ تكنولوجيا التعليم والذكاء الاصطناعي، الكاتب والباحث والمستشار الكويتي.
          </p>
          <div style="background: rgba(62, 92, 120, 0.05); padding: 2rem; border-radius: 8px; margin-bottom: 3rem; text-align: right; border-right: 4px solid #3E5C78;">
            <h2 style="font-size: 1.5rem; margin-bottom: 1rem; font-family: 'El Messiri', serif; font-weight: bold; color: #3E5C78;">السيرة الأكاديمية والمهنية</h2>
            <p style="line-height: 1.8; color: #15161A; font-family: 'Tajawal', sans-serif;">
              حاصل على دكتوراه الفلسفة في التربية، تخصص تكنولوجيا التعليم من جامعة شمال كولورادو. أستاذ مشارك في كلية التربية الأساسية (PAAET) وأستاذ منتدب في كلية التربية بجامعة الكويت. خبير ومستشار في وزارة الإعلام والمجلس الوطني للثقافة والفنون والآداب ومكتبة الكويت الوطنية والهيئة العامة للشباب.
            </p>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-top: 3rem; font-family: 'Tajawal', sans-serif;">
            <div style="padding: 1.5rem; border: 1px solid rgba(62, 92, 120, 0.1); border-radius: 6px;">
              <h3 style="font-size: 2rem; color: #3E5C78; font-weight: bold; margin-bottom: 0.5rem;">${nBooks}</h3>
              <p style="color: #626A76; font-size: 0.9rem; margin: 0;">كتب منشورة</p>
            </div>
            <div style="padding: 1.5rem; border: 1px solid rgba(62, 92, 120, 0.1); border-radius: 6px;">
              <h3 style="font-size: 2rem; color: #3E5C78; font-weight: bold; margin-bottom: 0.5rem;">${nPapers}</h3>
              <p style="color: #626A76; font-size: 0.9rem; margin: 0;">أبحاثاً محكّمة</p>
            </div>
            <div style="padding: 1.5rem; border: 1px solid rgba(62, 92, 120, 0.1); border-radius: 6px;">
              <h3 style="font-size: 2rem; color: #3E5C78; font-weight: bold; margin-bottom: 0.5rem;">${articles.length}</h3>
              <p style="color: #626A76; font-size: 0.9rem; margin: 0;">مقالات فكرية</p>
            </div>
          </div>
        </main>
      `
    }
  } else if (path === '/articles') {
    const listHtml = articles.map(a => `
      <article style="margin-bottom: 2.5rem; border-bottom: 1px solid rgba(62, 92, 120, 0.1); padding-bottom: 2rem; text-align: right;">
        <h2 style="font-size: 1.75rem; font-family: 'El Messiri', serif; margin-bottom: 0.75rem;">
          <a href="/articles/${a.slug}" style="color: #15161A; text-decoration: none; transition: color 0.2s;">${esc(a.title)}</a>
        </h2>
        <div style="color: #626A76; font-size: 0.9rem; margin-bottom: 1rem; font-family: 'Tajawal', sans-serif;">
          <span>${esc(a.cat)}</span> &middot; <span>${esc(a.date)}</span>
        </div>
        <p style="color: #15161A; line-height: 1.7; font-size: 1.05rem; font-family: 'Tajawal', sans-serif;">${esc(a.excerpt)}</p>
        <div style="margin-top: 1rem;">
          <a href="/articles/${a.slug}" style="color: #3E5C78; text-decoration: none; font-weight: bold; font-size: 0.95rem; font-family: 'Tajawal', sans-serif;">اقرأ المقال بالكامل &larr;</a>
        </div>
      </article>
    `).join('')

    contentHtml = `
      <main style="max-width: 800px; margin: 4rem auto; padding: 0 1rem;" dir="rtl">
        <h1 style="font-size: 2.5rem; font-family: 'El Messiri', serif; font-weight: bold; margin-bottom: 1rem; text-align: right; color: #15161A;">مقالاتي الفكرية</h1>
        <p style="font-size: 1.15rem; color: #626A76; line-height: 1.7; margin-bottom: 3rem; text-align: right; font-family: 'Tajawal', sans-serif;">
          أرشيف المقالات الفكرية والتربوية والتقنية المنشورة في جريدة الجريدة وجريدة القبس ومختلف المنابر الثقافية.
        </p>
        <div style="margin-top: 2rem;">
          ${listHtml}
        </div>
      </main>
    `
  } else if (path.startsWith('/articles/')) {
    const slug = path.split('/').pop()
    const a = articles.find(x => x.slug === slug)
    if (a) {
      const bodyKey = a.slug + 'arabic'
      const fullText = a.body || bodies[bodyKey] || bodies[a.slug] || a.excerpt
      const paragraphs = fullText.split(/\n+/).filter(Boolean).map(p => `
        <p style="line-height: 1.8; margin-bottom: 1.5rem; font-size: 1.15rem; color: #15161A; text-align: justify; font-family: 'Tajawal', sans-serif;">${esc(p)}</p>
      `).join('')

      contentHtml = `
        <main style="max-width: 740px; margin: 4rem auto; padding: 0 1rem;" dir="rtl">
          <div style="margin-bottom: 2rem; text-align: right;">
            <a href="/articles" style="color: #3E5C78; text-decoration: none; font-weight: 500; font-family: 'Tajawal', sans-serif;">&rarr; العودة للمقالات</a>
          </div>
          <article>
            <header style="margin-bottom: 3rem; text-align: right;">
              <div style="color: #3E5C78; font-weight: bold; font-size: 1rem; margin-bottom: 0.5rem; font-family: 'Tajawal', sans-serif;">${esc(a.cat)}</div>
              <h1 style="font-size: 2.5rem; font-family: 'El Messiri', serif; font-weight: bold; color: #15161A; margin-bottom: 1rem; line-height: 1.3;">${esc(a.title)}</h1>
              <div style="color: #626A76; font-size: 0.95rem; font-family: 'Tajawal', sans-serif;">
                تاريخ النشر: <span>${esc(a.date)}</span> &middot; الكاتب: د. أحمد حسين الفيلكاوي
              </div>
            </header>
            <section style="margin-top: 2rem;">
              ${paragraphs}
            </section>
          </article>
        </main>
      `
    }
  } else if (path === '/publications') {
    const booksHtml = books.map(b => `
      <div style="margin-bottom: 3rem; border: 1px solid rgba(62, 92, 120, 0.1); padding: 2rem; border-radius: 8px; text-align: right;">
        <h2 style="font-size: 1.75rem; font-family: 'El Messiri', serif; margin-bottom: 0.5rem; color: #15161A;">
          <a href="/publications/${b.slug}" style="color: #15161A; text-decoration: none;">${esc(b.title)}</a>
        </h2>
        <p style="color: #626A76; font-size: 1.05rem; line-height: 1.7; font-family: 'Tajawal', sans-serif; margin-bottom: 1.5rem;">${esc(b.desc)}</p>
        <div>
          <a href="/publications/${b.slug}" style="color: #3E5C78; text-decoration: none; font-weight: bold; font-family: 'Tajawal', sans-serif;">عرض تفاصيل الكتاب &larr;</a>
        </div>
      </div>
    `).join('')

    contentHtml = `
      <main style="max-width: 800px; margin: 4rem auto; padding: 0 1rem;" dir="rtl">
        <h1 style="font-size: 2.5rem; font-family: 'El Messiri', serif; font-weight: bold; margin-bottom: 1rem; text-align: right; color: #15161A;">الكتب والمؤلفات</h1>
        <p style="font-size: 1.15rem; color: #626A76; line-height: 1.7; margin-bottom: 3rem; text-align: right; font-family: 'Tajawal', sans-serif;">
          المؤلفات والكتب العلمية والتربوية والمنهجية المنشورة للدكتور أحمد حسين الفيلكاوي في مجالات تكنولوجيا التعليم والتغيير المعرفي.
        </p>
        <div style="margin-top: 2rem;">
          ${booksHtml}
        </div>
      </main>
    `
  } else if (path.startsWith('/publications/')) {
    const slug = path.split('/').pop()
    const b = books.find(x => x.slug === slug)
    if (b) {
      contentHtml = `
        <main style="max-width: 800px; margin: 4rem auto; padding: 0 1rem;" dir="rtl">
          <div style="margin-bottom: 2rem; text-align: right;">
            <a href="/publications" style="color: #3E5C78; text-decoration: none; font-weight: 500; font-family: 'Tajawal', sans-serif;">&rarr; العودة للكتب</a>
          </div>
          <article style="text-align: right;">
            <header style="margin-bottom: 2rem;">
              <h1 style="font-size: 2.5rem; font-family: 'El Messiri', serif; font-weight: bold; color: #15161A; margin-bottom: 1rem;">كتاب: ${esc(b.title)}</h1>
              <p style="color: #626A76; font-size: 1.05rem; font-family: 'Tajawal', sans-serif;">المؤلف: د. أحمد حسين الفيلكاوي</p>
            </header>
            <section style="background: rgba(62, 92, 120, 0.03); padding: 2.5rem; border-radius: 8px; border-right: 4px solid #3E5C78; margin-bottom: 2rem;">
              <p style="line-height: 1.8; font-size: 1.15rem; color: #15161A; font-family: 'Tajawal', sans-serif; margin: 0;">${esc(b.desc)}</p>
            </section>
          </article>
        </main>
      `
    }
  } else if (path === '/en/contact') {
    contentHtml = `
      <main style="max-width: 800px; margin: 4rem auto; padding: 0 1rem; text-align:left;">
        <p style="color:#3E5C78;font-size:.8rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">Contact</p>
        <h1 style="font-size:2.5rem;font-weight:700;line-height:1.2;color:#15161A;margin:1rem 0;">Start with the purpose, not a long form.</h1>
        <p style="font-size:1.08rem;color:#626A76;line-height:1.75;max-width:42rem;">Consulting, keynotes, workshops, media interviews and research collaboration with Dr. Ahmad H. Alfailakawi.</p>
        <div style="margin-top:2.25rem;display:grid;gap:.75rem;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));">
          ${['Consultation','Keynote or workshop','Media interview','Research collaboration'].map((label) => `<div style="border:1px solid rgba(62,92,120,.14);border-radius:18px;padding:1.15rem;background:#FCFCFA;color:#15161A;font-weight:600;">${label}</div>`).join('')}
        </div>
        <p style="margin-top:2rem;color:#626A76;line-height:1.7;">The secure enquiry form opens when the page loads. You can also use the English navigation above to review the CV and research record before getting in touch.</p>
      </main>
    `
  } else if (path === '/research' || path === '/en/research') {
    if (en) {
      const papersHtml = papers.map(p => `
        <div style="margin-bottom: 2rem; border-bottom: 1px solid rgba(62, 92, 120, 0.1); padding-bottom: 1.5rem; text-align: left;">
          <h2 style="font-size: 1.5rem; font-weight: bold; margin-bottom: 0.5rem; color: #15161A;">
            <a href="/research/${p.slug}" style="color: #15161A; text-decoration: none;">${esc(p.title)}</a>
          </h2>
          <p style="color: #626A76; font-size: 0.95rem; margin-bottom: 0.5rem;">${esc(p.meta)}</p>
          <p style="color: #3E5C78; font-size: 0.85rem; font-weight: 500; margin: 0;">${p.coAuthors ? `Main author: Dr. Ahmad Hussein Alfailakawi · Co-author: ${esc(p.coAuthors)}` : 'Author: Dr. Ahmad Hussein Alfailakawi'}</p>
        </div>
      `).join('')

      contentHtml = `
        <main style="max-width: 800px; margin: 4rem auto; padding: 0 1rem;">
          <h1 style="font-size: 2.5rem; font-weight: bold; margin-bottom: 1rem; text-align: left; color: #15161A;">Scholarly Contributions</h1>
          <p style="font-size: 1.1rem; color: #626A76; line-height: 1.6; margin-bottom: 3rem; text-align: left;">
            Peer-reviewed papers and academic contributions on educational technology, virtual classrooms, and e-learning systems.
          </p>
          <div style="margin-top: 2rem;">
            ${papersHtml}
          </div>
        </main>
      `
    } else {
      const papersHtml = papers.map(p => `
        <div style="margin-bottom: 2rem; border-bottom: 1px solid rgba(62, 92, 120, 0.1); padding-bottom: 1.5rem; text-align: right;">
          <h2 dir="auto" style="font-size: 1.5rem; font-family: 'El Messiri', serif; margin-bottom: 0.5rem; color: #15161A;">
            <a href="/research/${p.slug}" style="color: #15161A; text-decoration: none;">${esc(p.title)}</a>
          </h2>
          <p style="color: #626A76; font-size: 0.95rem; font-family: 'Tajawal', sans-serif; margin-bottom: 0.5rem;">${esc(p.meta)}</p>
          <p style="color: #3E5C78; font-size: 0.85rem; font-family: 'Tajawal', sans-serif; font-weight: 500; margin: 0;">${p.coAuthors ? 'الباحثون' : 'الباحث'}: د. أحمد حسين الفيلكاوي${p.coAuthors ? `، ${esc(p.coAuthors)}` : ''}</p>
        </div>
      `).join('')

      contentHtml = `
        <main style="max-width: 800px; margin: 4rem auto; padding: 0 1rem;" dir="rtl">
          <h1 style="font-size: 2.5rem; font-family: 'El Messiri', serif; font-weight: bold; margin-bottom: 1rem; text-align: right; color: #15161A;">المساهمات والأوراق العلمية المحكّمة</h1>
          <p style="font-size: 1.15rem; color: #626A76; line-height: 1.7; margin-bottom: 3rem; text-align: right; font-family: 'Tajawal', sans-serif;">
            الأبحاث والدراسات العلمية المحكّمة المنشورة في المجلات والدوريات الأكاديمية العالمية والمحلية في مجالات تكنولوجيا التعليم والتحول الرقمي.
          </p>
          <div style="margin-top: 2rem;">
            ${papersHtml}
          </div>
        </main>
      `
    }
  } else if (path.startsWith('/research/')) {
    const slug = path.split('/').pop()
    const p = papers.find(x => x.slug === slug)
    if (p) {
      contentHtml = `
        <main style="max-width: 800px; margin: 4rem auto; padding: 0 1rem;" dir="rtl">
          <div style="margin-bottom: 2rem; text-align: right;">
            <a href="/research" style="color: #3E5C78; text-decoration: none; font-weight: 500; font-family: 'Tajawal', sans-serif;">&rarr; العودة للأبحاث</a>
          </div>
          <article style="text-align: right;">
            <header style="margin-bottom: 2rem;">
              <h1 dir="auto" style="font-size: 2.25rem; font-family: 'El Messiri', serif; font-weight: bold; color: #15161A; margin-bottom: 1rem; line-height: 1.3;">بحث محكّم: ${esc(p.title)}</h1>
              <p style="color: #626A76; font-size: 1.05rem; font-family: 'Tajawal', sans-serif;">${p.coAuthors ? 'الباحثون' : 'الباحث'}: د. أحمد حسين الفيلكاوي${p.coAuthors ? `، ${esc(p.coAuthors)}` : ''}</p>
            </header>
            <section style="background: rgba(62, 92, 120, 0.03); padding: 2.5rem; border-radius: 8px; border-right: 4px solid #3E5C78; margin-bottom: 2rem;">
              <p style="color: #3E5C78; font-size: .85rem; font-weight: 700; font-family: 'Tajawal', sans-serif; margin: 0 0 .75rem;">الملخص</p>
              <p style="line-height: 1.8; font-size: 1.15rem; color: #15161A; font-family: 'Tajawal', sans-serif; margin: 0;">${esc(p.abstractAr || p.meta)}</p>
            </section>
            ${(p.source || p.pdf || p.researchgate || p.scholar) ? `<nav aria-label="روابط البحث" style="display:flex;flex-wrap:wrap;gap:.75rem;font-family:'Tajawal',sans-serif;">${p.source ? `<a href="${attr(p.source)}" rel="noopener noreferrer" style="border:1px solid rgba(62,92,120,.25);border-radius:999px;padding:.65rem 1rem;color:#3E5C78;text-decoration:none">صفحة الناشر</a>` : ''}${p.pdf ? `<a href="${attr(p.pdf)}" rel="noopener noreferrer" style="border:1px solid rgba(62,92,120,.25);border-radius:999px;padding:.65rem 1rem;color:#3E5C78;text-decoration:none">تنزيل PDF</a>` : ''}${p.researchgate ? `<a href="${attr(p.researchgate)}" rel="noopener noreferrer" style="border:1px solid rgba(62,92,120,.25);border-radius:999px;padding:.65rem 1rem;color:#3E5C78;text-decoration:none">ResearchGate</a>` : ''}${p.scholar ? `<a href="${attr(p.scholar)}" rel="noopener noreferrer" style="border:1px solid rgba(62,92,120,.25);border-radius:999px;padding:.65rem 1rem;color:#3E5C78;text-decoration:none">Google Scholar</a>` : ''}</nav>` : ''}
          </article>
        </main>
      `
    }
  } else if (path === '/media') {
    const mediaHtml = media.map((item) => `
      <article style="margin-bottom: 2rem; border-bottom: 1px solid rgba(62, 92, 120, 0.1); padding-bottom: 1.5rem; text-align: right;">
        <h2 style="font-size: 1.45rem; font-family: 'El Messiri', serif; margin-bottom: 0.5rem; color: #15161A;">
          <a href="/media/${attr(item.slug)}" style="color: #15161A; text-decoration: none;">${esc(item.title)}</a>
        </h2>
        <p style="color: #626A76; font-size: 0.95rem; font-family: 'Tajawal', sans-serif; margin: 0;">${esc(item.program || 'لقاء إعلامي')} · ${esc(item.channel || item.outlet || '')}${item.date ? ` · ${esc(item.date)}` : ''}${item.duration ? ` · ${esc(item.duration)}` : ''}</p>
        ${item.topics ? `<p style="color:#626A76;font-size:.9rem;line-height:1.7;font-family:'Tajawal',sans-serif;">${esc(item.topics)}</p>` : ''}
      </article>
    `).join('')

    contentHtml = `
      <main style="max-width: 800px; margin: 4rem auto; padding: 0 1rem;" dir="rtl">
        <h1 style="font-size: 2.5rem; font-family: 'El Messiri', serif; font-weight: bold; margin-bottom: 1rem; text-align: right; color: #15161A;">الظهور الإعلامي</h1>
        <p style="font-size: 1.15rem; color: #626A76; line-height: 1.7; margin-bottom: 3rem; text-align: right; font-family: 'Tajawal', sans-serif;">
          مقتطفات من اللقاءات الإذاعية والتلفزيونية حيث يتحول الحوار إلى منصة للفكر.
        </p>
        ${mediaHtml}
      </main>
    `
  } else if (path.startsWith('/media/')) {
    const slug = path.split('/').pop()
    const item = media.find((entry) => entry.slug === slug)
    if (item) {
      const itemVideoId = youtubeId(item.url)
      const videoThumbnail = item.thumbnail || (itemVideoId ? `https://i.ytimg.com/vi/${itemVideoId}/hqdefault.jpg` : '')
      const transcript = item.transcript || mediaTranscripts[itemVideoId] || ''
      // رابط الصوت الموقّع من اللوحة، أو مجلد الاستضافة الخارجي إن عُرِّف متغيره.
      const mediaAudioBase = String(process.env.VITE_MEDIA_AUDIO_BASE_URL || process.env.VITE_AUDIO_BASE_URL || '').replace(/\/+$/, '')
      const hostedAudio = item.audioUrl
        || (item.audioFile && mediaAudioBase ? `${mediaAudioBase}/${encodeURIComponent(item.audioFile)}` : '')
      contentHtml = `
        <main style="max-width:900px;margin:4rem auto;padding:0 1rem;" dir="rtl">
          <p><a href="/media" style="color:#3E5C78;text-decoration:none;font-family:'Tajawal',sans-serif;">&rarr; العودة إلى الظهور الإعلامي</a></p>
          <article style="text-align:right;">
            <header style="margin:2rem 0;">
              <p style="color:#3E5C78;font-family:'Tajawal',sans-serif;">${esc(item.program || 'لقاء إعلامي')} · ${esc(item.channel || item.outlet || '')}${item.date ? ` · ${esc(item.date)}` : ''}${item.duration ? ` · ${esc(item.duration)}` : ''}</p>
              <h1 style="font-size:2.4rem;font-family:'El Messiri',serif;line-height:1.4;color:#15161A;">${esc(item.title)}</h1>
            </header>
            ${itemVideoId ? `<div style="position:relative;aspect-ratio:16/9;overflow:hidden;border-radius:18px;background:#15161A;"><iframe src="https://www.youtube-nocookie.com/embed/${attr(itemVideoId)}?rel=0" title="${attr(item.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen style="position:absolute;inset:0;width:100%;height:100%;border:0;"></iframe></div>` : hostedAudio ? `<div style="border-radius:18px;background:#F4F2EE;padding:1.4rem;"><p style="margin:0 0 .8rem;font-family:'Tajawal',sans-serif;color:#3E5C78;font-weight:600;">التسجيل الصوتي</p><audio controls preload="metadata" src="${attr(hostedAudio)}" style="width:100%;">متصفحك لا يدعم تشغيل الصوت.</audio></div>` : videoThumbnail ? `<img src="${attr(videoThumbnail)}" alt="${attr(item.title)}" width="1280" height="720" style="width:100%;height:auto;border-radius:18px;" />` : ''}
            ${item.topics ? `<section style="margin-top:2rem;"><h2 style="font-family:'El Messiri',serif;">موضوعات اللقاء</h2><p style="font-family:'Tajawal',sans-serif;line-height:1.9;color:#626A76;">${esc(item.topics)}</p></section>` : ''}
            ${transcript ? `<section style="margin-top:2rem;"><h2 style="font-family:'El Messiri',serif;">النص المفرّغ</h2><p style="font-family:'Tajawal',sans-serif;line-height:1.9;color:#626A76;white-space:pre-line;">${esc(transcript)}</p></section>` : ''}
          </article>
        </main>
      `
    }
  } else if (richStaticHtml(path)) {
    contentHtml = richStaticHtml(path)
  } else if (['/about', '/contact', '/ask', '/thought', '/decade', '/impact', '/cv/impact', '/thought-paths', '/search', '/atlas', '/questions', '/radar', '/curated', '/upcoming', '/inbox'].includes(path)) {
    const current = STATIC.find((item) => item.path === path)
    const links = [
      ['/', 'الرئيسية'],
      ['/articles', 'المقالات'],
      ['/publications', 'الكتب'],
      ['/research', 'الأبحاث'],
      ['/media', 'الإعلام'],
      ['/cv', 'السيرة'],
      ['/contact', 'التواصل'],
    ].map(([href, label]) => `<a href="${href}" style="color:#3E5C78;text-decoration:none;font-weight:600;">${label}</a>`).join(' · ')
    contentHtml = `
      <main style="max-width: 800px; margin: 4rem auto; padding: 0 1rem;" dir="rtl">
        <h1 style="font-size: 2.5rem; font-family: 'El Messiri', serif; font-weight: bold; margin-bottom: 1rem; text-align: right; color: #15161A;">${esc(current?.title || 'د. أحمد حسين الفيلكاوي')}</h1>
        <p style="font-size: 1.15rem; color: #626A76; line-height: 1.8; margin-bottom: 2rem; text-align: right; font-family: 'Tajawal', sans-serif;">
          ${esc(current?.desc || 'صفحة عامة من الموقع الرسمي للدكتور أحمد حسين الفيلكاوي.')}
        </p>
        <nav aria-label="روابط داخلية" style="line-height:2;font-family:'Tajawal',sans-serif;text-align:right;">${links}</nav>
      </main>
    `
  } else if (path === '/cv' || path === '/en/cv') {
    if (en) {
      contentHtml = `
        <main style="max-width: 800px; margin: 4rem auto; padding: 0 1rem;">
          <h1 style="font-size: 2.5rem; font-weight: bold; margin-bottom: 1.5rem; color: #15161A;">Academic Curriculum Vitae</h1>
          <p style="font-size: 1.15rem; color: #626A76; line-height: 1.6; margin-bottom: 3rem;">
            Dr. Ahmad H. Alfailakawi - Professor of Educational Technology and AI.
          </p>
          
          <section style="margin-bottom: 3rem;">
            <h2 style="font-size: 1.75rem; font-weight: bold; color: #3E5C78; border-bottom: 2px solid rgba(62, 92, 120, 0.1); padding-bottom: 0.5rem; margin-bottom: 1.5rem;">Education</h2>
            <ul style="list-style-type: none; padding: 0; line-height: 1.8;">
              <li style="margin-bottom: 1rem;">
                <strong>Ph.D. in Education (Educational Technology)</strong><br>
                University of Northern Colorado, Greeley, Colorado - Summa Cum Laude
              </li>
              <li style="margin-bottom: 1rem;">
                <strong>Master in Educational Technology</strong><br>
                University of Northern Colorado - Summa Cum Laude
              </li>
              <li style="margin-bottom: 1rem;">
                <strong>B.Ed. in Educational Technology</strong><br>
                The Public Authority for Applied Education and Training (PAAET) - Summa Cum Laude
              </li>
            </ul>
          </section>

          <section style="margin-bottom: 3rem;">
            <h2 style="font-size: 1.75rem; font-weight: bold; color: #3E5C78; border-bottom: 2px solid rgba(62, 92, 120, 0.1); padding-bottom: 0.5rem; margin-bottom: 1.5rem;">Academic Teaching</h2>
            <ul style="list-style-type: none; padding: 0; line-height: 1.8;">
              <li style="margin-bottom: 1rem;">
                <strong>Associate Professor</strong> (Jan 2020 - Present)<br>
                College of Basic Education, PAAET
              </li>
              <li style="margin-bottom: 1rem;">
                <strong>Assistant Professor</strong> (Until Jan 2020)<br>
                College of Basic Education, PAAET
              </li>
              <li style="margin-bottom: 1rem;">
                <strong>Delegated Professor</strong><br>
                College of Education, Kuwait University
              </li>
            </ul>
          </section>
        </main>
      `
    } else {
      contentHtml = `
        <main style="max-width: 800px; margin: 4rem auto; padding: 0 1rem;" dir="rtl">
          <h1 style="font-size: 2.5rem; font-family: 'El Messiri', serif; font-weight: bold; margin-bottom: 1.5rem; text-align: right; color: #15161A;">السيرة الأكاديمية والمهنية</h1>
          <p style="font-size: 1.15rem; color: #626A76; line-height: 1.7; margin-bottom: 3rem; text-align: right; font-family: 'Tajawal', sans-serif;">
            د. أحمد حسين الفيلكاوي - أستاذ تكنولوجيا التعليم والذكاء الاصطناعي، الكاتب والمستشار الكويتي.
          </p>

          <section style="margin-bottom: 3rem; text-align: right;">
            <h2 style="font-size: 1.75rem; font-family: 'El Messiri', serif; font-weight: bold; color: #3E5C78; border-bottom: 2px solid rgba(62, 92, 120, 0.1); padding-bottom: 0.5rem; margin-bottom: 1.5rem;">الدرجات الأكاديمية</h2>
            <ul style="list-style-type: none; padding: 0; line-height: 2; font-family: 'Tajawal', sans-serif;">
              <li style="margin-bottom: 1rem; border-right: 3px solid #3E5C78; padding-right: 1rem;">
                <strong>دكتوراه الفلسفة في التربية — تكنولوجيا التعليم</strong><br>
                جامعة شمال كولورادو، غريلي، كولورادو &middot; بدرجة امتياز مع مرتبة الشرف
              </li>
              <li style="margin-bottom: 1rem; border-right: 3px solid #3E5C78; padding-right: 1rem;">
                <strong>ماجستير في تكنولوجيا التعليم</strong><br>
                جامعة شمال كولورادو &middot; بدرجة امتياز مع مرتبة الشرف
              </li>
              <li style="margin-bottom: 1rem; border-right: 3px solid #3E5C78; padding-right: 1rem;">
                <strong>بكالوريوس التربية في تكنولوجيا التعليم</strong><br>
                الهيئة العامة للتعليم التطبيقي والتدريب (PAAET) &middot; بدرجة امتياز مع مرتبة الشرف
              </li>
            </ul>
          </section>

          <section style="margin-bottom: 3rem; text-align: right;">
            <h2 style="font-size: 1.75rem; font-family: 'El Messiri', serif; font-weight: bold; color: #3E5C78; border-bottom: 2px solid rgba(62, 92, 120, 0.1); padding-bottom: 0.5rem; margin-bottom: 1.5rem;">الخبرة الأكاديمية والتدريس</h2>
            <ul style="list-style-type: none; padding: 0; line-height: 2; font-family: 'Tajawal', sans-serif;">
              <li style="margin-bottom: 1rem;">
                <strong>أستاذ مشارك</strong> (يناير 2020 حتى الآن) &middot; كلية التربية الأساسية (PAAET)
              </li>
              <li style="margin-bottom: 1rem;">
                <strong>أستاذ مساعد</strong> (حتى يناير 2020) &middot; كلية التربية الأساسية (PAAET)
              </li>
              <li style="margin-bottom: 1rem;">
                <strong>أستاذ منتدب</strong> &middot; كلية التربية بجامعة الكويت
              </li>
            </ul>
          </section>

          <section style="margin-bottom: 3rem; text-align: right;">
            <h2 style="font-size: 1.75rem; font-family: 'El Messiri', serif; font-weight: bold; color: #3E5C78; border-bottom: 2px solid rgba(62, 92, 120, 0.1); padding-bottom: 0.5rem; margin-bottom: 1.5rem;">الاستشارات والخبرة المهنية</h2>
            <ul style="list-style-type: none; padding: 0; line-height: 2; font-family: 'Tajawal', sans-serif;">
              <li style="margin-bottom: 0.75rem;">&bull; خبير ومستشار مكتب الوزير &middot; وزارة الإعلام</li>
              <li style="margin-bottom: 0.75rem;">&bull; مستشار &middot; المجلس الوطني للثقافة والفنون والآداب</li>
              <li style="margin-bottom: 0.75rem;">&bull; مستشار &middot; مكتبة الكويت الوطنية</li>
              <li style="margin-bottom: 0.75rem;">&bull; خبير ومستشار &middot; الهيئة العامة للشباب</li>
            </ul>
          </section>
        </main>
      `
    }
  } else {
    contentHtml = `
      <main style="max-width: 800px; margin: 4rem auto; padding: 0 1rem; text-align: ${en ? 'left' : 'right'};" ${en ? '' : 'dir="rtl"'}>
        <h1 style="font-size: 2.5rem; font-family: ${en ? 'inherit' : "'El Messiri', serif"}; font-weight: bold; color: #15161A; margin-bottom: 1rem;">د. أحمد حسين الفيلكاوي</h1>
        <p style="font-size: 1.15rem; color: #626A76; line-height: 1.7; font-family: ${en ? 'inherit' : "'Tajawal', sans-serif"};">
          أستاذ تكنولوجيا التعليم والذكاء الاصطناعي · باحث · مستشار تربوي
        </p>
      </main>
    `
  }

  return `${headerHtml}\n${contentHtml}\n${footerHtml}`
}

function clockSeconds(value = '') {
  return String(value).split(':').reduce((total, part) => total * 60 + (Number(part) || 0), 0)
}

function schemaDuration(value = '') {
  const seconds = clockSeconds(value)
  if (!seconds) return undefined
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const rest = seconds % 60
  return `PT${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}${rest ? `${rest}S` : ''}`
}

function youtubeId(value = '') {
  return (String(value).match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{6,})/) || [])[1] || ''
}

/* Google VideoObject requires uploadDate as DateTime, not a bare calendar date.
   The archive intentionally stores many historical media dates as YYYY-MM-DD only.
   Normalize those to an ISO 8601 DateTime with the site's Kuwait timezone while
   preserving any already-valid timestamp supplied by future CMS entries. */
function schemaMediaDateTime(value = '') {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const normalized = `${raw}T00:00:00+03:00`
    return Number.isNaN(Date.parse(normalized)) ? '' : normalized
  }
  if (!Number.isNaN(Date.parse(raw)) && /T/.test(raw)) return raw
  return ''
}

function render({ path, title, desc, type = 'website', iso, cat, image, robots, lang = 'ar', isbn, year, edition, publisher, pageCount, url: videoUrl, duration, topics, thumbnail, program, channel, clipStart, clipEnd, audioUrl, audioFile }) {
  const en = lang === 'en'
  const isAdmin = path === '/admin'
  const mediaUploadDate = schemaMediaDateTime(iso)
  // ما دامت المرآة مخفية: صفحاتها الإنجليزية لا تُفهرس
  if (en && !SHOW_EN) robots = 'noindex, nofollow'
  // لا تُلحق الاسم إن كان العنوان يحمله أصلاً — يمنع تضاعفه
  const hasName = title.includes('Alfailakawi') || title.includes('د. أحمد حسين الفيلكاوي')
  const full = isAdmin ? title : path === '/' || hasName ? title : en ? `${title} — Dr. Ahmad H. Alfailakawi` : `${title} — د. أحمد حسين الفيلكاوي`
  const url = SITE + path
  /* بطاقة المقال الخاصة إن وُلدت، وإلا البطاقة الموحدة */
  const resolvedImage = image || thumbnail
  const img = resolvedImage
    ? (/^https?:\/\//.test(resolvedImage) ? resolvedImage : `${SITE}${resolvedImage}`)
    : `${SITE}${en ? HOME_OG_EN : HOME_OG_AR}`

  // مسار التفصيل يحدّد نوع Schema والفتات (Breadcrumb)
  const isArticlePage = /^\/(?:en\/)?articles\//.test(path)
  const isPaperPage = /^\/(?:en\/)?research\//.test(path)
  const isBookPage = /^\/(?:en\/)?publications\//.test(path)
  const isMediaPage = /^\/(?:en\/)?media\//.test(path)
  const section = isArticlePage ? ['المقالات', '/articles']
    : isPaperPage ? ['المساهمات العلمية', '/research']
    : isBookPage ? ['المؤلفات', '/publications']
    : isMediaPage ? ['الظهور الإعلامي', '/media'] : null
  const crumb = section && {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: en ? 'Home' : 'الرئيسية', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: section[0], item: SITE + section[1] },
      { '@type': 'ListItem', position: 3, name: title, item: url },
    ],
  }

  let graph
  if (path === '/' || path === '/en') {
    // الرئيسية: هوية الموقع + المؤلف (ProfilePage) — أساس كِيان غوغل
    graph = [
      { '@type': 'WebSite', '@id': `${SITE}/#website`, url: SITE, name: full, inLanguage: lang, publisher: { '@id': `${SITE}/#person` } },
      { '@type': 'ProfilePage', '@id': url + '#profile', url, name: full, inLanguage: lang, mainEntity: { '@id': `${SITE}/#person` } },
    ]
  } else if (path === '/cv' || path === '/en/cv') {
    graph = [
      { '@type': 'ProfilePage', '@id': url + '#profile', url, name: full, description: desc, inLanguage: lang, mainEntity: { '@id': `${SITE}/#person` } },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: en ? 'Home' : 'الرئيسية', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: title, item: url },
      ] },
    ]
  } else if (isPaperPage) {
    graph = [{ '@type': 'ScholarlyArticle', headline: title, name: title, description: desc, image: img, inLanguage: lang, author: { '@id': `${SITE}/#person` }, publisher: PUBLISHER, mainEntityOfPage: url, ...(iso ? { datePublished: iso } : {}) }, crumb].filter(Boolean)
  } else if (isBookPage) {
    graph = [{ '@type': 'Book', name: title, description: desc, image: img, inLanguage: lang, author: { '@id': `${SITE}/#person` }, url, ...(isbn ? { isbn } : {}), ...(year ? { datePublished: String(year) } : {}), ...(edition ? { bookEdition: edition } : {}), ...(publisher ? { publisher: { '@type': 'Organization', name: publisher } } : {}), ...(pageCount ? { numberOfPages: Number(pageCount) || pageCount } : {}) }, crumb].filter(Boolean)
  } else if (isMediaPage && !videoUrl && (audioUrl || audioFile)) {
    // المادة الإذاعية ليست فيديو: AudioObject هو النوع الصحيح، ولا تُطلب صورة مصغّرة.
    graph = [{
      '@type': 'AudioObject', name: title, description: topics || desc,
      ...(mediaUploadDate ? { uploadDate: mediaUploadDate } : {}), ...(schemaDuration(duration) ? { duration: schemaDuration(duration) } : {}),
      ...(audioUrl ? { contentUrl: audioUrl } : {}),
      inLanguage: lang, creator: { '@id': `${SITE}/#person` },
      ...(program || channel ? { isPartOf: { '@type': 'CreativeWorkSeries', name: [program, channel].filter(Boolean).join(' — ') } } : {}),
    }, crumb].filter(Boolean)
  } else if (isMediaPage) {
    const id = youtubeId(videoUrl)
    const start = clockSeconds(clipStart)
    const end = clockSeconds(clipEnd)
    graph = [{
      '@type': 'VideoObject', name: title, description: topics || desc, thumbnailUrl: img,
      ...(mediaUploadDate ? { uploadDate: mediaUploadDate } : {}), ...(schemaDuration(duration) ? { duration: schemaDuration(duration) } : {}),
      contentUrl: videoUrl, ...(id ? { embedUrl: `https://www.youtube-nocookie.com/embed/${id}` } : {}),
      inLanguage: lang, creator: { '@id': `${SITE}/#person` },
      ...(program || channel ? { isPartOf: { '@type': 'CreativeWorkSeries', name: [program, channel].filter(Boolean).join(' — ') } } : {}),
      ...(end > start ? { hasPart: { '@type': 'Clip', name: 'مقتطف اللقاء', startOffset: start, endOffset: end, url: `${url}#excerpt` } } : {}),
    }, crumb].filter(Boolean)
  } else if (type === 'article') {
    graph = [{ '@type': 'Article', headline: title, description: desc, datePublished: iso, dateModified: iso, articleSection: cat, image: img, inLanguage: lang, author: { '@id': `${SITE}/#person` }, publisher: PUBLISHER, mainEntityOfPage: url }, crumb].filter(Boolean)
  } else {
    graph = [{ '@type': 'WebPage', name: full, description: desc, url, inLanguage: lang }]
  }
  const ld = { '@context': 'https://schema.org', '@graph': isAdmin ? graph : [PERSON, ...graph] }

  // hreflang للصفحات المتقابلة عربي↔إنجليزي
  const arPath = en ? Object.keys(LANG_PAIRS).find((k) => LANG_PAIRS[k] === path) : path
  const enPath = en ? path : LANG_PAIRS[path]
  const hreflang = arPath !== undefined && enPath
    ? `<link rel="alternate" hreflang="ar" href="${SITE + arPath}" />
    <link rel="alternate" hreflang="en" href="${SITE + enPath}" />
    <link rel="alternate" hreflang="x-default" href="${SITE + arPath}" />`
    : ''

  const head = isAdmin ? `
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <link rel="canonical" href="${url}" />
    <script type="application/ld+json">${JSON.stringify(ld)}</script>
  ` : `
    <title>${esc(full)}</title>
    <meta name="description" content="${esc(desc)}" />
    ${(process.env.VITE_GOOGLE_SITE_VERIFICATION || process.env.GOOGLE_SITE_VERIFICATION) ? `<meta name="google-site-verification" content="${attr(process.env.VITE_GOOGLE_SITE_VERIFICATION || process.env.GOOGLE_SITE_VERIFICATION)}" />` : ''}
    ${(process.env.VITE_BING_SITE_VERIFICATION || process.env.BING_SITE_VERIFICATION) ? `<meta name="msvalidate.01" content="${attr(process.env.VITE_BING_SITE_VERIFICATION || process.env.BING_SITE_VERIFICATION)}" />` : ''}
    ${robots ? `<meta name="robots" content="${robots}" />` : ''}
    <link rel="canonical" href="${url}" />
    ${hreflang}
    <meta property="og:type" content="${type}" />
    <meta property="og:title" content="${esc(full)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${img}" />
    <meta property="og:image:secure_url" content="${img}" />
    <meta property="og:image:type" content="${img.endsWith('.svg') ? 'image/svg+xml' : img.endsWith('.png') ? 'image/png' : 'image/jpeg'}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(full)}" />
    <meta property="og:locale" content="${en ? 'en_US' : 'ar_KW'}" />
    <meta property="og:site_name" content="${en ? 'Dr. Ahmad H. Alfailakawi' : 'د. أحمد حسين الفيلكاوي'}" />
    ${type === 'article' ? `<meta property="article:author" content="${AUTHOR}" />
    ${iso ? `<meta property="article:published_time" content="${iso}" />
    <meta property="article:modified_time" content="${iso}" />` : ''}
    ${cat ? `<meta property="article:section" content="${esc(cat)}" />` : ''}` : ''}
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(full)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    <meta name="twitter:image" content="${img}" />
    <meta name="twitter:creator" content="@drahmadkw" />
    <script type="application/ld+json">${JSON.stringify(ld)}</script>
  `

  let html = stripManagedHead(shell)
  if (isAdmin) {
    html = html
      .replace(/<meta\s+name=["']author["'][^>]*>/gi, '')
      .replace(/<link\s+rel=["']alternate["'][^>]*>/gi, '')
      .replace(/<link\s+rel=["']preload["'][^>]+(?:portrait|og\.png)[^>]*>/gi, '')
  }
  html = html.replace('</head>', `${head}\n  </head>`)
  const bodyHtml = generateBodyHtml(path, lang)
  html = html.replace(
    '<div id="root"></div>',
    `<div id="seo-fallback">${bodyHtml}</div><div id="root"></div>`,
  )
  return html
}

function writeRoute(path, html) {
  if (path === '/') {
    writeFileSync(resolve(DIST, 'index.html'), html, 'utf8')
    return
  }

  const withoutSlash = path.replace(/^\/+/, '')
  const dir = resolve(DIST, withoutSlash)
  mkdirSync(dir, { recursive: true })
  writeFileSync(resolve(dir, 'index.html'), html, 'utf8')

  // يخدم /path مباشرة على المنصات التي تبحث عن path.html قبل fallback.
  writeFileSync(resolve(DIST, `${withoutSlash}.html`), html, 'utf8')
}

function wrapSvgText(text, max = 28) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > max && line) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, 4)
}

const articleThemes = {
  'التعليم': { accent: '#3E5C78', accentSoft: '#E7EEF6', chip: 'فكرة تربوية' },
  'التربية': { accent: '#5A7A62', accentSoft: '#EAF4EC', chip: 'تربية وحياة' },
  'تقنية': { accent: '#5B5FD6', accentSoft: '#ECECFE', chip: 'تقنية وإنسان' },
  'مجتمع': { accent: '#8A5A44', accentSoft: '#F8EEE8', chip: 'مجتمع ومعنى' },
  'إعلام': { accent: '#9A4D7A', accentSoft: '#F7EAF2', chip: 'إعلام وصورة' },
  'هوية': { accent: '#2D6F73', accentSoft: '#E5F5F4', chip: 'هوية ووعي' },
}

function firstSentence(text = '', max = 150) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  const sentence = clean.split(/(?<=[.!؟…])\s+/)[0] || clean
  return sentence.length > max ? `${sentence.slice(0, max - 1).trim()}…` : sentence
}

function wordCount(text = '') {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length
}

function readTimeText(text = '') {
  const minutes = Math.max(2, Math.round(wordCount(text) / 190))
  return `قراءة ${minutes} د`
}

function listenTimeText(slug, fallbackMinutes = 0) {
  const key = `${slug}.dialogue.mp3`
  const meta = audioMeta[key]
  const seconds = Number(meta?.durationSeconds || 0)
  if (seconds > 0) return `استماع ${Math.max(2, Math.round(seconds / 60))} د`
  if (fallbackMinutes > 0) return `استماع ${Math.max(2, fallbackMinutes)} د`
  return ''
}

/* التفاف RTL صريح: بدونه تقفز علامات الترقيم (… و؟) إلى الطرف الخطأ
   لأن مصيّر SVG يفترض فقرة LTR */
const rtlWrap = (text = '') => `‫${text}‬`

async function generateArticleOg() {
  const out = resolve(DIST, 'og/articles')
  mkdirSync(out, { recursive: true })
  const seen = new Set()
  const ogArticles = [...articles, ...siteArticlesFeed.map((item) => ({ cat: 'مقال', excerpt: '', ...item }))]
    .filter((article) => !seen.has(article.slug) && seen.add(article.slug))
  for (const article of ogArticles) {
    const theme = articleThemes[article.cat] || { accent: '#3E5C78', accentSoft: '#E7EEF6', chip: 'مقالة' }
    const body = bodies[article.slug] || article.excerpt || ''
    const titleLines = wrapSvgText(article.title, 26).slice(0, 3)
    const quoteLines = wrapSvgText(firstSentence(body || article.excerpt, 132), 40).slice(0, 3)
    const read = readTimeText(body || article.excerpt)
    const listen = listenTimeText(article.slug, Math.round(wordCount(body || article.excerpt) / 165))
    const duration = listen ? `${read} · ${listen}` : read
    const titleFont = titleLines.length > 2 ? 50 : 56
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" dir="rtl">
  <defs>
    <style>
      .bg{fill:#FCFCFA}.ink{fill:#15161A}.soft{fill:#626A76}.hair{stroke:${theme.accent};stroke-opacity:.18}
      .accent{fill:${theme.accent}}.accent-soft{fill:${theme.accentSoft}}
      text{font-family:"Tajawal","Arial",sans-serif}.display{font-family:"El Messiri","Tajawal",serif}
    </style>
    <clipPath id="portraitClip"><rect x="112" y="132" width="224" height="316" rx="38"/></clipPath>
  </defs>
  <rect class="bg" width="1200" height="630"/>
  <circle cx="200" cy="112" r="250" fill="${theme.accent}" opacity=".08"/>
  <circle cx="1090" cy="560" r="180" fill="${theme.accent}" opacity=".05"/>
  <rect x="54" y="54" width="1092" height="522" rx="34" fill="#FFFFFF" stroke="${theme.accent}" stroke-opacity=".12" stroke-width="2"/>
  <rect x="82" y="82" width="286" height="466" rx="28" class="accent-soft"/>
  <image href="${portraitDataUri}" x="112" y="112" width="224" height="324" preserveAspectRatio="xMidYMid slice" clip-path="url(#portraitClip)"/>
  <image href="${logoDataUri}" x="145" y="448" width="138" height="70" preserveAspectRatio="xMidYMid meet"/>
  <text x="224" y="528" text-anchor="middle" class="soft" font-size="19">${attr(SITE_HOST)}</text>
  <rect x="404" y="96" width="160" height="40" rx="20" class="accent-soft"/>
  <text x="484" y="122" text-anchor="middle" class="accent" font-size="21" font-weight="700">${attr(rtlWrap(article.cat))}</text>
  <text x="1080" y="124" text-anchor="end" direction="ltr" class="soft" font-size="22" font-weight="700">${attr(article.iso.replace(/-/g, ' / '))}</text>
  <text x="760" y="124" text-anchor="middle" class="soft" font-size="20" font-weight="600">${attr(rtlWrap(duration))}</text>
  ${titleLines.map((line, i) => `<text x="1080" y="${210 + i * 64}" text-anchor="end" class="display ink" font-size="${titleFont}" font-weight="700">${attr(rtlWrap(line))}</text>`).join('\n  ')}
  <rect x="730" y="338" width="350" height="2" class="accent" opacity=".55"/>
  ${quoteLines.map((line, i) => `<text x="1080" y="${396 + i * 40}" text-anchor="end" class="soft" font-size="28" font-weight="400">${attr(rtlWrap(line))}</text>`).join('\n  ')}
  <text x="1080" y="548" text-anchor="end" class="accent" font-size="24" font-weight="700">${attr(rtlWrap('اقرأ أو استمع للمقال عبر الموقع'))}</text>
</svg>`
    await sharp(Buffer.from(svg)).jpeg({ quality: 88, mozjpeg: true }).toFile(resolve(out, `${article.slug}.jpg`))
  }
  return ogArticles.length
}

const publicRoutes = uniqueRoutes(routes)

let n = 0
for (const r of publicRoutes) {
  writeRoute(r.path, render(r))
  n++
}
writeFileSync(resolve(DIST, '404.html'), render({ path: '/404', title: 'الصفحة غير موجودة', desc: 'الصفحة المطلوبة غير موجودة.' }), 'utf8')
writeFileSync(resolve(DIST, 'admin.html'), render({ path: '/admin', title: 'لوحة التحكم', desc: 'لوحة إدارة خاصة.', robots: 'noindex, nofollow' }), 'utf8')
writeFileSync(resolve(DIST, 'offline.html'), render({ path: '/offline', title: 'أنت غير متصل', desc: 'هذه الصفحة متاحة عند انقطاع الاتصال.' }), 'utf8')
// بطاقة مشاركة خاصة لكل مقال (بأمر الدكتور بعد صدمة المعاينة العامة):
// عنوان المقال وتصنيفه وأول جملة منه بهوية الموقع — بدل بطاقة موحّدة باهتة.
async function generateCanonicalOg() {
  const out = resolve(DIST, 'og')
  mkdirSync(out, { recursive: true })
  const variants = [
    [HOME_OG_AR, 'د. أحمد حسين الفيلكاوي', 'تعليم · تقنية · مجتمع', 'الموقع الرسمي'],
    [HOME_OG_EN, 'Dr. Ahmad H. Alfailakawi', 'Education · Technology · Society', 'Official website'],
  ]
  for (const [file, title, subtitle, label] of variants) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#FCFCFA"/><circle cx="1040" cy="80" r="280" fill="#3E5C78" opacity=".08"/><rect x="56" y="56" width="1088" height="518" rx="34" fill="#fff" stroke="#3E5C78" stroke-opacity=".16" stroke-width="2"/><image href="${portraitDataUri}" x="96" y="112" width="270" height="382" preserveAspectRatio="xMidYMid slice"/><image href="${logoDataUri}" x="430" y="118" width="150" height="76" preserveAspectRatio="xMidYMid meet"/><text x="1080" y="274" text-anchor="end" font-family="Tajawal,Arial,sans-serif" font-size="49" font-weight="700" fill="#15161A">${attr(title)}</text><text x="1080" y="345" text-anchor="end" font-family="Tajawal,Arial,sans-serif" font-size="30" fill="#3E5C78">${attr(subtitle)}</text><text x="1080" y="460" text-anchor="end" font-family="Tajawal,Arial,sans-serif" font-size="22" fill="#626A76">${attr(label)} · ${attr(SITE_HOST)}</text></svg>`
    await sharp(Buffer.from(svg)).jpeg({ quality: 90, mozjpeg: true }).toFile(resolve(DIST, file.replace(/^\//, '')))
  }
}

await generateCanonicalOg()
const ogCount = await generateArticleOg()
console.log(`✔ بطاقات مشاركة المقالات: ${ogCount} بطاقة بهوية الموقع`)

/* ---------- sitemap ----------
   `lastmod` كان يأتي من `r.iso` وحده، و50 رابطاً من 199 بلا iso فخرجت
   بلا تاريخ: الكتب والأبحاث وصفحات الأبواب. والوسم ليس زينة — به يعرف
   الزاحف أن الصفحة تغيّرت فيعود إليها بدل انتظار دورته.

   القاعدة هنا **صادقة لا ملفَّقة**، وGoogle يتجاهل خرائط المواقع التي
   تكذب في lastmod:
   - الكتاب والبحث: سنة نشره الحقيقية (من `year`، أو من ذيل اسم المجلة).
   - صفحة الباب: أحدث تاريخٍ بين ما تعرضه — فهي تتغيّر حين يُضاف إليها.
   - ما لا تاريخ له حقاً (صفحات ثابتة كـ«حول الموقع»): يبقى بلا وسم. */
const yearToIso = (value) => {
  const year = String(value || '').match(/\b(19|20)\d{2}\b/)
  return year ? `${year[0]}-01-01` : ''
}
const bookIso = new Map(books.map((b) => [`/publications/${b.slug}`, yearToIso(b.year)]))
const paperIso = new Map(papers.map((p) => [`/research/${p.slug}`, yearToIso(p.year || p.journal)]))

const isoFor = (route) => route.iso || bookIso.get(route.path) || paperIso.get(route.path) || ''

/* أحدث تاريخٍ تحت مسارٍ أب — لصفحات الأبواب. */
const newestUnder = (prefix) => publicRoutes
  .filter((r) => r.path.startsWith(`${prefix}/`))
  .map((r) => isoFor(r))
  .filter(Boolean)
  .sort()
  .pop() || ''

const HUB_ISO = {
  '/articles': newestUnder('/articles'),
  '/research': newestUnder('/research'),
  '/publications': newestUnder('/publications'),
  '/media': newestUnder('/media'),
}
HUB_ISO['/'] = Object.values(HUB_ISO).filter(Boolean).sort().pop() || ''

/* أبوابٌ محسوبة من المقالات نفسها: تتغيّر حين يُضاف مقال، فتاريخها
   تاريخُه. أما «حول الموقع» و«للتواصل» والأدوات فلا تاريخ لها حقاً —
   وتُترك بلا وسمٍ عمداً، فوسمٌ كاذب أسوأ من غيابه. */
for (const derived of ['/atlas', '/thought', '/decade', '/impact', '/thought-paths']) {
  HUB_ISO[derived] = HUB_ISO['/articles']
}



const sitemapEntries = publicRoutes
  .filter((r) => (SHOW_EN || r.lang !== 'en') && !r.robots)
  .map((r) => ({
    loc: `${SITE}${r.path}`,
    lastmod: isoFor(r) || HUB_ISO[r.path] || '',
    priority: r.path === '/' ? '1.0' : r.type === 'article' ? '0.6' : '0.8',
  }))
const sitemapDocuments = buildSitemapDocuments(sitemapEntries, SITE)
for (const [name, contents] of sitemapDocuments) writeFileSync(resolve(DIST, name), contents, 'utf8')

/* ---------- robots.txt (مولّد من النطاق المركزي — لا يتقادم أبداً) ---------- */
/* `Disallow: /*?*` كان يحجب **كل** رابطٍ فيه علامة استفهام. القصد منع
   فهرسة روابط المشاركة، لكن أثره أوسع: رابط «وثيقة العقد» أو «السماء»
   الذي يشاركه قارئ — وفيه معاملات — يصير محجوباً عن الزحف. والأسوأ أن
   الحجب يمنع الزاحف من رؤية وسم canonical داخل الصفحة، وهو الوسم الذي
   يوحّد النسخ من أصله. فالنتيجة عكس المقصود: تشتّتٌ بلا توحيد.

   العلاج: نحجب ما يستحق الحجب بعينه (نتائج البحث ومعاملات المشاركة
   والتقديم) ونترك الباقي يُزحف ليُوحَّد بـcanonical الموجود أصلاً في
   كل صفحة. */
writeFileSync(resolve(DIST, 'robots.txt'), `User-agent: *
Allow: /
Disallow: /admin
Disallow: /login
Disallow: /_share
Disallow: /search?
Disallow: /*?ref=
Disallow: /*?intro=
Disallow: /*?utm_

Sitemap: ${SITE}/sitemap.xml
`, 'utf8')

/* ---------- مفتاح IndexNow ----------
   إثباتُ الملكية أن هذا الملف مستضاف على النطاق نفسه ومحتواه المفتاح.
   يُكتب مع كل بناء فلا يضيع، ويُقرأ من مصدرٍ واحد مع سكربت الإرسال. */
writeFileSync(resolve(DIST, `${INDEXNOW_KEY}.txt`), INDEXNOW_KEY, 'utf8')

/* ---------- llms.txt (خريطة الموقع لوكلاء الذكاء الاصطناعي) ----------
   محركات الإجابة تقرأ الصفحة كنصّ بلا تنقّل، فتخمّن من هو صاحبها وماذا
   يقول. هذا الملف يعطيها الجواب مباشرةً: من هو، وأين المتون، وبأي شرطٍ
   يُنسب إليه القول. مولّد من الأرقام الحيّة فلا يتقادم — كما robots.
   الصيغة معيار llmstxt.org: عنوان، ثم سطر تعريف، ثم أقسام بروابط. */
writeFileSync(resolve(DIST, 'llms.txt'), `# د. أحمد حسين الفيلكاوي (Dr. Ahmad H. Alfailakawi)

> أستاذ تكنولوجيا التعليم والذكاء الاصطناعي في الكويت. هذا موقعه الرسمي. الكتب المنشورة: ${nBooks} · الأبحاث المحكَّمة: ${nPapers} · المقالات الفكرية: أكثر من ${nArticles} منذ ${firstYear}.

الموقع عربي في المقام الأول. كل المتون أصلية ومنشورة بتوقيعه، ولكل مقالٍ وبحثٍ صفحةٌ مستقلة قابلة للاستشهاد بعنوانٍ ثابت.

## شرط النسب (اقرأه قبل الاقتباس)

- لا يُنسب إلى الدكتور قولٌ لم يقله. اقتبس من صفحةٍ محدّدة على ${SITE} أو لا تنسب.
- اسمه الكامل: «د. أحمد حسين الفيلكاوي»، وبالإنجليزية Dr. Ahmad H. Alfailakawi.
- عند الاستشهاد، أورد رابط الصفحة الأصلية لا وصفاً عاماً للموقع.

## الأبواب الرئيسية

- [المقالات الفكرية](${SITE}/articles): أكثر من ${nArticles} مقالاً في التعليم والتكنولوجيا والإنسان.
- [المساهمات العلمية](${SITE}/research): الأبحاث المحكَّمة بملخصاتها وبياناتها (العدد: ${nPapers}).
- [الكتب المنشورة](${SITE}/publications): الكتب مع متونها ومحاورها (العدد: ${nBooks}).
- [الأرشيف الإعلامي](${SITE}/media): لقاءات تلفزيونية وإذاعية مفهرسة زمنياً داخل الكلام.
- [الخريطة الفكرية](${SITE}/thought): الباب الجامع الذي يربط المقال بالبحث بالكتاب.
- [سجل الأثر الموثق](${SITE}/impact): رحلات موثقة تُظهر انتقال الفكرة من المقال إلى الميدان.
- [السيرة الأكاديمية](${SITE}/cv): التعليم والخبرات والعضويات.
- [للتواصل](${SITE}/contact): استشارات ومحاضرات وتعاون.

## خلاصات آلية

- [خريطة الموقع](${SITE}/sitemap.xml)
- [خلاصة المقالات RSS](${SITE}/feed.xml)
- [قواعد الزحف](${SITE}/robots.txt)
`, 'utf8')

/* ---------- RSS ---------- */
const feedArticles = uniqueBySlug([...siteArticlesFeed, ...articles]).filter((a) => a.slug && a.title && a.iso)
const items = feedArticles.map((a) => `    <item>
      <title>${esc(a.title)}</title>
      <link>${SITE}/articles/${a.slug}</link>
      <guid isPermaLink="true">${SITE}/articles/${a.slug}</guid>
      <pubDate>${new Date(a.iso).toUTCString()}</pubDate>
      <category>${esc(a.cat)}</category>
      <description>${esc(a.excerpt)}</description>
    </item>`).join('\n')

writeFileSync(resolve(DIST, 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
    <title>د. أحمد حسين الفيلكاوي — مقالات فكرية</title>
    <link>${SITE}</link>
    <!-- عنوان الخلاصة نفسه: غيابه أشهرُ ما تشكو منه مدققات RSS، ويمنع القارئات
         من تتبّع الخلاصة إن انتقلت. -->
    <atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml" />
    <description>مقالات في التعليم والتقنية والمجتمع.</description>
    <language>ar</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
</channel></rss>
`, 'utf8')

/* ---------- بودكاست: خلاصة RSS قياسية من الأرشيف الصوتي (صوت فهد) ----------
   كل مقالٍ له MP3 يصبح حلقة؛ تُقبل مباشرة في Apple Podcasts وSpotify.
   بلا أثر بصري على الموقع — قناة موازية للمستمعين. */
const podcastArt = `${SITE}/podcast-cover.png`
const durationOf = (file) => {
  const result = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ], { encoding: 'utf8', timeout: 20_000 })
  if (result.status !== 0) return ''
  const seconds = Math.round(Number(result.stdout.trim()))
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}
const durationLabel = (seconds) => {
  seconds = Math.round(Number(seconds || 0))
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`
}
const audioAssetInfo = (rel, file = '') => {
  if (file && existsSync(file)) {
    return { bytes: statSync(file).size, duration: durationOf(file) }
  }
  const meta = audioMeta?.[rel]
  if (!meta) return null
  const bytes = Number(meta.bytes || 0)
  if (!Number.isFinite(bytes) || bytes <= 0) return null
  return { bytes, duration: durationLabel(meta.durationSeconds) }
}
const episodeItem = (articleList, fileOf) => articleList
  .map((a) => {
    const item = fileOf(a)
    const asset = item?.rel ? audioAssetInfo(item.rel, item.file) : null
    return { a, ...item, asset }
  })
  .filter((e) => e.rel && e.asset)
  .sort((x, y) => (y.a.iso || '').localeCompare(x.a.iso || ''))
const podcastEpisodeNumbers = new Map([...feedArticles]
  .sort((left, right) => (left.iso || '').localeCompare(right.iso || ''))
  .map((article, index) => [article.slug, index + 1]))
const podcastEpisodes = episodeItem(feedArticles, (a) => {
    // الحلقة الحوارية (فهد ونورة) هي حلقة القناة؛ وإلى أن تُولَّد لمقالٍ ما،
    // تبقى قراءته العادية حلقةً بنفس الـGUID — فلا تختفي حلقة ولا تتكرر.
    const dlg = resolve(ROOT, 'audio', `${a.slug}.dialogue.mp3`)
    const transcript = resolve(ROOT, 'audio', `${a.slug}.dialogue.json`)
    if (visibleDialogueAsset(a.slug, dlg, transcript)) return { file: dlg, rel: `${a.slug}.dialogue.mp3` }
    // القراءة العادية: {slug}.mp3 (فهد) أو {slug}.noura.mp3 (نورة) — نقبل أيّهما وُجد.
    const plainRel = `${a.slug}.mp3`
    const plain = resolve(ROOT, 'audio', plainRel)
    if (existsSync(plain) || Number(audioMeta?.[plainRel]?.bytes) > 0)
      return { file: existsSync(plain) ? plain : null, rel: plainRel }
    const nouraRel = `${a.slug}.noura.mp3`
    const noura = resolve(ROOT, 'audio', nouraRel)
    if (existsSync(noura) || Number(audioMeta?.[nouraRel]?.bytes) > 0)
      return { file: existsSync(noura) ? noura : null, rel: nouraRel }
    return { file: null, rel: plainRel }
  })
  .map(({ a, rel, asset }) => {
    const bytes = asset.bytes
    const url = audioPublicUrl(rel)
    const duration = asset.duration
    return `    <item>
      <title>${esc(a.title)}</title>
      <itunes:author>د. أحمد حسين الفيلكاوي</itunes:author>
      <itunes:subtitle>${esc(a.excerpt).slice(0, 120)}</itunes:subtitle>
      <description>${esc(a.excerpt)}</description>
      <itunes:summary>${esc(a.excerpt)}</itunes:summary>
      <link>${SITE}/articles/${a.slug}</link>
      <guid isPermaLink="false">podcast-${a.slug}</guid>
      <pubDate>${new Date(`${a.iso}T08:00:00Z`).toUTCString()}</pubDate>
      <enclosure url="${url}" length="${bytes}" type="audio/mpeg"/>
      ${duration ? `<itunes:duration>${duration}</itunes:duration>` : ''}
      <itunes:episode>${podcastEpisodeNumbers.get(a.slug) || 1}</itunes:episode>
      <itunes:episodeType>full</itunes:episodeType>
      ${rel.endsWith('.dialogue.mp3') ? `<podcast:transcript url="${audioPublicUrl(`${a.slug}.dialogue.json`)}" type="application/json"/>` : ''}
      <itunes:image href="${podcastArt}"/>
      <itunes:explicit>false</itunes:explicit>
    </item>`
  }).join('\n')

writeFileSync(resolve(DIST, 'podcast.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>مجلس الفكرة · د. أحمد حسين الفيلكاوي</title>
    <link>${SITE}</link>
    <atom:link href="${SITE}/podcast.xml" rel="self" type="application/rss+xml"/>
    <language>ar-KW</language>
    <generator>Dr. Ahmad Alfailakawi Podcast Engine</generator>
    <copyright>© د. أحمد حسين الفيلكاوي</copyright>
    <description>في مجلس الفكرة، يتحوّل كل مقالٍ إلى حوارٍ بصوتين: سؤالٌ يُطرح، وفكرةٌ تُبنى أمامك. أفكار د. أحمد حسين الفيلكاوي في التعليم والتكنولوجيا والمجتمع — وكيف نُبقي الإنسان في قلب الآلة. حلقةٌ جديدة مع كل مقال.

Majlis Al-Fikra turns every essay into a two-voice conversation: a question raised, an idea built before you. Dr. Ahmad Hussein Alfailakawi's reflections on education, technology, and society — and how we keep the human at the heart of the machine. A new episode with every article.

تُنتَج الحلقات بأصواتٍ توليدية متقدمة، تحت الإشراف والتحرير الكامل للدكتور أحمد حسين الفيلكاوي.</description>
    <itunes:author>د. أحمد حسين الفيلكاوي · Dr. Ahmad Alfailakawi</itunes:author>
    <itunes:summary>مجلس الفكرة — حواراتٌ بصوتين من مقالات د. أحمد حسين الفيلكاوي في التعليم والتكنولوجيا والمجتمع.</itunes:summary>
    <itunes:type>episodic</itunes:type>
    <itunes:owner><itunes:name>د. أحمد حسين الفيلكاوي</itunes:name><itunes:email>ah_f@hotmail.com</itunes:email></itunes:owner>
    <itunes:image href="${podcastArt}"/>
    <itunes:category text="Education"/>
    <itunes:category text="Society &amp; Culture"/>
    <itunes:explicit>false</itunes:explicit>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${podcastEpisodes}
  </channel>
</rss>
`, 'utf8')


/* ---------- podcast-kw.xml: ديوانية الفكرة — النسخة الكويتية، قناة موازية لا تستبدل الفصحى ---------- */
const kuwaitiPodcastEpisodes = episodeItem(feedArticles, (a) => {
    const rel = `${a.slug}.dialogue-kw.mp3`
    const file = resolve(ROOT, 'audio', rel)
    return { file: existsSync(file) ? file : null, rel }
  })
  .map(({ a, rel, asset }) => {
    const bytes = asset.bytes
    const duration = asset.duration
    return `    <item>
      <title>${esc(a.title)}</title>
      <itunes:author>د. أحمد حسين الفيلكاوي</itunes:author>
      <description>${esc(a.excerpt)}</description>
      <link>${SITE}/articles/${a.slug}</link>
      <guid isPermaLink="false">podcast-kw-${a.slug}</guid>
      <pubDate>${new Date(`${a.iso}T08:30:00Z`).toUTCString()}</pubDate>
      <enclosure url="${audioPublicUrl(rel)}" length="${bytes}" type="audio/mpeg"/>
      ${duration ? `<itunes:duration>${duration}</itunes:duration>` : ''}
      <podcast:transcript url="${audioPublicUrl(`${a.slug}.dialogue-kw.json`)}" type="application/json"/>
      <itunes:image href="${podcastArt}"/>
      <itunes:explicit>false</itunes:explicit>
    </item>`
  }).join('\n')

if (kuwaitiPodcastEpisodes) writeFileSync(resolve(DIST, 'podcast-kw.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:podcast="https://podcastindex.org/namespace/1.0">
  <channel>
    <title>ديوانية الفكرة · د. أحمد حسين الفيلكاوي</title>
    <link>${SITE}/listen</link>
    <atom:link href="${SITE}/podcast-kw.xml" rel="self" type="application/rss+xml"/>
    <language>ar-KW</language>
    <generator>Dr. Ahmad Alfailakawi Kuwaiti Podcast Engine</generator>
    <copyright>© د. أحمد حسين الفيلكاوي</copyright>
    <description>نفس الأفكار، بلهجة الديوانية. في ديوانية الفكرة يجلس صوتان كويتيّان يتحاوران حول التعليم والتكنولوجيا والمجتمع، من مقالات د. أحمد حسين الفيلكاوي — قريبٌ من الأذن، صريحٌ كأنك بين أهلك. حلقةٌ جديدة مع كل مقال.

The same ideas, in the Kuwaiti tongue. In Diwaniyat Al-Fikra, two Kuwaiti voices talk through education, technology, and society — drawn from Dr. Ahmad Hussein Alfailakawi's essays. Close, warm, and candid, as if among family. A new episode with every article.</description>
    <itunes:author>د. أحمد حسين الفيلكاوي</itunes:author>
    <itunes:summary>ديوانية الفكرة — حواراتٌ كويتية بصوتين من مقالات د. أحمد حسين الفيلكاوي.</itunes:summary>
    <itunes:type>episodic</itunes:type>
    <itunes:owner><itunes:name>د. أحمد حسين الفيلكاوي</itunes:name><itunes:email>ah_f@hotmail.com</itunes:email></itunes:owner>
    <itunes:image href="${podcastArt}"/>
    <itunes:category text="Education"/>
    <itunes:category text="Society &amp; Culture"/>
    <itunes:explicit>false</itunes:explicit>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${kuwaitiPodcastEpisodes}
  </channel>
</rss>
`, 'utf8')


/* ---------- podcast-en.xml: القناة الإنجليزية المستقلة (حوار Andrew وAva) ---------- */
const enEpisodes = episodeItem(articles, (a) => {
    const f = resolve(ROOT, 'audio', `${a.slug}.dialogue-en.mp3`)
    return { file: existsSync(f) ? f : null, rel: `${a.slug}.dialogue-en.mp3` }
  })
  .map(({ a, rel, asset }) => {
    const bytes = asset.bytes
    const duration = asset.duration
    return `    <item>
      <title>${esc(a.title)}</title>
      <itunes:author>Dr. Ahmad Alfailakawi</itunes:author>
      <description>${esc(a.excerpt)}</description>
      <link>${SITE}/articles/${a.slug}</link>
      <guid isPermaLink="false">podcast-en-${a.slug}</guid>
      <pubDate>${new Date(`${a.iso}T09:00:00Z`).toUTCString()}</pubDate>
      <enclosure url="${audioPublicUrl(rel)}" length="${bytes}" type="audio/mpeg"/>
      ${duration ? `<itunes:duration>${duration}</itunes:duration>` : ''}
      <itunes:image href="${podcastArt}"/>
      <itunes:explicit>false</itunes:explicit>
    </item>`
  }).join('\n')

if (enEpisodes) writeFileSync(resolve(DIST, 'podcast-en.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Dr. Ahmad Alfailakawi — The Human at the Heart of the Machine</title>
    <link>${SITE}</link>
    <language>en</language>
    <copyright>© Dr. Ahmad Alfailakawi</copyright>
    <description>Conversations on education, technology, and society — inspired by the Arabic essays of Dr. Ahmad Alfailakawi, professor of educational technology and AI. Produced with advanced voice technology under the author's full editorial supervision.</description>
    <itunes:author>Dr. Ahmad Alfailakawi</itunes:author>
    <itunes:type>episodic</itunes:type>
    <itunes:owner><itunes:name>Dr. Ahmad Alfailakawi</itunes:name><itunes:email>ah_f@hotmail.com</itunes:email></itunes:owner>
    <itunes:image href="${podcastArt}"/>
    <itunes:category text="Education"/>
    <itunes:explicit>false</itunes:explicit>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${enEpisodes}
  </channel>
</rss>
`, 'utf8')

/* ---------- أصول الإنتاج ----------
   المصدر المعتمد لهذه الملفات هو مجلدات الجذر، لا public/.
   نحذف وجهة الصوت أولاً كي لا تبقى ملفات قديمة أو تالفة نسخها Vite من public. */
function syncDirectory(name, extension) {
  const from = resolve(ROOT, name)
  const to = resolve(DIST, name)
  if (!existsSync(from)) throw new Error(`مجلد الأصول مفقود: ${name}`)
  rmSync(to, { recursive: true, force: true })
  mkdirSync(to, { recursive: true })
  if (name === 'audio' && AUDIO_PUBLIC_BASE_URL) return 0
  const extensions = Array.isArray(extension) ? extension : [extension]
  const files = readdirSync(from, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extensions.some((suffix) => entry.name.endsWith(suffix)))
    .filter((entry) => {
      if (name !== 'audio') return true
      const match = entry.name.match(/^(.*)\.dialogue\.(mp3|json)$/)
      if (!match) return true // القراءات العادية والنسخ الإنجليزية لا تتبع بوابة الحلقة العربية
      const slug = match[1]
      return visibleDialogueAsset(slug, resolve(from, `${slug}.dialogue.mp3`), resolve(from, `${slug}.dialogue.json`))
    })
  for (const entry of files) copyFileSync(resolve(from, entry.name), resolve(to, entry.name))
  return files.length
}

const copiedAssets = Object.fromEntries(
  [['audio', ['.mp3', '.dialogue.json']], ['covers', ['.webp', '.png']], ['files', '.pdf']]
    .map(([name, extension]) => [name, syncDirectory(name, extension)]),
)

// عروض الموسوعة مصدرها المتعقّب داخل files/encyclopedia؛ public/files مستبعد من Git عمداً.
const encyclopediaDecksSrc = resolve(ROOT, 'files/encyclopedia')
if (!existsSync(encyclopediaDecksSrc)) throw new Error('مجلد عروض الموسوعة مفقود: files/encyclopedia')
const encyclopediaDecksDst = resolve(DIST, 'files/encyclopedia')
rmSync(encyclopediaDecksDst, { recursive: true, force: true })
mkdirSync(encyclopediaDecksDst, { recursive: true })
const encyclopediaDecks = readdirSync(encyclopediaDecksSrc, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.pptx'))
for (const entry of encyclopediaDecks) copyFileSync(resolve(encyclopediaDecksSrc, entry.name), resolve(encyclopediaDecksDst, entry.name))
if (encyclopediaDecks.length !== 4) throw new Error(`عروض الموسوعة غير مكتملة: وُجد ${encyclopediaDecks.length} من 4`)
copiedAssets['files/encyclopedia'] = encyclopediaDecks.length

// ملفات الأبحاث تحفظ داخل مجلد فرعي واضح؛ النسخ التقليدي أعلاه يتعامل مع ملفات الجذر فقط.
const researchFilesSrc = resolve(ROOT, 'files/research')
if (existsSync(researchFilesSrc)) {
  const researchFilesDst = resolve(DIST, 'files/research')
  mkdirSync(researchFilesDst, { recursive: true })
  for (const entry of readdirSync(researchFilesSrc, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.pdf')) copyFileSync(resolve(researchFilesSrc, entry.name), resolve(researchFilesDst, entry.name))
  }
}

/* مجلد اختبار الأصوات الأعمى — يعيش في public/audio/bakeoff؛ يُنسخ بعد إعادة بناء dist/audio
   (syncDirectory يمسح dist/audio) كي يصل الموقع الحي على /audio/bakeoff */
const bakeoffSrc = resolve(ROOT, 'public/audio/bakeoff')
if (existsSync(bakeoffSrc)) {
  const bakeoffDst = resolve(DIST, 'audio/bakeoff')
  mkdirSync(bakeoffDst, { recursive: true })
  for (const f of readdirSync(bakeoffSrc)) if (/\.(mp3|json)$/.test(f)) copyFileSync(resolve(bakeoffSrc, f), resolve(bakeoffDst, f))
}

const firebaseAppletConfig = resolve(ROOT, 'firebase-applet-config.json')
if (!existsSync(firebaseAppletConfig)) throw new Error('firebase-applet-config.json مفقود')
copyFileSync(firebaseAppletConfig, resolve(DIST, 'firebase-applet-config.json'))

/* ---------- service worker: إصدار تلقائي + توافق Cloud Run ---------- */
const sw = resolve(DIST, 'sw.js')
if (existsSync(sw)) {
  const id = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 12)
  const text = readFileSync(sw, 'utf8').replace(/__BUILD_ID__/g, id)
  writeFileSync(sw, text, 'utf8')
}

function assertStaticOutput() {
  const badPages = publicRoutes
    .filter((route) => !route.robots)
    .map((route) => route.path === '/' ? resolve(DIST, 'index.html') : resolve(DIST, route.path.replace(/^\/+/, ''), 'index.html'))
    .filter((file) => {
      if (!existsSync(file)) return true
      const html = readFileSync(file, 'utf8')
      return !/<div id="seo-fallback">[\s\S]*<main\b[\s\S]*<\/main>[\s\S]*<\/div><div id="root"><\/div>/.test(html)
        || !/<link rel="canonical" href="https:\/\/[^"]+" \/>/.test(html)
        || !/<script type="application\/ld\+json">/.test(html)
    })
  if (badPages.length) throw new Error(`Prerender ناقص في ${badPages.length} صفحة: ${badPages.slice(0, 5).map((file) => file.replace(ROOT, '')).join(', ')}`)

  const locs = sitemapLocsFromDist(DIST)
  const duplicateLocs = locs.filter((loc, index) => locs.indexOf(loc) !== index)
  if (duplicateLocs.length) throw new Error(`sitemap يحتوي روابط مكررة: ${duplicateLocs.slice(0, 3).join(', ')}`)
  if (locs.some((loc) => /scheduledarabbic|localhost|127\.0\.0\.1/.test(loc))) throw new Error('sitemap يحتوي رابط اختبار أو slug غير نظيف')
  const forbiddenIndexPaths = ['/admin', '/privacy', '/terms', '/data-deletion', '/cv-file/', '/ar/', '/wp-', '/category/', '/signature_articles/', '/published_articles/', '/scholarly_contributi/', '/mini-library', '/article-worth-reading', '/book-of-the-month', '/en/reading-room/']
  const forbiddenLoc = locs.find((loc) => forbiddenIndexPaths.some((part) => loc.includes(part)))
  if (forbiddenLoc) throw new Error(`sitemap يحتوي صفحة غير مخصصة للفهرسة: ${forbiddenLoc}`)
  for (const item of media) {
    if (!locs.includes(`${SITE}/media/${item.slug}`)) throw new Error(`sitemap يفتقد صفحة اللقاء: ${item.slug}`)
  }

  const robots = readFileSync(resolve(DIST, 'robots.txt'), 'utf8')
  if (!robots.includes(`Sitemap: ${SITE}/sitemap.xml`) || /localhost|127\.0\.0\.1/.test(robots)) {
    throw new Error('robots.txt لا يستخدم النطاق المركزي الصحيح')
  }

  /* llms.txt يتقادم بصمت لو انفصل عن النطاق المركزي أو فقد شرط النسب. */
  const llms = readFileSync(resolve(DIST, 'llms.txt'), 'utf8')
  if (!llms.includes(`${SITE}/articles`) || /localhost|127\.0\.0\.1/.test(llms)) {
    throw new Error('llms.txt لا يستخدم النطاق المركزي الصحيح')
  }
  if (!llms.includes('لا يُنسب إلى الدكتور قولٌ لم يقله')) {
    throw new Error('llms.txt فقد شرط النسب — وهو سبب وجوده')
  }

  const feed = readFileSync(resolve(DIST, 'feed.xml'), 'utf8')
  const guids = [...feed.matchAll(/<guid[^>]*>([^<]+)<\/guid>/g)].map((match) => match[1])
  const duplicateGuids = guids.filter((guid, index) => guids.indexOf(guid) !== index)
  if (duplicateGuids.length) throw new Error(`RSS يحتوي GUID مكرر: ${duplicateGuids.slice(0, 3).join(', ')}`)

  const podcast = readFileSync(resolve(DIST, 'podcast.xml'), 'utf8')
  if (hasPodcastState && /\.dialogue\.mp3/.test(podcast) && !Object.values(podcastState?.done || {}).some((entry) => entry?.status === 'accepted_automated')) {
    throw new Error('podcast.xml يحتوي حلقة حوارية غير معتمدة')
  }
  if (!/<atom:link\b[^>]*rel="self"/.test(podcast)) throw new Error('podcast.xml يفتقد atom:link self')
  const podcastItems = [...podcast.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((match) => match[1])
  const podcastGuids = podcastItems.map((item) => (item.match(/<guid[^>]*>([^<]+)<\/guid>/) || [])[1]).filter(Boolean)
  const podcastEnclosures = podcastItems.map((item) => (item.match(/<enclosure\s[^>]*url="([^"]+)"/) || [])[1]).filter(Boolean)
  if (new Set(podcastGuids).size !== podcastGuids.length) throw new Error('podcast.xml يحتوي GUID مكرراً')
  if (new Set(podcastEnclosures).size !== podcastEnclosures.length) throw new Error('podcast.xml يحتوي enclosure URL مكرراً')
  for (const item of podcastItems) {
    const enclosureTag = (item.match(/<enclosure\s[^>]*\/?>(?:<\/enclosure>)?/) || [])[0] || ''
    const enclosureLength = Number((enclosureTag.match(/length="([0-9]+)"/) || [])[1] || 0)
    const enclosureType = (enclosureTag.match(/type="([^"]+)"/) || [])[1] || ''
    if (enclosureLength < 200_000 || enclosureType !== 'audio/mpeg')
      throw new Error('podcast.xml يحتوي enclosure ناقصاً أو صغيراً')
    if (!/<itunes:duration>[^<]+<\/itunes:duration>/.test(item)) throw new Error('حلقة بودكاست بلا مدة')
    if (!/<itunes:episodeType>full<\/itunes:episodeType>/.test(item)) throw new Error('حلقة بودكاست بلا episodeType')
  }
}

/* بعض بيئات Cloud Run/App Hosting تتعامل مع assets المستوردة من Vite بشكل مختلف.
   إبقاء نسخة public واضحة من الشعار والبورتريه يحمي الواجهة من 404 إن تغيّر مسار الحزمة. */
for (const [from, to] of [
  ['src/assets/logo.png', 'dist/logo.png'],
  ['src/assets/portrait.webp', 'dist/portrait.webp'],
]) {
  const srcFile = resolve(ROOT, from)
  if (existsSync(srcFile)) copyFileSync(srcFile, resolve(ROOT, to))
}

assertStaticOutput()

console.log(`✔ ${n} صفحة ثابتة · sitemap (${publicRoutes.length}) · feed.xml · 404.html`)
console.log(`✔ أصول الإنتاج: audio ${copiedAssets.audio} · covers ${copiedAssets.covers} · files ${copiedAssets.files} · Firebase config`)
