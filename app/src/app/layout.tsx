import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "sonner";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://black-budget.vercel.app";
const TITLE = "Black Budget — Private treasury on Solana";
const DESCRIPTION =
  "The private finance operating system for internet-native companies. Invoices, payroll, treasury policies, and approvals on Solana with selective disclosure proofs.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s — Black Budget" },
  description: DESCRIPTION,
  applicationName: "Black Budget",
  keywords: [
    "Solana",
    "Token-2022",
    "treasury",
    "private finance",
    "selective disclosure",
    "confidential transfers",
    "compliance",
    "invoice",
    "payroll",
    "DAO treasury",
    "Colosseum Frontier",
  ],
  authors: [{ name: "Black Budget" }],
  openGraph: {
    type: "website",
    siteName: "Black Budget",
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
  category: "finance",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`} suppressHydrationWarning>
      <body className="min-h-full bg-background text-foreground">
        <Providers>
          <div className="flex h-dvh min-h-screen overflow-hidden">
            <AppShell>{children}</AppShell>
          </div>
          <Toaster
            theme="dark"
            position="bottom-right"
            toastOptions={{
              style: { background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
