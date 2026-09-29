"use client";

import Image from "next/image";
import { m, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { StaggerContainer, StaggerItem } from "@/components/motion";
import { motionDuration, motionEase } from "@/lib/motion/tokens";

type AppPageProps = {
  children: ReactNode;
  centered?: boolean;
  className?: string;
};

export function AppPage({ children, centered = false, className = "" }: AppPageProps) {
  return (
    <div className={`aa-page ${centered ? "aa-page-center" : ""} ${className}`.trim()}>
      {children}
    </div>
  );
}

type PageHeroProps = {
  imageSrc: string;
  imageAlt: string;
  kicker?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  className?: string;
};

export function PageHero({
  imageSrc,
  imageAlt,
  kicker,
  title,
  subtitle,
  children,
  className = "",
}: PageHeroProps) {
  const reduced = useReducedMotion();

  return (
    <section className={`aa-hero ${className}`.trim()}>
      <m.div
        className="absolute inset-0"
        initial={reduced ? false : { scale: 1.06, opacity: 0.72 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: motionDuration.hero, ease: motionEase }}
      >
        <Image
          src={imageSrc}
          alt={imageAlt}
          fill
          className="object-cover"
          sizes="(max-width: 1152px) 100vw, 72rem"
          quality={80}
          preload
        />
      </m.div>
      <div className="aa-hero-overlay" />
      <StaggerContainer preset="hero" className="aa-hero-content">
        {kicker ? (
          <StaggerItem tone="hero">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--aa-gold)]">{kicker}</p>
          </StaggerItem>
        ) : null}
        <StaggerItem tone="hero">
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        </StaggerItem>
        {subtitle ? (
          <StaggerItem tone="hero">
            <p className="mt-2 text-sm leading-6 text-white/85">{subtitle}</p>
          </StaggerItem>
        ) : null}
        {children ? <StaggerItem tone="hero">{children}</StaggerItem> : null}
      </StaggerContainer>
    </section>
  );
}
