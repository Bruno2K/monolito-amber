import { FIGMA_MESSAGE_NODES, stateCopy, type MessagingSurface } from "../../lib/messaging";

export function MessagingState({
  state,
  detail,
  onRetry,
  level = "h1",
}: {
  state: Exclude<MessagingSurface, "ready">;
  detail?: string;
  onRetry?: () => void;
  level?: "h1" | "h2";
}) {
  const copy = stateCopy(state);
  const Heading = level;
  return (
    <section
      className="state-screen messages-state"
      data-state={state}
      data-node-id={FIGMA_MESSAGE_NODES.states}
      aria-live={state === "loading" ? "polite" : "assertive"}
      aria-busy={state === "loading" ? true : undefined}
    >
      {state === "loading" ? (
        <div className="messages-skel" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : null}
      <Heading>{copy.title}</Heading>
      <p>{detail ?? copy.detail}</p>
      {onRetry ? (
        <p>
          <button type="button" className="btn" onClick={onRetry}>
            Tentar novamente
          </button>
        </p>
      ) : null}
    </section>
  );
}
