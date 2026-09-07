import { afterEach, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { App } from "../src/App";
vi.mock("../src/api", () => ({
  configured: true,
  googleAuthEnabled: false,
  client: { auth: {
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  } },
  login: vi.fn(), membership: vi.fn(), rpc: vi.fn(), table: vi.fn(),
}));
afterEach(cleanup);
it("connected database does not imply Google login readiness or allow access", async () => {
  window.history.replaceState({}, "", "/admin");
  render(<App />);
  expect(await screen.findByText(/데이터베이스 연결 완료/)).toBeTruthy();
  expect((screen.getByRole("button", { name: "Google로 로그인" }) as HTMLButtonElement).disabled).toBe(true);
  expect(window.location.pathname).toBe("/login");
  expect(screen.queryByText("서버 검증 요청")).toBeNull();
});
