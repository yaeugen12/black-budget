// @ts-nocheck
"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
} from "@solana/spl-token";
import { toast } from "sonner";
import { IDL, PROGRAM_ID } from "./idl";

const programId = new PublicKey(PROGRAM_ID);
export const USDC_MINT = new PublicKey("Ac6Q53KEURMNhngkR1yvhrsxd6vhU1pNR31TMykjVFp");
const SYSTEM = new PublicKey("11111111111111111111111111111111");

// ─── PDA helpers (exported for reuse) ───────────────────────────────

export function getCompanyPDA(authority: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("company"), authority.toBuffer()], programId
  );
  return pda;
}

export function getMemberPDA(company: PublicKey, wallet: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("member"), company.toBuffer(), wallet.toBuffer()], programId
  );
  return pda;
}

export function getVaultPDA(company: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), company.toBuffer()], programId
  );
  return pda;
}

export function getPaymentPDA(company: PublicKey, nonce: number): PublicKey {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(nonce));
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("payment"), company.toBuffer(), b], programId
  );
  return pda;
}

// ─── Types ──────────────────────────────────────────────────────────

interface CompanyContextType {
  loading: boolean;
  company: any | null;
  companyPDA: PublicKey | null;
  vaultBalance: number;       // Real USDC balance (human readable)
  payments: any[];
  error: string | null;

  initializeCompany: (name: string) => Promise<string>;
  addMember: (wallet: string, role: string, label: string) => Promise<string>;
  setPolicies: (policy: any) => Promise<string>;
  createPayment: (recipient: string, amount: number, category: string, memo: string) => Promise<string>;
  approvePayment: (paymentId: number) => Promise<string>;
  rejectPayment: (paymentId: number) => Promise<string>;
  depositToVault: (amount: number) => Promise<string>;
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
  const [company, setCompany] = useState<any | null>(null);
  const [companyPDA, setCompanyPDA] = useState<PublicKey | null>(null);
  const [vaultBalance, setVaultBalance] = useState<number>(0);
  const [payments, setPayments] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setMounted(true); }, []);

  const getProgram = useCallback(() => {
    if (!mounted || !wallet.publicKey || !wallet.signTransaction) return null;
    try {
      const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
      return new Program(IDL, provider);
    } catch (e) {
      console.error("Failed to create Program:", e);
      return null;
    }
  }, [mounted, connection, wallet]);

  // ─── Fetch all data ───────────────────────────────────────────

  const refresh = useCallback(async () => {
    if (!mounted || !wallet.publicKey) {
      setCompany(null); setCompanyPDA(null); setPayments([]); setVaultBalance(0); setLoading(false);
      return;
    }

    const program = getProgram();
    if (!program) { setLoading(false); return; }

    try {
      const pda = getCompanyPDA(wallet.publicKey);
      setCompanyPDA(pda);

      const data = await program.account.company.fetch(pda);
      setCompany(data);

      // Real vault balance
      const vault = getVaultPDA(pda);
      try {
        const vaultInfo = await connection.getTokenAccountBalance(vault);
        setVaultBalance(Number(vaultInfo.value.uiAmount || 0));
      } catch {
        setVaultBalance(0);
      }

      // Fetch payments
      const allPayments = await program.account.paymentRequest.all([
        { memcmp: { offset: 8, bytes: pda.toBase58() } },
      ]);
      setPayments(allPayments);
      setError(null);
    } catch (e: any) {
      setCompany(null); setPayments([]); setVaultBalance(0);
    } finally {
      setLoading(false);
    }
  }, [mounted, wallet.publicKey, getProgram, connection]);

  useEffect(() => { if (mounted) refresh(); }, [mounted, refresh]);

  // ─── TX wrapper with toasts ───────────────────────────────────

  async function withToast<T>(label: string, fn: () => Promise<T>): Promise<T> {
    const id = toast.loading(`${label}...`);
    try {
      const result = await fn();
      toast.success(`${label} successful`, { id, description: "Transaction confirmed on Solana" });
      return result;
    } catch (e: any) {
      const msg = e.message?.slice(0, 100) || "Transaction failed";
      toast.error(`${label} failed`, { id, description: msg });
      throw e;
    }
  }

  // ─── Initialize Company ───────────────────────────────────────

  const initializeCompany = useCallback(async (name: string) => {
    const program = getProgram();
    if (!program || !wallet.publicKey) throw new Error("Wallet not connected");

    return withToast("Create company", async () => {
      const compPDA = getCompanyPDA(wallet.publicKey);
      const vaultPDA = getVaultPDA(compPDA);
      const memberPDA = getMemberPDA(compPDA, wallet.publicKey);

      const tx = await program.methods.initializeCompany(name).accounts({
        authority: wallet.publicKey, company: compPDA, vault: vaultPDA,
        usdcMint: USDC_MINT, founderMember: memberPDA,
        tokenProgram: TOKEN_2022_PROGRAM_ID, systemProgram: SYSTEM,
      }).rpc();

      await refresh();
      return tx;
    });
  }, [getProgram, wallet.publicKey, refresh]);

  // ─── Add Member ───────────────────────────────────────────────

  const addMember = useCallback(async (walletAddr: string, role: string, label: string) => {
    const program = getProgram();
    if (!program || !wallet.publicKey) throw new Error("Wallet not connected");

    return withToast(`Add ${label}`, async () => {
      const compPDA = getCompanyPDA(wallet.publicKey);
      const newWallet = new PublicKey(walletAddr);

      const tx = await program.methods
        .addMember(
          role === "owner" ? { owner: {} } : role === "approver" ? { approver: {} }
            : role === "viewer" ? { viewer: {} } : { contractor: {} },
          label
        ).accounts({
          authority: wallet.publicKey, company: compPDA,
          authorityMember: getMemberPDA(compPDA, wallet.publicKey),
          newMemberWallet: newWallet, member: getMemberPDA(compPDA, newWallet),
          systemProgram: SYSTEM,
        }).rpc();

      await refresh();
      return tx;
    });
  }, [getProgram, wallet.publicKey, refresh]);

  // ─── Set Policies ─────────────────────────────────────────────

  const setPolicies = useCallback(async (policy: any) => {
    const program = getProgram();
    if (!program || !wallet.publicKey) throw new Error("Wallet not connected");

    return withToast("Save policies", async () => {
      const compPDA = getCompanyPDA(wallet.publicKey);

      const tx = await program.methods.setPolicies({
        autoApproveLimit: new BN(policy.autoApproveLimit * 1_000_000),
        dualApproveThreshold: new BN(policy.dualApproveThreshold * 1_000_000),
        monthlyBurnCap: new BN(policy.monthlyBurnCap * 1_000_000),
        requireVendorVerification: policy.requireVendorVerification,
        restrictToKnownRecipients: policy.restrictToKnownRecipients,
        minRunwayMonths: policy.minRunwayMonths,
      }).accounts({
        authority: wallet.publicKey, company: compPDA,
        authorityMember: getMemberPDA(compPDA, wallet.publicKey),
      }).rpc();

      await refresh();
      return tx;
    });
  }, [getProgram, wallet.publicKey, refresh]);

  // ─── Create Payment ───────────────────────────────────────────

  const createPayment = useCallback(async (recipient: string, amount: number, category: string, memo: string) => {
    const program = getProgram();
    if (!program || !wallet.publicKey || !company) throw new Error("Not ready");

    return withToast(`Payment $${amount.toLocaleString()}`, async () => {
      const compPDA = getCompanyPDA(wallet.publicKey);
      const nonce = company.paymentNonce.toNumber();
      const paymentPDA = getPaymentPDA(compPDA, nonce);
      const categoryObj = { payroll: {}, vendor: {}, subscription: {}, contractor: {}, other: {} };

      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(memo));
      const descriptionHash = Array.from(new Uint8Array(hashBuffer));

      const tx = await program.methods.createPayment(
        new BN(amount * 1_000_000),
        { [category]: {} } || { other: {} },
        descriptionHash, memo.slice(0, 128), 0
      ).accounts({
        requester: wallet.publicKey, company: compPDA,
        requesterMember: getMemberPDA(compPDA, wallet.publicKey),
        recipient: new PublicKey(recipient), payment: paymentPDA,
        systemProgram: SYSTEM,
      }).rpc();

      await refresh();
      return tx;
    });
  }, [getProgram, wallet.publicKey, company, refresh]);

  // ─── Approve Payment ──────────────────────────────────────────

  const approvePayment = useCallback(async (paymentId: number) => {
    const program = getProgram();
    if (!program || !wallet.publicKey || !company) throw new Error("Not ready");

    return withToast("Approve payment", async () => {
      const compPDA = getCompanyPDA(company.authority);
      const tx = await program.methods.approvePayment().accounts({
        approver: wallet.publicKey, company: compPDA,
        approverMember: getMemberPDA(compPDA, wallet.publicKey),
        payment: getPaymentPDA(compPDA, paymentId),
      }).rpc();
      await refresh();
      return tx;
    });
  }, [getProgram, wallet.publicKey, company, refresh]);

  // ─── Reject Payment ───────────────────────────────────────────

  const rejectPayment = useCallback(async (paymentId: number) => {
    const program = getProgram();
    if (!program || !wallet.publicKey || !company) throw new Error("Not ready");

    return withToast("Reject payment", async () => {
      const compPDA = getCompanyPDA(company.authority);
      const tx = await program.methods.rejectPayment().accounts({
        rejector: wallet.publicKey, company: compPDA,
        rejectorMember: getMemberPDA(compPDA, wallet.publicKey),
        payment: getPaymentPDA(compPDA, paymentId),
      }).rpc();
      await refresh();
      return tx;
    });
  }, [getProgram, wallet.publicKey, company, refresh]);

  // ─── Deposit USDC to Vault ────────────────────────────────────

  const depositToVault = useCallback(async (amount: number) => {
    if (!wallet.publicKey || !wallet.signTransaction) throw new Error("Wallet not connected");
    if (!companyPDA) throw new Error("No company");

    return withToast(`Deposit $${amount.toLocaleString()} USDC`, async () => {
      const vaultPDA = getVaultPDA(companyPDA);
      const userATA = getAssociatedTokenAddressSync(
        USDC_MINT, wallet.publicKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const tx = new Transaction();

      // Transfer USDC from user ATA to vault
      tx.add(createTransferCheckedInstruction(
        userATA,          // from
        USDC_MINT,        // mint
        vaultPDA,         // to (vault)
        wallet.publicKey, // authority
        BigInt(amount * 1_000_000), // amount in lamports
        6,                // decimals
        [],               // signers
        TOKEN_2022_PROGRAM_ID
      ));

      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      const signed = await wallet.signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      await refresh();
      return sig;
    });
  }, [wallet, companyPDA, connection, refresh]);

  return (
    <CompanyContext.Provider value={{
      loading, company, companyPDA, vaultBalance, payments, error,
      initializeCompany, addMember, setPolicies, createPayment,
      approvePayment, rejectPayment, depositToVault, refresh,
    }}>
      {children}
    </CompanyContext.Provider>
  );
}
