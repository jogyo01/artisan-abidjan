"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { bookingStatusLabel, formatAmount, PAYMENT_STATUS_LABELS } from "@/lib/admin/labels";
import { requireAdminSession } from "@/lib/admin/session";
import { AnimatedList, AnimatedListItem, CountUp, PageSkeleton } from "@/components/motion";
import { createClient } from "@/lib/supabase/client";
import { mapCategoryRow, categoryIdToString } from "@/lib/artisan/categories";

type AdminStats = {
  users: number;
  clients: number;
  usersArtisan: number;
  usersAdmin: number;
  artisans: number;
  artisansVerified: number;
  artisansPending: number;
  artisansAvailable: number;
  artisansUnavailable: number;
  bookings: number;
  bookingsPending: number;
  bookingsAccepted: number;
  bookingsRefused: number;
  bookingsInProgress: number;
  bookingsCompleted: number;
  bookingsCancelled: number;
  reviews: number;
  reviewsAverage: number | null;
  payments: number;
  paymentsPending: number;
  paymentsPaid: number;
  paymentsFailed: number;
  paymentsRefunded: number;
  paymentsPaidAmount: number | null;
  paymentsPendingAmount: number | null;
  paymentsPaidCurrency: string;
  commissionsTotal: number | null;
  commissionsCurrency: string;
  commissionRate: number | null;
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
  users: 0,
  clients: 0,
  usersArtisan: 0,
  usersAdmin: 0,
  artisans: 0,
  artisansVerified: 0,
  artisansPending: 0,
  artisansAvailable: 0,
  artisansUnavailable: 0,
  bookings: 0,
  bookingsPending: 0,
  bookingsAccepted: 0,
  bookingsRefused: 0,
  bookingsInProgress: 0,
  bookingsCompleted: 0,
  bookingsCancelled: 0,
  reviews: 0,
  reviewsAverage: null,
  payments: 0,
  paymentsPending: 0,
  paymentsPaid: 0,
  paymentsFailed: 0,
  paymentsRefunded: 0,
  paymentsPaidAmount: null,
  paymentsPendingAmount: null,
  paymentsPaidCurrency: "XOF",
  commissionsTotal: null,
  commissionsCurrency: "XOF",
  commissionRate: null,
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
      users,
      clients,
      usersArtisan,
      usersAdmin,
      artisans,
      artisansVerified,
      artisansPending,
      artisansAvailable,
      artisansUnavailable,
      bookings,
      bookingsPending,
      bookingsAccepted,
      bookingsInProgress,
      bookingsCompleted,
      bookingsRefused,
      bookingsCancelled,
      artisansResult,
      profilesResult,
      linksResult,
      categoriesResult,
      reviewsResult,
      paymentsResult,
      commissionsResult,
      settingsResult,
    ] = await Promise.all([
      countRows(supabase.from("profiles").select("id", { count: "exact", head: true })),
      countRows(
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "CLIENT"),
      ),
      countRows(
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "ARTISAN"),
      ),
      countRows(
        supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "ADMIN"),
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
      countRows(
        supabase
          .from("artisans")
          .select("id", { count: "exact", head: true })
          .eq("is_available", true),
      ),
      countRows(
        supabase
          .from("artisans")
          .select("id", { count: "exact", head: true })
          .eq("is_available", false),
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
      countRows(
        supabase
          .from("bookings")
          .select("id", { count: "exact", head: true })
          .eq("status", "CANCELLED"),
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
      supabase.from("reviews").select("rating"),
      supabase.from("payments").select("amount, currency, status"),
      supabase.from("platform_commissions").select("commission_amount, currency"),
      supabase
        .from("platform_settings")
        .select("key, numeric_value")
        .eq("key", "commission_rate")
        .maybeSingle(),
    ]);

    if (
      users === null ||
      clients === null ||
      usersArtisan === null ||
      usersAdmin === null ||
      artisans === null ||
      artisansVerified === null ||
      artisansPending === null ||
      artisansAvailable === null ||
      artisansUnavailable === null ||
      bookings === null ||
      bookingsPending === null ||
      bookingsAccepted === null ||
      bookingsInProgress === null ||
      bookingsCompleted === null ||
      bookingsRefused === null ||
      bookingsCancelled === null ||
      artisansResult.error
    ) {
      return { error: true as const };
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

    const ratings = (reviewsResult.data ?? []).flatMap((row) =>
      typeof row.rating === "number" && row.rating >= 1 && row.rating <= 5 ? [row.rating] : [],
    );
    const paidPayments = (paymentsResult.data ?? []).flatMap((row) => {
      if (row.status !== "PAID") {
        return [];
      }
      const amount = typeof row.amount === "number" ? row.amount : Number(row.amount);
      if (!Number.isFinite(amount)) {
        return [];
      }
      return [
        {
          amount,
          currency: typeof row.currency === "string" ? row.currency : "XOF",
        },
      ];
    });
    const pendingPayments = (paymentsResult.data ?? []).flatMap((row) => {
      if (row.status !== "PENDING") {
        return [];
      }
      const amount = typeof row.amount === "number" ? row.amount : Number(row.amount);
      if (!Number.isFinite(amount)) {
        return [];
      }
      return [amount];
    });
    const paymentsPendingCount = pendingPayments.length;
    const paymentsPaidCount = paidPayments.length;
    const paymentsFailedCount = (paymentsResult.data ?? []).filter(
      (row) => row.status === "FAILED",
    ).length;
    const paymentsRefundedCount = (paymentsResult.data ?? []).filter(
      (row) => row.status === "REFUNDED",
    ).length;
    const paidAmount = paidPayments.reduce((sum, row) => sum + row.amount, 0);

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
        users,
        clients,
        usersArtisan,
        usersAdmin,
        artisans,
        artisansVerified,
        artisansPending,
        artisansAvailable,
        artisansUnavailable,
        bookings,
        bookingsPending,
        bookingsAccepted,
        bookingsRefused,
        bookingsInProgress,
        bookingsCompleted,
        bookingsCancelled,
        reviews: ratings.length,
        reviewsAverage:
          ratings.length > 0
            ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
            : null,
        payments: (paymentsResult.data ?? []).length,
        paymentsPending: paymentsPendingCount,
        paymentsPaid: paymentsPaidCount,
        paymentsFailed: paymentsFailedCount,
        paymentsRefunded: paymentsRefundedCount,
        paymentsPaidAmount: paymentsResult.error ? null : paidAmount,
        paymentsPendingAmount: paymentsResult.error
          ? null
          : pendingPayments.reduce((sum, amount) => sum + amount, 0),
        paymentsPaidCurrency: paidPayments[0]?.currency ?? "XOF",
        commissionsTotal: commissionsResult.error
          ? null
          : (commissionsResult.data ?? []).reduce((sum, row) => {
              const amount =
                typeof row.commission_amount === "number"
                  ? row.commission_amount
                  : Number(row.commission_amount);
              return Number.isFinite(amount) ? sum + amount : sum;
            }, 0),
        commissionsCurrency:
          (commissionsResult.data ?? []).find((row) => typeof row.currency === "string")?.currency ??
          "XOF",
        commissionRate: (() => {
          if (settingsResult.error) {
            return null;
          }
          const raw = settingsResult.data?.numeric_value;
          const rate = typeof raw === "number" ? raw : Number(raw);
          return Number.isFinite(rate) ? rate : null;
        })(),
      },
      pending: mapped.filter((artisan) => !artisan.is_verified),
      verified: mapped.filter((artisan) => artisan.is_verified),
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

    const session = await requireAdminSession(supabase);
    if (session.kind === "unauthenticated") {
      router.replace("/auth");
      return;
    }
    if (session.kind === "forbidden") {
      router.replace("/");
      return;
    }

    setVerifyingId(artisanId);

    try {
      const { error } = await supabase.rpc("admin_verify_artisan", {
        p_artisan_id: artisanId,
      });

      if (error) {
        setErrorMessage(
          "Impossible de vérifier cet artisan.",
        );
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
      <div className="aa-page aa-page-center">
        <PageSkeleton variant="dashboard" label="Chargement de l'espace admin…" />
      </div>
    );
  }

  const statGroups: { title: string; cards: { label: string; value: string }[] }[] = [
    {
      title: "Utilisateurs",
      cards: [
        { label: "Total", value: String(stats.users) },
        { label: "Clients", value: String(stats.clients) },
        { label: "Artisans (rôle)", value: String(stats.usersArtisan) },
        { label: "Admins", value: String(stats.usersAdmin) },
      ],
    },
    {
      title: "Artisans",
      cards: [
        { label: "Total fiches", value: String(stats.artisans) },
        { label: "Vérifiés", value: String(stats.artisansVerified) },
        { label: "En attente", value: String(stats.artisansPending) },
        { label: "Disponibles", value: String(stats.artisansAvailable) },
        { label: "Indisponibles", value: String(stats.artisansUnavailable) },
      ],
    },
    {
      title: "Demandes",
      cards: [
        { label: "Total", value: String(stats.bookings) },
        { label: bookingStatusLabel("PENDING"), value: String(stats.bookingsPending) },
        { label: bookingStatusLabel("ACCEPTED"), value: String(stats.bookingsAccepted) },
        { label: bookingStatusLabel("REFUSED"), value: String(stats.bookingsRefused) },
        { label: bookingStatusLabel("IN_PROGRESS"), value: String(stats.bookingsInProgress) },
        { label: bookingStatusLabel("COMPLETED"), value: String(stats.bookingsCompleted) },
        { label: bookingStatusLabel("CANCELLED"), value: String(stats.bookingsCancelled) },
      ],
    },
    {
      title: "Avis",
      cards: [
        { label: "Total", value: String(stats.reviews) },
        {
          label: "Moyenne générale",
          value: stats.reviewsAverage === null ? "—" : `${stats.reviewsAverage.toFixed(1)} / 5`,
        },
      ],
    },
    {
      title: "Paiements",
      cards: [
        { label: "Total", value: String(stats.payments) },
        { label: PAYMENT_STATUS_LABELS.PENDING, value: String(stats.paymentsPending) },
        { label: PAYMENT_STATUS_LABELS.PAID, value: String(stats.paymentsPaid) },
        { label: PAYMENT_STATUS_LABELS.FAILED, value: String(stats.paymentsFailed) },
        { label: PAYMENT_STATUS_LABELS.REFUNDED, value: String(stats.paymentsRefunded) },
            {
              label: "Montant payé",
              value:
                stats.paymentsPaidAmount === null
                  ? "—"
                  : formatAmount(stats.paymentsPaidAmount, stats.paymentsPaidCurrency),
            },
            {
              label: "Montant en attente",
              value:
                stats.paymentsPendingAmount === null
                  ? "—"
                  : formatAmount(stats.paymentsPendingAmount, stats.paymentsPaidCurrency),
            },
      ],
    },
  ];

  if (stats.commissionRate !== null || stats.commissionsTotal !== null) {
    const cards: { label: string; value: string }[] = [];
    if (stats.commissionRate !== null) {
      cards.push({
        label: "Taux actuel",
        value: `${(stats.commissionRate * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} %`,
      });
    }
    if (stats.commissionsTotal !== null) {
      cards.push({
        label: "Montant total généré",
        value: formatAmount(stats.commissionsTotal, stats.commissionsCurrency),
      });
    }
    statGroups.push({ title: "Commissions", cards });
  }

  return (
    <div className="aa-page">
      <main className="w-full max-w-5xl aa-card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--aa-ink)]">
          Administration
        </h1>
        <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
          Vue d&apos;ensemble de la plateforme et vérification des artisans.
        </p>
        <AdminSectionNav current="/admin" />

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

        {statGroups.map((group) => (
          <section key={group.title} className="mt-8">
            <h2 className="text-lg font-semibold text-[var(--aa-ink)]">{group.title}</h2>
            <AnimatedList className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {group.cards.map((card, index) => (
                <AnimatedListItem
                  key={card.label}
                  index={index}
                  className="aa-card p-4"
                >
                  <p className="text-sm text-[var(--aa-ink-soft)]">{card.label}</p>
                  <p className="mt-1 text-xl font-semibold text-[var(--aa-ink)]">
                    {/^\d+$/.test(card.value) ? <CountUp value={Number(card.value)} /> : card.value}
                  </p>
                </AnimatedListItem>
              ))}
            </AnimatedList>
          </section>
        ))}

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-[var(--aa-ink)]">
            Artisans en attente de vérification
          </h2>
          {pendingArtisans.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--aa-ink-soft)]">
              Aucun artisan à vérifier.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-4">
              {pendingArtisans.map((artisan) => (
                <li
                  key={artisan.id}
                  className="aa-card p-4"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-[var(--aa-ink)]">
                        {artisan.business_name}
                      </h3>
                      {artisan.profile_name ? (
                        <p className="mt-1 text-sm text-[var(--aa-ink)]">
                          {artisan.profile_name}
                        </p>
                      ) : null}
                      <dl className="mt-3 space-y-1 text-sm text-[var(--aa-ink)]">
                        <div>
                          <dt className="inline font-medium text-[var(--aa-ink-soft)]">
                            Téléphone :{" "}
                          </dt>
                          <dd className="inline">{artisan.phone || "Non renseigné"}</dd>
                        </div>
                        <div>
                          <dt className="inline font-medium text-[var(--aa-ink-soft)]">
                            Ville :{" "}
                          </dt>
                          <dd className="inline">{artisan.city || "Non renseignée"}</dd>
                        </div>
                        <div>
                          <dt className="inline font-medium text-[var(--aa-ink-soft)]">
                            Adresse :{" "}
                          </dt>
                          <dd className="inline">{artisan.address || "Non renseignée"}</dd>
                        </div>
                        <div>
                          <dt className="inline font-medium text-[var(--aa-ink-soft)]">
                            Disponibilité :{" "}
                          </dt>
                          <dd className="inline">
                            {artisan.is_available ? "Disponible" : "Indisponible"}
                          </dd>
                        </div>
                        <div>
                          <dt className="inline font-medium text-[var(--aa-ink-soft)]">
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
                        <p className="mt-3 text-sm text-[var(--aa-ink-soft)]">
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
                      className="aa-btn aa-btn-primary shrink-0"
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
          <h2 className="text-lg font-semibold text-[var(--aa-ink)]">
            Artisans vérifiés
          </h2>
          {verifiedArtisans.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--aa-ink-soft)]">
              Aucun artisan vérifié pour le moment.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {verifiedArtisans.map((artisan) => (
                <li
                  key={artisan.id}
                  className="aa-card p-4"
                >
                  <h3 className="font-semibold text-[var(--aa-ink)]">
                    {artisan.business_name}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--aa-ink)]">
                    {artisan.city || "Ville non renseignée"} ·{" "}
                    {artisan.is_available ? "Disponible" : "Indisponible"}
                  </p>
                  <p className="mt-1 text-sm text-[var(--aa-ink-soft)]">
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
