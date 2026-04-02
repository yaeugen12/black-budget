"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { useCompany } from "@/lib/company-context";
import {
  LayoutDashboard, FileText, CheckCircle2, Users, Shield, Eye,
  ArrowUpDown, ChevronRight, Menu, X,
} from "lucide-react";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Invoices", href: "/invoices", icon: FileText },
  { name: "Approvals", href: "/approvals", icon: CheckCircle2, badge: true },
  { name: "Payments", href: "/payments", icon: ArrowUpDown },
  { name: "Team", href: "/team", icon: Users },
  { name: "Policies", href: "/policies", icon: Shield },
  { name: "Proofs", href: "/proofs", icon: Eye },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { company, payments } = useCompany();
  const pendingCount = payments.filter((p) => p.account.status.pending !== undefined).length;

  return (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" className="text-primary" />
            <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" className="text-primary opacity-60" />
            <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" className="text-primary opacity-60" />
            <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" className="text-primary opacity-30" />
          </svg>
        </div>
        <div className="min-w-0">
          <h1 className="font-semibold text-[13px] tracking-tight truncate">
            {company?.name || "Black Budget"}
          </h1>
          <p className="text-[11px] text-muted-foreground">Private Finance OS</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        <div className="text-label px-3 py-2">Menu</div>
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onNavigate}
              className={`group flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all duration-150 ${
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-[rgba(255,255,255,0.03)]"
              }`}
            >
              <item.icon className={`w-[18px] h-[18px] ${isActive ? "" : "opacity-60 group-hover:opacity-100"}`} />
              <span className="flex-1">{item.name}</span>
              {item.badge && pendingCount > 0 && <span className="badge badge-warning">{pendingCount}</span>}
              {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-40" />}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-3 space-y-2 border-t border-border">
        <div className="flex items-center justify-between px-3 py-1">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-success pulse-dot" />
            <span className="text-[11px] text-muted-foreground">Devnet</span>
          </div>
          <span className="text-[11px] text-muted-foreground text-mono">v0.1.0</span>
        </div>
        <WalletMultiButton style={{
          width: "100%", height: "38px", borderRadius: "10px", fontSize: "12px",
          fontWeight: 500, backgroundColor: "var(--secondary)", color: "var(--foreground)",
          justifyContent: "center", border: "1px solid var(--border)",
        }} />
      </div>
    </>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 rounded-lg bg-card border border-border flex items-center justify-center"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-[280px] flex flex-col bg-card border-r border-border">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-secondary flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[260px] border-r border-border bg-card/50">
        <SidebarContent />
      </aside>
    </>
  );
}
