/*
 * Never "No results." Always an invitation. See docs/04-design-system.md and
 * docs/05-screens.md ("Cross-cutting states").
 */
export function EmptyState({
  message,
  action,
}: {
  message: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-rule bg-surface p-s5 text-center">
      <p className="text-body text-ink-soft">{message}</p>
      {action && <div className="mt-s4 flex justify-center">{action}</div>}
    </div>
  );
}

/*
 * Loading: a static --sunk block. No skeleton shimmer — shimmer costs frames on
 * cheap Android. See docs/04 (Motion).
 */
export function LoadingBlock({ height = 80 }: { height?: number }) {
  return (
    <div
      aria-busy="true"
      className="rounded-md"
      style={{ height, background: 'var(--sunk)' }}
    />
  );
}

/* Error: what happened + what to do. No apology, no exclamation marks. */
export function ErrorNote({ message }: { message: string }) {
  return (
    <div
      className="rounded-md bg-surface p-s4 text-body text-ink"
      style={{ borderLeft: '2px solid var(--blaze)' }}
      role="alert"
    >
      {message}
    </div>
  );
}
