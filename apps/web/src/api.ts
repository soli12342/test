import { createClient } from "@supabase/supabase-js";
import type { Role } from "./types";
const url = import.meta.env.VITE_SUPABASE_URL ?? "";
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
function publicKey(k: string) {
  if (k.startsWith("sb_publishable_")) return true;
  try {
    return JSON.parse(atob(k.split(".")[1])).role === "anon";
  } catch {
    return false;
  }
}
export const configured = Boolean(
  url && /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) && publicKey(key),
);
export const client = configured
  ? createClient(url, key, {
      auth: {
        flowType: "pkce",
        storage: sessionStorage,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;
const known = [
  "AUTH_REQUIRED",
  "NOT_INVITED",
  "FORBIDDEN",
  "SOURCE_NOT_CONFIGURED",
  "SOURCE_BLOCKED",
  "VALIDATION_FAILED",
  "URL_NOT_ALLOWED",
  "CATEGORY_VERSION_REQUIRED",
];
export async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (!client) throw Error("SOURCE_NOT_CONFIGURED");
  const { data, error } = await client.rpc(name, args);
  if (error)
    throw Error(
      known.find((c) => error.message.includes(c)) ??
        "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    );
  return data as T;
}
export async function table<T>(
  name: string,
  columns = "*",
  filters: Record<string, string> = {},
  offset = 0,
): Promise<T[]> {
  if (!client) return [];
  let query = client.from(name).select(columns);
  for (const [k, v] of Object.entries(filters)) query = query.eq(k, v);
  const { data, error } = await query.order("id").range(offset, offset + 99);
  if (error) throw Error("자료를 불러오지 못했습니다.");
  return data as unknown as T[];
}
export async function membership(): Promise<Role> {
  const r = await rpc<{ role: Role }>("redeem_invite_v1");
  return r.role;
}
export async function login() {
  if (!client) throw Error("SOURCE_NOT_CONFIGURED");
  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin + "/login" },
  });
  if (error) throw Error("로그인을 시작하지 못했습니다.");
}
