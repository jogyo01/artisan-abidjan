import Link from "next/link";

type BrandMarkProps = {
  href?: string;
  className?: string;
  invert?: boolean;
};

export function BrandMark({ href = "/", className = "", invert = false }: BrandMarkProps) {
  const color = invert ? "text-white" : "text-[var(--aa-ink)]";

  return (
    <Link
      href={href}
      className={`inline-flex items-baseline gap-0 text-[0.95rem] font-semibold tracking-tight ${color} ${className}`}
    >
      <span>Artisan-Abidjan</span>
    </Link>
  );
}
