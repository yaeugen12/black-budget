"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useCompany } from "@/lib/company-context";
import { Sidebar } from "./sidebar";
import { Onboarding } from "./onboarding";
import { Loader2 } from "lucide-react";

import { usePathname } from "next/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const wallet = useWallet();
  const { company, loading } = useCompany();
  const pathname = usePathname();

  // Landing page — no shell, full screen
  if (pathname === "/landing") {
    return <main className="flex-1 overflow-y-auto overscroll-contain">{children}</main>;
  }

  // Not connected or no company → show onboarding (full screen, no sidebar)
  if (!wallet.connected || (!loading && !company)) {
    return (
      <main className="relative flex-1 overflow-y-auto overscroll-contain page-shell">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_top,rgba(89,168,255,0.16),transparent_62%)]" />
        <Onboarding />
      </main>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  // Company exists → show full app
  return (
    <>
      <Sidebar />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden page-shell">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top,rgba(89,168,255,0.12),transparent_60%)]" />
        <div className="pointer-events-none absolute right-0 top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(30,201,168,0.1),transparent_70%)] blur-2xl" />
        <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pt-16 lg:p-8 lg:pt-8">
          {children}
        </main>
      </div>
    </>
  );
}
