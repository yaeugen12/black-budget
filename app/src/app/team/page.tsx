"use client";

import { useState } from "react";
import { useCompany } from "@/lib/company-context";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  Users,
  Plus,
  Shield,
  Eye,
  Pencil,
  CheckCircle2,
  Loader2,
  KeyRound,
} from "lucide-react";

const roleMeta = [
  {
    name: "Owner",
    color: "badge-danger",
    icon: Shield,
    description: "Can manage members and publish treasury policy changes.",
  },
  {
    name: "Approver",
    color: "badge-warning",
    icon: CheckCircle2,
    description: "Can review and sign payment requests inside the approval queue.",
  },
  {
    name: "Viewer",
    color: "badge-info",
    icon: Eye,
    description: "Can inspect treasury state without touching execution controls.",
  },
  {
    name: "Contractor",
    color: "badge-success",
    icon: Pencil,
    description: "Useful for scoped access and controlled workflow participation.",
  },
];

function truncatePubkey(key: string) {
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
      setFeedback({ type: "success", msg: `${newLabel} was added on-chain.` });
      setNewWallet("");
      setNewLabel("");
      setNewRole("approver");
      await refresh();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to add member";
      setFeedback({ type: "error", msg: message.slice(0, 120) });
    } finally {
      setSubmitting(false);
    }
  };

  const memberCount = company?.memberCount || 0;
  const ownerWallet = wallet.publicKey?.toBase58() || "";
  const ownerPubkey = ownerWallet ? truncatePubkey(ownerWallet) : "---";

  if (loading) {
    return (
      <div className="mx-auto flex max-w-4xl items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="page-shell mx-auto max-w-4xl animate-in">
        <div className="card p-12 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-secondary">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">No company initialized yet</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            Create a company first, then you can manage member roles and treasury permissions here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell mx-auto max-w-6xl space-y-6 animate-in">
      <section className="hero-surface px-6 py-7 lg:px-8 lg:py-8">
        <div className="relative z-10 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <div className="eyebrow">
              <Users className="h-3.5 w-3.5" />
              Team registry
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight lg:text-4xl">
              Role-based treasury access, presented like a control system instead of a loose form.
            </h1>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-muted-foreground">
              The team screen now makes the permission model easier to understand. It shows who controls the company,
              what roles exist, and how new wallets enter the treasury workflow.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              <div className="metric-tile">
                <p className="text-label mb-2">Members On-Chain</p>
                <div className="stat-value">{memberCount}</div>
                <p className="mt-2 text-[12px] text-muted-foreground">Tracked inside the company account.</p>
              </div>
              <div className="metric-tile">
                <p className="text-label mb-2">Role Types</p>
                <div className="stat-value">{roleMeta.length}</div>
                <p className="mt-2 text-[12px] text-muted-foreground">Owner, approver, viewer, contractor.</p>
              </div>
              <div className="metric-tile">
                <p className="text-label mb-2">Authority Wallet</p>
                <div className="stat-value text-[1.25rem]">{ownerPubkey}</div>
                <p className="mt-2 text-[12px] text-muted-foreground">Current connected owner context.</p>
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-label mb-1">Member Actions</p>
                <h2 className="section-title">Invite a wallet into the treasury graph</h2>
              </div>
              <button
                onClick={() => {
                  setShowInvite(!showInvite);
                  setFeedback(null);
                }}
                className="btn-primary px-4 py-2 text-[13px]"
              >
                <Plus className="h-4 w-4" />
                {showInvite ? "Hide Form" : "Add Member"}
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-border bg-secondary/45 px-4 py-4">
              <p className="text-[13px] font-medium">How this works</p>
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                Adding a member writes a new role assignment on-chain. That keeps approvals, permissions, and future treasury actions tied to the same source of truth.
              </p>
            </div>

            <div className="mt-4 rounded-2xl border border-border bg-secondary/45 px-4 py-4">
              <p className="text-[13px] font-medium">Current owner wallet</p>
              <p className="mt-2 font-mono text-[12px] text-muted-foreground break-all">{ownerWallet}</p>
            </div>
          </div>
        </div>
      </section>

      {showInvite && (
        <div className="card p-6 animate-in">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
              <KeyRound className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-label mb-1">Invite Member</p>
              <h3 className="section-title">Create an on-chain role assignment</h3>
            </div>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-[13px] font-medium">Wallet address</label>
              <input
                type="text"
                placeholder="Full Solana pubkey"
                value={newWallet}
                onChange={(e) => setNewWallet(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-medium">Member label</label>
              <input
                type="text"
                placeholder="e.g. CFO, Ops Lead"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="mb-2 block text-[13px] font-medium">Role</label>
              <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="input">
                <option value="approver">Approver</option>
                <option value="viewer">Viewer</option>
                <option value="contractor">Contractor</option>
              </select>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={handleAddMember}
              disabled={submitting || !newWallet || !newLabel}
              className="btn-primary"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Submitting transaction...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add Member On-Chain
                </>
              )}
            </button>
            <button onClick={() => setShowInvite(false)} className="btn-secondary">
              Cancel
            </button>
          </div>

          {feedback && (
            <div
              className={`mt-5 rounded-2xl px-4 py-3 text-[13px] ${
                feedback.type === "success"
                  ? "border border-success/20 bg-success/10 text-emerald-300"
                  : "border border-destructive/20 bg-destructive/10 text-destructive"
              }`}
            >
              {feedback.msg}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {roleMeta.map(({ name, color, icon: Icon, description }) => (
          <div key={name} className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <span className={`badge ${color}`}>{name}</span>
            </div>
            <p className="mt-4 section-title">{name}</p>
            <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{description}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="card p-6">
          <p className="text-label mb-3">Registry Snapshot</p>
          <div className="rounded-2xl border border-border bg-secondary/40 px-4 py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-secondary">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-[13px] font-medium">You (Owner)</p>
                  <p className="mt-1 font-mono text-[12px] text-muted-foreground">{ownerPubkey}</p>
                </div>
              </div>
              <span className="badge badge-danger">Owner</span>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-secondary/40 px-4 py-4">
            <p className="text-[13px] font-medium">Additional members</p>
            <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
              {memberCount > 1
                ? `${memberCount - 1} more member${memberCount - 1 !== 1 ? "s are" : " is"} anchored on-chain in the company account.`
                : "No other members have been added yet."}
            </p>
          </div>
        </div>

        <div className="card-highlight p-6">
          <p className="text-label mb-3">Why This Matters</p>
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-secondary/35 px-4 py-3">
              <p className="text-[13px] font-medium">Shared control</p>
              <p className="mt-1 text-[12px] leading-6 text-muted-foreground">
                Treasury actions feel more credible when authority is distributed across named roles instead of one omnipotent wallet.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/35 px-4 py-3">
              <p className="text-[13px] font-medium">Approval story</p>
              <p className="mt-1 text-[12px] leading-6 text-muted-foreground">
                The approvals page becomes easier to believe once the role model is explained cleanly here first.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary/35 px-4 py-3">
              <p className="text-[13px] font-medium">On-chain governance</p>
              <p className="mt-1 text-[12px] leading-6 text-muted-foreground">
                Member additions are transactions, not just form submissions, which helps the whole product feel serious.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
