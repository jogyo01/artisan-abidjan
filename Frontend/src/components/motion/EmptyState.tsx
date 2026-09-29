"use client";

import type { ReactNode } from "react";
import { ScaleIn } from "./ScaleIn";

type EmptyStateProps = {
  title?: string;
  children: ReactNode;
  className?: string;
};

function EmptyMark() {
  return (
    <svg className="mx-auto mb-4 h-14 w-14 text-[var(--aa-terracotta)]" viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="28" fill="currentColor" opacity="0.1" />
      <path
        d="M18 42c3.5-9 7.5-14 14-14s10.5 5 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="32" cy="22" r="5" fill="none" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

export function EmptyState({ title, children, className = "" }: EmptyStateProps) {
  return (
    <ScaleIn className={`aa-empty ${className}`.trim()}>
      <EmptyMark />
      {title ? <p className="font-medium text-[var(--aa-ink)]">{title}</p> : null}
      <div className={title ? "mt-2" : undefined}>{children}</div>
    </ScaleIn>
  );
}
