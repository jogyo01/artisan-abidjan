"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Chargement du profil…</p>
      </div>
    );
  }

  if (loadError || !profile) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
        <p className="text-sm text-red-700 dark:text-red-300">
          {loadError || "Impossible de charger le profil."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Mon profil
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Consultez vos informations et mettez à jour votre nom et votre téléphone.
        </p>

        <dl className="mt-6 space-y-3 rounded-lg bg-zinc-50 p-4 text-sm dark:bg-zinc-900">
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">Rôle</dt>
            <dd className="mt-0.5 text-zinc-950 dark:text-zinc-50">{ROLE_LABELS[profile.role]}</dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-500 dark:text-zinc-400">Membre depuis</dt>
            <dd className="mt-0.5 text-zinc-950 dark:text-zinc-50">
              {formatCreatedAt(profile.created_at)}
            </dd>
          </div>
        </dl>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Nom complet
            <input
              type="text"
              name="fullName"
              autoComplete="name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-950 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              placeholder="Ex. Kouadio Yao"
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
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-950 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              placeholder="Ex. 07 00 00 00 00"
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
            disabled={isSaving || isSigningOut}
            className="mt-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {isSaving ? "Enregistrement…" : "Enregistrer"}
          </button>

          <button
            type="button"
            onClick={() => {
              void handleSignOut();
            }}
            disabled={isSaving || isSigningOut}
            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            {isSigningOut ? "Déconnexion…" : "Se déconnecter"}
          </button>
        </form>
      </main>
    </div>
  );
}
