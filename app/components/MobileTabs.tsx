"use client";

export type TabName = "Notes" | "Workspace";

type Props = {
  activeTab: TabName;
  onSelect: (tab: TabName) => void;
};

const tabs: TabName[] = ["Notes", "Workspace"];

export default function MobileTabs({ activeTab, onSelect }: Props) {
  return (
    <nav
      aria-label="Study sections"
      className="grid shrink-0 grid-cols-2 border-b border-[var(--border)] bg-[var(--surface)] lg:hidden"
    >
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          aria-current={activeTab === tab ? "page" : undefined}
          onClick={() => onSelect(tab)}
          className={`border-b-2 px-3 py-3 text-sm focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
            activeTab === tab
              ? "border-[var(--accent)] font-semibold text-[var(--text)]"
              : "border-transparent text-[var(--muted)]"
          }`}
        >
          {tab}
        </button>
      ))}
    </nav>
  );
}
