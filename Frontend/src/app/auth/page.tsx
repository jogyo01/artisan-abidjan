"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  assignArtisanRoleIfAllowed,
  resolvePostAuthPath,
  toPublicAccountType,
  type PublicAccountType,
} from "@/lib/auth/post-auth";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "login" | "signup";

function messageFromSupabase(errorMessage: string): string {
  const normalized = errorMessage.toLowerCase();

  if (normalized.includes("invalid login credentials")) {
    return "Email ou mot de passe incorrect.";
  }
  if (normalized.includes("user already registered")) {
    return "Un compte existe déjà avec cet email.";
  }
  if (normalized.includes("password should be at least")) {
    return "Le mot de passe doit contenir au moins 6 caractères.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Veuillez confirmer votre email avant de vous connecter.";
  }
  if (normalized.includes("invalid") && normalized.includes("email")) {
    return "L'adresse email n'est pas valide.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Trop de tentatives. Réessayez dans quelques instants.";
  }

  return "Une erreur est survenue. Veuillez réessayer.";
}

export default function AuthPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [mode, setMode] = useState<AuthMode>("login");
  const [fullName, setFullName] = useState("");
  const [accountType, setAccountType] = useState<PublicAccountType>("CLIENT");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const trimmedEmail = email.trim();
    const trimmedName = fullName.trim();

    if (!trimmedEmail || !password) {
      setErrorMessage("Veuillez renseigner l'email et le mot de passe.");
      return;
    }

    if (mode === "signup" && !trimmedName) {
      setErrorMessage("Veuillez renseigner votre nom complet.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    setIsSubmitting(true);

    try {
      if (mode === "signup") {
        const safeAccountType = toPublicAccountType(accountType);

        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: {
              full_name: trimmedName,
              account_type: safeAccountType,
            },
          },
        });

        if (error) {
          setErrorMessage(messageFromSupabase(error.message));
          return;
        }

        setPassword("");

        if (safeAccountType === "ARTISAN" && data.user) {
          const roleResult = await assignArtisanRoleIfAllowed(supabase, data.user.id);
          if (!roleResult.ok && data.session) {
            setErrorMessage(
              roleResult.errorMessage ?? "Impossible d'activer le compte artisan.",
            );
            return;
          }

          if (data.session) {
            setSuccessMessage("Inscription réussie. Redirection vers votre profil professionnel…");
            router.replace("/artisan/onboarding");
            router.refresh();
            return;
          }

          setSuccessMessage(
            "Inscription artisan réussie. Vérifiez votre email, puis connectez-vous pour compléter votre profil professionnel.",
          );
          return;
        }

        setSuccessMessage(
          "Inscription réussie. Vérifiez votre email si une confirmation est demandée, puis connectez-vous.",
        );
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (error) {
        setErrorMessage(messageFromSupabase(error.message));
        return;
      }

      setSuccessMessage("Connexion réussie. Redirection en cours…");
      const nextPath = await resolvePostAuthPath(supabase);
      router.push(nextPath);
      router.refresh();
    } catch {
      setErrorMessage("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const isLogin = mode === "login";

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-black">
      <main className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Artisan-Abidjan
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {isLogin
            ? "Connectez-vous pour continuer."
            : "Créez un compte pour trouver ou proposer des services."}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-2 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => switchMode("login")}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              isLogin
                ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => switchMode("signup")}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${
              !isLogin
                ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-600 dark:text-zinc-400"
            }`}
          >
            Inscription
          </button>
        </div>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          {!isLogin ? (
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
          ) : null}

          {!isLogin ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Vous êtes
              </legend>
              <div className="grid grid-cols-2 gap-2">
                <label
                  className={`flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium ${
                    accountType === "CLIENT"
                      ? "border-zinc-950 bg-zinc-950 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
                      : "border-zinc-200 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="accountType"
                    value="CLIENT"
                    checked={accountType === "CLIENT"}
                    onChange={() => setAccountType("CLIENT")}
                    className="sr-only"
                  />
                  Client
                </label>
                <label
                  className={`flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium ${
                    accountType === "ARTISAN"
                      ? "border-zinc-950 bg-zinc-950 text-white dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950"
                      : "border-zinc-200 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="accountType"
                    value="ARTISAN"
                    checked={accountType === "ARTISAN"}
                    onChange={() => setAccountType("ARTISAN")}
                    className="sr-only"
                  />
                  Artisan
                </label>
              </div>
            </fieldset>
          ) : null}

          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Email
            <input
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-950 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              placeholder="vous@email.com"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium text-zinc-800 dark:text-zinc-200">
            Mot de passe
            <input
              type="password"
              name="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-normal text-zinc-950 outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              placeholder="Au moins 6 caractères"
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
            disabled={isSubmitting}
            className="mt-2 rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
          >
            {isSubmitting
              ? "Veuillez patienter…"
              : isLogin
                ? "Se connecter"
                : "Créer un compte"}
          </button>
        </form>
      </main>
    </div>
  );
}
