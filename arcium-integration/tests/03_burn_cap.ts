/**
 * Test 3 — burn cap breach.
 *
 * Setup: cap = $50k, monthly_spent = 0.
 * Action: evaluate a $60k payment.
 * Expected: requiredApprovals = 255 (REJECTED sentinel), projected unchanged.
 *
 * This exercises the most security-critical branch: a payment that should be
 * blocked by treasury policy never gets a green light from the MPC cluster,
 * regardless of who tries to push it through.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { randomBytes } from "crypto";
import { expect } from "chai";
import * as os from "os";
import { awaitComputationFinalization, deserializeLE } from "@arcium-hq/client";
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

describe("03_burn_cap_breach", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.confidentialPolicy as Program<ConfidentialPolicy>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  it("payment > burn cap returns requiredApprovals=255 (REJECTED)", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);
    const companyId = randomCompanyId();
    const ctx = await buildCipherCtx(owner, provider, program.programId);

    // Init with low cap to make breach easy: $50k
    const initNonce = randomBytes(16);
    const initCts = ctx.cipher.encrypt(
      [USDC(5000), USDC(15000), USDC(50000), 0n],
      initNonce
    );
    const initOffset = new anchor.BN(randomBytes(8), "hex");
    const arc = buildArciumAccounts(program.programId, initOffset);

    await program.methods
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
        ...arc,
      })
      .signers([owner])
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await awaitComputationFinalization(provider, initOffset, program.programId, "confirmed");

    // Try a $60k payment — should be rejected
    const dec = await evaluateOnce({
      program,
      provider,
      requester: owner,
      companyId,
      paymentId: 1n,
      amount: USDC(60000),
      cipher: ctx.cipher,
      cipherPubKey: ctx.publicKey,
    });

    expect(dec.requiredApprovals, "expected REJECTED sentinel (255)").to.equal(255);
    // monthly_spent must stay at 0 (projected_monthly_spent reflects the unchanged state)
    expect(dec.projectedMonthlySpent).to.equal(0n);
  });
});
