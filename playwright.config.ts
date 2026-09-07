import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "apps/web/tests/e2e",
  use: { baseURL: "http://127.0.0.1:4173" },
  projects: [
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
    { name: "desktop-1920", use: { viewport: { width: 1920, height: 1080 } } },
  ],
  webServer: {
    command: "npm run dev -- --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
  },
});
