"use client";

import { AnimatePresence, m } from "motion/react";
import type { ReactNode } from "react";
import { motionDuration, motionEase, scaleIn } from "@/lib/motion/tokens";

type ScaleInProps = {
  children: ReactNode;
  className?: string;
  show?: boolean;
};

export function ScaleIn({ children, className, show = true }: ScaleInProps) {
  return (
    <AnimatePresence>
      {show ? (
        <m.div
          className={className}
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={scaleIn}
          transition={{ duration: motionDuration.fast, ease: motionEase }}
        >
          {children}
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
