"use client";

import Image from "next/image";
import { m, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useState, useSyncExternalStore } from "react";

function subscribeCoarse(onStoreChange: () => void) {
  const query = window.matchMedia("(max-width: 767px)");
  query.addEventListener("change", onStoreChange);
  return () => query.removeEventListener("change", onStoreChange);
}

type MediaBackdropProps = {
  imageSrc: string;
  imageAlt: string;
  videoSrc?: string;
  className?: string;
  overlayClassName?: string;
  priority?: boolean;
  parallax?: boolean;
  sizes?: string;
};

export function MediaBackdrop({
  imageSrc,
  imageAlt,
  videoSrc,
  className = "",
  overlayClassName = "aa-cinematic-overlay",
  priority = false,
  parallax = false,
  sizes = "100vw",
}: MediaBackdropProps) {
  const reduced = useReducedMotion();
  const compact = useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia("(max-width: 767px)").matches,
    () => true,
  );
  const [videoFailed, setVideoFailed] = useState(false);
  const { scrollY } = useScroll();
  const mediaDistance = reduced || compact || !parallax ? 0 : 22;
  const overlayDistance = reduced || compact || !parallax ? 0 : 8;
  const mediaY = useTransform(scrollY, [0, 420], [0, mediaDistance]);
  const overlayY = useTransform(scrollY, [0, 420], [0, overlayDistance]);
  const showVideo = Boolean(videoSrc) && !videoFailed && !compact && !reduced;

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`.trim()}>
      <m.div className="absolute -inset-y-10 inset-x-0" style={{ y: mediaY }}>
        <div className="relative h-full w-full">
          <Image
            src={imageSrc}
            alt={imageAlt}
            fill
            preload={priority}
            sizes={sizes}
            quality={80}
            className="object-cover"
          />
          {showVideo ? (
            <video
              className="absolute inset-0 h-full w-full object-cover"
              autoPlay
              muted
              loop
              playsInline
              preload={priority ? "metadata" : "none"}
              poster={imageSrc}
              aria-hidden
              onError={() => setVideoFailed(true)}
            >
              <source src={videoSrc ?? ""} type="video/mp4" />
            </video>
          ) : null}
        </div>
      </m.div>
      <m.div className={`${overlayClassName} pointer-events-none`} style={{ y: overlayY }} />
    </div>
  );
}
