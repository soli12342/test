"""Pure, deterministic Amazon metrics; synthetic inputs live only under fixtures."""

from __future__ import annotations
from datetime import date, timedelta
from typing import Mapping
from decimal import Decimal
from statistics import median

VERSION = "amazon_exposure_v1"
EUROPE5 = {"GB", "DE", "FR", "IT", "ES"}


def metrics(entries: list[dict], approved: dict[tuple[str, str], str | None], complete: bool) -> dict:
    selected = [r for r in entries if (r["marketplace"], r["asin"]) in approved]
    if not complete:
        return dict(
            apr_listing_count=None,
            apr_top10_count=None,
            apr_best_rank=None,
            apr_median_rank=None,
            apr_product_family_count=None,
            exposure_index=None,
            metric_version=VERSION,
        )
    ranks = [r["rank"] for r in selected]
    families = {approved[(r["marketplace"], r["asin"])] for r in selected} - {None}
    return dict(
        apr_listing_count=len(ranks),
        apr_top10_count=sum(r <= 10 for r in ranks),
        apr_best_rank=min(ranks) if ranks else None,
        apr_median_rank=median(ranks) if ranks else None,
        apr_product_family_count=len(families),
        unmapped_family_count=sum(approved[(r["marketplace"], r["asin"])] is None for r in selected),
        exposure_index=Decimal(100) * sum(101 - r for r in ranks) / Decimal(5050),
        metric_version=VERSION,
    )


def compare(
    previous: dict[str, int], current: dict[str, int], previous_complete: bool, current_complete: bool
) -> list[dict]:
    if not previous_complete or not current_complete:
        return []
    changes = []
    for asin in sorted(previous.keys() | current.keys()):
        before, after = previous.get(asin), current.get(asin)
        state = "ranked" if after is not None else "out_of_top100"
        changes.append(
            dict(
                asin=asin,
                previous_rank=before,
                rank=after,
                rank_state=state,
                rank_change=before - after if before is not None and after is not None else None,
                new_entry=before is None,
                exit=after is None,
                top10_entry=after is not None and after <= 10 and (before is None or before > 10),
                top10_exit=before is not None and before <= 10 and (after is None or after > 10),
            )
        )
    return changes


def europe5(points: Mapping[str, Decimal | None]) -> dict:
    valid = [v for m in EUROPE5 if (v := points.get(m)) is not None]
    return dict(
        value=sum(valid, Decimal(0)) / 5 if len(valid) == 5 else None, n_valid=len(valid), n_expected=5
    )


def rolling(points: Mapping[date, Decimal | None], end: date, days: int) -> dict:
    if days not in (7, 30):
        raise ValueError("Only 7/30 calendar-day windows")
    valid = [points.get(end - timedelta(days=i)) for i in range(days)]
    values = [v for v in valid if v is not None]
    threshold = 5 if days == 7 else 24
    return dict(
        value=sum(values, Decimal(0)) / len(values) if len(values) >= threshold else None,
        n_valid=len(values),
        n_expected=days,
    )


def review_delta(
    previous: int | None, current: int | None, previous_scope: str | None, scope: str | None
) -> dict:
    if not previous_scope or previous_scope != scope:
        return {"value": None, "quality_flag": "REVIEW_SCOPE_CHANGED_OR_UNKNOWN"}
    if previous is None or current is None:
        return {"value": None, "quality_flag": "NOT_COLLECTED"}
    if current < previous:
        return {"value": None, "quality_flag": "REVIEW_COUNT_DECREASED"}
    return {"value": current - previous, "quality_flag": None}
