"use client";

import { m, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useCallback, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";

function subscribeDesktop(onStoreChange: () => void) {
  const query = window.matchMedia("(pointer: fine) and (min-width: 1024px)");
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

type TiltFrameProps = {
  children: ReactNode;
  className?: string;
  intensity?: number;
};

export function TiltFrame({ children, className = "", intensity = 5 }: TiltFrameProps) {
  const reduced = useReducedMotion();
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia("(pointer: fine) and (min-width: 1024px)").matches,
    () => false,
  );
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [intensity, -intensity]), {
    stiffness: 180,
    damping: 20,
  });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-intensity, intensity]), {
    stiffness: 180,
    damping: 20,
  });
  const active = Boolean(desktop && !reduced);

  const onMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!active) {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      x.set((event.clientX - rect.left) / rect.width - 0.5);
      y.set((event.clientY - rect.top) / rect.height - 0.5);
    },
    [active, x, y],
  );

  const onLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <m.div
      className={className}
      style={active ? { rotateX, rotateY, transformPerspective: 900 } : undefined}
      onMouseMove={active ? onMove : undefined}
      onMouseLeave={active ? onLeave : undefined}
    >
      {children}
    </m.div>
  );
}
