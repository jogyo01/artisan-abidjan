import type { createClient } from "@/lib/supabase/client";

type BrowserSupabaseClient = ReturnType<typeof createClient>;

export type AdminSession =
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "ok"; userId: string };

export async function requireAdminSession(
  supabase: BrowserSupabaseClient,
): Promise<AdminSession> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { kind: "unauthenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "ADMIN") {
    return { kind: "forbidden" };
  }

  return { kind: "ok", userId: user.id };
}
