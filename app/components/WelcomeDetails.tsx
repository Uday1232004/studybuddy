const steps = [
  ["1", "Paste your notes", "Bring the notes you already have."],
  ["2", "Create your study kit", "Get a useful summary and quiz."],
  ["3", "Practice and review", "Check your understanding as you go."],
];

export default function WelcomeDetails() {
  return (
    <section
      id="features"
      className="grid scroll-mt-8 gap-10 py-16 md:grid-cols-2 md:items-center md:gap-16 md:py-24"
    >
      <div>
        <p className="text-xs font-semibold tracking-[0.2em] text-[var(--accent)]">
          WHAT YOU GET
        </p>
        <h2 className="mt-4 max-w-lg text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          From messy notes to exam-ready
        </h2>
        <p className="mt-4 max-w-lg text-sm leading-6 text-[var(--muted)]">
          Turn the material you already have into a focused way to review,
          practice, and remember what matters.
        </p>
        <div className="mt-8 grid grid-cols-3 gap-3">
          {[
            ["5", "Questions per kit"],
            ["5–7", "Key points"],
            ["10", "Recent kits saved"],
          ].map(([number, label]) => (
            <div key={label} className="border-l border-[var(--border)] pl-3">
              <p className="text-3xl font-extrabold tracking-tight text-[var(--accent)]">
                {number}
              </p>
              <p className="mt-1 text-[9px] font-semibold leading-4 tracking-wider text-[var(--muted)] uppercase">
                {label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div
        id="how"
        className="scroll-mt-8 rounded-2xl bg-[var(--panel)] p-6 text-[var(--on-panel)] sm:p-8"
      >
        <p className="text-xs font-semibold tracking-[0.2em] text-[var(--accent)]">
          HOW IT WORKS
        </p>
        <h2 className="mt-3 text-2xl font-extrabold tracking-tight">
          Three steps. Clear focus.
        </h2>
        <ol className="mt-7 space-y-5">
          {steps.map(([number, title, description]) => (
            <li key={number} className="flex gap-4">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--accent)] text-sm font-extrabold text-[var(--on-accent)]">
                {number}
              </span>
              <div>
                <h3 className="text-sm font-bold">{title}</h3>
                <p className="mt-1 text-xs leading-5 text-[var(--on-panel-muted)]">
                  {description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
