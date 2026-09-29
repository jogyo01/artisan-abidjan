"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArtisanBookingActions, canApplyTransition } from "@/components/artisan/ArtisanBookingActions";
import { loadArtisanSession } from "@/lib/artisan/session";
import {
  BOOKING_STATUS_LABELS,
  bookingStatusTone,
  formatBookingDateTime,
  successLabel,
  type AllowedNextStatus,
} from "@/lib/bookings/artisan";
import { loadArtisanBookings, type ArtisanBooking } from "@/lib/bookings/load-artisan-bookings";
import { AnimatedList, AnimatedListItem, EmptyState, MotionAlert, PageSkeleton, StatusTrack } from "@/components/motion";
import { artisanCanCancelStatus, requestBookingCancellation } from "@/lib/bookings/cancel";
import { createClient } from "@/lib/supabase/client";
import { QUOTE_STATUS_LABELS } from "@/lib/payments/types";

const SECTIONS: { key: ArtisanBooking["status"]; title: string }[] = [
  { key: "PENDING", title: "Nouvelles demandes" },
  { key: "ACCEPTED", title: "Acceptées" },
  { key: "IN_PROGRESS", title: "En cours" },
  { key: "COMPLETED", title: "Terminées" },
  { key: "REFUSED", title: "Refusées" },
  { key: "CANCELLED", title: "Annulées" },
];

export default function ArtisanBookingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [bookings, setBookings] = useState<ArtisanBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const refresh = useCallback(async () => {
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
      router.replace("/artisan/onboarding");
      return;
    }

    const result = await loadArtisanBookings(supabase, session.userId);
    if (result.error) {
      setErrorMessage("Impossible de charger les demandes. Veuillez réessayer.");
      setBookings([]);
    } else {
      setBookings(result.bookings);
    }
  }, [router, supabase]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      await refresh();
      if (!cancelled) {
        setIsLoading(false);
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function updateStatus(booking: ArtisanBooking, nextStatus: AllowedNextStatus) {
    setErrorMessage("");
    setSuccessMessage("");

    if (!canApplyTransition(booking.status, nextStatus)) {
      setErrorMessage("Cette action n'est pas autorisée pour le statut actuel.");
      return;
    }

    const session = await loadArtisanSession(supabase);
    if (session.kind !== "ok") {
      router.replace("/auth");
      return;
    }

    setUpdatingId(booking.id);

    try {
      const { data, error } = await supabase
        .from("bookings")
        .update({ status: nextStatus })
        .eq("id", booking.id)
        .eq("artisan_id", session.userId)
        .eq("status", booking.status)
        .select("id, status")
        .maybeSingle();

      if (error || !data || data.status !== nextStatus) {
        setErrorMessage("Impossible de mettre à jour cette demande.");
        return;
      }

      await refresh();
      setSuccessMessage(successLabel(nextStatus));
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function cancelBooking(booking: ArtisanBooking) {
    setErrorMessage("");
    setSuccessMessage("");

    if (!artisanCanCancelStatus(booking.status)) {
      setErrorMessage("Cette demande ne peut pas être annulée.");
      return;
    }

    const session = await loadArtisanSession(supabase);
    if (session.kind !== "ok") {
      router.replace("/auth");
      return;
    }

    setUpdatingId(booking.id);

    try {
      const result = await requestBookingCancellation(supabase, booking.id);
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      await refresh();
      setSuccessMessage("Demande annulée.");
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setUpdatingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="aa-page aa-page-center">
        <PageSkeleton label="Chargement des demandes…" />
      </div>
    );
  }

  return (
    <div className="aa-page">
      <main className="w-full max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--aa-ink)]">
          Demandes reçues
        </h1>
        <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
          Consultez et traitez les demandes selon leur statut. L&apos;historique terminé est en lecture
          seule.
        </p>

        {errorMessage ? (
          <MotionAlert tone="error" message={errorMessage} className="mt-6" />
        ) : null}
        {successMessage ? (
          <MotionAlert tone="success" message={successMessage} className="mt-6" />
        ) : null}

        {!errorMessage && bookings.length === 0 ? (
          <EmptyState className="mt-8" title="Aucune demande pour le moment">
            <p className="text-sm">
              Les nouvelles demandes des clients apparaîtront ici.
            </p>
          </EmptyState>
        ) : null}

        {bookings.length > 0
          ? SECTIONS.map((section) => {
          const items = bookings.filter((booking) => booking.status === section.key);

          return (
            <section key={section.key} className="mt-8">
              <h2 className="text-lg font-semibold text-[var(--aa-ink)]">{section.title}</h2>
              {items.length === 0 ? (
                <p className="aa-empty mt-3">Aucune demande dans cette section.</p>
              ) : (
              <AnimatedList className="mt-3 flex flex-col gap-4">
                {items.map((booking, index) => (
                  <AnimatedListItem
                    key={booking.id}
                    index={index}
                    className="aa-card aa-card-hover p-4"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-[var(--aa-ink)]">
                          {booking.service_name}
                        </h3>
                        <p className="mt-1 text-sm text-[var(--aa-ink)]">
                          Client : {booking.client_name}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-sm font-medium ${bookingStatusTone(booking.status)}`}
                      >
                        {BOOKING_STATUS_LABELS[booking.status]}
                      </span>
                    </div>
                    <StatusTrack status={booking.status} />
                    <dl className="mt-4 space-y-2 text-sm text-[var(--aa-ink)]">
                      <div>
                        <dt className="font-medium text-[var(--aa-ink-soft)]">Description</dt>
                        <dd>{booking.description || "Non renseignée"}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-[var(--aa-ink-soft)]">Adresse</dt>
                        <dd>{booking.address || "Non renseignée"}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-[var(--aa-ink-soft)]">Date</dt>
                        <dd>{formatBookingDateTime(booking.scheduled_at)}</dd>
                      </div>
                      {booking.latitude !== null && booking.longitude !== null ? (
                        <div>
                          <dt className="font-medium text-[var(--aa-ink-soft)]">Localisation</dt>
                          <dd>Coordonnées d&apos;intervention enregistrées</dd>
                        </div>
                      ) : null}
                      {booking.quote ? (
                        <div>
                          <dt className="font-medium text-[var(--aa-ink-soft)]">Devis</dt>
                          <dd>
                            {QUOTE_STATUS_LABELS[booking.quote.status]} ·{" "}
                            {new Intl.NumberFormat("fr-FR").format(booking.quote.amount)}{" "}
                            {booking.quote.currency}
                          </dd>
                        </div>
                      ) : (booking.price_type === "STARTING_FROM" || booking.price_type === "ON_QUOTE") &&
                        booking.status === "ACCEPTED" ? (
                        <div>
                          <dt className="font-medium text-[var(--aa-ink-soft)]">Devis</dt>
                          <dd>À proposer</dd>
                        </div>
                      ) : null}
                      {booking.status === "COMPLETED" &&
                      booking.paymentAmount !== null &&
                      booking.paymentCurrency ? (
                        <div>
                          <dt className="font-medium text-[var(--aa-ink-soft)]">Paiement</dt>
                          <dd>
                            {new Intl.NumberFormat("fr-FR").format(booking.paymentAmount)}{" "}
                            {booking.paymentCurrency}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/artisan/bookings/${booking.id}`}
                        className="aa-btn aa-btn-ghost"
                      >
                        Voir le détail
                      </Link>
                      <Link
                        href={`/bookings/${booking.id}/messages`}
                        className="aa-btn aa-btn-ghost"
                      >
                        Messages
                      </Link>
                    </div>
                    {booking.status === "COMPLETED" ||
                    booking.status === "CANCELLED" ||
                    booking.status === "REFUSED" ? null : (
                      <ArtisanBookingActions
                        booking={booking}
                        updatingId={updatingId}
                        onUpdate={(current, nextStatus) => {
                          void updateStatus(current as ArtisanBooking, nextStatus);
                        }}
                        onCancel={(current) => {
                          void cancelBooking(current as ArtisanBooking);
                        }}
                      />
                    )}
                  </AnimatedListItem>
                ))}
              </AnimatedList>
              )}
            </section>
          );
        })
          : null}
      </main>
    </div>
  );
}
