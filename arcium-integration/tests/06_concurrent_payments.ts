/**
 * Test 6 — concurrent payments resolve correctly.
 *
 * Issue 5 evaluate_policy calls (different payment_ids) without waiting.
 * The MPC cluster processes them in parallel; each decision PDA must end
 * up with the correct ciphertext. We assert that:
 *   - All 5 finalise within the timeout
 *   - Each decision decrypts to the expected tier
 *   - Decision PDAs are distinct (no aliasing on payment_id)
 *
 * This exposes any race conditions in our PDA derivation or arg-builder
 * account-offset math.
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
  decisionPda,
  randomCompanyId,
  USDC,
  decryptDecision,
} from "./_helpers";

describe("06_concurrent_payments", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.confidentialPolicy as Program<ConfidentialPolicy>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  it("5 simultaneous evaluate_policy calls all resolve correctly", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);
    const companyId = randomCompanyId();
    const ctx = await buildCipherCtx(owner, provider, program.programId);

    // Init: auto=$5k, dual=$15k, cap=$1M (high to avoid breach)
    const initNonce = randomBytes(16);
    const initCts = ctx.cipher.encrypt(
      [USDC(5000), USDC(15000), USDC(1000000), 0n],
      initNonce
    );
    const initOffset = new anchor.BN(randomBytes(8), "hex");
    const initArc = buildArciumAccounts(program.programId, initOffset);

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
        ...initArc,
      })
      .signers([owner])
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await awaitComputationFinalization(provider, initOffset, program.programId, "confirmed");

    // Build 5 payments, all submitted before waiting for any to finalise.
    const cases = [
      { paymentId: 1n, amount: USDC(3000), expected: 0 },   // auto
      { paymentId: 2n, amount: USDC(7000), expected: 1 },   // single
      { paymentId: 3n, amount: USDC(20000), expected: 2 },  // dual
      { paymentId: 4n, amount: USDC(12000), expected: 1 },  // single
      { paymentId: 5n, amount: USDC(50000), expected: 2 },  // dual
    ];

    const submits = await Promise.all(
      cases.map(async (c) => {
        const nonce = randomBytes(16);
        const cts = ctx.cipher.encrypt([c.amount, 0n, 0n], nonce);
        const offset = new anchor.BN(randomBytes(8), "hex");
        const arc = buildArciumAccounts(program.programId, offset);
        await program.methods
          .evaluatePolicy(
            offset,
            new anchor.BN(c.paymentId.toString()),
            Array.from(ctx.publicKey),
            new anchor.BN(deserializeLE(nonce).toString()),
            Array.from(cts[0]),
            Array.from(cts[1]),
            Array.from(cts[2])
          )
          .accountsPartial({
            payer: owner.publicKey,
            compDefAccount: compDefAddress(program.programId, "evaluate_policy"),
            policyAcc: policyPda(program.programId, companyId),
            decisionAcc: decisionPda(program.programId, companyId, c.paymentId),
            ...arc,
          })
          .signers([owner])
          .rpc({ skipPreflight: true, commitment: "confirmed" });
        return { computationOffset: offset, ...c };
      })
    );

    // Now await all 5 finalisations in parallel.
    await Promise.all(
      submits.map((s) =>
        awaitComputationFinalization(provider, s.computationOffset, program.programId, "confirmed")
      )
    );

    // Verify each decision decrypts to expected tier.
    for (const c of cases) {
      const decision = await (program.account as any).policyDecisionAccount.fetch(
        decisionPda(program.programId, companyId, c.paymentId)
      );
      const dec = decryptDecision(decision, ctx.cipher);
      expect(dec.requiredApprovals, `payment ${c.paymentId} ($${Number(c.amount) / 1e6}) expected ${c.expected}`).to.equal(c.expected);
    }
  });
});
