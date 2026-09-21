"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
  return `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`;
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
        .select("id, business_name, description, address, city, phone, is_verified, is_available")
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

    const categoryIds = (linksResult.data ?? []).flatMap((link) =>
      typeof link.category_id === "string" ? [link.category_id] : [],
    );
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
        categories: categoryNames,
      },
      services: (servicesResult.data ?? []).flatMap((service) => {
        if (typeof service.id !== "string" || typeof service.name !== "string") {
          return [];
        }
        if (!isPriceType(String(service.price_type))) {
          return [];
        }
        return [
          {
            id: service.id,
            name: service.name,
            description: typeof service.description === "string" ? service.description : null,
            price: typeof service.price === "number" ? service.price : null,
            price_type: service.price_type,
          } satisfies AdminService,
        ];
      }),
      bookings: (bookingsResult.data ?? []).flatMap((booking) => {
        if (typeof booking.id !== "string" || typeof booking.status !== "string") {
          return [];
        }
        if (!isBookingStatus(booking.status)) {
          return [];
        }
        return [
          {
            id: booking.id,
            status: booking.status,
            scheduled_at: String(booking.scheduled_at ?? ""),
            address: typeof booking.address === "string" ? booking.address : "",
            created_at: String(booking.created_at ?? ""),
          } satisfies AdminBooking,
        ];
      }),
      reviews: (reviewsResult.data ?? []).flatMap((review) => {
        if (typeof review.id !== "string" || typeof review.rating !== "number") {
          return [];
        }
        return [
          {
            id: review.id,
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

    setIsVerifying(true);

    try {
      const { data, error } = await supabase
        .from("artisans")
        .update({ is_verified: true })
        .eq("id", artisan.id)
        .select("id, is_verified")
        .maybeSingle();

      if (error || !data || data.is_verified !== true) {
        setErrorMessage("Impossible de vérifier cet artisan.");
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
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Chargement du détail artisan…</p>
      </div>
    );
  }

  if (notFound || !artisan) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <main className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            Artisan introuvable
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Cet artisan n&apos;existe pas.
          </p>
          <Link
            href="/admin/artisans"
            className="mt-6 inline-flex rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 dark:border-zinc-700 dark:text-zinc-200"
          >
            Retour à la liste
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <main className="w-full max-w-4xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <Link
          href="/admin/artisans"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← Retour à la liste
        </Link>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              {artisan.business_name}
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
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
              className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
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

        <dl className="mt-8 space-y-2 rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-900">
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">Nom du profil</dt>
            <dd>{artisan.profile_name || "Non renseigné"}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">Téléphone</dt>
            <dd>{artisan.phone || "Non renseigné"}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">Ville</dt>
            <dd>{artisan.city || "Non renseignée"}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">Adresse</dt>
            <dd>{artisan.address || "Non renseignée"}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">Description</dt>
            <dd>{artisan.description || "Non renseignée"}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">Métiers</dt>
            <dd>
              {artisan.categories.length > 0 ? artisan.categories.join(", ") : "Non renseigné"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">Note moyenne</dt>
            <dd>
              {averageRating !== null
                ? `${averageRating.toFixed(1)} / 5 (${reviews.length} avis)`
                : "Aucun avis"}
            </dd>
          </div>
        </dl>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Services</h2>
          {services.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Aucun service.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {services.map((service) => (
                <li key={service.id} className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                  <p className="font-medium text-zinc-950 dark:text-zinc-50">{service.name}</p>
                  {service.description ? (
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{service.description}</p>
                  ) : null}
                  <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                    {formatServicePrice(service)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Réservations</h2>
          {bookings.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Aucune réservation.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {bookings.map((booking) => (
                <li key={booking.id} className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
                  <p className="font-medium text-zinc-950 dark:text-zinc-50">
                    {STATUS_LABELS[booking.status]}
                  </p>
                  <p className="mt-1 text-zinc-700 dark:text-zinc-300">
                    Prévue le {formatDateTime(booking.scheduled_at)}
                  </p>
                  <p className="mt-1 text-zinc-600 dark:text-zinc-400">
                    {booking.address || "Adresse non renseignée"}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Avis</h2>
          {reviews.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">Aucun avis.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {reviews.map((review) => (
                <li key={review.id} className="rounded-xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
                  <p className="font-medium text-zinc-950 dark:text-zinc-50">{review.rating} / 5</p>
                  {review.comment ? (
                    <p className="mt-1 text-zinc-600 dark:text-zinc-400">{review.comment}</p>
                  ) : null}
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
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
