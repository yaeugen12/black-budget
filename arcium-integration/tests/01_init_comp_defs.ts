/**
 * Test 1: Initialise all 5 computation definitions + upload circuits.
 *
 * Runs once before any other test (mocha's --grep ordering or just rely on
 * filename prefix `01_`). Idempotent — re-running is safe because the helper
 * swallows "already in use" errors on the comp-def init + reuploads circuits.
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import * as os from "os";
import type { ConfidentialPolicy } from "../target/types/confidential_policy";
import { readKpJson, initAllCompDefs } from "./_helpers";

describe("01_init_comp_defs", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace.confidentialPolicy as Program<ConfidentialPolicy>;
  const provider = anchor.getProvider() as anchor.AnchorProvider;

  it("initialises all 5 comp defs + uploads circuits", async () => {
    const owner = readKpJson(`${os.homedir()}/.config/solana/id.json`);
    await initAllCompDefs(program, owner, provider);
  });
});
