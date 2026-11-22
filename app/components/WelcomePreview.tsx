export default function WelcomePreview() {
  return (
    <div className="relative mx-auto w-full max-w-[500px] py-8 lg:py-12">
      <div
        aria-hidden="true"
        className="absolute right-4 top-0 size-56 rounded-full border border-[var(--accent)]/50 sm:right-8 sm:size-72"
      />
      <div className="relative space-y-4">
        <div className="ml-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:ml-0 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.18em] text-[var(--accent)]">
                STUDY KIT
              </p>
              <h2 className="mt-2 text-base font-bold">Cell biology basics</h2>
            </div>
            <span className="rounded-full bg-[var(--surface-hover)] px-3 py-1 text-[10px] font-semibold text-[var(--muted)]">
              SUMMARY
            </span>
          </div>
          <ul className="mt-5 space-y-3 text-sm text-[var(--muted)]">
            {[
              "The cell is the basic unit of life.",
              "Membranes regulate what enters and leaves.",
              "Mitochondria produce usable cellular energy.",
            ].map((line) => (
              <li key={line} className="flex items-start gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                {line}
              </li>
            ))}
          </ul>
        </div>

        <div className="ml-auto w-[94%] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:w-[88%] sm:p-6">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-[var(--accent)]">
              QUICK QUIZ
            </p>
            <p className="text-xs text-[var(--muted)]">1 of 5</p>
          </div>
          <h3 className="mt-3 text-sm font-bold">
            Which structure produces most cellular energy?
          </h3>
          <div className="mt-4 space-y-2">
            {["Ribosome", "Mitochondrion", "Nucleus", "Cell wall"].map(
              (option, index) => (
                <div
                  key={option}
                  className={`rounded-xl border px-3 py-2 text-xs ${
                    index === 1
                      ? "border-[var(--good)] bg-[var(--good-bg)] font-semibold text-[var(--good)]"
                      : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
                  }`}
                >
                  {String.fromCharCode(65 + index)}. {option}
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
