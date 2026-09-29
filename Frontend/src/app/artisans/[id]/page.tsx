"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { LocationMap } from "@/components/maps/load-maps";
import { PageHero } from "@/components/ui/AppPage";
import { AnimatedList, AnimatedListItem, EmptyState, Magnetic, MotionAlert, PageSkeleton, Reveal } from "@/components/motion";
import { createClient } from "@/lib/supabase/client";
import {
  areValidCoordinates,
  formatDistanceFromYou,
  geolocationErrorMessage,
  getBrowserCoordinates,
  haversineDistanceKm,
  isGeolocationPermissionDenied,
  type GeoCoordinates,
} from "@/lib/geolocation";
import { categoryIdToString } from "@/lib/artisan/categories";
import { coverImageForTrades, tradeGalleryForNames } from "@/lib/motion/media";
import { bookingIdToString } from "@/lib/bookings/artisan";
import { formatServicePrice, isPriceType, type PriceType } from "@/lib/artisan/service-price";
import { externalDirectionsUrl } from "@/lib/maps";

type ArtisanDetail = {
  id: string;
  business_name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  is_available: boolean;
  coordinates: GeoCoordinates | null;
};

type ArtisanService = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  price_type: PriceType;
  category_id: string | null;
};

type PublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

function formatReviewDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "Date inconnue";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeZone: "Africa/Abidjan",
  }).format(date);
}

function formatAverageRating(reviews: PublicReview[]): string {
  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  const average = total / reviews.length;
  return `${average.toFixed(1)} / 5`;
}

function starLabel(rating: number): string {
  const rounded = Math.min(5, Math.max(1, Math.round(rating)));
  return "★".repeat(rounded) + "☆".repeat(5 - rounded);
}

function parseCoordinate(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

export default function ArtisanPublicProfilePage() {
  const params = useParams<{ id: string }>();
  const artisanId = typeof params.id === "string" ? params.id : "";
  const supabase = useMemo(() => createClient(), []);

  const [artisan, setArtisan] = useState<ArtisanDetail | null>(null);
  const [trades, setTrades] = useState<{ id: string; name: string }[]>([]);
  const [services, setServices] = useState<ArtisanService[]>([]);
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [reviewsError, setReviewsError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isMeasuringDistance, setIsMeasuringDistance] = useState(false);
  const [distanceLabel, setDistanceLabel] = useState("");
  const [distanceError, setDistanceError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadArtisan() {
      if (!artisanId) {
        await Promise.resolve();
        if (cancelled) {
          return;
        }
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      const { data: artisanRow, error: artisanError } = await supabase
        .from("artisans")
        .select(
          "id, business_name, description, address, city, is_available, is_verified, latitude, longitude",
        )
        .eq("id", artisanId)
        .eq("is_verified", true)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (artisanError) {
        setErrorMessage("Impossible de charger cette fiche artisan.");
        setArtisan(null);
        setIsLoading(false);
        return;
      }

      if (!artisanRow || artisanRow.is_verified !== true || typeof artisanRow.id !== "string") {
        setNotFound(true);
        setArtisan(null);
        setIsLoading(false);
        return;
      }

      if (typeof artisanRow.business_name !== "string") {
        setNotFound(true);
        setArtisan(null);
        setIsLoading(false);
        return;
      }

      const [
        { data: categoryLinks },
        firstServices,
        { data: reviewRows, error: reviewsLoadError },
      ] = await Promise.all([
        supabase.from("artisan_categories").select("category_id").eq("artisan_id", artisanId),
        supabase
          .from("services")
          .select("id, name, description, price, price_type, category_id")
          .eq("artisan_id", artisanId)
          .order("name"),
        supabase
          .from("reviews")
          .select("id, rating, comment, created_at")
          .eq("artisan_id", artisanId)
          .order("created_at", { ascending: false }),
      ]);

      let serviceRows: Record<string, unknown>[] = (firstServices.data ?? []) as Record<string, unknown>[];
      let servicesError = firstServices.error;

      if (servicesError?.message.toLowerCase().includes("category_id")) {
        const fallback = await supabase
          .from("services")
          .select("id, name, description, price, price_type")
          .eq("artisan_id", artisanId)
          .order("name");
        serviceRows = (fallback.data ?? []) as Record<string, unknown>[];
        servicesError = fallback.error;
      }

      if (cancelled) {
        return;
      }

      const categoryIds = (categoryLinks ?? []).flatMap((link) => {
        const id = categoryIdToString(link.category_id);
        return id ? [id] : [];
      });

      let loadedTrades: { id: string; name: string }[] = [];
      if (categoryIds.length > 0) {
        const { data: categoryRows } = await supabase
          .from("categories")
          .select("id, name")
          .in("id", categoryIds)
          .order("name");

        loadedTrades = (categoryRows ?? []).flatMap((row) => {
          const id = categoryIdToString(row.id);
          const name = typeof row.name === "string" ? row.name : "";
          return id && name ? [{ id, name }] : [];
        });
      }

      if (cancelled) {
        return;
      }

      if (servicesError) {
        setErrorMessage("Le profil a été chargé, mais les services sont indisponibles.");
      }

      if (reviewsLoadError) {
        setReviewsError("Impossible de charger les avis.");
      }

      const latitude = parseCoordinate(artisanRow.latitude);
      const longitude = parseCoordinate(artisanRow.longitude);
      const coordinates =
        latitude !== null && longitude !== null && areValidCoordinates(latitude, longitude)
          ? { latitude, longitude }
          : null;

      setArtisan({
        id: artisanRow.id,
        business_name: artisanRow.business_name,
        description: typeof artisanRow.description === "string" ? artisanRow.description : null,
        address: typeof artisanRow.address === "string" ? artisanRow.address : null,
        city: typeof artisanRow.city === "string" ? artisanRow.city : null,
        is_available: artisanRow.is_available === true,
        coordinates,
      });
      setTrades(loadedTrades);
      setServices(
        (serviceRows ?? []).flatMap((row) => {
          const id = bookingIdToString(row.id);
          const priceTypeValue = String(row.price_type);
          if (!id || typeof row.name !== "string" || !isPriceType(priceTypeValue)) {
            return [];
          }

          return [
            {
              id,
              name: row.name,
              description: typeof row.description === "string" ? row.description : null,
              price: typeof row.price === "number" ? row.price : null,
              price_type: priceTypeValue,
              category_id: categoryIdToString(row.category_id),
            } satisfies ArtisanService,
          ];
        }),
      );
      setReviews(
        (reviewRows ?? []).flatMap((row) => {
          const id = bookingIdToString(row.id);
          if (!id || typeof row.rating !== "number") {
            return [];
          }
          if (row.rating < 1 || row.rating > 5) {
            return [];
          }

          return [
            {
              id,
              rating: row.rating,
              comment: typeof row.comment === "string" && row.comment.trim() !== "" ? row.comment : null,
              created_at: String(row.created_at ?? ""),
            } satisfies PublicReview,
          ];
        }),
      );
      setNotFound(false);
      setIsLoading(false);
    }

    void loadArtisan();

    return () => {
      cancelled = true;
    };
  }, [artisanId, supabase]);

  async function handleViewDistance() {
    if (!artisan?.coordinates) {
      setDistanceLabel("");
      setDistanceError("Localisation de l'artisan non disponible");
      return;
    }

    setDistanceError("");
    setDistanceLabel("");
    setIsMeasuringDistance(true);

    try {
      const clientCoordinates = await getBrowserCoordinates();
      const distanceKm = haversineDistanceKm(clientCoordinates, artisan.coordinates);
      setDistanceLabel(formatDistanceFromYou(distanceKm));
    } catch (error) {
      setDistanceLabel("");
      setDistanceError(
        isGeolocationPermissionDenied(error)
          ? "Position non disponible"
          : geolocationErrorMessage(error),
      );
    } finally {
      setIsMeasuringDistance(false);
    }
  }

  if (isLoading) {
    return (
      <div className="aa-page aa-page-center">
        <PageSkeleton label="Chargement de la fiche artisan…" />
      </div>
    );
  }

  if (notFound || !artisan) {
    return (
      <div className="aa-page aa-page-center">
        <main className="w-full max-w-lg aa-card p-6 text-center sm:p-8">
          <h1 className="text-xl font-semibold text-[var(--aa-ink)]">
            Artisan introuvable
          </h1>
          <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
            Ce professionnel n&apos;existe pas ou n&apos;est pas encore vérifié.
          </p>
          <Link
            href="/artisans"
            className="aa-btn aa-btn-ghost mt-6"
          >
            Retour à la recherche
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="aa-page pb-28 lg:pb-14">
      <main className="w-full max-w-2xl">
        <Link
          href="/artisans"
          className="aa-back"
        >
          ← Retour à la recherche
        </Link>

        <PageHero
          className="aa-hero-portrait"
          imageSrc={coverImageForTrades(trades.map((trade) => trade.name))}
          imageAlt={`Univers métier de ${artisan.business_name}`}
          kicker={trades.length > 0 ? trades.map((trade) => trade.name).join(" · ") : "Artisan vérifié"}
          title={artisan.business_name}
          subtitle={
            artisan.city
              ? `${artisan.city}${artisan.address ? ` — ${artisan.address}` : ""}`
              : artisan.description ?? undefined
          }
        />

        <Reveal>
        <section className="aa-card p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="aa-chip bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              Artisan vérifié
            </span>
            <span
              className={`aa-chip ${
                artisan.is_available
                  ? "bg-[color-mix(in_srgb,var(--aa-lagoon)_16%,transparent)] text-[var(--aa-lagoon)]"
                  : "bg-[color-mix(in_srgb,var(--aa-ink)_8%,transparent)] text-[var(--aa-ink-soft)]"
              }`}
            >
              {artisan.is_available ? "Disponible" : "Indisponible"}
            </span>
            {reviews.length > 0 ? (
              <span className="aa-chip bg-[color-mix(in_srgb,var(--aa-gold)_18%,transparent)] text-[var(--aa-ink)]">
                {formatAverageRating(reviews)}
              </span>
            ) : null}
          </div>

          <h2 className="mt-4 text-lg font-semibold text-[var(--aa-ink)]">{artisan.business_name}</h2>

          {artisan.description ? (
            <p className="mt-3 text-sm leading-6 text-[var(--aa-ink-soft)]">
              {artisan.description}
            </p>
          ) : null}

          <p className="mt-3 text-sm text-[var(--aa-ink)]">
            {trades.length > 0 ? trades.map((trade) => trade.name).join(" · ") : "Métier non renseigné"}
          </p>
          <p className="mt-1 text-sm text-[var(--aa-ink-soft)]">
            {artisan.city || "Ville non renseignée"}
            {artisan.address ? ` — ${artisan.address}` : ""}
          </p>
          {distanceLabel ? (
            <p className="mt-2 text-sm font-medium text-[var(--aa-ink)]">{distanceLabel}</p>
          ) : null}

          <div className="mt-6 hidden flex-col gap-3 sm:flex-row lg:flex">
            {artisan.is_available ? (
              <Magnetic>
                <Link
                  href={`/bookings/new?artisan_id=${artisan.id}`}
                  className="aa-btn aa-btn-primary"
                >
                  Demander une intervention
                </Link>
              </Magnetic>
            ) : (
              <div className="flex w-full flex-col gap-2">
                <p className="text-sm text-[var(--aa-ink-soft)]">
                  Cet artisan est temporairement indisponible. Vous pouvez tout de même envoyer une
                  demande : elle restera en attente.
                </p>
                <Link
                  href={`/bookings/new?artisan_id=${artisan.id}`}
                  className="aa-btn aa-btn-ghost"
                >
                  Envoyer une demande malgré l&apos;indisponibilité
                </Link>
              </div>
            )}
          </div>
        </section>
        </Reveal>

        <Reveal delayMs={40}>
          <section className="aa-card mt-6 overflow-hidden p-0">
            <div className="px-6 pt-6 sm:px-8">
              <h2 className="text-lg font-semibold text-[var(--aa-ink)]">Savoir-faire</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--aa-ink-soft)]">
                Ambiance du métier : visuels de référence. Les photos personnelles de l’atelier
                apparaîtront ici lorsqu’elles seront disponibles sur le profil.
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-1 sm:grid-cols-3">
              {tradeGalleryForNames(trades.map((trade) => trade.name)).map((item) => (
                <div key={`${item.name}-${item.image}`} className="relative aspect-[4/3] overflow-hidden">
                  <Image
                    src={item.image}
                    alt={item.alt}
                    fill
                    sizes="(max-width: 640px) 50vw, 240px"
                    quality={80}
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
                  <p className="absolute bottom-2 left-3 text-xs font-semibold uppercase tracking-[0.12em] text-white">
                    {item.name}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </Reveal>

        {artisan.coordinates ? (
          <Reveal delayMs={60}>
          <section className="aa-card aa-sticky-cta-clearance mt-6 p-6">
            <h2 className="text-lg font-semibold text-[var(--aa-ink)]">Localisation</h2>
            <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
              Position professionnelle de l&apos;artisan. Votre GPS n&apos;est demandé que si vous cliquez
              sur « Voir la distance ».
            </p>
            <div className="relative z-0 mt-4 overflow-hidden rounded-xl">
              <LocationMap
                coordinates={artisan.coordinates}
                popupLabel={artisan.business_name}
              />
            </div>
            <div className="relative z-40 mt-4 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  void handleViewDistance();
                }}
                disabled={isMeasuringDistance}
                className="aa-btn aa-btn-ghost aa-sticky-cta-anchor"
              >
                {isMeasuringDistance ? "Récupération…" : "Voir la distance"}
              </button>
              <a
                href={externalDirectionsUrl(artisan.coordinates)}
                target="_blank"
                rel="noopener noreferrer"
                className="aa-btn aa-btn-ghost"
              >
                Ouvrir l&apos;itinéraire
              </a>
            </div>
            {distanceLabel ? (
              <p className="mt-3 text-sm font-medium text-[var(--aa-ink)]">{distanceLabel}</p>
            ) : null}
            {distanceError ? (
              <MotionAlert tone="error" message={distanceError} className="mt-3" />
            ) : null}
          </section>
          </Reveal>
        ) : null}

        {errorMessage ? (
          <MotionAlert tone="error" message={errorMessage} className="mt-6" />
        ) : null}

          <Reveal delayMs={90}>
          <section className="aa-card mt-6 p-6">
          <h2 className="text-lg font-semibold text-[var(--aa-ink)]">Services et prix</h2>
          {services.length === 0 ? (
            <EmptyState className="mt-4" title="Aucun service publié">
              <p className="text-sm">Les prestations de cet artisan n&apos;ont pas encore été renseignées.</p>
            </EmptyState>
          ) : (
            <div className="mt-4 flex flex-col gap-6">
              {(trades.length > 0 ? trades : [{ id: "", name: "Prestations" }]).map((trade) => {
                const items = trade.id
                  ? services.filter((service) => service.category_id === trade.id)
                  : services;
                if (trade.id && items.length === 0) {
                  return null;
                }
                return (
                  <div key={trade.id || "all"}>
                    <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--aa-terracotta)]">
                      {trade.name}
                    </h3>
                    <AnimatedList className="mt-2 flex flex-col gap-3">
                      {items.map((service, index) => (
                        <AnimatedListItem
                          key={service.id}
                          index={index}
                          className="rounded-xl border border-[color-mix(in_srgb,var(--aa-ink)_8%,transparent)] p-4"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <p className="font-medium text-[var(--aa-ink)]">{service.name}</p>
                            <p className="text-sm font-semibold text-[var(--aa-ink)]">
                              {formatServicePrice(service)}
                            </p>
                          </div>
                          {service.description ? (
                            <p className="mt-1 text-sm text-[var(--aa-ink-soft)]">{service.description}</p>
                          ) : null}
                        </AnimatedListItem>
                      ))}
                    </AnimatedList>
                  </div>
                );
              })}
            </div>
          )}
        </section>
          </Reveal>

          <Reveal delayMs={110}>
          <section className="aa-card mt-6 p-6">
          <h2 className="text-lg font-semibold text-[var(--aa-ink)]">Avis</h2>
          {reviewsError ? (
            <MotionAlert tone="error" message={reviewsError} className="mt-3" />
          ) : reviews.length === 0 ? (
            <EmptyState className="mt-4" title="Aucun avis pour le moment">
              <p className="text-sm">Les notes apparaîtront après les premières interventions.</p>
            </EmptyState>
          ) : (
            <>
              <p className="mt-2 text-sm font-medium text-[var(--aa-ink)]">
                Note moyenne : {formatAverageRating(reviews)} ({reviews.length} avis)
              </p>
              <ul className="mt-4 flex flex-col gap-3">
                {reviews.map((review) => (
                  <li
                    key={review.id}
                    className="rounded-xl border border-[color-mix(in_srgb,var(--aa-ink)_8%,transparent)] p-4"
                  >
                    <p className="text-sm font-medium text-[var(--aa-ink)]">
                      {starLabel(review.rating)} {review.rating}/5
                    </p>
                    {review.comment ? (
                      <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
                        {review.comment}
                      </p>
                    ) : null}
                    <p className="mt-2 text-xs text-[var(--aa-ink-soft)]">
                      {formatReviewDate(review.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
          </Reveal>
      </main>
      <div className="aa-sticky-cta">
        <Link
          href={`/bookings/new?artisan_id=${artisan.id}`}
          className="aa-btn aa-btn-primary w-full"
        >
          {artisan.is_available ? "Demander une intervention" : "Envoyer une demande"}
        </Link>
      </div>
    </div>
  );
}
