"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
  scheduled_at: string;
  address: string;
  description: string;
  status: BookingStatus;
  created_at: string;
  paymentStatus: PaymentIndication | null;
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

export default function ClientBookingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [bookings, setBookings] = useState<ClientBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

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
          "id, client_id, artisan_id, service_id, status, address, description, scheduled_at, created_at",
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
          ownRows.flatMap((row) => (typeof row.service_id === "string" ? [row.service_id] : [])),
        ),
      ];

      const artisanNames = new Map<string, string>();
      const serviceNames = new Map<string, string>();

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
          .select("id, name")
          .in("id", serviceIds);

        for (const row of serviceRows ?? []) {
          if (typeof row.id === "string" && typeof row.name === "string") {
            serviceNames.set(row.id, row.name);
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

      const paymentByBookingId = new Map<number, PaymentIndication>();

      if (bookingIds.length > 0) {
        const { data: paymentRows } = await supabase
          .from("payments")
          .select("booking_id, status")
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
          if (current === "PAID") {
            continue;
          }
          paymentByBookingId.set(paymentBookingId, paymentRow.status);
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

          return [
            {
              id,
              artisan_id: row.artisan_id,
              artisan_name: artisanNames.get(row.artisan_id) ?? "Artisan",
              service_name:
                typeof row.service_id === "string"
                  ? (serviceNames.get(row.service_id) ?? "Service")
                  : "Service",
              scheduled_at: String(row.scheduled_at ?? ""),
              address: typeof row.address === "string" ? row.address : "",
              description: typeof row.description === "string" ? row.description : "",
              status: row.status,
              created_at: String(row.created_at ?? ""),
              paymentStatus: paymentByBookingId.get(id) ?? null,
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
  }, [router, supabase]);

  if (isLoading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Chargement de vos demandes…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <main className="w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Mes demandes
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Suivez l&apos;état de vos demandes d&apos;intervention.
        </p>

        {errorMessage ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}

        {!errorMessage && bookings.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
            Vous n&apos;avez encore aucune demande d&apos;intervention.
          </p>
        ) : null}

        {bookings.length > 0 ? (
          <ul className="mt-8 flex flex-col gap-4">
            {bookings.map((booking) => (
              <li
                key={booking.id}
                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                      {booking.artisan_name}
                    </h2>
                    <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">
                      {booking.service_name}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                      {STATUS_LABELS[booking.status]}
                    </p>
                    {booking.paymentStatus === "PENDING" ? (
                      <p className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                        Paiement en attente
                      </p>
                    ) : null}
                    {booking.paymentStatus === "PAID" ? (
                      <p className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                        Paiement effectué
                      </p>
                    ) : null}
                  </div>
                </div>

                <dl className="mt-4 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <div>
                    <dt className="font-medium text-zinc-500 dark:text-zinc-400">Date prévue</dt>
                    <dd>{formatDateTime(booking.scheduled_at)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-500 dark:text-zinc-400">Adresse</dt>
                    <dd>{booking.address || "Non renseignée"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-500 dark:text-zinc-400">Description</dt>
                    <dd>{booking.description || "Non renseignée"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-500 dark:text-zinc-400">Créée le</dt>
                    <dd>{formatDateTime(booking.created_at)}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    href={`/artisans/${booking.artisan_id}`}
                    className="inline-flex rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                  >
                    Voir la fiche artisan
                  </Link>
                  {booking.status === "ACCEPTED" && !booking.paymentStatus ? (
                    <Link
                      href={`/bookings/${booking.id}/payment`}
                      className="inline-flex rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                    >
                      Payer
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </div>
  );
}
