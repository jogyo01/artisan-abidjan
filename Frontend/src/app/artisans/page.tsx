"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArtisansMap } from "@/components/maps/load-maps";
import { PageHero } from "@/components/ui/AppPage";
import { AnimatedList, AnimatedListItem, EmptyState, HoverCard, MotionAlert, PageSkeleton } from "@/components/motion";
import type { MapArtisanPin } from "@/components/maps/map-types";
import {
  areValidCoordinates,
  geolocationErrorMessage,
  getBrowserCoordinates,
  type GeoCoordinates,
} from "@/lib/geolocation";
import {
  DEFAULT_NEARBY_RADIUS_KM,
  NEARBY_RADIUS_KM_OPTIONS,
  type NearbyRadiusKm,
} from "@/lib/maps";
import { mapCategoryRow } from "@/lib/artisan/categories";
import { createClient } from "@/lib/supabase/client";
import { CITY_MEDIA, coverImageForTrades } from "@/lib/motion/media";

type Category = {
  id: string;
  name: string;
};

type ArtisanListItem = {
  id: string;
  business_name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  is_available: boolean;
  categoryNames: string[];
  distanceKm: number | null;
  coordinates: GeoCoordinates | null;
};

type SearchMode = "standard" | "nearby";

const inputClassName = "aa-input";

function formatDistanceKm(distanceKm: number): string {
  return `${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(distanceKm)} km`;
}

function parseDistanceKm(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function parseCoordinate(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function parseCoordinates(latitude: unknown, longitude: unknown): GeoCoordinates | null {
  const lat = parseCoordinate(latitude);
  const lng = parseCoordinate(longitude);
  if (lat === null || lng === null || !areValidCoordinates(lat, lng)) {
    return null;
  }
  return { latitude: lat, longitude: lng };
}

export default function ArtisansSearchPage() {
  return (
    <Suspense
      fallback={
        <div className="aa-page aa-page-center">
          <PageSkeleton label="Chargement des artisans…" />
        </div>
      }
    >
      <ArtisansSearchPageContent />
    </Suspense>
  );
}

function ArtisansSearchPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [categories, setCategories] = useState<Category[]>([]);
  const [artisans, setArtisans] = useState<ArtisanListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [nameQuery, setNameQuery] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("standard");
  const [isLocating, setIsLocating] = useState(false);
  const [radiusKm, setRadiusKm] = useState<NearbyRadiusKm>(DEFAULT_NEARBY_RADIUS_KM);
  const [viewerCoordinates, setViewerCoordinates] = useState<GeoCoordinates | null>(null);
  const [showMap, setShowMap] = useState(true);

  const loadCategoryNamesByArtisan = useCallback(
    async (artisanIds: string[]) => {
      const namesByArtisan = new Map<string, string[]>();
      if (artisanIds.length === 0) {
        return namesByArtisan;
      }

      const { data: links, error } = await supabase
        .from("artisan_categories")
        .select("artisan_id, category_id")
        .in("artisan_id", artisanIds);

      if (error || !links) {
        return namesByArtisan;
      }

      const categoryIds = [
        ...new Set(
          links.flatMap((link) => (typeof link.category_id === "string" ? [link.category_id] : [])),
        ),
      ];

      if (categoryIds.length === 0) {
        return namesByArtisan;
      }

      const { data: categoryRows } = await supabase
        .from("categories")
        .select("id, name")
        .in("id", categoryIds);

      const categoryNameById = new Map(
        (categoryRows ?? []).flatMap((row) =>
          typeof row.id === "string" && typeof row.name === "string" ? [[row.id, row.name]] : [],
        ),
      );

      for (const link of links) {
        if (typeof link.artisan_id !== "string" || typeof link.category_id !== "string") {
          continue;
        }
        const categoryName = categoryNameById.get(link.category_id);
        if (!categoryName) {
          continue;
        }
        const current = namesByArtisan.get(link.artisan_id) ?? [];
        if (!current.includes(categoryName)) {
          current.push(categoryName);
        }
        namesByArtisan.set(link.artisan_id, current);
      }

      return namesByArtisan;
    },
    [supabase],
  );

  const loadArtisans = useCallback(
    async (filters: { name: string; city: string; categoryId: string }) => {
      const trimmedName = filters.name.trim();
      const trimmedCity = filters.city.trim();

      let artisanIdsForCategory: string[] | null = null;

      if (filters.categoryId) {
        const { data: links, error: linksError } = await supabase
          .from("artisan_categories")
          .select("artisan_id")
          .eq("category_id", filters.categoryId);

        if (linksError) {
          return { artisans: [] as ArtisanListItem[], error: true };
        }

        artisanIdsForCategory = (links ?? []).flatMap((link) =>
          typeof link.artisan_id === "string" ? [link.artisan_id] : [],
        );

        if (artisanIdsForCategory.length === 0) {
          return { artisans: [] as ArtisanListItem[], error: false };
        }
      }

      let query = supabase
        .from("artisans")
        .select(
          "id, business_name, description, address, city, is_available, is_verified, latitude, longitude",
        )
        .eq("is_verified", true)
        .order("business_name");

      if (trimmedName) {
        query = query.ilike("business_name", `%${trimmedName}%`);
      }

      if (trimmedCity) {
        query = query.ilike("city", `%${trimmedCity}%`);
      }

      if (artisanIdsForCategory) {
        query = query.in("id", artisanIdsForCategory);
      }

      const { data, error } = await query;

      if (error) {
        return { artisans: [] as ArtisanListItem[], error: true };
      }

      const loaded = (data ?? []).flatMap((row) => {
        if (typeof row.id !== "string" || typeof row.business_name !== "string") {
          return [];
        }

        if (row.is_verified !== true) {
          return [];
        }

        return [
          {
            id: row.id,
            business_name: row.business_name,
            description: typeof row.description === "string" ? row.description : null,
            address: typeof row.address === "string" ? row.address : null,
            city: typeof row.city === "string" ? row.city : null,
            is_available: row.is_available === true,
            categoryNames: [],
            distanceKm: null,
            coordinates: parseCoordinates(row.latitude, row.longitude),
          } satisfies ArtisanListItem,
        ];
      });

      const namesByArtisan = await loadCategoryNamesByArtisan(loaded.map((artisan) => artisan.id));

      return {
        artisans: loaded.map((artisan) => ({
          ...artisan,
          categoryNames: namesByArtisan.get(artisan.id) ?? [],
        })),
        error: false,
      };
    },
    [loadCategoryNamesByArtisan, supabase],
  );

  const loadNearbyArtisans = useCallback(
    async (origin: GeoCoordinates, selectedCategoryId: string, selectedRadiusKm: number) => {
      const { data, error } = await supabase.rpc("find_nearby_artisans", {
        p_latitude: origin.latitude,
        p_longitude: origin.longitude,
        p_radius_km: selectedRadiusKm,
      });

      if (error) {
        return { artisans: [] as ArtisanListItem[], error: true };
      }

      const nearby = (Array.isArray(data) ? data : []).flatMap((row) => {
        if (!row || typeof row !== "object") {
          return [];
        }

        const record = row as Record<string, unknown>;
        if (typeof record.id !== "string" || typeof record.business_name !== "string") {
          return [];
        }
        if (record.is_verified !== true) {
          return [];
        }

        const distanceKm = parseDistanceKm(record.distance_km);
        if (distanceKm === null) {
          return [];
        }

        const coordinates = parseCoordinates(record.latitude, record.longitude);
        if (!coordinates) {
          return [];
        }

        return [
          {
            id: record.id,
            business_name: record.business_name,
            description: typeof record.description === "string" ? record.description : null,
            address: typeof record.address === "string" ? record.address : null,
            city: typeof record.city === "string" ? record.city : null,
            is_available: record.is_available === true,
            categoryNames: [],
            distanceKm,
            coordinates,
          } satisfies ArtisanListItem,
        ];
      });

      const namesByArtisan = await loadCategoryNamesByArtisan(nearby.map((artisan) => artisan.id));

      const withCategories = nearby.map((artisan) => ({
        ...artisan,
        categoryNames: namesByArtisan.get(artisan.id) ?? [],
      }));

      // La RPC find_nearby_artisans n'accepte pas de catégorie (signature existante).
      // Filtre métier côté frontend sur le jeu déjà limité par le rayon PostgreSQL.
      if (!selectedCategoryId) {
        return { artisans: withCategories, error: false };
      }

      if (withCategories.length === 0) {
        return { artisans: withCategories, error: false };
      }

      const { data: categoryLinks, error: categoryError } = await supabase
        .from("artisan_categories")
        .select("artisan_id")
        .eq("category_id", selectedCategoryId)
        .in(
          "artisan_id",
          withCategories.map((artisan) => artisan.id),
        );

      if (categoryError) {
        return { artisans: [] as ArtisanListItem[], error: true };
      }

      const allowedIds = new Set(
        (categoryLinks ?? []).flatMap((link) =>
          typeof link.artisan_id === "string" ? [link.artisan_id] : [],
        ),
      );

      return {
        artisans: withCategories.filter((artisan) => allowedIds.has(artisan.id)),
        error: false,
      };
    },
    [loadCategoryNamesByArtisan, supabase],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      const requestedCategory = searchParams.get("category")?.trim() ?? "";

      const { data: categoryRows } = await supabase.from("categories").select("id, name").order("name");

      if (cancelled) {
        return;
      }

      const loadedCategories = (categoryRows ?? []).flatMap((row) => {
        const category = mapCategoryRow(row);
        return category ? [category] : [];
      });
      setCategories(loadedCategories);

      const categoryExists = loadedCategories.some((category) => category.id === requestedCategory);
      const nextCategoryId = categoryExists ? requestedCategory : "";
      setCategoryId(nextCategoryId);

      const result = await loadArtisans({ name: "", city: "", categoryId: nextCategoryId });

      if (cancelled) {
        return;
      }

      if (result.error) {
        setErrorMessage("Impossible de charger les artisans. Veuillez réessayer.");
        setArtisans([]);
      } else {
        setArtisans(result.artisans);
      }

      setIsLoading(false);
    }

    void loadInitial();

    return () => {
      cancelled = true;
    };
  }, [loadArtisans, searchParams, supabase]);

  const mapPins: MapArtisanPin[] = useMemo(
    () =>
      artisans.flatMap((artisan) => {
        if (!artisan.coordinates) {
          return [];
        }
        return [
          {
            id: artisan.id,
            business_name: artisan.business_name,
            city: artisan.city,
            categoryLabel: artisan.categoryNames.length > 0 ? artisan.categoryNames.join(" · ") : null,
            distanceKm: artisan.distanceKm,
            coordinates: artisan.coordinates,
          },
        ];
      }),
    [artisans],
  );

  async function runNearbySearch(origin: GeoCoordinates, selectedRadiusKm: NearbyRadiusKm) {
    setSearchMode("nearby");
    setErrorMessage("");
    setIsLoading(true);

    const result = await loadNearbyArtisans(origin, categoryId, selectedRadiusKm);

    if (result.error) {
      setErrorMessage("Impossible de charger les artisans proches. Veuillez réessayer.");
      setIsLoading(false);
      return;
    }

    setArtisans(result.artisans);
    setIsLoading(false);
  }

  function handleNearbyClick() {
    setErrorMessage("");

    void (async () => {
      try {
        let origin = viewerCoordinates;
        if (!origin) {
          setIsLocating(true);
          origin = await getBrowserCoordinates();
          setViewerCoordinates(origin);
        }
        await runNearbySearch(origin, radiusKm);
      } catch (error: unknown) {
        setSearchMode("standard");
        setErrorMessage(geolocationErrorMessage(error));
      } finally {
        setIsLocating(false);
        setIsLoading(false);
      }
    })();
  }

  function applyDefaultListing(artisansList: ArtisanListItem[]) {
    setSearchMode("standard");
    setNameQuery("");
    setCityQuery("");
    setCategoryId("");
    setRadiusKm(DEFAULT_NEARBY_RADIUS_KM);
    setViewerCoordinates(null);
    setIsLocating(false);
    setErrorMessage("");
    setArtisans(artisansList);
    setIsLoading(false);
  }

  function handleResetSearch() {
    setIsLoading(true);
    setErrorMessage("");
    setSearchMode("standard");
    setNameQuery("");
    setCityQuery("");
    setCategoryId("");
    setRadiusKm(DEFAULT_NEARBY_RADIUS_KM);
    setViewerCoordinates(null);
    setIsLocating(false);

    if (searchParams.toString() !== "") {
      router.replace("/artisans");
      return;
    }

    void loadArtisans({ name: "", city: "", categoryId: "" }).then((result) => {
      if (result.error) {
        setSearchMode("standard");
        setNameQuery("");
        setCityQuery("");
        setCategoryId("");
        setRadiusKm(DEFAULT_NEARBY_RADIUS_KM);
        setViewerCoordinates(null);
        setIsLocating(false);
        setArtisans([]);
        setIsLoading(false);
        setErrorMessage("Impossible de charger les artisans. Veuillez réessayer.");
        return;
      }
      applyDefaultListing(result.artisans);
    });
  }

  return (
    <div className="aa-page">
      <main className="aa-panel-wide">
        <PageHero
          imageSrc={CITY_MEDIA.lagune.src}
          imageAlt={CITY_MEDIA.lagune.alt}
          kicker="Recherche"
          title="Trouver un artisan"
          subtitle="Recherchez un professionnel vérifié à Abidjan et dans les communes environnantes."
        />

        <form
          className="aa-card mt-6 grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault();
            setSearchMode("standard");
            setIsLoading(true);
            setErrorMessage("");
            void loadArtisans({
              name: nameQuery,
              city: cityQuery,
              categoryId,
            }).then((result) => {
              if (result.error) {
                setErrorMessage("Impossible de charger les artisans. Veuillez réessayer.");
                setArtisans([]);
              } else {
                setArtisans(result.artisans);
              }
              setIsLoading(false);
            });
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Nom professionnel
            <input
              type="search"
              name="name"
              value={nameQuery}
              onChange={(event) => setNameQuery(event.target.value)}
              className={inputClassName}
              placeholder="Ex. Atelier Kouadio"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Ville
            <input
              type="search"
              name="city"
              value={cityQuery}
              onChange={(event) => setCityQuery(event.target.value)}
              className={inputClassName}
              placeholder="Ex. Abidjan"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Métier
            <select
              name="category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className={inputClassName}
            >
              <option value="">Tous les métiers</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Rayon de proximité
            <select
              name="radius"
              value={radiusKm}
              onChange={(event) => {
                const next = Number(event.target.value);
                const matched = NEARBY_RADIUS_KM_OPTIONS.find((option) => option === next);
                if (!matched) {
                  return;
                }
                setRadiusKm(matched);
                if (searchMode === "nearby" && viewerCoordinates) {
                  void runNearbySearch(viewerCoordinates, matched);
                }
              }}
              className={inputClassName}
            >
              {NEARBY_RADIUS_KM_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option} km
                </option>
              ))}
            </select>
          </label>

          <button
            type="submit"
            className="aa-btn aa-btn-primary"
          >
            Rechercher
          </button>
          <button
            type="button"
            disabled={isLocating || isLoading}
            onClick={() => {
              handleNearbyClick();
            }}
            className="aa-btn aa-btn-ghost disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLocating ? "Récupération de la position…" : "Artisans autour de moi"}
          </button>
          <button
            type="button"
            disabled={isLocating || isLoading}
            onClick={() => {
              handleResetSearch();
            }}
            className="aa-btn aa-btn-ghost disabled:cursor-not-allowed disabled:opacity-60"
          >
            Réinitialiser
          </button>
        </form>

        {searchMode === "nearby" && !errorMessage ? (
          <p className="mt-6 text-sm text-[var(--aa-ink-soft)]">
            Artisans vérifiés dans un rayon de {radiusKm} km
            {categoryId ? ", filtrés selon le métier sélectionné" : ""}.
          </p>
        ) : null}

        {errorMessage ? (
          <MotionAlert tone="error" message={errorMessage} className="mt-6" />
        ) : null}

        <div className="mt-4 lg:hidden">
          <button
            type="button"
            onClick={() => {
              setShowMap((current) => !current);
            }}
            className="aa-btn aa-btn-ghost lg:hidden"
          >
            {showMap ? "Masquer la carte" : "Afficher la carte"}
          </button>
        </div>

        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start">
          <div className={`order-1 w-full lg:order-2 lg:w-1/2 ${showMap ? "block" : "hidden lg:block"}`}>
            {isLoading && mapPins.length === 0 ? (
              <div className="flex h-72 items-center justify-center rounded-2xl border border-[color-mix(in_srgb,var(--aa-ink)_10%,transparent)] bg-[var(--aa-card)] text-sm text-[var(--aa-ink-soft)] lg:h-[28rem]">
                {isLocating ? "Récupération de votre position…" : "Chargement de la carte…"}
              </div>
            ) : mapPins.length === 0 ? (
              <div className="flex h-72 items-center justify-center rounded-2xl border border-dashed border-[color-mix(in_srgb,var(--aa-ink)_16%,transparent)] bg-[var(--aa-card)] p-6 text-center text-sm text-[var(--aa-ink-soft)] lg:h-[28rem]">
                Aucun artisan avec une position professionnelle à afficher sur la carte. Les
                résultats listés ci-contre restent consultables.
              </div>
            ) : (
              <ArtisansMap
                artisans={mapPins}
                userPosition={searchMode === "nearby" ? viewerCoordinates : null}
                radiusKm={searchMode === "nearby" ? radiusKm : null}
              />
            )}
          </div>

          <div className="order-2 w-full lg:order-1 lg:w-1/2">
            {isLoading ? (
              <PageSkeleton
                variant="list"
                label={isLocating ? "Récupération de votre position…" : "Chargement des artisans…"}
              />
            ) : artisans.length === 0 && !errorMessage ? (
              <EmptyState title="Aucun artisan trouvé">
                <p className="text-sm">
                  {searchMode === "nearby"
                    ? `Aucun artisan vérifié trouvé dans un rayon de ${radiusKm} km. Essayez un rayon plus large ou désactivez la proximité.`
                    : "Aucun artisan vérifié ne correspond à votre recherche. Modifiez le métier, la ville ou le nom."}
                </p>
                <button
                  type="button"
                  className="aa-btn aa-btn-ghost mt-4"
                  onClick={() => {
                    handleResetSearch();
                  }}
                >
                  Réinitialiser la recherche
                </button>
              </EmptyState>
            ) : artisans.length > 0 ? (
              <AnimatedList className="grid grid-cols-1 gap-4">
                {artisans.map((artisan, index) => (
                  <AnimatedListItem key={artisan.id} index={index}>
                    <HoverCard className="aa-card aa-card-hover group overflow-hidden p-4 sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="relative aspect-[16/8] w-full overflow-hidden rounded-2xl sm:aspect-[4/5] sm:w-24 sm:shrink-0">
                        <Image
                          src={coverImageForTrades(artisan.categoryNames)}
                          alt=""
                          fill
                          sizes="(max-width: 640px) 100vw, 96px"
                          quality={80}
                          className="object-cover"
                        />
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-semibold text-[var(--aa-ink)]">
                            {artisan.business_name}
                          </h2>
                          <span
                            className={`aa-chip ${
                              artisan.is_available
                                ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
                                : "bg-[color-mix(in_srgb,var(--aa-ink)_8%,transparent)] text-[var(--aa-ink-soft)]"
                            }`}
                          >
                            {artisan.is_available ? "Disponible" : "Indisponible"}
                          </span>
                          {artisan.distanceKm !== null ? (
                            <span className="aa-chip bg-[color-mix(in_srgb,var(--aa-lagoon)_16%,transparent)] text-[var(--aa-lagoon)]">
                              {formatDistanceKm(artisan.distanceKm)}
                            </span>
                          ) : null}
                        </div>
                        {artisan.description ? (
                          <p className="mt-2 line-clamp-2 text-sm text-[var(--aa-ink-soft)]">
                            {artisan.description}
                          </p>
                        ) : null}
                        <p className="mt-3 text-sm text-[var(--aa-ink)]">
                          {artisan.city || "Ville non renseignée"}
                          {artisan.address ? ` — ${artisan.address}` : ""}
                        </p>
                        {artisan.categoryNames.length > 0 ? (
                          <p className="mt-1 text-sm text-[var(--aa-ink-soft)]">
                            {artisan.categoryNames.join(" · ")}
                          </p>
                        ) : null}
                        </div>
                      <Link
                        href={`/artisans/${artisan.id}`}
                        className="aa-btn aa-btn-primary aa-card-cta shrink-0"
                      >
                        Voir le profil
                      </Link>
                      </div>
                    </div>
                    </HoverCard>
                  </AnimatedListItem>
                ))}
              </AnimatedList>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
