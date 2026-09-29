import { PublicLanding } from "@/components/public/PublicLanding";
import { AuthenticatedHome } from "@/components/home/AuthenticatedHome";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type AccountRole = "CLIENT" | "ARTISAN" | "ADMIN";

function isAccountRole(value: string): value is AccountRole {
  return value === "CLIENT" || value === "ARTISAN" || value === "ADMIN";
}

export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <PublicLanding />;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const accountRole =
    typeof profile?.role === "string" && isAccountRole(profile.role) ? profile.role : "CLIENT";

  return <AuthenticatedHome accountRole={accountRole} />;
}
