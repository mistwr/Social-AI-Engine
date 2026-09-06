import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Social AI Engine",
  description: "Automação social multiempresa com IA, Meta e CRM integrations.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-PT">
      <body>{children}</body>
    </html>
  );
}
