"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

type CountUpProps = {
  value: number;
  className?: string;
};

export function CountUp({ value, className }: CountUpProps) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (reduced) {
      return;
    }

    const controls = animate(0, value, {
      duration: 0.7,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (next) => {
        setDisplay(Math.round(next));
      },
    });

    return () => controls.stop();
  }, [reduced, value]);

  return <span className={className}>{reduced ? value : display}</span>;
}
