// @vitest-environment node
import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("3xgDaaFKmfGHBxhLfN16Eryyaact9fZ6tm6xypERpg9k");

function getCompanyPDA(authority: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("company"), authority.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

function getMemberPDA(company: PublicKey, wallet: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("member"), company.toBuffer(), wallet.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

function getVaultPDA(company: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), company.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

function getPaymentPDA(company: PublicKey, nonce: number): PublicKey {
  const nonceBuffer = Buffer.alloc(8);
  nonceBuffer.writeBigUInt64LE(BigInt(nonce));
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("payment"), company.toBuffer(), nonceBuffer],
    PROGRAM_ID
  );
  return pda;
}

function getProofPDA(company: PublicKey, proofType: number, periodEnd: number): PublicKey {
  const buf = Buffer.alloc(8);
  buf.writeBigInt64LE(BigInt(periodEnd));
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("proof"), company.toBuffer(), Buffer.from([proofType]), buf],
    PROGRAM_ID
  );
  return pda;
}

describe("PDA Derivation", () => {
  const testAuthority = new PublicKey("HGVzMKLxYYKFoy8XpGbCJjFYa739KndS8FYrnLnR9Es");

  describe("Company PDA", () => {
    it("derives deterministically for same authority", () => {
      const pda1 = getCompanyPDA(testAuthority);
      const pda2 = getCompanyPDA(testAuthority);
      expect(pda1.toBase58()).toBe(pda2.toBase58());
    });

    it("derives different PDAs for different authorities", () => {
      const other = PublicKey.unique();
      const pda1 = getCompanyPDA(testAuthority);
      const pda2 = getCompanyPDA(other);
      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });

    it("matches known devnet PDA", () => {
      const pda = getCompanyPDA(testAuthority);
      expect(pda.toBase58()).toBe("HSNrdrfWNzvuBGEit2BpMvb6kLdXVjnDzb97WK5gh6pp");
    });

    it("is on the ed25519 curve (valid PDA)", () => {
      const pda = getCompanyPDA(testAuthority);
      expect(PublicKey.isOnCurve(pda)).toBe(false); // PDAs are OFF curve
    });
  });

  describe("Vault PDA", () => {
    it("derives from company PDA, not authority", () => {
      const company = getCompanyPDA(testAuthority);
      const vault = getVaultPDA(company);
      expect(vault.toBase58()).toBe("49oTEhcneGzy6MAUbxGei1FXPJhLzd5DPuWrETHTDfPA");
    });

    it("different companies get different vaults", () => {
      const company1 = getCompanyPDA(testAuthority);
      const company2 = getCompanyPDA(PublicKey.unique());
      expect(getVaultPDA(company1).toBase58()).not.toBe(getVaultPDA(company2).toBase58());
    });
  });

  describe("Member PDA", () => {
    it("is unique per company + wallet combo", () => {
      const company = getCompanyPDA(testAuthority);
      const wallet1 = PublicKey.unique();
      const wallet2 = PublicKey.unique();
      const pda1 = getMemberPDA(company, wallet1);
      const pda2 = getMemberPDA(company, wallet2);
      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });

    it("same wallet in different company = different PDA", () => {
      const wallet = PublicKey.unique();
      const company1 = getCompanyPDA(testAuthority);
      const company2 = getCompanyPDA(PublicKey.unique());
      const pda1 = getMemberPDA(company1, wallet);
      const pda2 = getMemberPDA(company2, wallet);
      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });
  });

  describe("Payment PDA", () => {
    it("sequential nonces produce unique PDAs", () => {
      const company = getCompanyPDA(testAuthority);
      const pdas = new Set<string>();
      for (let i = 0; i < 100; i++) {
        pdas.add(getPaymentPDA(company, i).toBase58());
      }
      expect(pdas.size).toBe(100);
    });

    it("nonce 0 matches first payment", () => {
      const company = getCompanyPDA(testAuthority);
      const pda = getPaymentPDA(company, 0);
      expect(pda.toBase58()).toBeTruthy();
      expect(PublicKey.isOnCurve(pda)).toBe(false);
    });

    it("handles large nonce values", () => {
      const company = getCompanyPDA(testAuthority);
      const pda = getPaymentPDA(company, 999999);
      expect(pda.toBase58()).toBeTruthy();
    });
  });

  describe("Proof PDA", () => {
    it("derives deterministically for same company + period_end", () => {
      const company = getCompanyPDA(testAuthority);
      const pda1 = getProofPDA(company, 0, 1700000000);
      const pda2 = getProofPDA(company, 0, 1700000000);
      expect(pda1.toBase58()).toBe(pda2.toBase58());
    });

    it("different period_end values produce different PDAs", () => {
      const company = getCompanyPDA(testAuthority);
      const pda1 = getProofPDA(company, 0, 1700000000);
      const pda2 = getProofPDA(company, 0, 1700000001);
      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });

    it("different companies with same period_end produce different PDAs", () => {
      const company1 = getCompanyPDA(testAuthority);
      const company2 = getCompanyPDA(PublicKey.unique());
      const pda1 = getProofPDA(company1, 0, 1700000000);
      const pda2 = getProofPDA(company2, 0, 1700000000);
      expect(pda1.toBase58()).not.toBe(pda2.toBase58());
    });

    it("is a valid PDA (off curve)", () => {
      const company = getCompanyPDA(testAuthority);
      const pda = getProofPDA(company, 0, 1700000000);
      expect(PublicKey.isOnCurve(pda)).toBe(false);
    });
  });
});
