export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";
export type QuoteStatus = "PENDING" | "ACCEPTED" | "REFUSED" | "EXPIRED" | "CANCELLED";
export type PriceType = "FIXED" | "STARTING_FROM" | "ON_QUOTE";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "En attente",
  PAID: "Payé",
  FAILED: "Échoué",
  REFUNDED: "Remboursé",
};

export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  PENDING: "En attente",
  ACCEPTED: "Accepté",
  REFUSED: "Refusé",
  EXPIRED: "Expiré",
  CANCELLED: "Annulé",
};

export type PaymentView = {
  id: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  payment_method: string | null;
  transaction_reference: string | null;
  quote_id: string | null;
  created_at: string;
};

export type QuoteView = {
  id: string;
  booking_id: string;
  amount: number;
  currency: string;
  status: QuoteStatus;
  description: string;
  created_at: string;
};

export function isPaymentStatus(value: string): value is PaymentStatus {
  return value in PAYMENT_STATUS_LABELS;
}

export function isQuoteStatus(value: string): value is QuoteStatus {
  return value in QUOTE_STATUS_LABELS;
}

export function isPriceType(value: string): value is PriceType {
  return value === "FIXED" || value === "STARTING_FROM" || value === "ON_QUOTE";
}

export function isBookingPayableStatus(status: string): boolean {
  return status === "ACCEPTED" || status === "IN_PROGRESS" || status === "COMPLETED";
}

export function formatMoney(amount: number, currency: string): string {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} ${currency}`;
}

export function parsePositiveAmount(raw: string): number | null {
  const normalized = raw.replace(/\s/g, "").replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.round(parsed * 100) / 100;
}

export function paymentFromUnknown(data: unknown): PaymentView | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") {
    return null;
  }
  const record = row as Record<string, unknown>;
  const status = String(record.status);
  const amount = typeof record.amount === "number" ? record.amount : Number(record.amount);
  if (!isPaymentStatus(status) || !Number.isFinite(amount)) {
    return null;
  }
  const id =
    typeof record.id === "number" || typeof record.id === "string" ? String(record.id) : "";
  if (!id) {
    return null;
  }
  return {
    id,
    amount,
    currency: typeof record.currency === "string" ? record.currency : "XOF",
    status,
    payment_method: typeof record.payment_method === "string" ? record.payment_method : null,
    transaction_reference:
      typeof record.transaction_reference === "string" ? record.transaction_reference : null,
    quote_id:
      record.quote_id === null || record.quote_id === undefined ? null : String(record.quote_id),
    created_at: String(record.created_at ?? ""),
  };
}

export function mapQuote(row: Record<string, unknown>): QuoteView | null {
  const status = String(row.status);
  const amount = typeof row.amount === "number" ? row.amount : Number(row.amount);
  const id = row.id === null || row.id === undefined ? "" : String(row.id);
  const bookingId = row.booking_id === null || row.booking_id === undefined ? "" : String(row.booking_id);
  if (!id || !bookingId || !isQuoteStatus(status) || !Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return {
    id,
    booking_id: bookingId,
    amount,
    currency: typeof row.currency === "string" ? row.currency : "XOF",
    status,
    description: typeof row.description === "string" ? row.description : "",
    created_at: String(row.created_at ?? ""),
  };
}

export function latestUsableQuote(quotes: QuoteView[]): QuoteView | null {
  const accepted = quotes.find((quote) => quote.status === "ACCEPTED");
  if (accepted) {
    return accepted;
  }
  return quotes.find((quote) => quote.status === "PENDING") ?? quotes[0] ?? null;
}
