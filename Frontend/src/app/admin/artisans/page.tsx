"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { paginate } from "@/lib/admin/pagination";
import { requireAdminSession } from "@/lib/admin/session";
import { PageSkeleton } from "@/components/motion";
import { createClient } from "@/lib/supabase/client";
import { mapCategoryRow, categoryIdToString } from "@/lib/artisan/categories";

type VerificationFilter = "all" | "pending" | "verified";

type AdminArtisanListItem = {
  id: string;
  business_name: string;
  profile_name: string | null;
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
  const [page, setPage] = useState(1);
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
      supabase.from("profiles").select("id, phone, full_name"),
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
      const category = mapCategoryRow(row);
      if (category) {
        categoryNames.set(category.id, category.name);
      }
    }

    const categoriesByArtisan = new Map<string, string[]>();
    for (const row of linksResult.data ?? []) {
      if (typeof row.artisan_id !== "string") {
        continue;
      }
      const categoryId = categoryIdToString(row.category_id);
      if (!categoryId) {
        continue;
      }
      const name = categoryNames.get(categoryId);
      if (!name) {
        continue;
      }
      const current = categoriesByArtisan.get(row.artisan_id) ?? [];
      current.push(name);
      categoriesByArtisan.set(row.artisan_id, current);
    }

    const profilePhone = new Map<string, string>();
    const profileNames = new Map<string, string>();
    for (const row of profilesResult.data ?? []) {
      if (typeof row.id !== "string") {
        continue;
      }
      if (typeof row.phone === "string" && row.phone.trim() !== "") {
        profilePhone.set(row.id, row.phone);
      }
      if (typeof row.full_name === "string" && row.full_name.trim() !== "") {
        profileNames.set(row.id, row.full_name);
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
            profile_name: profileNames.get(row.id) ?? null,
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
      const session = await requireAdminSession(supabase);
      if (cancelled) {
        return;
      }
      if (session.kind === "unauthenticated") {
        router.replace("/auth");
        return;
      }
      if (session.kind === "forbidden") {
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
        (artisan.profile_name ?? "").toLowerCase().includes(query) ||
        (artisan.phone ?? "").toLowerCase().includes(query) ||
        (artisan.city ?? "").toLowerCase().includes(query)
      );
    });
  }, [artisans, filter, search]);

  const { pageItems, pageCount, page: safePage } = paginate(visibleArtisans, page);

  if (isLoading) {
    return (
      <div className="aa-page aa-page-center">
        <PageSkeleton label="Chargement des artisans…" />
      </div>
    );
  }

  return (
    <div className="aa-page">
      <main className="w-full max-w-5xl aa-card p-6 sm:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--aa-ink)]">
              Gestion des artisans
            </h1>
            <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
              Tous les artisans, vérifiés ou en attente.
            </p>
          </div>
          <Link
            href="/admin"
            className="aa-btn aa-btn-ghost"
          >
            Retour au tableau de bord
          </Link>
        </div>
        <AdminSectionNav current="/admin/artisans" />

        <div className="mt-6 flex flex-col gap-3 lg:flex-row">
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Rechercher par nom, téléphone ou ville"
            className="aa-input"
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
                onClick={() => {
                  setFilter(value);
                  setPage(1);
                }}
                className={`aa-filter ${filter === value ? "aa-filter-active" : ""}`}
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
          <p className="mt-8 text-sm text-[var(--aa-ink-soft)]">
            {artisans.length === 0
              ? "Aucun artisan n'est encore inscrit."
              : "Aucun artisan ne correspond à votre recherche ou au filtre."}
          </p>
        ) : null}

        {visibleArtisans.length > 0 ? (
          <ul className="mt-8 flex flex-col gap-4">
            {pageItems.map((artisan) => (
              <li
                key={artisan.id}
                className="aa-card p-4"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-[var(--aa-ink)]">
                        {artisan.business_name}
                      </h2>
                      <span className="aa-chip bg-[color-mix(in_srgb,var(--aa-ink)_8%,transparent)] text-[var(--aa-ink)]">
                        {artisan.is_verified ? "Vérifié" : "En attente"}
                      </span>
                    </div>
                    {artisan.profile_name ? (
                      <p className="mt-1 text-sm text-[var(--aa-ink)]">
                        {artisan.profile_name}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm text-[var(--aa-ink)]">
                      {artisan.city || "Ville non renseignée"} · {artisan.address || "Adresse non renseignée"}
                    </p>
                    <p className="mt-1 text-sm text-[var(--aa-ink)]">
                      Téléphone : {artisan.phone || "Non renseigné"} ·{" "}
                      {artisan.is_available ? "Disponible" : "Indisponible"}
                    </p>
                    {artisan.description ? (
                      <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
                        {artisan.description}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
                      Métiers :{" "}
                      {artisan.categories.length > 0 ? artisan.categories.join(", ") : "Non renseigné"}
                    </p>
                    <p className="mt-2 text-sm text-[var(--aa-ink)]">
                      {artisan.servicesCount} service{artisan.servicesCount > 1 ? "s" : ""} ·{" "}
                      {artisan.bookingsCount} demande{artisan.bookingsCount > 1 ? "s" : ""} ·{" "}
                      {artisan.reviewsCount} avis
                      {artisan.averageRating !== null
                        ? ` · ${artisan.averageRating.toFixed(1)} / 5`
                        : ""}
                    </p>
                  </div>
                  <Link
                    href={`/admin/artisans/${artisan.id}`}
                    className="aa-btn aa-btn-primary shrink-0"
                  >
                    Voir le détail
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {pageCount > 1 ? (
          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
              className="aa-btn aa-btn-ghost"
            >
              Précédent
            </button>
            <p className="text-sm text-[var(--aa-ink-soft)]">
              Page {safePage} / {pageCount}
            </p>
            <button
              type="button"
              disabled={safePage >= pageCount}
              onClick={() => setPage(safePage + 1)}
              className="aa-btn aa-btn-ghost"
            >
              Suivant
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
