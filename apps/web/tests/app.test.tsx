import { afterEach, beforeEach, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { App } from "../src/App";
vi.mock("../src/Chart", () => ({ Chart: () => <div aria-label="chart" /> }));
afterEach(cleanup);
beforeEach(() => window.history.replaceState({}, "", "/apr"));
it("unconnected overview has all 12 paths and no fabricated data", () => {
  render(<App />);
  expect(screen.getByRole("heading", { name: "오늘의 리서치" })).toBeTruthy();
  const links = screen
    .getAllByRole("link")
    .filter((e) => e.getAttribute("href")?.startsWith("/apr/amazon?"));
  expect(links).toHaveLength(12);
  expect(screen.queryByText("LIVE")).toBeNull();
  expect(screen.getAllByText("미수집")).toHaveLength(12);
});
it("all 6 country and both category controls change route, period changes", () => {
  window.history.replaceState({}, "", "/apr/amazon");
  render(<App />);
  for (const market of ["US", "GB", "DE", "FR", "IT", "ES"]) {
    const tab = screen
      .getAllByRole("tab")
      .find((t) => t.textContent?.startsWith(market))!;
    fireEvent.click(tab);
    expect(window.location.search).toContain("market=" + market);
    fireEvent.click(screen.getByRole("tab", { name: "Skin Care Top100" }));
    expect(window.location.search).toContain("category=skincare");
    fireEvent.click(screen.getByRole("tab", { name: "Beauty Top100" }));
    expect(window.location.search).toContain("category=beauty");
  }
  fireEvent.click(screen.getByRole("button", { name: "90D" }));
  expect(screen.getByText(/유효 관측 0\/90일/)).toBeTruthy();
});
it("Google login remains disabled without configuration", () => {
  window.history.replaceState({}, "", "/login");
  render(<App />);
  expect(
    (
      screen.getByRole("button", {
        name: "Google로 로그인",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
});
it("direct admin route denies unconfigured visitor", () => {
  window.history.replaceState({}, "", "/admin");
  render(<App />);
  expect(screen.getByText(/FORBIDDEN/)).toBeTruthy();
  expect(screen.queryByText("서버 검증 요청")).toBeNull();
});
