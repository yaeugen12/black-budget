/**
 * Diagnostic: check on-chain state of each circuit's compDefAccount.
 * Reveals which circuits still need uploadCircuit invocation.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { getArciumProgram, getCompDefAccAddress, getCompDefAccOffset, getCircuitState } from "@arcium-hq/client";
import type { ConfidentialPolicy } from "../target/types/confidential_policy";

describe("00b_check_circuit_state", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.confidentialPolicy as Program<ConfidentialPolicy>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  it("prints state per circuit", async function () {
    this.timeout(60_000);
    const arciumProgram = getArciumProgram(provider);

    const circuits = [
      "init_company_policy",
      "evaluate_policy",
      "commit_executed_payment",
      "reset_monthly_spend",
      "update_policy_limits",
    ];

    for (const name of circuits) {
      const offset = Buffer.from(getCompDefAccOffset(name)).readUInt32LE();
      const compDefAcc = getCompDefAccAddress(program.programId, offset);
      try {
        const acc: any = await (arciumProgram.account as any).computationDefinitionAccount.fetch(compDefAcc);
        const state = getCircuitState(acc.circuitSource);
        console.log(`  ${name.padEnd(28)} state=${state}  pda=${compDefAcc.toBase58()}`);
      } catch (e: any) {
        console.log(`  ${name.padEnd(28)} ERROR  ${String(e).slice(0, 80)}`);
      }
    }
  });
});
