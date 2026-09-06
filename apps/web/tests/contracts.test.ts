import { describe, it, expect } from "vitest";
import fixture from "../../../fixtures/synthetic/amazon-complete.json";
import { parseFile, allowedURL, safeCell, kstDate } from "../src/contracts";
describe("shared contract browser validation", () => {
  it("complete JSON validates without fabricated timestamps", () => {
    const r = parseFile(JSON.stringify(fixture), "test.json", [
      "data.example.invalid",
    ]);
    expect(r.errors).toEqual([]);
    expect(r.rows).toHaveLength(100);
    expect(r.rows[0].observed_at).toBeNull();
  });
  it("partial remains partial", () =>
    expect(
      parseFile(JSON.stringify(fixture.slice(0, 50)), "test.json", [
        "data.example.invalid",
      ]).warnings,
    ).toHaveLength(1));
  it("rejects duplicate and metadata conflict", () => {
    const data = structuredClone(fixture);
    data[1].rank = 1;
    data[2].observation_date = "2026-09-02";
    expect(
      parseFile(JSON.stringify(data), "test.json", [
        "data.example.invalid",
      ]).errors.map((x) => x.code),
    ).toEqual(["DUPLICATE_RANK_OR_ASIN", "SNAPSHOT_METADATA_CONFLICT"]);
  });
  it("blocks unknown field and unsafe URL", () => {
    const data = [
      { ...fixture[0], injected: true, source_url: "http://169.254.169.254/" },
    ];
    expect(
      parseFile(JSON.stringify(data), "test.json", []).errors.length,
    ).toBeGreaterThan(0);
    expect(
      allowedURL("https://data.example.invalid@127.0.0.1/", [
        "data.example.invalid",
      ]),
    ).toBe(false);
  });
  it("neutralizes spreadsheet formulas and preserves numbers", () => {
    expect(safeCell(" =cmd()")).toBe("' =cmd()");
    expect(safeCell(-10)).toBe(-10);
  });
  it("uses KST calendar dates", () =>
    expect(kstDate(new Date("2026-08-31T16:00:00Z"))).toBe("2026-09-01"));
});
