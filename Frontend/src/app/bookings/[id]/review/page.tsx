"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ReviewBooking = {
  id: string;
  artisan_id: string;
  artisan_name: string;
  service_name: string;
  scheduled_at: string;
};

const inputClassName =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-950 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

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

      if (
        !bookingRow ||
        bookingRow.client_id !== user.id ||
        typeof bookingRow.id !== "string" ||
        typeof bookingRow.artisan_id !== "string"
      ) {
        setNotAllowed(true);
        setIsLoading(false);
        return;
      }

      if (bookingRow.status !== "COMPLETED") {
        setNotAllowed(true);
        setIsLoading(false);
        return;
      }

      const [{ data: artisanRow }, { data: serviceRow }, { data: existingReview }] =
        await Promise.all([
          supabase
            .from("artisans")
            .select("id, business_name")
            .eq("id", bookingRow.artisan_id)
            .maybeSingle(),
          typeof bookingRow.service_id === "string"
            ? supabase
                .from("services")
                .select("id, name")
                .eq("id", bookingRow.service_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          supabase
            .from("reviews")
            .select("id")
            .eq("booking_id", bookingRow.id)
            .eq("client_id", user.id)
            .maybeSingle(),
        ]);

      if (cancelled) {
        return;
      }

      setBooking({
        id: bookingRow.id,
        artisan_id: bookingRow.artisan_id,
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
        booking_id: booking.id,
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
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Chargement…</p>
      </div>
    );
  }

  if (notAllowed || !booking) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <main className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            Avis impossible
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Cette intervention n&apos;existe pas, ne vous appartient pas, ou n&apos;est pas encore
            terminée.
          </p>
          <Link
            href="/bookings"
            className="mt-6 inline-flex rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Retour à mes demandes
          </Link>
        </main>
      </div>
    );
  }

  if (isCreated) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <main className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">Avis envoyé</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Merci. Votre avis sur {booking.artisan_name} a bien été enregistré.
          </p>
          <Link
            href="/bookings"
            className="mt-6 inline-flex rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Retour à mes demandes
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <main className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Laisser un avis
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Donnez votre avis après l&apos;intervention.
        </p>

        <dl className="mt-6 space-y-3 rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-900">
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">Artisan</dt>
            <dd className="mt-0.5 text-zinc-950 dark:text-zinc-50">{booking.artisan_name}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">Service</dt>
            <dd className="mt-0.5 text-zinc-950 dark:text-zinc-50">{booking.service_name}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">Date de l&apos;intervention</dt>
            <dd className="mt-0.5 text-zinc-950 dark:text-zinc-50">
              {formatDateTime(booking.scheduled_at)}
            </dd>
          </div>
        </dl>

        {alreadyReviewed ? (
          <p className="mt-6 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            Un avis a déjà été laissé pour cette intervention.
          </p>
        ) : (
          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
            <fieldset>
              <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Note
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                      rating >= value
                        ? "border-zinc-950 bg-zinc-950 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
                        : "border-zinc-200 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                    }`}
                    aria-label={`${value} étoile${value > 1 ? "s" : ""}`}
                  >
                    {value} ★
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Commentaire (facultatif)
              <textarea
                name="comment"
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                className={`${inputClassName} min-h-28`}
                placeholder="Partagez votre expérience"
              />
            </label>

            {errorMessage ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {errorMessage}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              {isSubmitting ? "Envoi…" : "Publier l'avis"}
            </button>
          </form>
        )}

        {alreadyReviewed && errorMessage ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}

        <Link
          href="/bookings"
          className="mt-6 inline-flex text-sm font-medium text-zinc-600 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Retour à mes demandes
        </Link>
      </main>
    </div>
  );
}
