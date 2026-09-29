"use client";

import { MediaBackdrop } from "./MediaBackdrop";
import { HERO_MEDIA } from "@/lib/motion/media";

type VideoHeroProps = {
  className?: string;
  overlayClassName?: string;
  parallax?: boolean;
  videoSrc?: string;
  imageSrc?: string;
  imageAlt?: string;
};

export function VideoHero({
  className,
  overlayClassName = "aa-cinematic-overlay",
  parallax = true,
  videoSrc = HERO_MEDIA.videoSrc,
  imageSrc = HERO_MEDIA.imageSrc,
  imageAlt = HERO_MEDIA.imageAlt,
}: VideoHeroProps) {
  return (
    <MediaBackdrop
      className={className}
      imageSrc={imageSrc}
      imageAlt={imageAlt}
      videoSrc={videoSrc}
      overlayClassName={overlayClassName}
      priority
      parallax={parallax}
      sizes="100vw"
    />
  );
}
