"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";
import { heroReveal, motionDuration, motionEase } from "@/lib/motion/tokens";

type HeroBeatProps = {
  children: ReactNode;
  beat: number;
  className?: string;
};

export function HeroBeat({ children, beat, className }: HeroBeatProps) {
  return (
    <m.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={heroReveal}
      transition={{
        duration: motionDuration.hero,
        ease: motionEase,
        delay: 0.14 + beat * 0.13,
      }}
    >
      {children}
    </m.div>
  );
}
