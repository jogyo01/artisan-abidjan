"use client";

import Image from "next/image";
import { m, useReducedMotion } from "motion/react";
import { motionDuration, motionEase } from "@/lib/motion/tokens";

type ArtisanPageHeaderProps = {
  kicker: string;
  title: string;
  subtitle: string;
  imageSrc: string;
  imageAlt: string;
};

export function ArtisanPageHeader({
  kicker,
  title,
  subtitle,
  imageSrc,
  imageAlt,
}: ArtisanPageHeaderProps) {
  const reduced = useReducedMotion();

  return (
    <header className="aa-card mb-6 grid overflow-hidden sm:grid-cols-[minmax(0,1fr)_10.5rem]">
      <div className="p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--aa-terracotta)]">
          {kicker}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--aa-ink)]">{title}</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--aa-ink-soft)]">{subtitle}</p>
      </div>
      <m.div
        className="relative hidden min-h-[8.5rem] overflow-hidden sm:block"
        initial={reduced ? false : { scale: 1.08, opacity: 0.68 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: motionDuration.hero, ease: motionEase }}
      >
        <Image src={imageSrc} alt={imageAlt} fill className="object-cover" sizes="168px" quality={80} />
        <div className="absolute inset-0 bg-gradient-to-l from-black/25 to-[rgba(12,8,6,0.35)]" />
      </m.div>
    </header>
  );
}
