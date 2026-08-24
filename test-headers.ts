import { foldLine } from "./src/utils/icalendar.ts"; // Just to get something compiling if we need, but we can write our own fold

const toAscii=(value:string)=>String(value||"")
const fold=(value:string)=>toAscii(value).replace(/[ً-ْـ]/g,"").replace(/[أإآٱ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/[^ء-يa-zA-Z0-9: ]/g," ").replace(/\s+/g," ").trim().toLowerCase();

function isHeaderLine(text:string):boolean{
  if(!text) return false;
  const f=fold(text);
  const headerPhrases=[
    "جدول الفصل", "جميع الشعب", "الفصل الدراسي", "كلية التربيه", "كليه التربيه", "كلية التربية", "التربية الاساسية", "التربيه الاساسيه",
    "رقم المقرر", "مسمى مقرر", "الرقم المرجعي", "الرقم المرجعى",
    "الحد الاقصى", "مقاعد مسجلة", "مقاعد مسجله", "الحالة في الرزم", "عدد الرزم",
    "swrscha", "صفحة رقم", "من أصل", "من اصل", "تاريخ الطباعة", "طبع في",
    "التسجيل التقرير", "القسم :", "القسم:", "الفرع :", "الفرع:", "الكلية :", "الكلية:", "الفصل :", "الفصل:", "القسم", "الفرع", "الكلية"
  ];
  
  if(headerPhrases.some(phrase => {
      const foldedPhrase = fold(phrase);
      if (foldedPhrase.length > 2 && f.includes(foldedPhrase)) return true;
      return false;
  })) return true;
  
  if(
    f.startsWith("القسم") || 
    f.startsWith("الفصل") || 
    f.startsWith("التقرير") || 
    f.startsWith("جدول") || 
    f.startsWith("كليه") || 
    f.startsWith("كلية") || 
    f.includes("صفحة :") || 
    f.includes("صفحة رقم") || 
    f.includes("تاريخ :")
  ) {
    return true;
  }
  return false;
}

const tests = [
  "التسجيل التقرير SWRSCHA :",
  "جدول الفصل | جميع الشعب | التاريخ صفحة : 14:50 2026-06-02 1 من 4",
  "الفصل : الفصل الدراسي الاول 2026-2027 | الكلية : 01 كليه التربيه الاساسيه",
  "القسم : 0101 التربيه الاسلاميه | الفرع : 012 كليه التربيه الاساسيه بنات",
];

for (const t of tests) {
  console.log(`"${t}" => ${isHeaderLine(t)}`);
}
