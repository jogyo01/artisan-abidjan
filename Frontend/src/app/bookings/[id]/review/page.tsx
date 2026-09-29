"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { bookingIdToString } from "@/lib/bookings/artisan";
import { toCategoryWriteValue } from "@/lib/artisan/categories";
import { MotionAlert, PageSkeleton, SlideUp } from "@/components/motion";

type ReviewBooking = {
  id: string;
  artisan_id: string;
  artisan_name: string;
  service_name: string;
  scheduled_at: string;
};

const inputClassName = "aa-input";

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

function reviewErrorMessage(errorMessage: string): string {
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes("duplicate") || normalized.includes("unique")) {
    return "Un avis a déjà été laissé pour cette intervention.";
  }
  if (normalized.includes("row-level security") || normalized.includes("permission")) {
    return "Vous n'avez pas l'autorisation de laisser cet avis.";
  }
  if (normalized.includes("jwt") || normalized.includes("not authenticated")) {
    return "Votre session a expiré. Veuillez vous reconnecter.";
  }

  return "Impossible d'enregistrer l'avis. Veuillez réessayer.";
}

export default function BookingReviewPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const bookingId = typeof params.id === "string" ? params.id : "";
  const supabase = useMemo(() => createClient(), []);

  const [booking, setBooking] = useState<ReviewBooking | null>(null);
  const [alreadyReviewed, setAlreadyReviewed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notAllowed, setNotAllowed] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isCreated, setIsCreated] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadReviewPage() {
      if (!bookingId) {
        await Promise.resolve();
        if (!cancelled) {
          setNotAllowed(true);
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

      const { data: bookingRow, error: bookingError } = await supabase
        .from("bookings")
        .select("id, client_id, artisan_id, service_id, status, scheduled_at")
        .eq("id", bookingId)
        .eq("client_id", user.id)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (bookingError) {
        setErrorMessage("Impossible de charger cette intervention.");
        setIsLoading(false);
        return;
      }

      if (!bookingRow || bookingRow.client_id !== user.id) {
        setNotAllowed(true);
        setIsLoading(false);
        return;
      }

      const bookingRowId = bookingIdToString(bookingRow.id);
      const artisanId =
        typeof bookingRow.artisan_id === "string" ? bookingRow.artisan_id : bookingIdToString(bookingRow.artisan_id);

      if (!bookingRowId || !artisanId) {
        setNotAllowed(true);
        setIsLoading(false);
        return;
      }

      if (bookingRow.status !== "COMPLETED") {
        setNotAllowed(true);
        setIsLoading(false);
        return;
      }

      const serviceId = bookingIdToString(bookingRow.service_id);
      const [{ data: artisanRow }, { data: serviceRow }, { data: existingReview }] =
        await Promise.all([
          supabase
            .from("artisans")
            .select("id, business_name")
            .eq("id", artisanId)
            .maybeSingle(),
          serviceId
            ? supabase
                .from("services")
                .select("id, name")
                .eq("id", toCategoryWriteValue(serviceId))
                .maybeSingle()
            : Promise.resolve({ data: null }),
          supabase
            .from("reviews")
            .select("id")
            .eq("booking_id", toCategoryWriteValue(bookingRowId))
            .eq("client_id", user.id)
            .maybeSingle(),
        ]);

      if (cancelled) {
        return;
      }

      setBooking({
        id: bookingRowId,
        artisan_id: artisanId,
        artisan_name:
          typeof artisanRow?.business_name === "string"
            ? artisanRow.business_name
            : "Artisan",
        service_name: typeof serviceRow?.name === "string" ? serviceRow.name : "Service",
        scheduled_at: String(bookingRow.scheduled_at ?? ""),
      });
      setAlreadyReviewed(Boolean(existingReview?.id));
      setIsLoading(false);
    }

    void loadReviewPage();

    return () => {
      cancelled = true;
    };
  }, [bookingId, router, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!booking) {
      return;
    }

    if (rating < 1 || rating > 5) {
      setErrorMessage("Veuillez choisir une note de 1 à 5.");
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/auth");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: bookingRow, error: bookingError } = await supabase
        .from("bookings")
        .select("id, client_id, artisan_id, status")
        .eq("id", booking.id)
        .eq("client_id", user.id)
        .maybeSingle();

      if (
        bookingError ||
        !bookingRow ||
        bookingRow.client_id !== user.id ||
        bookingRow.status !== "COMPLETED" ||
        bookingRow.artisan_id !== booking.artisan_id
      ) {
        setErrorMessage("Vous ne pouvez laisser un avis que pour une intervention terminée.");
        return;
      }

      const trimmedComment = comment.trim();

      const { error } = await supabase.from("reviews").insert({
        booking_id: toCategoryWriteValue(booking.id),
        client_id: user.id,
        artisan_id: booking.artisan_id,
        rating,
        comment: trimmedComment === "" ? null : trimmedComment,
      });

      if (error) {
        setErrorMessage(reviewErrorMessage(error.message));
        if (error.message.toLowerCase().includes("duplicate") || error.message.toLowerCase().includes("unique")) {
          setAlreadyReviewed(true);
        }
        return;
      }

      setIsCreated(true);
      setAlreadyReviewed(true);
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="aa-page aa-page-center">
        <PageSkeleton label="Chargement…" />
      </div>
    );
  }

  if (notAllowed || !booking) {
    return (
      <div className="aa-page aa-page-center">
        <main className="w-full max-w-lg aa-card p-6 text-center sm:p-8">
          <h1 className="text-xl font-semibold text-[var(--aa-ink)]">
            Avis impossible
          </h1>
          <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
            Cette intervention n&apos;existe pas, ne vous appartient pas, ou n&apos;est pas encore
            terminée. Un avis n&apos;est possible que pour une intervention terminée.
          </p>
          <Link
            href="/bookings"
            className="aa-btn aa-btn-ghost mt-6"
          >
            Retour à mes demandes
          </Link>
        </main>
      </div>
    );
  }

  if (isCreated) {
    return (
      <div className="aa-page aa-page-center">
        <main className="w-full max-w-lg aa-card p-6 text-center sm:p-8">
          <h1 className="text-xl font-semibold text-[var(--aa-ink)]">Avis envoyé</h1>
          <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
            Merci. Votre avis sur {booking.artisan_name} a bien été enregistré.
          </p>
          <Link
            href="/bookings"
            className="aa-btn aa-btn-primary mt-6"
          >
            Retour à mes demandes
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="aa-page">
      <main className="w-full max-w-lg aa-card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--aa-ink)]">
          Laisser un avis
        </h1>
        <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
          Donnez votre avis après l&apos;intervention.
        </p>

        <dl className="mt-6 aa-inset space-y-3 text-sm">
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Artisan</dt>
            <dd className="mt-0.5 text-[var(--aa-ink)]">{booking.artisan_name}</dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Service</dt>
            <dd className="mt-0.5 text-[var(--aa-ink)]">{booking.service_name}</dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Date de l&apos;intervention</dt>
            <dd className="mt-0.5 text-[var(--aa-ink)]">
              {formatDateTime(booking.scheduled_at)}
            </dd>
          </div>
        </dl>

        {alreadyReviewed ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            Un avis a déjà été laissé pour cette intervention.
          </p>
        ) : (
          <SlideUp>
          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
            <fieldset>
              <legend className="text-sm font-medium text-[var(--aa-ink)]">
                Note
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    className={`min-h-11 min-w-12 rounded-xl border px-3 py-3 text-base font-semibold ${
                      rating >= value
                        ? "border-[var(--aa-terracotta)] bg-[var(--aa-terracotta)] text-[#fffaf4]"
                        : "border-[color-mix(in_srgb,var(--aa-ink)_18%,transparent)] text-[var(--aa-ink)]"
                    }`}
                    aria-label={`${value} étoile${value > 1 ? "s" : ""}`}
                    aria-pressed={rating === value}
                  >
                    {value}★
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
              Commentaire (facultatif)
              <textarea
                name="comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                className={`${inputClassName} min-h-28`}
                placeholder="Partagez votre expérience"
              />
            </label>

            {errorMessage ? <MotionAlert tone="error" message={errorMessage} /> : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="aa-btn aa-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Envoi…" : "Publier l'avis"}
            </button>
          </form>
          </SlideUp>
        )}

        {alreadyReviewed && errorMessage ? (
          <MotionAlert tone="error" message={errorMessage} className="mt-4" />
        ) : null}

        <Link
          href="/bookings"
          className="aa-back mt-6"
        >
          Retour à mes demandes
        </Link>
      </main>
    </div>
  );
}
