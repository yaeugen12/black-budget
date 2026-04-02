// Black Budget IDL — Anchor 0.30 spec format
// Program deployed on devnet: 3xgDaaFKmfGHBxhLfN16Eryyaact9fZ6tm6xypERpg9k

export const IDL = {
  address: "3xgDaaFKmfGHBxhLfN16Eryyaact9fZ6tm6xypERpg9k",
  metadata: { name: "black_budget", version: "0.1.0", spec: "0.1.0" },
  instructions: [
    {
      name: "initialize_company",
      discriminator: [75,156,55,94,184,64,58,30],
      accounts: [
        { name: "authority", writable: true, signer: true },
        { name: "company", writable: true, pda: { seeds: [{ kind: "const", value: [99,111,109,112,97,110,121] }, { kind: "account", path: "authority" }] } },
        { name: "vault", writable: true },
        { name: "usdc_mint" },
        { name: "founder_member", writable: true },
        { name: "token_program" },
        { name: "system_program", address: "11111111111111111111111111111111" },
      ],
      args: [{ name: "name", type: "string" }],
    },
    {
      name: "add_member",
      discriminator: [13,116,123,130,126,198,57,34],
      accounts: [
        { name: "authority", writable: true, signer: true },
        { name: "company", writable: true },
        { name: "authority_member" },
        { name: "new_member_wallet" },
        { name: "member", writable: true },
        { name: "system_program", address: "11111111111111111111111111111111" },
      ],
      args: [
        { name: "role", type: { defined: { name: "Role" } } },
        { name: "label", type: "string" },
      ],
    },
    {
      name: "set_policies",
      discriminator: [87,55,15,198,84,223,113,39],
      accounts: [
        { name: "authority", signer: true },
        { name: "company", writable: true },
        { name: "authority_member" },
      ],
      args: [{ name: "policy", type: { defined: { name: "PolicyConfig" } } }],
    },
    {
      name: "create_payment",
      discriminator: [28,81,85,253,7,223,154,42],
      accounts: [
        { name: "requester", writable: true, signer: true },
        { name: "company", writable: true },
        { name: "requester_member" },
        { name: "recipient" },
        { name: "payment", writable: true },
        { name: "system_program", address: "11111111111111111111111111111111" },
      ],
      args: [
        { name: "amount", type: "u64" },
        { name: "category", type: { defined: { name: "PaymentCategory" } } },
        { name: "description_hash", type: { array: ["u8", 32] } },
        { name: "memo", type: "string" },
        { name: "risk_score", type: "u8" },
      ],
    },
    {
      name: "approve_payment",
      discriminator: [21,123,195,139,107,141,34,187],
      accounts: [
        { name: "approver", signer: true },
        { name: "company" },
        { name: "approver_member" },
        { name: "payment", writable: true },
      ],
      args: [],
    },
    {
      name: "reject_payment",
      discriminator: [199,215,82,136,197,236,68,26],
      accounts: [
        { name: "rejector", signer: true },
        { name: "company" },
        { name: "rejector_member" },
        { name: "payment", writable: true },
      ],
      args: [],
    },
    {
      name: "execute_payment",
      discriminator: [86,4,7,7,120,139,232,139],
      accounts: [
        { name: "executor", writable: true, signer: true },
        { name: "company", writable: true },
        { name: "executor_member" },
        { name: "payment", writable: true },
        { name: "vault", writable: true },
        { name: "recipient_token_account", writable: true },
        { name: "usdc_mint" },
        { name: "token_program" },
      ],
      args: [],
    },
    {
      name: "record_proof",
      discriminator: [144,172,144,35,124,170,93,80],
      accounts: [
        { name: "authority", writable: true, signer: true },
        { name: "company" },
        { name: "member" },
        { name: "proof_record", writable: true },
        { name: "clock" },
        { name: "system_program", address: "11111111111111111111111111111111" },
      ],
      args: [
        { name: "proof_type", type: { defined: { name: "ProofType" } } },
        { name: "merkle_root", type: { array: ["u8", 32] } },
        { name: "payment_count", type: "u32" },
        { name: "period_start", type: "i64" },
        { name: "period_end", type: "i64" },
      ],
    },
  ],
  accounts: [
    { name: "Company", discriminator: [32,212,52,137,90,7,206,183] },
    { name: "Member", discriminator: [54,19,162,21,29,166,17,198] },
    { name: "PaymentRequest", discriminator: [27,20,202,96,101,242,124,69] },
    { name: "ProofRecord", discriminator: [237,59,155,172,204,117,87,44] },
  ],
  types: [
    {
      name: "Company",
      type: {
        kind: "struct",
        fields: [
          { name: "authority", type: "pubkey" },
          { name: "name", type: "string" },
          { name: "vault", type: "pubkey" },
          { name: "policy", type: { defined: { name: "PolicyConfig" } } },
          { name: "member_count", type: "u8" },
          { name: "payment_nonce", type: "u64" },
          { name: "total_spent", type: "u64" },
          { name: "monthly_spent", type: "u64" },
          { name: "current_month", type: "u8" },
          { name: "created_at", type: "i64" },
          { name: "bump", type: "u8" },
        ],
      },
    },
    {
      name: "Member",
      type: {
        kind: "struct",
        fields: [
          { name: "company", type: "pubkey" },
          { name: "wallet", type: "pubkey" },
          { name: "role", type: { defined: { name: "Role" } } },
          { name: "label", type: "string" },
          { name: "added_at", type: "i64" },
          { name: "is_active", type: "bool" },
          { name: "bump", type: "u8" },
        ],
      },
    },
    {
      name: "PaymentRequest",
      type: {
        kind: "struct",
        fields: [
          { name: "company", type: "pubkey" },
          { name: "requester", type: "pubkey" },
          { name: "recipient", type: "pubkey" },
          { name: "amount", type: "u64" },
          { name: "category", type: { defined: { name: "PaymentCategory" } } },
          { name: "description_hash", type: { array: ["u8", 32] } },
          { name: "memo", type: "string" },
          { name: "status", type: { defined: { name: "PaymentStatus" } } },
          { name: "approvals", type: { vec: "pubkey" } },
          { name: "required_approvals", type: "u8" },
          { name: "payment_id", type: "u64" },
          { name: "risk_score", type: "u8" },
          { name: "created_at", type: "i64" },
          { name: "executed_at", type: "i64" },
          { name: "bump", type: "u8" },
        ],
      },
    },
    {
      name: "ProofRecord",
      type: {
        kind: "struct",
        fields: [
          { name: "company", type: "pubkey" },
          { name: "generated_by", type: "pubkey" },
          { name: "proof_type", type: { defined: { name: "ProofType" } } },
          { name: "merkle_root", type: { array: ["u8", 32] } },
          { name: "period_start", type: "i64" },
          { name: "period_end", type: "i64" },
          { name: "payment_count", type: "u32" },
          { name: "generated_at", type: "i64" },
          { name: "bump", type: "u8" },
        ],
      },
    },
    {
      name: "PolicyConfig",
      type: {
        kind: "struct",
        fields: [
          { name: "auto_approve_limit", type: "u64" },
          { name: "dual_approve_threshold", type: "u64" },
          { name: "monthly_burn_cap", type: "u64" },
          { name: "require_vendor_verification", type: "bool" },
          { name: "restrict_to_known_recipients", type: "bool" },
          { name: "min_runway_months", type: "u8" },
        ],
      },
    },
    {
      name: "Role",
      type: {
        kind: "enum",
        variants: [
          { name: "Owner" },
          { name: "Approver" },
          { name: "Viewer" },
          { name: "Contractor" },
        ],
      },
    },
    {
      name: "PaymentCategory",
      type: {
        kind: "enum",
        variants: [
          { name: "Payroll" },
          { name: "Vendor" },
          { name: "Subscription" },
          { name: "Contractor" },
          { name: "Reimbursement" },
          { name: "Other" },
        ],
      },
    },
    {
      name: "PaymentStatus",
      type: {
        kind: "enum",
        variants: [
          { name: "Pending" },
          { name: "Approved" },
          { name: "Executed" },
          { name: "Rejected" },
          { name: "Cancelled" },
        ],
      },
    },
    {
      name: "ProofType",
      type: {
        kind: "enum",
        variants: [
          { name: "Investor" },
          { name: "Auditor" },
          { name: "Regulator" },
        ],
      },
    },
  ],
  errors: [],
} as const;

export const PROGRAM_ID = "3xgDaaFKmfGHBxhLfN16Eryyaact9fZ6tm6xypERpg9k";
