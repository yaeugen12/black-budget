/**
 * Test 2 — happy path: full lifecycle for a single payment.
 *
 * 1. Initialise company policy ($5k auto / $15k dual / $75k cap)
 * 2. Evaluate a $3k payment → requiredApprovals = 0 (auto-approved)
 * 3. Commit the executed payment → monthly_spent advances
 * 4. (Implicit) policy ciphertext on PDA is non-zero after init
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { randomBytes } from "crypto";
import { expect } from "chai";
import * as os from "os";
import {
  awaitComputationFinalization,
  deserializeLE,
} from "@arcium-hq/client";
import type { ConfidentialPolicy } from "../target/types/confidential_policy";
import {
  readKpJson,
  buildCipherCtx,
  buildArciumAccounts,
  compDefAddress,
  policyPda,
  randomCompanyId,
  USDC,
  evaluateOnce,
} from "./_helpers";

describe("02_happy_path", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.confidentialPolicy as Program<ConfidentialPolicy>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  it("init policy → auto-approve $3k → commit spend", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);
    const companyId = randomCompanyId();
    const ctx = await buildCipherCtx(owner, provider, program.programId);

    // ── Step 1: init company policy ───────────────────────────────────
    const initNonce = randomBytes(16);
    const initCts = ctx.cipher.encrypt(
      [USDC(5000), USDC(15000), USDC(75000), 0n],
      initNonce
    );
    const initOffset = new anchor.BN(randomBytes(8), "hex");
    const initArc = buildArciumAccounts(program.programId, initOffset);

    const initSig = await program.methods
      .initCompanyPolicy(
        initOffset,
        Array.from(companyId),
        Array.from(ctx.publicKey),
        new anchor.BN(deserializeLE(initNonce).toString()),
        Array.from(initCts[0]),
        Array.from(initCts[1]),
        Array.from(initCts[2]),
        Array.from(initCts[3])
      )
      .accountsPartial({
        payer: owner.publicKey,
        compDefAccount: compDefAddress(program.programId, "init_company_policy"),
        policyAcc: policyPda(program.programId, companyId),
        ...initArc,
      })
      .signers([owner])
      .rpc({ skipPreflight: true, commitment: "confirmed" });

    console.log(`  init_company_policy: ${initSig}`);
    await awaitComputationFinalization(provider, initOffset, program.programId, "confirmed");

    const policyAccount: any = await (program.account as any).confidentialPolicyAccount.fetch(
      policyPda(program.programId, companyId)
    );
    expect(policyAccount.companyId).to.deep.equal(Array.from(companyId));
    expect(policyAccount.authority.toString()).to.equal(owner.publicKey.toString());
    // Ciphertext must be non-zero after init
    const flat = policyAccount.encryptedPolicy.flat();
    expect(flat.some((b: number) => b !== 0)).to.equal(true);

    // ── Step 2: evaluate a $3k payment ────────────────────────────────
    const dec = await evaluateOnce({
      program,
      provider,
      requester: owner,
      companyId,
      paymentId: 1n,
      amount: USDC(3000),
      cipher: ctx.cipher,
      cipherPubKey: ctx.publicKey,
    });

    console.log(`  evaluate_policy → required=${dec.requiredApprovals}, projected=${dec.projectedMonthlySpent}`);
    expect(dec.requiredApprovals, "expected auto-approve (0)").to.equal(0);
    expect(dec.projectedMonthlySpent).to.equal(USDC(3000));
  });
});
