// @vitest-environment node
import { describe, it, expect } from "vitest";
import { createHash } from "crypto";
import { PublicKey } from "@solana/web3.js";

// Import IDL
const { IDL } = await import("../src/lib/idl");

describe("IDL Integrity", () => {
  it("has correct program address", () => {
    expect(IDL.address).toBe("3xgDaaFKmfGHBxhLfN16Eryyaact9fZ6tm6xypERpg9k");
    // Verify it's a valid base58 public key
    expect(() => new PublicKey(IDL.address)).not.toThrow();
  });

  it("has all 10 instructions", () => {
    const names = IDL.instructions.map((i) => i.name);
    expect(names).toContain("initialize_company");
    expect(names).toContain("add_member");
    expect(names).toContain("set_policies");
    expect(names).toContain("create_payment");
    expect(names).toContain("approve_payment");
    expect(names).toContain("reject_payment");
    expect(names).toContain("execute_payment");
    expect(names).toContain("remove_member");
    expect(names).toContain("record_proof");
    expect(names).toContain("record_compliance_proof");
    expect(IDL.instructions.length).toBe(10);
  });

  it("has correct discriminators (SHA-256 of global:name)", () => {
    for (const ix of IDL.instructions) {
      const expected = Array.from(
        createHash("sha256").update(`global:${ix.name}`).digest().slice(0, 8)
      );
      expect(ix.discriminator).toEqual(expected);
    }
  });

  it("has all 5 account types", () => {
    const names = IDL.accounts.map((a) => a.name);
    expect(names).toContain("Company");
    expect(names).toContain("ComplianceProof");
    expect(names).toContain("Member");
    expect(names).toContain("PaymentRequest");
    expect(names).toContain("ProofRecord");
  });

  it("has correct account discriminators (SHA-256 of account:Name)", () => {
    for (const acc of IDL.accounts) {
      const expected = Array.from(
        createHash("sha256").update(`account:${acc.name}`).digest().slice(0, 8)
      );
      expect(acc.discriminator).toEqual(expected);
    }
  });

  it("every defined type reference resolves to a type definition", () => {
    const typeNames = new Set(IDL.types.map((t) => t.name));

    function checkDefined(obj: unknown, path: string) {
      if (obj && typeof obj === "object") {
        const o = obj as Record<string, unknown>;
        if ("defined" in o && typeof o.defined === "object" && o.defined !== null) {
          const name = (o.defined as { name: string }).name;
          expect(typeNames.has(name), `${path}: type "${name}" not found in IDL types`).toBe(true);
        }
        for (const [key, val] of Object.entries(o)) {
          if (typeof val === "object" && val !== null) {
            checkDefined(val, `${path}.${key}`);
          }
        }
      }
    }

    for (const ix of IDL.instructions) {
      checkDefined(ix, `instruction:${ix.name}`);
    }
    for (const t of IDL.types) {
      checkDefined(t, `type:${t.name}`);
    }
  });

  it("initialize_company has all required accounts", () => {
    const ix = IDL.instructions.find((i) => i.name === "initialize_company")!;
    const accNames = ix.accounts.map((a) => a.name);
    expect(accNames).toContain("authority");
    expect(accNames).toContain("company");
    expect(accNames).toContain("vault");
    expect(accNames).toContain("usdc_mint");
    expect(accNames).toContain("founder_member");
    expect(accNames).toContain("token_program");
    expect(accNames).toContain("system_program");
  });

  it("execute_payment has vault and token_program accounts", () => {
    const ix = IDL.instructions.find((i) => i.name === "execute_payment")!;
    const accNames = ix.accounts.map((a) => a.name);
    expect(accNames).toContain("vault");
    expect(accNames).toContain("recipient_token_account");
    expect(accNames).toContain("usdc_mint");
    expect(accNames).toContain("token_program");
  });

  it("PolicyConfig has all 6 fields", () => {
    const pc = IDL.types.find((t) => t.name === "PolicyConfig")!;
    const fields = pc.type.fields.map((f: { name: string }) => f.name);
    expect(fields).toEqual([
      "auto_approve_limit",
      "dual_approve_threshold",
      "monthly_burn_cap",
      "require_vendor_verification",
      "restrict_to_known_recipients",
      "min_runway_months",
    ]);
  });

  it("Role enum has exactly 4 variants", () => {
    const role = IDL.types.find((t) => t.name === "Role")!;
    expect(role.type.variants).toEqual([
      { name: "Owner" },
      { name: "Approver" },
      { name: "Viewer" },
      { name: "Contractor" },
    ]);
  });

  it("PaymentStatus enum has 5 variants", () => {
    const ps = IDL.types.find((t) => t.name === "PaymentStatus")!;
    expect(ps.type.variants.length).toBe(5);
  });
});
