"""Manual or scheduled CLI worker. No API keys or source content are printed."""

from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
from typing import Protocol
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from jobs.imports.validate import validate_file


class RPC(Protocol):
    def call(self, name: str, params: dict) -> object: ...


class SupabaseRPC:
    def __init__(self) -> None:
        self.url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        self.key = os.environ.get("SUPABASE_SECRET_KEY", "")
        parsed = urlsplit(self.url)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or not parsed.hostname.endswith(".supabase.co")
            or parsed.username
            or parsed.port
        ):
            raise ValueError("SUPABASE_NOT_CONFIGURED")
        if not self.key or self.key.startswith("sb_publishable_"):
            raise ValueError("SERVER_CREDENTIAL_REQUIRED")

    def call(self, name: str, params: dict) -> object:
        allowed = {"claim_import_job_v1", "finish_validation_v1", "fail_import_job_v1", "commit_amazon_v1"}
        if name not in allowed:
            raise ValueError("RPC_NOT_ALLOWED")
        headers = {"apikey": self.key, "Content-Type": "application/json"}
        # Publishable/secret keys are not JWTs. Legacy service_role JWTs use both headers.
        if self.key.startswith("eyJ"):
            headers["Authorization"] = "Bearer " + self.key
        request = Request(
            self.url + "/rest/v1/rpc/" + name,
            data=json.dumps(params).encode(),
            headers=headers,
            method="POST",
        )
        with urlopen(request, timeout=30) as response:
            return json.load(response)


def process_one(api: RPC) -> str:
    job = api.call("claim_import_job_v1", {})
    if not isinstance(job, dict):
        return "no_queued_jobs"
    try:
        if not job["content"]:
            raise ValueError("PAYLOAD_EXPIRED")
        validation = validate_file(job["content"].encode(), job["filename"], set(job["allowed_hosts"]))
        if job["kind"] == "validate_import":
            api.call(
                "finish_validation_v1",
                {
                    "job": job["id"],
                    "errors": validation.errors,
                    "warnings": validation.warnings,
                    "summary": validation.snapshots,
                },
            )
            return "needs_review" if validation.valid else "validation_failed"
        if not validation.valid:
            raise ValueError("VALIDATION_FAILED")
        api.call("commit_amazon_v1", {"rows": validation.rows, "batch": job["batch_id"]})
        return "committed"
    except Exception:
        api.call("fail_import_job_v1", {"job": job["id"]})
        return "failed"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-jobs", type=int, default=10)
    parser.add_argument("--file", type=Path)
    parser.add_argument("--allowed-host", action="append", default=[])
    parser.add_argument("--encoding", default="utf-8-sig", choices=["utf-8-sig", "utf-8", "cp949"])
    parser.add_argument("--validate-only", action="store_true")
    args = parser.parse_args()
    if args.file:
        result = validate_file(args.file.read_bytes(), args.file.name, set(args.allowed_host), args.encoding)
        print(
            json.dumps(
                {
                    "valid": result.valid,
                    "rows": len(result.rows),
                    "snapshots": result.snapshots,
                    "errors": result.errors,
                    "warnings": result.warnings,
                },
                ensure_ascii=False,
            )
        )
        if not result.valid:
            raise SystemExit(1)
        if not args.validate_only:
            SupabaseRPC().call("commit_amazon_v1", {"rows": result.rows})
            print("committed")
    else:
        if args.validate_only:
            parser.error("--validate-only requires --file")
        api = SupabaseRPC()
        for _ in range(min(max(args.max_jobs, 1), 50)):
            state = process_one(api)
            print(state)
            if state == "no_queued_jobs":
                break


if __name__ == "__main__":
    main()
