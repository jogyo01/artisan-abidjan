"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, m } from "motion/react";
import { NotificationBadge } from "@/components/notifications/NotificationBadge";
import { BrandMark } from "@/components/brand/BrandMark";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";
import { createClient } from "@/lib/supabase/client";

type UserRole = "CLIENT" | "ARTISAN" | "ADMIN";

type NavLink = {
  href: string;
  label: string;
  badge?: number;
};

function isUserRole(value: string): value is UserRole {
  return value === "CLIENT" || value === "ARTISAN" || value === "ADMIN";
}

function linkClassName(active: boolean): string {
  return `relative inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium transition ${
    active
      ? "text-[var(--aa-ink)]"
      : "text-[var(--aa-ink-soft)] hover:bg-[color-mix(in_srgb,var(--aa-terracotta)_8%,transparent)] hover:text-[var(--aa-ink)]"
  }`;
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  if (href === "/admin") {
    return pathname === "/admin";
  }
  if (href === "/artisan") {
    return pathname === "/artisan";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Navbar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [role, setRole] = useState<UserRole | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const unreadCount = useUnreadNotifications();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPathname, setMenuPathname] = useState(pathname);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  if (menuPathname !== pathname) {
    setMenuPathname(pathname);
    setIsMenuOpen(false);
  }

  useEffect(() => {
    function onScroll() {
      setIsScrolled(window.scrollY > 8);
    }

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadNavigation() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) {
        return;
      }

      if (!user) {
        setIsAuthenticated(false);
        setRole(null);
        setIsReady(true);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) {
        return;
      }

      const nextRole =
        typeof profile?.role === "string" && isUserRole(profile.role) ? profile.role : "CLIENT";

      setIsAuthenticated(true);
      setRole(nextRole);
      setIsReady(true);
    }

    void loadNavigation();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        void loadNavigation();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const links: NavLink[] = (() => {
    if (!isAuthenticated || !role) {
      return [
        { href: "/", label: "Accueil" },
        { href: "/a-propos", label: "À propos" },
        { href: "/auth", label: "Se connecter" },
        { href: "/auth?mode=signup", label: "Créer un compte" },
      ];
    }

    if (role === "ADMIN") {
      return [
        { href: "/admin", label: "Tableau de bord" },
        { href: "/admin/artisans", label: "Artisans" },
        { href: "/admin/users", label: "Utilisateurs" },
        { href: "/admin/bookings", label: "Demandes" },
        { href: "/admin/reviews", label: "Avis" },
        { href: "/admin/payments", label: "Paiements" },
        { href: "/admin/categories", label: "Catégories" },
        { href: "/notifications", label: "Notifications", badge: unreadCount },
        { href: "/profile", label: "Profil" },
      ];
    }

    if (role === "ARTISAN") {
      return [
        { href: "/artisan", label: "Tableau de bord" },
        { href: "/artisan/bookings", label: "Demandes" },
        { href: "/artisan/services", label: "Mes services" },
        { href: "/notifications", label: "Notifications", badge: unreadCount },
        { href: "/artisan/profile", label: "Mon profil" },
      ];
    }

    return [
      { href: "/", label: "Accueil" },
      { href: "/artisans", label: "Artisans" },
      { href: "/bookings", label: "Mes demandes" },
      { href: "/notifications", label: "Notifications", badge: unreadCount },
      { href: "/profile", label: "Profil" },
    ];
  })();

  async function handleSignOut() {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    setIsAuthenticated(false);
    setRole(null);
    setIsMenuOpen(false);
    setIsSigningOut(false);
    router.replace("/auth");
    router.refresh();
  }

  function renderLink(link: NavLink, scope: "desktop" | "mobile" = "desktop") {
    const hrefPath = link.href.split("?")[0] ?? link.href;
    const isSignupLink = link.href.includes("mode=signup");
    const authMode = searchParams.get("mode");
    const publicNav = !isAuthenticated;
    const active =
      hrefPath === "/auth"
        ? pathname === "/auth" && (isSignupLink ? authMode === "signup" : authMode !== "signup")
        : isActivePath(pathname, hrefPath);

    if (publicNav && isSignupLink) {
      return (
        <Link
          key={`${link.href}-${link.label}`}
          href={link.href}
          className="aa-btn aa-btn-primary min-h-10 px-4 py-2 text-sm"
          onClick={() => setIsMenuOpen(false)}
        >
          {link.label}
        </Link>
      );
    }

    return (
      <Link
        key={`${link.href}-${link.label}`}
        href={link.href}
        className={linkClassName(active)}
        onClick={() => setIsMenuOpen(false)}
      >
        {active && scope === "desktop" ? (
          <m.span
            layoutId="aa-nav-active"
            className="absolute inset-0 -z-10 rounded-lg bg-[color-mix(in_srgb,var(--aa-terracotta)_12%,transparent)]"
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          />
        ) : active ? (
          <span className="absolute inset-0 -z-10 rounded-lg bg-[color-mix(in_srgb,var(--aa-terracotta)_12%,transparent)]" />
        ) : null}
        <span className="relative inline-flex items-center gap-2">
          {link.label}
          <NotificationBadge count={link.badge ?? 0} />
        </span>
      </Link>
    );
  }

  return (
    <header
      className={`sticky top-0 z-40 border-b backdrop-blur-md transition-[background-color,box-shadow,border-color] duration-300 ${
        isScrolled
          ? "aa-nav-scrolled border-[color-mix(in_srgb,var(--aa-ink)_12%,transparent)] bg-[color-mix(in_srgb,var(--aa-cream)_94%,transparent)]"
          : "border-transparent bg-[color-mix(in_srgb,var(--aa-cream)_55%,transparent)]"
      }`}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <BrandMark href="/" />

        <nav className="hidden max-w-[70%] flex-1 flex-wrap items-center justify-end gap-1 lg:flex" aria-label="Navigation principale">
          {isReady ? (
            links.map((link) => renderLink(link, "desktop"))
          ) : (
            <p className="px-3 py-2 text-sm text-[var(--aa-ink-soft)]">Chargement…</p>
          )}
          {isReady && isAuthenticated ? (
            <button
              type="button"
              onClick={() => {
                void handleSignOut();
              }}
              disabled={isSigningOut}
              className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium text-[var(--aa-ink-soft)] transition hover:bg-[color-mix(in_srgb,var(--aa-terracotta)_10%,transparent)] hover:text-[var(--aa-ink)] disabled:opacity-60"
            >
              {isSigningOut ? "Déconnexion…" : "Déconnexion"}
            </button>
          ) : null}
        </nav>

        <button
          type="button"
          className="inline-flex min-h-11 items-center rounded-lg border border-[color-mix(in_srgb,var(--aa-ink)_12%,transparent)] px-3 py-2.5 text-sm font-medium text-[var(--aa-ink)] lg:hidden"
          aria-expanded={isMenuOpen}
          aria-controls="mobile-navigation"
          aria-label={isMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          {isMenuOpen ? "Fermer" : "Menu"}
        </button>
      </div>

      <AnimatePresence>
        {isMenuOpen ? (
          <m.nav
            id="mobile-navigation"
            className="border-t border-[color-mix(in_srgb,var(--aa-ink)_10%,transparent)] px-4 py-3 lg:hidden"
            aria-label="Navigation mobile"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex flex-col gap-1">
              {isReady ? links.map((link) => renderLink(link, "mobile")) : <p className="px-3 py-2 text-sm text-[var(--aa-ink-soft)]">Chargement…</p>}
              {isReady && isAuthenticated ? (
                <button
                  type="button"
                  onClick={() => {
                    void handleSignOut();
                  }}
                  disabled={isSigningOut}
                  className="inline-flex min-h-11 items-center rounded-lg px-3 py-2 text-left text-sm font-medium text-[var(--aa-ink-soft)] transition hover:bg-[color-mix(in_srgb,var(--aa-terracotta)_10%,transparent)] hover:text-[var(--aa-ink)] disabled:opacity-60"
                >
                  {isSigningOut ? "Déconnexion…" : "Déconnexion"}
                </button>
              ) : null}
            </div>
          </m.nav>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
