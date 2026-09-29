import type { SupabaseClient } from "@supabase/supabase-js";
import { type BookingStatus } from "@/lib/bookings/artisan";

export function clientCanCancelStatus(status: BookingStatus): boolean {
  return status === "PENDING" || status === "ACCEPTED";
}

export function artisanCanCancelStatus(status: BookingStatus): boolean {
  return status === "ACCEPTED" || status === "IN_PROGRESS";
}

export function cancelBookingErrorMessage(errorMessage: string): string {
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes("not authenticated") || normalized.includes("jwt")) {
    return "Votre session a expiré. Veuillez vous reconnecter.";
  }
  if (normalized.includes("not authorized")) {
    return "Vous n'êtes pas autorisé à annuler cette demande.";
  }
  if (normalized.includes("already cancelled")) {
    return "Cette demande est déjà annulée.";
  }
  if (normalized.includes("cannot cancel pending")) {
    return "L'artisan ne peut pas annuler une demande encore en attente.";
  }
  if (normalized.includes("cannot cancel in-progress")) {
    return "Vous ne pouvez plus annuler une intervention déjà en cours.";
  }
  if (normalized.includes("cannot be cancelled") || normalized.includes("transition not allowed")) {
    return "Cette demande ne peut pas être annulée.";
  }
  if (normalized.includes("row-level security") || normalized.includes("permission")) {
    return "Vous n'avez pas l'autorisation d'annuler cette demande.";
  }

  return "Impossible d'annuler cette demande. Veuillez réessayer.";
}

export async function requestBookingCancellation(
  supabase: SupabaseClient,
  bookingId: string | number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const numericId = typeof bookingId === "number" ? bookingId : Number(bookingId);
  if (!Number.isSafeInteger(numericId) || numericId <= 0) {
    return { ok: false, message: "Demande invalide." };
  }

  const { error } = await supabase.rpc("cancel_booking", {
    p_booking_id: numericId,
  });

  if (error) {
    return { ok: false, message: cancelBookingErrorMessage(error.message) };
  }

  return { ok: true };
}
