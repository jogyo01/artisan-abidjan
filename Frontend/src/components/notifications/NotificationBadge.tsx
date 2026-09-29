"use client";

import { m } from "motion/react";

type NotificationBadgeProps = {
  count: number;
};

export function NotificationBadge({ count }: NotificationBadgeProps) {
  if (count <= 0) {
    return null;
  }

  const label = count > 9 ? "9+" : String(count);

  return (
    <m.span
      key={label}
      className="aa-badge-pulse inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--aa-terracotta)] px-1.5 py-0.5 text-[11px] font-semibold text-white"
      initial={{ opacity: 0, scale: 0.86 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
    >
      {label}
    </m.span>
  );
}
