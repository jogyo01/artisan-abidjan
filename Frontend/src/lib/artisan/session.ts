import type { createClient } from "@/lib/supabase/client";

type BrowserSupabaseClient = ReturnType<typeof createClient>;

export type ArtisanSession =
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "needs_onboarding"; userId: string }
  | {
      kind: "ok";
      userId: string;
      artisan: {
        id: string;
        business_name: string;
        description: string | null;
        address: string | null;
        city: string | null;
        phone: string | null;
        is_verified: boolean;
        is_available: boolean;
        latitude: number | null;
        longitude: number | null;
      };
    };

function parseCoord(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function loadArtisanSession(
  supabase: BrowserSupabaseClient,
): Promise<ArtisanSession> {
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

  if (profile?.role !== "ARTISAN") {
    return { kind: "forbidden" };
  }

  const { data: artisan } = await supabase
    .from("artisans")
    .select(
      "id, business_name, description, address, city, phone, is_verified, is_available, latitude, longitude",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (!artisan) {
    return { kind: "needs_onboarding", userId: user.id };
  }

  const artisanId = typeof artisan.id === "string" ? artisan.id : String(artisan.id ?? "");
  if (!artisanId) {
    return { kind: "needs_onboarding", userId: user.id };
  }

  return {
    kind: "ok",
    userId: user.id,
    artisan: {
      id: artisanId,
      business_name: typeof artisan.business_name === "string" ? artisan.business_name : "",
      description: typeof artisan.description === "string" ? artisan.description : null,
      address: typeof artisan.address === "string" ? artisan.address : null,
      city: typeof artisan.city === "string" ? artisan.city : null,
      phone: typeof artisan.phone === "string" ? artisan.phone : null,
      is_verified: artisan.is_verified === true,
      is_available: artisan.is_available === true,
      latitude: parseCoord(artisan.latitude),
      longitude: parseCoord(artisan.longitude),
    },
  };
}
