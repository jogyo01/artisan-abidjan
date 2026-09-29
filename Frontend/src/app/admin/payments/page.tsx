"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminSectionNav } from "@/components/admin/AdminSectionNav";
import {
  canSetPaymentStatus,
  formatAdminDateTime,
  formatAmount,
  isPaymentStatus,
  PAYMENT_STATUS_LABELS,
  paymentActionLabel,
  type PaymentNextStatus,
  type PaymentStatus,
} from "@/lib/admin/labels";
import { paginate } from "@/lib/admin/pagination";
import { requireAdminSession } from "@/lib/admin/session";
import { PageSkeleton } from "@/components/motion";
import { bookingIdToString } from "@/lib/bookings/artisan";
import { createClient } from "@/lib/supabase/client";

type AdminPayment = {
  id: string;
  numericId: number | null;
  booking_id: string;
  client_name: string;
  artisan_name: string;
  service_name: string;
  amount: number;
  currency: string;
  payment_method: string;
  status: PaymentStatus;
  transaction_reference: string;
  created_at: string;
  quote_label: string | null;
  commission_amount: number | null;
  artisan_amount: number | null;
};

type StatusFilter = "all" | PaymentStatus;

function paymentStatusFromRpc(data: unknown): string | null {
  if (Array.isArray(data)) {
    const first = data[0];
    if (first && typeof first === "object" && first !== null && "status" in first) {
      return String(first.status);
    }
    return null;
  }
  if (data && typeof data === "object" && "status" in data) {
    return String((data as { status: unknown }).status);
  }
  return null;
}

export default function AdminPaymentsPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadPayments = useCallback(async () => {
    const { data, error } = await supabase
      .from("payments")
      .select(
        "id, booking_id, client_id, artisan_id, amount, currency, status, payment_method, transaction_reference, quote_id, created_at",
      )
      .order("created_at", { ascending: false });

    if (error) {
      return { payments: [] as AdminPayment[], error: true };
    }

    const rows = data ?? [];
    const clientIds = [
      ...new Set(rows.flatMap((row) => (typeof row.client_id === "string" ? [row.client_id] : []))),
    ];
    const artisanIds = [
      ...new Set(
        rows.flatMap((row) => (typeof row.artisan_id === "string" ? [row.artisan_id] : [])),
      ),
    ];

    const bookingIds = [
      ...new Set(rows.flatMap((row) => {
        const id = bookingIdToString(row.booking_id);
        return id ? [id] : [];
      })),
    ];
    const paymentIds = rows.flatMap((row) => {
      const id = bookingIdToString(row.id);
      return id ? [id] : [];
    });

    const [{ data: profiles }, { data: artisans }, { data: bookings }, { data: quotes }, commissionsResult] =
      await Promise.all([
        clientIds.length > 0
          ? supabase.from("profiles").select("id, full_name").in("id", clientIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
        artisanIds.length > 0
          ? supabase.from("artisans").select("id, business_name").in("id", artisanIds)
          : Promise.resolve({ data: [] as { id: string; business_name: string | null }[] }),
        bookingIds.length > 0
          ? supabase.from("bookings").select("id, service_id").in("id", bookingIds)
          : Promise.resolve({ data: [] as { id: unknown; service_id: unknown }[] }),
        bookingIds.length > 0
          ? supabase
              .from("booking_quotes")
              .select("id, booking_id, amount, currency, status")
              .in("booking_id", bookingIds)
          : Promise.resolve({
              data: [] as {
                id: unknown;
                booking_id: unknown;
                amount: unknown;
                currency: string | null;
                status: string | null;
              }[],
            }),
        paymentIds.length > 0
          ? supabase
              .from("platform_commissions")
              .select("payment_id, commission_amount, artisan_amount")
              .in("payment_id", paymentIds)
          : Promise.resolve({
              data: [] as {
                payment_id: unknown;
                commission_amount: unknown;
                artisan_amount: unknown;
              }[],
              error: null,
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

    const serviceIds = [
      ...new Set(
        (bookings ?? []).flatMap((row) => {
          const id = bookingIdToString(row.service_id);
          return id ? [id] : [];
        }),
      ),
    ];
    const bookingService = new Map<string, string>();
    for (const row of bookings ?? []) {
      const bookingId = bookingIdToString(row.id);
      const serviceId = bookingIdToString(row.service_id);
      if (bookingId && serviceId) {
        bookingService.set(bookingId, serviceId);
      }
    }
    const serviceNames = new Map<string, string>();
    if (serviceIds.length > 0) {
      const { data: services } = await supabase.from("services").select("id, name").in("id", serviceIds);
      for (const row of services ?? []) {
        const id = bookingIdToString(row.id);
        if (id && typeof row.name === "string") {
          serviceNames.set(id, row.name);
        }
      }
    }

    const quoteByBooking = new Map<string, string>();
    for (const row of quotes ?? []) {
      const bookingId = bookingIdToString(row.booking_id);
      const amount = typeof row.amount === "number" ? row.amount : Number(row.amount);
      if (!bookingId || !Number.isFinite(amount)) {
        continue;
      }
      quoteByBooking.set(
        bookingId,
        `${row.status ?? ""} · ${formatAmount(amount, typeof row.currency === "string" ? row.currency : "XOF")}`,
      );
    }

    const commissionByPayment = new Map<string, { commission: number; artisan: number }>();
    if (!commissionsResult.error) {
      for (const row of commissionsResult.data ?? []) {
        const id = bookingIdToString(row.payment_id);
        const commission =
          typeof row.commission_amount === "number"
            ? row.commission_amount
            : Number(row.commission_amount);
        const artisan =
          typeof row.artisan_amount === "number" ? row.artisan_amount : Number(row.artisan_amount);
        if (!id || !Number.isFinite(commission) || !Number.isFinite(artisan)) {
          continue;
        }
        commissionByPayment.set(id, { commission, artisan });
      }
    }

    return {
      error: false,
      payments: rows.flatMap((row) => {
        const id = bookingIdToString(row.id);
        const status = typeof row.status === "string" ? row.status : "";
        const amount = typeof row.amount === "number" ? row.amount : Number(row.amount);
        if (!id || !isPaymentStatus(status) || !Number.isFinite(amount)) {
          return [];
        }
        const numericId =
          typeof row.id === "number" && Number.isSafeInteger(row.id)
            ? row.id
            : Number.parseInt(id, 10);
        return [
          {
            id,
            numericId: Number.isSafeInteger(numericId) && numericId > 0 ? numericId : null,
            booking_id: bookingIdToString(row.booking_id) ?? "—",
            client_name:
              typeof row.client_id === "string"
                ? (clientNames.get(row.client_id) ?? "Client")
                : "Client",
            artisan_name:
              typeof row.artisan_id === "string"
                ? (artisanNames.get(row.artisan_id) ?? "Artisan")
                : "Artisan",
            service_name: (() => {
              const bookingId = bookingIdToString(row.booking_id);
              const serviceId = bookingId ? bookingService.get(bookingId) : undefined;
              return serviceId ? (serviceNames.get(serviceId) ?? "Service") : "Service";
            })(),
            amount,
            currency: typeof row.currency === "string" ? row.currency : "XOF",
            payment_method:
              typeof row.payment_method === "string" && row.payment_method.trim() !== ""
                ? row.payment_method
                : "Non renseignée",
            status,
            transaction_reference:
              typeof row.transaction_reference === "string" ? row.transaction_reference : "—",
            created_at: String(row.created_at ?? ""),
            quote_label: bookingIdToString(row.booking_id)
              ? (quoteByBooking.get(bookingIdToString(row.booking_id) ?? "") ?? null)
              : null,
            commission_amount: commissionByPayment.get(id)?.commission ?? null,
            artisan_amount: commissionByPayment.get(id)?.artisan ?? null,
          } satisfies AdminPayment,
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

      const result = await loadPayments();
      if (cancelled) {
        return;
      }
      if (result.error) {
        setErrorMessage("Impossible de charger les paiements.");
        setPayments([]);
      } else {
        setPayments(result.payments);
      }
      setIsLoading(false);
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [loadPayments, router, supabase]);

  async function updateStatus(payment: AdminPayment, nextStatus: PaymentNextStatus) {
    setErrorMessage("");
    setSuccessMessage("");

    if (!canSetPaymentStatus(payment.status, nextStatus) || payment.numericId === null) {
      setErrorMessage("Cette transition n'est pas autorisée.");
      return;
    }

    const session = await requireAdminSession(supabase);
    if (session.kind !== "ok") {
      router.replace("/auth");
      return;
    }

    const confirmed = window.confirm(
      `Confirmer le passage du paiement ${payment.transaction_reference} à « ${PAYMENT_STATUS_LABELS[nextStatus]} » ?`,
    );
    if (!confirmed) {
      return;
    }

    setUpdatingId(payment.id);

    try {
      const { data, error } = await supabase.rpc("admin_set_payment_status", {
        p_payment_id: payment.numericId,
        p_new_status: nextStatus,
      });

      const returnedStatus = paymentStatusFromRpc(data);

      if (error || returnedStatus !== nextStatus) {
        setErrorMessage(
          "Impossible de mettre à jour ce paiement. Vérifiez que la fonction SQL admin_set_payment_status est en place.",
        );
        return;
      }

      const result = await loadPayments();
      if (result.error) {
        setErrorMessage("Le statut a été mis à jour, mais la liste n'a pas pu être rechargée.");
      } else {
        setPayments(result.payments);
        setSuccessMessage("Statut de paiement mis à jour.");
      }
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setUpdatingId(null);
    }
  }

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return payments.filter((payment) => {
      if (filter !== "all" && payment.status !== filter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        payment.transaction_reference.toLowerCase().includes(query) ||
        payment.booking_id.toLowerCase().includes(query) ||
        payment.client_name.toLowerCase().includes(query) ||
        payment.artisan_name.toLowerCase().includes(query) ||
        payment.service_name.toLowerCase().includes(query)
      );
    });
  }, [filter, payments, search]);

  const { pageItems, pageCount, page: safePage } = paginate(visible, page);

  const paidAmount = payments
    .filter((payment) => payment.status === "PAID")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const pendingAmount = payments
    .filter((payment) => payment.status === "PENDING")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const commissionTotal = payments.reduce(
    (sum, payment) => sum + (payment.commission_amount ?? 0),
    0,
  );
  const artisanNetTotal = payments.reduce(
    (sum, payment) => sum + (payment.artisan_amount ?? 0),
    0,
  );
  const hasCommissions = payments.some(
    (payment) => payment.commission_amount !== null && payment.artisan_amount !== null,
  );

  if (isLoading) {
    return (
      <div className="aa-page aa-page-center">
        <PageSkeleton label="Chargement des paiements…" />
      </div>
    );
  }

  return (
    <div className="aa-page">
      <main className="w-full max-w-5xl aa-card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold text-[var(--aa-ink)]">Paiements</h1>
        <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
          Transitions autorisées uniquement : En attente → Payé ou Échoué, Payé → Remboursé.
          Le statut passe uniquement par la fonction SQL admin_set_payment_status.
        </p>
        <AdminSectionNav current="/admin/payments" />

        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[
            { label: "Total", value: String(payments.length) },
            {
              label: PAYMENT_STATUS_LABELS.PENDING,
              value: String(payments.filter((payment) => payment.status === "PENDING").length),
            },
            {
              label: PAYMENT_STATUS_LABELS.PAID,
              value: String(payments.filter((payment) => payment.status === "PAID").length),
            },
            {
              label: PAYMENT_STATUS_LABELS.FAILED,
              value: String(payments.filter((payment) => payment.status === "FAILED").length),
            },
            {
              label: PAYMENT_STATUS_LABELS.REFUNDED,
              value: String(payments.filter((payment) => payment.status === "REFUNDED").length),
            },
            {
              label: "Montant payé",
              value: formatAmount(paidAmount, payments[0]?.currency ?? "XOF"),
            },
            {
              label: "Montant en attente",
              value: formatAmount(pendingAmount, payments[0]?.currency ?? "XOF"),
            },
            ...(hasCommissions
              ? [
                  {
                    label: "Commissions",
                    value: formatAmount(commissionTotal, payments[0]?.currency ?? "XOF"),
                  },
                  {
                    label: "Net artisans",
                    value: formatAmount(artisanNetTotal, payments[0]?.currency ?? "XOF"),
                  },
                ]
              : []),
          ].map((card) => (
            <li
              key={card.label}
              className="aa-card p-3"
            >
              <p className="text-xs text-[var(--aa-ink-soft)]">{card.label}</p>
              <p className="mt-1 text-sm font-semibold text-[var(--aa-ink)]">{card.value}</p>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-col gap-3">
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Rechercher par référence, demande, client ou artisan"
            className="aa-input"
          />
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", "Tous"],
                ["PENDING", PAYMENT_STATUS_LABELS.PENDING],
                ["PAID", PAYMENT_STATUS_LABELS.PAID],
                ["FAILED", PAYMENT_STATUS_LABELS.FAILED],
                ["REFUNDED", PAYMENT_STATUS_LABELS.REFUNDED],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setFilter(value);
                  setPage(1);
                }}
                className={`aa-filter ${filter === value ? "aa-filter-active" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>
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

        {!errorMessage && visible.length === 0 ? (
          <p className="mt-8 text-sm text-[var(--aa-ink-soft)]">
            {payments.length === 0
              ? "Aucun paiement n'a encore été enregistré."
              : "Aucun paiement ne correspond à votre recherche ou au filtre."}
          </p>
        ) : null}

        <ul className="mt-8 flex flex-col gap-3">
          {pageItems.map((payment) => {
            const actions: PaymentNextStatus[] =
              payment.status === "PENDING"
                ? ["PAID", "FAILED"]
                : payment.status === "PAID"
                  ? ["REFUNDED"]
                  : [];

            return (
              <li
                key={payment.id}
                className="aa-card p-4 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-[var(--aa-ink)]">
                    {payment.transaction_reference}
                  </p>
                  <span className="aa-chip bg-[color-mix(in_srgb,var(--aa-ink)_8%,transparent)] text-[var(--aa-ink)]">
                    {PAYMENT_STATUS_LABELS[payment.status]}
                  </span>
                </div>
                <dl className="mt-3 grid gap-1 sm:grid-cols-2">
                  <div>
                    <dt className="text-[var(--aa-ink-soft)]">Demande</dt>
                    <dd>#{payment.booking_id}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--aa-ink-soft)]">Montant</dt>
                    <dd>{formatAmount(payment.amount, payment.currency)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--aa-ink-soft)]">Client</dt>
                    <dd>{payment.client_name}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--aa-ink-soft)]">Artisan</dt>
                    <dd>{payment.artisan_name}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--aa-ink-soft)]">Service</dt>
                    <dd>{payment.service_name}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--aa-ink-soft)]">Méthode</dt>
                    <dd>{payment.payment_method}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--aa-ink-soft)]">Référence</dt>
                    <dd>{payment.transaction_reference}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--aa-ink-soft)]">Date</dt>
                    <dd>{formatAdminDateTime(payment.created_at)}</dd>
                  </div>
                  {payment.quote_label ? (
                    <div className="sm:col-span-2">
                      <dt className="text-[var(--aa-ink-soft)]">Devis</dt>
                      <dd>{payment.quote_label}</dd>
                    </div>
                  ) : null}
                  {payment.commission_amount !== null && payment.artisan_amount !== null ? (
                    <div className="sm:col-span-2">
                      <dt className="text-[var(--aa-ink-soft)]">Commission / net artisan</dt>
                      <dd>
                        {formatAmount(payment.commission_amount, payment.currency)} ·{" "}
                        {formatAmount(payment.artisan_amount, payment.currency)}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                {actions.length > 0 ? (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    {actions.map((next) => (
                      <button
                        key={next}
                        type="button"
                        disabled={updatingId === payment.id}
                        onClick={() => {
                          void updateStatus(payment, next);
                        }}
                        className="aa-btn aa-btn-ghost"
                      >
                        {updatingId === payment.id ? "Mise à jour…" : paymentActionLabel(next)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
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
