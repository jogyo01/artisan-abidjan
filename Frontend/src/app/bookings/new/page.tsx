"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { bookingIdToString } from "@/lib/bookings/artisan";
import { MotionAlert, PageSkeleton, SlideUp } from "@/components/motion";
import {
  geolocationErrorMessage,
  getBrowserCoordinates,
  type GeoCoordinates,
} from "@/lib/geolocation";

type ArtisanSummary = {
  id: string;
  business_name: string;
};

type ServiceOption = {
  id: string;
  name: string;
};

const inputClassName = "aa-input";

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
  const [coordinates, setCoordinates] = useState<GeoCoordinates | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState("");

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
          const id = bookingIdToString(row.id);
          if (!id || typeof row.name !== "string") {
            return [];
          }
          return [{ id, name: row.name }];
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
        ...(coordinates
          ? { latitude: coordinates.latitude, longitude: coordinates.longitude }
          : {}),
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

  async function handleUseLocation() {
    setLocationError("");
    setIsLocating(true);

    try {
      const nextCoordinates = await getBrowserCoordinates();
      setCoordinates(nextCoordinates);
    } catch (error) {
      setCoordinates(null);
      setLocationError(geolocationErrorMessage(error));
    } finally {
      setIsLocating(false);
    }
  }

  if (isLoading) {
    return (
      <div className="aa-page aa-page-center">
        <PageSkeleton label="Chargement du formulaire…" />
      </div>
    );
  }

  if (notFound || !artisan) {
    return (
      <div className="aa-page aa-page-center">
        <main className="w-full max-w-lg aa-card p-6 text-center sm:p-8">
          <h1 className="text-xl font-semibold text-[var(--aa-ink)]">
            Artisan introuvable
          </h1>
          <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
            Impossible de créer une demande : l&apos;artisan est absent, non vérifié, ou l&apos;identifiant
            est manquant.
          </p>
          <Link
            href="/artisans"
            className="aa-btn aa-btn-ghost mt-6"
          >
            Retour à la recherche
          </Link>
        </main>
      </div>
    );
  }

  if (isCreated) {
    return (
      <div className="aa-page aa-page-center">
        <main className="w-full max-w-lg aa-card p-6 text-center sm:p-8">
          <h1 className="text-xl font-semibold text-[var(--aa-ink)]">
            Demande envoyée
          </h1>
          <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
            Votre demande d&apos;intervention a été transmise à {artisan.business_name}. Le statut est
            « en attente ».
          </p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <Link
              href="/bookings"
              className="aa-btn aa-btn-primary"
            >
              Voir mes demandes
            </Link>
            <Link
              href={`/artisans/${artisan.id}`}
              className="aa-back"
            >
              Retour à la fiche artisan
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="aa-page">
      <main className="w-full max-w-lg aa-card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--aa-ink)]">
          Demander une intervention
        </h1>
        <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
          Demande destinée à un artisan vérifié.
        </p>

        <ol className="aa-steps mt-6">
          <li className="aa-step">
            <p className="aa-step-n">01</p>
            <p className="mt-1 text-sm font-semibold text-[var(--aa-ink)]">Artisan</p>
          </li>
          <li className="aa-step">
            <p className="aa-step-n">02</p>
            <p className="mt-1 text-sm font-semibold text-[var(--aa-ink)]">Service</p>
          </li>
          <li className="aa-step">
            <p className="aa-step-n">03</p>
            <p className="mt-1 text-sm font-semibold text-[var(--aa-ink)]">Lieu &amp; détail</p>
          </li>
          <li className="aa-step">
            <p className="aa-step-n">04</p>
            <p className="mt-1 text-sm font-semibold text-[var(--aa-ink)]">Confirmation</p>
          </li>
        </ol>

        <div className="aa-inset mt-6">
          <p className="aa-kicker">Artisan sélectionné</p>
          <p className="mt-1 text-base font-semibold text-[var(--aa-ink)]">
            {artisan.business_name}
          </p>
        </div>

        <SlideUp>
        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Service <span className="font-normal text-[var(--aa-ink-soft)]">(obligatoire)</span>
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
            <p className="text-sm text-[var(--aa-ink-soft)]">
              Cet artisan n&apos;a pas encore publié de service.
            </p>
          ) : null}

          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Adresse d&apos;intervention <span className="font-normal text-[var(--aa-ink-soft)]">(obligatoire)</span>
            <input
              type="text"
              name="address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className={inputClassName}
              placeholder="Quartier, rue, commune…"
            />
          </label>

          <section className="rounded-xl border border-[color-mix(in_srgb,var(--aa-ink)_8%,transparent)] p-4">
            <h2 className="text-sm font-semibold text-[var(--aa-ink)]">
              Localisation de l&apos;intervention
            </h2>
            <p className="mt-1 text-sm font-normal text-[var(--aa-ink-soft)]">
              Optionnel. L&apos;adresse texte reste obligatoire.
            </p>
            <button
              type="button"
              onClick={() => {
                void handleUseLocation();
              }}
              disabled={isLocating}
              className="aa-btn aa-btn-ghost mt-3"
            >
              {isLocating ? "Récupération…" : "Utiliser ma position"}
            </button>
            {coordinates ? (
              <p className="mt-3 text-sm font-medium text-[var(--aa-ink)]">
                Position de l&apos;intervention enregistrée
              </p>
            ) : null}
            {locationError ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-normal text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                {locationError}
              </p>
            ) : null}
          </section>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Description du besoin <span className="font-normal text-[var(--aa-ink-soft)]">(obligatoire)</span>
            <textarea
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={`${inputClassName} min-h-28`}
              placeholder="Expliquez le problème ou le travail souhaité"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Date et heure souhaitées <span className="font-normal text-[var(--aa-ink-soft)]">(obligatoire)</span>
            <input
              type="datetime-local"
              name="scheduledAt"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              className={inputClassName}
            />
          </label>

          {errorMessage ? (
            <MotionAlert tone="error" message={errorMessage} />
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting || services.length === 0}
            className="aa-btn aa-btn-primary mt-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Envoi…" : "Envoyer la demande"}
          </button>
        </form>
        </SlideUp>

        <Link
          href={`/artisans/${artisan.id}`}
          className="aa-back mt-6"
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
        <div className="aa-page aa-page-center">
          <PageSkeleton label="Chargement du formulaire…" />
        </div>
      }
    >
      <NewBookingForm />
    </Suspense>
  );
}
