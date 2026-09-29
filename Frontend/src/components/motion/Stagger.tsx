"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";
import {
  cardReveal,
  heroReveal,
  heroStagger,
  listStagger,
  motionDuration,
  motionEase,
} from "@/lib/motion/tokens";

type StaggerContainerProps = {
  children: ReactNode;
  className?: string;
  preset?: "list" | "hero";
};

export function StaggerContainer({ children, className, preset = "list" }: StaggerContainerProps) {
  return (
    <m.div
      className={className}
      initial="hidden"
      animate="visible"
      variants={preset === "hero" ? heroStagger : listStagger}
    >
      {children}
    </m.div>
  );
}

type StaggerItemProps = {
  children: ReactNode;
  className?: string;
  tone?: "card" | "hero";
};

export function StaggerItem({ children, className, tone = "card" }: StaggerItemProps) {
  return (
    <m.div
      className={className}
      variants={tone === "hero" ? heroReveal : cardReveal}
      transition={{ duration: tone === "hero" ? motionDuration.hero : motionDuration.base, ease: motionEase }}
    >
      {children}
    </m.div>
  );
}
