"use client";

import Image from "next/image";
import Link from "next/link";
import { BrandMark } from "@/components/brand/BrandMark";
import {
  CountUp,
  HeroBeat,
  HoverCard,
  Magnetic,
  MediaBackdrop,
  ParallaxLayer,
  Reveal,
  TiltFrame,
  VideoHero,
} from "@/components/motion";
import {
  CITY_MEDIA,
  HERO_MEDIA,
  STEP_MEDIA,
  STORY_BEATS,
  TRADE_MEDIA,
} from "@/lib/motion/media";
import "@/components/public/public-landing.css";

const PILLARS = [
  { title: "Proximité", text: "Des artisans près de chez vous, dans les quartiers d’Abidjan." },
  { title: "Simplicité", text: "Un parcours clair, de la première demande jusqu’au suivi." },
  { title: "Confiance", text: "Des profils vérifiés, des avis après prestation, une messagerie intégrée." },
  { title: "Savoir-faire local", text: "Mettre en lumière les métiers et les mains qui font la ville." },
] as const;

const ADVANTAGES = [
  { title: "Artisans vérifiés", text: "Les fiches publiques concernent des professionnels validés par l’équipe." },
  { title: "Recherche de proximité", text: "Repérez des artisans autour de vous, selon le métier recherché." },
  { title: "Demandes d’intervention", text: "Expliquez le besoin une fois : l’artisan reçoit le contexte utile." },
  { title: "Messagerie intégrée", text: "Discutez du rendez-vous, des détails et des photos sans quitter la plateforme." },
  { title: "Avis et évaluations", text: "Les retours clients aident à choisir en toute transparence." },
  { title: "Tarification claire", text: "Prix fixe, à partir de, ou devis : le montant se construit dans le parcours, pas dans le flou." },
] as const;

function AuthButtons({
  primaryLabel = "Créer un compte",
  onDark = false,
}: {
  primaryLabel?: string;
  onDark?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Magnetic>
        <Link href="/auth?mode=signup" className="aa-btn aa-btn-primary">
          {primaryLabel}
        </Link>
      </Magnetic>
      <Link href="/auth" className={onDark ? "aa-btn aa-btn-ghost-on-dark" : "aa-btn aa-btn-ghost"}>
        Se connecter
      </Link>
    </div>
  );
}

export function PublicLanding() {
  return (
    <div className="aa-public flex min-h-full flex-1 flex-col overflow-x-hidden">
      <section id="accueil" className="aa-public-hero relative w-full">
        <VideoHero />
        <ParallaxLayer
          className="pointer-events-none absolute -left-16 top-24 hidden h-56 w-56 rounded-full bg-[var(--aa-gold)]/15 blur-3xl lg:block"
          distance={28}
        />
        <ParallaxLayer
          className="pointer-events-none absolute -right-10 bottom-24 hidden h-48 w-48 rounded-full bg-[var(--aa-lagoon)]/18 blur-3xl lg:block"
          distance={-16}
        />

        <div className="relative z-10 mx-auto grid min-h-[88svh] w-full max-w-6xl items-end gap-10 px-4 pb-16 pt-16 sm:px-6 sm:pb-20 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <HeroBeat beat={0}>
              <BrandMark invert className="drop-shadow-sm" />
            </HeroBeat>
            <HeroBeat beat={1}>
              <p className="aa-public-kicker mt-8 text-sm font-semibold uppercase text-[var(--aa-gold)]">
                Abidjan · Savoir-faire
              </p>
            </HeroBeat>
            <HeroBeat beat={2}>
              <h1 className="mt-5 max-w-2xl text-[2.45rem] font-semibold leading-[1.06] tracking-tight text-white sm:text-5xl lg:text-6xl">
                Le geste local, rencontré avec précision.
              </h1>
            </HeroBeat>
            <HeroBeat beat={3}>
              <p className="mt-6 max-w-lg text-lg leading-8 text-white/82">
                Artisan-Abidjan relie des particuliers à des professionnels vérifiés : mécanicien,
                couturier, électricien, menuisier — près de chez vous, dans la ville réelle.
              </p>
            </HeroBeat>
            <HeroBeat beat={4}>
              <div className="mt-8">
                <AuthButtons primaryLabel="Créer un compte" onDark />
              </div>
            </HeroBeat>
            <HeroBeat beat={5}>
              <dl className="mt-10 grid max-w-md grid-cols-2 gap-4 text-white">
                <div>
                  <dt className="text-xs uppercase tracking-[0.16em] text-white/65">Métiers présentés</dt>
                  <dd className="mt-1 text-2xl font-semibold">
                    <CountUp value={TRADE_MEDIA.length} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.16em] text-white/65">Parcours</dt>
                  <dd className="mt-1 text-2xl font-semibold">
                    <CountUp value={STEP_MEDIA.length} />
                    <span className="ml-1 text-sm font-medium text-white/70">étapes</span>
                  </dd>
                </div>
              </dl>
            </HeroBeat>
          </div>

          <HeroBeat beat={6} className="hidden lg:col-span-5 lg:block">
            <TiltFrame className="aa-photo relative ml-auto w-[78%] overflow-hidden rounded-[1.6rem] border-4 border-white/15 shadow-[0_32px_64px_-28px_rgba(8,6,4,0.7)]">
              <div className="relative aspect-[4/5]">
              <Image
                src={CITY_MEDIA.workshop.src}
                alt={CITY_MEDIA.workshop.alt}
                fill
                sizes="360px"
                quality={80}
                className="object-cover"
              />
              </div>
            </TiltFrame>
          </HeroBeat>
        </div>
      </section>

      <section aria-label="Parcours visuel" className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--aa-terracotta)]">
            L’histoire
          </p>
          <h2 className="mt-3 max-w-xl text-2xl font-semibold tracking-tight sm:text-3xl">
            Du geste à l’avis, dans la même ville.
          </h2>
        </Reveal>
        <ol className="aa-story-rail mt-8">
          {STORY_BEATS.map((beat, index) => (
            <li key={`${beat.label}-${index}`}>
              <Reveal delayMs={index * 35}>
                <article className="aa-story-beat aa-photo group">
                  <Image
                    src={beat.image}
                    alt={beat.alt}
                    fill
                    sizes="(max-width: 768px) 50vw, (max-width: 1280px) 25vw, 12vw"
                    quality={80}
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                  <p className="absolute bottom-3 left-3 right-3 text-xs font-semibold uppercase tracking-[0.12em] text-white">
                    {beat.label}
                  </p>
                </article>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <section id="mission" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-16">
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
          <Reveal className="order-2 lg:order-1 lg:col-span-6">
            <div className="aa-photo relative aspect-[4/3] overflow-hidden rounded-[2rem] shadow-[0_30px_60px_-28px_rgba(27,18,12,0.4)]">
              <Image
                src={CITY_MEDIA.workshop.src}
                alt={CITY_MEDIA.workshop.alt}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                quality={80}
                className="object-cover"
              />
            </div>
          </Reveal>
          <Reveal className="order-1 lg:order-2 lg:col-span-6" delayMs={80}>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--aa-lagoon)]">
              Pourquoi Artisan-Abidjan
            </p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              Faciliter la rencontre entre les particuliers et les artisans à Abidjan.
            </h2>
            <p className="mt-5 text-base leading-7 text-[var(--aa-ink-soft)]">
              Moins de recherche à l’aveugle, plus de liens utiles : un espace unique pour trouver
              un professionnel, expliquer le besoin, et valoriser le travail bien fait.
            </p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {PILLARS.map((item) => (
                <li key={item.title}>
                  <HoverCard>
                    <div className="rounded-2xl border border-[color-mix(in_srgb,var(--aa-ink)_10%,transparent)] bg-[var(--aa-card)] p-4 shadow-sm">
                      <h3 className="text-sm font-semibold">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-[var(--aa-ink-soft)]">{item.text}</p>
                    </div>
                  </HoverCard>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section id="metiers" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-16">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--aa-lagoon)]">
            Métiers
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Des mains, des ateliers, une ville
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--aa-ink-soft)]">
            Une sélection des savoir-faire que vous pouvez retrouver sur la plateforme.
          </p>
        </Reveal>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:grid-rows-3">
          {TRADE_MEDIA.map((trade, index) => (
            <Reveal key={trade.name} delayMs={index * 45} className={`h-full ${trade.span}`}>
              <HoverCard className="h-full">
                <article className="aa-card-lift aa-photo aa-trade-tile group relative h-full overflow-hidden rounded-3xl">
                  <div className="absolute inset-0">
                    <Image
                      src={trade.image}
                      alt={trade.alt}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                      quality={80}
                      className="object-cover"
                    />
                  </div>
                  <div className="aa-trade-overlay absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                  <h3 className="aa-trade-name absolute bottom-4 left-4 text-lg font-semibold text-white drop-shadow">
                    {trade.name}
                  </h3>
                  <Link href="/artisans" className="aa-trade-cta">
                    Voir les artisans
                  </Link>
                </article>
              </HoverCard>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="parcours" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--aa-terracotta)]">
            Comment ça fonctionne
          </p>
          <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Un parcours, quatre temps
          </h2>
        </Reveal>
        <ol className="mt-10 grid gap-5 md:grid-cols-2">
          {STEP_MEDIA.map((step, index) => (
            <li key={step.n} className={index % 2 === 1 ? "md:translate-y-8" : undefined}>
              <Reveal delayMs={index * 70}>
                <HoverCard>
                  <article className="aa-card-lift overflow-hidden rounded-3xl bg-[var(--aa-card)] shadow-[0_18px_40px_-24px_rgba(27,18,12,0.35)]">
                    <div className="aa-step-photo aa-photo">
                      <Image
                        src={step.image}
                        alt={step.imageAlt}
                        fill
                        sizes="(max-width: 768px) 100vw, 50vw"
                        quality={80}
                        className="object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                      <span className="absolute bottom-3 left-4 text-3xl font-semibold text-[var(--aa-gold)]">
                        {step.n}
                      </span>
                    </div>
                    <div className="p-6 md:p-8">
                      <h3 className="text-xl font-semibold">{step.title}</h3>
                      <p className="mt-3 text-sm leading-7 text-[var(--aa-ink-soft)]">{step.text}</p>
                    </div>
                  </article>
                </HoverCard>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <section id="abidjan" className="relative mx-auto mt-4 w-full max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="relative min-h-[420px] overflow-hidden rounded-[2rem]">
            <MediaBackdrop
              imageSrc={CITY_MEDIA.lagune.src}
              imageAlt={CITY_MEDIA.lagune.alt}
              parallax
              sizes="(max-width: 1152px) 100vw, 72rem"
              overlayClassName="absolute inset-0 bg-gradient-to-r from-black/78 via-black/45 to-black/18"
            />
            <div className="relative z-10 flex min-h-[420px] max-w-xl flex-col justify-end p-8 sm:p-12">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--aa-gold)]">
                Proximité
              </p>
              <h2 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-4xl">
                Une ville vaste. Un professionnel, tout près.
              </h2>
              <p className="mt-4 text-base leading-7 text-white/85">
                Cocody, Yopougon, Marcory, Abobo, Plateau… l’idée n’est pas de tout centraliser,
                c’est de raccourcir la distance entre un besoin et un atelier. La géolocalisation
                sert à ça : voir qui travaille autour de vous, pas à afficher des classements
                inventés.
              </p>
            </div>
          </div>
        </Reveal>
      </section>

      <section id="confiance" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="grid items-end gap-8 lg:grid-cols-12">
          <Reveal className="lg:col-span-7">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--aa-terracotta)]">
              Confiance
            </p>
            <h2 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Vérifié, suivi, évalué
            </h2>
          </Reveal>
          <Reveal className="hidden overflow-hidden rounded-[1.6rem] lg:col-span-5 lg:block" delayMs={60}>
            <div className="aa-photo relative aspect-[16/10]">
              <Image
                src={TRADE_MEDIA.find((trade) => trade.name === "Couturier")?.image ?? CITY_MEDIA.workshop.src}
                alt="Finition soignée : la confiance se lit dans le geste"
                fill
                sizes="(max-width: 1024px) 100vw, 40vw"
                quality={80}
                className="object-cover"
              />
            </div>
          </Reveal>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-6">
          {ADVANTAGES.map((item, index) => (
            <Reveal
              key={item.title}
              delayMs={index * 50}
              className={index < 2 ? "md:col-span-3" : "md:col-span-2"}
            >
              <HoverCard className="h-full">
                <article className="aa-card-lift h-full rounded-3xl border border-[color-mix(in_srgb,var(--aa-ink)_8%,transparent)] bg-[var(--aa-card)] p-6 shadow-[0_16px_40px_-28px_rgba(27,18,12,0.4)]">
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-[var(--aa-ink-soft)]">{item.text}</p>
                </article>
              </HoverCard>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="vision" className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 lg:py-20">
        <Reveal>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--aa-lagoon)]">
            Vision
          </p>
          <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-[2.6rem]">
            Faciliter l’accès aux services, et donner plus de visibilité aux artisans locaux.
          </h2>
          <p className="mt-6 text-lg leading-8 text-[var(--aa-ink-soft)]">
            Trop souvent, trouver un plombier, un couturier ou un mécanicien passe encore par le
            bouche-à-oreille pressé. Artisan-Abidjan veut un autre réflexe : un profil clair, une
            demande précise, un suivi jusqu’à l’avis. Pour les artisans, c’est aussi une vitrine —
            être trouvable pour ce qu’ils savent faire, dans leur ville.
          </p>
        </Reveal>
      </section>

      <section className="px-4 pb-20 sm:px-6">
        <Reveal>
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2rem] px-6 py-14 text-[var(--aa-cream)] sm:px-12 sm:py-16">
            <Image
              src={HERO_MEDIA.imageSrc}
              alt=""
              fill
              sizes="(max-width: 1152px) 100vw, 72rem"
              quality={80}
              className="object-cover"
            />
            <div className="absolute inset-0 bg-[var(--aa-ink)]/82" />
            <div className="relative z-10">
              <h2 className="max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                Votre prochain artisan est peut-être à quelques minutes de vous.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-[color-mix(in_srgb,var(--aa-cream)_78%,transparent)]">
                Créez un compte pour chercher, demander, échanger — ou pour faire connaître votre
                atelier.
              </p>
              <div className="mt-8">
                <Magnetic>
                  <Link href="/auth?mode=signup" className="aa-btn aa-btn-primary">
                    Créer mon compte
                  </Link>
                </Magnetic>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
