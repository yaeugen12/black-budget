"use client";

import { useState } from "react";
import { useCompany } from "@/lib/company-context";
import {
  Users, DollarSign, Play, Loader2, CheckCircle2, AlertTriangle,
  Plus, Trash2, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

interface PayrollEntry {
  id: string;
  label: string;
  wallet: string;
  amount: number;
}

const defaultPayroll: PayrollEntry[] = [
  { id: "1", label: "Lead Developer", wallet: "", amount: 8500 },
  { id: "2", label: "Designer", wallet: "", amount: 5200 },
  { id: "3", label: "Backend Engineer", wallet: "", amount: 7800 },
  { id: "4", label: "Marketing Lead", wallet: "", amount: 4500 },
];

export default function PayrollPage() {
  const { company, createPayment, vaultBalance } = useCompany();
  const [entries, setEntries] = useState<PayrollEntry[]>(defaultPayroll);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<{ id: string; status: "success" | "error"; tx?: string; error?: string }[]>([]);
  const [done, setDone] = useState(false);

  const total = entries.reduce((s, e) => s + e.amount, 0);
  const hasEmptyWallets = entries.some((e) => !e.wallet.trim());

  const addEntry = () => {
    setEntries([...entries, { id: Date.now().toString(), label: "", wallet: "", amount: 0 }]);
  };

  const removeEntry = (id: string) => {
    setEntries(entries.filter((e) => e.id !== id));
  };

  const updateEntry = (id: string, field: keyof PayrollEntry, value: string | number) => {
    setEntries(entries.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const runPayroll = async () => {
    if (hasEmptyWallets) {
      toast.error("All wallet addresses are required");
      return;
    }
    if (total > vaultBalance) {
      toast.error(`Insufficient funds. Need $${total.toLocaleString()}, vault has $${vaultBalance.toLocaleString()}`);
      return;
    }

    setRunning(true);
    setResults([]);
    const newResults: typeof results = [];

    for (const entry of entries) {
      try {
        const tx = await createPayment(
          entry.wallet,
          entry.amount,
          "payroll",
          `Payroll: ${entry.label}`
        );
        newResults.push({ id: entry.id, status: "success", tx });
      } catch (e: any) {
        newResults.push({ id: entry.id, status: "error", error: e.message?.slice(0, 80) });
      }
      setResults([...newResults]);
    }

    setRunning(false);
    setDone(true);

    const successCount = newResults.filter((r) => r.status === "success").length;
    if (successCount === entries.length) {
      toast.success(`Payroll complete: ${successCount} payments processed`);
    } else {
      toast.warning(`Payroll: ${successCount}/${entries.length} succeeded`);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-heading">Run Payroll</h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Batch payments to your team — each creates an on-chain payment request
          </p>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-muted-foreground">Vault Balance</div>
          <div className="text-[15px] font-mono font-semibold">${vaultBalance.toLocaleString()}</div>
        </div>
      </div>

      {/* Payroll Table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-[13px] font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Payroll Batch — {entries.length} recipients
          </h3>
          <button onClick={addEntry} className="btn-ghost text-[12px] py-1 px-2">
            <Plus className="w-3.5 h-3.5" /> Add
          </button>
        </div>

        <div className="divide-y divide-border">
          {entries.map((entry, i) => {
            const result = results.find((r) => r.id === entry.id);
            return (
              <div key={entry.id} className={`px-5 py-3 flex items-center gap-3 ${
                result?.status === "success" ? "bg-success/5" : result?.status === "error" ? "bg-destructive/5" : ""
              }`}>
                <span className="text-[12px] text-muted-foreground w-6">{i + 1}.</span>

                <input
                  type="text"
                  value={entry.label}
                  onChange={(e) => updateEntry(entry.id, "label", e.target.value)}
                  placeholder="Role/Name"
                  disabled={running || done}
                  className="input py-2 text-[13px] w-[160px]"
                />

                <input
                  type="text"
                  value={entry.wallet}
                  onChange={(e) => updateEntry(entry.id, "wallet", e.target.value)}
                  placeholder="Wallet address (base58)"
                  disabled={running || done}
                  className="input py-2 text-[13px] flex-1 font-mono text-[12px]"
                />

                <div className="relative w-[120px]">
                  <DollarSign className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="number"
                    value={entry.amount || ""}
                    onChange={(e) => updateEntry(entry.id, "amount", parseFloat(e.target.value) || 0)}
                    placeholder="0"
                    disabled={running || done}
                    className="input py-2 text-[13px] pl-8 font-mono text-right"
                  />
                </div>

                {/* Status indicator */}
                {result ? (
                  result.status === "success" ? (
                    <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
                  )
                ) : running ? (
                  <Loader2 className="w-5 h-5 text-muted-foreground animate-spin shrink-0" />
                ) : (
                  <button
                    onClick={() => removeEntry(entry.id)}
                    className="text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="px-5 py-4 border-t border-border bg-[rgba(255,255,255,0.01)] flex items-center justify-between">
          <div className="flex items-center gap-4 text-[13px]">
            <span className="text-muted-foreground">{entries.length} recipients</span>
            <span className={`font-mono font-semibold ${total > vaultBalance ? "text-destructive" : ""}`}>
              Total: ${total.toLocaleString()} USDC
            </span>
            {total > vaultBalance && (
              <span className="badge badge-danger">Exceeds vault balance</span>
            )}
          </div>

          {!done ? (
            <button
              onClick={runPayroll}
              disabled={running || entries.length === 0 || hasEmptyWallets || total > vaultBalance}
              className="btn-primary text-[13px] py-2 px-5"
            >
              {running ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processing {results.length}/{entries.length}...</>
              ) : (
                <><Play className="w-4 h-4" /> Run Payroll</>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="badge badge-success">
                {results.filter((r) => r.status === "success").length}/{entries.length} completed
              </span>
              <button
                onClick={() => { setDone(false); setResults([]); setEntries(defaultPayroll); }}
                className="btn-secondary text-[13px] py-2 px-4"
              >
                New Batch
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="card p-5 space-y-2 animate-in">
          <h3 className="text-[13px] font-semibold mb-3">Transaction Log</h3>
          {results.map((r, i) => {
            const entry = entries.find((e) => e.id === r.id);
            return (
              <div key={r.id} className="flex items-center justify-between text-[12px] py-1.5">
                <div className="flex items-center gap-2">
                  {r.status === "success" ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                  )}
                  <span>{entry?.label || `Payment ${i + 1}`}</span>
                  <span className="font-mono text-muted-foreground">${entry?.amount.toLocaleString()}</span>
                </div>
                {r.tx ? (
                  <a
                    href={`https://explorer.solana.com/tx/${r.tx}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-mono flex items-center gap-1"
                  >
                    {r.tx.slice(0, 16)}... <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <span className="text-destructive">{r.error?.slice(0, 40)}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
