"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PageHero } from "@/components/ui/AppPage";
import { AnimatedList, AnimatedListItem, HoverCard, PageSkeleton } from "@/components/motion";
import { mapCategoryRow } from "@/lib/artisan/categories";
import { createClient } from "@/lib/supabase/client";
import { HERO_MEDIA, STEP_MEDIA, tradeImageByName } from "@/lib/motion/media";

type Category = {
  id: string;
  name: string;
};

const FALLBACK_CATEGORY_NAMES = [
  "Mécanicien",
  "Électricien",
  "Plombier",
  "Couturier",
  "Cordonnier",
  "Peintre",
  "Menuisier",
  "Climatisation",
];

const TRUST_POINTS = [
  {
    title: "Artisans vérifiés",
    text: "Les fiches publiques concernent des professionnels validés par l’équipe.",
  },
  {
    title: "Avis clients",
    text: "Consultez les notes et commentaires après une intervention terminée.",
  },
  {
    title: "Messagerie intégrée",
    text: "Discutez directement avec l’artisan depuis votre demande.",
  },
  {
    title: "Notifications",
    text: "Restez informé des nouvelles demandes, messages et mises à jour.",
  },
];

type AccountRole = "CLIENT" | "ARTISAN" | "ADMIN";

type AuthenticatedHomeProps = {
  accountRole: AccountRole;
};

export function AuthenticatedHome({ accountRole }: AuthenticatedHomeProps) {
  const supabase = useMemo(() => createClient(), []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [categoriesError, setCategoriesError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCategories() {
      const { data, error } = await supabase.from("categories").select("id, name").order("name");

      if (cancelled) {
        return;
      }

      if (error) {
        setCategoriesError("Les métiers n'ont pas pu être chargés. La recherche reste disponible.");
        setCategories([]);
        setIsLoadingCategories(false);
        return;
      }

      setCategories(
        (data ?? []).flatMap((row) => {
          const category = mapCategoryRow(row);
          return category ? [category] : [];
        }),
      );
      setCategoriesError("");
      setIsLoadingCategories(false);
    }

    void loadCategories();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  const displayedCategories =
    categories.length > 0
      ? categories
      : FALLBACK_CATEGORY_NAMES.map((name) => ({ id: name, name }));

  return (
    <div className="aa-page">
      <div className="aa-panel">
        <PageHero
          imageSrc={HERO_MEDIA.imageSrc}
          imageAlt={HERO_MEDIA.imageAlt}
          kicker="Accueil"
          title="Trouvez un artisan près de chez vous"
          subtitle="Connectez-vous rapidement avec des artisans vérifiés à Abidjan."
        >
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link href="/artisans" className="aa-btn aa-btn-primary">
              Trouver un artisan
            </Link>
            {accountRole === "CLIENT" ? (
              <Link href="/auth?mode=signup&account=artisan" className="aa-btn aa-btn-ghost">
                Devenir artisan
              </Link>
            ) : accountRole === "ARTISAN" ? (
              <Link href="/artisan" className="aa-btn aa-btn-ghost">
                Mon espace artisan
              </Link>
            ) : (
              <Link href="/admin" className="aa-btn aa-btn-ghost">
                Administration
              </Link>
            )}
          </div>
        </PageHero>

        <section className="aa-card p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-[var(--aa-ink)]">Catégories</h2>
          <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
            Explorez les métiers disponibles, puis affinez votre recherche.
          </p>
          {isLoadingCategories ? (
            <PageSkeleton label="Chargement des métiers…" />
          ) : (
            <>
              {categoriesError ? (
                <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {categoriesError}
                </p>
              ) : null}
              {displayedCategories.length === 0 ? (
                <p className="aa-empty mt-6">Aucune catégorie n&apos;est encore disponible.</p>
              ) : (
                <AnimatedList className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {displayedCategories.map((category, index) => {
                    const image = tradeImageByName(category.name);
                    return (
                    <AnimatedListItem key={category.id} index={index}>
                      <HoverCard>
                        <Link
                          href={
                            categories.length > 0
                              ? `/artisans?category=${encodeURIComponent(category.id)}`
                              : "/artisans"
                          }
                          className="aa-card aa-card-hover relative flex aspect-[4/3] h-full items-end overflow-hidden px-4 py-3 text-sm font-medium text-[var(--aa-ink)]"
                        >
                          {image ? (
                            <>
                              <Image
                                src={image}
                                alt=""
                                fill
                                sizes="(max-width: 640px) 50vw, 220px"
                                quality={80}
                                className="object-cover"
                              />
                              <span className="absolute inset-0 bg-gradient-to-t from-[var(--aa-ink)]/75 via-[var(--aa-ink)]/15 to-transparent" />
                              <span className="relative z-10 text-white">{category.name}</span>
                            </>
                          ) : (
                            category.name
                          )}
                        </Link>
                      </HoverCard>
                    </AnimatedListItem>
                    );
                  })}
                </AnimatedList>
              )}
            </>
          )}
        </section>

        <section className="aa-card mt-8 p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-[var(--aa-ink)]">Comment ça fonctionne</h2>
          <AnimatedList className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4" as="ol">
            {STEP_MEDIA.map((item, index) => (
              <AnimatedListItem
                key={item.n}
                index={index}
                className="overflow-hidden rounded-2xl bg-[color-mix(in_srgb,var(--aa-sand)_55%,transparent)]"
              >
                <div className="relative aspect-[16/10]">
                  <Image
                    src={item.image}
                    alt={item.imageAlt}
                    fill
                    sizes="(max-width: 1024px) 50vw, 25vw"
                    quality={80}
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--aa-ink)]/55 to-transparent" />
                  <p className="absolute bottom-2 left-3 text-lg font-semibold text-[var(--aa-gold)]">{item.n}</p>
                </div>
                <div className="p-4">
                  <h3 className="text-base font-semibold text-[var(--aa-ink)]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--aa-ink-soft)]">{item.text}</p>
                </div>
              </AnimatedListItem>
            ))}
          </AnimatedList>
        </section>

        <section className="mt-8 mb-4">
          <h2 className="text-xl font-semibold text-[var(--aa-ink)]">Pourquoi nous faire confiance</h2>
          <AnimatedList className="mt-6 grid gap-3 sm:grid-cols-2">
            {TRUST_POINTS.map((item, index) => (
              <AnimatedListItem key={item.title} index={index} className="aa-card p-4">
                <h3 className="text-sm font-semibold text-[var(--aa-ink)]">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--aa-ink-soft)]">{item.text}</p>
              </AnimatedListItem>
            ))}
          </AnimatedList>
        </section>
      </div>
    </div>
  );
}
