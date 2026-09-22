import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Amber — Platform Foundation",
  description: "Modular Monolith foundation for Amber coordination and governance",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>
          <nav>
            <a href="/">Foundation</a>
            <a href="/org-switch">Org switch stub</a>
          </nav>
          {children}
        </main>
      </body>
    </html>
  );
}
