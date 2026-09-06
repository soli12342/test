import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { App } from "../src/App";
const mocks = vi.hoisted(() => ({
  role: "admin",
  rpc: vi.fn(),
  table: vi.fn(),
}));
vi.mock("../src/api", () => ({
  configured: true,
  client: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "test" } } } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
    },
  },
  membership: async () => mocks.role,
  rpc: mocks.rpc,
  table: mocks.table,
  login: vi.fn(),
}));
vi.mock("../src/Chart", () => ({ Chart: () => <div aria-label="chart" /> }));
afterEach(cleanup);
beforeEach(() => {
  mocks.role = "admin";
  mocks.rpc.mockReset();
  mocks.table.mockReset();
});
it("Admin review queues commit; Viewer cannot reach it", async () => {
  window.history.replaceState({}, "", "/admin");
  mocks.table.mockImplementation(async (name: string) =>
    name === "sources"
      ? [
          {
            id: "source",
            ref: "amazon_primary",
            display_name: "SYNTHETIC ONLY",
            kind: "amazon_rank",
            enabled: true,
            allowed_hosts: ["data.example.invalid"],
          },
        ]
      : name === "import_batches"
        ? [
            {
              id: "batch",
              filename: "synthetic.json",
              state: "needs_review",
              errors: [],
              warnings: [],
              summary: [{ actual_count: 100, completeness: "complete" }],
            },
          ]
        : [],
  );
  mocks.rpc.mockResolvedValue([]);
  render(<App />);
  const approve = await screen.findByRole("button", {
    name: "검수 완료 · 적재 요청",
  });
  fireEvent.click(approve);
  await waitFor(() =>
    expect(mocks.rpc).toHaveBeenCalledWith("approve_import_v1", {
      batch: "batch",
    }),
  );
  cleanup();
  mocks.role = "viewer";
  render(<App />);
  expect(await screen.findByText(/FORBIDDEN/)).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "검수 완료 · 적재 요청" }),
  ).toBeNull();
});
it("stale/partial data and evidence panel are explicit", async () => {
  window.history.replaceState({}, "", "/apr/amazon");
  const point = {
    marketplace: "US",
    day: "2026-09-01",
    snapshot_id: "test-snapshot",
    category_id: "cat",
    status: "partial",
    apr_listing_count: null,
    apr_top10_count: null,
    apr_best_rank: null,
    exposure_index: null,
    actual_count: 50,
    avg_7d: null,
    avg_30d: null,
    n_valid_7d: 0,
    n_valid_30d: 0,
  };
  mocks.rpc.mockImplementation(async (name: string) =>
    name === "get_amazon_series_v1"
      ? { data: [point], europe5: [], meta: {} }
      : {
          snapshot: {
            id: "test-snapshot",
            kst_date: "2026-09-01",
            completeness: "partial",
            actual_count: 50,
            observed_at: null,
            time_precision: "date",
            content_hash: "test-hash",
            revision: 1,
            first_seen_at: "2026-09-06",
          },
          entries: [],
          changes: [],
          comparison_label: "비교 자료 없음",
          evidence: {
            source: { display_name: "SYNTHETIC ONLY", mode: "test" },
            category: { path: "SYNTHETIC CATEGORY", version: 1 },
            formula: "100 × Σ(101 − APR rank) / 5050",
            metric_version: "amazon_exposure_v1",
            selection_history: [],
            revisions: [],
          },
        },
  );
  render(<App />);
  expect(await screen.findByText(/50\/100행/)).toBeTruthy();
  expect(screen.getByText(/현재 값이 아닙니다/)).toBeTruthy();
  const card = screen.getByRole("button", { name: /APR 등장 ASIN 수/ });
  await waitFor(() => expect((card as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(card);
  expect(screen.getByRole("dialog", { name: "출처와 계산 근거" })).toBeTruthy();
  expect(
    screen.getByText("시각 미상 · 날짜 정밀도", { exact: false }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "닫기" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});
