import Link from "next/link";
import SignOutButton from "../SignOutButton";
import ThemeToggle from "../ThemeToggle";

export default function TopBar() {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-5">
      <Link
        href="/"
        className="flex items-center gap-2 text-sm font-extrabold tracking-tight focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        <span className="size-2 rounded-full bg-[var(--accent)]" aria-hidden="true" />
        StudyBuddy
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <SignOutButton />
      </div>
    </header>
  );
}
