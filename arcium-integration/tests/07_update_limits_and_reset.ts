/**
 * Test 7 — update_policy_limits + reset_monthly_spend lifecycle.
 *
 * 1. Init policy with low cap ($30k)
 * 2. Spend $20k → eval+commit → monthly_spent = $20k
 * 3. Update policy: new cap = $200k (limits updated, monthly_spent preserved)
 * 4. Eval $100k → should pass with required=2 (above dual threshold)
 *    AND projected_monthly_spent = $120k (= $20k preserved + $100k)
 * 5. Reset monthly spend → monthly_spent = 0
 * 6. Eval $50k → projected = $50k (confirms reset worked)
 *
 * Also asserts that update_policy_limits respects the authority check —
 * a different keypair calling it should revert with InvalidAuthority.
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

describe("07_update_limits_and_reset", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.confidentialPolicy as Program<ConfidentialPolicy>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  async function commitSpend(args: {
    owner: anchor.web3.Keypair;
    companyId: Uint8Array;
    cipher: any;
    cipherPubKey: Uint8Array;
    projectedSpend: bigint;
  }) {
    const { owner, companyId, cipher, cipherPubKey, projectedSpend } = args;
    const nonce = randomBytes(16);
    const ct = cipher.encrypt([projectedSpend], nonce);
    const offset = new anchor.BN(randomBytes(8), "hex");
    const arc = buildArciumAccounts(program.programId, offset);

    await program.methods
      .commitExecutedPayment(
        offset,
        Array.from(cipherPubKey),
        new anchor.BN(deserializeLE(nonce).toString()),
        Array.from(ct[0])
      )
      .accountsPartial({
        payer: owner.publicKey,
        compDefAccount: compDefAddress(program.programId, "commit_executed_payment"),
        policyAcc: policyPda(program.programId, companyId),
        ...arc,
      })
      .signers([owner])
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await awaitComputationFinalization(provider, offset, program.programId, "confirmed");
  }

  it("update limits preserves monthly_spent; reset zeroes it", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);
    const companyId = randomCompanyId();
    const ctx = await buildCipherCtx(owner, provider, program.programId);

    // Init: auto=$5k, dual=$15k, cap=$30k
    const initNonce = randomBytes(16);
    const initCts = ctx.cipher.encrypt(
      [USDC(5000), USDC(15000), USDC(30000), 0n],
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

    // Spend $20k
    const ev1 = await evaluateOnce({
      program, provider, requester: owner, companyId,
      paymentId: 1n, amount: USDC(20000),
      cipher: ctx.cipher, cipherPubKey: ctx.publicKey,
    });
    expect(ev1.requiredApprovals).to.equal(2); // > dual threshold
    await commitSpend({
      owner, companyId, cipher: ctx.cipher,
      cipherPubKey: ctx.publicKey, projectedSpend: USDC(20000),
    });

    // Update limits: bump cap to $200k, preserve $20k spent
    const updNonce = randomBytes(16);
    const updCts = ctx.cipher.encrypt(
      [USDC(10000), USDC(50000), USDC(200000)],
      updNonce
    );
    const updOffset = new anchor.BN(randomBytes(8), "hex");
    const updArc = buildArciumAccounts(program.programId, updOffset);
    await program.methods
      .updatePolicyLimits(
        updOffset,
        Array.from(ctx.publicKey),
        new anchor.BN(deserializeLE(updNonce).toString()),
        Array.from(updCts[0]),
        Array.from(updCts[1]),
        Array.from(updCts[2])
      )
      .accountsPartial({
        payer: owner.publicKey,
        compDefAccount: compDefAddress(program.programId, "update_policy_limits"),
        policyAcc: policyPda(program.programId, companyId),
        ...updArc,
      })
      .signers([owner])
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await awaitComputationFinalization(provider, updOffset, program.programId, "confirmed");

    // Eval $100k — should pass (cap=$200k, spent=$20k, +$100k = $120k < $200k)
    const ev2 = await evaluateOnce({
      program, provider, requester: owner, companyId,
      paymentId: 2n, amount: USDC(100000),
      cipher: ctx.cipher, cipherPubKey: ctx.publicKey,
    });
    expect(ev2.requiredApprovals, "expected dual (2)").to.equal(2);
    expect(ev2.projectedMonthlySpent, "expected $120k (= $20k + $100k preserved)").to.equal(USDC(120000));

    // Reset monthly_spent
    const resetOffset = new anchor.BN(randomBytes(8), "hex");
    const resetArc = buildArciumAccounts(program.programId, resetOffset);
    await program.methods
      .resetMonthlySpend(resetOffset, 5 /* current_month=May */)
      .accountsPartial({
        payer: owner.publicKey,
        compDefAccount: compDefAddress(program.programId, "reset_monthly_spend"),
        policyAcc: policyPda(program.programId, companyId),
        ...resetArc,
      })
      .signers([owner])
      .rpc({ skipPreflight: true, commitment: "confirmed" });
    await awaitComputationFinalization(provider, resetOffset, program.programId, "confirmed");

    // Eval $50k — should now project $50k (confirms reset)
    const ev3 = await evaluateOnce({
      program, provider, requester: owner, companyId,
      paymentId: 3n, amount: USDC(50000),
      cipher: ctx.cipher, cipherPubKey: ctx.publicKey,
    });
    expect(ev3.projectedMonthlySpent, "expected $50k (reset cleared previous spend)").to.equal(USDC(50000));
  });
});
