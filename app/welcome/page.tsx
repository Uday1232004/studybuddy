import Link from "next/link";
import ArrowLink from "../components/ArrowLink";
import Reveal from "../components/Reveal";
import ThemeToggle from "../ThemeToggle";

const features = [
  {
    title: "Teacher chat with citations",
    description:
      "Ask questions about your material and see the pages that support the answer.",
    icon: "M4 5h16v11H9l-5 4z M8 9h8 M8 12h5",
  },
  {
    title: "Teacher + exam answer mode",
    description:
      "Start with a simple explanation, then practise the exact exam answer format.",
    icon: "M12 3 4 7v5c0 5 8 9 8 9s8-4 8-9V7z M9 12l2 2 4-4",
  },
  {
    title: "Study kits: summary and quiz",
    description:
      "Turn your notes into a concise summary and a quiz for quick revision.",
    icon: "M6 4h13v16H6z M9 8h7 M9 12h7 M9 16h4 M4 7v13",
  },
  {
    title: "AI scan of every module: topics, pages and difficulty",
    description:
      "Scan your modules to see the topics, page ranges and difficulty at a glance.",
    icon: "M4 5h16v14H4z M8 9h8 M8 12h5 M8 15h3 M17 15l1.5 1.5L21 14",
  },
  {
    title: "Day-by-day study planner with plan history",
    description:
      "Build a daily schedule around your exams and revisit saved plans when needed.",
    icon: "M5 4v3 M19 4v3 M4 8h16v12H4z M8 12h3 M8 16h6",
  },
  {
    title: "Study this: jump from your plan straight into the lesson",
    description:
      "Open a lesson directly from a planned task or a scanned topic.",
    icon: "M5 4h14v16H5z M8 8h8 M8 12h4 M15 14l3 3m0-3v3h-3",
  },
] as const;

const steps = [
  {
    title: "Upload your PDFs",
    description:
      "Add your notes or module PDFs, up to 50 MB each, so your teacher can work from your material.",
  },
  {
    title: "Learn with your AI teacher",
    description:
      "Get a simple explanation first, then the exact exam answer format, with page citations.",
  },
  {
    title: "Follow your plan",
    description:
      "Use a day-by-day schedule built around your exam dates and each topic's difficulty.",
  },
] as const;

const trustPoints = [
  "Your data is private: only you can see your notes and plans",
  "Reset your password any time",
  "Fair daily limits keep the service free for everyone",
] as const;

export default function WelcomePage() {
  return (
    <main className="min-h-dvh overflow-x-clip bg-[var(--bg)] text-[var(--text)]">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <header className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] py-4">
          <Link
            href="/welcome"
            className="motion-link flex items-center gap-2 text-sm font-extrabold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <span
              className="size-2 rounded-full bg-[var(--accent)]"
              aria-hidden="true"
            />
            StudyBuddy
          </Link>
          <nav
            className="order-3 flex w-full items-center gap-5 sm:order-none sm:w-auto"
            aria-label="Main navigation"
          >
            <a
              href="#how"
              className="motion-link text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              How it works
            </a>
            <a
              href="#features"
              className="motion-link text-xs font-medium text-[var(--muted)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              Features
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <ThemeToggle />
            <ArrowLink href="/login">Get started</ArrowLink>
          </div>
        </header>

        <section className="hero-glow relative isolate grid min-w-0 items-center gap-10 overflow-hidden py-14 sm:py-20 md:grid-cols-[1.1fr_0.9fr] md:gap-8 lg:py-24">
          <div
            aria-hidden="true"
            className="hero-glow-orb pointer-events-none absolute -right-24 top-0 size-[28rem] rounded-full"
          />
          <div className="relative z-10">
            <p className="hero-enter hero-enter-1 text-xs font-bold tracking-[0.2em] text-[var(--accent)]">
              STUDYBUDDY
            </p>
            <h1 className="hero-enter hero-enter-2 mt-4 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Your AI study teacher, planned around your exams
            </h1>
            <p className="hero-enter hero-enter-3 mt-5 max-w-xl text-sm leading-6 text-[var(--muted)] sm:text-base sm:leading-7">
              Learn from your own notes, get clear answers with page citations,
              and follow a study plan shaped around your exam dates.
            </p>
            <div className="hero-enter hero-enter-4 mt-7 flex flex-wrap items-center gap-3">
              <ArrowLink href="/login">Get started</ArrowLink>
              <ArrowLink href="#how" variant="outline">
                See how it works
              </ArrowLink>
            </div>
          </div>

          <div className="relative z-10 mx-auto w-full max-w-sm md:justify-self-end">
            <div className="motion-card rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.18em] text-[var(--accent)]">
                    YOUR STUDY PLAN
                  </p>
                  <h2 className="mt-2 text-lg font-bold">Next up</h2>
                </div>
                <span className="grid size-10 place-items-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
                  <svg
                    viewBox="0 0 24 24"
                    className="size-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 4v3m14-3v3M4 8h16v12H4zM8 12h3m-3 4h7" />
                  </svg>
                </span>
              </div>
              <div className="mt-5 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
                <p className="text-xs font-semibold text-[var(--muted)]">
                  TODAY · 30 MIN
                </p>
                <p className="mt-2 font-semibold">Cell structure</p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--surface-hover)]">
                  <span className="block h-full w-2/3 rounded-full bg-[var(--accent)]" />
                </div>
              </div>
              <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
                One clear next step, built around your exam dates.
              </p>
            </div>
          </div>
        </section>

        <Reveal delay={0}>
          <section
            id="how"
            className="scroll-mt-8 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8"
          >
            <div className="max-w-2xl">
              <p className="text-xs font-bold tracking-[0.18em] text-[var(--accent)]">
                HOW IT WORKS
              </p>
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">
                Three simple steps to feel ready
              </h2>
            </div>
            <ol className="mt-7 grid gap-5 md:grid-cols-3">
              {steps.map((step, index) => (
                <li
                  key={step.title}
                  className="motion-card list-row-enter rounded-xl border border-[var(--border)] bg-[var(--bg)] p-5"
                >
                  <span className="grid size-9 place-items-center rounded-xl bg-[var(--accent)] text-sm font-bold text-[var(--on-accent)]">
                    {index + 1}
                  </span>
                  <h3 className="mt-4 text-base font-bold">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    {step.description}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </Reveal>

        <Reveal delay={50}>
          <section id="features" className="scroll-mt-8 py-16 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-bold tracking-[0.18em] text-[var(--accent)]">
                MADE FOR YOUR STUDY ROUTINE
              </p>
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">
                Everything you need to keep moving
              </h2>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => (
                <article
                  key={feature.title}
                  className="motion-card list-row-enter rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6"
                >
                  <span className="grid size-10 place-items-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
                    <svg
                      viewBox="0 0 24 24"
                      className="size-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d={feature.icon} />
                    </svg>
                  </span>
                  <h3 className="mt-4 text-base font-bold">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    {feature.description}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </Reveal>

        <Reveal delay={0}>
          <section
            aria-label="Your data and account"
            className="motion-card rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7"
          >
            <ul className="grid gap-4 sm:grid-cols-3">
              {trustPoints.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-3 text-sm leading-6"
                >
                  <span
                    className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[var(--good-bg)] text-[var(--good)]"
                    aria-hidden="true"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      className="size-3.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m4 10 4 4 8-8" />
                    </svg>
                  </span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </section>
        </Reveal>

        <Reveal delay={0}>
          <section className="motion-card my-14 flex flex-col items-start justify-between gap-6 rounded-2xl bg-[var(--panel)] p-6 text-[var(--on-panel)] sm:my-20 sm:p-10 md:flex-row md:items-center">
            <div>
              <p className="text-xs font-bold tracking-[0.18em] text-[var(--accent)]">
                READY WHEN YOU ARE
              </p>
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight sm:text-3xl">
                Make your next study session count.
              </h2>
            </div>
            <ArrowLink href="/login">Get started</ArrowLink>
          </section>
        </Reveal>

        <footer className="flex flex-col gap-3 border-t border-[var(--border)] py-6 text-xs text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 StudyBuddy</p>
          <nav className="flex gap-5" aria-label="Footer navigation">
            <Link
              href="/about"
              className="motion-link hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              About
            </Link>
            <Link
              href="/login"
              className="motion-link hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              Login
            </Link>
          </nav>
        </footer>
      </div>
    </main>
  );
}
