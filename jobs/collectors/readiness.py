"""M0 adapter status. Intentionally no HTTP, scraping, paid AI or message calls."""

from dataclasses import dataclass


@dataclass(frozen=True)
class CollectionResult:
    source: str
    status: str = "skipped_not_configured"
    observations: tuple = ()


def collect(source: str) -> CollectionResult:
    if source not in {
        "amazon_primary",
        "customs_primary",
        "dart_primary",
        "research_kwon_woojeong",
        "research_kim_myeongju",
    }:
        raise ValueError("Unknown configured source")
    return CollectionResult(source)
