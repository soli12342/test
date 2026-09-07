import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: ["apps/web/tests/*.test.{ts,tsx}"], environment: "jsdom",
    env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "", VITE_GOOGLE_AUTH_ENABLED: "false" },
  },
});
