"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type VerificationFilter = "all" | "pending" | "verified";

type AdminArtisanListItem = {
  id: string;
  business_name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  description: string | null;
  is_verified: boolean;
  is_available: boolean;
  categories: string[];
  servicesCount: number;
  bookingsCount: number;
  reviewsCount: number;
  averageRating: number | null;
};

export default function AdminArtisansPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [artisans, setArtisans] = useState<AdminArtisanListItem[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<VerificationFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadArtisans = useCallback(async () => {
    const [
      artisansResult,
      profilesResult,
      linksResult,
      categoriesResult,
      servicesResult,
      bookingsResult,
      reviewsResult,
    ] = await Promise.all([
      supabase
        .from("artisans")
        .select("id, business_name, description, address, city, phone, is_verified, is_available")
        .order("business_name"),
      supabase.from("profiles").select("id, phone"),
      supabase.from("artisan_categories").select("artisan_id, category_id"),
      supabase.from("categories").select("id, name"),
      supabase.from("services").select("id, artisan_id"),
      supabase.from("bookings").select("id, artisan_id"),
      supabase.from("reviews").select("id, artisan_id, rating"),
    ]);

    if (artisansResult.error) {
      return { artisans: [] as AdminArtisanListItem[], error: true };
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

    const profilePhone = new Map<string, string>();
    for (const row of profilesResult.data ?? []) {
      if (typeof row.id === "string" && typeof row.phone === "string" && row.phone.trim() !== "") {
        profilePhone.set(row.id, row.phone);
      }
    }

    const servicesCount = new Map<string, number>();
    for (const row of servicesResult.data ?? []) {
      if (typeof row.artisan_id !== "string") {
        continue;
      }
      servicesCount.set(row.artisan_id, (servicesCount.get(row.artisan_id) ?? 0) + 1);
    }

    const bookingsCount = new Map<string, number>();
    for (const row of bookingsResult.data ?? []) {
      if (typeof row.artisan_id !== "string") {
        continue;
      }
      bookingsCount.set(row.artisan_id, (bookingsCount.get(row.artisan_id) ?? 0) + 1);
    }

    const ratingsByArtisan = new Map<string, number[]>();
    for (const row of reviewsResult.data ?? []) {
      if (typeof row.artisan_id !== "string" || typeof row.rating !== "number") {
        continue;
      }
      const current = ratingsByArtisan.get(row.artisan_id) ?? [];
      current.push(row.rating);
      ratingsByArtisan.set(row.artisan_id, current);
    }

    return {
      error: false,
      artisans: (artisansResult.data ?? []).flatMap((row) => {
        if (typeof row.id !== "string" || typeof row.business_name !== "string") {
          return [];
        }
        const ratings = ratingsByArtisan.get(row.id) ?? [];
        const average =
          ratings.length > 0 ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length : null;
        const phoneFromArtisan = typeof row.phone === "string" && row.phone.trim() !== "" ? row.phone : null;

        return [
          {
            id: row.id,
            business_name: row.business_name,
            city: typeof row.city === "string" ? row.city : null,
            address: typeof row.address === "string" ? row.address : null,
            phone: phoneFromArtisan ?? profilePhone.get(row.id) ?? null,
            description: typeof row.description === "string" ? row.description : null,
            is_verified: row.is_verified === true,
            is_available: row.is_available === true,
            categories: categoriesByArtisan.get(row.id) ?? [],
            servicesCount: servicesCount.get(row.id) ?? 0,
            bookingsCount: bookingsCount.get(row.id) ?? 0,
            reviewsCount: ratings.length,
            averageRating: average,
          } satisfies AdminArtisanListItem,
        ];
      }),
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

      const result = await loadArtisans();
      if (cancelled) {
        return;
      }

      if (result.error) {
        setErrorMessage("Impossible de charger les artisans.");
        setArtisans([]);
      } else {
        setArtisans(result.artisans);
      }

      setIsLoading(false);
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [loadArtisans, router, supabase]);

  const visibleArtisans = useMemo(() => {
    const query = search.trim().toLowerCase();

    return artisans.filter((artisan) => {
      if (filter === "pending" && artisan.is_verified) {
        return false;
      }
      if (filter === "verified" && !artisan.is_verified) {
        return false;
      }
      if (!query) {
        return true;
      }

      return (
        artisan.business_name.toLowerCase().includes(query) ||
        (artisan.phone ?? "").toLowerCase().includes(query) ||
        (artisan.city ?? "").toLowerCase().includes(query)
      );
    });
  }, [artisans, filter, search]);

  if (isLoading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Chargement des artisans…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <main className="w-full max-w-5xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Gestion des artisans
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Tous les artisans, vérifiés ou en attente.
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Retour au tableau de bord
          </Link>
        </div>

        <div className="mt-6 flex flex-col gap-3 lg:flex-row">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher par nom, téléphone ou ville"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "Tous"],
                ["pending", "En attente"],
                ["verified", "Vérifiés"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-lg px-3 py-2 text-sm font-medium ${
                  filter === value
                    ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                    : "border border-zinc-200 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {errorMessage ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}

        {!errorMessage && visibleArtisans.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
            Aucun artisan ne correspond à votre recherche.
          </p>
        ) : null}

        {visibleArtisans.length > 0 ? (
          <ul className="mt-8 flex flex-col gap-4">
            {visibleArtisans.map((artisan) => (
              <li
                key={artisan.id}
                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                        {artisan.business_name}
                      </h2>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {artisan.is_verified ? "Vérifié" : "En attente"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                      {artisan.city || "Ville non renseignée"} · {artisan.address || "Adresse non renseignée"}
                    </p>
                    <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
                      Téléphone : {artisan.phone || "Non renseigné"} ·{" "}
                      {artisan.is_available ? "Disponible" : "Indisponible"}
                    </p>
                    {artisan.description ? (
                      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                        {artisan.description}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                      Métiers :{" "}
                      {artisan.categories.length > 0 ? artisan.categories.join(", ") : "Non renseigné"}
                    </p>
                    <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                      {artisan.servicesCount} service{artisan.servicesCount > 1 ? "s" : ""} ·{" "}
                      {artisan.bookingsCount} réservation{artisan.bookingsCount > 1 ? "s" : ""} ·{" "}
                      {artisan.reviewsCount} avis
                      {artisan.averageRating !== null
                        ? ` · ${artisan.averageRating.toFixed(1)} / 5`
                        : ""}
                    </p>
                  </div>
                  <Link
                    href={`/admin/artisans/${artisan.id}`}
                    className="inline-flex shrink-0 items-center justify-center rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                  >
                    Voir le détail
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </div>
  );
}
