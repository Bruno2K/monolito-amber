import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Amber — Identity & Organizations",
  description: "Modular Monolith identity shell for Amber coordination and governance",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <main>
          <nav aria-label="Identity shell">
            <a href="/">Shell</a>
            <a href="/sign-in">Sign in</a>
            <a href="/invite/accept">Accept invite</a>
            <a href="/password/reset">Reset password</a>
            <a href="/mfa/enroll">Enroll MFA</a>
            <a href="/org-switch">Org switcher</a>
          </nav>
          {children}
        </main>
      </body>
    </html>
  );
}
