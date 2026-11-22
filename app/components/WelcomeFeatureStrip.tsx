const features = [
  {
    title: "Instant summary",
    description: "Get the key ideas, without the noise.",
    icon: <path d="M5 5h14M5 10h14M5 15h8M3 5h.01M3 10h.01M3 15h.01" />,
  },
  {
    title: "Smart quiz",
    description: "Practice with questions from your notes.",
    icon: <path d="M8 5h10M8 10h10M8 15h6M4 5h.01M4 10h.01M4 15h.01" />,
  },
  {
    title: "Saved history",
    description: "Pick up where you left off.",
    icon: <path d="M4 5h16v14H4zM8 3v4m8-4v4M7 11h10m-10 4h6" />,
  },
  {
    title: "Private by design",
    description: "Only you can see your kits.",
    icon: <path d="M6 10V7a6 6 0 0 1 12 0v3m-14 0h16v11H4z" />,
  },
  {
    title: "Works with any notes",
    description: "Paste what you are already studying.",
    icon: <path d="M6 3h9l4 4v14H6zM15 3v5h5M9 12h7m-7 4h7" />,
  },
];

export default function WelcomeFeatureStrip() {
  return (
    <section
      aria-label="StudyBuddy features"
      className="grid grid-cols-1 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] md:grid-cols-2 lg:grid-cols-5"
    >
      {features.map((feature, index) => (
        <article
          key={feature.title}
          className={`p-5 sm:p-6 ${
            index < features.length - 1
              ? "border-b border-[var(--border)] md:border-r lg:border-b-0"
              : ""
          } ${index === 1 ? "md:border-r-0 lg:border-r" : ""}`}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5 text-[var(--accent)]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {feature.icon}
          </svg>
          <h2 className="mt-4 text-sm font-bold">{feature.title}</h2>
          <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
            {feature.description}
          </p>
        </article>
      ))}
    </section>
  );
}
