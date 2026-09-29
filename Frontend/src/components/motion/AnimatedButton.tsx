"use client";

import { m } from "motion/react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type AnimatedButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onAnimationStart" | "onDrag" | "onDragStart" | "onDragEnd"
> & {
  children: ReactNode;
};

export function AnimatedButton({
  children,
  className,
  type = "button",
  disabled,
  ...props
}: AnimatedButtonProps) {
  return (
    <m.button
      type={type}
      className={className}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -2, scale: 1.015 }}
      whileTap={disabled ? undefined : { scale: 0.985 }}
      transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
      {...props}
    >
      {children}
    </m.button>
  );
}
