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
    return <main className="flex-1 overflow-y-auto">{children}</main>;
  }

  // Not connected or no company → show onboarding (full screen, no sidebar)
  if (!wallet.connected || (!loading && !company)) {
    return (
      <main className="flex-1 overflow-y-auto">
        <Onboarding />
      </main>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  // Company exists → show full app
  return (
    <>
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-4 pt-16 lg:pt-6 lg:p-8">{children}</main>
    </>
  );
}
