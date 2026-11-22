"use client";

import { useRouter } from "next/navigation";
import { createClient } from "../lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
    >
      Sign out
    </button>
  );
}