"use client";

export type QuizQuestion = {
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
};

type Props = {
  quiz: QuizQuestion[] | null;
  answers: Record<number, number>;
  answeredCount: number;
  score: number;
  loading: boolean;
  onChoose: (questionIndex: number, optionIndex: number) => void;
  onTryAgain: () => void;
};

export default function QuizPanel({
  quiz,
  answers,
  answeredCount,
  score,
  loading,
  onChoose,
  onTryAgain,
}: Props) {
  return (
    <div className="h-full overflow-y-auto px-5 py-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">Quiz</h2>
        {quiz && (
          <span className="text-xs text-[var(--muted)]">
            {answeredCount} of {quiz.length} answered
          </span>
        )}
      </div>
      {loading ? (
        <div className="mt-5 space-y-4 animate-pulse" aria-live="polite">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="space-y-3 rounded-lg border border-[var(--border)] p-4"
            >
              <div className="h-3 w-5/6 rounded bg-[var(--surface-hover)]" />
              <div className="h-8 rounded bg-[var(--surface-hover)]" />
              <div className="h-8 rounded bg-[var(--surface-hover)]" />
            </div>
          ))}
        </div>
      ) : !quiz ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Your quiz will appear here after you create a study kit.
        </p>
      ) : (
        <div aria-live="polite" className="mt-4 space-y-4">
          {quiz.map((question, questionIndex) => {
            const picked = answers[questionIndex];
            const answered = picked !== undefined;
            return (
              <article
                key={questionIndex}
                className="rounded-lg border border-[var(--border)] p-4"
              >
                <h3 className="text-sm font-medium leading-5">
                  {questionIndex + 1}. {question.question}
                </h3>
                <div className="mt-3 space-y-2">
                  {question.options.map((option, optionIndex) => {
                    let stateClass =
                      "border-[var(--border)] hover:bg-[var(--surface-hover)]";
                    if (answered && optionIndex === question.answerIndex) {
                      stateClass =
                        "border-[var(--good)] bg-[var(--good-bg)] text-[var(--good)]";
                    } else if (answered && optionIndex === picked) {
                      stateClass =
                        "border-[var(--bad)] bg-[var(--bad-bg)] text-[var(--bad)]";
                    }
                    return (
                      <button
                        key={optionIndex}
                        type="button"
                        onClick={() => onChoose(questionIndex, optionIndex)}
                        disabled={answered}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:cursor-default ${stateClass}`}
                      >
                        {"ABCD"[optionIndex]}. {option}
                      </button>
                    );
                  })}
                </div>
                {answered && (
                  <p className="mt-3 text-sm leading-5 text-[var(--muted)]">
                    {question.explanation}
                  </p>
                )}
              </article>
            );
          })}
          {answeredCount === quiz.length && (
            <div className="rounded-lg border border-[var(--border)] p-4">
              <p className="text-sm font-medium">
                Your score: {score} / {quiz.length}
              </p>
              <button
                type="button"
                onClick={onTryAgain}
                className="mt-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
