-- Black Budget — Supabase Schema
-- Run this in Supabase SQL Editor to create the tables

-- Invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  vendor TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  due_date TEXT,
  category TEXT NOT NULL,
  line_items JSONB DEFAULT '[]',
  risk_flags JSONB DEFAULT '[]',
  confidence NUMERIC(3, 2) DEFAULT 0,
  policy_action TEXT NOT NULL,
  policy_reason TEXT,
  status TEXT NOT NULL DEFAULT 'parsed',
  payment_tx TEXT,
  wallet_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vendors table (aggregated from invoices)
CREATE TABLE IF NOT EXISTS vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  wallet_address TEXT,
  is_verified BOOLEAN DEFAULT FALSE,
  total_invoices INTEGER DEFAULT 0,
  total_spent NUMERIC(12, 2) DEFAULT 0,
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  company_wallet TEXT
);

-- Proof records (anchored on-chain)
CREATE TABLE IF NOT EXISTS proof_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_wallet TEXT NOT NULL,
  proof_type TEXT NOT NULL, -- 'investor', 'auditor', 'regulator'
  merkle_root TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  payment_count INTEGER DEFAULT 0,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  on_chain_tx TEXT,
  exported_json JSONB
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_invoices_wallet ON invoices (wallet_address);
CREATE INDEX IF NOT EXISTS idx_invoices_vendor ON invoices (vendor);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices (status);
CREATE INDEX IF NOT EXISTS idx_vendors_company ON vendors (company_wallet);
CREATE INDEX IF NOT EXISTS idx_proofs_company ON proof_records (company_wallet);

-- Row Level Security (enable after setting up auth)
-- ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE proof_records ENABLE ROW LEVEL SECURITY;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER invoices_updated_at
  BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
