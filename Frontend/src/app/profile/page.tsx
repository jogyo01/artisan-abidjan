"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHero } from "@/components/ui/AppPage";
import { MotionAlert, PageSkeleton } from "@/components/motion";
import { createClient } from "@/lib/supabase/client";
import { HERO_MEDIA } from "@/lib/motion/media";

type UserRole = "CLIENT" | "ARTISAN" | "ADMIN";

type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

const ROLE_LABELS: Record<UserRole, string> = {
  CLIENT: "Client",
  ARTISAN: "Artisan",
  ADMIN: "Administrateur",
};

function isUserRole(value: string): value is UserRole {
  return value === "CLIENT" || value === "ARTISAN" || value === "ADMIN";
}

function formatCreatedAt(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return "Date inconnue";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Africa/Abidjan",
  }).format(date);
}

function messageFromSupabase(errorMessage: string): string {
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes("row-level security") || normalized.includes("permission")) {
    return "Vous n'avez pas l'autorisation de modifier ce profil.";
  }
  if (normalized.includes("jwt") || normalized.includes("not authenticated")) {
    return "Votre session a expiré. Veuillez vous reconnecter.";
  }

  return "Une erreur est survenue. Veuillez réessayer.";
}

export default function ProfilePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
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

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone, role, avatar_url, created_at, updated_at")
        .eq("id", user.id)
        .single();

      if (!isMounted) {
        return;
      }

      if (error || !data) {
        setLoadError("Impossible de charger le profil.");
        setIsLoading(false);
        return;
      }

      const role = typeof data.role === "string" && isUserRole(data.role) ? data.role : "CLIENT";

      const loadedProfile: Profile = {
        id: data.id,
        full_name: data.full_name,
        phone: data.phone,
        role,
        avatar_url: data.avatar_url,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };

      setProfile(loadedProfile);
      setFullName(loadedProfile.full_name ?? "");
      setPhone(loadedProfile.phone ?? "");
      setIsLoading(false);
    }

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [router, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile) {
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    const trimmedName = fullName.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      setErrorMessage("Veuillez renseigner votre nom complet.");
      return;
    }

    setIsSaving(true);

    try {
      const { data, error } = await supabase
        .from("profiles")
        .update({
          full_name: trimmedName,
          phone: trimmedPhone === "" ? null : trimmedPhone,
        })
        .eq("id", profile.id)
        .select("id, full_name, phone, role, avatar_url, created_at, updated_at")
        .single();

      if (error || !data) {
        setErrorMessage(
          error ? messageFromSupabase(error.message) : "La mise à jour du profil a échoué.",
        );
        return;
      }

      const role = typeof data.role === "string" && isUserRole(data.role) ? data.role : profile.role;

      setProfile({
        id: data.id,
        full_name: data.full_name,
        phone: data.phone,
        role,
        avatar_url: data.avatar_url,
        created_at: data.created_at,
        updated_at: data.updated_at,
      });
      setFullName(data.full_name ?? "");
      setPhone(data.phone ?? "");
      setSuccessMessage("Profil enregistré.");
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSignOut() {
    setErrorMessage("");
    setSuccessMessage("");
    setIsSigningOut(true);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        setErrorMessage("La déconnexion a échoué. Veuillez réessayer.");
        setIsSigningOut(false);
        return;
      }

      router.replace("/auth");
      router.refresh();
    } catch {
      setErrorMessage("La déconnexion a échoué. Veuillez réessayer.");
      setIsSigningOut(false);
    }
  }

  if (isLoading) {
    return (
      <div className="aa-page aa-page-center">
        <PageSkeleton label="Chargement du profil…" />
      </div>
    );
  }

  if (loadError || !profile) {
    return (
      <div className="aa-page aa-page-center">
        <p className="text-sm text-red-700 dark:text-red-300">
          {loadError || "Impossible de charger le profil."}
        </p>
      </div>
    );
  }

  return (
    <div className="aa-page">
      <div className="w-full max-w-md">
        <PageHero
          imageSrc={HERO_MEDIA.imageSrc}
          imageAlt={HERO_MEDIA.imageAlt}
          kicker="Compte"
          title="Mon profil"
          subtitle="Consultez vos informations. Le rôle ne peut pas être modifié ici."
        />
      <main className="aa-card p-8">

        <div className="aa-inset mt-6">
          <p className="text-lg font-semibold text-[var(--aa-ink)]">
            {profile.full_name || "Nom non renseigné"}
          </p>
          <p className="mt-1 text-sm text-[var(--aa-ink-soft)]">
            {profile.phone || "Téléphone non renseigné"}
          </p>
          <p className="aa-chip mt-3 bg-[color-mix(in_srgb,var(--aa-ink)_8%,transparent)] text-[var(--aa-ink)]">
            {ROLE_LABELS[profile.role]}
          </p>
        </div>

        <dl className="mt-6 aa-inset space-y-3 text-sm">
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Rôle</dt>
            <dd className="mt-0.5 text-[var(--aa-ink)]">{ROLE_LABELS[profile.role]}</dd>
          </div>
          <div>
            <dt className="font-medium text-[var(--aa-ink-soft)]">Membre depuis</dt>
            <dd className="mt-0.5 text-[var(--aa-ink)]">
              {formatCreatedAt(profile.created_at)}
            </dd>
          </div>
        </dl>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Nom complet
            <input
              type="text"
              name="fullName"
              autoComplete="name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="aa-input"
              placeholder="Ex. Kouadio Yao"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-[var(--aa-ink)]">
            Téléphone
            <input
              type="tel"
              name="phone"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="aa-input"
              placeholder="Ex. 07 00 00 00 00"
            />
          </label>

          {errorMessage ? <MotionAlert tone="error" message={errorMessage} /> : null}
          {successMessage ? <MotionAlert tone="success" message={successMessage} /> : null}

          <button
            type="submit"
            disabled={isSaving || isSigningOut}
            className="aa-btn aa-btn-primary mt-2"
          >
            {isSaving ? "Enregistrement…" : "Enregistrer"}
          </button>

          <button
            type="button"
            onClick={() => {
              void handleSignOut();
            }}
            disabled={isSaving || isSigningOut}
            className="aa-btn aa-btn-ghost"
          >
            {isSigningOut ? "Déconnexion…" : "Se déconnecter"}
          </button>
        </form>
      </main>
      </div>
    </div>
  );
}
