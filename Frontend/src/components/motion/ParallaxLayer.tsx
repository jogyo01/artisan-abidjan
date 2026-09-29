"use client";

import { m, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useSyncExternalStore, type ReactNode } from "react";

function subscribeCoarse(onStoreChange: () => void) {
  const query = window.matchMedia("(max-width: 767px)");
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

type ParallaxLayerProps = {
  children?: ReactNode;
  className?: string;
  distance?: number;
};

export function ParallaxLayer({ children, className, distance = 18 }: ParallaxLayerProps) {
  const reduced = useReducedMotion();
  const compact = useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia("(max-width: 767px)").matches,
    () => true,
  );
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 480], [0, reduced || compact ? 0 : distance]);

  return (
    <m.div className={className} style={{ y }}>
      {children}
    </m.div>
  );
}
