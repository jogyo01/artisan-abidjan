"use client";

import { FormEvent, useMemo, useState } from "react";
import { formatMoney, parsePositiveAmount, QUOTE_STATUS_LABELS, type PriceType, type QuoteView } from "@/lib/payments/types";
import { createClient } from "@/lib/supabase/client";

const inputClassName = "aa-input";

export function ArtisanQuotePanel({
  bookingId,
  bookingStatus,
  priceType,
  quote,
  hasActivePayment,
  onUpdated,
}: {
  bookingId: string;
  bookingStatus: string;
  priceType: PriceType | null;
  quote: QuoteView | null;
  hasActivePayment: boolean;
  onUpdated: () => Promise<void> | void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const needsQuote = priceType === "STARTING_FROM" || priceType === "ON_QUOTE";
  const canPropose =
    needsQuote &&
    bookingStatus === "ACCEPTED" &&
    !hasActivePayment &&
    quote?.status !== "ACCEPTED" &&
    quote?.status !== "PENDING";

  if (!needsQuote) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const parsed = parsePositiveAmount(amount);
    if (parsed === null) {
      setErrorMessage("Indiquez un montant supérieur à 0.");
      return;
    }

    const numericBookingId = Number(bookingId);
    if (!Number.isSafeInteger(numericBookingId) || numericBookingId <= 0) {
      setErrorMessage("Demande invalide.");
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.rpc("artisan_create_booking_quote", {
        p_booking_id: numericBookingId,
        p_amount: parsed,
        p_description: description.trim() === "" ? null : description.trim(),
      });

      if (error) {
        setErrorMessage("Impossible d'enregistrer le devis. Veuillez réessayer.");
        return;
      }

      setAmount("");
      setDescription("");
      setSuccessMessage("Devis envoyé au client.");
      await onUpdated();
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="mt-6 aa-inset">
      <h2 className="text-sm font-semibold text-[var(--aa-ink)]">Devis</h2>
      {quote ? (
        <div className="mt-2 text-sm text-[var(--aa-ink)]">
          <p>
            {QUOTE_STATUS_LABELS[quote.status]} · {formatMoney(quote.amount, quote.currency)}
          </p>
          {quote.description ? <p className="mt-1 text-[var(--aa-ink-soft)]">{quote.description}</p> : null}
        </div>
      ) : (
        <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">Aucun devis pour le moment.</p>
      )}

      {quote?.status === "PENDING" && bookingStatus === "ACCEPTED" ? (
        <p className="mt-3 text-sm text-[var(--aa-ink-soft)]">
          Un devis est déjà en attente de la réponse du client.
        </p>
      ) : null}

      {canPropose ? (
        <form className="mt-4 flex flex-col gap-3" onSubmit={handleSubmit}>
          <p className="text-sm font-medium text-[var(--aa-ink)]">Proposer un devis</p>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Montant (XOF)
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className={inputClassName}
              inputMode="decimal"
              placeholder="Ex. 25000"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={`${inputClassName} min-h-20`}
            />
          </label>
          {errorMessage ? (
            <p className="aa-alert-error">{errorMessage}</p>
          ) : null}
          {successMessage ? (
            <p className="aa-alert-success">{successMessage}</p>
          ) : null}
          <button
            type="submit"
            disabled={isSaving}
            className="aa-btn aa-btn-primary"
          >
            {isSaving ? "Envoi…" : "Envoyer le devis"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
