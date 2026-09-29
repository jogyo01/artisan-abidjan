"use client";

import { AnimatedButton } from "@/components/motion";
import { ALLOWED_TRANSITIONS, requiredCurrentStatus, type AllowedNextStatus } from "@/lib/bookings/artisan";
import { artisanCanCancelStatus } from "@/lib/bookings/cancel";

type Booking = {
  id: string;
  status: "PENDING" | "ACCEPTED" | "REFUSED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
};

export function ArtisanBookingActions({
  booking,
  updatingId,
  onUpdate,
  onCancel,
}: {
  booking: Booking;
  updatingId: string | null;
  onUpdate: (booking: Booking, nextStatus: AllowedNextStatus) => void;
  onCancel?: (booking: Booking) => void;
}) {
  const disabled = updatingId === booking.id;
  const busyLabel = "Mise à jour…";
  const showCancel = Boolean(onCancel) && artisanCanCancelStatus(booking.status);

  const cancelButton = showCancel ? (
    <AnimatedButton
      type="button"
      disabled={disabled}
      onClick={() => {
        const confirmed = window.confirm("Voulez-vous vraiment annuler cette demande ?");
        if (confirmed) {
          onCancel?.(booking);
        }
      }}
      className="aa-btn aa-btn-danger"
    >
      Annuler la demande
    </AnimatedButton>
  ) : null;

  if (booking.status === "PENDING") {
    return (
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <AnimatedButton
          type="button"
          disabled={disabled}
          onClick={() => onUpdate(booking, "ACCEPTED")}
          className="aa-btn aa-btn-primary"
        >
          {disabled ? busyLabel : "Accepter"}
        </AnimatedButton>
        <AnimatedButton
          type="button"
          disabled={disabled}
          onClick={() => onUpdate(booking, "REFUSED")}
          className="aa-btn aa-btn-ghost"
        >
          Refuser
        </AnimatedButton>
      </div>
    );
  }

  if (booking.status === "ACCEPTED") {
    return (
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <AnimatedButton
          type="button"
          disabled={disabled}
          onClick={() => onUpdate(booking, "IN_PROGRESS")}
          className="aa-btn aa-btn-primary"
        >
          {disabled ? busyLabel : "Démarrer l'intervention"}
        </AnimatedButton>
        {cancelButton}
      </div>
    );
  }

  if (booking.status === "IN_PROGRESS") {
    return (
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <AnimatedButton
          type="button"
          disabled={disabled}
          onClick={() => onUpdate(booking, "COMPLETED")}
          className="aa-btn aa-btn-success"
        >
          {disabled ? busyLabel : "Terminer"}
        </AnimatedButton>
        {cancelButton}
      </div>
    );
  }

  return null;
}

export function canApplyTransition(
  currentStatus: Booking["status"],
  nextStatus: AllowedNextStatus,
): boolean {
  const expectedCurrent = requiredCurrentStatus(nextStatus);
  return (
    currentStatus === expectedCurrent &&
    (ALLOWED_TRANSITIONS[expectedCurrent] as readonly AllowedNextStatus[]).includes(nextStatus)
  );
}
