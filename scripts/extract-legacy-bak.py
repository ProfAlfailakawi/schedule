#!/usr/bin/env python3
"""Extract the legacy SCHEDULE SQL Server backup without modifying SQL Server.

This parser is intentionally scoped to the SQL Server page/record formats used by the
provided SCHEDULE backup. It reads the Microsoft Tape Format MQDA stream, reconstructs
catalog metadata, exports every non-empty user table, and writes the active SCHEDULE
collections in the shape expected by the new Firestore application.

It is read-only: the source backup is never modified.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import secrets
import struct
import tempfile
import zipfile
from typing import Any, Dict, Iterable, List, Tuple

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

PAGE = 8192
SYSTEM_FLAGS = {
    "sysrscols": 0x03,
    "sysrowsets": 0x05,
    "sysallocationunits": 0x07,
    "sysschobjs": 0x22,
    "syscolpars": 0x29,
}

# Current SCHEDULE columns confirmed from the compiled application + current catalog.
ACTIVE_COLUMNS = {
    "SystemUser": ["SystemUserId", "SystemUserLogin", "SystemUserPass", "Name", "IsAdminUser", "IP", "IsActive", "IsLocked", "IsDeleted"],
    "AdCollege": ["AdCollegeId", "AdCollegeName", "AdCollegeCode", "AdGenderID"],
    "AdCollegeUserAssign": ["Id", "SystemUserId", "AdCollegeId", "AdSectionId"],
    "AdCourse": ["AdCourseId", "CourseCode", "CourseName", "CourseCredit", "CourseHours", "MaxStudent", "AdSectionId", "AdRoomCode", "AdRoomHall"],
    "AdInstructor": ["AdInstructorId", "AdInstructorCivil", "AdInstructorName", "AdInstructorMobile"],
    "AdRoom": ["AdRoomId", "AdRoomCode", "AdRoomHall", "AdRoomDescrip"],
    "AdSection": ["AdSectionId", "AdSectionCode", "AdSectionName", "AdCollegeId"],
    "AdTerm": ["AdTermId", "AdTermName"],
    "FormName": ["Id", "Name"],
    "FormSecurity": ["Id", "FormName_Id", "SystemUser_Id"],
    "FSchedule": ["ID", "AdCourseId", "AdInstructorId", "AdTermId", "fsunday", "fmonday", "ftuesday", "fwednesday", "fthursday", "fdetail", "fstarttime", "fendtime", "AdRoomCode", "AdRoomHall", "SCode"],
}
ACTIVE_TABLES = set(ACTIVE_COLUMNS)


def u16(b: bytes, o: int) -> int: return struct.unpack_from("<H", b, o)[0]
def i16(b: bytes, o: int) -> int: return struct.unpack_from("<h", b, o)[0]
def u32(b: bytes, o: int) -> int: return struct.unpack_from("<I", b, o)[0]
def i32(b: bytes, o: int) -> int: return struct.unpack_from("<i", b, o)[0]
def u64(b: bytes, o: int) -> int: return struct.unpack_from("<Q", b, o)[0]
def i64(b: bytes, o: int) -> int: return struct.unpack_from("<q", b, o)[0]


def read_backup_payload(source: Path) -> bytes:
    raw: bytes
    if zipfile.is_zipfile(source):
        with zipfile.ZipFile(source) as zf:
            members = [m for m in zf.infolist() if not m.is_dir()]
            if not members:
                raise RuntimeError("Backup ZIP is empty")
            # Plesk export contains one backup payload; choose the largest file defensively.
            member = max(members, key=lambda m: m.file_size)
            raw = zf.read(member)
    else:
        raw = source.read_bytes()

    # Microsoft Tape Format SQL backup. MQDA is the database data stream.
    candidates: List[Tuple[int, int, bytes]] = []
    start = 0
    while True:
        pos = raw.find(b"MQDA", start)
        if pos < 0: break
        if pos + 24 <= len(raw):
            stream_len = u64(raw, pos + 8)
            # MTF SQL payload is aligned at +24; StreamLength includes the 2 alignment bytes.
            payload_start = pos + 24
            payload_end = pos + 22 + stream_len
            if payload_end <= len(raw) and payload_end > payload_start:
                payload = raw[payload_start:payload_end]
                if len(payload) >= PAGE and payload[0] == 1:
                    candidates.append((pos, stream_len, payload))
        start = pos + 4
    if not candidates:
        raise RuntimeError("No valid SQL Server MQDA data stream found in the backup")

    # Main MDF stream is the largest valid page-aligned payload.
    candidates.sort(key=lambda item: len(item[2]), reverse=True)
    mdf = candidates[0][2]
    # SQL Server page stream should be page aligned; trim only a trailing partial page if present.
    mdf = mdf[: len(mdf) // PAGE * PAGE]
    if len(mdf) < PAGE * 10:
        raise RuntimeError("Extracted SQL data stream is unexpectedly small")
    return mdf


def page_header(page: bytes) -> Dict[str, int]:
    return {
        "version": page[0], "type": page[1], "indexid": u16(page, 6),
        "slots": u16(page, 22), "objectid": u32(page, 24),
        "freedata": u16(page, 30), "pageid": u32(page, 32), "pminlen": u16(page, 14),
    }


def page_slots(page: bytes, h: Dict[str, int]) -> List[Tuple[int, int]]:
    count = h["slots"]
    if count > 4048 or count * 2 > PAGE: return []
    data = page[PAGE - 2 * count:]
    out = []
    for idx in range(count):
        off = u16(data, idx * 2)
        out.append((off, count - idx - 1))
    out.sort(key=lambda x: x[0])
    return out


def parse_row(raw: bytes) -> Dict[str, Any] | None:
    if len(raw) < 6: return None
    status_a = raw[0]
    nof_cols_offset = u16(raw, 2)
    if nof_cols_offset < 4 or nof_cols_offset + 2 > len(raw): return None
    fixed = raw[4:nof_cols_offset]
    ncols = u16(raw, nof_cols_offset)
    pos = nof_cols_offset + 2
    null_len = math.ceil(ncols / 8)
    if pos + null_len > len(raw): return None
    null_bitmap = raw[pos:pos + null_len]
    pos += null_len
    var_values: List[bytes] = []
    if status_a & 0x20:
        if pos + 2 > len(raw): return None
        nvar = u16(raw, pos); pos += 2
        if pos + 2 * nvar > len(raw): return None
        ends = [i16(raw, pos + 2 * i) for i in range(nvar)]
        pos += 2 * nvar
        start = pos
        for end in ends:
            clean_end = end & 0x7FFF
            if clean_end < start or clean_end > len(raw):
                var_values.append(b"")
            else:
                var_values.append(raw[start:clean_end])
                start = clean_end
    return {"raw": raw, "fixed": fixed, "ncols": ncols, "null": null_bitmap, "vars": var_values}


def data_rows(page: bytes) -> List[Dict[str, Any]]:
    h = page_header(page)
    offsets = page_slots(page, h)
    rows = []
    for idx, (off, _) in enumerate(offsets):
        if off < 96 or off >= h["freedata"]: continue
        end = offsets[idx + 1][0] if idx + 1 < len(offsets) else h["freedata"]
        if end <= off: continue
        # Only primary rows. Forwarding/ghost rows are not used in this clean backup snapshot.
        status = page[off]
        if status & 0x0E in (0x02, 0x04, 0x0A, 0x0C, 0x0E):
            continue
        row = parse_row(page[off:end])
        if row: rows.append(row)
    return rows


def pages_for_object(mdf: bytes, object_flag: int) -> Iterable[Tuple[int, bytes, Dict[str, int]]]:
    for idx in range(len(mdf) // PAGE):
        page = mdf[idx * PAGE:(idx + 1) * PAGE]
        h = page_header(page)
        if h["version"] == 1 and h["type"] == 1 and h["objectid"] == object_flag:
            yield idx, page, h


def parse_sysschobjs(row: Dict[str, Any]) -> Dict[str, Any] | None:
    f = row["fixed"]
    if len(f) < 43: return None
    o = 0
    object_id = i32(f, o); o += 4
    o += 4  # nsid
    o += 1  # nsclass
    status = u32(f, o); o += 4
    typ = f[o:o+2].decode("ascii", "ignore").strip("\x00 "); o += 2
    pid = u32(f, o); o += 4
    o += 1  # pclas
    intprop = u32(f, o); o += 4
    o += 8 + 8
    status2 = u32(f, o)
    name = row["vars"][0].decode("utf-16le", "ignore").rstrip("\x00") if row["vars"] else ""
    return {"Id": object_id, "Name": name, "Type": typ, "Pid": pid, "Status": status, "Status2": status2, "Intprop": intprop}


def parse_syscolpars(row: Dict[str, Any]) -> Dict[str, Any] | None:
    f = row["fixed"]
    if len(f) < 41: return None
    o = 0
    object_id = i32(f, o); o += 4
    number = u16(f, o); o += 2
    colid = u16(f, o); o += 2
    o += 2
    xtype = f[o]; o += 1
    utype = u32(f, o); o += 4
    length = i16(f, o); o += 2
    prec = f[o]; o += 1
    scale = f[o]; o += 1
    collationid = u32(f, o); o += 4
    status = u32(f, o); o += 4
    o += 2 + 4 + 4 + 4
    name = row["vars"][0].decode("utf-16le", "ignore").rstrip("\x00") if row["vars"] else ""
    return {"Id": object_id, "Number": number, "Colid": colid, "Name": name, "Xtype": xtype,
            "Utype": utype, "Length": length, "Prec": prec, "Scale": scale,
            "Collationid": collationid, "Status": status}


def parse_sysrowset(row: Dict[str, Any]) -> Dict[str, Any] | None:
    f = row["fixed"]
    # This SQL Server version stores the first 53 bytes of the sysrowsets physical row.
    if len(f) < 35: return None
    return {"Rowsetid": u64(f, 0), "Idmajor": i32(f, 9), "Idminor": u32(f, 13), "Rcrows": u64(f, 27)}


def parse_sysalloc(row: Dict[str, Any]) -> Dict[str, Any] | None:
    f = row["fixed"]
    if len(f) < 65: return None
    return {"Auid": u64(f, 0), "Type": f[8], "OwnerId": u64(f, 9)}


def parse_sysrscol(row: Dict[str, Any]) -> Dict[str, Any] | None:
    f = row["fixed"]
    if len(f) < 50: return None
    return {"Rsid": u64(f, 0), "Rscolid": u32(f, 8), "Ti": i32(f, 24),
            "Offset": i32(f, 40), "Nullbit": i32(f, 44), "Bitpos": i16(f, 48)}


def collect_catalog(mdf: bytes):
    parsers = {
        SYSTEM_FLAGS["sysschobjs"]: parse_sysschobjs,
        SYSTEM_FLAGS["syscolpars"]: parse_syscolpars,
        SYSTEM_FLAGS["sysrowsets"]: parse_sysrowset,
        SYSTEM_FLAGS["sysallocationunits"]: parse_sysalloc,
        SYSTEM_FLAGS["sysrscols"]: parse_sysrscol,
    }
    buckets: Dict[int, List[Dict[str, Any]]] = {flag: [] for flag in parsers}
    for flag, parser in parsers.items():
        for _, page, _ in pages_for_object(mdf, flag):
            for row in data_rows(page):
                item = parser(row)
                if item: buckets[flag].append(item)
    return buckets


def signed16_from_u32(value: int) -> int:
    low = value & 0xFFFF
    return struct.unpack("<h", struct.pack("<H", low))[0]


def choose_columns(table_name: str, object_id: int, rowset_id: int, cols: List[Dict[str, Any]], rscols: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    physical = {r["Rscolid"]: r for r in rscols if r["Rsid"] == rowset_id}
    candidates = [c for c in cols if c["Id"] == object_id and c["Number"] == 0]
    expected = ACTIVE_COLUMNS.get(table_name, [])
    selected = []
    for colid in sorted(physical):
        rc = physical[colid]
        matches = [c for c in candidates if c["Colid"] == colid and c["Xtype"] == (rc["Ti"] & 0xFF)]
        desired = expected[colid - 1] if colid - 1 < len(expected) else None
        best = next((c for c in matches if c["Name"] == desired), None)
        if best is None and colid == 1:
            best = next((c for c in matches if c["Status"] & 0x04), None)
        if best is None and matches:
            best = matches[0]
        if best is None:
            continue
        item = dict(best)
        item.update({
            "SignedOffset": signed16_from_u32(rc["Offset"]),
            "Bitpos": rc["Bitpos"],
            "Nullbit": rc["Nullbit"] & 0xFFFF,
        })
        selected.append(item)
    return selected


def decode_varchar(value: bytes) -> str:
    # Current database uses Arabic Windows code page for varchar text; ASCII is unchanged.
    for encoding in ("cp1256", "cp1252", "latin1"):
        try: return value.decode(encoding).rstrip("\x00 ")
        except UnicodeDecodeError: pass
    return value.decode("latin1", "replace").rstrip("\x00 ")


def decode_value(value: bytes, column: Dict[str, Any]) -> Any:
    xtype = column["Xtype"]
    if xtype == 0x38: return i32((value + b"\x00" * 4)[:4], 0)
    if xtype == 0x34: return i16((value + b"\x00" * 2)[:2], 0)
    if xtype == 0x30: return value[0] if value else 0
    if xtype == 0x7F: return i64((value + b"\x00" * 8)[:8], 0)
    if xtype == 0x68: return bool(value[0] & 1) if value else False
    if xtype == 0x3E: return struct.unpack("<d", (value + b"\x00" * 8)[:8])[0]
    if xtype == 0x3B: return struct.unpack("<f", (value + b"\x00" * 4)[:4])[0]
    if xtype in (0xE7, 0xEF, 0x63): return value.decode("utf-16le", "ignore").rstrip("\x00")
    if xtype in (0xA7, 0xAF, 0x23): return decode_varchar(value)
    if xtype == 0x29:  # time; current SCHEDULE is TIME(7), 5 bytes.
        scale = int(column.get("Scale", 7) or 7)
        units = int.from_bytes(value, "little", signed=False)
        seconds = units / (10 ** scale)
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        sec = seconds % 60
        if abs(sec - round(sec)) < 1e-8:
            return f"{hours:02d}:{minutes:02d}:{int(round(sec)):02d}"
        return f"{hours:02d}:{minutes:02d}:{sec:0{3+scale}.{scale}f}"
    if xtype in (0xA5, 0xAD, 0x22): return value.hex()
    # Keep unhandled historical values losslessly rather than dropping them.
    return {"$hex": value.hex(), "$sqlType": f"0x{xtype:02x}"}


def is_null(row: Dict[str, Any], colid: int) -> bool:
    bit = colid - 1
    byte_index, bit_index = divmod(bit, 8)
    bitmap = row["null"]
    return byte_index < len(bitmap) and bool(bitmap[byte_index] & (1 << bit_index))


def decode_table(mdf: bytes, table: Dict[str, Any], catalog: Dict[int, List[Dict[str, Any]]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], int]:
    object_id = table["Id"]
    rowsets = [r for r in catalog[SYSTEM_FLAGS["sysrowsets"]] if r["Idmajor"] == object_id]
    if not rowsets: return [], [], 0
    rowset = next((r for r in rowsets if r["Idminor"] in (0, 1)), rowsets[0])
    columns = choose_columns(table["Name"], object_id, rowset["Rowsetid"], catalog[SYSTEM_FLAGS["syscolpars"]], catalog[SYSTEM_FLAGS["sysrscols"]])
    var_cols = [c for c in columns if c["SignedOffset"] < 0]
    var_order = {c["Colid"]: idx for idx, c in enumerate(var_cols)}
    allocs = [a for a in catalog[SYSTEM_FLAGS["sysallocationunits"]] if a["OwnerId"] == rowset["Rowsetid"] and a["Type"] == 1]
    alloc_ids = {a["Auid"] for a in allocs}
    rows: List[Dict[str, Any]] = []
    for idx in range(len(mdf) // PAGE):
        page = mdf[idx * PAGE:(idx + 1) * PAGE]
        h = page_header(page)
        alloc_id = (h["indexid"] << 48) | (h["objectid"] << 16)
        if h["type"] != 1 or alloc_id not in alloc_ids: continue
        for row in data_rows(page):
            out: Dict[str, Any] = {}
            for col in columns:
                if is_null(row, col["Colid"]):
                    out[col["Name"]] = None
                    continue
                offset = col["SignedOffset"]
                if col["Xtype"] == 0x68:
                    out[col["Name"]] = bool(row["raw"][offset] & (1 << col["Bitpos"])) if 0 <= offset < len(row["raw"]) else False
                elif offset >= 0:
                    length = max(0, int(col["Length"]))
                    out[col["Name"]] = decode_value(row["raw"][offset:offset + length], col)
                else:
                    vindex = var_order[col["Colid"]]
                    raw_value = row["vars"][vindex] if vindex < len(row["vars"]) else b""
                    out[col["Name"]] = decode_value(raw_value, col)
            rows.append(out)
    return rows, columns, int(rowset["Rcrows"])


def scrypt_hash(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=16384, r=8, p=1, dklen=64)
    return f"scrypt${salt.hex()}${digest.hex()}"


def load_or_create_vault_key(path: Path) -> bytes:
    if path.exists():
        raw = path.read_text(encoding="ascii").strip()
        key = bytes.fromhex(raw)
        if len(key) != 32:
            raise RuntimeError("Password vault key must be exactly 32 bytes (64 hex chars)")
        return key
    path.parent.mkdir(parents=True, exist_ok=True)
    key = secrets.token_bytes(32)
    path.write_text(key.hex(), encoding="ascii")
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return key


def encrypt_legacy_password(password: str, key: bytes) -> str:
    nonce = secrets.token_bytes(12)
    sealed = AESGCM(key).encrypt(nonce, password.encode("utf-8"), b"SCHEDULE-SystemUserPass-v1")
    ciphertext, tag = sealed[:-16], sealed[-16:]
    return f"aesgcm${nonce.hex()}${ciphertext.hex()}${tag.hex()}"


def canonical_digest(rows: List[Dict[str, Any]]) -> str:
    encoded = [json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")) for row in rows]
    encoded.sort()
    return hashlib.sha256(json.dumps(encoded, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()


def build_application_export(all_tables: Dict[str, List[Dict[str, Any]]], counts: Dict[str, int], source_sha256: str, vault_key: bytes) -> Dict[str, Any]:
    sections = all_tables.get("AdSection", [])
    section_by_id = {int(s["AdSectionId"]): s for s in sections}
    courses_raw = all_tables.get("AdCourse", [])
    course_by_id: Dict[int, Dict[str, Any]] = {}
    courses = []
    for c in courses_raw:
        section = section_by_id.get(int(c["AdSectionId"]))
        record = {
            "AdCourseId": int(c["AdCourseId"]),
            "AdCollegeId": int(section["AdCollegeId"]) if section else 0,
            "AdSectionId": int(c["AdSectionId"]),
            "CourseCode": str(c.get("CourseCode") or ""),
            "CourseName": str(c.get("CourseName") or ""),
            "CourseCredit": int(c.get("CourseCredit") or 0),
            "CourseHours": float(c.get("CourseHours") or 0),
            "MaxStudent": int(c.get("MaxStudent") or 0),
        }
        courses.append(record); course_by_id[record["AdCourseId"]] = record

    users = []
    for u in all_tables.get("SystemUser", []):
        users.append({
            "SystemUserId": int(u["SystemUserId"]),
            "Name": str(u.get("Name") or ""),
            "SystemUserLogin": str(u.get("SystemUserLogin") or ""),
            "SystemUserPass": scrypt_hash(str(u.get("SystemUserPass") or "")),
            "SystemUserPassVault": encrypt_legacy_password(str(u.get("SystemUserPass") or ""), vault_key),
            "IsAdminUser": bool(u.get("IsAdminUser")),
            "IsActive": bool(u.get("IsActive")),
            "IsLocked": bool(u.get("IsLocked")),
            "IsDeleted": bool(u.get("IsDeleted")),
        })

    forms = [{"FormNameId": int(r["Id"]), "FormName": str(r.get("Name") or "")} for r in all_tables.get("FormName", [])]
    permissions = [{"legacyId": int(r["Id"]), "SystemUserId": int(r["SystemUser_Id"]), "FormNameId": int(r["FormName_Id"])} for r in all_tables.get("FormSecurity", [])]
    scopes = [{"legacyId": int(r["Id"]), "SystemUserId": int(r["SystemUserId"]), "AdCollegeId": int(r["AdCollegeId"]), "AdSectionId": int(r["AdSectionId"])} for r in all_tables.get("AdCollegeUserAssign", [])]
    colleges = [{"AdCollegeId": int(r["AdCollegeId"]), "AdCollegeCode": str(r.get("AdCollegeCode") or ""), "AdCollegeName": str(r.get("AdCollegeName") or "")} for r in all_tables.get("AdCollege", [])]
    terms = [{"AdTermId": int(r["AdTermId"]), "AdTermName": str(r.get("AdTermName") or "")} for r in all_tables.get("AdTerm", [])]
    instructors = [{"AdInstructorId": int(r["AdInstructorId"]), "AdInstructorCivil": str(r.get("AdInstructorCivil") or ""), "AdInstructorName": str(r.get("AdInstructorName") or ""), "AdInstructorMobile": str(r.get("AdInstructorMobile") or "")} for r in all_tables.get("AdInstructor", [])]
    rooms = [{"AdRoomId": int(r["AdRoomId"]), "AdRoomCode": str(r.get("AdRoomCode") or ""), "AdRoomHall": str(r.get("AdRoomHall") or ""), "AdRoomDescrip": str(r.get("AdRoomDescrip") or "")} for r in all_tables.get("AdRoom", [])]

    schedules = []
    for r in all_tables.get("FSchedule", []):
        course = course_by_id.get(int(r["AdCourseId"]))
        section_id = int(course["AdSectionId"]) if course else 0
        college_id = int(course["AdCollegeId"]) if course else 0
        schedules.append({
            "id": int(r["ID"]), "AdCollegeId": college_id, "AdSectionId": section_id,
            "AdTermId": int(r["AdTermId"]), "AdCourseId": int(r["AdCourseId"]),
            "AdCourseName": str(course["CourseName"] if course else ""), "SCode": str(r.get("SCode") or ""),
            "AdInstructorId": int(r["AdInstructorId"]),
            "fsunday": bool(r.get("fsunday")), "fmonday": bool(r.get("fmonday")), "ftuesday": bool(r.get("ftuesday")),
            "fwednesday": bool(r.get("fwednesday")), "fthursday": bool(r.get("fthursday")),
            "fstarttime": str(r.get("fstarttime") or "")[:5], "fendtime": str(r.get("fendtime") or "")[:5],
            "AdRoomCode": str(r.get("AdRoomCode") or ""), "AdRoomHall": str(r.get("AdRoomHall") or ""),
            "fdetail": str(r.get("fdetail") or ""),
        })

    archive = {name: rows for name, rows in all_tables.items() if name not in ACTIVE_TABLES}
    # Preserve an exact raw copy of every active legacy table as well. This guarantees that
    # fields which are not used by the 2026 application model (for example AdGenderID) are not
    # discarded during the SQL -> Firestore migration. The only deliberate exception is the
    # plaintext legacy password; the functional credential is preserved as a salted scrypt hash.
    for active_name in sorted(ACTIVE_TABLES):
        if active_name == "SystemUser":
            archive["__raw_SystemUser_metadata"] = [
                {k: v for k, v in row.items() if k != "SystemUserPass"} for row in all_tables.get(active_name, [])
            ]
        else:
            archive[f"__raw_{active_name}"] = all_tables.get(active_name, [])

    result: Dict[str, Any] = {
        "users": users, "formNames": forms, "formSecurity": permissions, "collegeUserAssign": scopes,
        "terms": terms, "colleges": colleges,
        "sections": [{"AdSectionId": int(r["AdSectionId"]), "AdCollegeId": int(r["AdCollegeId"]), "AdSectionCode": str(r.get("AdSectionCode") or ""), "AdSectionName": str(r.get("AdSectionName") or "")} for r in sections],
        "instructors": instructors, "courses": courses, "schedules": schedules, "rooms": rooms,
        "legacyArchive": archive,
        "migrationMeta": {
            "sourceBackupSha256": source_sha256,
            "catalogRowCounts": counts,
            "activeCounts": {
                "users": len(users), "formNames": len(forms), "formSecurity": len(permissions), "collegeUserAssign": len(scopes),
                "terms": len(terms), "colleges": len(colleges), "sections": len(sections), "instructors": len(instructors),
                "courses": len(courses), "schedules": len(schedules), "rooms": len(rooms),
            },
        },
    }
    return result


def validate_export(result: Dict[str, Any]) -> List[str]:
    errors: List[str] = []
    ids = {
        "users": {x["SystemUserId"] for x in result["users"]},
        "colleges": {x["AdCollegeId"] for x in result["colleges"]},
        "sections": {x["AdSectionId"] for x in result["sections"]},
        "terms": {x["AdTermId"] for x in result["terms"]},
        "courses": {x["AdCourseId"] for x in result["courses"]},
        "instructors": {x["AdInstructorId"] for x in result["instructors"]},
        "forms": {x["FormNameId"] for x in result["formNames"]},
    }
    for row in result["sections"]:
        if row["AdCollegeId"] not in ids["colleges"]: errors.append(f"Section {row['AdSectionId']} references missing college")
    for row in result["courses"]:
        if row["AdSectionId"] not in ids["sections"]: errors.append(f"Course {row['AdCourseId']} references missing section")
        if row["AdCollegeId"] not in ids["colleges"]: errors.append(f"Course {row['AdCourseId']} references missing college")
    for row in result["schedules"]:
        if row["AdCourseId"] not in ids["courses"]: errors.append(f"Schedule {row['id']} references missing course")
        if row["AdInstructorId"] not in ids["instructors"]: errors.append(f"Schedule {row['id']} references missing instructor")
        if row["AdTermId"] not in ids["terms"]: errors.append(f"Schedule {row['id']} references missing term")
        if row["AdSectionId"] not in ids["sections"]: errors.append(f"Schedule {row['id']} references missing section")
        if row["AdCollegeId"] not in ids["colleges"]: errors.append(f"Schedule {row['id']} references missing college")
    return errors


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("backup", type=Path)
    ap.add_argument("--output", type=Path, required=True, help="Application/Firestore JSON output")
    ap.add_argument("--report", type=Path, required=True)
    ap.add_argument("--vault-key", type=Path, default=None, help="32-byte AES key file (hex) used only to preserve the legacy admin password-view/edit workflow")
    args = ap.parse_args()
    vault_key_path = args.vault_key or (args.output.parent / "legacy-password-vault.key")
    vault_key = load_or_create_vault_key(vault_key_path)
    source_bytes = args.backup.read_bytes()
    source_sha = hashlib.sha256(source_bytes).hexdigest()
    mdf = read_backup_payload(args.backup)
    catalog = collect_catalog(mdf)
    objects = [x for x in catalog[SYSTEM_FLAGS["sysschobjs"]] if x["Type"] == "U" and x["Name"] and not x["Name"].startswith("trace_xe_")]
    all_tables: Dict[str, List[Dict[str, Any]]] = {}
    counts: Dict[str, int] = {}
    schema: Dict[str, Any] = {}
    for table in sorted(objects, key=lambda x: x["Name"]):
        rows, columns, expected_count = decode_table(mdf, table, catalog)
        all_tables[table["Name"]] = rows
        counts[table["Name"]] = expected_count
        schema[table["Name"]] = [{k: c[k] for k in ("Colid", "Name", "Xtype", "Length", "Prec", "Scale", "SignedOffset", "Bitpos")} for c in columns]
        if len(rows) != expected_count:
            raise RuntimeError(f"Row-count verification failed for {table['Name']}: catalog={expected_count}, decoded={len(rows)}")

    result = build_application_export(all_tables, counts, source_sha, vault_key)
    errors = validate_export(result)
    if errors:
        raise RuntimeError("Active data integrity failed:\n" + "\n".join(errors[:100]))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    report = {
        "sourceBackup": args.backup.name,
        "sourceBackupSha256": source_sha,
        "extractedMdfBytes": len(mdf),
        "userTables": {name: {"catalogRows": counts[name], "decodedRows": len(rows), "sha256": canonical_digest(rows)} for name, rows in sorted(all_tables.items())},
        "activeDataIntegrityErrors": errors,
        "schema": schema,
        "notes": [
            "All table counts were verified against SQL Server sysrowsets catalog metadata.",
            "Legacy passwords were converted to salted scrypt hashes for authentication. A separate AES-256-GCM compatibility vault preserves the legacy administrator password-view/edit workflow without storing plaintext in JSON.",
            "Courses derive AdCollegeId from AdSection, matching the legacy relational model.",
            "Raw copies of every active legacy table are retained in legacyArchive for lossless parity auditing; plaintext SystemUser passwords are the only intentionally excluded raw field.",
            "Orphaned historical permission/scope rows are preserved exactly; they are inert unless a matching user exists."
        ],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {args.output}")
    print(f"Wrote {args.report}")
    print(json.dumps(result["migrationMeta"]["activeCounts"], ensure_ascii=False))

if __name__ == "__main__":
    main()
