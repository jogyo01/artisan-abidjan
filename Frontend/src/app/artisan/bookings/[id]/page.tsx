"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArtisanBookingActions, canApplyTransition } from "@/components/artisan/ArtisanBookingActions";
import { LocationMap } from "@/components/maps/load-maps";
import { MotionAlert, PageSkeleton, StatusTrack } from "@/components/motion";
import { loadArtisanSession } from "@/lib/artisan/session";
import {
  BOOKING_STATUS_LABELS,
  bookingStatusTone,
  formatBookingDateTime,
  successLabel,
  type AllowedNextStatus,
} from "@/lib/bookings/artisan";
import { loadArtisanBookings, type ArtisanBooking } from "@/lib/bookings/load-artisan-bookings";
import { artisanCanCancelStatus, requestBookingCancellation } from "@/lib/bookings/cancel";
import { createClient } from "@/lib/supabase/client";
import { ArtisanQuotePanel } from "@/components/artisan/ArtisanQuotePanel";
import { externalDirectionsUrl } from "@/lib/maps";

export default function ArtisanBookingDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const bookingId = typeof params.id === "string" ? params.id : "";
  const supabase = useMemo(() => createClient(), []);

  const [booking, setBooking] = useState<ArtisanBooking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
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
      setErrorMessage("Impossible de charger cette demande.");
      setBooking(null);
      return;
    }

    const found = result.bookings.find((item) => item.id === bookingId);
    if (!found) {
      setNotFound(true);
      setBooking(null);
      return;
    }

    setNotFound(false);
    setBooking(found);
  }, [bookingId, router, supabase]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!bookingId) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      await refresh();
      if (!cancelled) {
        setIsLoading(false);
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [bookingId, refresh]);

  async function updateStatus(current: ArtisanBooking, nextStatus: AllowedNextStatus) {
    setErrorMessage("");
    setSuccessMessage("");

    if (!canApplyTransition(current.status, nextStatus)) {
      setErrorMessage("Cette action n'est pas autorisée pour le statut actuel.");
      return;
    }

    const session = await loadArtisanSession(supabase);
    if (session.kind !== "ok") {
      router.replace("/auth");
      return;
    }

    setUpdatingId(current.id);

    try {
      const { data, error } = await supabase
        .from("bookings")
        .update({ status: nextStatus })
        .eq("id", current.id)
        .eq("artisan_id", session.userId)
        .eq("status", current.status)
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

  async function cancelBooking(current: ArtisanBooking) {
    setErrorMessage("");
    setSuccessMessage("");

    if (!artisanCanCancelStatus(current.status)) {
      setErrorMessage("Cette demande ne peut pas être annulée.");
      return;
    }

    const session = await loadArtisanSession(supabase);
    if (session.kind !== "ok") {
      router.replace("/auth");
      return;
    }

    setUpdatingId(current.id);

    try {
      const result = await requestBookingCancellation(supabase, current.id);
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
        <PageSkeleton label="Chargement de la demande…" />
      </div>
    );
  }

  if (notFound || !booking) {
    return (
      <div className="aa-page aa-page-center">
        <main className="w-full max-w-lg aa-card p-6 text-center">
          <h1 className="text-xl font-semibold text-[var(--aa-ink)]">Demande introuvable</h1>
          <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
            Cette demande n&apos;existe pas ou ne vous est pas destinée.
          </p>
          <Link
            href="/artisan/bookings"
            className="aa-btn aa-btn-ghost mt-6"
          >
            Retour aux demandes
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="aa-page">
      <main className="w-full max-w-lg aa-card p-6 sm:p-8">
        <Link
          href="/artisan/bookings"
          className="aa-back"
        >
          ← Retour aux demandes
        </Link>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-[var(--aa-ink)]">
            {booking.service_name}
          </h1>
          <span className={`aa-chip ${bookingStatusTone(booking.status)}`}>
            {BOOKING_STATUS_LABELS[booking.status]}
          </span>
        </div>
        <StatusTrack status={booking.status} />

        {errorMessage ? <MotionAlert tone="error" message={errorMessage} className="mt-4" /> : null}
        {successMessage ? <MotionAlert tone="success" message={successMessage} className="mt-4" /> : null}

        <dl className="mt-6 aa-inset space-y-3 text-sm">
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Client</dt>
            <dd className="mt-0.5 text-[var(--aa-ink)]">{booking.client_name}</dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Demande</dt>
            <dd className="mt-0.5 text-[var(--aa-ink)]">
              {booking.description || "Non renseignée"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Adresse</dt>
            <dd className="mt-0.5 text-[var(--aa-ink)]">
              {booking.address || "Non renseignée"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Date</dt>
            <dd className="mt-0.5 text-[var(--aa-ink)]">
              {formatBookingDateTime(booking.scheduled_at)}
            </dd>
          </div>
          {booking.latitude !== null && booking.longitude !== null ? (
            <div>
              <dt className="font-medium text-[var(--aa-ink-soft)]">Localisation de l&apos;intervention</dt>
              <dd className="mt-2">
                <LocationMap
                  coordinates={{
                    latitude: booking.latitude,
                    longitude: booking.longitude,
                  }}
                  popupLabel="Lieu d'intervention"
                />
                <a
                  href={externalDirectionsUrl({
                    latitude: booking.latitude,
                    longitude: booking.longitude,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="aa-btn aa-btn-ghost mt-3"
                >
                  Voir l&apos;itinéraire
                </a>
              </dd>
            </div>
          ) : (
            <div>
              <dt className="font-medium text-[var(--aa-ink-soft)]">Localisation de l&apos;intervention</dt>
              <dd className="mt-0.5 text-[var(--aa-ink)]">Non renseignée</dd>
            </div>
          )}
          {booking.paymentAmount !== null && booking.paymentCurrency ? (
            <div>
              <dt className="font-medium text-[var(--aa-ink-soft)]">Paiement</dt>
              <dd className="mt-0.5 text-[var(--aa-ink)]">
                {new Intl.NumberFormat("fr-FR").format(booking.paymentAmount)} {booking.paymentCurrency}
              </dd>
            </div>
          ) : null}
        </dl>

        <ArtisanQuotePanel
          bookingId={booking.id}
          bookingStatus={booking.status}
          priceType={booking.price_type}
          quote={booking.quote}
          hasActivePayment={booking.paymentAmount !== null}
          onUpdated={refresh}
        />

        <div className="mt-6">
          <Link
            href={`/bookings/${booking.id}/messages`}
            className="aa-btn aa-btn-ghost"
          >
            Messages
          </Link>
        </div>

        {booking.status === "COMPLETED" ? (
          <p className="mt-6 text-sm text-[var(--aa-ink-soft)]">
            Cette intervention est terminée. Elle ne peut plus être modifiée.
          </p>
        ) : booking.status === "CANCELLED" ? (
          <p className="mt-6 text-sm text-[var(--aa-ink-soft)]">
            Cette demande est annulée. Elle ne peut plus être modifiée.
          </p>
        ) : booking.status === "REFUSED" ? (
          <p className="mt-6 text-sm text-[var(--aa-ink-soft)]">
            Cette demande a été refusée.
          </p>
        ) : (
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
      </main>
    </div>
  );
}
