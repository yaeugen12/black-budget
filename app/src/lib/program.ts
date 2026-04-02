// @ts-nocheck — Types will be auto-generated when anchor IDL build works with stable Rust
import { Program, AnchorProvider, BN, web3 } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { useMemo } from "react";
import { IDL, PROGRAM_ID } from "./idl";

const programId = new PublicKey(PROGRAM_ID);

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

  const program = useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;

    const provider = new AnchorProvider(
      connection,
      wallet as never,
      { commitment: "confirmed" }
    );

    return new Program(IDL as any, provider);
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
    role: { owner: {} } | { approver: {} } | { viewer: {} } | { contractor: {} },
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
    category: { payroll: {} } | { vendor: {} } | { subscription: {} } | { contractor: {} } | { reimbursement: {} } | { other: {} },
    descriptionHash: number[],
    memo: string,
    riskScore: number
  ) {
    if (!program || !wallet.publicKey) throw new Error("Wallet not connected");

    const [companyPDA] = getCompanyPDA(wallet.publicKey);
    const [requesterMemberPDA] = getMemberPDA(companyPDA, wallet.publicKey);

    // Fetch company to get nonce
    const company = await program.account.company.fetch(companyPDA);
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
      return await program.account.company.fetch(companyPDA);
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
    ]);
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
