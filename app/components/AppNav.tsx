"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "../SignOutButton";
import ThemeToggle from "../ThemeToggle";

export default function AppNav() {
  const pathname = usePathname();
  const workspaceActive = pathname === "/";
  const plannerActive =
    pathname === "/planner" || pathname.startsWith("/planner/");

  return (
    <header className="sticky top-0 z-40 w-full shrink-0 border-b border-[var(--border)] bg-[var(--surface)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-[var(--surface)] focus:px-3 focus:py-2 focus:text-sm focus:text-[var(--text)] focus:ring-2 focus:ring-[var(--accent)]"
      >
        Skip to content
      </a>
      <div className="mx-auto flex min-h-14 w-full max-w-7xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-3 py-2 sm:flex-nowrap sm:px-5 sm:py-0">
        <div className="flex min-w-0 items-center gap-3 sm:gap-6">
          <Link
            href="/"
            className="flex shrink-0 items-center gap-2 text-sm font-extrabold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <span
              className="size-2 rounded-full bg-[var(--accent)]"
              aria-hidden="true"
            />
            StudyBuddy
          </Link>
          <nav
            aria-label="Primary navigation"
            className="flex shrink-0 items-center gap-1"
          >
            <Link
              href="/"
              aria-current={workspaceActive ? "page" : undefined}
              className={`rounded-lg px-2.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:px-3 sm:text-sm ${
                workspaceActive
                  ? "bg-[var(--accent)] text-[var(--on-accent)]"
                  : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
              }`}
            >
              Workspace
            </Link>
            <Link
              href="/planner"
              aria-current={plannerActive ? "page" : undefined}
              className={`rounded-lg px-2.5 py-2 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:px-3 sm:text-sm ${
                plannerActive
                  ? "bg-[var(--accent)] text-[var(--on-accent)]"
                  : "text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
              }`}
            >
              Planner
            </Link>
          </nav>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ThemeToggle />
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
