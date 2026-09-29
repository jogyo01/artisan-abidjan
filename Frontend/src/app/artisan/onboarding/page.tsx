"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageSkeleton, SlideUp } from "@/components/motion";
import {
  geolocationErrorMessage,
  getBrowserCoordinates,
  isGeolocationPermissionDenied,
  type GeoCoordinates,
} from "@/lib/geolocation";

type Category = {
  id: string;
  name: string;
};

type ArtisanRow = {
  id: string;
};

const inputClassName = "aa-input";

export default function ArtisanOnboardingPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [categories, setCategories] = useState<Category[]>([]);
  const [existingArtisan, setExistingArtisan] = useState<ArtisanRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [businessName, setBusinessName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Abidjan");
  const [phone, setPhone] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [categoryId, setCategoryId] = useState("");
  const [coordinates, setCoordinates] = useState<GeoCoordinates | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationLaterMessage, setLocationLaterMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadOnboarding() {
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

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, phone")
        .eq("id", user.id)
        .maybeSingle();

      if (!isMounted) {
        return;
      }

      if (profile?.role !== "ARTISAN") {
        router.replace("/");
        return;
      }

      const [{ data: artisan }, { data: categoryRows, error: categoryError }] =
        await Promise.all([
          supabase.from("artisans").select("id").eq("id", user.id).maybeSingle(),
          supabase.from("categories").select("id, name").order("name"),
        ]);

      if (!isMounted) {
        return;
      }

      if (categoryError) {
        setLoadError("Impossible de charger les métiers. Veuillez réessayer.");
        setIsLoading(false);
        return;
      }

      setPhone(typeof profile.phone === "string" ? profile.phone : "");
      setExistingArtisan(artisan);
      setCategories(categoryRows ?? []);

      if (artisan) {
        router.replace("/artisan");
        return;
      }

      setIsLoading(false);
    }

    void loadOnboarding();

    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

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

    if (existingArtisan) {
      setSuccessMessage(
        "Votre profil artisan est déjà enregistré. Il doit être vérifié par l'équipe avant d'être visible.",
      );
      return;
    }

    const trimmedBusinessName = businessName.trim();
    const trimmedDescription = description.trim();
    const trimmedAddress = address.trim();
    const trimmedCity = city.trim() || "Abidjan";
    const trimmedPhone = phone.trim();

    if (!trimmedBusinessName || !trimmedDescription || !trimmedAddress || !trimmedPhone) {
      setErrorMessage("Veuillez renseigner tous les champs obligatoires.");
      return;
    }

    if (!categoryId) {
      setErrorMessage("Veuillez choisir un métier.");
      return;
    }

    setIsSaving(true);

    try {
      const { data: artisan, error: artisanError } = await supabase
        .from("artisans")
        .insert({
          id: user.id,
          business_name: trimmedBusinessName,
          description: trimmedDescription,
          address: trimmedAddress,
          city: trimmedCity,
          phone: trimmedPhone,
          is_available: isAvailable,
          ...(coordinates
            ? { latitude: coordinates.latitude, longitude: coordinates.longitude }
            : {}),
        })
        .select("id")
        .single();

      if (artisanError || !artisan) {
        setErrorMessage("Impossible d'enregistrer le profil artisan. Veuillez réessayer.");
        return;
      }

      const { error: linkError } = await supabase.from("artisan_categories").insert({
        artisan_id: user.id,
        category_id: categoryId,
      });

      if (linkError) {
        setErrorMessage(
          "Le profil a été créé, mais le métier n'a pas pu être associé. Veuillez réessayer plus tard.",
        );
        setExistingArtisan(artisan);
        return;
      }

      setExistingArtisan(artisan);
      setSuccessMessage(
        "Profil artisan enregistré. Il doit être vérifié par l'équipe avant d'être visible sur la plateforme.",
      );
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUseLocation() {
    setLocationError("");
    setLocationLaterMessage("");
    setIsLocating(true);

    try {
      const nextCoordinates = await getBrowserCoordinates();
      setCoordinates(nextCoordinates);
    } catch (error) {
      setCoordinates(null);
      setLocationError(geolocationErrorMessage(error));
      if (isGeolocationPermissionDenied(error)) {
        setLocationLaterMessage("La localisation pourra être ajoutée plus tard.");
      }
    } finally {
      setIsLocating(false);
    }
  }

  if (isLoading) {
    return (
      <div className="aa-page aa-page-center">
        <PageSkeleton label="Chargement…" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="aa-page aa-page-center">
        <p className="text-sm text-red-700 dark:text-red-300">{loadError}</p>
      </div>
    );
  }

  const isCompleted = Boolean(existingArtisan);

  return (
    <div className="aa-page aa-page-center">
      <main className="w-full max-w-lg aa-card p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--aa-ink)]">
          Profil professionnel
        </h1>
        <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
          Complétez vos informations artisan. La vérification sera effectuée par l&apos;équipe.
        </p>

        <SlideUp>
        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Nom de l&apos;entreprise ou nom professionnel{" "}
            <span className="font-normal text-[var(--aa-ink-soft)]">(obligatoire)</span>
            <input
              type="text"
              name="businessName"
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              className={inputClassName}
              disabled={isCompleted}
              placeholder="Ex. Atelier Kouadio"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Description <span className="font-normal text-[var(--aa-ink-soft)]">(obligatoire)</span>
            <textarea
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={`${inputClassName} min-h-28`}
              disabled={isCompleted}
              placeholder="Présentez votre activité"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Adresse <span className="font-normal text-[var(--aa-ink-soft)]">(obligatoire)</span>
            <input
              type="text"
              name="address"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              className={inputClassName}
              disabled={isCompleted}
              placeholder="Quartier, rue…"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Ville
            <input
              type="text"
              name="city"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className={inputClassName}
              disabled={isCompleted}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Téléphone <span className="font-normal text-[var(--aa-ink-soft)]">(obligatoire)</span>
            <input
              type="tel"
              name="phone"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={inputClassName}
              disabled={isCompleted}
              placeholder="Ex. 07 00 00 00 00"
            />
          </label>

          <label className="flex items-center gap-2 text-sm font-medium text-[var(--aa-ink)]">
            <input
              type="checkbox"
              name="isAvailable"
              checked={isAvailable}
              onChange={(event) => setIsAvailable(event.target.checked)}
              disabled={isCompleted}
              className="h-4 w-4"
            />
            Je suis disponible
          </label>

          <section className="aa-card p-4">
            <h2 className="text-sm font-semibold text-[var(--aa-ink)]">Localisation</h2>
            <p className="mt-1 text-sm font-normal text-[var(--aa-ink-soft)]">
              Votre position sert à permettre aux clients de trouver votre activité à proximité.
              Elle n&apos;est jamais obligatoire.
            </p>
            <button
              type="button"
              onClick={() => {
                void handleUseLocation();
              }}
              disabled={isCompleted || isLocating}
              className="aa-btn aa-btn-ghost mt-3"
            >
              {isLocating ? "Récupération…" : "Utiliser ma position"}
            </button>
            {coordinates ? (
              <p className="mt-3 text-sm font-normal text-[var(--aa-ink)]">
                Position professionnelle enregistrée.
              </p>
            ) : null}
            {locationError ? (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-normal text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                {locationError}
                {locationLaterMessage ? ` ${locationLaterMessage}` : ""}
              </p>
            ) : null}
          </section>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Métier <span className="font-normal text-[var(--aa-ink-soft)]">(obligatoire)</span>
            <select
              name="categoryId"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className={inputClassName}
              disabled={isCompleted}
            >
              <option value="">Choisir un métier</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
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

          {isCompleted ? null : (
            <button
              type="submit"
              disabled={isSaving}
              className="aa-btn aa-btn-primary mt-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSaving ? "Enregistrement…" : "Enregistrer mon profil artisan"}
            </button>
          )}
        </form>
        </SlideUp>
      </main>
    </div>
  );
}
