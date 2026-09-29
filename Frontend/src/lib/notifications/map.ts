import { bookingIdToString } from "@/lib/bookings/artisan";

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export function mapNotificationRow(row: Record<string, unknown>): NotificationItem | null {
  const id = bookingIdToString(row.id);
  if (!id || typeof row.title !== "string") {
    return null;
  }

  return {
    id,
    title: row.title,
    message: typeof row.message === "string" ? row.message : "",
    is_read: row.is_read === true,
    created_at: String(row.created_at ?? ""),
  };
}

export function notificationKind(title: string, message: string): string {
  const text = `${title} ${message}`.toLowerCase();
  if (text.includes("message")) {
    return "Nouveau message";
  }
  if (text.includes("annul")) {
    return "Annulation";
  }
  if (text.includes("nouvelle demande") || text.includes("nouvelle intervention")) {
    return "Nouvelle demande";
  }
  if (
    text.includes("devis") ||
    text.includes("quote")
  ) {
    return "Devis";
  }
  if (text.includes("paiement") || text.includes("payé") || text.includes("paye")) {
    return "Paiement";
  }
  if (
    text.includes("statut") ||
    text.includes("accept") ||
    text.includes("refus") ||
    text.includes("en cours") ||
    text.includes("termin")
  ) {
    return "Changement de statut";
  }
  return "Notification";
}
