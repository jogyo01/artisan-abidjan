"use client";

import { AnimatePresence, m } from "motion/react";
import type { ReactNode } from "react";
import { motionDuration, motionEase } from "@/lib/motion/tokens";

type AnimatedModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
};

export function AnimatedModal({ open, title, children, onClose }: AnimatedModalProps) {
  return (
    <AnimatePresence>
      {open ? (
        <m.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[color-mix(in_srgb,var(--aa-ink)_42%,transparent)] p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: motionDuration.fast, ease: motionEase }}
          onClick={onClose}
        >
          <m.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="aa-modal-title"
            className="aa-card w-full max-w-md p-6"
            initial={{ opacity: 0, scale: 0.97, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.985, y: 6 }}
            transition={{ duration: motionDuration.base, ease: motionEase }}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="aa-modal-title" className="text-lg font-semibold text-[var(--aa-ink)]">
              {title}
            </h2>
            <div className="mt-3">{children}</div>
          </m.div>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
