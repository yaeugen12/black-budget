# Bringing Phase A Online — Arcium Runbook

Step-by-step from "fresh machine" to "Phase A live on Arcium devnet".

Estimated time: **3-5 days of focused work** (Anchor 0.32 upgrade is the slow part).

> All commands assume you're in the repo root unless prefixed with `cd <dir>`.

---

## Prerequisites (one-time)

```bash
# Rust + Solana
rustup install stable && rustup default stable
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"   # Agave (Solana 2.x)

# Anchor 0.32 (Arcium requires this exact version)
cargo install --git https://github.com/coral-xyz/anchor avm --force
avm install 0.32.1
avm use 0.32.1
anchor --version   # should print "anchor-cli 0.32.1"

# Solana devnet wallet
solana config set --url devnet
solana-keygen new --no-bip39-passphrase           # if you don't have one
solana airdrop 5                                  # may need to repeat
solana balance

# Node 20 + pnpm
nvm install 20 && nvm use 20
npm install -g pnpm
```

## Install the Arcium toolchain

```bash
# arcup is the Arcium version manager (think nvm but for arcium-cli + node)
curl -fsSL https://docs.arcium.com/install.sh | sh

# Add ~/.arcium/bin to PATH (the installer prints the exact line)
export PATH="$HOME/.arcium/bin:$PATH"

arcup install latest        # pulls the latest arcium toolchain
arcup use latest
arcium --version
```

Verify Docker is running (Arcium uses Docker to spawn MXE node containers locally):

```bash
docker info | grep "Server Version"
```

If Docker is not installed: install Docker Desktop and re-run the verification.

---

## Step 1 — Build & test localnet

```bash
cd arcium-integration/
pnpm install                     # workspace install
arcium build                     # compiles circuits + program
```

Expected output:
- `target/deploy/confidential_policy.so` (the Anchor program)
- `target/types/confidential_policy.ts` (TS types)
- `target/idl/confidential_policy.json`
- `target/encrypted-ixs/*.bin` (compiled MPC circuits)

If build fails:
- **`arcis 0.9.6` not found**: pin `arcis = "0.9.6"` and check `~/.cargo/registry` for crate availability. Run `cargo update -p arcis` to fetch.
- **`anchor-lang` version mismatch**: ensure `avm use 0.32.1` is active and `Cargo.toml` pins `anchor-lang = "0.32.1"`.
- **`docker not running`**: start Docker before running `arcium build`.

Generate a fresh program keypair, sync IDs:

```bash
solana-keygen new -o target/deploy/confidential_policy-keypair.json --no-bip39-passphrase
anchor keys sync
```

Run on Arcium localnet (spawns 2-node MPC cluster in Docker):

```bash
arcium test --skip-build
```

The localnet test (in `tests/`, will need to be written — see Step 5) exercises:
1. Init all 5 comp defs
2. Init company policy with sample limits
3. Evaluate a payment that auto-approves (< $5k)
4. Evaluate a payment requiring 1 signer ($8k)
5. Evaluate a payment that exceeds burn cap
6. Commit executed spend
7. Reset monthly spend
8. Update policy limits

---

## Step 2 — Deploy to devnet

```bash
solana config set --url devnet
solana balance                      # need ≥ 5 SOL for deploy
solana airdrop 5                    # if low

# Initialise the MXE on Arcium devnet (one-time, gives you a cluster offset)
arcium init-mxe --cluster devnet

# This prints something like:
#   MXE created on devnet
#   Cluster offset: 14
# Save this offset.
```

Paste the cluster offset into `arcium-integration/Arcium.toml`:

```toml
[clusters.devnet]
offset = 14
```

And paste the program ID (from `anchor keys list`) into `arcium-integration/Anchor.toml` under `[programs.devnet]`.

Deploy:

```bash
arcium deploy --cluster devnet
```

This runs `anchor deploy` then registers the encrypted-ixs binaries against the MXE cluster. On success, the printed `confidential_policy` program ID is what `client/src/arcium-client.ts` will reference at runtime.

Initialise the 5 computation definitions (one-time, must run AFTER deploy):

```bash
arcium test --cluster devnet --skip-build --test-pattern "init_comp_defs"
```

(Or hand-craft a small init script — see `arcium-integration/scripts/init-comp-defs.ts` once you write it.)

---

## Step 3 — Verify on devnet

Run a single-payment integration test:

```bash
arcium test --cluster devnet --skip-build --test-pattern "happy_path"
```

Expected behavior:
1. `initCompanyPolicyConfidential({...})` returns within ~10s
2. `createPaymentConfidential({ amount: 8000_000_000 })` returns within ~15s with `decision.requiredApprovals === 1`
3. The decision PDA is readable + the encrypted_decision array is non-zero
4. `commitPaymentSpendConfidential({ projectedMonthlySpent: 8000_000_000 })` succeeds

If any step times out:
- Check the MXE cluster is healthy: `arcium cluster-status --cluster devnet`
- Check Solana RPC: `solana epoch-info`
- Increase `awaitComputationFinalization` timeout in client wrapper

---

## Step 4 — Wire into the Black Budget frontend (`app/`)

This is the integration step. Three small additions:

1. **Install the Arcium client SDK in the app workspace**:
   ```bash
   cd app/
   pnpm add @arcium-hq/client tweetnacl
   ```

2. **Re-export the wrapper from `app/src/lib/`**:
   ```ts
   // app/src/lib/arcium.ts
   export * from "../../../arcium-integration/client/src/arcium-client";
   ```

   Add the path to `app/tsconfig.json` `paths`:
   ```json
   { "paths": { "@arcium-client": ["../arcium-integration/client/src/arcium-client"] } }
   ```

3. **Modify `app/src/lib/program.ts::createPayment`** to call both programs sequentially:
   ```ts
   import { createPaymentConfidential } from "@arcium-client";

   export async function createPayment(...) {
     // 1. Get encrypted decision from Arcium MXE
     const { decision, decisionPda } = await createPaymentConfidential({...});

     // 2. Create the actual on-chain Payment record on black_budget program,
     //    passing the decision PDA so approve_payment etc. read from it.
     const sig = await program.methods.createPayment(
       ...,
       decisionPda,        // new arg
     ).rpc(...);

     return { sig, decision };
   }
   ```

4. **Add a feature flag** in the UI so users can opt into confidential mode at company creation:
   ```tsx
   // app/src/components/onboarding.tsx
   <label>
     <input type="checkbox" checked={confidential} onChange={...} />
     Enable confidential policy evaluation (Arcium MPC)
   </label>
   ```

---

## Step 5 — Tests to write (high priority before mainnet)

Stub the following test files in `arcium-integration/tests/`:

1. `tests/init_comp_defs.ts` — one-time init script
2. `tests/happy_path.ts` — full lifecycle for a single payment
3. `tests/burn_cap.ts` — payment that would exceed burn cap returns required_approvals=255
4. `tests/dual_approval.ts` — payment ≥ dual threshold returns required_approvals=2
5. `tests/auto_approve.ts` — payment ≤ auto limit returns required_approvals=0
6. `tests/replay_protection.ts` — same projected_monthly_spent submitted twice doesn't double-count
7. `tests/concurrent_payments.ts` — 5 simultaneous evaluate_policy calls all resolve correctly

Use `arcium test` (which wraps `anchor test` + spins up localnet MPC cluster).

---

## Common pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| `Error: MXE pubkey not available yet` | MXE init not finalised | Wait 30s, retry. Client wrapper already has 5-retry loop. |
| `AbortedComputation` in callback | MPC cluster rejected the input shape | Check `arcium logs --cluster devnet`. Often: wrong ciphertext length, wrong nonce. |
| `ConstraintAddress` on `mxe_account` | Program ID drift after redeploy | Re-run `anchor keys sync` and redeploy. |
| `InsufficientFunds` on `queue_computation` | Computation fee pool not topped up | `arcium fund-pool --amount 0.1 --cluster devnet` |
| `Error: cluster not set` | `Arcium.toml` missing `offset` for devnet | Re-paste the offset from `arcium init-mxe` output. |
| `Already initialised` on comp def | Comp def init is idempotent at the protocol level but the Anchor instruction reverts | Skip; this is expected on re-run. |
| Decryption returns garbage | Wallet signed a different message → different x25519 key | Ensure `ENCRYPTION_KEY_MESSAGE` constant matches everywhere. |
| TS error: cannot find `@arcium-hq/client` | SDK not installed in app workspace | `cd app && pnpm add @arcium-hq/client` |

---

## Mainnet checklist (when ready)

Don't deploy to Arcium mainnet alpha until:

- [ ] All 7 tests above pass on devnet
- [ ] Fork-test the cross-program flow (black_budget + confidential_policy together) with realistic invoice volumes (50+ payments/month)
- [ ] Benchmark p95 latency for `evaluate_policy` against your target UX budget (recommend < 30s)
- [ ] Run a fresh security review covering: the Arcis circuit logic, the callback verification, the cross-program account orchestration
- [ ] Decide on cluster strategy: shared mainnet cluster (cheaper, shared trust) vs permissioned (your own MXE, full SLA control)
- [ ] Top up the Arcium fee pool with budget for projected first-month volume
- [ ] Set up monitoring on `awaitComputationFinalization` timeouts → alert on > 1% failure rate

Then:

```bash
solana config set --url mainnet-beta
arcium init-mxe --cluster mainnet
# Paste offset into Arcium.toml
arcium deploy --cluster mainnet
```

---

## Where to ask for help

- **Arcium docs**: https://docs.arcium.com
- **Arcium examples**: https://github.com/arcium-hq/examples
- **Arcium Discord**: https://discord.gg/arcium (look for `#dev-help`)
- **Black Budget repo**: open an issue with the `[arcium]` tag

---

**Maintained**: 2026-05-11. Update when Arcium ships breaking SDK versions, when CSPL launches, or when the mainnet cutover happens.
