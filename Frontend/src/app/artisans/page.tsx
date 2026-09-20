"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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
};

const inputClassName =
  "w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-950 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

export default function ArtisansSearchPage() {
  const supabase = useMemo(() => createClient(), []);

  const [categories, setCategories] = useState<Category[]>([]);
  const [artisans, setArtisans] = useState<ArtisanListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [nameQuery, setNameQuery] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");

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
          } satisfies ArtisanListItem,
        ];
      });

      return { artisans: loaded, error: false };
    },
    [supabase],
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
            className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 sm:col-span-2 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Rechercher
          </button>
        </form>

        {errorMessage ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}

        {isLoading ? (
          <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">Chargement des artisans…</p>
        ) : artisans.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">
            Aucun artisan vérifié ne correspond à votre recherche.
          </p>
        ) : (
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
                    <p className="mt-1 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {artisan.is_available ? "Disponible" : "Indisponible"}
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
        )}
      </main>
    </div>
  );
}
