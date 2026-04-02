// @ts-nocheck
"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { IDL, PROGRAM_ID } from "./idl";

const programId = new PublicKey(PROGRAM_ID);

// ─── PDA helpers ────────────────────────────────────────────────────

function getCompanyPDA(authority: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("company"), authority.toBuffer()],
    programId
  );
  return pda;
}

function getMemberPDA(company: PublicKey, wallet: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("member"), company.toBuffer(), wallet.toBuffer()],
    programId
  );
  return pda;
}

function getVaultPDA(company: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), company.toBuffer()],
    programId
  );
  return pda;
}

function getPaymentPDA(company: PublicKey, nonce: number): PublicKey {
  const nonceBuffer = Buffer.alloc(8);
  nonceBuffer.writeBigUInt64LE(BigInt(nonce));
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("payment"), company.toBuffer(), nonceBuffer],
    programId
  );
  return pda;
}

// ─── Types ──────────────────────────────────────────────────────────

interface CompanyData {
  authority: PublicKey;
  name: string;
  vault: PublicKey;
  policy: {
    autoApproveLimit: BN;
    dualApproveThreshold: BN;
    monthlyBurnCap: BN;
    requireVendorVerification: boolean;
    restrictToKnownRecipients: boolean;
    minRunwayMonths: number;
  };
  memberCount: number;
  paymentNonce: BN;
  totalSpent: BN;
  monthlySpent: BN;
  createdAt: BN;
}

interface MemberData {
  company: PublicKey;
  wallet: PublicKey;
  role: { owner?: {} } | { approver?: {} } | { viewer?: {} } | { contractor?: {} };
  label: string;
  addedAt: BN;
  isActive: boolean;
}

interface PaymentData {
  publicKey: PublicKey;
  account: {
    company: PublicKey;
    requester: PublicKey;
    recipient: PublicKey;
    amount: BN;
    category: any;
    memo: string;
    status: any;
    approvals: PublicKey[];
    requiredApprovals: number;
    paymentId: BN;
    riskScore: number;
    createdAt: BN;
    executedAt: BN;
  };
}

interface CompanyContextType {
  // State
  loading: boolean;
  company: CompanyData | null;
  companyPDA: PublicKey | null;
  payments: PaymentData[];
  error: string | null;

  // Actions
  initializeCompany: (name: string) => Promise<string>;
  addMember: (wallet: string, role: string, label: string) => Promise<string>;
  setPolicies: (policy: any) => Promise<string>;
  createPayment: (recipient: string, amount: number, category: string, memo: string) => Promise<string>;
  approvePayment: (paymentId: number) => Promise<string>;
  rejectPayment: (paymentId: number) => Promise<string>;
  refresh: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | null>(null);

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used within CompanyProvider");
  return ctx;
}

// ─── Provider ───────────────────────────────────────────────────────

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { connection } = useConnection();
  const wallet = useWallet();

  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setMounted(true); }, []);
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [companyPDA, setCompanyPDA] = useState<PublicKey | null>(null);
  const [payments, setPayments] = useState<PaymentData[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Build program
  const getProgram = useCallback(() => {
    if (!mounted || !wallet.publicKey || !wallet.signTransaction) return null;
    try {
      const provider = new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
      return new Program(IDL as any, provider);
    } catch (e) {
      console.error("Failed to create Program:", e);
      return null;
    }
  }, [mounted, connection, wallet]);

  // ─── Fetch company data ───────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!mounted || !wallet.publicKey) {
      setCompany(null);
      setCompanyPDA(null);
      setPayments([]);
      setLoading(false);
      return;
    }

    const program = getProgram();
    if (!program) { setLoading(false); return; }

    try {
      const pda = getCompanyPDA(wallet.publicKey);
      setCompanyPDA(pda);

      const data = await program.account.company.fetch(pda);
      setCompany(data as CompanyData);

      // Fetch payments
      const allPayments = await program.account.paymentRequest.all([
        { memcmp: { offset: 8, bytes: pda.toBase58() } },
      ]);
      setPayments(allPayments as PaymentData[]);
      setError(null);
    } catch (e: any) {
      if (e.message?.includes("Account does not exist")) {
        setCompany(null);
        setPayments([]);
      } else {
        console.log("Fetch error (company may not exist yet):", e.message);
        setCompany(null);
        setPayments([]);
      }
    } finally {
      setLoading(false);
    }
  }, [wallet.publicKey, getProgram]);

  useEffect(() => {
    if (mounted) refresh();
  }, [mounted, refresh]);

  // ─── Initialize Company ───────────────────────────────────────

  const initializeCompany = useCallback(async (name: string) => {
    const program = getProgram();
    if (!program || !wallet.publicKey) throw new Error("Wallet not connected");

    const compPDA = getCompanyPDA(wallet.publicKey);
    const vaultPDA = getVaultPDA(compPDA);
    const memberPDA = getMemberPDA(compPDA, wallet.publicKey);

    // Use a devnet USDC-like mint or create one
    // For hackathon demo: we'll use a dummy mint we create
    // In production: real USDC Token-2022 mint
    const tx = await program.methods
      .initializeCompany(name)
      .accounts({
        authority: wallet.publicKey,
        company: compPDA,
        vault: vaultPDA,
        usdcMint: new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"), // Devnet USDC (Token-2022)
        founderMember: memberPDA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: new PublicKey("11111111111111111111111111111111"),
      })
      .rpc();

    await refresh();
    return tx;
  }, [getProgram, wallet.publicKey, refresh]);

  // ─── Add Member ───────────────────────────────────────────────

  const addMember = useCallback(async (walletAddr: string, role: string, label: string) => {
    const program = getProgram();
    if (!program || !wallet.publicKey) throw new Error("Wallet not connected");

    const compPDA = getCompanyPDA(wallet.publicKey);
    const authorityMemberPDA = getMemberPDA(compPDA, wallet.publicKey);
    const newWallet = new PublicKey(walletAddr);
    const newMemberPDA = getMemberPDA(compPDA, newWallet);

    const roleObj = role === "owner" ? { owner: {} }
      : role === "approver" ? { approver: {} }
      : role === "viewer" ? { viewer: {} }
      : { contractor: {} };

    const tx = await program.methods
      .addMember(roleObj, label)
      .accounts({
        authority: wallet.publicKey,
        company: compPDA,
        authorityMember: authorityMemberPDA,
        newMemberWallet: newWallet,
        member: newMemberPDA,
        systemProgram: new PublicKey("11111111111111111111111111111111"),
      })
      .rpc();

    await refresh();
    return tx;
  }, [getProgram, wallet.publicKey, refresh]);

  // ─── Set Policies ─────────────────────────────────────────────

  const setPolicies = useCallback(async (policy: any) => {
    const program = getProgram();
    if (!program || !wallet.publicKey) throw new Error("Wallet not connected");

    const compPDA = getCompanyPDA(wallet.publicKey);
    const memberPDA = getMemberPDA(compPDA, wallet.publicKey);

    const tx = await program.methods
      .setPolicies({
        autoApproveLimit: new BN(policy.autoApproveLimit * 1_000_000),
        dualApproveThreshold: new BN(policy.dualApproveThreshold * 1_000_000),
        monthlyBurnCap: new BN(policy.monthlyBurnCap * 1_000_000),
        requireVendorVerification: policy.requireVendorVerification,
        restrictToKnownRecipients: policy.restrictToKnownRecipients,
        minRunwayMonths: policy.minRunwayMonths,
      })
      .accounts({
        authority: wallet.publicKey,
        company: compPDA,
        authorityMember: memberPDA,
      })
      .rpc();

    await refresh();
    return tx;
  }, [getProgram, wallet.publicKey, refresh]);

  // ─── Create Payment ───────────────────────────────────────────

  const createPayment = useCallback(async (
    recipient: string,
    amount: number,
    category: string,
    memo: string
  ) => {
    const program = getProgram();
    if (!program || !wallet.publicKey || !company) throw new Error("Not ready");

    const compPDA = getCompanyPDA(wallet.publicKey);
    const requesterMemberPDA = getMemberPDA(compPDA, wallet.publicKey);
    const recipientKey = new PublicKey(recipient);
    const nonce = company.paymentNonce.toNumber();
    const paymentPDA = getPaymentPDA(compPDA, nonce);

    const categoryObj = category === "payroll" ? { payroll: {} }
      : category === "vendor" ? { vendor: {} }
      : category === "subscription" ? { subscription: {} }
      : category === "contractor" ? { contractor: {} }
      : { other: {} };

    // Hash memo as description
    const encoder = new TextEncoder();
    const data = encoder.encode(memo);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const descriptionHash = Array.from(new Uint8Array(hashBuffer));

    const tx = await program.methods
      .createPayment(
        new BN(amount * 1_000_000),
        categoryObj,
        descriptionHash,
        memo.slice(0, 128),
        0 // risk score
      )
      .accounts({
        requester: wallet.publicKey,
        company: compPDA,
        requesterMember: requesterMemberPDA,
        recipient: recipientKey,
        payment: paymentPDA,
        systemProgram: new PublicKey("11111111111111111111111111111111"),
      })
      .rpc();

    await refresh();
    return tx;
  }, [getProgram, wallet.publicKey, company, refresh]);

  // ─── Approve Payment ──────────────────────────────────────────

  const approvePayment = useCallback(async (paymentId: number) => {
    const program = getProgram();
    if (!program || !wallet.publicKey || !company) throw new Error("Not ready");

    const compPDA = getCompanyPDA(company.authority);
    const approverMemberPDA = getMemberPDA(compPDA, wallet.publicKey);
    const paymentPDA = getPaymentPDA(compPDA, paymentId);

    const tx = await program.methods
      .approvePayment()
      .accounts({
        approver: wallet.publicKey,
        company: compPDA,
        approverMember: approverMemberPDA,
        payment: paymentPDA,
      })
      .rpc();

    await refresh();
    return tx;
  }, [getProgram, wallet.publicKey, company, refresh]);

  // ─── Reject Payment ───────────────────────────────────────────

  const rejectPayment = useCallback(async (paymentId: number) => {
    const program = getProgram();
    if (!program || !wallet.publicKey || !company) throw new Error("Not ready");

    const compPDA = getCompanyPDA(company.authority);
    const rejectorMemberPDA = getMemberPDA(compPDA, wallet.publicKey);
    const paymentPDA = getPaymentPDA(compPDA, paymentId);

    const tx = await program.methods
      .rejectPayment()
      .accounts({
        rejector: wallet.publicKey,
        company: compPDA,
        rejectorMember: rejectorMemberPDA,
        payment: paymentPDA,
      })
      .rpc();

    await refresh();
    return tx;
  }, [getProgram, wallet.publicKey, company, refresh]);

  return (
    <CompanyContext.Provider
      value={{
        loading,
        company,
        companyPDA,
        payments,
        error,
        initializeCompany,
        addMember,
        setPolicies,
        createPayment,
        approvePayment,
        rejectPayment,
        refresh,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}
