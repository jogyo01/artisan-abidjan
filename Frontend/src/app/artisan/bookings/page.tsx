"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type BookingStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REFUSED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

type ArtisanBooking = {
  id: string;
  client_name: string;
  service_name: string;
  description: string;
  address: string;
  scheduled_at: string;
  status: BookingStatus;
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

function isBookingStatus(value: string): value is BookingStatus {
  return value in STATUS_LABELS;
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

export default function ArtisanBookingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [bookings, setBookings] = useState<ArtisanBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadBookings = useCallback(
    async (userId: string) => {
      const { data: bookingRows, error: bookingsError } = await supabase
        .from("bookings")
        .select(
          "id, client_id, artisan_id, service_id, status, address, description, scheduled_at, created_at",
        )
        .eq("artisan_id", userId)
        .order("created_at", { ascending: false });

      if (bookingsError) {
        return { bookings: [] as ArtisanBooking[], error: true };
      }

      const ownRows = (bookingRows ?? []).filter((row) => row.artisan_id === userId);

      const clientIds = [
        ...new Set(
          ownRows.flatMap((row) => (typeof row.client_id === "string" ? [row.client_id] : [])),
        ),
      ];
      const serviceIds = [
        ...new Set(
          ownRows.flatMap((row) => (typeof row.service_id === "string" ? [row.service_id] : [])),
        ),
      ];

      const clientNames = new Map<string, string>();
      const serviceNames = new Map<string, string>();

      if (clientIds.length > 0) {
        const { data: profileRows } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", clientIds);

        for (const row of profileRows ?? []) {
          if (typeof row.id === "string") {
            clientNames.set(
              row.id,
              typeof row.full_name === "string" && row.full_name.trim() !== ""
                ? row.full_name
                : "Client",
            );
          }
        }
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

      return {
        error: false,
        bookings: ownRows.flatMap((row) => {
          if (typeof row.id !== "string" || typeof row.status !== "string") {
            return [];
          }
          if (!isBookingStatus(row.status)) {
            return [];
          }

          return [
            {
              id: row.id,
              client_name:
                typeof row.client_id === "string"
                  ? (clientNames.get(row.client_id) ?? "Client")
                  : "Client",
              service_name:
                typeof row.service_id === "string"
                  ? (serviceNames.get(row.service_id) ?? "Service")
                  : "Service",
              description: typeof row.description === "string" ? row.description : "",
              address: typeof row.address === "string" ? row.address : "",
              scheduled_at: String(row.scheduled_at ?? ""),
              status: row.status,
              created_at: String(row.created_at ?? ""),
            } satisfies ArtisanBooking,
          ];
        }),
      };
    },
    [supabase],
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
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

      if (profile?.role !== "ARTISAN") {
        router.replace("/");
        return;
      }

      const { data: artisan } = await supabase
        .from("artisans")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (!artisan) {
        router.replace("/artisan/onboarding");
        return;
      }

      const result = await loadBookings(user.id);
      if (cancelled) {
        return;
      }

      if (result.error) {
        setErrorMessage("Impossible de charger les demandes. Veuillez réessayer.");
        setBookings([]);
      } else {
        setBookings(result.bookings);
      }

      setIsLoading(false);
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [loadBookings, router, supabase]);

  async function updatePendingStatus(bookingId: string, nextStatus: "ACCEPTED" | "REFUSED") {
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

    setUpdatingId(bookingId);

    try {
      const { data, error } = await supabase
        .from("bookings")
        .update({ status: nextStatus })
        .eq("id", bookingId)
        .eq("artisan_id", user.id)
        .eq("status", "PENDING")
        .select("id, status")
        .maybeSingle();

      if (error || !data || data.status !== nextStatus) {
        setErrorMessage("Impossible de mettre à jour cette demande.");
        return;
      }

      const result = await loadBookings(user.id);
      if (result.error) {
        setErrorMessage("La demande a été mise à jour, mais la liste n'a pas pu être rechargée.");
      } else {
        setBookings(result.bookings);
      }

      setSuccessMessage(
        nextStatus === "ACCEPTED" ? "Demande acceptée." : "Demande refusée.",
      );
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setUpdatingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Chargement des demandes…</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <main className="w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Demandes reçues
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Consultez et répondez aux demandes d&apos;intervention qui vous sont destinées.
        </p>

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

        {!errorMessage && bookings.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
            Vous n&apos;avez encore aucune demande.
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
                      {booking.client_name}
                    </h2>
                    <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">
                      {booking.service_name}
                    </p>
                  </div>
                  <p className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                    {STATUS_LABELS[booking.status]}
                  </p>
                </div>

                <dl className="mt-4 space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
                  <div>
                    <dt className="font-medium text-zinc-500 dark:text-zinc-400">Description</dt>
                    <dd>{booking.description || "Non renseignée"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-500 dark:text-zinc-400">Adresse</dt>
                    <dd>{booking.address || "Non renseignée"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-500 dark:text-zinc-400">Date souhaitée</dt>
                    <dd>{formatDateTime(booking.scheduled_at)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-zinc-500 dark:text-zinc-400">Créée le</dt>
                    <dd>{formatDateTime(booking.created_at)}</dd>
                  </div>
                </dl>

                {booking.status === "PENDING" ? (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={updatingId === booking.id}
                      onClick={() => {
                        void updatePendingStatus(booking.id, "ACCEPTED");
                      }}
                      className="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                    >
                      {updatingId === booking.id ? "Mise à jour…" : "Accepter"}
                    </button>
                    <button
                      type="button"
                      disabled={updatingId === booking.id}
                      onClick={() => {
                        void updatePendingStatus(booking.id, "REFUSED");
                      }}
                      className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
                    >
                      Refuser
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </div>
  );
}
