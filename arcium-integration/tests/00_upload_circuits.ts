/**
 * One-time script: upload all 5 circuit binaries to the MXE.
 *
 * `arcium deploy` initializes the MXE + comp_def accounts but does NOT
 * upload the .arcis binaries — that's a separate step. Without binaries,
 * MPC computations are aborted by the cluster.
 *
 * Run BEFORE tests 02-07. Idempotent: uploadCircuit overwrites existing.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import * as fs from "fs";
import { uploadCircuit } from "@arcium-hq/client";
import type { ConfidentialPolicy } from "../target/types/confidential_policy";

describe("00_upload_circuits", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.confidentialPolicy as Program<ConfidentialPolicy>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  const circuits = [
    "init_company_policy",
    "evaluate_policy",
    "commit_executed_payment",
    "reset_monthly_spend",
    "update_policy_limits",
  ];

  it("uploads all 5 circuit binaries to MXE", async function () {
    this.timeout(900_000); // 15 min cap

    for (const circuitName of circuits) {
      const binPath = `build/${circuitName}.arcis`;
      const rawCircuit = fs.readFileSync(binPath);
      console.log(`  [upload] ${circuitName}: ${rawCircuit.length} bytes`);

      try {
        const sigs = await uploadCircuit(
          provider,
          circuitName,
          program.programId,
          rawCircuit,
          true // logging
        );
        console.log(`  [upload] ${circuitName} ✓  ${sigs.length} txs`);
      } catch (err: any) {
        console.error(`  [upload] ${circuitName} FAILED:`, String(err).slice(0, 300));
        throw err;
      }
    }
  });
});
