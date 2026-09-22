const BINDING_SPECS = [
  ["System Spec + Final Reconciliation", "https://app.notion.com/p/3e2678e54c8d811ab279e72355d70204"],
  ["0.1 Domain Model", "https://app.notion.com/p/3e2678e54c8d81d0b005cefa8156b0b6"],
  ["0.2 Identity / Tenancy", "https://app.notion.com/p/3e2678e54c8d81a4b99bca837516b5b8"],
  ["0.2A Identity / AuthZ baseline", "https://app.notion.com/p/3e3678e54c8d819fa690f4ade50c4e10"],
  ["0.3 Revision Lifecycle", "https://app.notion.com/p/3e3678e54c8d81a48d34dad1b6b60fe1"],
  ["0.4 Coordination", "https://app.notion.com/p/3e3678e54c8d8125ab38eb359e0586c2"],
  ["0.5 Planning / Gates", "https://app.notion.com/p/3e3678e54c8d8134afbccdb1c1183ec3"],
  ["0.6 Persistence", "https://app.notion.com/p/3e3678e54c8d81fb9d8cf5687a762093"],
  ["0.7 API / Observability", "https://app.notion.com/p/3e3678e54c8d815388d4f0d50b8c70aa"],
  ["0.8 Architecture / Roadmap", "https://app.notion.com/p/3e3678e54c8d81ca9c77dd2ad5439b30"],
] as const;

export default function HomePage() {
  return (
    <>
      <h1>Amber Platform Foundation</h1>
      <p>
        Canonical product monorepo <code>Bruno2K/monolito-amber</code>. This slice is{" "}
        <strong>PF-1.0 foundation only</strong> — no Documents, Coordination, Planning, or Gate
        workflows.
      </p>
      <div className="card">
        <h2>Invariants already encoded</h2>
        <ul>
          <li>Session-bound active Organization; client orgId/projectId never authoritative</li>
          <li>Closed 0.2A permission catalog — no <code>gate.override</code></li>
          <li>Formal Exception is the sole Gate bypass</li>
          <li>Audit insert-only; file <code>scan_status</code> fail-closed</li>
        </ul>
      </div>
      <div className="card">
        <h2>Binding specifications</h2>
        <ul>
          {BINDING_SPECS.map(([label, href]) => (
            <li key={href}>
              <a href={href}>{label}</a>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
