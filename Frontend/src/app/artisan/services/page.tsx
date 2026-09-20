"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type PriceType = "FIXED" | "STARTING_FROM" | "ON_QUOTE";

type Service = {
  id: string;
  artisan_id: string;
  name: string;
  description: string | null;
  price: number | null;
  price_type: PriceType;
  created_at: string;
};

const PRICE_TYPE_LABELS: Record<PriceType, string> = {
  FIXED: "Prix fixe",
  STARTING_FROM: "À partir de",
  ON_QUOTE: "Sur devis",
};

const inputClassName =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-950 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

function isPriceType(value: string): value is PriceType {
  return value === "FIXED" || value === "STARTING_FROM" || value === "ON_QUOTE";
}

function formatFcfa(amount: number): string {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`;
}

function formatServicePrice(service: Service): string {
  if (service.price_type === "ON_QUOTE") {
    if (service.price === null) {
      return "Sur devis";
    }
    return `Sur devis (${formatFcfa(service.price)})`;
  }

  if (service.price === null) {
    return PRICE_TYPE_LABELS[service.price_type];
  }

  if (service.price_type === "STARTING_FROM") {
    return `À partir de ${formatFcfa(service.price)}`;
  }

  return formatFcfa(service.price);
}

export default function ArtisanServicesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [services, setServices] = useState<Service[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [priceType, setPriceType] = useState<PriceType>("FIXED");

  const loadServices = useCallback(async (currentArtisanId: string) => {
    const { data, error } = await supabase
      .from("services")
      .select("id, artisan_id, name, description, price, price_type, created_at")
      .eq("artisan_id", currentArtisanId)
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMessage("Impossible de charger les services.");
      return;
    }

    const loaded = (data ?? []).flatMap((row) => {
      if (typeof row.id !== "string" || typeof row.artisan_id !== "string") {
        return [];
      }
      if (typeof row.name !== "string" || !isPriceType(String(row.price_type))) {
        return [];
      }

      return [
        {
          id: row.id,
          artisan_id: row.artisan_id,
          name: row.name,
          description: typeof row.description === "string" ? row.description : null,
          price: typeof row.price === "number" ? row.price : null,
          price_type: row.price_type,
          created_at: String(row.created_at),
        } satisfies Service,
      ];
    });

    setServices(loaded);
  }, [supabase]);

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (!isMounted) {
        return;
      }

      if (userError || !user) {
        router.replace("/auth");
        return;
      }

      const { data: artisan, error: artisanError } = await supabase
        .from("artisans")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      if (artisanError || !artisan) {
        router.replace("/artisan/onboarding");
        return;
      }

      await loadServices(user.id);
      if (isMounted) {
        setIsLoading(false);
      }
    }

    void bootstrap();

    return () => {
      isMounted = false;
    };
  }, [loadServices, router, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/auth");
      return;
    }

    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const normalizedPrice = price.replace(/\s/g, "").replace(",", ".");

    if (!trimmedName) {
      setErrorMessage("Veuillez renseigner le nom du service.");
      return;
    }

    let priceValue: number | null = null;

    if (priceType === "ON_QUOTE") {
      if (normalizedPrice !== "") {
        const parsed = Number(normalizedPrice);
        if (!Number.isFinite(parsed) || parsed < 0) {
          setErrorMessage("Le prix doit être un montant valide en FCFA.");
          return;
        }
        priceValue = parsed;
      }
    } else {
      const parsed = Number(normalizedPrice);
      if (normalizedPrice === "" || !Number.isFinite(parsed) || parsed < 0) {
        setErrorMessage("Veuillez renseigner un prix en FCFA.");
        return;
      }
      priceValue = parsed;
    }

    setIsSaving(true);

    try {
      const { error } = await supabase.from("services").insert({
        artisan_id: user.id,
        name: trimmedName,
        description: trimmedDescription === "" ? null : trimmedDescription,
        price: priceValue,
        price_type: priceType,
      });

      if (error) {
        setErrorMessage("Impossible d'ajouter le service. Veuillez réessayer.");
        return;
      }

      setName("");
      setDescription("");
      setPrice("");
      setPriceType("FIXED");
      setSuccessMessage("Service ajouté.");
      await loadServices(user.id);
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(serviceId: string) {
    setErrorMessage("");
    setSuccessMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/auth");
      return;
    }

    setDeletingId(serviceId);

    try {
      const { error } = await supabase
        .from("services")
        .delete()
        .eq("id", serviceId)
        .eq("artisan_id", user.id);

      if (error) {
        setErrorMessage("Impossible de supprimer ce service.");
        return;
      }

      setSuccessMessage("Service supprimé.");
      await loadServices(user.id);
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setDeletingId(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Chargement des services…</p>
      </div>
    );
  }

  const priceRequired = priceType !== "ON_QUOTE";

  return (
    <div className="flex min-h-full flex-1 justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <main className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              Mes services
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Ajoutez les prestations que vous proposez. Les prix sont indiqués en FCFA.
            </p>
          </div>
          <Link
            href="/artisan/onboarding"
            className="inline-flex items-center justify-center rounded-lg border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            Retour au profil artisan
          </Link>
        </div>

        <form className="mt-8 flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Nom du service
            <input
              type="text"
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={inputClassName}
              placeholder="Ex. Réparation de fuite"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Description
            <textarea
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={`${inputClassName} min-h-24`}
              placeholder="Décrivez la prestation"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Type de prix
            <select
              name="priceType"
              value={priceType}
              onChange={(event) => {
                const nextType = event.target.value;
                if (isPriceType(nextType)) {
                  setPriceType(nextType);
                }
              }}
              className={inputClassName}
            >
              <option value="FIXED">Prix fixe</option>
              <option value="STARTING_FROM">À partir de</option>
              <option value="ON_QUOTE">Sur devis</option>
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Prix {priceRequired ? "(FCFA)" : "(FCFA, optionnel)"}
            <input
              type="text"
              inputMode="numeric"
              name="price"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              className={inputClassName}
              placeholder={priceRequired ? "Ex. 15000" : "Laisser vide si sur devis"}
            />
          </label>

          {errorMessage ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {errorMessage}
            </p>
          ) : null}

          {successMessage ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              {successMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSaving}
            className="rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {isSaving ? "Ajout…" : "Ajouter le service"}
          </button>
        </form>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-zinc-950 dark:text-zinc-50">Services enregistrés</h2>

          {services.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              Aucun service pour le moment.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {services.map((service) => (
                <li
                  key={service.id}
                  className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 sm:flex-row sm:items-start sm:justify-between dark:border-zinc-800"
                >
                  <div>
                    <p className="font-medium text-zinc-950 dark:text-zinc-50">{service.name}</p>
                    {service.description ? (
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                        {service.description}
                      </p>
                    ) : null}
                    <p className="mt-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {formatServicePrice(service)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void handleDelete(service.id);
                    }}
                    disabled={deletingId === service.id}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                  >
                    {deletingId === service.id ? "Suppression…" : "Supprimer"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
