"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadArtisanSession } from "@/lib/artisan/session";
import { PageHero } from "@/components/ui/AppPage";
import { AnimatedList, AnimatedListItem, CountUp, MotionAlert, PageSkeleton } from "@/components/motion";
import { CITY_MEDIA } from "@/lib/motion/media";
import { loadArtisanBookings, type ArtisanBooking } from "@/lib/bookings/load-artisan-bookings";

export default function ArtisanDashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [businessName, setBusinessName] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const [isToggling, setIsToggling] = useState(false);
  const [bookings, setBookings] = useState<ArtisanBooking[]>([]);
  const [servicesCount, setServicesCount] = useState(0);
  const [reviewsCount, setReviewsCount] = useState(0);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [description, setDescription] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  const loadDashboard = useCallback(async () => {
    const session = await loadArtisanSession(supabase);
    if (session.kind === "unauthenticated") {
      router.replace("/auth");
      return;
    }
    if (session.kind === "forbidden") {
      router.replace("/");
      return;
    }
    if (session.kind === "needs_onboarding") {
      setBusinessName("");
      setIsVerified(false);
      setIsAvailable(true);
      setDescription(null);
      setAddress(null);
      setPhone(null);
      setLatitude(null);
      setLongitude(null);
      setBookings([]);
      setServicesCount(0);
      setReviewsCount(0);
      setAverageRating(null);
      return;
    }

    const [{ bookings: loadedBookings, error: bookingsError }, servicesResult, reviewsResult] =
      await Promise.all([
        loadArtisanBookings(supabase, session.userId),
        supabase
          .from("services")
          .select("id", { count: "exact", head: true })
          .eq("artisan_id", session.userId),
        supabase.from("reviews").select("rating").eq("artisan_id", session.userId),
      ]);

    setBusinessName(session.artisan.business_name);
    setIsVerified(session.artisan.is_verified);
    setIsAvailable(session.artisan.is_available);
    setDescription(session.artisan.description);
    setAddress(session.artisan.address);
    setPhone(session.artisan.phone);
    setLatitude(session.artisan.latitude);
    setLongitude(session.artisan.longitude);

    if (bookingsError) {
      setErrorMessage("Impossible de charger le tableau de bord.");
      setBookings([]);
    } else {
      setBookings(loadedBookings);
    }

    setServicesCount(servicesResult.error ? 0 : (servicesResult.count ?? 0));

    const ratings = (reviewsResult.data ?? []).flatMap((row) =>
      typeof row.rating === "number" && row.rating >= 1 && row.rating <= 5 ? [row.rating] : [],
    );
    setReviewsCount(ratings.length);
    setAverageRating(
      ratings.length > 0 ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length : null,
    );
  }, [router, supabase]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      await loadDashboard();
      if (!cancelled) {
        setIsLoading(false);
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [loadDashboard]);

  async function toggleAvailability() {
    setErrorMessage("");
    setIsToggling(true);

    try {
      const session = await loadArtisanSession(supabase);
      if (session.kind !== "ok") {
        return;
      }

      const nextAvailable = !isAvailable;
      const { data, error } = await supabase
        .from("artisans")
        .update({ is_available: nextAvailable })
        .eq("id", session.userId)
        .select("is_available")
        .maybeSingle();

      if (error || !data) {
        setErrorMessage("Impossible de mettre à jour la disponibilité.");
        return;
      }

      setIsAvailable(data.is_available === true);
    } finally {
      setIsToggling(false);
    }
  }

  if (isLoading) {
    return (
      <div className="aa-page aa-page-center">
        <PageSkeleton variant="dashboard" label="Chargement du tableau de bord…" />
      </div>
    );
  }

  const pending = bookings.filter((booking) => booking.status === "PENDING").length;
  const accepted = bookings.filter((booking) => booking.status === "ACCEPTED").length;
  const inProgress = bookings.filter((booking) => booking.status === "IN_PROGRESS").length;
  const completed = bookings.filter((booking) => booking.status === "COMPLETED").length;
  const cancelled = bookings.filter((booking) => booking.status === "CANCELLED").length;

  const trimmedBusinessName = businessName.trim();
  const isProfileIncomplete =
    trimmedBusinessName === "" ||
    trimmedBusinessName === "Mon atelier" ||
    !description?.trim() ||
    !address?.trim() ||
    !phone?.trim() ||
    latitude === null ||
    longitude === null;

  const stats = [
    { label: "Total demandes", value: String(bookings.length) },
    { label: "En attente", value: String(pending) },
    { label: "Acceptées", value: String(accepted) },
    { label: "En cours", value: String(inProgress) },
    { label: "Terminées", value: String(completed) },
    { label: "Annulées", value: String(cancelled) },
    { label: "Services", value: String(servicesCount) },
    {
      label: "Note moyenne",
      value: averageRating === null ? "—" : `${averageRating.toFixed(1)} / 5`,
    },
    { label: "Avis", value: String(reviewsCount) },
  ];

  return (
    <div className="aa-page">
      <main className="aa-panel">
        <PageHero
          imageSrc={CITY_MEDIA.workshop.src}
          imageAlt={CITY_MEDIA.workshop.alt}
          kicker="Espace artisan"
          title="Tableau de bord"
          subtitle={businessName || "Votre activité"}
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span
                className={`aa-chip ${
                  isVerified
                    ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                    : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                }`}
              >
                {isVerified ? "Profil vérifié" : "Profil en attente de vérification"}
              </span>
              <span className="aa-chip bg-[color-mix(in_srgb,var(--aa-ink)_8%,transparent)] text-[var(--aa-ink)]">
                {isAvailable ? "Disponible" : "Indisponible"}
              </span>
            </div>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto">
            <button
              type="button"
              onClick={() => {
                if (!isAvailable) {
                  void toggleAvailability();
                }
              }}
              disabled={isToggling || isAvailable}
              className={`aa-btn ${
                isAvailable
                  ? "aa-btn-primary"
                  : "aa-btn-ghost"
              }`}
            >
              Disponible
            </button>
            <button
              type="button"
              onClick={() => {
                if (isAvailable) {
                  void toggleAvailability();
                }
              }}
              disabled={isToggling || !isAvailable}
              className={`aa-btn ${
                !isAvailable
                  ? "aa-btn-primary"
                  : "aa-btn-ghost"
              }`}
            >
              Indisponible
            </button>
          </div>
        </div>

        {errorMessage ? (
          <MotionAlert tone="error" message={errorMessage} className="mt-6" />
        ) : null}

        {!isVerified || isProfileIncomplete ? (
          <section className="mt-8 rounded-2xl border border-[color-mix(in_srgb,var(--aa-terracotta)_28%,transparent)] bg-[var(--aa-card)] p-5 shadow-[0_16px_40px_-28px_rgba(27,18,12,0.35)] sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--aa-terracotta)]">
              Statut du profil
            </p>
            <h2 className="mt-2 text-lg font-semibold text-[var(--aa-ink)]">
              {isProfileIncomplete
                ? "Profil en attente de complétion"
                : "Profil en attente de vérification"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--aa-ink-soft)]">
              {isVerified
                ? "Votre profil est vérifié et visible dans la recherche clients. Complétez les informations manquantes pour rassurer les particuliers."
                : "Votre profil sera soumis à vérification par l'équipe. Tant qu'il n'est pas vérifié, il n'apparaît pas dans la recherche clients."}
            </p>
            {isProfileIncomplete ? (
              <Link href="/artisan/profile" className="aa-btn aa-btn-primary mt-4">
                Compléter mon profil
              </Link>
            ) : (
              <Link href="/artisan/profile" className="aa-btn aa-btn-ghost mt-4">
                Voir mon profil
              </Link>
            )}
          </section>
        ) : null}

        <AnimatedList className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats
            .filter((stat) =>
              ["En attente", "Acceptées", "En cours", "Terminées"].includes(stat.label),
            )
            .map((stat, index) => (
            <AnimatedListItem key={stat.label} index={index} className="aa-card p-4">
              <p className="text-xs font-medium text-[var(--aa-ink-soft)]">{stat.label}</p>
              <p className="mt-2 text-xl font-semibold text-[var(--aa-ink)]">
                {/^\d+$/.test(stat.value) ? <CountUp value={Number(stat.value)} /> : stat.value}
              </p>
            </AnimatedListItem>
          ))}
        </AnimatedList>

        <AnimatedList className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats
            .filter(
              (stat) => !["En attente", "Acceptées", "En cours", "Terminées"].includes(stat.label),
            )
            .map((stat, index) => (
            <AnimatedListItem key={stat.label} index={index} className="aa-card p-4">
              <p className="text-xs font-medium text-[var(--aa-ink-soft)]">{stat.label}</p>
              <p className="mt-2 text-lg font-semibold text-[var(--aa-ink)]">
                {/^\d+$/.test(stat.value) ? <CountUp value={Number(stat.value)} /> : stat.value}
              </p>
            </AnimatedListItem>
          ))}
        </AnimatedList>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/artisan/bookings" className="aa-btn aa-btn-primary">
            Voir les demandes
          </Link>
          <Link href="/artisan/profile" className="aa-btn aa-btn-ghost">
            Mon profil
          </Link>
          <Link href="/artisan/services" className="aa-btn aa-btn-ghost">
            Mes services
          </Link>
          <Link href="/artisan/profile#metiers" className="aa-btn aa-btn-ghost">
            Mes métiers
          </Link>
        </div>
      </main>
    </div>
  );
}
