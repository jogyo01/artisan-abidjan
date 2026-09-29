"use client";

import { m } from "motion/react";
import { BOOKING_STATUS_LABELS, type BookingStatus } from "@/lib/bookings/artisan";

const FLOW = ["PENDING", "ACCEPTED", "IN_PROGRESS", "COMPLETED"] as const;

const SHORT_LABELS: Record<(typeof FLOW)[number], string> = {
  PENDING: "Attente",
  ACCEPTED: "Acceptée",
  IN_PROGRESS: "En cours",
  COMPLETED: "Terminée",
};

type StatusTrackProps = {
  status: BookingStatus;
  className?: string;
};

export function StatusTrack({ status, className = "" }: StatusTrackProps) {
  if (status === "REFUSED" || status === "CANCELLED") {
    return null;
  }

  const currentIndex = FLOW.indexOf(status as (typeof FLOW)[number]);

  return (
    <ol className={`mt-4 grid grid-cols-4 gap-1.5 ${className}`.trim()} aria-label="Parcours de la demande">
      {FLOW.map((step, index) => {
        const reached = currentIndex >= 0 && index <= currentIndex;
        const current = index === currentIndex;
        return (
          <li key={step} className="flex min-w-0 flex-col gap-1.5">
            <span className="block h-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--aa-ink)_12%,transparent)]">
              <m.span
                className="block h-full origin-left rounded-full bg-[var(--aa-terracotta)]"
                initial={false}
                animate={{ scaleX: reached ? 1 : 0, opacity: reached ? 1 : 0.4 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1], delay: current ? 0.04 : 0 }}
              />
            </span>
            <span
              className={`truncate text-[11px] font-medium tracking-wide ${
                reached ? "text-[var(--aa-ink)]" : "text-[var(--aa-ink-soft)]"
              }`}
            >
              {SHORT_LABELS[step]}
              <span className="sr-only"> — {BOOKING_STATUS_LABELS[step]}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
