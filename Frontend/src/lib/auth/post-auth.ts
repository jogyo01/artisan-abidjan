import type { createClient } from "@/lib/supabase/client";

type BrowserSupabaseClient = ReturnType<typeof createClient>;

export type PublicAccountType = "CLIENT" | "ARTISAN";

export function toPublicAccountType(value: unknown): PublicAccountType {
  return value === "ARTISAN" ? "ARTISAN" : "CLIENT";
}

export async function assignArtisanRoleIfAllowed(
  supabase: BrowserSupabaseClient,
  userId: string,
): Promise<{ ok: boolean; errorMessage?: string }> {
  const failure = {
    ok: false as const,
    errorMessage: "Impossible d'activer le compte artisan. Veuillez réessayer.",
  };

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data, error } = await supabase
      .from("profiles")
      .update({ role: "ARTISAN" })
      .eq("id", userId)
      .in("role", ["CLIENT", "ARTISAN"])
      .select("role")
      .maybeSingle();

    if (!error && data?.role === "ARTISAN") {
      return { ok: true };
    }

    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });
  }

  return failure;
}

export async function resolvePostAuthPath(
  supabase: BrowserSupabaseClient,
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return "/auth";
  }

  const requestedAccountType = toPublicAccountType(user.user_metadata?.account_type);

  if (requestedAccountType === "ARTISAN") {
    await assignArtisanRoleIfAllowed(supabase, user.id);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "ARTISAN") {
    const { data: artisan } = await supabase
      .from("artisans")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!artisan) {
      return "/artisan/onboarding";
    }
  }

  return "/";
}
