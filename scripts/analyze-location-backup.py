#!/usr/bin/env python3
"""Build a privacy-safe canonical location registry seed from a full system backup.

The full backup is READ ONLY input and is never copied into the application.
Outputs contain only aggregate building/room evidence and academic scope ids/names;
no user, student, civil-id, phone, or authentication data is exported.
"""
from __future__ import annotations
import argparse, gzip, json, math, re, unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")
INVALID_EXACT = {
    "", "0", "00", "000", "-", "--", "---", "----", "-----", "------",
    "#", "##", "###", "####", "#####", "*", "**", "***", "****", "******",
    "/", "//", "///", "////", ".", "..", "...", "?", "??", "???????", "=", "==",
    "TBA", "TBD", "NA", "N/A", "NONE", "NULL", "CANCEL", "CANCELLED", "CANCELED",
}
USER_CONFIRMED_BUILDINGS = {
    # Explicitly supplied as official BUILDING examples by the system owner.
    "012B09": {"siteName": "التربية الأساسية", "branchName": "فرع البنات", "source": "USER_CONFIRMED"},
    "012J14": {"siteName": "الجهراء", "branchName": "الجهراء", "source": "USER_CONFIRMED"},
    "012F15": {"siteName": "الفحيحيل", "branchName": "الفحيحيل", "source": "USER_CONFIRMED"},
}

# Authoritative college/site prefixes supplied by the system owner on 2026-08-24.
# These are *site identities*, not inferred historical aliases. A building is
# canonicalized as <college/site prefix><2-digit building number>.
OFFICIAL_COLLEGE_PREFIXES_BY_NAME = {
    "كلية التربية الأساسية - بنات": "012B",
    "كلية التربية الأساسية - بنين": "011B",
    "كلية التربية الأساسية - بنات - الجهراء": "012J",
    "كلية التربية الأساسية - بنات - الفحيحيل": "012F",
    "كلية الدراسات التجارية - بنات": "022T",
    "كلية الدراسات التجارية - بنين": "021T",
    "كلية العلوم الصحية - بنات": "032B",
    "كلية العلوم الصحية - بنين": "031B",
    "كلية التمريض - بنين": "0510",
    "كلية التمريض - بنات": "0520",
    "كلية الدراسات التكنولوجية - بنات": "0420",
    "كلية الدراسات التكنولوجية - بنين": "0410",
}


def norm(value: Any) -> str:
    s = unicodedata.normalize("NFKC", str(value or "")).translate(ARABIC_DIGITS).upper().strip()
    s = re.sub(r"[\u200B-\u200F\u202A-\u202E\u2060-\u206F]", "", s)
    s = re.sub(r"\s+", "", s)
    return s


def college_name_key(value: Any) -> str:
    s = unicodedata.normalize("NFKC", str(value or "")).strip()
    s = re.sub(r"[\s\-–—_]+", "", s)
    return s


def building_code_from_prefix(prefix: str, number: int) -> str:
    return f"{prefix}{int(number):02d}"


def full_building_for_prefix(value: Any, prefix: str) -> str | None:
    t = norm(value)
    if not prefix:
        return None
    m = re.fullmatch(re.escape(prefix) + r"0*(\d{1,2})", t)
    if not m:
        return None
    number = int(m.group(1))
    return building_code_from_prefix(prefix, number) if number > 0 else None


def legacy_missing_site_letter(value: Any, prefix: str) -> str | None:
    # Example: the official health-boys prefix is 031B, while historical data
    # contains 031001. Inside that exact college, 031001 is a plausible legacy
    # rendering of building 01 with the site letter omitted. This rule is never
    # global and only applies to authoritative alpha prefixes.
    t = norm(value)
    if len(prefix) != 4 or not prefix[:3].isdigit() or not prefix[3].isalpha():
        return None
    m = re.fullmatch(re.escape(prefix[:3]) + r"0(\d{2})", t)
    if not m or int(m.group(1)) <= 0:
        return None
    return building_code_from_prefix(prefix, int(m.group(1)))


def invalid(value: Any) -> bool:
    t = norm(value)
    return (t in INVALID_EXACT or t.startswith("TBA") or t.startswith("TBD") or
            "CANCEL" in t or not re.search(r"[A-Z0-9]", t))


def alpha_building(value: Any) -> str | None:
    m = re.fullmatch(r"(\d{3})([A-Z])0*(\d{1,2})", norm(value))
    if not m:
        return None
    return f"{m.group(1)}{m.group(2)}{int(m.group(3)):02d}"


def alpha_short(value: Any) -> tuple[str, int] | None:
    m = re.fullmatch(r"([A-Z])0*(\d{1,2})", norm(value))
    return (m.group(1), int(m.group(2))) if m else None


def bare_number(value: Any) -> int | None:
    m = re.fullmatch(r"0*(\d{1,3})", norm(value))
    if not m:
        return None
    n = int(m.group(1))
    return n if n > 0 else None


def numeric_full_building(value: Any) -> str | None:
    t = norm(value)
    return t if re.fullmatch(r"\d{6}", t) and t not in {"000000"} else None


def room_shape(value: Any) -> tuple[str, int, str] | None:
    m = re.fullmatch(r"([A-Z]{1,3})0*(\d{1,3})([A-Z]?)", norm(value))
    if not m:
        return None
    return m.group(1), int(m.group(2)), m.group(3)


def canonical_room_alpha(value: Any) -> str | None:
    shape = room_shape(value)
    if not shape:
        return None
    prefix, number, suffix = shape
    digits = str(number).zfill(2) if number < 100 else str(number)
    return f"{prefix}{digits}{suffix}"


def room_numeric(value: Any) -> int | None:
    m = re.fullmatch(r"0*(\d{1,3})", norm(value))
    if not m:
        return None
    n = int(m.group(1))
    return n if n > 0 else None


def term_sort_key(name: str, term_id: int) -> tuple[int, int, int]:
    m = re.search(r"(\d{4})\s*/\s*(\d{4})", name or "")
    season = 3 if "الصيف" in (name or "") else 2 if "الثاني" in (name or "") else 1 if "الأول" in (name or "") else 0
    return (int(m.group(1)) if m else 0, season, term_id)


def overlap_ratio(a: Counter[str], b: Counter[str]) -> float:
    if not a or not b:
        return 0.0
    shared = sum(min(a[k], b[k]) for k in (set(a) | set(b)))
    return shared / max(1, min(sum(a.values()), sum(b.values())))


def sanitize_id(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]+", "_", value).strip("_")


def load_backup(path: Path):
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        payload = json.load(fh)
    docs = payload.get("documents") or []
    def collection(name: str):
        prefix = name + "/"
        return [dict(d.get("data") or {}) for d in docs if str(d.get("path") or "").startswith(prefix) and str(d.get("path") or "").count("/") == 1]
    return payload, collection


def analyze(backup_path: Path):
    payload, collection = load_backup(backup_path)
    schedules = collection("schedules")
    colleges = collection("colleges")
    sections = collection("sections")
    terms = collection("terms")
    legacy_rooms = collection("rooms")

    college_name = {int(x.get("AdCollegeId") or 0): str(x.get("AdCollegeName") or "") for x in colleges}
    section_name = {int(x.get("AdSectionId") or 0): str(x.get("AdSectionName") or "") for x in sections}
    term_name = {int(x.get("AdTermId") or 0): str(x.get("AdTermName") or "").strip() for x in terms}

    official_prefix_name_lookup = {college_name_key(name): prefix for name, prefix in OFFICIAL_COLLEGE_PREFIXES_BY_NAME.items()}
    official_prefix_by_college: dict[int, str] = {}
    for cid, name in college_name.items():
        prefix = official_prefix_name_lookup.get(college_name_key(name))
        if prefix:
            official_prefix_by_college[cid] = prefix

    raw_building_spellings = len({str(r.get("AdRoomCode") or "").strip() for r in schedules})
    normalized_building_spellings = len({norm(r.get("AdRoomCode")) for r in schedules})
    building_field_counts = Counter(norm(r.get("AdRoomCode")) for r in schedules)
    room_field_counts = Counter(norm(r.get("AdRoomHall")) for r in schedules)

    # Context observations.
    by_college_building: dict[int, Counter[str]] = defaultdict(Counter)
    room_fp: dict[tuple[int, str], Counter[str]] = defaultdict(Counter)
    rows_by_college_token: dict[tuple[int, str], list[dict[str, Any]]] = defaultdict(list)
    for row in schedules:
        cid = int(row.get("AdCollegeId") or 0)
        token = norm(row.get("AdRoomCode"))
        by_college_building[cid][token] += 1
        room_fp[(cid, token)][norm(row.get("AdRoomHall"))] += 1
        rows_by_college_token[(cid, token)].append(row)

    # Learn a prefix+site letter only where the college's full codes make it unambiguous.
    prefix_site_counts: dict[int, Counter[str]] = defaultdict(Counter)
    for row in schedules:
        code = alpha_building(row.get("AdRoomCode"))
        if code:
            prefix_site_counts[int(row.get("AdCollegeId") or 0)][code[:4]] += 1
    for room in legacy_rooms:
        code = alpha_building(room.get("AdRoomCode"))
        if code:
            # Legacy AdRoom has no college; it is still an exact anchor, not a college inference.
            pass

    # Authoritative prefixes always win. Historical dominance is used only for
    # colleges for which the owner has not provided an official site code.
    dominant_prefix_site: dict[int, str] = dict(official_prefix_by_college)
    for cid, counts in prefix_site_counts.items():
        if cid in dominant_prefix_site or not counts:
            continue
        best, best_count = counts.most_common(1)[0]
        total = sum(counts.values())
        if best_count >= 3 and best_count / max(1, total) >= 0.80:
            dominant_prefix_site[cid] = best

    # Build candidate registry.
    candidates: dict[str, dict[str, Any]] = {}
    def ensure_building(code: str, confidence: str, source: str, evidence: str, cid: int | None = None):
        if not code:
            return
        owner_prefix = official_prefix_by_college.get(int(cid or 0), "")
        known_prefix = owner_prefix if owner_prefix and code.startswith(owner_prefix) else ""
        if not known_prefix:
            for pfx in OFFICIAL_COLLEGE_PREFIXES_BY_NAME.values():
                if code.startswith(pfx) and len(code) > len(pfx):
                    known_prefix = pfx
                    break
        if known_prefix:
            prefix_field = known_prefix[:3] if known_prefix[:3].isdigit() and known_prefix[-1:].isalpha() else known_prefix
            site_letter = known_prefix[-1] if known_prefix[-1:].isalpha() else ""
            suffix = code[len(known_prefix):]
            building_number = str(int(suffix)) if suffix.isdigit() and int(suffix) > 0 else suffix
        else:
            prefix_field = code[:3] if len(code) >= 3 and code[:3].isdigit() else ""
            site_letter = code[3] if len(code) >= 4 and code[3].isalpha() else ""
            suffix = code[4:] if len(code) >= 5 and code[3].isalpha() else ""
            building_number = str(int(suffix)) if suffix.isdigit() and int(suffix) > 0 else suffix
        row = candidates.setdefault(code, {
            "id": f"building_{sanitize_id(code)}", "officialCode": code, "active": confidence == "CONFIRMED",
            "sitePrefix": known_prefix,
            "prefix": prefix_field,
            "siteLetter": site_letter,
            "buildingNumber": building_number,
            "siteName": "", "branchName": "", "description": "", "aliases": [], "collegeIds": [], "sectionIds": [],
            "historicalUsageCount": 0, "firstTermId": None, "lastTermId": None, "roomCount": 0,
            "confidence": confidence, "source": source, "adminVerified": source == "USER_CONFIRMED",
            "evidence": [], "auditHistory": [],
        })
        if confidence == "CONFIRMED":
            row["confidence"] = "CONFIRMED"
        row["evidence"].append(evidence)
        if cid:
            official_for_cid = official_prefix_by_college.get(int(cid), "")
            if official_for_cid and not code.startswith(official_for_cid):
                row["evidence"].append(f"استُبعد ارتباط تاريخي بالكلية {cid} لأن Prefix الرسمي لها {official_for_cid} لا يطابق {code}.")
            elif cid not in row["collegeIds"]:
                row["collegeIds"].append(cid)
        elif known_prefix:
            owners=[college_id for college_id,pfx in official_prefix_by_college.items() if pfx==known_prefix]
            if len(owners)==1 and owners[0] not in row["collegeIds"]:
                row["collegeIds"].append(owners[0])
                row["evidence"].append(f"ربط بالكلية {owners[0]} من Prefix الرسمي {known_prefix} الذي زوّد به مدير النظام.")

    # Exact alpha anchors in schedules and the legacy room table. A full-looking
    # code is not automatically truth: an isolated 012Bxx inside the boys'
    # college, whose own history consistently proves 011B, is itself evidence
    # of a typo. This is the G09 principle applied to prefixes too.
    exact_alpha_counts = Counter()
    exact_alpha_context = Counter()
    for row in schedules:
        code = alpha_building(row.get("AdRoomCode"))
        if code:
            exact_alpha_counts[code] += 1
            exact_alpha_context[(int(row.get("AdCollegeId") or 0), code)] += 1
    for (cid, code), count in exact_alpha_context.items():
        dominant = dominant_prefix_site.get(cid)
        if dominant and code[:4] != dominant and count < 3 and code not in USER_CONFIRMED_BUILDINGS:
            continue
        conf = "CONFIRMED" if count >= 2 and (not dominant or code[:4] == dominant) else "PROBABLE"
        ensure_building(code, conf, "HISTORICAL_FULL_CODE", f"ظهر ككود كامل {count} مرة في سياق أكاديمي متسق.", cid)
    for room in legacy_rooms:
        code = alpha_building(room.get("AdRoomCode"))
        if code:
            ensure_building(code, "CONFIRMED", "LEGACY_ROOM_CATALOG", "موجود ككود مبنى كامل في سجل القاعات القديم.")

    # Re-interpret full and suffix-only historical values using the owner-provided
    # college/site prefixes. This is the key guard against global bare-number
    # guesses: the same "1" can resolve differently in 0520, 0510, 012F, etc.
    authoritative_full_counts: Counter[tuple[int, str]] = Counter()
    malformed_authoritative_counts: Counter[tuple[int, str]] = Counter()
    for row in schedules:
        cid = int(row.get("AdCollegeId") or 0)
        prefix = official_prefix_by_college.get(cid)
        if not prefix:
            continue
        full = full_building_for_prefix(row.get("AdRoomCode"), prefix)
        if full:
            authoritative_full_counts[(cid, full)] += 1
        malformed = legacy_missing_site_letter(row.get("AdRoomCode"), prefix)
        if malformed:
            malformed_authoritative_counts[(cid, malformed)] += 1

    for (cid, code), count in authoritative_full_counts.items():
        ensure_building(code, "CONFIRMED", "OWNER_COLLEGE_PREFIX", f"الكود يطابق Prefix الكلية الرسمي {official_prefix_by_college[cid]} وظهر كاملاً {count} مرة.", cid)
    for (cid, code), count in malformed_authoritative_counts.items():
        conf = "CONFIRMED" if count >= 5 else "PROBABLE"
        ensure_building(code, conf, "OWNER_PREFIX_LEGACY_REPAIR", f"ظهر الشكل التاريخي فاقد حرف الموقع {count} مرة داخل كلية Prefix الرسمي لها {official_prefix_by_college[cid]}؛ حُفظ كـ alias سياقي فقط.", cid)

    # Suffix-only building numbers are evaluated only inside an authoritative
    # college prefix and with room/term evidence. Low-evidence numbers remain
    # probable/review rather than becoming official by regex.
    suffix_rows: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
    for row in schedules:
        cid = int(row.get("AdCollegeId") or 0)
        if cid not in official_prefix_by_college:
            continue
        token = norm(row.get("AdRoomCode"))
        if invalid(token) or full_building_for_prefix(token, official_prefix_by_college[cid]):
            continue
        number = bare_number(token)
        if number is not None and number <= 99:
            suffix_rows[(cid, number)].append(row)

    for (cid, number), rows in suffix_rows.items():
        prefix = official_prefix_by_college[cid]
        if len(rows) < 3:
            continue
        valid_room_rows = []
        suspicious_room_as_building = 0
        distinct_rooms: set[str] = set()
        tids: set[int] = set()
        for row in rows:
            room_raw = norm(row.get("AdRoomHall"))
            if invalid(room_raw):
                continue
            room_full = full_building_for_prefix(room_raw, prefix)
            room_short = alpha_short(room_raw) if prefix[-1:].isalpha() else None
            if room_full or (room_short and room_short[0] == prefix[-1]):
                suspicious_room_as_building += 1
                continue
            valid_room_rows.append(row)
            distinct_rooms.add(room_raw)
            tids.add(int(row.get("AdTermId") or 0))
        valid_ratio = len(valid_room_rows) / max(1, len(rows))
        suspicious_ratio = suspicious_room_as_building / max(1, len(rows))
        code = building_code_from_prefix(prefix, number)
        exact_or_malformed = authoritative_full_counts[(cid, code)] + malformed_authoritative_counts[(cid, code)]
        if exact_or_malformed:
            conf = "CONFIRMED" if exact_or_malformed >= 3 else "PROBABLE"
        elif prefix.isdigit():
            strong = len(rows) >= 8 and valid_ratio >= 0.70 and len(distinct_rooms) >= 2 and len(tids) >= 2
            usable = len(rows) >= 4 and valid_ratio >= 0.55 and len(distinct_rooms) >= 1
            if not usable:
                continue
            conf = "CONFIRMED" if strong else "PROBABLE"
        else:
            strong = len(rows) >= 12 and valid_ratio >= 0.75 and len(distinct_rooms) >= 2 and len(tids) >= 2 and suspicious_ratio < 0.20
            usable = len(rows) >= 5 and valid_ratio >= 0.55 and suspicious_ratio < 0.35
            if not usable:
                continue
            conf = "CONFIRMED" if strong else "PROBABLE"
        ensure_building(code, conf, "OWNER_PREFIX_SUFFIX_CONTEXT", f"الرقم {number} ظهر {len(rows)} مرة داخل Prefix رسمي {prefix}; صلاحية القاعات={valid_ratio:.2f}، قاعات مختلفة={len(distinct_rooms)}، فصول={len(tids)}.", cid)

    # Strong short forms can safely establish missing official codes only when the college itself proves one prefix/site.
    for cid, prefix_site in dominant_prefix_site.items():
        site_letter = prefix_site[-1]
        for token, count in by_college_building[cid].items():
            short = alpha_short(token)
            if not short or short[0] != site_letter or short[1] == 0:
                continue
            if count < 3:
                continue
            code = f"{prefix_site}{short[1]:02d}"
            ensure_building(code, "CONFIRMED" if count >= 8 or exact_alpha_counts[code] else "PROBABLE", "CONTEXTUAL_SITE_PREFIX", f"الكلية تثبت البادئة {prefix_site} وظهر الاختصار {token} {count} مرة.", cid)

    # Six-digit historical values are not assumed to follow the alpha scheme. Keep only repeated ones as probable candidates.
    numeric_full_counts: Counter[tuple[int, str]] = Counter()
    for row in schedules:
        code = numeric_full_building(row.get("AdRoomCode"))
        if code:
            numeric_full_counts[(int(row.get("AdCollegeId") or 0), code)] += 1
    for (cid, code), count in numeric_full_counts.items():
        owner_prefix = official_prefix_by_college.get(cid, "")
        if owner_prefix:
            # Numeric-prefix colleges legitimately have six-digit full building
            # codes such as 052001/042024. Alpha-prefix colleges do not: a value
            # like 031001 is handled only by the contextual legacy-repair rule.
            if full_building_for_prefix(code, owner_prefix):
                canonical = full_building_for_prefix(code, owner_prefix)
                if canonical:
                    ensure_building(canonical, "CONFIRMED" if count >= 2 else "PROBABLE", "OWNER_COLLEGE_PREFIX", f"كود كامل متوافق مع Prefix الكلية الرسمي {owner_prefix} وظهر {count} مرة.", cid)
                continue
            if legacy_missing_site_letter(code, owner_prefix):
                continue
        if count >= 3:
            ensure_building(code, "PROBABLE", "HISTORICAL_FULL_NUMERIC", f"ظهر الكود الرقمي الكامل {count} مرات في كلية بلا صيغة رسمية حاسمة؛ أبقي بدرجة مرشح قوي.", cid)

    # Owner-confirmed official examples, including a site not represented clearly in history.
    for code, meta in USER_CONFIRMED_BUILDINGS.items():
        ensure_building(code, "CONFIRMED", meta["source"], "كود رسمي ذكره مالك النظام صراحة في متطلبات المشروع.")
        candidates[code]["siteName"] = meta["siteName"]
        candidates[code]["branchName"] = meta["branchName"]

    # Building resolver used for analysis and seed aliases.
    mapping: dict[tuple[int, str], dict[str, Any]] = {}
    candidate_by_college_number: dict[tuple[int, int], list[str]] = defaultdict(list)
    for code, item in candidates.items():
        for cid in item["collegeIds"]:
            if str(item["buildingNumber"]).isdigit():
                candidate_by_college_number[(cid, int(item["buildingNumber"]))].append(code)

    # Direct exact/short aliases first.
    for row in schedules:
        cid = int(row.get("AdCollegeId") or 0)
        token = norm(row.get("AdRoomCode"))
        if invalid(token):
            continue
        owner_prefix = official_prefix_by_college.get(cid, "")
        owner_full = full_building_for_prefix(token, owner_prefix) if owner_prefix else None
        if owner_full and owner_full in candidates:
            target = candidates[owner_full]
            mapping[(cid, token)] = {"code": owner_full, "confidence": target["confidence"], "rule": "OWNER_PREFIX_FULL", "evidence": [f"القيمة تطابق Prefix الكلية الرسمي {owner_prefix}."]}
            continue
        repaired = legacy_missing_site_letter(token, owner_prefix) if owner_prefix else None
        if repaired and repaired in candidates:
            target = candidates[repaired]
            mapping[(cid, token)] = {"code": repaired, "confidence": target["confidence"], "rule": "OWNER_PREFIX_LEGACY_REPAIR", "evidence": [f"تم تفسير الشكل التاريخي داخل الكلية فقط وفق Prefix الرسمي {owner_prefix}; لا تُطبق القاعدة عالميًا."]}
            continue
        direct = alpha_building(token)
        if direct and direct in candidates and (not owner_prefix or direct.startswith(owner_prefix)):
            target = candidates[direct]
            mapping[(cid, token)] = {"code": direct, "confidence": target["confidence"], "rule": "FULL_CODE", "evidence": ["القيمة نفسها كود كامل معروف ومتوافق مع سياق الكلية."]}
            continue
        short = alpha_short(token)
        prefix_site = dominant_prefix_site.get(cid)
        if short and prefix_site and prefix_site[-1:].isalpha() and short[0] == prefix_site[-1]:
            code = f"{prefix_site}{short[1]:02d}"
            if code in candidates:
                target = candidates[code]
                observed_conf = "CONFIRMED" if by_college_building[cid][token] >= 3 else "PROBABLE"
                conf = "CONFIRMED" if target["confidence"] == "CONFIRMED" and observed_conf == "CONFIRMED" else "PROBABLE"
                mapping[(cid, token)] = {"code": code, "confidence": conf, "rule": "SITE_SHORT", "evidence": [f"الاختصار {token} داخل كلية Prefix الرسمي/المثبت لها {prefix_site}."]}
                continue
        numeric_full = numeric_full_building(token)
        if numeric_full in candidates:
            target = candidates[numeric_full]
            mapping[(cid, token)] = {"code": numeric_full, "confidence": target["confidence"], "rule": "FULL_NUMERIC", "evidence": ["قيمة رقمية كاملة متكررة ضمن سياق الكلية."]}

    # Bare number contextual aliases. Never global: only bind within a college that has exactly one compatible building.
    for cid, counts in by_college_building.items():
        for token, count in counts.items():
            number = bare_number(token)
            if number is None or invalid(token):
                continue
            compatible = sorted(set(candidate_by_college_number.get((cid, number), [])))
            if len(compatible) != 1:
                continue
            code = compatible[0]
            # Build a fingerprint from already-resolved coded aliases for this candidate.
            coded = Counter()
            coded_count = 0
            for (mcid, mtok), info in mapping.items():
                if mcid == cid and info["code"] == code and mtok != token:
                    coded.update(room_fp[(cid, mtok)])
                    coded_count += by_college_building[cid][mtok]
            overlap = overlap_ratio(room_fp[(cid, token)], coded)
            shared_rooms = len(set(room_fp[(cid, token)]) & set(coded))
            if coded_count >= 8 and (overlap >= 0.12 or shared_rooms >= 4 or exact_alpha_counts[code] >= 2):
                observed_confidence = "CONFIRMED" if coded_count >= 20 and (overlap >= 0.18 or shared_rooms >= 6 or exact_alpha_counts[code] >= 3 or authoritative_full_counts[(cid, code)] >= 2 or malformed_authoritative_counts[(cid, code)] >= 5) else "PROBABLE"
                confidence = "CONFIRMED" if candidates[code]["confidence"] == "CONFIRMED" and observed_confidence == "CONFIRMED" else "PROBABLE"
                mapping[(cid, token)] = {
                    "code": code, "confidence": confidence, "rule": "BARE_NUMBER_CONTEXT",
                    "evidence": [f"الرقم {token} حُسم داخل الكلية فقط؛ المرشح الوحيد لنفس رقم المبنى هو {code}.", f"بصمة القاعات تشترك في {shared_rooms} رمزاً، ونسبة التداخل {overlap:.2f}."],
                }

    # Common reversed typo (13B -> B13), only when one dominant site and a strong forward code exists.
    for cid, counts in by_college_building.items():
        prefix_site = dominant_prefix_site.get(cid)
        if not prefix_site:
            continue
        site_letter = prefix_site[-1]
        for token, count in counts.items():
            m = re.fullmatch(r"0*(\d{1,2})([A-Z])", token)
            if not m or m.group(2) != site_letter:
                continue
            code = f"{prefix_site}{int(m.group(1)):02d}"
            forward_count = sum(v for t, v in counts.items() if alpha_short(t) == (site_letter, int(m.group(1))))
            if code in candidates and forward_count >= 20:
                mapping[(cid, token)] = {"code": code, "confidence": "PROBABLE", "rule": "REVERSED_SHORT", "evidence": [f"القيمة معكوسة شكلياً، بينما الصيغة {site_letter}{int(m.group(1)):02d} ظهرت {forward_count} مرة."]}

    # Attach contextual aliases and usage to buildings.
    alias_usage: dict[str, Counter[str]] = defaultdict(Counter)
    mapped_rows: list[tuple[dict[str, Any], str, str]] = []
    for row in schedules:
        cid = int(row.get("AdCollegeId") or 0)
        token = norm(row.get("AdRoomCode"))
        info = mapping.get((cid, token))
        if not info:
            continue
        code = info["code"]
        item = candidates[code]
        alias_usage[code][str(row.get("AdRoomCode") or "").strip()] += 1
        sid = int(row.get("AdSectionId") or 0)
        if cid and cid not in item["collegeIds"]: item["collegeIds"].append(cid)
        if sid and sid not in item["sectionIds"]: item["sectionIds"].append(sid)
        item["historicalUsageCount"] += 1
        tid = int(row.get("AdTermId") or 0)
        tids = item.setdefault("_termIds", set()); tids.add(tid)
        mapped_rows.append((row, code, info["confidence"]))
    for code, item in candidates.items():
        aliases = []
        for value, count in alias_usage.get(code, Counter()).most_common():
            if not value or norm(value) == norm(code):
                continue
            # Find strongest contextual decision for this normalized spelling.
            infos = [info for (cid, tok), info in mapping.items() if tok == norm(value) and info["code"] == code]
            conf = "CONFIRMED" if any(i["confidence"] == "CONFIRMED" for i in infos) else "PROBABLE"
            evidence = []
            for info in infos:
                evidence.extend(info.get("evidence") or [])
            aliases.append({"value": value, "usageCount": count, "confidence": conf, "evidence": list(dict.fromkeys(evidence))[:4]})
        item["aliases"] = aliases
        tids = sorted(item.pop("_termIds", set()))
        if tids:
            item["firstTermId"] = min(tids, key=lambda t: term_sort_key(term_name.get(t, ""), t))
            item["lastTermId"] = max(tids, key=lambda t: term_sort_key(term_name.get(t, ""), t))
        item["collegeIds"] = sorted(set(item["collegeIds"]))
        item["sectionIds"] = sorted(set(item["sectionIds"]))
        if not item["branchName"] and item["collegeIds"]:
            names = [college_name.get(cid, "") for cid in item["collegeIds"] if college_name.get(cid)]
            item["branchName"] = "، ".join(names[:3])
        item["evidence"] = list(dict.fromkeys(item["evidence"]))[:8]

    # Room registry: only build from schedules whose building itself was resolved CONFIRMED.
    room_obs: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    room_raw_obs: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    confirmed_building_rows: list[tuple[dict[str, Any], str]] = []
    for row, bcode, bconfidence in mapped_rows:
        if bconfidence != "CONFIRMED":
            continue
        confirmed_building_rows.append((row, bcode))
        raw_room = norm(row.get("AdRoomHall"))
        if invalid(raw_room):
            continue
        alpha = canonical_room_alpha(raw_room)
        if alpha:
            room_obs[(bcode, alpha)].append(row)
            room_raw_obs[(bcode, raw_room)].append(row)

    room_candidates: dict[tuple[str, str], dict[str, Any]] = {}
    def add_room_candidate(bcode: str, canonical: str, rows: list[dict[str, Any]], confidence: str, source: str, evidence: list[str]):
        building = candidates[bcode]
        tids = {int(r.get("AdTermId") or 0) for r in rows}
        cids = {int(r.get("AdCollegeId") or 0) for r in rows if int(r.get("AdCollegeId") or 0)}
        sids = {int(r.get("AdSectionId") or 0) for r in rows if int(r.get("AdSectionId") or 0)}
        first = min(tids, key=lambda t: term_sort_key(term_name.get(t, ""), t)) if tids else None
        last = max(tids, key=lambda t: term_sort_key(term_name.get(t, ""), t)) if tids else None
        key = (bcode, canonical)
        room_candidates[key] = {
            "id": f"room_{sanitize_id(bcode)}_{sanitize_id(canonical)}", "buildingId": building["id"], "buildingCode": bcode,
            "canonicalCode": canonical, "active": conf == "CONFIRMED", "aliases": [], "collegeIds": sorted(cids), "sectionIds": sorted(sids),
            "primarySectionIds": [], "shared": False, "sharedConfidence": "REVIEW_REQUIRED", "historicalUsageCount": len(rows),
            "firstTermId": first, "lastTermId": last, "confidence": confidence, "source": source, "description": "",
            "evidence": evidence[:8], "auditHistory": [],
        }

    # Alpha-shaped room codes are strong when repeated across time, or enough times in one term.
    for (bcode, canonical), rows in room_obs.items():
        tids = {int(r.get("AdTermId") or 0) for r in rows}
        if len(rows) >= 2:
            conf = "CONFIRMED" if len(rows) >= 5 and (len(tids) >= 2 or len(rows) >= 12) else "PROBABLE"
            add_room_candidate(bcode, canonical, rows, conf, "HISTORICAL_ROOM_PATTERN", [f"ظهر {len(rows)} مرة داخل {bcode} عبر {len(tids)} فصل/فصول."])

    # Numeric room observations. Map to one alpha candidate only with contextual evidence;
    # otherwise a persistent numeric-only room can be its own official candidate.
    numeric_obs: dict[tuple[str, int], list[dict[str, Any]]] = defaultdict(list)
    for row, bcode in confirmed_building_rows:
        raw = norm(row.get("AdRoomHall"))
        if invalid(raw): continue
        num = room_numeric(raw)
        if num is not None:
            numeric_obs[(bcode, num)].append(row)

    numeric_room_mapping: dict[tuple[str, int], dict[str, Any]] = {}
    for (bcode, num), rows in numeric_obs.items():
        compatible = []
        for (cb, code), item in room_candidates.items():
            if cb != bcode: continue
            shape = room_shape(code)
            if shape and shape[1] == num and shape[2] == "": compatible.append((code, item))
        if len(compatible) == 1:
            code, alpha_item = compatible[0]
            alpha_rows = room_obs[(bcode, code)]
            num_sections = {int(r.get("AdSectionId") or 0) for r in rows}
            alpha_sections = {int(r.get("AdSectionId") or 0) for r in alpha_rows}
            num_terms = {int(r.get("AdTermId") or 0) for r in rows}
            alpha_terms = {int(r.get("AdTermId") or 0) for r in alpha_rows}
            common_sections = len((num_sections & alpha_sections) - {0})
            common_terms = len((num_terms & alpha_terms) - {0})
            if len(alpha_rows) >= 5 and len(rows) >= 2 and (common_sections >= 1 or common_terms >= 2):
                conf = "CONFIRMED" if len(alpha_rows) >= 10 and len(rows) >= 4 and common_sections >= 1 and common_terms >= 1 else "PROBABLE"
                numeric_room_mapping[(bcode, num)] = {"code": code, "confidence": conf, "evidence": [f"الرقم {num} له مرشح حرفي وحيد {code} داخل المبنى.", f"اشتراك الأقسام={common_sections}، اشتراك الفصول={common_terms}."]}
                continue
        if len(compatible) == 0:
            tids = {int(r.get("AdTermId") or 0) for r in rows}
            # Some sites genuinely use numeric hall codes. Repetition across terms is stronger than inventing F/G/S.
            if len(rows) >= 3 and (len(tids) >= 2 or len(rows) >= 8):
                code = str(num)
                conf = "CONFIRMED" if len(rows) >= 8 and len(tids) >= 2 else "PROBABLE"
                add_room_candidate(bcode, code, rows, conf, "HISTORICAL_NUMERIC_ROOM", [f"رمز رقمي ثابت ظهر {len(rows)} مرة عبر {len(tids)} فصول ولا يوجد مرشح حرفي لنفس الرقم داخل المبنى."])
                numeric_room_mapping[(bcode, num)] = {"code": code, "confidence": conf, "evidence": ["قاعة رقمية مستقلة متكررة تاريخياً."]}

    # Resolve raw room spellings and attach aliases/usage relationships.
    room_mapping: dict[tuple[str, str], dict[str, Any]] = {}
    for (bcode, canonical), item in room_candidates.items():
        for row in room_obs.get((bcode, canonical), []):
            raw = norm(row.get("AdRoomHall"))
            room_mapping[(bcode, raw)] = {"code": canonical, "confidence": item["confidence"], "rule": "ROOM_ALPHA", "evidence": item["evidence"]}
    for (bcode, num), info in numeric_room_mapping.items():
        room_mapping[(bcode, str(num))] = {"code": info["code"], "confidence": info["confidence"], "rule": "ROOM_NUMERIC_CONTEXT", "evidence": info["evidence"]}
        # Leading-zero numeric spellings normalize to same integer and are matched by runtime normalizer.

    room_alias_usage: dict[tuple[str, str], Counter[str]] = defaultdict(Counter)
    room_usage_rows: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row, bcode in confirmed_building_rows:
        raw_token = norm(row.get("AdRoomHall"))
        info = room_mapping.get((bcode, raw_token))
        if not info:
            num = room_numeric(raw_token)
            if num is not None:
                info = numeric_room_mapping.get((bcode, num))
        if not info or (bcode, info["code"]) not in room_candidates:
            continue
        key = (bcode, info["code"])
        room_usage_rows[key].append(row)
        raw_value = str(row.get("AdRoomHall") or "").strip()
        if raw_value and norm(raw_value) != norm(info["code"]):
            room_alias_usage[key][raw_value] += 1

    for key, item in room_candidates.items():
        rows = room_usage_rows.get(key) or room_obs.get(key) or []
        if rows:
            item["historicalUsageCount"] = len(rows)
            item["collegeIds"] = sorted({int(r.get("AdCollegeId") or 0) for r in rows if int(r.get("AdCollegeId") or 0)})
            # Regular associations: not a single accidental use.
            section_counts = Counter(int(r.get("AdSectionId") or 0) for r in rows if int(r.get("AdSectionId") or 0))
            section_terms: dict[int, set[int]] = defaultdict(set)
            for r in rows:
                sid = int(r.get("AdSectionId") or 0); tid = int(r.get("AdTermId") or 0)
                if sid: section_terms[sid].add(tid)
            regular = sorted(sid for sid, count in section_counts.items() if count >= 3 or len(section_terms[sid]) >= 2)
            item["sectionIds"] = regular or sorted(section_counts)
            ranked = section_counts.most_common()
            total = sum(section_counts.values()) or 1
            item["primarySectionIds"] = [sid for sid, count in ranked if count / total >= 0.45][:2] or ([ranked[0][0]] if ranked else [])
            strong_sections = [sid for sid, count in section_counts.items() if count >= 3 and len(section_terms[sid]) >= 2]
            all_terms = {int(r.get("AdTermId") or 0) for r in rows}
            shared = len(strong_sections) >= 2 or (len(section_counts) >= 3 and len(all_terms) >= 3 and sum(1 for c in section_counts.values() if c >= 2) >= 2)
            item["shared"] = shared
            item["sharedConfidence"] = "CONFIRMED" if shared and len(all_terms) >= 3 and len(strong_sections) >= 2 else "PROBABLE" if shared else "CONFIRMED"
            item["evidence"] = list(dict.fromkeys(item.get("evidence", []) + ([f"استُخدمت بانتظام من {len(strong_sections)} أقسام عبر {len(all_terms)} فصول؛ صُنفت مشتركة." ] if shared else [])))[:8]
        aliases=[]
        for value,count in room_alias_usage.get(key, Counter()).most_common():
            info = room_mapping.get((key[0], norm(value)))
            if not info:
                num=room_numeric(value); info=numeric_room_mapping.get((key[0],num)) if num is not None else None
            aliases.append({"value": value, "usageCount": count, "confidence": (info or {}).get("confidence", "PROBABLE"), "evidence": (info or {}).get("evidence", [])[:4]})
        item["aliases"] = aliases

    # Update roomCount after final room set.
    for code, item in candidates.items():
        item["roomCount"] = sum(1 for (bcode, _code) in room_candidates if bcode == code)

    # Review cases: only values requiring human knowledge; invalid placeholders stay in stats, not the help document.
    review_cases: list[dict[str, Any]] = []
    def context_for_rows(rows: list[dict[str, Any]]):
        tids=sorted({int(r.get("AdTermId") or 0) for r in rows}, key=lambda t: term_sort_key(term_name.get(t,""),t))
        sids=sorted({int(r.get("AdSectionId") or 0) for r in rows if int(r.get("AdSectionId") or 0)})
        cids=sorted({int(r.get("AdCollegeId") or 0) for r in rows if int(r.get("AdCollegeId") or 0)})
        return {
            "termNames":[term_name.get(t,str(t)) for t in tids],
            "sectionNames":[section_name.get(s,str(s)) for s in sids],
            "collegeNames":[college_name.get(c,str(c)) for c in cids],
            "sectionIds":sids,"collegeIds":cids,
        }

    grouped_unresolved_buildings: dict[str, list[dict[str, Any]]] = defaultdict(list)
    invalid_building_rows=0
    for row in schedules:
        cid=int(row.get("AdCollegeId") or 0); token=norm(row.get("AdRoomCode"))
        if invalid(token): invalid_building_rows += 1; continue
        if (cid,token) in mapping: continue
        grouped_unresolved_buildings[token].append(row)
    for token, rows in sorted(grouped_unresolved_buildings.items(), key=lambda kv:(-len(kv[1]),kv[0])):
        raw_count=building_field_counts[token]; room_count=room_field_counts[token]
        kind="SWAPPED_FIELDS" if room_count >= max(3, raw_count*2) or (room_shape(token) and not alpha_building(token)) else "BUILDING"
        possible=[]
        for cid in {int(r.get("AdCollegeId") or 0) for r in rows}:
            num=bare_number(token)
            if num is not None: possible.extend(candidate_by_college_number.get((cid,num),[]))
        ctx=context_for_rows(rows)
        review_cases.append({
            "id":f"review_building_{sanitize_id(token or 'blank')}","kind":kind,"rawValue":token,"occurrences":len(rows),
            **ctx,"buildingCandidates":sorted(set(possible)),"buildingCandidate":sorted(set(possible))[0] if len(set(possible))==1 else "",
            "roomCandidate":"","reason": (f"القيمة تظهر أيضاً {room_count} مرة في خانة القاعة؛ احتمال انتقال عمود/قيمة قاعة." if kind=="SWAPPED_FIELDS" else "لا توجد قرائن كافية تربط القيمة بمبنى رسمي واحد دون تخمين."),
            "recommendation":"ثبّت الكود الرسمي للمبنى أو أكد أن القيمة ليست مبنى.","confidence":"REVIEW_REQUIRED","status":"open"
        })

    unresolved_room_groups: dict[tuple[str,str], list[dict[str, Any]]] = defaultdict(list)
    invalid_room_rows=0
    confirmed_building_schedule_count=0
    canonical_room_schedule_count=0
    for row,bcode in confirmed_building_rows:
        confirmed_building_schedule_count += 1
        raw=norm(row.get("AdRoomHall"))
        if invalid(raw): invalid_room_rows += 1; continue
        info=room_mapping.get((bcode,raw))
        if not info:
            num=room_numeric(raw); info=numeric_room_mapping.get((bcode,num)) if num is not None else None
        if info and (bcode,info["code"]) in room_candidates and info.get("confidence") == "CONFIRMED":
            canonical_room_schedule_count += 1
            continue
        if info and (bcode,info["code"]) in room_candidates and info.get("confidence") == "PROBABLE":
            # Probable rooms are deliberately left for admin help/migration review.
            unresolved_room_groups[(bcode,raw)].append(row)
            continue
        unresolved_room_groups[(bcode,raw)].append(row)

    for (bcode, raw), rows in sorted(unresolved_room_groups.items(), key=lambda kv:(-len(kv[1]),kv[0])):
        num=room_numeric(raw)
        candidates_same_num=[]
        if num is not None:
            for (cb,code), item in room_candidates.items():
                shape=room_shape(code)
                if cb==bcode and shape and shape[1]==num: candidates_same_num.append(code)
        alpha=canonical_room_alpha(raw)
        if alpha and (bcode,alpha) in room_candidates: candidates_same_num=[alpha]
        ctx=context_for_rows(rows)
        reason="القيمة لا تطابق قاعة رسمية عالية الثقة داخل هذا المبنى."
        if len(candidates_same_num)>1: reason=f"الرقم يطابق أكثر من قاعة داخل المبنى: {', '.join(sorted(candidates_same_num))}."
        elif len(candidates_same_num)==1: reason=f"يوجد مرشح {candidates_same_num[0]} لكن الدليل التاريخي لم يصل إلى درجة التثبيت الآلي."
        review_cases.append({
            "id":f"review_room_{sanitize_id(bcode)}_{sanitize_id(raw or 'blank')}","kind":"ROOM","rawValue":raw,"occurrences":len(rows),**ctx,
            "buildingCandidate":bcode,"buildingCandidates":[bcode],"roomCandidate":candidates_same_num[0] if len(candidates_same_num)==1 else "","roomCandidates":sorted(candidates_same_num),
            "reason":reason,"recommendation":"أكد القاعة الرسمية داخل المبنى أو اترك القيمة تاريخية غير موثقة.","confidence":"REVIEW_REQUIRED","status":"open"
        })

    # Cross-building room code report: identity remains building+room; this is an admin review signal, never an automatic merge.
    code_buildings: dict[str, list[tuple[str, dict[str, Any]]]] = defaultdict(list)
    for (bcode, rcode), item in room_candidates.items():
        if item["confidence"] == "CONFIRMED": code_buildings[rcode].append((bcode,item))
    for rcode, items in sorted(code_buildings.items()):
        if len(items) < 2: continue
        total=sum(int(item["historicalUsageCount"]) for _,item in items)
        review_cases.append({
            "id":f"review_cross_{sanitize_id(rcode)}","kind":"CROSS_BUILDING_ROOM_CODE","rawValue":rcode,"occurrences":total,
            "termNames":[],"sectionNames":[],"collegeNames":[],"sectionIds":[],"collegeIds":[],
            "buildingCandidate":"","buildingCandidates":[b for b,_ in items],"roomCandidate":rcode,"roomCandidates":[rcode],
            "reason":f"رمز القاعة {rcode} موجود كهوية مستقلة في {len(items)} مبانٍ. لا يجب دمجها عالمياً.",
            "recommendation":"راجع فقط إذا كان أحد الارتباطات التاريخية غير صحيح؛ وإلا اتركها كقاعات مستقلة حسب المبنى.","confidence":"REVIEW_REQUIRED","status":"open"
        })

    buildings = sorted(candidates.values(), key=lambda x:x["officialCode"])
    rooms = sorted(room_candidates.values(), key=lambda x:(x["buildingCode"], x["canonicalCode"]))

    confirmed_building_rows_count=sum(1 for row in schedules if (int(row.get("AdCollegeId") or 0),norm(row.get("AdRoomCode"))) in mapping and mapping[(int(row.get("AdCollegeId") or 0),norm(row.get("AdRoomCode")))]["confidence"]=="CONFIRMED")
    probable_building_rows_count=sum(1 for row in schedules if (int(row.get("AdCollegeId") or 0),norm(row.get("AdRoomCode"))) in mapping and mapping[(int(row.get("AdCollegeId") or 0),norm(row.get("AdRoomCode")))]["confidence"]=="PROBABLE")
    unresolved_building_rows=sum(len(v) for v in grouped_unresolved_buildings.values())
    confirmed_rooms=[r for r in rooms if r["confidence"]=="CONFIRMED"]
    probable_rooms=[r for r in rooms if r["confidence"]=="PROBABLE"]
    summary={
        "backupCreatedAt":payload.get("createdAt"),"scheduleCount":len(schedules),"rawBuildingSpellings":raw_building_spellings,"normalizedBuildingSpellings":normalized_building_spellings,
        "officialBuildings":len(buildings),"confirmedBuildings":sum(1 for b in buildings if b["confidence"]=="CONFIRMED"),"probableBuildings":sum(1 for b in buildings if b["confidence"]=="PROBABLE"),
        "buildingAliases":sum(len(b["aliases"]) for b in buildings),"confirmedBuildingScheduleRows":confirmed_building_rows_count,"probableBuildingScheduleRows":probable_building_rows_count,
        "unresolvedBuildingScheduleRows":unresolved_building_rows,"invalidBuildingPlaceholderRows":invalid_building_rows,
        "officialRooms":len(rooms),"confirmedRooms":len(confirmed_rooms),"probableRooms":len(probable_rooms),"roomAliases":sum(len(r["aliases"]) for r in rooms),
        "sharedRooms":sum(1 for r in rooms if r["shared"]),"confirmedRoomScheduleRows":canonical_room_schedule_count,"invalidRoomPlaceholderRowsWithinConfirmedBuildings":invalid_room_rows,
        "reviewCases":len(review_cases),"buildingReviewCases":sum(1 for x in review_cases if x["kind"] in ("BUILDING","SWAPPED_FIELDS","UNKNOWN_PREFIX")),"roomReviewCases":sum(1 for x in review_cases if x["kind"]=="ROOM"),"crossBuildingRoomCodeCases":sum(1 for x in review_cases if x["kind"]=="CROSS_BUILDING_ROOM_CODE"),
        "privacy":"No personal/user/student/instructor-identifying data is present in this analysis output.",
    }
    seed={"version":"location-registry-2026-08-24-v2","generatedAt":"2026-08-24","summary":summary,"buildings":buildings,"rooms":rooms,"reviewCases":review_cases}
    return seed


def write_ts(seed: dict[str, Any], path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    payload=json.dumps(seed,ensure_ascii=False,separators=(",",":"))
    path.write_text("// Generated from aggregate historical location evidence. No backup/PII is embedded.\nexport const LOCATION_REGISTRY_SEED = "+payload+" as const;\n",encoding="utf-8")


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("backup", type=Path)
    ap.add_argument("--seed-ts", type=Path, required=True)
    ap.add_argument("--analysis-json", type=Path, required=True)
    args=ap.parse_args()
    seed=analyze(args.backup)
    write_ts(seed,args.seed_ts)
    args.analysis_json.write_text(json.dumps(seed,ensure_ascii=False,indent=2),encoding="utf-8")
    print(json.dumps(seed["summary"],ensure_ascii=False,indent=2))

if __name__=="__main__": main()
