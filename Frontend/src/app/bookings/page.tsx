"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LocationMap } from "@/components/maps/load-maps";
import { bookingIdToString } from "@/lib/bookings/artisan";
import { clientCanCancelStatus, requestBookingCancellation } from "@/lib/bookings/cancel";
import { AnimatedList, AnimatedListItem, EmptyState, MotionAlert, PageSkeleton, StatusTrack } from "@/components/motion";
import { areValidCoordinates, type GeoCoordinates } from "@/lib/geolocation";
import { externalDirectionsUrl } from "@/lib/maps";
import {
  formatMoney,
  isBookingPayableStatus,
  isPriceType,
  latestUsableQuote,
  mapQuote,
  QUOTE_STATUS_LABELS,
  type PriceType,
  type QuoteView,
} from "@/lib/payments/types";

type BookingStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REFUSED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

type PaymentIndication = "PENDING" | "PAID";

type ClientBooking = {
  id: number;
  artisan_id: string;
  artisan_name: string;
  service_name: string;
  price_type: PriceType | null;
  catalogPrice: number | null;
  scheduled_at: string;
  address: string;
  description: string;
  status: BookingStatus;
  created_at: string;
  paymentStatus: PaymentIndication | null;
  paymentAmount: number | null;
  paymentCurrency: string | null;
  hasReview: boolean;
  quote: QuoteView | null;
  coordinates: GeoCoordinates | null;
};

const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: "En attente",
  ACCEPTED: "Acceptée",
  REFUSED: "Refusée",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
};

function isBookingStatus(value: string): value is BookingStatus {
  return value in STATUS_LABELS;
}

function parseBookingId(value: unknown): number | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function isPaymentIndication(value: string): value is PaymentIndication {
  return value === "PENDING" || value === "PAID";
}

function formatAmount(amount: number, currency: string): string {
  return formatMoney(amount, currency);
}

function parseBookingCoordinates(latitude: unknown, longitude: unknown): GeoCoordinates | null {
  const lat = typeof latitude === "number" ? latitude : Number(latitude);
  const lng = typeof longitude === "number" ? longitude : Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !areValidCoordinates(lat, lng)) {
    return null;
  }
  return { latitude: lat, longitude: lng };
}

function statusTone(status: BookingStatus): string {
  if (status === "ACCEPTED" || status === "COMPLETED") {
    return "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";
  }
  if (status === "REFUSED" || status === "CANCELLED") {
    return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  }
  if (status === "IN_PROGRESS") {
    return "bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200";
  }
  return "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200";
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

function workflowHint(booking: ClientBooking): string {
  if (booking.status === "PENDING") {
    return "En attente de l'artisan. Vous pouvez encore annuler.";
  }
  if (booking.status === "REFUSED") {
    return "L'artisan a refusé cette demande.";
  }
  if (booking.status === "CANCELLED") {
    return "Cette demande a été annulée.";
  }
  if (booking.paymentStatus === "PAID") {
    return "Paiement effectué.";
  }
  if (booking.paymentStatus === "PENDING") {
    return "Paiement en préparation.";
  }
  if (booking.status === "IN_PROGRESS") {
    return "Intervention en cours. Vous ne pouvez plus annuler.";
  }
  if (booking.status === "COMPLETED") {
    return "Intervention terminée. Le paiement est disponible si ce n'est pas déjà fait.";
  }

  if (booking.price_type === "FIXED") {
    return "Demande acceptée. Le paiement du prix fixe est disponible.";
  }

  if (booking.quote?.status === "PENDING") {
    return "Un devis est en attente de votre réponse.";
  }
  if (booking.quote?.status === "ACCEPTED") {
    return "Devis accepté. Le paiement est disponible.";
  }
  if (booking.quote?.status === "REFUSED") {
    return "Devis refusé. Aucun paiement n'est possible pour ce devis.";
  }
  if (booking.quote?.status === "CANCELLED") {
    return "Le devis a été annulé.";
  }

  return "Demande acceptée. En attente d'un devis de l'artisan.";
}

export default function ClientBookingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [bookings, setBookings] = useState<ClientBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadBookings() {
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

      const { data: bookingRows, error: bookingsError } = await supabase
        .from("bookings")
        .select(
          "id, client_id, artisan_id, service_id, status, address, description, scheduled_at, created_at, latitude, longitude",
        )
        .eq("client_id", user.id)
        .order("created_at", { ascending: false });

      if (cancelled) {
        return;
      }

      if (bookingsError) {
        setErrorMessage("Impossible de charger vos demandes. Veuillez réessayer.");
        setBookings([]);
        setIsLoading(false);
        return;
      }

      const ownRows = (bookingRows ?? []).filter((row) => row.client_id === user.id);

      const artisanIds = [
        ...new Set(
          ownRows.flatMap((row) => (typeof row.artisan_id === "string" ? [row.artisan_id] : [])),
        ),
      ];
      const serviceIds = [
        ...new Set(
          ownRows.flatMap((row) => {
            const id = bookingIdToString(row.service_id);
            return id ? [id] : [];
          }),
        ),
      ];

      const artisanNames = new Map<string, string>();
      const serviceNames = new Map<string, string>();
      const servicePriceTypes = new Map<string, PriceType>();
      const servicePrices = new Map<string, number>();

      if (artisanIds.length > 0) {
        const { data: artisanRows } = await supabase
          .from("artisans")
          .select("id, business_name")
          .in("id", artisanIds);

        for (const row of artisanRows ?? []) {
          if (typeof row.id === "string" && typeof row.business_name === "string") {
            artisanNames.set(row.id, row.business_name);
          }
        }
      }

      if (cancelled) {
        return;
      }

      if (serviceIds.length > 0) {
        const { data: serviceRows } = await supabase
          .from("services")
          .select("id, name, price_type, price")
          .in("id", serviceIds);

        for (const row of serviceRows ?? []) {
          const id = bookingIdToString(row.id);
          if (id && typeof row.name === "string") {
            serviceNames.set(id, row.name);
          }
          if (id && typeof row.price_type === "string" && isPriceType(row.price_type)) {
            servicePriceTypes.set(id, row.price_type);
          }
          if (id) {
            const price = typeof row.price === "number" ? row.price : Number(row.price);
            if (Number.isFinite(price) && price > 0) {
              servicePrices.set(id, price);
            }
          }
        }
      }

      if (cancelled) {
        return;
      }

      const bookingIds = ownRows.flatMap((row) => {
        const id = parseBookingId(row.id);
        return id === null ? [] : [id];
      });

      const paymentByBookingId = new Map<
        number,
        { status: PaymentIndication; amount: number | null; currency: string }
      >();

      if (bookingIds.length > 0) {
        const { data: paymentRows } = await supabase
          .from("payments")
          .select("booking_id, status, amount, currency")
          .in("booking_id", bookingIds)
          .in("status", ["PENDING", "PAID"]);

        if (cancelled) {
          return;
        }

        for (const paymentRow of paymentRows ?? []) {
          const paymentBookingId = parseBookingId(paymentRow.booking_id);
          if (paymentBookingId === null || typeof paymentRow.status !== "string") {
            continue;
          }
          if (!isPaymentIndication(paymentRow.status)) {
            continue;
          }

          const current = paymentByBookingId.get(paymentBookingId);
          if (current?.status === "PAID") {
            continue;
          }
          const amount =
            typeof paymentRow.amount === "number"
              ? paymentRow.amount
              : Number(paymentRow.amount);
          paymentByBookingId.set(paymentBookingId, {
            status: paymentRow.status,
            amount: Number.isFinite(amount) ? amount : null,
            currency: typeof paymentRow.currency === "string" ? paymentRow.currency : "XOF",
          });
        }
      }

      const quoteByBookingId = new Map<number, QuoteView>();
      if (bookingIds.length > 0) {
        const { data: quoteRows } = await supabase
          .from("booking_quotes")
          .select("id, booking_id, amount, currency, status, description, created_at")
          .in("booking_id", bookingIds)
          .order("created_at", { ascending: false });

        const grouped = new Map<number, QuoteView[]>();
        for (const row of quoteRows ?? []) {
          const mapped = mapQuote(row as Record<string, unknown>);
          const bookingKey = parseBookingId(row.booking_id);
          if (!mapped || bookingKey === null) {
            continue;
          }
          const current = grouped.get(bookingKey) ?? [];
          current.push(mapped);
          grouped.set(bookingKey, current);
        }
        for (const [id, quotes] of grouped) {
          const usable = latestUsableQuote(quotes);
          if (usable) {
            quoteByBookingId.set(id, usable);
          }
        }
      }

      const reviewedBookingIds = new Set<number>();
      if (bookingIds.length > 0) {
        const { data: reviewRows } = await supabase
          .from("reviews")
          .select("booking_id")
          .in("booking_id", bookingIds);

        if (cancelled) {
          return;
        }

        for (const reviewRow of reviewRows ?? []) {
          const reviewBookingId = parseBookingId(reviewRow.booking_id);
          if (reviewBookingId !== null) {
            reviewedBookingIds.add(reviewBookingId);
          }
        }
      }

      setBookings(
        ownRows.flatMap((row) => {
          const id = parseBookingId(row.id);
          if (id === null || typeof row.artisan_id !== "string") {
            return [];
          }
          if (typeof row.status !== "string" || !isBookingStatus(row.status)) {
            return [];
          }

          const serviceId = bookingIdToString(row.service_id);
          const payment = paymentByBookingId.get(id) ?? null;

          return [
            {
              id,
              artisan_id: row.artisan_id,
              artisan_name: artisanNames.get(row.artisan_id) ?? "Artisan",
              service_name: serviceId ? (serviceNames.get(serviceId) ?? "Service") : "Service",
              price_type: serviceId ? (servicePriceTypes.get(serviceId) ?? null) : null,
              catalogPrice: serviceId ? (servicePrices.get(serviceId) ?? null) : null,
              scheduled_at: String(row.scheduled_at ?? ""),
              address: typeof row.address === "string" ? row.address : "",
              description: typeof row.description === "string" ? row.description : "",
              status: row.status,
              created_at: String(row.created_at ?? ""),
              paymentStatus: payment?.status ?? null,
              paymentAmount: payment?.amount ?? null,
              paymentCurrency: payment?.currency ?? null,
              hasReview: reviewedBookingIds.has(id),
              quote: quoteByBookingId.get(id) ?? null,
              coordinates: parseBookingCoordinates(row.latitude, row.longitude),
            } satisfies ClientBooking,
          ];
        }),
      );
      setErrorMessage("");
      setIsLoading(false);
    }

    void loadBookings();

    return () => {
      cancelled = true;
    };
  }, [reloadToken, router, supabase]);

  async function handleCancel(booking: ClientBooking) {
    if (!clientCanCancelStatus(booking.status)) {
      return;
    }

    const confirmed = window.confirm("Voulez-vous vraiment annuler cette demande ?");
    if (!confirmed) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");
    setCancellingId(booking.id);

    try {
      const result = await requestBookingCancellation(supabase, booking.id);
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      setSuccessMessage("La demande a été annulée.");
      setReloadToken((current) => current + 1);
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setCancellingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="aa-page aa-page-center">
        <PageSkeleton label="Chargement de vos demandes…" />
      </div>
    );
  }

  return (
    <div className="aa-page">
      <main className="w-full max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--aa-ink)]">
          Mes demandes
        </h1>
        <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
          Suivez l&apos;état de vos demandes d&apos;intervention.
        </p>

        {errorMessage ? (
          <MotionAlert tone="error" message={errorMessage} className="mt-6" />
        ) : null}
        {successMessage ? (
          <MotionAlert tone="success" message={successMessage} className="mt-6" />
        ) : null}

        {!errorMessage && bookings.length === 0 ? (
          <EmptyState className="mt-8" title="Aucune demande pour le moment">
            <p className="text-sm text-[var(--aa-ink-soft)]">
              Vous n&apos;avez encore aucune demande d&apos;intervention.
            </p>
            <Link
              href="/artisans"
              className="aa-btn aa-btn-primary mt-4"
            >
              Trouver un artisan
            </Link>
          </EmptyState>
        ) : null}

        {bookings.length > 0 ? (
          <AnimatedList className="mt-8 flex flex-col gap-4">
            {bookings.map((booking, index) => (
              <AnimatedListItem
                key={booking.id}
                index={index}
                className="aa-card aa-card-hover p-4 sm:p-5"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--aa-ink)]">
                      {booking.artisan_name}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--aa-ink)]">
                      {booking.service_name}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`rounded-full px-3 py-1 text-sm font-medium ${statusTone(booking.status)}`}>
                      {STATUS_LABELS[booking.status]}
                    </p>
                    {booking.paymentStatus === "PENDING" ? (
                      <p className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        Paiement en attente
                      </p>
                    ) : null}
                    {booking.quote ? (
                      <p className="aa-chip bg-[color-mix(in_srgb,var(--aa-ink)_8%,transparent)] text-[var(--aa-ink)]">
                        Devis {QUOTE_STATUS_LABELS[booking.quote.status].toLowerCase()}
                      </p>
                    ) : null}
                    {booking.paymentStatus === "PAID" ? (
                      <p className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                        Paiement effectué
                      </p>
                    ) : null}
                  </div>
                </div>

                <StatusTrack status={booking.status} />

                <p className="mt-3 text-sm text-[var(--aa-ink-soft)]">{workflowHint(booking)}</p>

                <dl className="aa-inset mt-4 grid gap-3 text-sm text-[var(--aa-ink)] sm:grid-cols-2">
                  <div>
                    <dt className="font-medium text-[var(--aa-ink-soft)]">Date</dt>
                    <dd>{formatDateTime(booking.scheduled_at)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-[var(--aa-ink-soft)]">Adresse</dt>
                    <dd>{booking.address || "Non renseignée"}</dd>
                  </div>
                  {booking.quote && booking.paymentAmount === null ? (
                    <div>
                      <dt className="font-medium text-[var(--aa-ink-soft)]">Devis</dt>
                      <dd>
                        {QUOTE_STATUS_LABELS[booking.quote.status]} ·{" "}
                        {formatAmount(booking.quote.amount, booking.quote.currency)}
                      </dd>
                    </div>
                  ) : null}
                  {isBookingPayableStatus(booking.status) &&
                  booking.price_type === "FIXED" &&
                  booking.catalogPrice !== null &&
                  booking.paymentAmount === null ? (
                    <div>
                      <dt className="font-medium text-[var(--aa-ink-soft)]">Prix fixe</dt>
                      <dd>{formatAmount(booking.catalogPrice, "XOF")}</dd>
                    </div>
                  ) : null}
                  {booking.paymentAmount !== null && booking.paymentCurrency ? (
                    <div>
                      <dt className="font-medium text-[var(--aa-ink-soft)]">Montant</dt>
                      <dd>{formatAmount(booking.paymentAmount, booking.paymentCurrency)}</dd>
                    </div>
                  ) : null}
                  <div className="sm:col-span-2">
                    <dt className="font-medium text-[var(--aa-ink-soft)]">Description</dt>
                    <dd>{booking.description || "Non renseignée"}</dd>
                  </div>
                </dl>

                {booking.coordinates ? (
                  <div className="mt-4">
                    <p className="text-sm font-medium text-[var(--aa-ink-soft)]">
                      Localisation de l&apos;intervention
                    </p>
                    <div className="mt-2">
                      <LocationMap
                        coordinates={booking.coordinates}
                        popupLabel="Votre rendez-vous"
                      />
                    </div>
                    <a
                      href={externalDirectionsUrl(booking.coordinates)}
                      target="_blank"
                      rel="noopener noreferrer"
                    className="aa-btn aa-btn-ghost mt-3"
                    >
                      Ouvrir l&apos;itinéraire
                    </a>
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/bookings/${booking.id}/messages`}
                    className="aa-btn aa-btn-ghost"
                  >
                    Voir les messages
                  </Link>
                  {isBookingPayableStatus(booking.status) && booking.paymentStatus ? (
                    <Link
                      href={`/bookings/${booking.id}/payment`}
                      className="aa-btn aa-btn-ghost"
                    >
                      Voir le paiement
                    </Link>
                  ) : null}
                  {isBookingPayableStatus(booking.status) &&
                  !booking.paymentStatus &&
                  (booking.price_type === "FIXED" || booking.quote?.status === "ACCEPTED") ? (
                    <Link
                      href={`/bookings/${booking.id}/payment`}
                      className="aa-btn aa-btn-primary"
                    >
                      Payer
                    </Link>
                  ) : null}
                  {isBookingPayableStatus(booking.status) &&
                  !booking.paymentStatus &&
                  booking.price_type !== "FIXED" &&
                  booking.quote?.status !== "ACCEPTED" &&
                  booking.quote?.status !== "REFUSED" ? (
                    <Link
                      href={`/bookings/${booking.id}/payment`}
                      className="aa-btn aa-btn-primary"
                    >
                      {booking.quote?.status === "PENDING" ? "Répondre au devis" : "Voir le devis"}
                    </Link>
                  ) : null}
                  {booking.status === "COMPLETED" && !booking.hasReview ? (
                    <Link
                      href={`/bookings/${booking.id}/review`}
                      className="aa-btn aa-btn-primary"
                    >
                      Laisser un avis
                    </Link>
                  ) : null}
                  {clientCanCancelStatus(booking.status) ? (
                    <button
                      type="button"
                      disabled={cancellingId === booking.id}
                      onClick={() => {
                        void handleCancel(booking);
                      }}
                      className="aa-btn aa-btn-danger"
                    >
                      {cancellingId === booking.id ? "Annulation…" : "Annuler"}
                    </button>
                  ) : null}
                  <Link
                    href={`/artisans/${booking.artisan_id}`}
                    className="aa-btn aa-btn-ghost"
                  >
                    Voir la fiche artisan
                  </Link>
                </div>
              </AnimatedListItem>
            ))}
          </AnimatedList>
        ) : null}
      </main>
    </div>
  );
}
