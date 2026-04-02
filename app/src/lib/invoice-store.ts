"use client";

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
}

const STORAGE_KEY = "black-budget-invoices";

export function getInvoices(): StoredInvoice[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveInvoice(invoice: StoredInvoice): void {
  const all = getInvoices();
  all.unshift(invoice); // newest first
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, 50))); // cap at 50
}

export function updateInvoiceStatus(id: string, status: StoredInvoice["status"], paymentTx?: string): void {
  const all = getInvoices();
  const idx = all.findIndex((i) => i.id === id);
  if (idx >= 0) {
    all[idx].status = status;
    if (paymentTx) all[idx].paymentTx = paymentTx;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  }
}

export function getVendors(): { name: string; count: number; totalSpent: number }[] {
  const invoices = getInvoices();
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
