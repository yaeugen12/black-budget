"use client";

import { supabase, isSupabaseConfigured } from "./supabase";

export interface StoredInvoice {
  id: string;
  fileName: string;
  vendor: string;
  amount: number;
  currency: string;
  dueDate: string;
  category: string;
  lineItems: { description: string; amount: number }[];
  riskFlags: string[];
  confidence: number;
  policyAction: string;
  policyReason: string;
  createdAt: string;
  status: "parsed" | "submitted" | "paid";
  paymentTx?: string;
  walletAddress?: string;
}

const STORAGE_KEY = "black-budget-invoices";

// ─── LocalStorage fallback ──────────────────────────────────────────

function getLocalInvoices(): StoredInvoice[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocalInvoice(invoice: StoredInvoice): void {
  const all = getLocalInvoices();
  all.unshift(invoice);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, 100)));
}

function updateLocalStatus(id: string, status: StoredInvoice["status"], paymentTx?: string): void {
  const all = getLocalInvoices();
  const idx = all.findIndex((i) => i.id === id);
  if (idx >= 0) {
    all[idx].status = status;
    if (paymentTx) all[idx].paymentTx = paymentTx;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
}

// ─── Supabase storage ───────────────────────────────────────────────

async function getSupabaseInvoices(walletAddress?: string): Promise<StoredInvoice[]> {
  if (!supabase) return [];
  try {
    let query = supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (walletAddress) {
      query = query.eq("wallet_address", walletAddress);
    }
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      fileName: row.file_name,
      vendor: row.vendor,
      amount: row.amount,
      currency: row.currency,
      dueDate: row.due_date,
      category: row.category,
      lineItems: row.line_items || [],
      riskFlags: row.risk_flags || [],
      confidence: row.confidence,
      policyAction: row.policy_action,
      policyReason: row.policy_reason,
      createdAt: row.created_at,
      status: row.status,
      paymentTx: row.payment_tx,
      walletAddress: row.wallet_address,
    }));
  } catch (e) {
    console.warn("Supabase fetch failed, using localStorage:", e);
    return [];
  }
}

async function saveSupabaseInvoice(invoice: StoredInvoice): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("invoices").insert({
      id: invoice.id,
      file_name: invoice.fileName,
      vendor: invoice.vendor,
      amount: invoice.amount,
      currency: invoice.currency,
      due_date: invoice.dueDate,
      category: invoice.category,
      line_items: invoice.lineItems,
      risk_flags: invoice.riskFlags,
      confidence: invoice.confidence,
      policy_action: invoice.policyAction,
      policy_reason: invoice.policyReason,
      created_at: invoice.createdAt,
      status: invoice.status,
      payment_tx: invoice.paymentTx,
      wallet_address: invoice.walletAddress,
    });
  } catch (e) {
    console.warn("Supabase save failed:", e);
  }
}

async function updateSupabaseStatus(id: string, status: StoredInvoice["status"], paymentTx?: string): Promise<void> {
  if (!supabase) return;
  try {
    const update: any = { status };
    if (paymentTx) update.payment_tx = paymentTx;
    await supabase.from("invoices").update(update).eq("id", id);
  } catch (e) {
    console.warn("Supabase update failed:", e);
  }
}

// ─── Public API (dual storage) ──────────────────────────────────────

export async function getInvoices(walletAddress?: string): Promise<StoredInvoice[]> {
  if (isSupabaseConfigured()) {
    const remote = await getSupabaseInvoices(walletAddress);
    if (remote.length > 0) return remote;
  }
  return getLocalInvoices();
}

export function getInvoicesSync(): StoredInvoice[] {
  return getLocalInvoices();
}

export async function saveInvoice(invoice: StoredInvoice): Promise<void> {
  saveLocalInvoice(invoice);
  await saveSupabaseInvoice(invoice);
}

export async function updateInvoiceStatus(id: string, status: StoredInvoice["status"], paymentTx?: string): Promise<void> {
  updateLocalStatus(id, status, paymentTx);
  await updateSupabaseStatus(id, status, paymentTx);
}

export function getVendors(): { name: string; count: number; totalSpent: number }[] {
  const invoices = getLocalInvoices();
  const map = new Map<string, { count: number; totalSpent: number }>();
  for (const inv of invoices) {
    const existing = map.get(inv.vendor) || { count: 0, totalSpent: 0 };
    map.set(inv.vendor, { count: existing.count + 1, totalSpent: existing.totalSpent + inv.amount });
  }
  return Array.from(map.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.totalSpent - a.totalSpent);
}

export function isNewVendor(vendor: string): boolean {
  const vendors = getVendors();
  return !vendors.some((v) => v.name.toLowerCase() === vendor.toLowerCase());
}
