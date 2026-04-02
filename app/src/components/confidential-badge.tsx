"use client";

import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { USDC_MINT } from "@/lib/company-context";
import { Shield, Lock, CheckCircle2 } from "lucide-react";

export function ConfidentialBadge() {
  const { connection } = useConnection();
  const [hasConfidential, setHasConfidential] = useState<boolean | null>(null);

  useEffect(() => {
    async function check() {
      try {
        const info = await connection.getAccountInfo(USDC_MINT);
        if (!info) { setHasConfidential(false); return; }
        // Token-2022 accounts with extensions are larger than base mint (82 bytes)
        // Confidential transfer extension adds significant extra data
        setHasConfidential(info.data.length > 200);
      } catch {
        setHasConfidential(false);
      }
    }
    check();
  }, [connection]);

  if (hasConfidential === null) return null;

  return (
    <div className={`flex items-center gap-2 text-[11px] ${
      hasConfidential ? "text-primary" : "text-muted-foreground"
    }`}>
      {hasConfidential ? (
        <>
          <Lock className="w-3 h-3" />
          <span>Confidential Transfers enabled</span>
          <CheckCircle2 className="w-3 h-3 text-success" />
        </>
      ) : (
        <>
          <Shield className="w-3 h-3" />
          <span>Standard transfers</span>
        </>
      )}
    </div>
  );
}
