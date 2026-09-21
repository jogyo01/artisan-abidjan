"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type AdminStats = {
  clients: number;
  artisans: number;
  artisansVerified: number;
  artisansPending: number;
  bookings: number;
  bookingsPending: number;
  bookingsAccepted: number;
  bookingsInProgress: number;
  bookingsCompleted: number;
  bookingsRefused: number;
};

type AdminArtisan = {
  id: string;
  business_name: string;
  profile_name: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  description: string | null;
  is_available: boolean;
  is_verified: boolean;
  categories: string[];
};

const emptyStats: AdminStats = {
  clients: 0,
  artisans: 0,
  artisansVerified: 0,
  artisansPending: 0,
  bookings: 0,
  bookingsPending: 0,
  bookingsAccepted: 0,
  bookingsInProgress: 0,
  bookingsCompleted: 0,
  bookingsRefused: 0,
};

async function countRows(
  query: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number | null> {
  const { count, error } = await query;
  if (error) {
    return null;
  }
  return count ?? 0;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [stats, setStats] = useState<AdminStats>(emptyStats);
  const [pendingArtisans, setPendingArtisans] = useState<AdminArtisan[]>([]);
  const [verifiedArtisans, setVerifiedArtisans] = useState<AdminArtisan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadDashboard = useCallback(async () => {
    const [
      clients,
      artisans,
      artisansVerified,
      artisansPending,
      bookings,
      bookingsPending,
      bookingsAccepted,
      bookingsInProgress,
      bookingsCompleted,
      bookingsRefused,
      artisansResult,
      profilesResult,
      linksResult,
      categoriesResult,
    ] = await Promise.all([
      countRows(
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "CLIENT"),
      ),
      countRows(supabase.from("artisans").select("id", { count: "exact", head: true })),
      countRows(
        supabase
          .from("artisans")
          .select("id", { count: "exact", head: true })
          .eq("is_verified", true),
      ),
      countRows(
        supabase
          .from("artisans")
          .select("id", { count: "exact", head: true })
          .eq("is_verified", false),
      ),
      countRows(supabase.from("bookings").select("id", { count: "exact", head: true })),
      countRows(
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "PENDING"),
      ),
      countRows(
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("status", "ACCEPTED"),
      ),
      countRows(
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("status", "IN_PROGRESS"),
      ),
      countRows(
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("status", "COMPLETED"),
      ),
      countRows(
        supabase.from("bookings").select("id", { count: "exact", head: true }).eq("status", "REFUSED"),
      ),
      supabase
        .from("artisans")
        .select(
          "id, business_name, description, address, city, phone, is_verified, is_available",
        )
        .order("business_name"),
      supabase.from("profiles").select("id, full_name, phone").eq("role", "ARTISAN"),
      supabase.from("artisan_categories").select("artisan_id, category_id"),
      supabase.from("categories").select("id, name"),
    ]);

    if (
      clients === null ||
      artisans === null ||
      artisansVerified === null ||
      artisansPending === null ||
      bookings === null ||
      bookingsPending === null ||
      bookingsAccepted === null ||
      bookingsInProgress === null ||
      bookingsCompleted === null ||
      bookingsRefused === null ||
      artisansResult.error
    ) {
      return { error: true as const };
    }

    const categoryNames = new Map<string, string>();
    for (const row of categoriesResult.data ?? []) {
      if (typeof row.id === "string" && typeof row.name === "string") {
        categoryNames.set(row.id, row.name);
      }
    }

    const categoriesByArtisan = new Map<string, string[]>();
    for (const row of linksResult.data ?? []) {
      if (typeof row.artisan_id !== "string" || typeof row.category_id !== "string") {
        continue;
      }
      const name = categoryNames.get(row.category_id);
      if (!name) {
        continue;
      }
      const current = categoriesByArtisan.get(row.artisan_id) ?? [];
      current.push(name);
      categoriesByArtisan.set(row.artisan_id, current);
    }

    const profileById = new Map<string, { full_name: string | null; phone: string | null }>();
    for (const row of profilesResult.data ?? []) {
      if (typeof row.id !== "string") {
        continue;
      }
      profileById.set(row.id, {
        full_name: typeof row.full_name === "string" ? row.full_name : null,
        phone: typeof row.phone === "string" ? row.phone : null,
      });
    }

    const mapped: AdminArtisan[] = (artisansResult.data ?? []).flatMap((row) => {
      if (typeof row.id !== "string" || typeof row.business_name !== "string") {
        return [];
      }
      const profile = profileById.get(row.id);
      return [
        {
          id: row.id,
          business_name: row.business_name,
          profile_name: profile?.full_name ?? null,
          phone:
            typeof row.phone === "string" && row.phone.trim() !== ""
              ? row.phone
              : (profile?.phone ?? null),
          city: typeof row.city === "string" ? row.city : null,
          address: typeof row.address === "string" ? row.address : null,
          description: typeof row.description === "string" ? row.description : null,
          is_available: row.is_available === true,
          is_verified: row.is_verified === true,
          categories: categoriesByArtisan.get(row.id) ?? [],
        } satisfies AdminArtisan,
      ];
    });

    return {
      error: false as const,
      stats: {
        clients,
        artisans,
        artisansVerified,
        artisansPending,
        bookings,
        bookingsPending,
        bookingsAccepted,
        bookingsInProgress,
        bookingsCompleted,
        bookingsRefused,
      },
      pending: mapped.filter((artisan) => !artisan.is_verified),
      verified: mapped.filter((artisan) => artisan.is_verified),
    };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (cancelled) {
        return;
      }

      if (userError || !user) {
        router.replace("/auth");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (profile?.role !== "ADMIN") {
        router.replace("/");
        return;
      }

      const result = await loadDashboard();
      if (cancelled) {
        return;
      }

      if (result.error) {
        setErrorMessage("Impossible de charger le tableau de bord administrateur.");
      } else {
        setStats(result.stats);
        setPendingArtisans(result.pending);
        setVerifiedArtisans(result.verified);
      }

      setIsLoading(false);
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [loadDashboard, router, supabase]);

  async function verifyArtisan(artisanId: string) {
    setErrorMessage("");
    setSuccessMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/auth");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "ADMIN") {
      router.replace("/");
      return;
    }

    setVerifyingId(artisanId);

    try {
      const { data, error } = await supabase
        .from("artisans")
        .update({ is_verified: true })
        .eq("id", artisanId)
        .select("id, is_verified")
        .maybeSingle();

      if (error || !data || data.is_verified !== true) {
        setErrorMessage("Impossible de vérifier cet artisan.");
        return;
      }

      const result = await loadDashboard();
      if (result.error) {
        setErrorMessage("L'artisan a été vérifié, mais le tableau de bord n'a pas pu être rechargé.");
      } else {
        setStats(result.stats);
        setPendingArtisans(result.pending);
        setVerifiedArtisans(result.verified);
        setSuccessMessage("Artisan vérifié.");
      }
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setVerifyingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Chargement de l&apos;espace admin…</p>
      </div>
    );
  }

  const statCards: { label: string; value: number }[] = [
    { label: "Clients", value: stats.clients },
    { label: "Artisans", value: stats.artisans },
    { label: "Artisans vérifiés", value: stats.artisansVerified },
    { label: "En attente de vérification", value: stats.artisansPending },
    { label: "Réservations", value: stats.bookings },
    { label: "En attente", value: stats.bookingsPending },
    { label: "Acceptées", value: stats.bookingsAccepted },
    { label: "En cours", value: stats.bookingsInProgress },
    { label: "Terminées", value: stats.bookingsCompleted },
    { label: "Refusées", value: stats.bookingsRefused },
  ];

  return (
    <div className="flex min-h-full flex-1 justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <main className="w-full max-w-5xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Administration
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Tableau de bord et vérification des artisans.
        </p>

        {errorMessage ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            {successMessage}
          </p>
        ) : null}

        <section className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {statCards.map((card) => (
            <article
              key={card.label}
              className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <p className="text-sm text-zinc-500 dark:text-zinc-400">{card.label}</p>
              <p className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-zinc-50">
                {card.value}
              </p>
            </article>
          ))}
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Artisans en attente de vérification
          </h2>
          {pendingArtisans.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              Aucun artisan à vérifier.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-4">
              {pendingArtisans.map((artisan) => (
                <li
                  key={artisan.id}
                  className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
                        {artisan.business_name}
                      </h3>
                      {artisan.profile_name ? (
                        <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                          {artisan.profile_name}
                        </p>
                      ) : null}
                      <dl className="mt-3 space-y-1 text-sm text-zinc-700 dark:text-zinc-300">
                        <div>
                          <dt className="inline font-medium text-zinc-500 dark:text-zinc-400">
                            Téléphone :{" "}
                          </dt>
                          <dd className="inline">{artisan.phone || "Non renseigné"}</dd>
                        </div>
                        <div>
                          <dt className="inline font-medium text-zinc-500 dark:text-zinc-400">
                            Ville :{" "}
                          </dt>
                          <dd className="inline">{artisan.city || "Non renseignée"}</dd>
                        </div>
                        <div>
                          <dt className="inline font-medium text-zinc-500 dark:text-zinc-400">
                            Adresse :{" "}
                          </dt>
                          <dd className="inline">{artisan.address || "Non renseignée"}</dd>
                        </div>
                        <div>
                          <dt className="inline font-medium text-zinc-500 dark:text-zinc-400">
                            Disponibilité :{" "}
                          </dt>
                          <dd className="inline">
                            {artisan.is_available ? "Disponible" : "Indisponible"}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline font-medium text-zinc-500 dark:text-zinc-400">
                            Métiers :{" "}
                          </dt>
                          <dd className="inline">
                            {artisan.categories.length > 0
                              ? artisan.categories.join(", ")
                              : "Non renseigné"}
                          </dd>
                        </div>
                      </dl>
                      {artisan.description ? (
                        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                          {artisan.description}
                        </p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      disabled={verifyingId === artisan.id}
                      onClick={() => {
                        void verifyArtisan(artisan.id);
                      }}
                      className="shrink-0 rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                    >
                      {verifyingId === artisan.id ? "Vérification…" : "Vérifier"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
            Artisans vérifiés
          </h2>
          {verifiedArtisans.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              Aucun artisan vérifié pour le moment.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {verifiedArtisans.map((artisan) => (
                <li
                  key={artisan.id}
                  className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <h3 className="font-semibold text-zinc-950 dark:text-zinc-50">
                    {artisan.business_name}
                  </h3>
                  <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                    {artisan.city || "Ville non renseignée"} ·{" "}
                    {artisan.is_available ? "Disponible" : "Indisponible"}
                  </p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    {artisan.categories.length > 0
                      ? artisan.categories.join(", ")
                      : "Métier non renseigné"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
