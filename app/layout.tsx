import type { Metadata } from "next";
import "./globals.css";
import { Brand } from "@/components/Brand";

export const metadata: Metadata = {
  title: "InCheck 360 AI Lab",
  description: "Minimal checklist + AI validation environment"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <a href="/" className="topbar-inner"><Brand /></a>
        </header>
        <main className="page-shell">{children}</main>
      </body>
    </html>
  );
}
