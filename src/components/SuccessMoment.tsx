import type { CSSProperties } from "react";
export function SuccessMoment({ message }: { message: string }) {
  return (
    <div className="success-moment" role="status">
      <span className="success-burst" aria-hidden="true">
        <span className="success-tick">✓</span>
        {Array.from({ length: 8 }, (_, i) => (
          <i key={i} style={{ "--n": i } as CSSProperties} />
        ))}
      </span>
      <span>{message}</span>
    </div>
  );
}
