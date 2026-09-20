"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type PriceType = "FIXED" | "STARTING_FROM" | "ON_QUOTE";

type ArtisanDetail = {
  id: string;
  business_name: string;
  description: string | null;
  address: string | null;
  city: string | null;
  is_available: boolean;
};

type ArtisanService = {
  id: string;
  name: string;
  description: string | null;
  price: number | null;
  price_type: PriceType;
};

function isPriceType(value: string): value is PriceType {
  return value === "FIXED" || value === "STARTING_FROM" || value === "ON_QUOTE";
}

function formatFcfa(amount: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`;
}

function formatServicePrice(service: ArtisanService): string {
  if (service.price_type === "ON_QUOTE") {
    return "Sur devis";
  }

  if (service.price === null) {
    return service.price_type === "STARTING_FROM" ? "À partir de —" : "Prix non renseigné";
  }

  if (service.price_type === "STARTING_FROM") {
    return `À partir de ${formatFcfa(service.price)}`;
  }

  return formatFcfa(service.price);
}

export default function ArtisanPublicProfilePage() {
  const params = useParams<{ id: string }>();
  const artisanId = typeof params.id === "string" ? params.id : "";
  const supabase = useMemo(() => createClient(), []);

  const [artisan, setArtisan] = useState<ArtisanDetail | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [services, setServices] = useState<ArtisanService[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadArtisan() {
      if (!artisanId) {
        await Promise.resolve();
        if (cancelled) {
          return;
        }
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      const { data: artisanRow, error: artisanError } = await supabase
        .from("artisans")
        .select("id, business_name, description, address, city, is_available, is_verified")
        .eq("id", artisanId)
        .eq("is_verified", true)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (artisanError) {
        setErrorMessage("Impossible de charger cette fiche artisan.");
        setArtisan(null);
        setIsLoading(false);
        return;
      }

      if (!artisanRow || artisanRow.is_verified !== true || typeof artisanRow.id !== "string") {
        setNotFound(true);
        setArtisan(null);
        setIsLoading(false);
        return;
      }

      if (typeof artisanRow.business_name !== "string") {
        setNotFound(true);
        setArtisan(null);
        setIsLoading(false);
        return;
      }

      const [{ data: categoryLinks }, { data: serviceRows, error: servicesError }] =
        await Promise.all([
          supabase.from("artisan_categories").select("category_id").eq("artisan_id", artisanId),
          supabase
            .from("services")
            .select("id, name, description, price, price_type")
            .eq("artisan_id", artisanId)
            .order("name"),
        ]);

      if (cancelled) {
        return;
      }

      const categoryIds = (categoryLinks ?? []).flatMap((link) =>
        typeof link.category_id === "string" ? [link.category_id] : [],
      );

      let categoryNames: string[] = [];
      if (categoryIds.length > 0) {
        const { data: categoryRows } = await supabase
          .from("categories")
          .select("id, name")
          .in("id", categoryIds)
          .order("name");

        categoryNames = (categoryRows ?? []).flatMap((row) =>
          typeof row.name === "string" ? [row.name] : [],
        );
      }

      if (cancelled) {
        return;
      }

      if (servicesError) {
        setErrorMessage("Le profil a été chargé, mais les services sont indisponibles.");
      }

      setArtisan({
        id: artisanRow.id,
        business_name: artisanRow.business_name,
        description: typeof artisanRow.description === "string" ? artisanRow.description : null,
        address: typeof artisanRow.address === "string" ? artisanRow.address : null,
        city: typeof artisanRow.city === "string" ? artisanRow.city : null,
        is_available: artisanRow.is_available === true,
      });
      setCategories(categoryNames);
      setServices(
        (serviceRows ?? []).flatMap((row) => {
          if (typeof row.id !== "string" || typeof row.name !== "string") {
            return [];
          }
          if (!isPriceType(String(row.price_type))) {
            return [];
          }

          return [
            {
              id: row.id,
              name: row.name,
              description: typeof row.description === "string" ? row.description : null,
              price: typeof row.price === "number" ? row.price : null,
              price_type: row.price_type,
            } satisfies ArtisanService,
          ];
        }),
      );
      setNotFound(false);
      setIsLoading(false);
    }

    void loadArtisan();

    return () => {
      cancelled = true;
    };
  }, [artisanId, supabase]);

  if (isLoading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Chargement de la fiche artisan…</p>
      </div>
    );
  }

  if (notFound || !artisan) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <main className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            Artisan introuvable
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Ce professionnel n&apos;existe pas ou n&apos;est pas encore vérifié.
          </p>
          <Link
            href="/artisans"
            className="mt-6 inline-flex rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Retour à la recherche
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <main className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <Link
          href="/artisans"
          className="inline-flex text-sm font-medium text-zinc-600 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          ← Retour à la recherche
        </Link>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          {artisan.business_name}
        </h1>

        {artisan.description ? (
          <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-400">
            {artisan.description}
          </p>
        ) : null}

        <dl className="mt-6 space-y-3 rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-900">
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">Ville</dt>
            <dd className="mt-0.5 text-zinc-950 dark:text-zinc-50">
              {artisan.city || "Non renseignée"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">Adresse</dt>
            <dd className="mt-0.5 text-zinc-950 dark:text-zinc-50">
              {artisan.address || "Non renseignée"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">Disponibilité</dt>
            <dd className="mt-0.5 text-zinc-950 dark:text-zinc-50">
              {artisan.is_available ? "Disponible" : "Indisponible"}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">Métier</dt>
            <dd className="mt-0.5 text-zinc-950 dark:text-zinc-50">
              {categories.length > 0 ? categories.join(", ") : "Non renseigné"}
            </dd>
          </div>
        </dl>

        {errorMessage ? (
          <p className="mt-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}

        <section className="mt-8">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Services</h2>
          {services.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              Aucun service n&apos;est encore publié.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {services.map((service) => (
                <li
                  key={service.id}
                  className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <p className="font-medium text-zinc-950 dark:text-zinc-50">{service.name}</p>
                  {service.description ? (
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {service.description}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                    {formatServicePrice(service)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/bookings/new?artisan_id=${artisan.id}`}
            className="inline-flex items-center justify-center rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Demander une intervention
          </Link>
          <Link
            href="/artisans"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Retour à la recherche
          </Link>
        </div>
      </main>
    </div>
  );
}
