import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) await scan(p);
    else if (/\.(js|html|json|css)$/.test(p)) {
      const text = await readFile(p, "utf8");
      if (
        /SYNTHETIC TEST PRODUCT|TEST0000\d\d|data\.example\.invalid|sb_secret_|SUPABASE_SECRET_KEY|DART_API_KEY|fixtures\/synthetic/.test(
          text,
        )
      )
        throw Error(
          "Forbidden test data or secret identifier in production bundle: " + p,
        );
    }
  }
}
await scan("dist");
console.log(
  "PASS: no synthetic fixtures, server keys or private payload in production build",
);
