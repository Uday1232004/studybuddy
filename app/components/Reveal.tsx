"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

type Props = {
  children: ReactNode;
  delay?: number;
};

type RevealStyle = CSSProperties & {
  "--delay": string;
};

export default function Reveal({ children, delay = 0 }: Props) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    const prefersReducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (
      !element ||
      typeof IntersectionObserver === "undefined" ||
      prefersReducedMotion
    ) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries, currentObserver) => {
        const entry = entries.find(
          (observedEntry) =>
            observedEntry.target === element && observedEntry.isIntersecting
        );
        if (entry) {
          setVisible(true);
          currentObserver.unobserve(entry.target);
        }
      },
      { threshold: 0.12 }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={elementRef}
      className={`reveal${visible ? " reveal-visible" : ""}`}
      style={{ "--delay": `${delay}ms` } satisfies RevealStyle}
    >
      {children}
    </div>
  );
}
