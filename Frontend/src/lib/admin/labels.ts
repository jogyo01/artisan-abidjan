import type { BookingStatus } from "@/lib/bookings/artisan";

export const ROLE_LABELS = {
  CLIENT: "Client",
  ARTISAN: "Artisan",
  ADMIN: "Administrateur",
} as const;

export type UserRole = keyof typeof ROLE_LABELS;

export const PAYMENT_STATUS_LABELS = {
  PENDING: "En attente",
  PAID: "Payé",
  FAILED: "Échoué",
  REFUNDED: "Remboursé",
} as const;

export type PaymentStatus = keyof typeof PAYMENT_STATUS_LABELS;

export const PAYMENT_TRANSITIONS = {
  PENDING: ["PAID", "FAILED"],
  PAID: ["REFUNDED"],
} as const;

export type PaymentNextStatus = "PAID" | "FAILED" | "REFUNDED";

export function isUserRole(value: string): value is UserRole {
  return value === "CLIENT" || value === "ARTISAN" || value === "ADMIN";
}

export function isPaymentStatus(value: string): value is PaymentStatus {
  return value in PAYMENT_STATUS_LABELS;
}

export function canSetPaymentStatus(
  current: PaymentStatus,
  next: PaymentNextStatus,
): boolean {
  if (current === "PENDING") {
    return next === "PAID" || next === "FAILED";
  }
  if (current === "PAID") {
    return next === "REFUNDED";
  }
  return false;
}

export function paymentActionLabel(next: PaymentNextStatus): string {
  if (next === "PAID") {
    return "Marquer payé";
  }
  if (next === "FAILED") {
    return "Marquer échoué";
  }
  return "Marquer remboursé";
}

export function formatAdminDateTime(isoDate: string): string {
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

export function formatAmount(amount: number, currency: string): string {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} ${currency}`;
}

export function bookingStatusLabel(status: BookingStatus): string {
  const labels: Record<BookingStatus, string> = {
    PENDING: "En attente",
    ACCEPTED: "Acceptée",
    REFUSED: "Refusée",
    IN_PROGRESS: "En cours",
    COMPLETED: "Terminée",
    CANCELLED: "Annulée",
  };
  return labels[status];
}
