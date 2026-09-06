import Ajv from "ajv";
import addFormats from "ajv-formats";
import Papa from "papaparse";
import schema from "../../../packages/contracts/schemas/amazon-row.v1.json";
import type { Row } from "./types";
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);
const validate = ajv.compile<Row>(schema);
export function allowedURL(input: string, hosts?: string[]) {
  try {
    const u = new URL(input);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443") &&
      (!hosts || hosts.includes(u.hostname)) &&
      !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(u.hostname)
    );
  } catch {
    return false;
  }
}
export function parseFile(content: string, filename: string, hosts: string[]) {
  const errors: { row: number; code: string }[] = [];
  const rows: Row[] = [];
  const warnings: string[] = [];
  if (
    new TextEncoder().encode(content).length > 5 * 1024 * 1024 ||
    !/^[^/\\]+\.(csv|json)$/i.test(filename) ||
    content.includes("\0")
  )
    return { rows, errors: [{ row: 0, code: "FILE_LIMIT_OR_TYPE" }], warnings };
  let data: unknown[] = [];
  try {
    if (filename.endsWith(".json")) {
      const parsed: unknown = JSON.parse(content);
      if (!Array.isArray(parsed)) throw Error();
      data = parsed;
    } else {
      const parsed = Papa.parse<Record<string, string>>(content, {
        header: true,
        skipEmptyLines: true,
      });
      if (
        parsed.errors.length ||
        parsed.meta.fields?.length !== schema.required.length ||
        schema.required.some((k) => !parsed.meta.fields?.includes(k))
      )
        throw Error();
      data = parsed.data.map((r) => ({
        ...r,
        rank: /^[0-9]+$/.test(r.rank) ? Number(r.rank) : r.rank,
        observed_at: r.observed_at || null,
      }));
    }
  } catch {
    return {
      rows,
      errors: [{ row: 0, code: "PARSE_OR_HEADERS_FAILED" }],
      warnings,
    };
  }
  if (!data.length || data.length > 10000)
    return { rows, errors: [{ row: 0, code: "ROW_LIMIT" }], warnings };
  data.forEach((r, i) => {
    if (!validate(r)) {
      errors.push({ row: i + 2, code: "SCHEMA_INVALID" });
      return;
    }
    if (!r.category_ref.startsWith(r.marketplace + "_"))
      errors.push({ row: i + 2, code: "CATEGORY_MARKET_MISMATCH" });
    if (!allowedURL(r.source_url, hosts))
      errors.push({ row: i + 2, code: "URL_NOT_ALLOWED" });
    if (/[<>]/.test(r.title + r.brand))
      errors.push({ row: i + 2, code: "HTML_REJECTED" });
    if (
      r.observed_at &&
      kstDate(new Date(r.observed_at)) !== r.observation_date
    )
      errors.push({ row: i + 2, code: "KST_DATE_MISMATCH" });
    rows.push(r);
  });
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = [r.source_ref, r.category_ref, r.snapshot_ref].join("|");
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const group of groups.values()) {
    if (
      new Set(group.map((r) => r.rank)).size !== group.length ||
      new Set(group.map((r) => r.asin)).size !== group.length
    )
      errors.push({ row: 0, code: "DUPLICATE_RANK_OR_ASIN" });
    if (
      new Set(
        group.map((r) =>
          [r.observation_date, r.observed_at, r.time_precision].join("|"),
        ),
      ).size !== 1
    )
      errors.push({ row: 0, code: "SNAPSHOT_METADATA_CONFLICT" });
    if (group.length !== 100)
      warnings.push("PARTIAL_SNAPSHOT: Top100 지표 N/A, 진입·이탈 계산 제외");
  }
  return { rows, errors, warnings };
}
export function kstDate(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function safeCell(value: string | number) {
  return typeof value === "number"
    ? value
    : /^[\s]*[=+@-]/.test(value)
      ? "'" + value
      : value;
}
export function downloadErrors(errors: { row?: number; code: string }[]) {
  const csv = Papa.unparse(
    errors.map((e) => ({ row: e.row ?? 0, code: safeCell(e.code) })),
  );
  const url = URL.createObjectURL(
    new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "validation-errors.csv";
  a.click();
  URL.revokeObjectURL(url);
}
