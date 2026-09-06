import json
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from unittest.mock import patch
import pytest
from jobs.imports.validate import validate_file, error_csv, safe_cell
from jobs.metrics.amazon import metrics, compare, europe5, rolling, review_delta
from jobs.collectors.readiness import collect
from jobs.imports.worker import process_one

FIXTURE = Path("fixtures/synthetic/amazon-complete.json")


def rows():
    return json.loads(FIXTURE.read_text())


def validate(data):
    return validate_file(json.dumps(data).encode(), "test.json", {"data.example.invalid"})


def test_T01_categories():
    cats = json.loads(Path("config/amazon_markets.json").read_text())["categories"]
    assert len(cats) == 12
    assert len({(c["marketplace"], c["canonical_type"]) for c in cats}) == 12
    assert all(c["source_node_id"] is None and c["verification_status"] == "pending" for c in cats)


def test_T02_complete_metrics():
    data = rows()
    result = validate(data)
    assert result.valid and result.snapshots[0]["completeness"] == "complete"
    values = metrics(data, {("US", "TEST000010"): "family", ("US", "TEST000020"): "family"}, True)
    assert values["apr_listing_count"] == 2 and values["apr_product_family_count"] == 1
    assert values["exposure_index"] == Decimal(100) * 172 / 5050


def test_T03_missing_page():
    result = validate(rows()[:50])
    assert result.valid
    assert result.snapshots[0]["completeness"] == "partial"
    assert metrics(result.rows, {("US", "TEST000001"): "family"}, False)["apr_listing_count"] is None


@pytest.mark.parametrize("field", ["rank", "asin"])
def test_T04_duplicates(field):
    data = rows()
    data[1][field] = data[0][field]
    assert not validate(data).valid


def test_T05_exit_not_rank_101():
    event = compare({"A": 20}, {}, True, True)[0]
    assert event["exit"] and event["rank"] is None and event["rank_state"] == "out_of_top100"


def test_T06_failure_no_exit():
    assert compare({"A": 20}, {}, True, False) == []


def test_T07_categories_not_combined():
    data = rows()
    second = [dict(r, category_ref="US_skincare") for r in data]
    assert len(validate(data + second).snapshots) == 2


def test_T08_market_listing_key():
    data = [dict(rows()[0], marketplace="GB", category_ref="GB_beauty")]
    assert metrics(data, {("US", "TEST000001"): "family"}, True)["apr_listing_count"] == 0


def test_T09_europe_coverage():
    result = europe5({c: Decimal(5) for c in ["GB", "DE", "FR", "IT"]})
    assert result == dict(value=None, n_valid=4, n_expected=5)
    assert europe5({c: Decimal(5) for c in ["GB", "DE", "FR", "IT", "ES"]})["value"] == 5


def test_T10_rank_direction():
    assert compare({"A": 20}, {"A": 10}, True, True)[0]["rank_change"] == 10


def test_T11_calendar_rolling():
    today = date(2026, 9, 6)
    points = {today - timedelta(days=i): Decimal(10) for i in [0, 1, 4, 6]}
    assert rolling(points, today, 7) == dict(value=None, n_valid=4, n_expected=7)
    points[today - timedelta(days=3)] = Decimal(20)
    assert rolling(points, today, 7)["value"] == 12
    assert rolling(points, today, 30)["value"] is None


def test_T12_review_warning():
    assert review_delta(100, 90, "listing", "listing")["quality_flag"] == "REVIEW_COUNT_DECREASED"
    assert review_delta(100, 120, "listing", "parent")["value"] is None


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("rank", 101),
        ("rank", 1.5),
        ("rank", "1"),
        ("asin", "fake"),
        ("marketplace", "UK"),
        ("category_ref", "DE_beauty"),
        ("title", "<script>alert(1)</script>"),
        ("source_url", "http://127.0.0.1/x"),
        ("source_url", "https://data.example.invalid@127.0.0.1/x"),
        ("schema_version", "2.0"),
        ("observation_date", "2026-02-30"),
    ],
)
def test_contract_rejects(field, value):
    data = rows()
    data[0][field] = value
    assert not validate(data).valid


def test_timestamp_date_precision_and_timezone():
    data = rows()
    data[0]["observed_at"] = "2026-08-31T16:00:00Z"
    data[0]["time_precision"] = "timestamp"
    assert validate(data[:1]).valid
    data[0]["observation_date"] = "2026-08-31"
    assert not validate(data[:1]).valid
    data[0]["time_precision"] = "date"
    assert not validate(data[:1]).valid


def test_unknown_fields_and_conflicting_metadata():
    data = rows()
    data[0]["unannounced"] = 1
    assert not validate(data).valid
    data = rows()
    data[1]["observation_date"] = "2026-09-02"
    assert not validate(data).valid


def test_csv_and_json_same_contract():
    a = validate_file(
        Path("fixtures/synthetic/amazon-complete.csv").read_bytes(), "fixture.csv", {"data.example.invalid"}
    )
    assert a.valid and a.rows == validate(rows()).rows


def test_size_row_and_path_limits():
    assert not validate_file(b"a" * 5242881, "a.csv", set()).valid
    assert not validate_file(b"[]", "../file.json", set()).valid
    assert not validate(rows() * 101).valid


def test_T27_formula_export_safe():
    assert safe_cell(" =cmd()") == "' =cmd()" and safe_cell(-5) == -5
    assert "'=evil" in error_csv([{"row": 1, "code": "=evil"}])


def test_T25_offline_adapters_no_calls():
    with patch("urllib.request.urlopen", side_effect=AssertionError("Unexpected outbound call")):
        assert collect("amazon_primary").status == "skipped_not_configured"
        assert collect("dart_primary").observations == ()


def test_worker_revalidates_and_blocks_bad_data():
    class API:
        calls = []

        def call(self, name, params):
            self.calls.append((name, params))
            if name == "claim_import_job_v1":
                return {
                    "id": "job",
                    "kind": "commit_import",
                    "batch_id": "batch",
                    "filename": "bad.json",
                    "content": "[]",
                    "allowed_hosts": [],
                }

    api = API()
    assert process_one(api) == "failed"
    assert [c[0] for c in api.calls] == ["claim_import_job_v1", "fail_import_job_v1"]
