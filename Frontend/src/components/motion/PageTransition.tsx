"use client";

import { m } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { motionDuration, motionEase, pageEnter } from "@/lib/motion/tokens";

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <m.div
      key={pathname}
      className="flex min-h-0 flex-1 flex-col"
      initial="hidden"
      animate="visible"
      variants={pageEnter}
      transition={{ duration: motionDuration.fast, ease: motionEase }}
    >
      {children}
    </m.div>
  );
}
