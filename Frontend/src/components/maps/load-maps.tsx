"use client";

import dynamic from "next/dynamic";

const mapPlaceholder = (
  <div className="flex h-72 items-center justify-center rounded-2xl border border-[color-mix(in_srgb,var(--aa-ink)_10%,transparent)] bg-[var(--aa-card)] text-sm text-[var(--aa-ink-soft)] lg:h-[28rem]">
    Chargement de la carte…
  </div>
);

const smallMapPlaceholder = (
  <div className="flex h-56 items-center justify-center rounded-xl border border-[color-mix(in_srgb,var(--aa-ink)_10%,transparent)] bg-[var(--aa-card)] text-sm text-[var(--aa-ink-soft)]">
    Chargement de la carte…
  </div>
);

export const ArtisansMap = dynamic(() => import("@/components/maps/ArtisansMap"), {
  ssr: false,
  loading: () => mapPlaceholder,
});

export const LocationMap = dynamic(() => import("@/components/maps/LocationMap"), {
  ssr: false,
  loading: () => smallMapPlaceholder,
});
