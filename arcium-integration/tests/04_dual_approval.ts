/**
 * Test 4 — dual approval threshold.
 *
 * Setup: auto=$5k, dual=$15k, cap=$100k.
 * Actions:
 *   - $20k payment → requiredApprovals = 2
 *   - $8k payment  → requiredApprovals = 1
 *   - $4k payment  → requiredApprovals = 0
 *
 * All three tiers fire from the same policy.
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

describe("04_dual_approval_threshold", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.confidentialPolicy as Program<ConfidentialPolicy>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  it("returns 0/1/2 across the three tiers", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);
    const companyId = randomCompanyId();
    const ctx = await buildCipherCtx(owner, provider, program.programId);

    const initNonce = randomBytes(16);
    const initCts = ctx.cipher.encrypt(
      [USDC(5000), USDC(15000), USDC(100000), 0n],
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

    // $4k → auto
    const auto = await evaluateOnce({
      program, provider, requester: owner, companyId,
      paymentId: 1n, amount: USDC(4000),
      cipher: ctx.cipher, cipherPubKey: ctx.publicKey,
    });
    expect(auto.requiredApprovals, "$4k should auto-approve").to.equal(0);

    // $8k → single
    const single = await evaluateOnce({
      program, provider, requester: owner, companyId,
      paymentId: 2n, amount: USDC(8000),
      cipher: ctx.cipher, cipherPubKey: ctx.publicKey,
    });
    expect(single.requiredApprovals, "$8k should require 1 signer").to.equal(1);

    // $20k → dual
    const dual = await evaluateOnce({
      program, provider, requester: owner, companyId,
      paymentId: 3n, amount: USDC(20000),
      cipher: ctx.cipher, cipherPubKey: ctx.publicKey,
    });
    expect(dual.requiredApprovals, "$20k should require 2 signers").to.equal(2);
  });
});
