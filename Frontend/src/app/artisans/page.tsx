"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { geolocationErrorMessage, getBrowserCoordinates } from "@/lib/geolocation";

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
};

type SearchMode = "standard" | "nearby";

const NEARBY_RADIUS_KM = 10;

const inputClassName =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-950 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

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

export default function ArtisansSearchPage() {
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
        .select("id, business_name, description, address, city, is_available, is_verified")
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
            } satisfies ArtisanListItem,
          ];
      });

      return { artisans: loaded, error: false };
    },
    [supabase],
  );

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

      const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));

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
    [categories, supabase],
  );

  const loadNearbyArtisans = useCallback(
    async (selectedCategoryId: string) => {
      const { latitude, longitude } = await getBrowserCoordinates();

      const { data, error } = await supabase.rpc("find_nearby_artisans", {
        p_latitude: latitude,
        p_longitude: longitude,
        p_radius_km: NEARBY_RADIUS_KM,
      });

      if (error) {
        return { artisans: [] as ArtisanListItem[], error: true, rpcFailed: true };
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
          } satisfies ArtisanListItem,
        ];
      });

      const namesByArtisan = await loadCategoryNamesByArtisan(nearby.map((artisan) => artisan.id));

      const withCategories = nearby.map((artisan) => ({
        ...artisan,
        categoryNames: namesByArtisan.get(artisan.id) ?? [],
      }));

      // La RPC n'accepte pas de catégorie (signature imposée).
      // On combine le métier sur le jeu déjà limité à 10 km par PostgreSQL,
      // sans recalculer les distances dans React.
      if (!selectedCategoryId) {
        return { artisans: withCategories, error: false, rpcFailed: false };
      }

      if (withCategories.length === 0) {
        return { artisans: withCategories, error: false, rpcFailed: false };
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
        return { artisans: [] as ArtisanListItem[], error: true, rpcFailed: false };
      }

      const allowedIds = new Set(
        (categoryLinks ?? []).flatMap((link) =>
          typeof link.artisan_id === "string" ? [link.artisan_id] : [],
        ),
      );

      return {
        artisans: withCategories.filter((artisan) => allowedIds.has(artisan.id)),
        error: false,
        rpcFailed: false,
      };
    },
    [loadCategoryNamesByArtisan, supabase],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      const [{ data: categoryRows }, result] = await Promise.all([
        supabase.from("categories").select("id, name").order("name"),
        loadArtisans({ name: "", city: "", categoryId: "" }),
      ]);

      if (cancelled) {
        return;
      }

      setCategories(
        (categoryRows ?? []).flatMap((row) => {
          if (typeof row.id !== "string" || typeof row.name !== "string") {
            return [];
          }
          return [{ id: row.id, name: row.name }];
        }),
      );

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
  }, [loadArtisans, supabase]);

  return (
    <div className="flex min-h-full flex-1 justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <main className="w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Trouver un artisan
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Recherchez un professionnel vérifié à Abidjan et dans les communes environnantes.
        </p>

        <form
          className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2"
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
          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
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

          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
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

          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200 sm:col-span-2">
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

          <button
            type="submit"
            className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Rechercher
          </button>
          <button
            type="button"
            disabled={isLocating || isLoading}
            onClick={() => {
              setSearchMode("nearby");
              setErrorMessage("");
              setIsLocating(true);
              setIsLoading(true);
              void loadNearbyArtisans(categoryId)
                .then((result) => {
                  if (result.error) {
                    setErrorMessage("Impossible de charger les artisans proches. Veuillez réessayer.");
                    setArtisans([]);
                    return;
                  }
                  setArtisans(result.artisans);
                })
                .catch((error: unknown) => {
                  setArtisans([]);
                  setErrorMessage(geolocationErrorMessage(error));
                })
                .finally(() => {
                  setIsLocating(false);
                  setIsLoading(false);
                });
            }}
            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {isLocating ? "Récupération de la position…" : "Artisans autour de moi"}
          </button>
        </form>

        {searchMode === "nearby" && !errorMessage ? (
          <p className="mt-6 text-sm text-zinc-600 dark:text-zinc-400">
            Artisans vérifiés dans un rayon de {NEARBY_RADIUS_KM} km
            {categoryId ? ", filtrés selon le métier sélectionné" : ""}.
          </p>
        ) : null}

        {errorMessage ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}

        {isLoading ? (
          <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
            {isLocating ? "Récupération de votre position…" : "Chargement des artisans…"}
          </p>
        ) : artisans.length === 0 && !errorMessage ? (
          <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
            {searchMode === "nearby"
              ? "Aucun artisan vérifié trouvé dans un rayon de 10 km."
              : "Aucun artisan vérifié ne correspond à votre recherche."}
          </p>
        ) : artisans.length > 0 ? (
          <ul className="mt-8 flex flex-col gap-4">
            {artisans.map((artisan) => (
              <li
                key={artisan.id}
                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">
                      {artisan.business_name}
                    </h2>
                    {artisan.description ? (
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        {artisan.description}
                      </p>
                    ) : null}
                    <p className="mt-3 text-sm text-zinc-800 dark:text-zinc-200">
                      {artisan.city || "Ville non renseignée"}
                      {artisan.address ? ` — ${artisan.address}` : ""}
                    </p>
                    {artisan.categoryNames.length > 0 ? (
                      <p className="mt-1 text-sm text-zinc-800 dark:text-zinc-200">
                        {artisan.categoryNames.join(" · ")}
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {artisan.is_available ? "Disponible" : "Indisponible"}
                      {artisan.distanceKm !== null ? ` · ${formatDistanceKm(artisan.distanceKm)}` : ""}
                    </p>
                  </div>
                  <Link
                    href={`/artisans/${artisan.id}`}
                    className="inline-flex items-center justify-center rounded-lg bg-zinc-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                  >
                    Voir le profil
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </main>
    </div>
  );
}
