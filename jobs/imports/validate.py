"""Shared contract and semantic validation. No network calls or inferred source identity."""

from __future__ import annotations
import csv
import hashlib
import io
import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo
from jsonschema import Draft7Validator, FormatChecker

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = json.loads((ROOT / "packages/contracts/schemas/amazon-row.v1.json").read_text())
HEADERS = SCHEMA["required"]
VALIDATOR = Draft7Validator(SCHEMA, format_checker=FormatChecker())
MAX_BYTES = 5 * 1024 * 1024
MAX_ROWS = 10000


@dataclass
class Validation:
    file_hash: str
    rows: list[dict] = field(default_factory=list)
    snapshots: list[dict] = field(default_factory=list)
    errors: list[dict] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def valid(self) -> bool:
        return bool(self.rows) and not self.errors


def safe_url(value: str, allowed_hosts: set[str]) -> bool:
    try:
        url = urlsplit(value)
        return (
            url.scheme == "https"
            and url.hostname in allowed_hosts
            and not url.username
            and not url.password
            and url.port in (None, 443)
        )
    except ValueError:
        return False


def validate_file(
    content: bytes, filename: str, allowed_hosts: set[str], encoding: str = "utf-8-sig"
) -> Validation:
    result = Validation(hashlib.sha256(content).hexdigest())
    if (
        len(content) > MAX_BYTES
        or "/" in filename
        or "\\" in filename
        or Path(filename).suffix.lower() not in {".csv", ".json"}
    ):
        result.errors.append({"row": 0, "code": "FILE_LIMIT_OR_TYPE"})
        return result
    if encoding not in {"utf-8-sig", "utf-8", "cp949"}:
        result.errors.append({"row": 0, "code": "ENCODING_UNSUPPORTED"})
        return result
    try:
        text = content.decode(encoding)
        if "\x00" in text:
            raise ValueError("NUL")
        if filename.lower().endswith(".json"):
            raw = json.loads(text)
            if not isinstance(raw, list):
                raise ValueError("ARRAY_REQUIRED")
        else:
            reader = csv.DictReader(io.StringIO(text), strict=True)
            if (
                reader.fieldnames is None
                or set(reader.fieldnames) != set(HEADERS)
                or len(reader.fieldnames) != len(HEADERS)
            ):
                raise ValueError("HEADERS_MISMATCH")
            raw = list(reader)
        if not raw or len(raw) > MAX_ROWS:
            raise ValueError("ROW_LIMIT")
    except (UnicodeError, ValueError, csv.Error):
        result.errors.append({"row": 0, "code": "PARSE_OR_HEADERS_FAILED"})
        return result
    groups: dict[tuple, list[dict]] = {}
    for index, original in enumerate(raw, 2):
        if not isinstance(original, dict):
            result.errors.append({"row": index, "code": "OBJECT_REQUIRED"})
            continue
        row = original.copy()
        if filename.lower().endswith(".csv"):
            row["observed_at"] = row.get("observed_at") or None
            rank = row.get("rank", "")
            if isinstance(rank, str) and rank.isascii() and rank.isdigit():
                row["rank"] = int(rank)
        errors = list(VALIDATOR.iter_errors(row))
        if errors:
            result.errors.append(
                {
                    "row": index,
                    "code": "SCHEMA_INVALID",
                    "fields": sorted({str(list(e.path)[0]) if e.path else "row" for e in errors}),
                }
            )
            continue
        if not row["category_ref"].startswith(row["marketplace"] + "_"):
            result.errors.append({"row": index, "code": "CATEGORY_MARKET_MISMATCH"})
        if not safe_url(row["source_url"], allowed_hosts):
            result.errors.append({"row": index, "code": "URL_NOT_ALLOWED"})
        if row["observed_at"]:
            instant = datetime.fromisoformat(row["observed_at"].replace("Z", "+00:00"))
            if instant.astimezone(ZoneInfo("Asia/Seoul")).date().isoformat() != row["observation_date"]:
                result.errors.append({"row": index, "code": "KST_DATE_MISMATCH"})
        if any("<" in row[f] or ">" in row[f] for f in ("title", "brand")):
            result.errors.append({"row": index, "code": "HTML_REJECTED"})
        result.rows.append(row)
        key = (row["source_ref"], row["category_ref"], row["snapshot_ref"])
        groups.setdefault(key, []).append(row)
    for key, rows in groups.items():
        dimensions = {
            (r["marketplace"], r["observation_date"], r["observed_at"], r["time_precision"]) for r in rows
        }
        if len(dimensions) != 1:
            result.errors.append({"row": 0, "code": "SNAPSHOT_METADATA_CONFLICT"})
        ranks = [r["rank"] for r in rows]
        asins = [r["asin"] for r in rows]
        if len(set(ranks)) != len(ranks) or len(set(asins)) != len(asins):
            result.errors.append({"row": 0, "code": "DUPLICATE_RANK_OR_ASIN"})
        complete = len(rows) == 100 and set(ranks) == set(range(1, 101)) and len(set(asins)) == 100
        result.snapshots.append(
            {
                "source_ref": key[0],
                "category_ref": key[1],
                "snapshot_ref": key[2],
                "actual_count": len(rows),
                "expected_count": 100,
                "completeness": "complete" if complete else "partial",
            }
        )
        if not complete:
            result.warnings.append("PARTIAL_SNAPSHOT: Top100 지표 N/A; 진입·이탈 계산 제외")
    return result


def error_csv(errors: list[dict]) -> str:
    out = io.StringIO()
    writer = csv.DictWriter(out, fieldnames=["row", "code", "fields"])
    writer.writeheader()
    for error in errors:
        writer.writerow({key: safe_cell(error.get(key, "")) for key in writer.fieldnames})
    return out.getvalue()


def safe_cell(value: object) -> object:
    if isinstance(value, (int, float)):
        return value
    text = str(value)
    return "'" + text if text.lstrip().startswith(("=", "+", "-", "@")) else text
