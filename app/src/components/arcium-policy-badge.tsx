"use client";

/**
 * Compact UI badge showing whether the Arcium-based confidential policy
 * evaluation is active.
 *
 * Reads the runtime feature flag exposed by `useConfidentialPolicy()`.
 * When the flag is on AND a wallet is connected, surfaces the deployed
 * program ID. When off, surfaces a hint to flip the flag after deploy.
 *
 * This is independent of `<ConfidentialBadge />` which reflects the
 * Token-2022 Confidential Transfer extension on the USDC mint.
 */

import { useConfidentialPolicy } from "@/lib/arcium";
import { Cpu, Sparkles } from "lucide-react";

export function ArciumPolicyBadge() {
  const { enabled, programId } = useConfidentialPolicy();

  if (!enabled) {
    return (
      <div
        className="flex items-center gap-2 text-[11px] text-muted-foreground"
        title="Set NEXT_PUBLIC_ENABLE_CONFIDENTIAL=true after deploying arcium-integration/programs/confidential_policy to your target cluster."
      >
        <Cpu className="w-3 h-3 opacity-50" />
        <span>Arcium MPC policy: off</span>
      </div>
    );
  }

  const idShort = `${programId.toBase58().slice(0, 4)}…${programId.toBase58().slice(-4)}`;

  return (
    <div
      className="flex items-center gap-2 text-[11px] text-primary"
      title={`Confidential policy program: ${programId.toBase58()}`}
    >
      <Cpu className="w-3 h-3" />
      <span>Arcium MPC policy</span>
      <span className="font-mono text-[10px] opacity-70">{idShort}</span>
      <Sparkles className="w-3 h-3 text-success" />
    </div>
  );
}
