"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { formatAdminDateTime } from "@/lib/admin/labels";
import { paginate } from "@/lib/admin/pagination";
import { requireAdminSession } from "@/lib/admin/session";
import { PageSkeleton } from "@/components/motion";
import { bookingIdToString } from "@/lib/bookings/artisan";
import { createClient } from "@/lib/supabase/client";

type AdminReview = {
  id: string;
  client_name: string;
  artisan_name: string;
  rating: number;
  comment: string;
  booking_id: string;
  created_at: string;
};

type RatingFilter = "all" | 1 | 2 | 3 | 4 | 5;

export default function AdminReviewsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RatingFilter>("all");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadReviews = useCallback(async () => {
    const { data, error } = await supabase
      .from("reviews")
      .select("id, client_id, artisan_id, booking_id, rating, comment, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return { reviews: [] as AdminReview[], error: true };
    }

    const rows = data ?? [];
    const clientIds = [
      ...new Set(rows.flatMap((row) => (typeof row.client_id === "string" ? [row.client_id] : []))),
    ];
    const artisanIds = [
      ...new Set(
        rows.flatMap((row) => (typeof row.artisan_id === "string" ? [row.artisan_id] : [])),
      ),
    ];

    const [{ data: profiles }, { data: artisans }] = await Promise.all([
      clientIds.length > 0
        ? supabase.from("profiles").select("id, full_name").in("id", clientIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
      artisanIds.length > 0
        ? supabase.from("artisans").select("id, business_name").in("id", artisanIds)
        : Promise.resolve({ data: [] as { id: string; business_name: string | null }[] }),
    ]);

    const clientNames = new Map<string, string>();
    for (const row of profiles ?? []) {
      if (typeof row.id === "string") {
        clientNames.set(
          row.id,
          typeof row.full_name === "string" && row.full_name.trim() !== ""
            ? row.full_name
            : "Client",
        );
      }
    }

    const artisanNames = new Map<string, string>();
    for (const row of artisans ?? []) {
      if (typeof row.id === "string") {
        artisanNames.set(
          row.id,
          typeof row.business_name === "string" ? row.business_name : "Artisan",
        );
      }
    }

    return {
      error: false,
      reviews: rows.flatMap((row) => {
        const id = bookingIdToString(row.id) ?? (typeof row.id === "string" ? row.id : null);
        const rating = typeof row.rating === "number" ? row.rating : Number(row.rating);
        if (!id || !Number.isInteger(rating) || rating < 1 || rating > 5) {
          return [];
        }
        return [
          {
            id,
            client_name:
              typeof row.client_id === "string"
                ? (clientNames.get(row.client_id) ?? "Client")
                : "Client",
            artisan_name:
              typeof row.artisan_id === "string"
                ? (artisanNames.get(row.artisan_id) ?? "Artisan")
                : "Artisan",
            rating,
            comment: typeof row.comment === "string" ? row.comment : "",
            booking_id: bookingIdToString(row.booking_id) ?? "—",
            created_at: String(row.created_at ?? ""),
          } satisfies AdminReview,
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

      const result = await loadReviews();
      if (cancelled) {
        return;
      }
      if (result.error) {
        setErrorMessage("Impossible de charger les avis.");
        setReviews([]);
      } else {
        setReviews(result.reviews);
      }
      setIsLoading(false);
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadReviews, router, supabase]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return reviews.filter((review) => {
      if (filter !== "all" && review.rating !== filter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        review.client_name.toLowerCase().includes(query) ||
        review.artisan_name.toLowerCase().includes(query) ||
        review.comment.toLowerCase().includes(query) ||
        review.booking_id.toLowerCase().includes(query)
      );
    });
  }, [filter, reviews, search]);

  const { pageItems, pageCount, page: safePage } = paginate(visible, page);

  if (isLoading) {
    return (
      <div className="aa-page aa-page-center">
        <PageSkeleton label="Chargement des avis…" />
      </div>
    );
  }

  return (
    <div className="aa-page">
      <main className="w-full max-w-5xl aa-card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-[var(--aa-ink)]">Avis</h1>
        <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
          Lecture seule. Les avis ne peuvent pas être modifiés depuis l&apos;administration.
        </p>
        <AdminSectionNav current="/admin/reviews" />

        <div className="mt-6 flex flex-col gap-3">
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Rechercher par client, artisan, commentaire ou demande"
            className="aa-input"
          />
          <div className="flex flex-wrap gap-2">
            {(["all", 1, 2, 3, 4, 5] as const).map((value) => (
              <button
                key={String(value)}
                type="button"
                onClick={() => {
                  setFilter(value);
                  setPage(1);
                }}
                className={`aa-filter ${filter === value ? "aa-filter-active" : ""}`}
              >
                {value === "all" ? "Toutes les notes" : `${value} / 5`}
              </button>
            ))}
          </div>
        </div>

        {errorMessage ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}

        {!errorMessage && visible.length === 0 ? (
          <p className="mt-8 text-sm text-[var(--aa-ink-soft)]">
            {reviews.length === 0
              ? "Aucun avis n'a encore été déposé. Ils apparaîtront après une intervention terminée."
              : "Aucun avis ne correspond à votre recherche ou au filtre."}
          </p>
        ) : null}

        <ul className="mt-8 flex flex-col gap-3">
          {pageItems.map((review) => (
            <li
              key={review.id}
              className="aa-card p-4 text-sm"
            >
              <p className="font-semibold text-[var(--aa-ink)]">
                {review.rating} / 5 · {review.artisan_name}
              </p>
              <p className="mt-1 text-[var(--aa-ink)]">Client : {review.client_name}</p>
              <p className="mt-1 text-[var(--aa-ink-soft)]">Demande #{review.booking_id}</p>
              <p className="mt-2 text-[var(--aa-ink)]">
                {review.comment || "Sans commentaire"}
              </p>
              <p className="mt-2 text-xs text-[var(--aa-ink-soft)]">{formatAdminDateTime(review.created_at)}</p>
            </li>
          ))}
        </ul>

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
