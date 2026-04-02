"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  CheckCircle2,
  Users,
  Shield,
  Eye,
  Wallet,
  ArrowUpDown,
} from "lucide-react";
import dynamic from "next/dynamic";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton),
  { ssr: false }
);

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Invoices", href: "/invoices", icon: FileText },
  { name: "Approvals", href: "/approvals", icon: CheckCircle2 },
  { name: "Payments", href: "/payments", icon: ArrowUpDown },
  { name: "Team", href: "/team", icon: Users },
  { name: "Policies", href: "/policies", icon: Shield },
  { name: "Proofs", href: "/proofs", icon: Eye },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 border-r border-border bg-card">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
          <Wallet className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h1 className="font-semibold text-sm tracking-tight">Black Budget</h1>
          <p className="text-xs text-muted-foreground">Private Finance OS</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.name}
              {item.name === "Approvals" && (
                <span className="ml-auto badge-warning text-xs px-1.5 py-0.5 rounded-full font-medium">
                  3
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Wallet */}
      <div className="p-4 border-t border-border">
        <WalletMultiButton
          style={{
            width: "100%",
            height: "40px",
            borderRadius: "8px",
            fontSize: "13px",
            backgroundColor: "var(--primary)",
            color: "var(--primary-foreground)",
            justifyContent: "center",
          }}
        />
      </div>
    </aside>
  );
}
