#!/bin/bash
set -euo pipefail

URL="https://raw.githubusercontent.com/ProfAlfailakawi/schedule/main/server.ts"
OUT="server.ts"

curl -fL "$URL" -o "$OUT.tmp"

python3 - <<'PY'
from pathlib import Path

p = Path("server.ts.tmp")
text = p.read_text(encoding="utf-8")

old1 = 'const external=all.filter(row=>row.AdTermId===termId&&!(row.AdCollegeId===collegeId&&row.AdSectionId===sectionId));'
new1 = 'const external=universe.filter(row=>row.AdTermId===termId&&!(row.AdCollegeId===collegeId&&row.AdSectionId===sectionId));'

old2 = 'const before=analyzeSchedule(target,all.filter(row=>row.AdTermId===termId),courses,instructors);'
new2 = 'const before=analyzeSchedule(target,universe.filter(row=>row.AdTermId===termId),courses,instructors);'

if text.count(old1) != 1:
    raise SystemExit(f"لم أعدّل الملف: السطر الأول المتوقع ظهر {text.count(old1)} مرة.")
if text.count(old2) != 1:
    raise SystemExit(f"لم أعدّل الملف: السطر الثاني المتوقع ظهر {text.count(old2)} مرة.")

text = text.replace(old1, new1).replace(old2, new2)

if 'const external=all.filter(' in text or 'analyzeSchedule(target,all.filter(' in text:
    raise SystemExit("فشل التحقق: بقي استخدام all في الموضع المستهدف.")

Path("server.ts").write_text(text, encoding="utf-8")
p.unlink()

print("تم إنشاء server.ts المصحح بنجاح.")
print("ارفع server.ts واستبدل الملف الحالي في جذر الريبو.")
PY
