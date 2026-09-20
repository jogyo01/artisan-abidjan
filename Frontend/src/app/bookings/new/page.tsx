"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ArtisanSummary = {
  id: string;
  business_name: string;
};

type ServiceOption = {
  id: string;
  name: string;
};

const inputClassName =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-950 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

function bookingErrorMessage(errorMessage: string): string {
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes("row-level security") || normalized.includes("permission")) {
    return "Vous n'avez pas l'autorisation de créer cette demande.";
  }
  if (normalized.includes("jwt") || normalized.includes("not authenticated")) {
    return "Votre session a expiré. Veuillez vous reconnecter.";
  }

  return "Impossible d'envoyer la demande. Veuillez réessayer.";
}

function NewBookingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const artisanId = searchParams.get("artisan_id")?.trim() ?? "";
  const supabase = useMemo(() => createClient(), []);

  const [artisan, setArtisan] = useState<ArtisanSummary | null>(null);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isCreated, setIsCreated] = useState(false);

  const [serviceId, setServiceId] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (cancelled) {
        return;
      }

      if (userError || !user) {
        router.replace("/auth");
        return;
      }

      if (!artisanId) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      const { data: artisanRow, error: artisanError } = await supabase
        .from("artisans")
        .select("id, business_name, is_verified")
        .eq("id", artisanId)
        .eq("is_verified", true)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      if (artisanError) {
        setErrorMessage("Impossible de charger l'artisan. Veuillez réessayer.");
        setIsLoading(false);
        return;
      }

      if (
        !artisanRow ||
        artisanRow.is_verified !== true ||
        typeof artisanRow.id !== "string" ||
        typeof artisanRow.business_name !== "string"
      ) {
        setNotFound(true);
        setIsLoading(false);
        return;
      }

      const { data: serviceRows, error: servicesError } = await supabase
        .from("services")
        .select("id, name")
        .eq("artisan_id", artisanRow.id)
        .order("name");

      if (cancelled) {
        return;
      }

      if (servicesError) {
        setErrorMessage("Impossible de charger les services de cet artisan.");
        setIsLoading(false);
        return;
      }

      setArtisan({
        id: artisanRow.id,
        business_name: artisanRow.business_name,
      });
      setServices(
        (serviceRows ?? []).flatMap((row) => {
          if (typeof row.id !== "string" || typeof row.name !== "string") {
            return [];
          }
          return [{ id: row.id, name: row.name }];
        }),
      );
      setNotFound(false);
      setIsLoading(false);
    }

    void loadPage();

    return () => {
      cancelled = true;
    };
  }, [artisanId, router, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/auth");
      return;
    }

    if (!artisan) {
      setErrorMessage("Artisan introuvable.");
      return;
    }

    const selectedServiceId = serviceId.trim();
    const trimmedAddress = address.trim();
    const trimmedDescription = description.trim();
    const scheduledDate = new Date(scheduledAt);

    if (!selectedServiceId || !services.some((service) => service.id === selectedServiceId)) {
      setErrorMessage("Veuillez sélectionner un service.");
      return;
    }

    if (trimmedAddress.length < 5) {
      setErrorMessage("Veuillez indiquer une adresse d'intervention complète.");
      return;
    }

    if (trimmedDescription.length < 10) {
      setErrorMessage("Veuillez décrire votre besoin plus précisément.");
      return;
    }

    if (!scheduledAt || Number.isNaN(scheduledDate.getTime())) {
      setErrorMessage("Veuillez choisir une date et une heure valides.");
      return;
    }

    if (scheduledDate.getTime() < Date.now()) {
      setErrorMessage("La date et l'heure doivent être dans le futur.");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: verifiedArtisan, error: artisanError } = await supabase
        .from("artisans")
        .select("id, is_verified")
        .eq("id", artisan.id)
        .eq("is_verified", true)
        .maybeSingle();

      if (artisanError || !verifiedArtisan || verifiedArtisan.is_verified !== true) {
        setErrorMessage("Cet artisan n'est plus disponible.");
        return;
      }

      const { error } = await supabase.from("bookings").insert({
        client_id: user.id,
        artisan_id: artisan.id,
        service_id: selectedServiceId,
        status: "PENDING",
        address: trimmedAddress,
        description: trimmedDescription,
        scheduled_at: scheduledDate.toISOString(),
      });

      if (error) {
        setErrorMessage(bookingErrorMessage(error.message));
        return;
      }

      setIsCreated(true);
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Chargement du formulaire…</p>
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
            Impossible de créer une demande : l&apos;artisan est absent, non vérifié, ou l&apos;identifiant
            est manquant.
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

  if (isCreated) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <main className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
          <h1 className="text-xl font-semibold text-zinc-950 dark:text-zinc-50">
            Demande envoyée
          </h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Votre demande d&apos;intervention a été transmise à {artisan.business_name}. Le statut est
            « en attente ».
          </p>
          <Link
            href={`/artisans/${artisan.id}`}
            className="mt-6 inline-flex rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            Retour à la fiche artisan
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <main className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Demander une intervention
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Demande destinée à {artisan.business_name}.
        </p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Service
            <select
              name="serviceId"
              value={serviceId}
              onChange={(event) => setServiceId(event.target.value)}
              className={inputClassName}
              required
            >
              <option value="">Choisir un service</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>

          {services.length === 0 ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Cet artisan n&apos;a pas encore publié de service.
            </p>
          ) : null}

          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Adresse d&apos;intervention
            <input
              type="text"
              name="address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className={inputClassName}
              placeholder="Quartier, rue, commune…"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Description du besoin
            <textarea
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={`${inputClassName} min-h-28`}
              placeholder="Expliquez le problème ou le travail souhaité"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Date et heure souhaitées
            <input
              type="datetime-local"
              name="scheduledAt"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              className={inputClassName}
            />
          </label>

          {errorMessage ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting || services.length === 0}
            className="mt-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {isSubmitting ? "Envoi…" : "Envoyer la demande"}
          </button>
        </form>

        <Link
          href={`/artisans/${artisan.id}`}
          className="mt-6 inline-flex text-sm font-medium text-zinc-600 transition hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Retour à la fiche artisan
        </Link>
      </main>
    </div>
  );
}

export default function NewBookingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Chargement du formulaire…</p>
        </div>
      }
    >
      <NewBookingForm />
    </Suspense>
  );
}
