// @ts-nocheck
"use client";

import { useState } from "react";
import { useCompany } from "@/lib/company-context";
import { useWallet } from "@solana/wallet-adapter-react";
import { Users, Plus, Shield, Eye, Pencil, CheckCircle2, Loader2 } from "lucide-react";

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

function truncatePubkey(key: string): string {
  if (key.length <= 10) return key;
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export default function TeamPage() {
  const { company, addMember, loading, refresh } = useCompany();
  const wallet = useWallet();

  const [showInvite, setShowInvite] = useState(false);
  const [newWallet, setNewWallet] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newRole, setNewRole] = useState("approver");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const handleAddMember = async () => {
    if (!newWallet || !newLabel) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      await addMember(newWallet, newRole, newLabel);
      setFeedback({ type: "success", msg: `${newLabel} added successfully` });
      setNewWallet("");
      setNewLabel("");
      setNewRole("approver");
      await refresh();
    } catch (e: any) {
      setFeedback({ type: "error", msg: e.message?.slice(0, 100) || "Failed to add member" });
    } finally {
      setSubmitting(false);
    }
  };

  const memberCount = company?.memberCount || 0;
  const ownerPubkey = wallet.publicKey ? truncatePubkey(wallet.publicKey.toBase58()) : "---";

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {memberCount} member{memberCount !== 1 ? "s" : ""} on-chain
          </p>
        </div>
        <button
          onClick={() => { setShowInvite(!showInvite); setFeedback(null); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
        >
          <Plus className="w-4 h-4" /> Add Member
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="glass rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-medium">Add New Member (on-chain)</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              placeholder="Wallet address (full pubkey)"
              value={newWallet}
              onChange={(e) => setNewWallet(e.target.value)}
              className="bg-secondary rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="text"
              placeholder="Label (e.g., CFO)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="bg-secondary rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="bg-secondary rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="approver">Approver</option>
              <option value="viewer">Viewer</option>
              <option value="contractor">Contractor</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleAddMember}
              disabled={submitting || !newWallet || !newLabel}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {submitting ? "Submitting TX..." : "Add Member (on-chain TX)"}
            </button>
          </div>
          {feedback && (
            <p className={`text-sm ${feedback.type === "success" ? "text-[var(--success)]" : "text-destructive"}`}>
              {feedback.msg}
            </p>
          )}
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

      {/* Current Wallet (Owner) */}
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase">
              <th className="px-5 py-3">Member</th>
              <th className="px-5 py-3">Wallet</th>
              <th className="px-5 py-3">Role</th>
            </tr>
          </thead>
          <tbody>
            {wallet.publicKey && (
              <tr className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                      <Shield className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <span className="font-medium text-sm">You (Owner)</span>
                  </div>
                </td>
                <td className="px-5 py-4">
                  <span className="font-mono text-xs text-muted-foreground">{ownerPubkey}</span>
                </td>
                <td className="px-5 py-4">
                  <span className="badge-danger text-xs px-2 py-1 rounded">Owner</span>
                </td>
              </tr>
            )}
            {memberCount > 1 && (
              <tr>
                <td colSpan={3} className="px-5 py-4 text-center text-sm text-muted-foreground">
                  + {memberCount - 1} other member{memberCount - 1 !== 1 ? "s" : ""} on-chain
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!company && (
        <div className="glass rounded-xl p-10 text-center">
          <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No company initialized</p>
          <p className="text-xs text-muted-foreground mt-1">Create a company first to manage team members</p>
        </div>
      )}
    </div>
  );
}
