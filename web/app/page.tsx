export default function HomePage() {
  return (
    <>
      <p className="shell-banner">PF-1.0 foundation shell — not a product screen</p>
      <h1>Amber</h1>
      <p>
        Neutral application shell for the Modular Monolith bootstrap. Product surfaces
        (Documents, Coordination, Planning, Gates, dashboards) are out of scope until their
        UX specifications are approved.
      </p>
      <p>
        API health: <code>GET /api/v1/health</code>. Org-switch is a tenancy stub only.
      </p>
    </>
  );
}
