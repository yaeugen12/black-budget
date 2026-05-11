import { Program, AnchorProvider, BN, type Idl } from "@coral-xyz/anchor";
import { useConnection, useWallet, type WalletContextState } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { useMemo } from "react";
import { IDL, PROGRAM_ID } from "./idl";

const programId = new PublicKey(PROGRAM_ID);

type EmptyValue = Record<string, never>;

type RoleValue =
  | { owner: EmptyValue }
  | { approver: EmptyValue }
  | { viewer: EmptyValue }
  | { contractor: EmptyValue };

type PaymentCategoryValue =
  {
    payroll?: EmptyValue;
    vendor?: EmptyValue;
    subscription?: EmptyValue;
    contractor?: EmptyValue;
    reimbursement?: EmptyValue;
    other?: EmptyValue;
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

interface CompanyAccount {
  paymentNonce: BN;
}

interface PaymentRequestAccount {
  company: PublicKey;
  requester: PublicKey;
  recipient: PublicKey;
  amount: BN;
  category: PaymentCategoryValue;
  memo: string;
  paymentId: BN;
  requiredApprovals: number;
  approvals: PublicKey[];
  riskScore: number;
  createdAt: BN;
  status: Record<string, EmptyValue>;
}

interface ProgramPayment {
  publicKey: PublicKey;
  account: PaymentRequestAccount;
}

type BlackBudgetProgram = Program & {
  methods: {
    initializeCompany(name: string): RpcBuilder;
    addMember(role: RoleValue, label: string): RpcBuilder;
    setPolicies(policy: {
      autoApproveLimit: BN;
      dualApproveThreshold: BN;
      monthlyBurnCap: BN;
      requireVendorVerification: boolean;
      restrictToKnownRecipients: boolean;
      minRunwayMonths: number;
    }): RpcBuilder;
    createPayment(
      amount: BN,
      category: PaymentCategoryValue,
      descriptionHash: number[],
      memo: string,
      riskScore: number
    ): RpcBuilder;
    approvePayment(): RpcBuilder;
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

// ─── PDA Derivations ────────────────────────────────────────────────

export function getCompanyPDA(authority: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("company"), authority.toBuffer()],
    programId
  );
}

export function getMemberPDA(
  company: PublicKey,
  wallet: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("member"), company.toBuffer(), wallet.toBuffer()],
    programId
  );
}

export function getVaultPDA(company: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), company.toBuffer()],
    programId
  );
}

export function getPaymentPDA(
  company: PublicKey,
  nonce: number
): [PublicKey, number] {
  const nonceBuffer = Buffer.alloc(8);
  nonceBuffer.writeBigUInt64LE(BigInt(nonce));
  return PublicKey.findProgramAddressSync(
    [Buffer.from("payment"), company.toBuffer(), nonceBuffer],
    programId
  );
}

// ─── Hook: useBlackBudget ───────────────────────────────────────────

export function useBlackBudget() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const program = useMemo((): BlackBudgetProgram | null => {
    if (!wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) return null;

    const provider = new AnchorProvider(
      connection,
      wallet as ProviderWallet,
      { commitment: "confirmed" }
    );

    return new Program(IDL as unknown as Idl, provider) as unknown as BlackBudgetProgram;
  }, [connection, wallet]);

  // ─── Initialize Company ─────────────────────────────────────────

  async function initializeCompany(name: string, usdcMint: PublicKey) {
    if (!program || !wallet.publicKey) throw new Error("Wallet not connected");

    const [companyPDA] = getCompanyPDA(wallet.publicKey);
    const [vaultPDA] = getVaultPDA(companyPDA);
    const [memberPDA] = getMemberPDA(companyPDA, wallet.publicKey);

    const tx = await program.methods
      .initializeCompany(name)
      .accounts({
        authority: wallet.publicKey,
        company: companyPDA,
        vault: vaultPDA,
        usdcMint,
        founderMember: memberPDA,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { tx, companyPDA, vaultPDA };
  }

  // ─── Add Member ─────────────────────────────────────────────────

  async function addMember(
    newMemberWallet: PublicKey,
    role: RoleValue,
    label: string
  ) {
    if (!program || !wallet.publicKey) throw new Error("Wallet not connected");

    const [companyPDA] = getCompanyPDA(wallet.publicKey);
    const [authorityMemberPDA] = getMemberPDA(companyPDA, wallet.publicKey);
    const [newMemberPDA] = getMemberPDA(companyPDA, newMemberWallet);

    const tx = await program.methods
      .addMember(role, label)
      .accounts({
        authority: wallet.publicKey,
        company: companyPDA,
        authorityMember: authorityMemberPDA,
        newMemberWallet,
        member: newMemberPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return tx;
  }

  // ─── Set Policies ───────────────────────────────────────────────

  async function setPolicies(policy: {
    autoApproveLimit: BN;
    dualApproveThreshold: BN;
    monthlyBurnCap: BN;
    requireVendorVerification: boolean;
    restrictToKnownRecipients: boolean;
    minRunwayMonths: number;
  }) {
    if (!program || !wallet.publicKey) throw new Error("Wallet not connected");

    const [companyPDA] = getCompanyPDA(wallet.publicKey);
    const [memberPDA] = getMemberPDA(companyPDA, wallet.publicKey);

    const tx = await program.methods
      .setPolicies(policy)
      .accounts({
        authority: wallet.publicKey,
        company: companyPDA,
        authorityMember: memberPDA,
      })
      .rpc();

    return tx;
  }

  // ─── Create Payment ─────────────────────────────────────────────

  async function createPayment(
    recipient: PublicKey,
    amount: number, // in USDC (human readable)
    category: PaymentCategoryValue,
    descriptionHash: number[],
    memo: string,
    riskScore: number
  ) {
    if (!program || !wallet.publicKey) throw new Error("Wallet not connected");

    const [companyPDA] = getCompanyPDA(wallet.publicKey);
    const [requesterMemberPDA] = getMemberPDA(companyPDA, wallet.publicKey);

    // Fetch company to get nonce
    const company = await program.account.company.fetch(companyPDA) as CompanyAccount;
    const nonce = company.paymentNonce.toNumber();
    const [paymentPDA] = getPaymentPDA(companyPDA, nonce);

    const amountLamports = new BN(amount * 1_000_000); // USDC has 6 decimals

    const tx = await program.methods
      .createPayment(amountLamports, category, descriptionHash, memo, riskScore)
      .accounts({
        requester: wallet.publicKey,
        company: companyPDA,
        requesterMember: requesterMemberPDA,
        recipient,
        payment: paymentPDA,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    return { tx, paymentPDA, paymentId: nonce };
  }

  // ─── Approve Payment ────────────────────────────────────────────

  async function approvePayment(companyAuthority: PublicKey, paymentId: number) {
    if (!program || !wallet.publicKey) throw new Error("Wallet not connected");

    const [companyPDA] = getCompanyPDA(companyAuthority);
    const [approverMemberPDA] = getMemberPDA(companyPDA, wallet.publicKey);
    const [paymentPDA] = getPaymentPDA(companyPDA, paymentId);

    const tx = await program.methods
      .approvePayment()
      .accounts({
        approver: wallet.publicKey,
        company: companyPDA,
        approverMember: approverMemberPDA,
        payment: paymentPDA,
      })
      .rpc();

    return tx;
  }

  // ─── Fetch Company Data ─────────────────────────────────────────

  async function fetchCompany() {
    if (!program || !wallet.publicKey) return null;

    const [companyPDA] = getCompanyPDA(wallet.publicKey);
    try {
      return await program.account.company.fetch(companyPDA) as CompanyAccount;
    } catch {
      return null; // Company doesn't exist yet
    }
  }

  // ─── Fetch Payments ─────────────────────────────────────────────

  async function fetchPayments(companyAuthority: PublicKey) {
    if (!program) return [];

    const [companyPDA] = getCompanyPDA(companyAuthority);
    return await program.account.paymentRequest.all([
      { memcmp: { offset: 8, bytes: companyPDA.toBase58() } },
    ]) as ProgramPayment[];
  }

  return {
    program,
    connected: !!wallet.publicKey,
    publicKey: wallet.publicKey,
    initializeCompany,
    addMember,
    setPolicies,
    createPayment,
    approvePayment,
    fetchCompany,
    fetchPayments,
  };
}
