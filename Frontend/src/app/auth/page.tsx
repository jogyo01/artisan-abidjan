"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandMark } from "@/components/brand/BrandMark";
import { AnimatedButton, MotionAlert, PageSkeleton, SlideUp } from "@/components/motion";
import {
  completeArtisanSignup,
  mapSignupCategory,
  resolvePostAuthPath,
  toPublicAccountType,
  type PublicAccountType,
} from "@/lib/auth/post-auth";
import { createClient } from "@/lib/supabase/client";
import { CITY_MEDIA, HERO_MEDIA } from "@/lib/motion/media";

type AuthMode = "login" | "signup";

type SignupCategory = {
  id: number;
  name: string;
};

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

function categoryMark(name: string): string {
  const normalized = name.toLowerCase();
  if (normalized.includes("mécan") || normalized.includes("mecan")) {
    return "🔧";
  }
  if (normalized.includes("électr") || normalized.includes("electr")) {
    return "⚡";
  }
  if (normalized.includes("plomb")) {
    return "🔧";
  }
  if (normalized.includes("coutur")) {
    return "✂";
  }
  if (normalized.includes("cordon")) {
    return "👞";
  }
  if (normalized.includes("peint")) {
    return "🎨";
  }
  if (normalized.includes("menuis")) {
    return "🪚";
  }
  if (normalized.includes("climat")) {
    return "❄";
  }
  return "✦";
}

const fieldClassName = "aa-input mt-1.5";

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full flex-1 items-center justify-center bg-[var(--aa-cream)] px-4 py-12">
          <PageSkeleton label="Chargement…" />
        </div>
      }
    >
      <AuthPageContent />
    </Suspense>
  );
}

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);

  const [mode, setMode] = useState<AuthMode>(() =>
    searchParams.get("mode") === "signup" || searchParams.get("account") === "artisan"
      ? "signup"
      : "login",
  );
  const [fullName, setFullName] = useState("");
  const [accountType, setAccountType] = useState<PublicAccountType>(() =>
    searchParams.get("account") === "artisan" ? "ARTISAN" : "CLIENT",
  );
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [categories, setCategories] = useState<SignupCategory[]>([]);
  const [categoriesError, setCategoriesError] = useState("");
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [artisanStep, setArtisanStep] = useState<"trades" | "details">("trades");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (mode !== "signup") {
      return;
    }

    let cancelled = false;

    async function loadCategories() {
      setCategoriesLoading(true);
      const { data, error } = await supabase.rpc("list_signup_categories");

      if (cancelled) {
        return;
      }

      if (error || !Array.isArray(data)) {
        const fallback = await supabase.from("categories").select("id, name").order("name");
        if (cancelled) {
          return;
        }
        if (fallback.error) {
          setCategories([]);
          setCategoriesError("Impossible de charger les métiers. Réessayez dans un instant.");
          setCategoriesLoading(false);
          return;
        }
        setCategories((fallback.data ?? []).flatMap((row) => {
          const mapped = mapSignupCategory(row);
          return mapped ? [mapped] : [];
        }));
        setCategoriesError("");
        setCategoriesLoading(false);
        return;
      }

      setCategories(data.flatMap((row) => {
        const mapped = mapSignupCategory(row);
        return mapped ? [mapped] : [];
      }));
      setCategoriesError("");
      setCategoriesLoading(false);
    }

    void loadCategories();

    return () => {
      cancelled = true;
    };
  }, [mode, supabase]);

  function switchMode(nextMode: AuthMode) {
    setMode(nextMode);
    setErrorMessage("");
    setSuccessMessage("");
    if (nextMode === "login") {
      setArtisanStep("trades");
    }
  }

  function chooseAccountType(nextType: PublicAccountType) {
    setAccountType(nextType);
    setErrorMessage("");
    setArtisanStep("trades");
  }

  function toggleCategory(categoryId: number) {
    setSelectedCategoryIds((current) =>
      current.includes(categoryId)
        ? current.filter((id) => id !== categoryId)
        : [...current, categoryId],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    const trimmedEmail = email.trim();
    const trimmedName = fullName.trim();
    const safeAccountType = toPublicAccountType(accountType);

    if (mode === "signup" && safeAccountType === "ARTISAN" && artisanStep === "trades") {
      if (selectedCategoryIds.length === 0) {
        setErrorMessage("Veuillez sélectionner au moins un métier.");
        return;
      }
      setArtisanStep("details");
      return;
    }

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
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            data: {
              full_name: trimmedName,
              role: safeAccountType,
              account_type: safeAccountType,
              category_ids: safeAccountType === "ARTISAN" ? selectedCategoryIds : [],
            },
          },
        });

        if (error) {
          setErrorMessage(messageFromSupabase(error.message));
          return;
        }

        setPassword("");

        if (!data.session) {
          setSuccessMessage(
            "Inscription réussie. Vérifiez votre email si une confirmation est demandée, puis connectez-vous.",
          );
          return;
        }

        if (safeAccountType === "ARTISAN") {
          const setup = await completeArtisanSignup(supabase, selectedCategoryIds);
          if (!setup.ok) {
            setErrorMessage(setup.errorMessage ?? "Impossible d'enregistrer vos métiers.");
            const fallbackPath = await resolvePostAuthPath(supabase);
            router.replace(fallbackPath);
            router.refresh();
            return;
          }
          setSuccessMessage("Inscription réussie. Redirection en cours…");
          router.replace("/artisan");
          router.refresh();
          return;
        }

        setSuccessMessage("Inscription réussie. Redirection en cours…");
        const nextPath = await resolvePostAuthPath(supabase);
        router.replace(nextPath);
        router.refresh();
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
  const artisanSignup = !isLogin && accountType === "ARTISAN";

  return (
    <div className="flex min-h-full flex-1 flex-col bg-[var(--aa-cream)] lg:flex-row">
      <aside className="relative isolate h-44 overflow-hidden sm:h-56 lg:h-auto lg:min-h-full lg:w-[46%]">
        <Image
          src={HERO_MEDIA.imageSrc}
          alt={HERO_MEDIA.imageAlt}
          fill
          preload
          sizes="(max-width: 1024px) 100vw, 46vw"
          quality={80}
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-black/15 lg:bg-gradient-to-r lg:from-black/70 lg:via-black/40 lg:to-black/20" />
        <div className="relative z-10 flex h-full flex-col justify-end p-5 sm:p-8 lg:min-h-full lg:justify-between lg:p-10">
          <BrandMark href="/" invert className="hidden text-lg lg:inline-flex" />
          <div className="max-w-md">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[var(--aa-gold)]">
              Abidjan
            </p>
            <p className="mt-3 text-2xl font-semibold leading-tight text-white sm:text-3xl lg:text-4xl">
              Le savoir-faire ivoirien, à portée de main.
            </p>
            <p className="mt-3 hidden text-sm leading-6 text-white/80 lg:block">
              Trouvez un artisan près de chez vous, ou faites connaître votre atelier.
            </p>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8 lg:py-12">
        <main
          className={`w-full rounded-[1.75rem] border border-[color-mix(in_srgb,var(--aa-ink)_8%,transparent)] bg-[var(--aa-card)] p-6 shadow-[0_30px_70px_-36px_rgba(27,18,12,0.45)] sm:p-8 ${
            artisanSignup ? "max-w-xl" : "max-w-md"
          }`}
        >
          <div className="lg:hidden">
            <BrandMark href="/" />
          </div>
          <p className="hidden text-sm font-semibold text-[var(--aa-terracotta)] lg:block">
            Artisan-Abidjan
          </p>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-[var(--aa-ink)]">
            {isLogin ? "Bienvenue sur Artisan-Abidjan" : "Créer votre compte"}
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--aa-ink-soft)]">
            {isLogin
              ? "Connectez-vous pour continuer, en toute simplicité."
              : "Quelques informations suffisent pour rejoindre la plateforme."}
          </p>

          <div
            className="mt-6 grid grid-cols-2 gap-1 rounded-full bg-[var(--aa-sand)] p-1"
            role="tablist"
            aria-label="Choisir connexion ou inscription"
          >
            <button
              type="button"
              role="tab"
              aria-selected={isLogin}
              onClick={() => switchMode("login")}
              className={`rounded-full px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--aa-terracotta)] ${
                isLogin
                  ? "bg-[var(--aa-card)] text-[var(--aa-ink)] shadow-sm"
                  : "text-[var(--aa-ink-soft)]"
              }`}
            >
              Connexion
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isLogin}
              onClick={() => switchMode("signup")}
              className={`rounded-full px-3 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--aa-terracotta)] ${
                !isLogin
                  ? "bg-[var(--aa-card)] text-[var(--aa-ink)] shadow-sm"
                  : "text-[var(--aa-ink-soft)]"
              }`}
            >
              Inscription
            </button>
          </div>

          <SlideUp>
          <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
            {!isLogin ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium text-[var(--aa-ink)]">Vous êtes</legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label
                    className={`group relative cursor-pointer overflow-hidden rounded-2xl border-2 transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--aa-terracotta)] ${
                      accountType === "CLIENT"
                        ? "border-[var(--aa-terracotta)] shadow-[0_12px_28px_-16px_rgba(196,92,38,0.8)]"
                        : "border-transparent bg-[var(--aa-sand)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="accountType"
                      value="CLIENT"
                      checked={accountType === "CLIENT"}
                      onChange={() => chooseAccountType("CLIENT")}
                      className="sr-only"
                    />
                    <span className="relative block h-20">
                      <Image
                        src={CITY_MEDIA.workshop.src}
                        alt=""
                        fill
                        sizes="200px"
                        quality={80}
                        className="object-cover"
                      />
                      <span className="absolute inset-0 bg-black/25" />
                    </span>
                    <span className="block px-3 py-3">
                      <span className="block text-sm font-semibold text-[var(--aa-ink)]">
                        Je cherche un artisan
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-[var(--aa-ink-soft)]">
                        Pour une intervention près de chez vous.
                      </span>
                    </span>
                  </label>
                  <label
                    className={`group relative cursor-pointer overflow-hidden rounded-2xl border-2 transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--aa-terracotta)] ${
                      accountType === "ARTISAN"
                        ? "border-[var(--aa-terracotta)] shadow-[0_12px_28px_-16px_rgba(196,92,38,0.8)]"
                        : "border-transparent bg-[var(--aa-sand)]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="accountType"
                      value="ARTISAN"
                      checked={accountType === "ARTISAN"}
                      onChange={() => chooseAccountType("ARTISAN")}
                      className="sr-only"
                    />
                    <span className="relative block h-20">
                      <Image
                        src="/images/a-propos/metier-menuisier.jpg"
                        alt=""
                        fill
                        sizes="200px"
                        quality={80}
                        className="object-cover"
                      />
                      <span className="absolute inset-0 bg-black/25" />
                    </span>
                    <span className="block px-3 py-3">
                      <span className="block text-sm font-semibold text-[var(--aa-ink)]">
                        Je suis artisan
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-[var(--aa-ink-soft)]">
                        Pour proposer votre savoir-faire.
                      </span>
                    </span>
                  </label>
                </div>
              </fieldset>
            ) : null}

            {artisanSignup && artisanStep === "trades" ? (
              <fieldset className="flex flex-col gap-3">
                <legend className="text-base font-semibold text-[var(--aa-ink)]">Mes métiers</legend>
                <p className="text-sm leading-6 text-[var(--aa-ink-soft)]">
                  Sélectionnez votre ou vos métiers
                </p>
                {categoriesLoading ? (
                  <p className="text-sm text-[var(--aa-ink-soft)]">Chargement des métiers…</p>
                ) : null}
                {categoriesError ? (
                  <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
                    {categoriesError}
                  </p>
                ) : null}
                {!categoriesLoading && !categoriesError && categories.length === 0 ? (
                  <p className="rounded-xl bg-[var(--aa-sand)] px-3 py-3 text-sm text-[var(--aa-ink-soft)]">
                    Aucun métier n&apos;est disponible pour le moment.
                  </p>
                ) : null}
                <div className="flex flex-col gap-2">
                  {categories.map((category) => {
                    const selected = selectedCategoryIds.includes(category.id);
                    return (
                      <label
                        key={category.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-3.5 py-3 transition duration-200 ease-out focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--aa-terracotta)] ${
                          selected
                            ? "border-[var(--aa-terracotta)] bg-[color-mix(in_srgb,var(--aa-terracotta)_10%,var(--aa-card))] shadow-[0_10px_24px_-16px_rgba(196,92,38,0.85)]"
                            : "border-[color-mix(in_srgb,var(--aa-ink)_8%,transparent)] bg-[var(--aa-sand)] hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--aa-terracotta)_45%,transparent)]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          name="categoryIds"
                          value={category.id}
                          checked={selected}
                          onChange={() => toggleCategory(category.id)}
                          className="sr-only"
                        />
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--aa-card)] text-lg" aria-hidden>
                          {categoryMark(category.name)}
                        </span>
                        <span className="min-w-0 flex-1 text-sm font-semibold text-[var(--aa-ink)]">
                          {category.name}
                        </span>
                        <span
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                            selected
                              ? "bg-[var(--aa-terracotta)] text-white"
                              : "border border-[color-mix(in_srgb,var(--aa-ink)_18%,transparent)] text-transparent"
                          }`}
                          aria-hidden
                        >
                          ✓
                        </span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-center text-sm font-medium text-[var(--aa-ink-soft)]">
                  {selectedCategoryIds.length === 0
                    ? "Aucun métier sélectionné"
                    : selectedCategoryIds.length === 1
                      ? "1 métier sélectionné"
                      : `${selectedCategoryIds.length} métiers sélectionnés`}
                </p>
              </fieldset>
            ) : null}

            {isLogin || !artisanSignup || artisanStep === "details" ? (
              <>
                {artisanSignup && artisanStep === "details" ? (
                  <button
                    type="button"
                    onClick={() => setArtisanStep("trades")}
                    className="self-start text-sm font-medium text-[var(--aa-terracotta)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--aa-terracotta)]"
                  >
                    Modifier les métiers
                  </button>
                ) : null}
                {!isLogin ? (
                  <label className="flex flex-col text-sm font-medium text-[var(--aa-ink)]">
                    Nom complet
                    <input
                      type="text"
                      name="fullName"
                      autoComplete="name"
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      className={fieldClassName}
                      placeholder="Ex. Kouadio Yao"
                    />
                  </label>
                ) : null}

                <label className="flex flex-col text-sm font-medium text-[var(--aa-ink)]">
                  Email
                  <input
                    type="email"
                    name="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className={fieldClassName}
                    placeholder="vous@email.com"
                  />
                </label>

                <label className="flex flex-col text-sm font-medium text-[var(--aa-ink)]">
                  Mot de passe
                  <input
                    type="password"
                    name="password"
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={fieldClassName}
                    placeholder="Au moins 6 caractères"
                  />
                </label>
              </>
            ) : null}

            {errorMessage ? <MotionAlert tone="error" message={errorMessage} /> : null}
            {successMessage ? <MotionAlert tone="success" message={successMessage} /> : null}

            {artisanSignup && artisanStep === "trades" ? (
              <AnimatedButton
                type="submit"
                disabled={
                  isSubmitting ||
                  selectedCategoryIds.length === 0 ||
                  categories.length === 0 ||
                  Boolean(categoriesError)
                }
                className="aa-btn aa-btn-primary mt-1 w-full"
              >
                Continuer
              </AnimatedButton>
            ) : (
              <AnimatedButton type="submit" disabled={isSubmitting} className="aa-btn aa-btn-primary mt-1 w-full">
                {isSubmitting
                  ? "Veuillez patienter…"
                  : isLogin
                    ? "Se connecter"
                    : "Créer un compte"}
              </AnimatedButton>
            )}
          </form>
          </SlideUp>
        </main>
      </div>
    </div>
  );
}
