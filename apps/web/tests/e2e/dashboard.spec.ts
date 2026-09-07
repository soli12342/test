import { test, expect } from "@playwright/test";
// Local/CI browser harness. Real OAuth E2E needs a separately approved test Supabase project.
test("unconnected login, all twelve series, periods, and Admin denial", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(
    page.getByRole("button", { name: "Google로 로그인" }),
  ).toBeDisabled();
  await page.getByRole("link", { name: "미연결 화면 보기 →" }).click();
  await expect(page.locator('a[href^="/apr/amazon?"]')).toHaveCount(12);
  await page.getByRole("link", { name: "Amazon 02" }).click();
  for (const code of ["US", "GB", "DE", "FR", "IT", "ES"]) {
    await page.getByRole("tab", { name: new RegExp("^" + code) }).click();
    for (const cat of ["Beauty Top100", "Skin Care Top100"]) {
      await page.getByRole("tab", { name: cat, exact: true }).click();
      await expect(
        page.getByRole("tab", { name: cat, exact: true }),
      ).toHaveAttribute("aria-selected", "true");
    }
  }
  await page.getByRole("button", { name: "90D", exact: true }).click();
  await expect(page.getByText(/유효 관측 0\/90일/)).toBeVisible();
  await page.goto("/admin");
  await expect(page.getByText(/FORBIDDEN/)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
