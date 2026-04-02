"use client";

import { useState } from "react";
import { Users, Plus, Shield, Eye, Pencil, Trash2, Copy, CheckCircle2 } from "lucide-react";

interface TeamMember {
  wallet: string;
  label: string;
  role: "Owner" | "Approver" | "Viewer" | "Contractor";
  addedAt: string;
  isActive: boolean;
}

const initialMembers: TeamMember[] = [
  { wallet: "7Ke4...x9Fm", label: "Founder", role: "Owner", addedAt: "2026-03-01", isActive: true },
  { wallet: "3Bf2...mN8k", label: "CFO", role: "Approver", addedAt: "2026-03-05", isActive: true },
  { wallet: "9Ld7...pQ2w", label: "CTO", role: "Approver", addedAt: "2026-03-05", isActive: true },
  { wallet: "5Hg1...vR6j", label: "Lead Dev", role: "Approver", addedAt: "2026-03-10", isActive: true },
  { wallet: "2Ac8...tY4s", label: "Designer", role: "Contractor", addedAt: "2026-03-12", isActive: true },
  { wallet: "8Wm3...bK7n", label: "Investor Rep", role: "Viewer", addedAt: "2026-03-15", isActive: true },
  { wallet: "4Zx6...hJ1d", label: "Auditor", role: "Viewer", addedAt: "2026-03-20", isActive: true },
  { wallet: "6Np9...cE5a", label: "Backend Dev", role: "Contractor", addedAt: "2026-03-22", isActive: true },
];

const roleColors: Record<string, string> = {
  Owner: "badge-danger",
  Approver: "badge-warning",
  Viewer: "badge-info",
  Contractor: "badge-success",
};

const roleIcons: Record<string, typeof Shield> = {
  Owner: Shield,
  Approver: CheckCircle2,
  Viewer: Eye,
  Contractor: Pencil,
};

export default function TeamPage() {
  const [members] = useState(initialMembers);
  const [showInvite, setShowInvite] = useState(false);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {members.filter((m) => m.isActive).length} active members across {new Set(members.map((m) => m.role)).size} roles
          </p>
        </div>
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> Add Member
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="glass rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-medium">Invite New Member</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Wallet address (e.g., 7Ke4...)"
              className="bg-secondary rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="text"
              placeholder="Label (e.g., CFO)"
              className="bg-secondary rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <select className="bg-secondary rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary">
              <option>Approver</option>
              <option>Viewer</option>
              <option>Contractor</option>
            </select>
          </div>
          <button className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
            Send Invite (on-chain TX)
          </button>
        </div>
      )}

      {/* Role Legend */}
      <div className="flex items-center gap-4 text-xs">
        {Object.entries(roleColors).map(([role, color]) => (
          <span key={role} className={`${color} px-2 py-1 rounded flex items-center gap-1`}>
            {role}
          </span>
        ))}
      </div>

      {/* Members List */}
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
              <th className="px-5 py-3">Member</th>
              <th className="px-5 py-3">Wallet</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Added</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member, i) => {
              const RoleIcon = roleIcons[member.role] || Users;
              return (
                <tr key={i} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                        <RoleIcon className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <span className="font-medium text-sm">{member.label}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="font-mono text-xs text-muted-foreground">{member.wallet}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`${roleColors[member.role]} text-xs px-2 py-1 rounded`}>
                      {member.role}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-muted-foreground">{member.addedAt}</td>
                  <td className="px-5 py-4 text-right">
                    {member.role !== "Owner" && (
                      <button className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
