"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useCompany } from "@/lib/company-context";
import { toast } from "sonner";
import {
  LayoutDashboard, FileText, CheckCircle2, Users, Shield, Eye,
  ArrowUpDown, ChevronRight, Menu, X, Banknote, Copy, RefreshCw, LogOut, Wallet,
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Invoices", href: "/invoices", icon: FileText },
  { name: "Approvals", href: "/approvals", icon: CheckCircle2, badge: true },
  { name: "Payroll", href: "/payroll", icon: Banknote },
  { name: "Payments", href: "/payments", icon: ArrowUpDown },
  { name: "Team", href: "/team", icon: Users },
  { name: "Policies", href: "/policies", icon: Shield },
  { name: "Proofs", href: "/proofs", icon: Eye },
];

function truncatePubkey(key: string) {
  if (key.length <= 10) return key;
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

function WalletPanel({ onAction }: { onAction?: () => void }) {
  const wallet = useWallet();
  const { setVisible } = useWalletModal();

  const openWalletModal = () => {
    onAction?.();
    requestAnimationFrame(() => setVisible(true));
  };

  const handleCopy = async () => {
    if (!wallet.publicKey) return;
    try {
      await navigator.clipboard.writeText(wallet.publicKey.toBase58());
      toast.success("Wallet address copied");
    } catch {
      toast.error("Couldn't copy wallet address");
    }
  };

  const handleDisconnect = async () => {
    onAction?.();
    try {
      await wallet.disconnect();
      toast.success("Wallet disconnected");
    } catch {
      toast.error("Failed to disconnect wallet");
    }
  };

  if (!wallet.connected || !wallet.publicKey) {
    return (
      <div className="rounded-2xl border border-border bg-secondary/35 px-4 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">Wallet</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Connect to keep using the treasury workspace.</p>
          </div>
        </div>
        <button onClick={openWalletModal} className="btn-primary mt-4 w-full">
          Connect Wallet
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-secondary/35 px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
          <Wallet className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-medium">{wallet.wallet?.adapter.name || "Wallet"}</p>
            <span className="badge badge-success">Connected</span>
          </div>
          <p className="mt-1 font-mono text-[12px] text-muted-foreground">
            {truncatePubkey(wallet.publicKey.toBase58())}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <button onClick={handleCopy} className="btn-secondary w-full px-3 py-2 text-[12px]">
          <Copy className="h-3.5 w-3.5" />
          Copy
        </button>
        <button onClick={openWalletModal} className="btn-secondary w-full px-3 py-2 text-[12px]">
          <RefreshCw className="h-3.5 w-3.5" />
          Switch
        </button>
        <button
          onClick={handleDisconnect}
          className="btn-secondary w-full px-3 py-2 text-[12px] text-destructive hover:text-destructive"
        >
          <LogOut className="h-3.5 w-3.5" />
          Disconnect
        </button>
      </div>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { company, payments } = useCompany();
  const pendingCount = payments.filter((p) => p.account.status.pending !== undefined).length;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-border px-4 py-4">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-secondary/30 px-4 py-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/15">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" className="text-primary" />
                <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" className="text-primary opacity-60" />
                <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" className="text-primary opacity-60" />
                <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" className="text-primary opacity-30" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[13px] font-semibold tracking-tight">
                {company?.name || "Black Budget"}
              </h1>
              <p className="text-[11px] text-muted-foreground">Treasury workspace</p>
            </div>
            <span className="badge badge-info">Devnet</span>
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-0.5">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={onNavigate}
                className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-all duration-150 ${
                  isActive
                    ? "border border-primary/20 bg-primary/10 text-primary font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                    : "border border-transparent text-muted-foreground hover:border-border hover:bg-[rgba(255,255,255,0.03)] hover:text-foreground"
                }`}
              >
                <div className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                  isActive ? "bg-primary/10" : "bg-secondary/50"
                }`}>
                  <item.icon className={`h-[17px] w-[17px] ${isActive ? "" : "opacity-70 group-hover:opacity-100"}`} />
                </div>
                <span className="flex-1">{item.name}</span>
                {item.badge && pendingCount > 0 && <span className="badge badge-warning">{pendingCount}</span>}
                {isActive && <ChevronRight className="h-3.5 w-3.5 opacity-40" />}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="shrink-0 border-t border-border p-3 space-y-3">
        <div className="flex items-center justify-between px-1 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-success pulse-dot" />
            <span>Solana Devnet</span>
          </div>
          <span>{pendingCount > 0 ? `${pendingCount} waiting` : "All clear"}</span>
        </div>
        <WalletPanel onAction={onNavigate} />
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
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex h-full min-h-0 w-[min(320px,88vw)] flex-col overflow-hidden bg-card/95 border-r border-border backdrop-blur-xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-secondary flex items-center justify-center z-10"
            >
              <X className="w-4 h-4" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:min-h-0 lg:w-[280px] lg:flex-col overflow-hidden border-r border-border bg-card/55 backdrop-blur-xl">
        <SidebarContent />
      </aside>
    </>
  );
}
