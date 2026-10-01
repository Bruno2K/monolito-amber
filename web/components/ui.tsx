import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Banner({ children }: { children: ReactNode }) {
  return <p className="shell-banner">{children}</p>;
}

export function Field({
  id,
  label,
  hint,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { id: string; label: string; hint?: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} {...input} />
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function Button({ type, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type ?? "submit"} className={className ?? "btn"} {...props} />;
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) {
    return null;
  }
  return (
    <p role="alert" className="error">
      {children}
    </p>
  );
}

export function IdentityFrame({
  title,
  banner,
  children,
}: {
  title: string;
  banner: string;
  children: ReactNode;
}) {
  return (
    <div className="identity-frame">
      <header className="identity-header">
        <span className="brand-mark" aria-hidden="true">
          A
        </span>
        <span className="brand-name">AMBER</span>
        <span className="brand-badge">BIM</span>
      </header>
      <main className="identity-main">
        <Banner>{banner}</Banner>
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}
