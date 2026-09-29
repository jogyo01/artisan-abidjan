"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { MotionAlert, PageSkeleton, SlideUp } from "@/components/motion";
import {
  formatMoney,
  isBookingPayableStatus,
  isPriceType,
  latestUsableQuote,
  mapQuote,
  paymentFromUnknown,
  PAYMENT_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  type PaymentView,
  type PriceType,
  type QuoteView,
} from "@/lib/payments/types";

function isBookingStatusLike(value: string): value is
  | "PENDING"
  | "ACCEPTED"
  | "REFUSED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED" {
  return (
    value === "PENDING" ||
    value === "ACCEPTED" ||
    value === "REFUSED" ||
    value === "IN_PROGRESS" ||
    value === "COMPLETED" ||
    value === "CANCELLED"
  );
}

type BookingStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REFUSED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

type PaymentPageData = {
  bookingId: number;
  bookingStatus: BookingStatus;
  artisanName: string;
  serviceName: string;
  serviceDescription: string | null;
  priceType: PriceType;
  catalogAmount: number | null;
};

const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: "En attente",
  ACCEPTED: "Acceptée",
  REFUSED: "Refusée",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
};

function parseBookingId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    return null;
  }
  return value;
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

function paymentErrorMessage(errorMessage: string): string {
  const normalized = errorMessage.toLowerCase();
  if (normalized.includes("quote required") || normalized.includes("sur devis")) {
    return "Le prix doit être confirmé par un devis avant le paiement.";
  }
  if (normalized.includes("accepted quote")) {
    return "Un devis accepté est nécessaire pour payer.";
  }
  if (
    normalized.includes("déjà") ||
    normalized.includes("already") ||
    normalized.includes("active payment")
  ) {
    return "Un paiement est déjà en cours ou déjà payé pour cette demande.";
  }
  if (normalized.includes("booking not payable") || normalized.includes("booking not accepted")) {
    return "Le paiement n'est possible que pour une demande acceptée, en cours ou terminée.";
  }
  if (normalized.includes("permission") || normalized.includes("row-level") || normalized.includes("not authorized")) {
    return "Vous n'avez pas l'autorisation d'effectuer cette action.";
  }
  return "Impossible de créer le paiement. Veuillez réessayer.";
}

export default function BookingPaymentPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const rawId = typeof params.id === "string" ? params.id : "";
  const bookingId = parseBookingId(rawId);
  const supabase = useMemo(() => createClient(), []);

  const [pageData, setPageData] = useState<PaymentPageData | null>(null);
  const [existingPayment, setExistingPayment] = useState<PaymentView | null>(null);
  const [quote, setQuote] = useState<QuoteView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [notAllowed, setNotAllowed] = useState(false);
  const [notAccepted, setNotAccepted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadExistingPayment = useCallback(
    async (id: number) => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, currency, status, payment_method, transaction_reference, quote_id, created_at")
        .eq("booking_id", id)
        .in("status", ["PENDING", "PAID"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      return paymentFromUnknown(data);
    },
    [supabase],
  );

  const loadQuote = useCallback(
    async (id: number) => {
      const { data, error } = await supabase
        .from("booking_quotes")
        .select("id, booking_id, amount, currency, status, description, created_at")
        .eq("booking_id", id)
        .order("created_at", { ascending: false });

      if (error) {
        return null;
      }

      const quotes = (data ?? []).flatMap((row) => {
        const mapped = mapQuote(row as Record<string, unknown>);
        return mapped ? [mapped] : [];
      });
      return latestUsableQuote(quotes);
    },
    [supabase],
  );

  const reloadMoney = useCallback(
    async (id: number) => {
      const [payment, nextQuote] = await Promise.all([loadExistingPayment(id), loadQuote(id)]);
      setExistingPayment(payment);
      setQuote(nextQuote);
    },
    [loadExistingPayment, loadQuote],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      if (bookingId === null) {
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
        .select("id, client_id, artisan_id, service_id, status")
        .eq("id", bookingId)
        .eq("client_id", user.id)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (bookingError) {
        setErrorMessage("Impossible de charger cette demande.");
        setIsLoading(false);
        return;
      }

      if (!bookingRow || bookingRow.client_id !== user.id) {
        setNotAllowed(true);
        setIsLoading(false);
        return;
      }

      if (typeof bookingRow.status !== "string" || !isBookingStatusLike(bookingRow.status)) {
        setNotAllowed(true);
        setIsLoading(false);
        return;
      }

      if (!isBookingPayableStatus(bookingRow.status)) {
        setNotAccepted(true);
        setIsLoading(false);
        return;
      }

      const [{ data: artisanRow }, { data: serviceRow }] = await Promise.all([
        typeof bookingRow.artisan_id === "string"
          ? supabase
              .from("artisans")
              .select("id, business_name")
              .eq("id", bookingRow.artisan_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        bookingRow.service_id !== null && bookingRow.service_id !== undefined
          ? supabase
              .from("services")
              .select("id, name, description, price, price_type, artisan_id")
              .eq("id", bookingRow.service_id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (cancelled) {
        return;
      }

      const priceType = String(serviceRow?.price_type ?? "");
      if (!serviceRow || typeof serviceRow.name !== "string" || !isPriceType(priceType)) {
        setErrorMessage("Le service associé à cette demande est introuvable.");
        setIsLoading(false);
        return;
      }

      await reloadMoney(bookingId);
      if (cancelled) {
        return;
      }

      const parsedPrice =
        typeof serviceRow.price === "number" ? serviceRow.price : Number(serviceRow.price);

      setPageData({
        bookingId,
        bookingStatus: bookingRow.status,
        artisanName:
          typeof artisanRow?.business_name === "string" ? artisanRow.business_name : "Artisan",
        serviceName: serviceRow.name,
        serviceDescription:
          typeof serviceRow.description === "string" ? serviceRow.description : null,
        priceType,
        catalogAmount: Number.isFinite(parsedPrice) ? parsedPrice : null,
      });
      setIsLoading(false);
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [bookingId, reloadMoney, router, supabase]);

  async function createPayment() {
    if (!pageData) {
      return;
    }

    const needsQuote = pageData.priceType !== "FIXED";
    if (needsQuote && quote?.status !== "ACCEPTED") {
      return;
    }
    if (!needsQuote && pageData.priceType !== "FIXED") {
      return;
    }

    setErrorMessage("");
    setIsCreating(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/auth");
        return;
      }

      const rpcName = needsQuote ? "create_payment_for_accepted_quote" : "create_payment_for_booking";
      const { data, error } = await supabase.rpc(rpcName, {
        p_booking_id: pageData.bookingId,
      });

      if (error) {
        await reloadMoney(pageData.bookingId);
        setErrorMessage(paymentErrorMessage(error.message));
        return;
      }

      const mapped = paymentFromUnknown(data);
      if (mapped) {
        setExistingPayment(mapped);
        return;
      }

      await reloadMoney(pageData.bookingId);
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsCreating(false);
    }
  }

  async function respondToQuote(accept: boolean) {
    if (!quote || quote.status !== "PENDING") {
      return;
    }

    setErrorMessage("");
    setIsResponding(true);

    try {
      const quoteId = Number(quote.id);
      const { error } = await supabase.rpc("client_respond_to_booking_quote", {
        p_quote_id: quoteId,
        p_accept: accept,
      });

      if (error) {
        setErrorMessage("Impossible de mettre à jour le devis.");
        return;
      }

      if (bookingId !== null) {
        await reloadMoney(bookingId);
      }
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsResponding(false);
    }
  }

  if (isLoading) {
    return (
      <div className="aa-page aa-page-center">
        <PageSkeleton label="Chargement du paiement…" />
      </div>
    );
  }

  if (notAllowed) {
    return (
      <div className="aa-page aa-page-center">
        <main className="w-full max-w-lg aa-card p-6 text-center sm:p-8">
          <h1 className="text-xl font-semibold text-[var(--aa-ink)]">Accès refusé</h1>
          <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
            Cette demande n&apos;existe pas ou ne vous appartient pas.
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

  if (notAccepted || !pageData) {
    return (
      <div className="aa-page aa-page-center">
        <main className="w-full max-w-lg aa-card p-6 text-center sm:p-8">
          <h1 className="text-xl font-semibold text-[var(--aa-ink)]">
            Paiement indisponible
          </h1>
          <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
            Le paiement n&apos;est possible que pour une demande acceptée, en cours ou terminée.
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

  const needsQuote = pageData.priceType !== "FIXED";
  const displayAmount = existingPayment
    ? existingPayment.amount
    : quote && (quote.status === "ACCEPTED" || quote.status === "PENDING")
      ? quote.amount
      : needsQuote
        ? null
        : pageData.catalogAmount;
  const displayCurrency = existingPayment?.currency ?? quote?.currency ?? "XOF";
  const canCreateFixedPayment =
    !needsQuote && !existingPayment && pageData.catalogAmount !== null && pageData.catalogAmount > 0;
  const canCreateQuotePayment = needsQuote && !existingPayment && quote?.status === "ACCEPTED";

  return (
    <div className="aa-page">
      <main className="w-full max-w-lg aa-card p-6 sm:p-8">
        <SlideUp>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--aa-ink)]">
          Paiement
        </h1>
        <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
          Le montant est défini par le service ou par le devis accepté. Il ne peut pas être modifié
          ici. Le paiement Mobile Money / carte n&apos;est pas encore intégré : cette étape enregistre
          un paiement manuel V1.
        </p>

        <dl className="mt-6 aa-inset space-y-3 text-sm">
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Service</dt>
            <dd className="mt-0.5 text-[var(--aa-ink)]">{pageData.serviceName}</dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Artisan</dt>
            <dd className="mt-0.5 text-[var(--aa-ink)]">{pageData.artisanName}</dd>
          </div>
          {pageData.serviceDescription ? (
            <div>
              <dt className="font-medium text-[var(--aa-ink-soft)]">Description</dt>
              <dd className="mt-0.5 text-[var(--aa-ink)]">{pageData.serviceDescription}</dd>
            </div>
          ) : null}
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Montant</dt>
            <dd className="mt-0.5 text-xl font-semibold text-[var(--aa-ink)]">
              {displayAmount !== null
                ? formatMoney(displayAmount, displayCurrency)
                : "Montant à confirmer par l'artisan"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Devise</dt>
            <dd className="mt-0.5 text-[var(--aa-ink)]">{displayCurrency}</dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Statut</dt>
            <dd className="mt-0.5 text-[var(--aa-ink)]">
              {existingPayment
                ? PAYMENT_STATUS_LABELS[existingPayment.status]
                : BOOKING_STATUS_LABELS[pageData.bookingStatus]}
            </dd>
          </div>
        </dl>

        {needsQuote ? (
          <section className="mt-6 aa-inset">
            <h2 className="font-semibold text-[var(--aa-ink)]">Devis</h2>
            {!quote ? (
              <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">
                Montant à confirmer par l&apos;artisan. Aucun devis n&apos;a encore été proposé.
              </p>
            ) : (
              <>
                <p className="mt-2 text-sm font-medium text-[var(--aa-ink)]">
                  {quote.status === "PENDING"
                    ? "Devis reçu — en attente de votre réponse"
                    : quote.status === "ACCEPTED"
                      ? "Devis accepté"
                      : quote.status === "REFUSED"
                        ? "Devis refusé — aucun paiement possible"
                        : QUOTE_STATUS_LABELS[quote.status]}
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--aa-ink)]">
                  {formatMoney(quote.amount, quote.currency)}
                </p>
                {quote.description ? (
                  <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">{quote.description}</p>
                ) : null}
                {quote.status === "PENDING" ? (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={isResponding}
                      onClick={() => {
                        void respondToQuote(true);
                      }}
                      className="aa-btn aa-btn-primary"
                    >
                      {isResponding ? "Mise à jour…" : "Accepter"}
                    </button>
                    <button
                      type="button"
                      disabled={isResponding}
                      onClick={() => {
                        void respondToQuote(false);
                      }}
                      className="aa-btn aa-btn-ghost"
                    >
                      Refuser
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </section>
        ) : null}

        {existingPayment ? (
          <section className="mt-6 aa-inset">
            <h2 className="font-semibold text-[var(--aa-ink)]">Paiement existant</h2>
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              {existingPayment.status === "PAID"
                ? "Paiement manuel enregistré comme payé. Aucun prestataire Mobile Money ou carte n'est encore connecté."
                : existingPayment.status === "FAILED"
                  ? "Ce paiement manuel a échoué."
                  : existingPayment.status === "REFUNDED"
                    ? "Ce paiement a été remboursé."
                    : "Paiement manuel en attente. Aucun prestataire externe n'est encore connecté."}
            </p>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="font-medium text-[var(--aa-ink-soft)]">Référence</dt>
                <dd>{existingPayment.transaction_reference || "Non renseignée"}</dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--aa-ink-soft)]">Méthode</dt>
                <dd>
                  {existingPayment.payment_method === "MANUAL" || !existingPayment.payment_method
                    ? "Paiement manuel"
                    : existingPayment.payment_method}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--aa-ink-soft)]">Montant</dt>
                <dd>{formatMoney(existingPayment.amount, existingPayment.currency)}</dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--aa-ink-soft)]">Statut</dt>
                <dd>{PAYMENT_STATUS_LABELS[existingPayment.status]}</dd>
              </div>
              <div>
                <dt className="font-medium text-[var(--aa-ink-soft)]">Date</dt>
                <dd>{formatDateTime(existingPayment.created_at)}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        {errorMessage ? <MotionAlert tone="error" message={errorMessage} className="mt-6" /> : null}

        {canCreateFixedPayment || canCreateQuotePayment ? (
          <button
            type="button"
            disabled={isCreating}
            onClick={() => {
              void createPayment();
            }}
            className="aa-btn aa-btn-primary mt-6 w-full disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isCreating ? "Enregistrement…" : "Enregistrer le paiement manuel"}
          </button>
        ) : null}

        <Link
          href="/bookings"
          className="aa-back mt-6"
        >
          Retour à mes demandes
        </Link>
        </SlideUp>
      </main>
    </div>
  );
}
