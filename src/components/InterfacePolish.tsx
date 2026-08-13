import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import './interface-polish.css'

/* ═══════════════════════════════════════════════════════════════════
   تلميع الواجهة — حارسان عامّان على غرار MobileCardRailGuard:
   لا يلمسان متن أيّ صفحة، ويعملان على الحاضنات المشتركة وحدها.

   ١) هيكل الانتظار: لمعةٌ تملأ إطار الصورة حتى تصل الصورة.
   ٢) تتابع الظهور: بنود القوائم ترتفع تباعاً عند دخولها الشاشة.

   ★ قاعدة الفشل في كليهما واحدة: **لا حالةَ إخفاءٍ في هذا الملف أصلاً.**
   الهيكل طبقةٌ تُضاف فوق الإطار وتُنزع، والتتابع حركةٌ تنتهي عند الظهور
   دائماً بـboth. فأسوأ ما يقع عند تعطّل المنطق كلّه أن تفوت الحركة —
   لا أن يغيب المحتوى. (سابقة محطّات «مسار الفكرة» التي بقيت opacity:0
   للأبد لأن المراقب لم يرَ قائمةً رُكِّبت بعد وصول البيانات؛ وقد علقت
   الصيغةُ الأولى من هذا الملف عند opacity:0 مرتين أثناء الفحص.)
   ═══════════════════════════════════════════════════════════════════ */

/* أطر الصور: الصنف المشترك، ومعه **قاعدة بنيوية** تلتقط ما لا صنف له —
   أغلفة الكتب في /publications مثلاً إطارها `Link` بنسبةٍ في style بلا
   أيّ صنف. الشرط: عنصرٌ له نسبةٌ محجوزة فعلاً ويحوي صورة. أوسعُ من
   قائمة أصناف تنسى الجديد، وأضيقُ من «كل صورة». */
const FRAME_SELECTOR = '.spatial-media'
const COLLECTION_SELECTOR = '.spatial-collection'

/* الشعارات والأيقونات والصور الصغيرة لا هيكل لها: اللمعة عليها ضجيج. */
const MIN_FRAME_SIDE = 96

function hasReservedRatio(element: HTMLElement) {
  const ratio = getComputedStyle(element).aspectRatio
  return Boolean(ratio) && ratio !== 'auto'
}

/* أقصى تأخيرٍ تراكمي: بعد البند الثامن يتساوى الجميع، فقائمةُ خمسين
   بنداً لا تستغرق ثلاث ثوانٍ حتى تكتمل. */
const STAGGER_CAP = 8

/* حزام أمانٍ للّمعة: لو لم يصل حدث تحميلٍ ولا خطأ (صورةٌ نُزعت من
   الشجرة، أو شبكةٌ معلّقة) يُرفع الهيكل بعد هذه المدة. رمادٌ عارٍ
   أهون من لمعةٍ لا تنتهي. */
const SKELETON_MAX_MS = 6000

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ─────────────────────────── ١) هيكل الانتظار ─────────────────────── */
export function MediaSkeletonGuard() {
  const location = useLocation()

  useEffect(() => {
    const tracked = new Map<HTMLElement, () => void>()

    const dressFrame = (frame: HTMLElement) => {
      if (tracked.has(frame) || frame.querySelector(':scope > .polish-skeleton')) return
      const image = frame.querySelector('img')
      if (!image) return
      /* الصورة المخزّنة في المتصفح تصل قبل أن نبدأ: لا لمعة أصلاً. */
      if (image.complete && image.naturalWidth > 0) return

      /* إطارٌ صغير = شعارٌ أو أيقونة: اللمعة عليه ضجيج لا انتظار. */
      const rect = frame.getBoundingClientRect()
      if (rect.width && rect.width < MIN_FRAME_SIDE) return

      /* الهيكل مطلقُ الموضع، فإطارٌ ساكن يجعله يهرب إلى جدٍّ أبعد ويغطّي
         نصف الصفحة. `.spatial-media` عنده relative أصلاً، أما أغلفة
         الكتب فلا — نمنحها إياه ونعيدها كما كانت عند الرفع. */
      const inlinePosition = frame.style.position
      if (getComputedStyle(frame).position === 'static') frame.style.position = 'relative'

      const skeleton = document.createElement('span')
      skeleton.className = 'polish-skeleton'
      skeleton.setAttribute('aria-hidden', 'true')
      frame.prepend(skeleton)

      let removalTimer = 0
      let settled = false

      const lift = () => {
        if (settled) return
        settled = true
        window.clearTimeout(removalTimer)
        skeleton.classList.add('is-leaving')
        removalTimer = window.setTimeout(() => {
          skeleton.remove()
          frame.style.position = inlinePosition
        }, 360)
        image.removeEventListener('load', lift)
        image.removeEventListener('error', lift)
        tracked.delete(frame)
      }

      image.addEventListener('load', lift)
      image.addEventListener('error', lift)
      const guard = window.setTimeout(lift, SKELETON_MAX_MS)

      tracked.set(frame, () => {
        window.clearTimeout(guard)
        window.clearTimeout(removalTimer)
        image.removeEventListener('load', lift)
        image.removeEventListener('error', lift)
        skeleton.remove()
        frame.style.position = inlinePosition
      })
    }

    const sweep = () => {
      for (const frame of document.querySelectorAll<HTMLElement>(FRAME_SELECTOR)) dressFrame(frame)

      /* والقاعدة البنيوية: أبو صورةٍ مباشرٍ له نسبةٌ محجوزة. تلتقط أغلفة
         الكتب وكلَّ إطارٍ يُضاف لاحقاً بلا صنفٍ متّفقٍ عليه. */
      for (const image of document.querySelectorAll<HTMLImageElement>('img')) {
        if (image.complete && image.naturalWidth > 0) continue
        const frame = image.parentElement
        if (!frame || frame.matches(FRAME_SELECTOR)) continue
        if (frame.closest('nav, footer, header')) continue
        if (!hasReservedRatio(frame)) continue
        dressFrame(frame)
      }
    }

    sweep()

    /* البطاقات تصل بعد البيانات لا مع الهيكل، فالمسح مرةً واحدة لا يكفي. */
    const observer = new MutationObserver(() => sweep())
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      for (const cleanup of tracked.values()) cleanup()
      tracked.clear()
    }
  }, [location.pathname])

  return null
}

/* ─────────────────────────── ٢) تتابع الظهور ──────────────────────── */
export function StaggerRevealGuard() {
  const location = useLocation()

  useEffect(() => {
    if (prefersReducedMotion()) return
    if (typeof IntersectionObserver === 'undefined') return

    /* «in» = شغّل الحركة. و«skip» = مرّ من هنا ولا حركة (كان داخل الشاشة
       أصلاً، فالحركة عليه ومضةٌ لا وصول). كلتاهما حالة ظهورٍ لا إخفاء. */
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const collection = entry.target as HTMLElement
        observer.unobserve(collection)
        if (!collection.dataset.polishStagger) collection.dataset.polishStagger = 'in'
      }
    }, { threshold: 0, rootMargin: '0px 0px -4% 0px' })

    const watched = new Set<HTMLElement>()

    const prepare = (collection: HTMLElement) => {
      if (collection.dataset.polishStagger || watched.has(collection)) return

      const children = Array.from(collection.children).filter(
        (node): node is HTMLElement => node instanceof HTMLElement,
      )
      /* بندٌ واحد ليس تتابعاً. */
      if (children.length < 2) return

      /* تخطيطٌ لم يستقرّ بعد: لا نحكم على موضعٍ كاذب، ونتركه لطفرةٍ تالية
         أو لتغيّر مقاس. الحكم المبكّر كان يكشف كلّ حاضنة فوراً فيضيع
         التتابع من أصله. */
      const rect = collection.getBoundingClientRect()
      if (rect.height < 1) return

      children.forEach((child, index) => {
        child.style.setProperty('--polish-i', String(Math.min(index, STAGGER_CAP)))
      })

      /* ما هو داخل الشاشة أو فوقها الآن: لا حركة له. الحركة للقادم من
         تحت الطيّة وحده — وهو موضع التتابع الصحيح. */
      if (window.innerHeight > 0 && rect.top < window.innerHeight) {
        collection.dataset.polishStagger = 'skip'
        return
      }

      watched.add(collection)
      observer.observe(collection)
    }

    const sweep = () => {
      for (const collection of document.querySelectorAll<HTMLElement>(COLLECTION_SELECTOR)) prepare(collection)
    }

    sweep()

    /* البطاقات تصل بعد البيانات، والمقاس قد يتغيّر بعد أن تكون نافذةٌ
       بلا ارتفاع قد أفشلت قياس أول مسح. فالمسح يتكرّر على الحدثين. */
    const mutations = new MutationObserver(() => sweep())
    mutations.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', sweep, { passive: true })

    return () => {
      mutations.disconnect()
      observer.disconnect()
      window.removeEventListener('resize', sweep)
      watched.clear()
    }
  }, [location.pathname])

  return null
}

/* ─────────────────────────── ٣) عدّاد الأرقام ─────────────────────── */

/* مدّة العدّ: أطول من أن تفوت، وأقصر من أن تُنتظر. */
const COUNT_MS = 950

/* ★ الرقم يبدأ **صحيحاً** لا صفراً: لو لم يُطلق المراقب أبداً، أو عُطّل
   JavaScript، أو طُبعت الصفحة — يقرأ الزائر القيمة الحقيقية. الصفر لا
   يُكتب إلا لحظة انطلاق العدّ فعلياً، والعدّ ينتهي عند القيمة دائماً.
   القاعدة نفسها التي تحكم بقية هذا الملف: لا حالةَ عطبٍ تُخفي حقيقة. */
export function CountUp({ value, format, className }: {
  value: number
  format: (input: number) => string
  className?: string
}) {
  const [shown, setShown] = useState(value)
  const started = useRef(false)
  const frame = useRef(0)

  /* مرجعٌ دالّة لا useEffect على التركيب: القوائم تُركَّب بعد وصول
     البيانات، فالمراقب المعلَّق وقت التركيب لا يرى شيئاً أبداً. */
  const attach = useCallback((node: HTMLElement | null) => {
    if (!node || started.current) return
    if (typeof IntersectionObserver === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || started.current) continue
        started.current = true
        observer.disconnect()

        const from = 0
        const start = performance.now()
        const step = (now: number) => {
          const progress = Math.min(1, (now - start) / COUNT_MS)
          /* تباطؤٌ في النهاية: الرقم يصل ولا يرتطم. */
          const eased = 1 - Math.pow(1 - progress, 3)
          setShown(Math.round(from + (value - from) * eased))
          if (progress < 1) frame.current = window.requestAnimationFrame(step)
        }
        frame.current = window.requestAnimationFrame(step)
      }
    }, { threshold: 0.4 })

    observer.observe(node)
  }, [value])

  useEffect(() => () => window.cancelAnimationFrame(frame.current), [])

  /* تغيّرت القيمة من مصدرها بعد انتهاء العدّ (تصفيةٌ أو تحديث): تُعرض
     كما هي بلا إعادة عدّ. */
  useEffect(() => { if (started.current) setShown(value) }, [value])

  return <span ref={attach} className={className}>{format(shown)}</span>
}
