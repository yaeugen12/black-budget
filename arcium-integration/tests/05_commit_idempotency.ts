/**
 * Test 5 — commit_executed_payment is idempotent under replay.
 *
 * The circuit uses `max()` so resubmitting the same projected_monthly_spent
 * value (e.g., on a tx retry / reorg) doesn't double-count. We verify by:
 *   1. Init policy, monthly_spent = 0
 *   2. Evaluate $10k → projected = $10k
 *   3. Commit $10k → monthly_spent advances to $10k
 *   4. Commit $10k AGAIN → monthly_spent stays at $10k (no double-count)
 *   5. Evaluate a fresh $80k under a $100k cap → still passes (projected = $90k)
 *
 * If the commit weren't idempotent, step 4 would push monthly_spent to $20k
 * and step 5's $80k payment would breach the cap.
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

describe("05_commit_idempotency", () => {
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

    const sig = await program.methods
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
    return sig;
  }

  it("double-commit of same projected value doesn't double-count", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);
    const companyId = randomCompanyId();
    const ctx = await buildCipherCtx(owner, provider, program.programId);

    // Init: auto=$5k, dual=$50k, cap=$100k
    const initNonce = randomBytes(16);
    const initCts = ctx.cipher.encrypt(
      [USDC(5000), USDC(50000), USDC(100000), 0n],
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

    // First $10k payment
    const ev1 = await evaluateOnce({
      program, provider, requester: owner, companyId,
      paymentId: 1n, amount: USDC(10000),
      cipher: ctx.cipher, cipherPubKey: ctx.publicKey,
    });
    expect(ev1.requiredApprovals).to.equal(1);

    // Commit (first time)
    await commitSpend({
      owner, companyId, cipher: ctx.cipher,
      cipherPubKey: ctx.publicKey, projectedSpend: USDC(10000),
    });

    // Commit AGAIN (replay) — should be a no-op
    await commitSpend({
      owner, companyId, cipher: ctx.cipher,
      cipherPubKey: ctx.publicKey, projectedSpend: USDC(10000),
    });

    // Evaluate a fresh $80k payment. If commit wasn't idempotent,
    // monthly_spent would be $20k and $20k+$80k = $100k = cap (just barely passes).
    // If idempotent, monthly_spent is $10k → $10k+$80k = $90k (well under $100k).
    // To disambiguate cleanly, try $90k: idempotent → $100k = cap → passes;
    //                                  not idempotent → $20k+$90k = $110k > cap → rejected.
    const ev2 = await evaluateOnce({
      program, provider, requester: owner, companyId,
      paymentId: 2n, amount: USDC(90000),
      cipher: ctx.cipher, cipherPubKey: ctx.publicKey,
    });

    expect(ev2.requiredApprovals, "expected 2 (dual) — would be 255 (REJECTED) if commit double-counted").to.equal(2);
    expect(ev2.projectedMonthlySpent).to.equal(USDC(100000));
  });
});
