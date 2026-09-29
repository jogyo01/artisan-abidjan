"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import { bookingStatusLabel, formatAdminDateTime, formatAmount, isPaymentStatus, PAYMENT_STATUS_LABELS } from "@/lib/admin/labels";
import { paginate } from "@/lib/admin/pagination";
import { requireAdminSession } from "@/lib/admin/session";
import { PageSkeleton } from "@/components/motion";
import {
  BOOKING_STATUS_LABELS,
  bookingIdToString,
  isBookingStatus,
  type BookingStatus,
} from "@/lib/bookings/artisan";
import { formatMoney, isQuoteStatus, QUOTE_STATUS_LABELS } from "@/lib/payments/types";
import { createClient } from "@/lib/supabase/client";

type AdminBookingRow = {
  id: string;
  client_name: string;
  artisan_name: string;
  service_name: string;
  status: BookingStatus;
  address: string;
  scheduled_at: string;
  created_at: string;
  payment_label: string | null;
  quote_label: string | null;
};

type StatusFilter = "all" | BookingStatus;

export default function AdminBookingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [bookings, setBookings] = useState<AdminBookingRow[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadBookings = useCallback(async () => {
    const { data: bookingRows, error } = await supabase
      .from("bookings")
      .select(
        "id, client_id, artisan_id, service_id, status, address, scheduled_at, created_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      return { bookings: [] as AdminBookingRow[], error: true };
    }

    const rows = bookingRows ?? [];
    const clientIds = [
      ...new Set(rows.flatMap((row) => (typeof row.client_id === "string" ? [row.client_id] : []))),
    ];
    const artisanIds = [
      ...new Set(
        rows.flatMap((row) => (typeof row.artisan_id === "string" ? [row.artisan_id] : [])),
      ),
    ];
    const serviceIds = [
      ...new Set(rows.flatMap((row) => {
        const id = bookingIdToString(row.service_id);
        return id ? [id] : [];
      })),
    ];
    const bookingIds = rows.flatMap((row) => {
      const id = bookingIdToString(row.id);
      return id ? [id] : [];
    });

    const [{ data: profiles }, { data: artisans }, { data: services }, { data: payments }, { data: quotes }] =
      await Promise.all([
        clientIds.length > 0
          ? supabase.from("profiles").select("id, full_name").in("id", clientIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
        artisanIds.length > 0
          ? supabase.from("artisans").select("id, business_name").in("id", artisanIds)
          : Promise.resolve({ data: [] as { id: string; business_name: string | null }[] }),
        serviceIds.length > 0
          ? supabase.from("services").select("id, name").in("id", serviceIds)
          : Promise.resolve({ data: [] as { id: unknown; name: string | null }[] }),
        bookingIds.length > 0
          ? supabase
              .from("payments")
              .select("booking_id, amount, currency, status")
              .in("booking_id", bookingIds)
          : Promise.resolve({
              data: [] as {
                booking_id: unknown;
                amount: unknown;
                currency: string | null;
                status: string | null;
              }[],
            }),
        bookingIds.length > 0
          ? supabase
              .from("booking_quotes")
              .select("booking_id, amount, currency, status, description, created_at")
              .in("booking_id", bookingIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({
              data: [] as {
                booking_id: unknown;
                amount: unknown;
                currency: string | null;
                status: string | null;
                description: string | null;
                created_at: unknown;
              }[],
            }),
      ]);

    const clientNames = new Map<string, string>();
    for (const row of profiles ?? []) {
      if (typeof row.id === "string") {
        clientNames.set(
          row.id,
          typeof row.full_name === "string" && row.full_name.trim() !== ""
            ? row.full_name
            : "Client",
        );
      }
    }

    const artisanNames = new Map<string, string>();
    for (const row of artisans ?? []) {
      if (typeof row.id === "string") {
        artisanNames.set(
          row.id,
          typeof row.business_name === "string" ? row.business_name : "Artisan",
        );
      }
    }

    const serviceNames = new Map<string, string>();
    for (const row of services ?? []) {
      const id = bookingIdToString(row.id);
      if (id && typeof row.name === "string") {
        serviceNames.set(id, row.name);
      }
    }

    const paymentByBooking = new Map<string, string>();
    for (const row of payments ?? []) {
      const id = bookingIdToString(row.booking_id);
      const amount = typeof row.amount === "number" ? row.amount : Number(row.amount);
      if (!id || !Number.isFinite(amount)) {
        continue;
      }
      const currency = typeof row.currency === "string" ? row.currency : "XOF";
      const status = typeof row.status === "string" ? row.status : "";
      const statusLabel = isPaymentStatus(status) ? PAYMENT_STATUS_LABELS[status] : status;
      paymentByBooking.set(id, `${formatAmount(amount, currency)} · ${statusLabel}`);
    }

    const quoteByBooking = new Map<string, string[]>();
    for (const row of quotes ?? []) {
      const id = bookingIdToString(row.booking_id);
      const amount = typeof row.amount === "number" ? row.amount : Number(row.amount);
      const status = typeof row.status === "string" ? row.status : "";
      if (!id || !Number.isFinite(amount) || !isQuoteStatus(status)) {
        continue;
      }
      const currency = typeof row.currency === "string" ? row.currency : "XOF";
      const description =
        typeof row.description === "string" && row.description.trim() !== ""
          ? ` — ${row.description.trim()}`
          : "";
      const current = quoteByBooking.get(id) ?? [];
      current.push(
        `${formatMoney(amount, currency)} · ${QUOTE_STATUS_LABELS[status]}${description}`,
      );
      quoteByBooking.set(id, current);
    }

    return {
      error: false,
      bookings: rows.flatMap((row) => {
        const id = bookingIdToString(row.id);
        if (!id || typeof row.status !== "string" || !isBookingStatus(row.status)) {
          return [];
        }
        const serviceId = bookingIdToString(row.service_id);
        return [
          {
            id,
            client_name:
              typeof row.client_id === "string"
                ? (clientNames.get(row.client_id) ?? "Client")
                : "Client",
            artisan_name:
              typeof row.artisan_id === "string"
                ? (artisanNames.get(row.artisan_id) ?? "Artisan")
                : "Artisan",
            service_name: serviceId ? (serviceNames.get(serviceId) ?? "Service") : "Service",
            status: row.status,
            address: typeof row.address === "string" ? row.address : "",
            scheduled_at: String(row.scheduled_at ?? ""),
            created_at: String(row.created_at ?? ""),
            payment_label: paymentByBooking.get(id) ?? null,
            quote_label: quoteByBooking.get(id)?.join(" · ") ?? null,
          } satisfies AdminBookingRow,
        ];
      }),
    };
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
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

      const result = await loadBookings();
      if (cancelled) {
        return;
      }
      if (result.error) {
        setErrorMessage("Impossible de charger les demandes.");
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

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return bookings.filter((booking) => {
      if (filter !== "all" && booking.status !== filter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        booking.client_name.toLowerCase().includes(query) ||
        booking.artisan_name.toLowerCase().includes(query) ||
        booking.service_name.toLowerCase().includes(query) ||
        booking.id.toLowerCase().includes(query)
      );
    });
  }, [bookings, filter, search]);

  const { pageItems, pageCount, page: safePage } = paginate(visible, page);

  if (isLoading) {
    return (
      <div className="aa-page aa-page-center">
        <PageSkeleton label="Chargement des demandes…" />
      </div>
    );
  }

  const filters: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "Tous" },
    ...Object.entries(BOOKING_STATUS_LABELS).map(([value, label]) => ({
      value: value as BookingStatus,
      label,
    })),
  ];

  return (
    <div className="aa-page">
      <main className="w-full max-w-5xl aa-card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-[var(--aa-ink)]">Demandes</h1>
        <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
          Consultation uniquement. Les statuts ne sont pas modifiables ici.
        </p>
        <AdminSectionNav current="/admin/bookings" />

        <div className="mt-6 flex flex-col gap-3">
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Rechercher par client, artisan, service ou n°"
            className="aa-input"
          />
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setFilter(item.value);
                  setPage(1);
                }}
                className={`aa-filter ${filter === item.value ? "aa-filter-active" : ""}`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {errorMessage ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}

        {!errorMessage && visible.length === 0 ? (
          <p className="mt-8 text-sm text-[var(--aa-ink-soft)]">
            {bookings.length === 0
              ? "Aucune demande n'a encore été créée."
              : "Aucune demande ne correspond à votre recherche ou au filtre."}
          </p>
        ) : null}

        <ul className="mt-8 flex flex-col gap-3">
          {pageItems.map((booking) => (
            <li
              key={booking.id}
              className="aa-card p-4 text-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-[var(--aa-ink)]">#{booking.id}</p>
                <span className="aa-chip bg-[color-mix(in_srgb,var(--aa-ink)_8%,transparent)] text-[var(--aa-ink)]">
                  {bookingStatusLabel(booking.status)}
                </span>
              </div>
              <dl className="mt-3 grid gap-1 sm:grid-cols-2">
                <div>
                  <dt className="text-[var(--aa-ink-soft)]">Client</dt>
                  <dd>{booking.client_name}</dd>
                </div>
                <div>
                  <dt className="text-[var(--aa-ink-soft)]">Artisan</dt>
                  <dd>{booking.artisan_name}</dd>
                </div>
                <div>
                  <dt className="text-[var(--aa-ink-soft)]">Service</dt>
                  <dd>{booking.service_name}</dd>
                </div>
                <div>
                  <dt className="text-[var(--aa-ink-soft)]">Adresse</dt>
                  <dd>{booking.address || "—"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--aa-ink-soft)]">Programmée</dt>
                  <dd>{formatAdminDateTime(booking.scheduled_at)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--aa-ink-soft)]">Créée</dt>
                  <dd>{formatAdminDateTime(booking.created_at)}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[var(--aa-ink-soft)]">Paiement</dt>
                  <dd>{booking.payment_label || "Aucun paiement associé"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[var(--aa-ink-soft)]">Devis</dt>
                  <dd>{booking.quote_label || "Aucun devis associé"}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>

        {pageCount > 1 ? (
          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
              className="aa-btn aa-btn-ghost"
            >
              Précédent
            </button>
            <p className="text-sm text-[var(--aa-ink-soft)]">
              Page {safePage} / {pageCount}
            </p>
            <button
              type="button"
              disabled={safePage >= pageCount}
              onClick={() => setPage(safePage + 1)}
              className="aa-btn aa-btn-ghost"
            >
              Suivant
            </button>
          </div>
        ) : null}
      </main>
    </div>
  );
}
