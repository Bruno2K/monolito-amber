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
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} {...input} />
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={props.type ?? "submit"} {...props} />;
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
