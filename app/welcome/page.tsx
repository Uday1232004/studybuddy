import Link from "next/link";
import ArrowLink from "../components/ArrowLink";
import ThemeToggle from "../ThemeToggle";
import WelcomeDetails from "../components/WelcomeDetails";
import WelcomeFeatureStrip from "../components/WelcomeFeatureStrip";
import WelcomePreview from "../components/WelcomePreview";

export default function WelcomePage() {
  return (
    <main className="min-h-full bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto max-w-[1280px] px-5 sm:px-8 lg:px-12">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-full border border-[var(--border)] bg-[var(--surface)] p-2 pl-4">
          <Link
            href="/welcome"
            className="flex items-center gap-2 text-sm font-extrabold tracking-tight focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            <span className="size-2 rounded-full bg-[var(--accent)]" aria-hidden="true" />
            StudyBuddy
          </Link>
          <nav
            className="order-3 flex w-full items-center justify-center gap-5 border-t border-[var(--border)] pt-2 sm:order-none sm:w-auto sm:border-0 sm:pt-0"
            aria-label="Main navigation"
          >
            <a href="#how" className="text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
              How it works
            </a>
            <a href="#features" className="text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
              Features
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <ArrowLink href="/login" variant="dark">
              Get started
            </ArrowLink>
          </div>
        </header>

        <section className="grid items-center gap-6 py-10 sm:py-14 md:grid-cols-2 md:gap-10 lg:py-20">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-[var(--accent)]">
              STUDYBUDDY
            </p>
            <h1 className="mt-4 max-w-2xl text-4xl font-extrabold uppercase leading-[0.98] tracking-[-0.06em] sm:text-5xl lg:text-6xl xl:text-7xl">
              Study smarter. Revise faster.
            </h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-[var(--muted)] sm:text-base">
              Paste your notes. Get a summary and a quiz in seconds.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <ArrowLink href="/login">Get started</ArrowLink>
              <ArrowLink href="#how" variant="outline">
                See how it works
              </ArrowLink>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
              <span className="font-semibold tracking-[0.15em] text-[var(--muted)]">
                BUILT WITH
              </span>
              <span className="text-[var(--muted)]">Next.js</span>
              <span className="text-[var(--muted)]">Supabase</span>
              <span className="text-[var(--muted)]">Gemini</span>
              <span className="text-[var(--muted)]">Vercel</span>
            </div>
          </div>
          <WelcomePreview />
        </section>

        <WelcomeFeatureStrip />
        <WelcomeDetails />

        <section className="flex flex-col items-start justify-between gap-6 rounded-2xl bg-[var(--panel)] p-7 text-[var(--on-panel)] sm:p-10 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] text-[var(--accent)]">
              READY WHEN YOU ARE
            </p>
            <h2 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">
              Let&apos;s study smarter, together.
            </h2>
          </div>
          <ArrowLink href="/login">Get started</ArrowLink>
        </section>

        <footer className="flex flex-col gap-3 py-7 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 StudyBuddy</p>
          <nav className="flex gap-5" aria-label="Footer navigation">
            <Link href="/login" className="hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
              Log in
            </Link>
            <Link href="/about" className="hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
              About
            </Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
