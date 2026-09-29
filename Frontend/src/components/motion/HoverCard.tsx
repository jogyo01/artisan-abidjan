"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";

type HoverCardProps = {
  children: ReactNode;
  className?: string;
};

export function HoverCard({ children, className = "" }: HoverCardProps) {
  return (
    <m.div
      className={className}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.995 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </m.div>
  );
}
