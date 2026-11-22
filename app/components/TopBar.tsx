import Link from "next/link";
import SignOutButton from "../SignOutButton";
import ThemeToggle from "../ThemeToggle";

export default function TopBar() {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--bg)] px-5">
      <Link
        href="/"
        className="text-sm font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      >
        StudyBuddy
      </Link>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <SignOutButton />
      </div>
    </header>
  );
}
