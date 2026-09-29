"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { requireAdminSession } from "@/lib/admin/session";
import { PageSkeleton } from "@/components/motion";
import { createClient } from "@/lib/supabase/client";
import { bookingIdToString } from "@/lib/bookings/artisan";
import { categoryIdToString, toCategoryWriteValue } from "@/lib/artisan/categories";

type PriceType = "FIXED" | "STARTING_FROM" | "ON_QUOTE";

type BookingStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REFUSED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

type AdminArtisanDetail = {
  id: string;
  business_name: string;
  profile_name: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  description: string | null;
  is_verified: boolean;
  is_available: boolean;
  has_professional_location: boolean;
  categories: string[];
};

type AdminService = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  price_type: PriceType;
};

type AdminBooking = {
  id: string;
  status: BookingStatus;
  scheduled_at: string;
  address: string;
  created_at: string;
};

type AdminReview = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: "En attente",
  ACCEPTED: "Acceptée",
  REFUSED: "Refusée",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
};

function isPriceType(value: string): value is PriceType {
  return value === "FIXED" || value === "STARTING_FROM" || value === "ON_QUOTE";
}

function isBookingStatus(value: string): value is BookingStatus {
  return value in STATUS_LABELS;
}

function formatFcfa(amount: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} XOF`;
}

function formatServicePrice(service: AdminService): string {
  if (service.price_type === "ON_QUOTE") {
    return "Sur devis";
  }
  if (service.price === null) {
    return service.price_type === "STARTING_FROM" ? "À partir de —" : "Prix non renseigné";
  }
  if (service.price_type === "STARTING_FROM") {
    return `À partir de ${formatFcfa(service.price)}`;
  }
  return formatFcfa(service.price);
}

function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "Date inconnue";
  }
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Abidjan",
  }).format(date);
}

export default function AdminArtisanDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const artisanId = typeof params.id === "string" ? params.id : "";
  const supabase = useMemo(() => createClient(), []);

  const [artisan, setArtisan] = useState<AdminArtisanDetail | null>(null);
  const [services, setServices] = useState<AdminService[]>([]);
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadDetail = useCallback(async (id: string) => {
    const [
      artisanResult,
      profileResult,
      linksResult,
      servicesResult,
      bookingsResult,
      reviewsResult,
    ] = await Promise.all([
      supabase
        .from("artisans")
        .select(
          "id, business_name, description, address, city, phone, is_verified, is_available, latitude, longitude",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase.from("profiles").select("id, full_name, phone").eq("id", id).maybeSingle(),
      supabase.from("artisan_categories").select("category_id").eq("artisan_id", id),
      supabase
        .from("services")
        .select("id, name, description, price, price_type")
        .eq("artisan_id", id)
        .order("name"),
      supabase
        .from("bookings")
        .select("id, status, scheduled_at, address, created_at")
        .eq("artisan_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("reviews")
        .select("id, rating, comment, created_at")
        .eq("artisan_id", id)
        .order("created_at", { ascending: false }),
    ]);

    if (artisanResult.error || !artisanResult.data) {
      return { ok: false as const, reason: artisanResult.error ? "load" : "missing" };
    }

    const row = artisanResult.data;
    if (typeof row.id !== "string" || typeof row.business_name !== "string") {
      return { ok: false as const, reason: "missing" };
    }

    const categoryIds = (linksResult.data ?? []).flatMap((link) => {
      const id = categoryIdToString(link.category_id);
      return id ? [toCategoryWriteValue(id)] : [];
    });
    let categoryNames: string[] = [];
    if (categoryIds.length > 0) {
      const { data: categoryRows } = await supabase
        .from("categories")
        .select("id, name")
        .in("id", categoryIds)
        .order("name");
      categoryNames = (categoryRows ?? []).flatMap((category) =>
        typeof category.name === "string" ? [category.name] : [],
      );
    }

    const profilePhone =
      typeof profileResult.data?.phone === "string" ? profileResult.data.phone : null;
    const artisanPhone = typeof row.phone === "string" && row.phone.trim() !== "" ? row.phone : null;

    const latitude =
      typeof row.latitude === "number"
        ? row.latitude
        : typeof row.latitude === "string"
          ? Number(row.latitude)
          : Number.NaN;
    const longitude =
      typeof row.longitude === "number"
        ? row.longitude
        : typeof row.longitude === "string"
          ? Number(row.longitude)
          : Number.NaN;

    return {
      ok: true as const,
      artisan: {
        id: row.id,
        business_name: row.business_name,
        profile_name:
          typeof profileResult.data?.full_name === "string" ? profileResult.data.full_name : null,
        phone: artisanPhone ?? profilePhone,
        city: typeof row.city === "string" ? row.city : null,
        address: typeof row.address === "string" ? row.address : null,
        description: typeof row.description === "string" ? row.description : null,
        is_verified: row.is_verified === true,
        is_available: row.is_available === true,
        has_professional_location: Number.isFinite(latitude) && Number.isFinite(longitude),
        categories: categoryNames,
      },
      services: (servicesResult.data ?? []).flatMap((service) => {
        const id = bookingIdToString(service.id);
        if (!id || typeof service.name !== "string") {
          return [];
        }
        if (!isPriceType(String(service.price_type))) {
          return [];
        }
        return [
          {
            id,
            name: service.name,
            description: typeof service.description === "string" ? service.description : null,
            price: typeof service.price === "number" ? service.price : null,
            price_type: service.price_type,
          } satisfies AdminService,
        ];
      }),
      bookings: (bookingsResult.data ?? []).flatMap((booking) => {
        const id = bookingIdToString(booking.id);
        if (!id || typeof booking.status !== "string") {
          return [];
        }
        if (!isBookingStatus(booking.status)) {
          return [];
        }
        return [
          {
            id,
            status: booking.status,
            scheduled_at: String(booking.scheduled_at ?? ""),
            address: typeof booking.address === "string" ? booking.address : "",
            created_at: String(booking.created_at ?? ""),
          } satisfies AdminBooking,
        ];
      }),
      reviews: (reviewsResult.data ?? []).flatMap((review) => {
        const id = bookingIdToString(review.id);
        if (!id || typeof review.rating !== "number") {
          return [];
        }
        return [
          {
            id,
            rating: review.rating,
            comment: typeof review.comment === "string" ? review.comment : null,
            created_at: String(review.created_at ?? ""),
          } satisfies AdminReview,
        ];
      }),
    };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!artisanId) {
        await Promise.resolve();
        if (!cancelled) {
          setNotFound(true);
          setIsLoading(false);
        }
        return;
      }

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

      const result = await loadDetail(artisanId);
      if (cancelled) {
        return;
      }

      if (!result.ok && result.reason === "load") {
        setErrorMessage("Impossible de charger cet artisan.");
        setIsLoading(false);
        return;
      }

      if (!result.ok) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      setArtisan(result.artisan);
      setServices(result.services);
      setBookings(result.bookings);
      setReviews(result.reviews);
      setIsLoading(false);
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [artisanId, loadDetail, router, supabase]);

  async function verifyArtisan() {
    if (!artisan) {
      return;
    }

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

    const confirmed = window.confirm(`Vérifier l'artisan « ${artisan.business_name} » ?`);
    if (!confirmed) {
      return;
    }

    setIsVerifying(true);

    try {
      const { error } = await supabase.rpc("admin_verify_artisan", {
        p_artisan_id: artisan.id,
      });

      if (error) {
        setErrorMessage(
          "Impossible de vérifier cet artisan.",
        );
        return;
      }

      const result = await loadDetail(artisan.id);
      if (!result.ok) {
        setArtisan({ ...artisan, is_verified: true });
        setSuccessMessage("Artisan vérifié.");
        return;
      }

      setArtisan(result.artisan);
      setServices(result.services);
      setBookings(result.bookings);
      setReviews(result.reviews);
      setSuccessMessage("Artisan vérifié.");
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsVerifying(false);
    }
  }

  const averageRating =
    reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : null;

  if (isLoading) {
    return (
      <div className="aa-page aa-page-center">
        <PageSkeleton label="Chargement du détail artisan…" />
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
            Cet artisan n&apos;existe pas.
          </p>
          <Link
            href="/admin/artisans"
            className="aa-btn aa-btn-ghost mt-6"
          >
            Retour à la liste
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="aa-page">
      <main className="w-full max-w-4xl aa-card p-6 sm:p-8">
        <Link
          href="/admin/artisans"
          className="aa-back"
        >
          ← Retour à la liste
        </Link>
        <AdminSectionNav current="/admin/artisans" />

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--aa-ink)]">
              {artisan.business_name}
            </h1>
            <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
              {artisan.is_verified ? "Artisan vérifié" : "En attente de vérification"} ·{" "}
              {artisan.is_available ? "Disponible" : "Indisponible"}
            </p>
          </div>
          {artisan.is_verified ? null : (
            <button
              type="button"
              disabled={isVerifying}
              onClick={() => {
                void verifyArtisan();
              }}
              className="aa-btn aa-btn-primary"
            >
              {isVerifying ? "Vérification…" : "Vérifier l'artisan"}
            </button>
          )}
        </div>

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

        <dl className="aa-inset mt-8 space-y-2 text-sm">
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Nom du profil</dt>
            <dd>{artisan.profile_name || "Non renseigné"}</dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Téléphone</dt>
            <dd>{artisan.phone || "Non renseigné"}</dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Ville</dt>
            <dd>{artisan.city || "Non renseignée"}</dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Adresse</dt>
            <dd>{artisan.address || "Non renseignée"}</dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Position professionnelle</dt>
            <dd>
              {artisan.has_professional_location
                ? "Enregistrée (carte publique une fois l'artisan vérifié)"
                : "Non renseignée"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Description</dt>
            <dd>{artisan.description || "Non renseignée"}</dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Métiers</dt>
            <dd>
              {artisan.categories.length > 0 ? artisan.categories.join(", ") : "Non renseigné"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Note moyenne</dt>
            <dd>
              {averageRating !== null
                ? `${averageRating.toFixed(1)} / 5 (${reviews.length} avis)`
                : "Aucun avis"}
            </dd>
          </div>
        </dl>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-[var(--aa-ink)]">Services</h2>
          {services.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--aa-ink-soft)]">Aucun service.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {services.map((service) => (
                <li key={service.id} className="aa-card p-4">
                  <p className="font-medium text-[var(--aa-ink)]">{service.name}</p>
                  {service.description ? (
                    <p className="mt-1 text-sm text-[var(--aa-ink-soft)]">{service.description}</p>
                  ) : null}
                  <p className="mt-2 text-sm text-[var(--aa-ink)]">
                    {formatServicePrice(service)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-[var(--aa-ink)]">Demandes</h2>
          {bookings.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--aa-ink-soft)]">Aucune demande.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {bookings.map((booking) => (
                <li key={booking.id} className="aa-card p-4 text-sm">
                  <p className="font-medium text-[var(--aa-ink)]">
                    {STATUS_LABELS[booking.status]}
                  </p>
                  <p className="mt-1 text-[var(--aa-ink)]">
                    Prévue le {formatDateTime(booking.scheduled_at)}
                  </p>
                  <p className="mt-1 text-[var(--aa-ink-soft)]">
                    {booking.address || "Adresse non renseignée"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-[var(--aa-ink)]">Avis</h2>
          {reviews.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--aa-ink-soft)]">Aucun avis.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {reviews.map((review) => (
                <li key={review.id} className="aa-card p-4 text-sm">
                  <p className="font-medium text-[var(--aa-ink)]">{review.rating} / 5</p>
                  {review.comment ? (
                    <p className="mt-1 text-[var(--aa-ink-soft)]">{review.comment}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-[var(--aa-ink-soft)]">
                    {formatDateTime(review.created_at)}
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
