export type BookingStatus =
  | "PENDING"
  | "ACCEPTED"
  | "REFUSED"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING: "En attente",
  ACCEPTED: "Acceptée",
  REFUSED: "Refusée",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
  CANCELLED: "Annulée",
};

export const ALLOWED_TRANSITIONS = {
  PENDING: ["ACCEPTED", "REFUSED"],
  ACCEPTED: ["IN_PROGRESS"],
  IN_PROGRESS: ["COMPLETED"],
} as const;

export type AllowedNextStatus = "ACCEPTED" | "REFUSED" | "IN_PROGRESS" | "COMPLETED";
export type TransitionFrom = keyof typeof ALLOWED_TRANSITIONS;

export function isBookingStatus(value: string): value is BookingStatus {
  return value in BOOKING_STATUS_LABELS;
}

export function requiredCurrentStatus(nextStatus: AllowedNextStatus): TransitionFrom {
  if (nextStatus === "ACCEPTED" || nextStatus === "REFUSED") {
    return "PENDING";
  }
  if (nextStatus === "IN_PROGRESS") {
    return "ACCEPTED";
  }
  return "IN_PROGRESS";
}

export function successLabel(nextStatus: AllowedNextStatus): string {
  if (nextStatus === "ACCEPTED") {
    return "Demande acceptée.";
  }
  if (nextStatus === "REFUSED") {
    return "Demande refusée.";
  }
  if (nextStatus === "IN_PROGRESS") {
    return "Intervention démarrée.";
  }
  return "Intervention marquée comme terminée.";
}

export function bookingIdToString(value: unknown): string | null {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  return null;
}

export function formatBookingDateTime(isoDate: string): string {
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

export function bookingStatusTone(status: BookingStatus): string {
  if (status === "ACCEPTED" || status === "COMPLETED") {
    return "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200";
  }
  if (status === "REFUSED" || status === "CANCELLED") {
    return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
  }
  if (status === "IN_PROGRESS") {
    return "bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200";
  }
  return "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200";
}
