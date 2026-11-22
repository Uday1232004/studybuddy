import Link from "next/link";

type Props = {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "dark" | "outline";
};

const variants = {
  primary:
    "bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)]",
  dark: "bg-[var(--panel)] text-[var(--on-panel)] hover:opacity-90",
  outline:
    "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-hover)]",
};

const arrowTiles = {
  primary: "bg-[var(--on-accent)]/10",
  dark: "bg-[var(--accent)] text-[var(--on-accent)]",
  outline: "bg-[var(--surface-hover)]",
};

export default function ArrowLink({
  href,
  children,
  variant = "primary",
}: Props) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-between gap-5 rounded-xl px-5 py-3 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${variants[variant]}`}
    >
      {children}
      <span className={`grid size-7 place-items-center rounded-lg ${arrowTiles[variant]}`} aria-hidden="true">
        <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3.5 10h12m-5-5 5 5-5 5" />
        </svg>
      </span>
    </Link>
  );
}
