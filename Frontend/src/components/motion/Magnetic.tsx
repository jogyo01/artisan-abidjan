"use client";

import { m, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useCallback, useSyncExternalStore, type MouseEvent, type ReactNode } from "react";

function subscribeDesktop(onStoreChange: () => void) {
  const query = window.matchMedia("(pointer: fine) and (min-width: 1024px)");
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

type MagneticProps = {
  children: ReactNode;
  className?: string;
  strength?: number;
};

export function Magnetic({ children, className = "", strength = 10 }: MagneticProps) {
  const reduced = useReducedMotion();
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia("(pointer: fine) and (min-width: 1024px)").matches,
    () => false,
  );
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 240, damping: 22, mass: 0.3 });
  const springY = useSpring(y, { stiffness: 240, damping: 22, mass: 0.3 });
  const active = Boolean(desktop && !reduced);

  const onMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!active) {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const offsetX = event.clientX - rect.left - rect.width / 2;
      const offsetY = event.clientY - rect.top - rect.height / 2;
      x.set((offsetX / rect.width) * strength);
      y.set((offsetY / rect.height) * strength);
    },
    [active, strength, x, y],
  );

  const onLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <m.div
      className={`inline-flex ${className}`.trim()}
      style={active ? { x: springX, y: springY } : undefined}
      onMouseMove={active ? onMove : undefined}
      onMouseLeave={active ? onLeave : undefined}
    >
      {children}
    </m.div>
  );
}
