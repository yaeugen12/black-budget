"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useConnection, useWallet, type WalletContextState } from "@solana/wallet-adapter-react";
import { PublicKey, Transaction } from "@solana/web3.js";
import { Program, AnchorProvider, BN, type Idl } from "@coral-xyz/anchor";
import {
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
} from "@solana/spl-token";
import { toast } from "sonner";
import { IDL, PROGRAM_ID } from "./idl";

const programId = new PublicKey(PROGRAM_ID);
// USDC mint on devnet (Token-2022) — must match the mint used at company init
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
  let n = BigInt(nonce);
  const mask = BigInt(0xff);
  const shift = BigInt(8);
  for (let i = 0; i < 8; i++) { b[i] = Number(n & mask); n >>= shift; }
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("payment"), company.toBuffer(), b], programId
  );
  return pda;
}

// ─── Types ──────────────────────────────────────────────────────────

type EmptyValue = Record<string, never>;
type MemberRoleKey = "owner" | "approver" | "viewer" | "contractor";
type PaymentCategoryKey =
  | "payroll"
  | "vendor"
  | "subscription"
  | "contractor"
  | "reimbursement"
  | "other";
type ProofTypeKey = "investor" | "auditor" | "regulator";

type MemberRoleValue =
  | { owner: EmptyValue }
  | { approver: EmptyValue }
  | { viewer: EmptyValue }
  | { contractor: EmptyValue };

type PaymentCategoryValue = {
  payroll?: EmptyValue;
  vendor?: EmptyValue;
  subscription?: EmptyValue;
  contractor?: EmptyValue;
  reimbursement?: EmptyValue;
  other?: EmptyValue;
};

type PaymentStatusValue = {
  pending?: EmptyValue;
  approved?: EmptyValue;
  executed?: EmptyValue;
  rejected?: EmptyValue;
  cancelled?: EmptyValue;
};

type ProviderWallet = Pick<WalletContextState, "publicKey" | "signTransaction" | "signAllTransactions"> & {
  publicKey: PublicKey;
  signTransaction: NonNullable<WalletContextState["signTransaction"]>;
  signAllTransactions: NonNullable<WalletContextState["signAllTransactions"]>;
};

type ProgramAccountsInput = Record<string, PublicKey>;

interface RpcBuilder {
  accounts(accounts: ProgramAccountsInput): {
    rpc(): Promise<string>;
  };
}

export interface PolicySettings {
  autoApproveLimit: number;
  dualApproveThreshold: number;
  monthlyBurnCap: number;
  requireVendorVerification: boolean;
  restrictToKnownRecipients: boolean;
  minRunwayMonths: number;
}

export interface CompanyPolicyAccount {
  autoApproveLimit: BN;
  dualApproveThreshold: BN;
  monthlyBurnCap: BN;
  requireVendorVerification: boolean;
  restrictToKnownRecipients: boolean;
  minRunwayMonths: number;
}

export interface CompanyAccount {
  authority: PublicKey;
  name: string;
  vault: PublicKey;
  policy: CompanyPolicyAccount;
  memberCount: number;
  paymentNonce: BN;
  totalSpent: BN;
  monthlySpent: BN;
  currentMonth: number;
  createdAt: BN;
  bump: number;
}

export interface PaymentRequestAccount {
  company: PublicKey;
  requester: PublicKey;
  recipient: PublicKey;
  amount: BN;
  category: PaymentCategoryValue;
  descriptionHash: number[];
  memo: string;
  status: PaymentStatusValue;
  approvals: PublicKey[];
  requiredApprovals: number;
  paymentId: BN;
  riskScore: number;
  createdAt: BN;
  executedAt: BN;
  bump: number;
}

export interface ProgramPayment {
  publicKey: PublicKey;
  account: PaymentRequestAccount;
}

type BlackBudgetProgram = Program & {
  methods: {
    initializeCompany(name: string): RpcBuilder;
    addMember(role: MemberRoleValue, label: string): RpcBuilder;
    setPolicies(policy: CompanyPolicyAccount): RpcBuilder;
    createPayment(
      amount: BN,
      category: PaymentCategoryValue,
      descriptionHash: number[],
      memo: string,
      riskScore: number
    ): RpcBuilder;
    approvePayment(): RpcBuilder;
    executePayment(): RpcBuilder;
    rejectPayment(): RpcBuilder;
    recordProof(
      proofType: { investor: EmptyValue } | { auditor: EmptyValue } | { regulator: EmptyValue },
      merkleRoot: number[],
      paymentCount: number,
      periodStart: BN,
      periodEnd: BN
    ): RpcBuilder;
    recordComplianceProof(
      constraintHash: number[],
      merkleRoot: number[],
      result: boolean,
      paymentCount: number,
      periodStart: BN,
      periodEnd: BN
    ): RpcBuilder;
  };
  account: {
    company: {
      fetch(address: PublicKey): Promise<CompanyAccount>;
    };
    paymentRequest: {
      all(filters: Array<{ memcmp: { offset: number; bytes: string } }>): Promise<ProgramPayment[]>;
    };
  };
};

interface ProgramErrorLike {
  message?: string;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as ProgramErrorLike).message || fallback);
  }
  return fallback;
}

function toRoleValue(role: MemberRoleKey): MemberRoleValue {
  switch (role) {
    case "owner":
      return { owner: {} };
    case "approver":
      return { approver: {} };
    case "viewer":
      return { viewer: {} };
    case "contractor":
      return { contractor: {} };
  }
}

function toPaymentCategoryValue(category: string): PaymentCategoryValue {
  const normalized = category.toLowerCase() as PaymentCategoryKey;

  switch (normalized) {
    case "payroll":
      return { payroll: {} };
    case "vendor":
      return { vendor: {} };
    case "subscription":
      return { subscription: {} };
    case "contractor":
      return { contractor: {} };
    case "reimbursement":
      return { reimbursement: {} };
    default:
      return { other: {} };
  }
}

function toProofTypeValue(proofType: ProofTypeKey) {
  switch (proofType) {
    case "investor":
      return { investor: {} };
    case "auditor":
      return { auditor: {} };
    case "regulator":
      return { regulator: {} };
  }
}

interface CompanyContextType {
  loading: boolean;
  company: CompanyAccount | null;
  companyPDA: PublicKey | null;
  vaultBalance: number;       // Real USDC balance (human readable)
  payments: ProgramPayment[];
  error: string | null;

  initializeCompany: (name: string) => Promise<string>;
  addMember: (wallet: string, role: string, label: string) => Promise<string>;
  setPolicies: (policy: PolicySettings) => Promise<string>;
  createPayment: (recipient: string, amount: number, category: string, memo: string) => Promise<string>;
  approvePayment: (paymentId: number) => Promise<string>;
  executePayment: (paymentId: number, recipientPubkey: string) => Promise<string>;
  rejectPayment: (paymentId: number) => Promise<string>;
  depositToVault: (amount: number) => Promise<string>;
  anchorProof: (proofType: string, merkleRoot: number[], paymentCount: number) => Promise<string>;
  anchorComplianceProof: (constraintHash: number[], merkleRoot: number[], result: boolean, paymentCount: number, periodStart: number, periodEnd: number) => Promise<string>;
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

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<CompanyAccount | null>(null);
  const [companyPDA, setCompanyPDA] = useState<PublicKey | null>(null);
  const [vaultBalance, setVaultBalance] = useState<number>(0);
  const [payments, setPayments] = useState<ProgramPayment[]>([]);
  const [error, setError] = useState<string | null>(null);

  const getProgram = useCallback((): BlackBudgetProgram | null => {
    if (!mounted || !wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) return null;
    try {
      const provider = new AnchorProvider(connection, wallet as ProviderWallet, { commitment: "confirmed" });
      return new Program(IDL as unknown as Idl, provider) as unknown as BlackBudgetProgram;
    } catch (error) {
      console.error("Failed to create Program:", error);
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

      // Check if company exists before fetching (avoids unhandled error for new wallets)
      const acctInfo = await connection.getAccountInfo(pda);
      if (!acctInfo) {
        setCompany(null); setPayments([]); setVaultBalance(0); setLoading(false);
        return;
      }

      const data = await program.account.company.fetch(pda) as CompanyAccount;
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
      ]) as ProgramPayment[];
      setPayments(allPayments);
      setError(null);
    } catch (error: unknown) {
      console.error("Refresh failed:", error);
      setError(getErrorMessage(error, "Failed to load company data"));
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
    } catch (error: unknown) {
      const msg = getErrorMessage(error, "Transaction failed").slice(0, 100);
      toast.error(`${label} failed`, { id, description: msg });
      throw error;
    }
  }

  // ─── Initialize Company ───────────────────────────────────────

  const initializeCompany = useCallback(async (name: string) => {
    const program = getProgram();
    const authority = wallet.publicKey;
    if (!program || !authority) throw new Error("Wallet not connected");

    return withToast("Create company", async () => {
      const compPDA = getCompanyPDA(authority);
      const vaultPDA = getVaultPDA(compPDA);
      const memberPDA = getMemberPDA(compPDA, authority);

      const tx = await program.methods.initializeCompany(name).accounts({
        authority, company: compPDA, vault: vaultPDA,
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
    const authority = wallet.publicKey;
    if (!program || !authority) throw new Error("Wallet not connected");

    return withToast(`Add ${label}`, async () => {
      const compPDA = getCompanyPDA(authority);
      const newWallet = new PublicKey(walletAddr);

      const tx = await program.methods
        .addMember(toRoleValue(role as MemberRoleKey), label).accounts({
          authority, company: compPDA,
          authorityMember: getMemberPDA(compPDA, authority),
          newMemberWallet: newWallet, member: getMemberPDA(compPDA, newWallet),
          systemProgram: SYSTEM,
        }).rpc();

      await refresh();
      return tx;
    });
  }, [getProgram, wallet.publicKey, refresh]);

  // ─── Set Policies ─────────────────────────────────────────────

  const setPolicies = useCallback(async (policy: PolicySettings) => {
    const program = getProgram();
    const authority = wallet.publicKey;
    if (!program || !authority) throw new Error("Wallet not connected");

    return withToast("Save policies", async () => {
      const compPDA = getCompanyPDA(authority);

      const tx = await program.methods.setPolicies({
        autoApproveLimit: new BN(Math.round(policy.autoApproveLimit * 1_000_000)),
        dualApproveThreshold: new BN(Math.round(policy.dualApproveThreshold * 1_000_000)),
        monthlyBurnCap: new BN(Math.round(policy.monthlyBurnCap * 1_000_000)),
        requireVendorVerification: policy.requireVendorVerification,
        restrictToKnownRecipients: policy.restrictToKnownRecipients,
        minRunwayMonths: policy.minRunwayMonths,
      }).accounts({
        authority, company: compPDA,
        authorityMember: getMemberPDA(compPDA, authority),
      }).rpc();

      await refresh();
      return tx;
    });
  }, [getProgram, wallet.publicKey, refresh]);

  // ─── Create Payment ───────────────────────────────────────────

  const createPayment = useCallback(async (recipient: string, amount: number, category: string, memo: string) => {
    const program = getProgram();
    const requester = wallet.publicKey;
    const activeCompanyPDA = companyPDA;
    if (!program || !requester || !company || !activeCompanyPDA) throw new Error("Not ready");

    return withToast(`Payment $${amount.toLocaleString()}`, async () => {
      const nonce = company.paymentNonce.toNumber();
      const paymentPDA = getPaymentPDA(activeCompanyPDA, nonce);
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(memo));
      const descriptionHash = Array.from(new Uint8Array(hashBuffer));

      const tx = await program.methods.createPayment(
        new BN(Math.round(amount * 1_000_000)),
        toPaymentCategoryValue(category),
        descriptionHash, memo.slice(0, 128), 0
      ).accounts({
        requester, company: activeCompanyPDA,
        requesterMember: getMemberPDA(activeCompanyPDA, requester),
        recipient: new PublicKey(recipient), payment: paymentPDA,
        systemProgram: SYSTEM,
      }).rpc();

      await refresh();
      return tx;
    });
  }, [getProgram, wallet.publicKey, company, companyPDA, refresh]);

  // ─── Approve Payment ──────────────────────────────────────────

  const approvePayment = useCallback(async (paymentId: number) => {
    const program = getProgram();
    const approver = wallet.publicKey;
    if (!program || !approver || !company) throw new Error("Not ready");

    return withToast("Approve payment", async () => {
      const compPDA = getCompanyPDA(company.authority);
      const tx = await program.methods.approvePayment().accounts({
        approver, company: compPDA,
        approverMember: getMemberPDA(compPDA, approver),
        payment: getPaymentPDA(compPDA, paymentId),
      }).rpc();
      await refresh();
      return tx;
    });
  }, [getProgram, wallet.publicKey, company, refresh]);

  // ─── Execute Payment ─────────────────────────────────────────

  const executePayment = useCallback(async (paymentId: number, recipientPubkey: string) => {
    const program = getProgram();
    const executor = wallet.publicKey;
    if (!program || !executor || !company) throw new Error("Not ready");

    return withToast("Execute payment", async () => {
      const compPDA = getCompanyPDA(company.authority);
      const recipientKey = new PublicKey(recipientPubkey);
      const recipientATA = getAssociatedTokenAddressSync(
        USDC_MINT, recipientKey, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const tx = await program.methods.executePayment().accounts({
        executor,
        company: compPDA,
        executorMember: getMemberPDA(compPDA, executor),
        payment: getPaymentPDA(compPDA, paymentId),
        vault: getVaultPDA(compPDA),
        recipientTokenAccount: recipientATA,
        recipient: recipientKey,
        usdcMint: USDC_MINT,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SYSTEM,
      }).rpc();
      await refresh();
      return tx;
    });
  }, [getProgram, wallet.publicKey, company, refresh]);

  // ─── Reject Payment ───────────────────────────────────────────

  const rejectPayment = useCallback(async (paymentId: number) => {
    const program = getProgram();
    const rejector = wallet.publicKey;
    if (!program || !rejector || !company) throw new Error("Not ready");

    return withToast("Reject payment", async () => {
      const compPDA = getCompanyPDA(company.authority);
      const tx = await program.methods.rejectPayment().accounts({
        rejector, company: compPDA,
        rejectorMember: getMemberPDA(compPDA, rejector),
        payment: getPaymentPDA(compPDA, paymentId),
      }).rpc();
      await refresh();
      return tx;
    });
  }, [getProgram, wallet.publicKey, company, refresh]);

  // ─── Deposit USDC to Vault ────────────────────────────────────

  const depositToVault = useCallback(async (amount: number) => {
    const authority = wallet.publicKey;
    const signTransaction = wallet.signTransaction;
    const activeCompanyPDA = companyPDA;
    if (!authority || !signTransaction) throw new Error("Wallet not connected");
    if (!activeCompanyPDA) throw new Error("No company");

    return withToast(`Deposit $${amount.toLocaleString()} USDC`, async () => {
      const vaultPDA = getVaultPDA(activeCompanyPDA);
      const userATA = getAssociatedTokenAddressSync(
        USDC_MINT, authority, false, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID
      );

      const tx = new Transaction();

      // Transfer USDC from user ATA to vault
      tx.add(createTransferCheckedInstruction(
        userATA,          // from
        USDC_MINT,        // mint
        vaultPDA,         // to (vault)
        authority,        // authority
        BigInt(Math.round(amount * 1_000_000)), // amount in lamports
        6,                // decimals
        [],               // signers
        TOKEN_2022_PROGRAM_ID
      ));

      tx.feePayer = authority;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      await refresh();
      return sig;
    });
  }, [wallet, companyPDA, connection, refresh]);

  // ─── Anchor Proof On-Chain ────────────────────────────────────

  const anchorProof = useCallback(async (proofType: string, merkleRoot: number[], paymentCount: number) => {
    const program = getProgram();
    const authority = wallet.publicKey;
    const activeCompanyPDA = companyPDA;
    if (!program || !authority || !activeCompanyPDA) throw new Error("Not ready");

    return withToast("Anchor proof on-chain", async () => {
      const now = Math.floor(Date.now() / 1000);
      const periodStart = now - 86400 * 30;
      const periodEnd = now;

      const proofTypeObj = toProofTypeValue(proofType as ProofTypeKey);

      // PDA seeded with proof_type + period_end
      const proofTypeByte = proofType === "investor" ? 0 : proofType === "auditor" ? 1 : 2;
      const tsBytes = Buffer.alloc(8);
      let ts = BigInt(periodEnd);
      const mask = BigInt(0xff);
      const shift = BigInt(8);
      for (let i = 0; i < 8; i++) { tsBytes[i] = Number(ts & mask); ts >>= shift; }
      const [proofPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("proof"), activeCompanyPDA.toBuffer(), Buffer.from([proofTypeByte]), tsBytes],
        programId
      );

      // Pad merkle root to 32 bytes
      const root = merkleRoot.length >= 32 ? merkleRoot.slice(0, 32) : [...merkleRoot, ...new Array(32 - merkleRoot.length).fill(0)];

      const tx = await program.methods
        .recordProof(
          proofTypeObj,
          root,
          paymentCount,
          new BN(periodStart),
          new BN(periodEnd),
        )
        .accounts({
          authority,
          company: activeCompanyPDA,
          member: getMemberPDA(activeCompanyPDA, authority),
          proofRecord: proofPDA,
          clock: new PublicKey("SysvarC1ock11111111111111111111111111111111"),
          systemProgram: SYSTEM,
        })
        .rpc();

      await refresh();
      return tx;
    });
  }, [getProgram, wallet.publicKey, companyPDA, refresh]);

  // ─── Anchor Compliance Proof On-Chain ─────────────────────────────

  const anchorComplianceProof = useCallback(async (
    constraintHash: number[], merkleRoot: number[], result: boolean,
    paymentCount: number, periodStart: number, periodEnd: number
  ) => {
    const program = getProgram();
    const authority = wallet.publicKey;
    const activeCompanyPDA = companyPDA;
    if (!program || !authority || !activeCompanyPDA) throw new Error("Not ready");

    return withToast("Anchor compliance proof", async () => {
      // PDA: ["compliance", company, constraint_hash, period_end]
      const chBuf = Buffer.from(constraintHash);
      const tsBuf = Buffer.alloc(8);
      let ts = BigInt(periodEnd);
      const mask = BigInt(0xff);
      const shift = BigInt(8);
      for (let i = 0; i < 8; i++) { tsBuf[i] = Number(ts & mask); ts >>= shift; }

      const [compliancePDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("compliance"), activeCompanyPDA.toBuffer(), chBuf, tsBuf],
        programId
      );

      const tx = await program.methods
        .recordComplianceProof(
          constraintHash,
          merkleRoot,
          result,
          paymentCount,
          new BN(periodStart),
          new BN(periodEnd),
        )
        .accounts({
          authority,
          company: activeCompanyPDA,
          member: getMemberPDA(activeCompanyPDA, authority),
          complianceProof: compliancePDA,
          clock: new PublicKey("SysvarC1ock11111111111111111111111111111111"),
          systemProgram: SYSTEM,
        })
        .rpc();

      await refresh();
      return tx;
    });
  }, [getProgram, wallet.publicKey, companyPDA, refresh]);

  return (
    <CompanyContext.Provider value={{
      loading, company, companyPDA, vaultBalance, payments, error,
      initializeCompany, addMember, setPolicies, createPayment,
      approvePayment, executePayment, rejectPayment, depositToVault, anchorProof, anchorComplianceProof, refresh,
    }}>
      {children}
    </CompanyContext.Provider>
  );
}
