"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";
import { LIST_STAGGER_CAP, listStagger, motionDuration, motionEase, slideUp } from "@/lib/motion/tokens";

type AnimatedListProps = {
  children: ReactNode;
  className?: string;
  as?: "ul" | "ol" | "div";
};

export function AnimatedList({ children, className, as = "ul" }: AnimatedListProps) {
  const Tag = as === "ol" ? m.ol : as === "div" ? m.div : m.ul;

  return (
    <Tag className={className} initial="hidden" animate="visible" variants={listStagger}>
      {children}
    </Tag>
  );
}

type AnimatedListItemProps = {
  children: ReactNode;
  className?: string;
  index?: number;
};

export function AnimatedListItem({ children, className, index = 0 }: AnimatedListItemProps) {
  const skip = index >= LIST_STAGGER_CAP;

  return (
    <m.li
      className={className}
      layout="position"
      variants={skip ? { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } } : slideUp}
      transition={{ duration: motionDuration.fast, ease: motionEase }}
    >
      {children}
    </m.li>
  );
}
