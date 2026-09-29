"use client";

import { AnimatePresence, m } from "motion/react";
import { motionDuration, motionEase } from "@/lib/motion/tokens";

type MotionAlertProps = {
  tone: "error" | "success";
  message: string | null | undefined;
  className?: string;
};

export function MotionAlert({ tone, message, className = "" }: MotionAlertProps) {
  const toneClass = tone === "error" ? "aa-alert-error" : "aa-alert-success";

  return (
    <AnimatePresence>
      {message ? (
        <m.p
          role={tone === "error" ? "alert" : "status"}
          className={`${toneClass} ${className}`.trim()}
          initial={{ opacity: 0, y: -4 }}
          animate={
            tone === "error"
              ? { opacity: 1, y: 0, x: [0, -3, 3, -2, 0] }
              : { opacity: 1, y: 0 }
          }
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: motionDuration.fast, ease: motionEase }}
        >
          {message}
        </m.p>
      ) : null}
    </AnimatePresence>
  );
}
