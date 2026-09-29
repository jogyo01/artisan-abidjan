"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArtisanPageHeader } from "@/components/artisan/ArtisanPageHeader";
import { AnimatedSection, MotionAlert, PageSkeleton } from "@/components/motion";
import { createClient } from "@/lib/supabase/client";
import { loadArtisanSession } from "@/lib/artisan/session";
import { CITY_MEDIA } from "@/lib/motion/media";
import {
  categoryIdToString,
  mapCategoryRow,
  toCategoryWriteValue,
  type ArtisanCategory,
} from "@/lib/artisan/categories";
import {
  parseWeeklyHours,
  WEEK_DAYS,
  type WeeklyHours,
} from "@/lib/artisan/weekly-hours";
import {
  areValidCoordinates,
  geolocationErrorMessage,
  getBrowserCoordinates,
  isGeolocationPermissionDenied,
  type GeoCoordinates,
} from "@/lib/geolocation";

const inputClassName = "aa-input";

export default function ArtisanProfilePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [catalog, setCatalog] = useState<ArtisanCategory[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [isVerified, setIsVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingTrades, setIsUpdatingTrades] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [tradeToAdd, setTradeToAdd] = useState("");

  const [businessName, setBusinessName] = useState("");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("Abidjan");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [fullName, setFullName] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
  const [weeklyHours, setWeeklyHours] = useState<WeeklyHours>(parseWeeklyHours(null));
  const [hoursSupported, setHoursSupported] = useState(true);
  const [coordinates, setCoordinates] = useState<GeoCoordinates | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationLaterMessage, setLocationLaterMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const session = await loadArtisanSession(supabase);
      if (cancelled) {
        return;
      }

      if (session.kind === "unauthenticated") {
        router.replace("/auth");
        return;
      }
      if (session.kind === "forbidden") {
        router.replace("/");
        return;
      }
      if (session.kind === "needs_onboarding") {
        router.replace("/artisan/onboarding");
        return;
      }

      const [{ data: categoryRows, error: categoryError }, { data: linkRows }, profileResult, hoursResult] =
        await Promise.all([
          supabase.from("categories").select("id, name").order("name"),
          supabase.from("artisan_categories").select("category_id").eq("artisan_id", session.userId),
          supabase.from("profiles").select("avatar_url, full_name").eq("id", session.userId).maybeSingle(),
          supabase.from("artisans").select("weekly_hours").eq("id", session.userId).maybeSingle(),
        ]);

      if (cancelled) {
        return;
      }

      if (categoryError) {
        setLoadError("Impossible de charger les métiers.");
        setIsLoading(false);
        return;
      }

      setCatalog((categoryRows ?? []).flatMap((row) => {
        const mapped = mapCategoryRow(row);
        return mapped ? [mapped] : [];
      }));
      setSelectedCategoryIds(
        (linkRows ?? []).flatMap((row) => {
          const id = categoryIdToString(row.category_id);
          return id ? [id] : [];
        }),
      );
      setBusinessName(session.artisan.business_name);
      setDescription(session.artisan.description ?? "");
      setAddress(session.artisan.address ?? "");
      setCity(session.artisan.city || "Abidjan");
      setPhone(session.artisan.phone ?? "");
      setIsAvailable(session.artisan.is_available);
      setIsVerified(session.artisan.is_verified);
      setAvatarUrl(
        typeof profileResult.data?.avatar_url === "string" ? profileResult.data.avatar_url : "",
      );
      setFullName(typeof profileResult.data?.full_name === "string" ? profileResult.data.full_name : "");

      if (hoursResult.error) {
        setHoursSupported(false);
      } else {
        setWeeklyHours(parseWeeklyHours(hoursResult.data?.weekly_hours));
      }

      if (
        session.artisan.latitude !== null &&
        session.artisan.longitude !== null &&
        areValidCoordinates(session.artisan.latitude, session.artisan.longitude)
      ) {
        setCoordinates({
          latitude: session.artisan.latitude,
          longitude: session.artisan.longitude,
        });
      }
      setIsLoading(false);
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  const selectedTrades = catalog.filter((category) => selectedCategoryIds.includes(category.id));
  const availableToAdd = catalog.filter((category) => !selectedCategoryIds.includes(category.id));

  async function persistTrades(nextIds: string[]) {
    const session = await loadArtisanSession(supabase);
    if (session.kind !== "ok") {
      setErrorMessage("Vous n'avez pas l'autorisation de modifier les métiers.");
      return false;
    }

    const currentIds = selectedCategoryIds;
    const toAdd = nextIds.filter((id) => !currentIds.includes(id));
    const toRemove = currentIds.filter((id) => !nextIds.includes(id));

    setIsUpdatingTrades(true);
    try {
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("artisan_categories")
          .delete()
          .eq("artisan_id", session.userId)
          .in("category_id", toRemove.map(toCategoryWriteValue));
        if (error) {
          setErrorMessage("Impossible de retirer ce métier.");
          return false;
        }
      }

      if (toAdd.length > 0) {
        const { error } = await supabase.from("artisan_categories").insert(
          toAdd.map((categoryId) => ({
            artisan_id: session.userId,
            category_id: toCategoryWriteValue(categoryId),
          })),
        );
        if (error) {
          setErrorMessage("Impossible d'ajouter ce métier.");
          return false;
        }
      }

      setSelectedCategoryIds(nextIds);
      return true;
    } finally {
      setIsUpdatingTrades(false);
    }
  }

  async function handleAddTrade() {
    setErrorMessage("");
    setSuccessMessage("");
    if (!tradeToAdd) {
      return;
    }
    if (selectedCategoryIds.includes(tradeToAdd)) {
      return;
    }
    const ok = await persistTrades([...selectedCategoryIds, tradeToAdd]);
    if (ok) {
      setTradeToAdd("");
      setSuccessMessage("Métier ajouté. Les prestations se gèrent dans Mes services.");
    }
  }

  async function handleRemoveTrade(categoryId: string) {
    setErrorMessage("");
    setSuccessMessage("");
    if (selectedCategoryIds.length <= 1) {
      setErrorMessage("Conservez au moins un métier.");
      return;
    }
    const ok = await persistTrades(selectedCategoryIds.filter((id) => id !== categoryId));
    if (ok) {
      setSuccessMessage("Métier retiré.");
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
      setLocationError(geolocationErrorMessage(error));
      if (isGeolocationPermissionDenied(error)) {
        setLocationLaterMessage("La localisation pourra être ajoutée plus tard.");
      }
    } finally {
      setIsLocating(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const session = await loadArtisanSession(supabase);
    if (session.kind === "unauthenticated") {
      router.replace("/auth");
      return;
    }
    if (session.kind !== "ok") {
      setErrorMessage("Vous n'avez pas l'autorisation de modifier ce profil.");
      return;
    }

    const trimmedBusinessName = businessName.trim();
    const trimmedDescription = description.trim();
    const trimmedAddress = address.trim();
    const trimmedCity = city.trim() || "Abidjan";
    const trimmedPhone = phone.trim();
    const trimmedAvatar = avatarUrl.trim();
    const trimmedFullName = fullName.trim();

    if (!trimmedBusinessName || !trimmedDescription || !trimmedAddress || !trimmedPhone) {
      setErrorMessage("Veuillez renseigner tous les champs obligatoires.");
      return;
    }

    if (selectedCategoryIds.length === 0) {
      setErrorMessage("Veuillez conserver au moins un métier.");
      return;
    }

    const locationPayload =
      coordinates && areValidCoordinates(coordinates.latitude, coordinates.longitude)
        ? { latitude: coordinates.latitude, longitude: coordinates.longitude }
        : { latitude: null, longitude: null };

    setIsSaving(true);

    try {
      const artisanPayload: Record<string, unknown> = {
        business_name: trimmedBusinessName,
        description: trimmedDescription,
        address: trimmedAddress,
        city: trimmedCity,
        phone: trimmedPhone,
        is_available: isAvailable,
        ...locationPayload,
      };
      if (hoursSupported) {
        artisanPayload.weekly_hours = weeklyHours;
      }

      const { error: artisanError } = await supabase
        .from("artisans")
        .update(artisanPayload)
        .eq("id", session.userId);

      if (artisanError) {
        if (artisanError.message.toLowerCase().includes("weekly_hours")) {
          setHoursSupported(false);
          const { error: retryError } = await supabase
            .from("artisans")
            .update({
              business_name: trimmedBusinessName,
              description: trimmedDescription,
              address: trimmedAddress,
              city: trimmedCity,
              phone: trimmedPhone,
              is_available: isAvailable,
              ...locationPayload,
            })
            .eq("id", session.userId);
          if (retryError) {
            setErrorMessage("Impossible d'enregistrer le profil artisan.");
            return;
          }
        } else {
          setErrorMessage("Impossible d'enregistrer le profil artisan.");
          return;
        }
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          avatar_url: trimmedAvatar === "" ? null : trimmedAvatar,
          full_name: trimmedFullName === "" ? null : trimmedFullName,
          phone: trimmedPhone,
        })
        .eq("id", session.userId);

      if (profileError) {
        setErrorMessage("Le profil a été enregistré, mais la photo n'a pas pu être mise à jour.");
        return;
      }

      setSuccessMessage("Profil professionnel enregistré.");
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="aa-page aa-page-center">
        <PageSkeleton label="Chargement du profil artisan…" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="aa-page aa-page-center">
        <p className="aa-alert-error">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="aa-page" data-page="artisan-profile">
      <div className="w-full max-w-2xl">
        <ArtisanPageHeader
          kicker="Identité"
          title="Mon profil"
          subtitle="Vos informations d'atelier. Les prestations et tarifs se gèrent séparément, dans Mes services."
          imageSrc={CITY_MEDIA.workshop.src}
          imageAlt={CITY_MEDIA.workshop.alt}
        />

        <main className="aa-card p-6 sm:p-8">
          <p
            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
              isVerified
                ? "bg-emerald-50 text-emerald-800"
                : "bg-amber-50 text-amber-800"
            }`}
          >
            {isVerified ? "Profil vérifié" : "En attente de vérification"}
          </p>
          <p className="mt-2 text-sm text-[var(--aa-ink-soft)]">
            Le statut de vérification est géré par l&apos;équipe. Il n&apos;est pas modifiable ici.
          </p>

          <form className="mt-6 flex flex-col gap-5" onSubmit={handleSubmit}>
            <section>
              <h2 className="text-sm font-semibold text-[var(--aa-ink)]">Photo de profil</h2>
              <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="h-20 w-20 overflow-hidden rounded-2xl bg-[color-mix(in_srgb,var(--aa-sand)_70%,transparent)]">
                  {avatarUrl.trim() ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl.trim()} alt="Aperçu du profil" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-[var(--aa-ink-soft)]">
                      Photo
                    </div>
                  )}
                </div>
                <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
                  URL de la photo
                  <input
                    type="url"
                    value={avatarUrl}
                    onChange={(event) => setAvatarUrl(event.target.value)}
                    className={inputClassName}
                    placeholder="https://…"
                  />
                </label>
              </div>
            </section>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
              Nom / prénom
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                className={inputClassName}
                placeholder="Votre nom et prénom"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
              Nom de l&apos;entreprise / nom professionnel
              <input
                type="text"
                value={businessName}
                onChange={(event) => setBusinessName(event.target.value)}
                className={inputClassName}
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
              Description
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className={`${inputClassName} min-h-28`}
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
              Téléphone
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                className={inputClassName}
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
              Adresse
              <input
                type="text"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                className={inputClassName}
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
              Ville
              <input
                type="text"
                value={city}
                onChange={(event) => setCity(event.target.value)}
                className={inputClassName}
              />
            </label>

            <AnimatedSection className="rounded-2xl border border-[color-mix(in_srgb,var(--aa-ink)_10%,transparent)] p-4" id="metiers">
              <h2 className="text-sm font-semibold text-[var(--aa-ink)]">Mes métiers</h2>
              <p className="mt-1 text-sm text-[var(--aa-ink-soft)]">
                Sélection multiple. Ajoutez ou retirez un métier. Les services détaillés se gèrent
                dans{" "}
                <Link href="/artisan/services" className="font-medium text-[var(--aa-terracotta)]">
                  Mes services
                </Link>
                .
              </p>

              {selectedTrades.length === 0 ? (
                <p className="aa-empty mt-3 text-sm">Aucun métier sélectionné.</p>
              ) : (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {selectedTrades.map((trade) => (
                    <li
                      key={trade.id}
                      className="inline-flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--aa-terracotta)_12%,transparent)] px-3 py-1.5 text-sm text-[var(--aa-ink)]"
                    >
                      {trade.name}
                      <button
                        type="button"
                        onClick={() => {
                          void handleRemoveTrade(trade.id);
                        }}
                        disabled={isUpdatingTrades}
                        className="text-xs font-medium text-[var(--aa-terracotta-deep)]"
                      >
                        Retirer
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <select
                  value={tradeToAdd}
                  onChange={(event) => setTradeToAdd(event.target.value)}
                  className={inputClassName}
                  disabled={availableToAdd.length === 0 || isUpdatingTrades}
                >
                  <option value="">Choisir un métier à ajouter</option>
                  {availableToAdd.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    void handleAddTrade();
                  }}
                  disabled={!tradeToAdd || isUpdatingTrades}
                  className="aa-btn aa-btn-ghost"
                >
                  Ajouter un métier
                </button>
              </div>
            </AnimatedSection>

            <fieldset>
              <legend className="text-sm font-medium text-[var(--aa-ink)]">Disponibilité aux demandes</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsAvailable(true)}
                  className={`rounded-full px-3 py-2 text-sm font-medium ${
                    isAvailable
                      ? "bg-[var(--aa-terracotta)] text-white"
                      : "border border-[color-mix(in_srgb,var(--aa-ink)_12%,transparent)] text-[var(--aa-ink-soft)]"
                  }`}
                >
                  Disponible
                </button>
                <button
                  type="button"
                  onClick={() => setIsAvailable(false)}
                  className={`rounded-full px-3 py-2 text-sm font-medium ${
                    !isAvailable
                      ? "bg-[var(--aa-ink)] text-[var(--aa-cream)]"
                      : "border border-[color-mix(in_srgb,var(--aa-ink)_12%,transparent)] text-[var(--aa-ink-soft)]"
                  }`}
                >
                  Indisponible
                </button>
              </div>
            </fieldset>

            {hoursSupported ? (
              <section>
                <h2 className="text-sm font-semibold text-[var(--aa-ink)]">Horaires hebdomadaires</h2>
                <ul className="mt-3 flex flex-col gap-2">
                  {WEEK_DAYS.map((day) => {
                    const hours = weeklyHours[day.key];
                    return (
                      <li
                        key={day.key}
                        className="grid grid-cols-1 items-center gap-2 rounded-xl bg-[color-mix(in_srgb,var(--aa-sand)_40%,transparent)] px-3 py-2 sm:grid-cols-[7rem_auto_1fr_1fr]"
                      >
                        <p className="text-sm font-medium text-[var(--aa-ink)]">{day.label}</p>
                        <label className="flex items-center gap-2 text-xs text-[var(--aa-ink-soft)]">
                          <input
                            type="checkbox"
                            checked={hours.closed}
                            onChange={(event) => {
                              setWeeklyHours((current) => ({
                                ...current,
                                [day.key]: { ...current[day.key], closed: event.target.checked },
                              }));
                            }}
                          />
                          Fermé
                        </label>
                        <input
                          type="time"
                          value={hours.open}
                          disabled={hours.closed}
                          onChange={(event) => {
                            setWeeklyHours((current) => ({
                              ...current,
                              [day.key]: { ...current[day.key], open: event.target.value },
                            }));
                          }}
                          className={inputClassName}
                        />
                        <input
                          type="time"
                          value={hours.close}
                          disabled={hours.closed}
                          onChange={(event) => {
                            setWeeklyHours((current) => ({
                              ...current,
                              [day.key]: { ...current[day.key], close: event.target.value },
                            }));
                          }}
                          className={inputClassName}
                        />
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Les horaires hebdomadaires seront disponibles après application du script SQL
                `services_category.sql`.
              </p>
            )}

            <AnimatedSection className="rounded-2xl border border-[color-mix(in_srgb,var(--aa-ink)_10%,transparent)] p-4" delay={0.04}>
              <h2 className="text-sm font-semibold text-[var(--aa-ink)]">Localisation GPS</h2>
              <p className="mt-1 text-sm font-normal text-[var(--aa-ink-soft)]">
                Votre position sert à permettre aux clients de trouver votre activité à proximité.
                Elle n&apos;est jamais obligatoire.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void handleUseLocation();
                  }}
                  disabled={isLocating}
                  className="aa-btn aa-btn-ghost"
                >
                  {isLocating ? "Récupération…" : coordinates ? "Mettre à jour ma position" : "Utiliser ma position"}
                </button>
                {coordinates ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCoordinates(null);
                      setLocationError("");
                      setLocationLaterMessage("");
                    }}
                    className="aa-btn aa-btn-ghost"
                  >
                    Supprimer ma position
                  </button>
                ) : null}
              </div>
              {coordinates ? (
                <p className="mt-3 text-sm text-[var(--aa-ink)]">
                  Position professionnelle enregistrée. Enregistrez le profil pour la conserver.
                </p>
              ) : (
                <p className="mt-3 text-sm text-[var(--aa-ink-soft)]">Aucune position enregistrée.</p>
              )}
              {locationError ? (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {locationError}
                  {locationLaterMessage ? ` ${locationLaterMessage}` : ""}
                </p>
              ) : null}
            </AnimatedSection>

            {errorMessage ? <MotionAlert tone="error" message={errorMessage} /> : null}
            {successMessage ? <MotionAlert tone="success" message={successMessage} /> : null}

            <button type="submit" disabled={isSaving} className="aa-btn aa-btn-primary">
              {isSaving ? "Enregistrement…" : "Enregistrer le profil"}
            </button>
          </form>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:gap-4">
            <Link href="/artisan" className="text-sm font-medium text-[var(--aa-ink-soft)]">
              Tableau de bord
            </Link>
            <Link href="/artisan/services" className="text-sm font-medium text-[var(--aa-terracotta)]">
              Mes services
            </Link>
            <Link href="/profile" className="text-sm font-medium text-[var(--aa-ink-soft)]">
              Compte personnel
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
