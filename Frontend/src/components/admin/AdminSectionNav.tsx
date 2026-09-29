import Link from "next/link";

export const ADMIN_SECTIONS = [
  { href: "/admin", label: "Tableau de bord" },
  { href: "/admin/artisans", label: "Artisans" },
  { href: "/admin/users", label: "Utilisateurs" },
  { href: "/admin/bookings", label: "Demandes" },
  { href: "/admin/reviews", label: "Avis" },
  { href: "/admin/payments", label: "Paiements" },
  { href: "/admin/categories", label: "Catégories" },
  { href: "/notifications", label: "Notifications" },
  { href: "/profile", label: "Profil" },
] as const;

export function AdminSectionNav({ current }: { current: string }) {
  return (
    <nav className="mt-6 flex flex-wrap gap-2" aria-label="Sections administration">
      {ADMIN_SECTIONS.map((section) => {
        const active =
          section.href === "/admin" ? current === "/admin" : current.startsWith(section.href);
        return (
          <Link
            key={section.href}
            href={section.href}
            className={`inline-flex min-h-11 items-center rounded-full px-3 py-2 text-sm font-medium transition ${
              active
                ? "bg-[var(--aa-terracotta)] text-white"
                : "border border-[color-mix(in_srgb,var(--aa-ink)_12%,transparent)] text-[var(--aa-ink-soft)] hover:border-[var(--aa-terracotta)]"
            }`}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
