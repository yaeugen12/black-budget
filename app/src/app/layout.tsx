import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { Toaster } from "sonner";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Black Budget — Private Finance OS",
  description: "The private finance operating system for internet-native companies. Invoices, payroll, treasury, and approvals on Solana with selective disclosure.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`} suppressHydrationWarning>
      <body className="min-h-full bg-background text-foreground">
        <Providers>
          <div className="flex h-screen overflow-hidden">
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
