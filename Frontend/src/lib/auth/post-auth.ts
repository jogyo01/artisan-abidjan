import type { createClient } from "@/lib/supabase/client";

type BrowserSupabaseClient = ReturnType<typeof createClient>;

export type PublicAccountType = "CLIENT" | "ARTISAN";

export function toPublicAccountType(value: unknown): PublicAccountType {
  return value === "ARTISAN" ? "ARTISAN" : "CLIENT";
}

export function parseCategoryId(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

export function parseCategoryIds(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.flatMap((item) => {
    const parsed = parseCategoryId(item);
    return parsed === null ? [] : [parsed];
  }))];
}

export function mapSignupCategory(row: unknown): { id: number; name: string } | null {
  if (!row || typeof row !== "object") {
    return null;
  }

  const record = row as Record<string, unknown>;
  const id = parseCategoryId(record.id);
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (id === null || name === "") {
    return null;
  }

  return { id, name };
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

export async function completeArtisanSignup(
  supabase: BrowserSupabaseClient,
  categoryIds: Array<string | number>,
): Promise<{ ok: boolean; errorMessage?: string }> {
  const uniqueIds = parseCategoryIds(categoryIds);
  if (uniqueIds.length === 0) {
    return {
      ok: false,
      errorMessage: "Veuillez sélectionner au moins un métier.",
    };
  }

  const { error } = await supabase.rpc("complete_artisan_signup", {
    p_category_ids: uniqueIds,
  });

  if (error) {
    return {
      ok: false,
      errorMessage: "Le compte a été créé, mais les métiers n'ont pas pu être enregistrés. Réessayez depuis votre espace artisan.",
    };
  }

  return { ok: true };
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

  const requestedAccountType = toPublicAccountType(
    user.user_metadata?.role ?? user.user_metadata?.account_type,
  );

  if (requestedAccountType === "ARTISAN") {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "ARTISAN") {
      await assignArtisanRoleIfAllowed(supabase, user.id);
    }

    const categoryIds = parseCategoryIds(user.user_metadata?.category_ids);
    if (categoryIds.length > 0) {
      await completeArtisanSignup(supabase, categoryIds);
    }

    const { data: artisan } = await supabase
      .from("artisans")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!artisan) {
      return "/artisan/onboarding";
    }

    return "/artisan";
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

    return artisan ? "/artisan" : "/artisan/onboarding";
  }

  if (profile?.role === "ADMIN") {
    return "/admin";
  }

  return "/";
}
