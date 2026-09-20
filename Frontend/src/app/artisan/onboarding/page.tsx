"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Category = {
  id: string;
  name: string;
};

type ArtisanRow = {
  id: string;
};

const inputClassName =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-950 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";

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
        setSuccessMessage(
          "Votre profil artisan est déjà enregistré. Il doit être vérifié par l'équipe avant d'être visible.",
        );
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

  if (isLoading) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Chargement…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <p className="text-sm text-red-700 dark:text-red-300">{loadError}</p>
      </div>
    );
  }

  const isCompleted = Boolean(existingArtisan);

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <main className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8 dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Profil professionnel
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Complétez vos informations artisan. La vérification sera effectuée par l&apos;équipe.
        </p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Nom de l&apos;entreprise ou nom professionnel
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

          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Description
            <textarea
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className={`${inputClassName} min-h-28`}
              disabled={isCompleted}
              placeholder="Présentez votre activité"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Adresse
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

          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
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

          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Téléphone
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

          <label className="flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
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

          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Métier
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
              className="mt-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            >
              {isSaving ? "Enregistrement…" : "Enregistrer mon profil artisan"}
            </button>
          )}
        </form>
      </main>
    </div>
  );
}
