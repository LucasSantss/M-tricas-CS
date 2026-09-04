import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Termômetro Operacional",
  description: "Comparativo semanal de TME, TMA, TMR, CSAT e volume por departamento",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
