export function Logo({ className = "h-7 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 118 165" className={className} aria-hidden="true">
      <path fill="currentColor" d="M 59.1 39.6 L 78.6 59.1 L 117.6 59.1 L 78.6 20.1 L 59.1 0.6 L 39.5 20.1 L 0.5 59.1 L 39.6 59.1 Z" />
      <path fill="currentColor" d="M 89.1 102.1 L 37.6 102.1 L 37.6 129.6 L 117.6 129.6 L 117.6 65.9 L 89.1 65.9 Z" />
      <path fill="currentColor" d="M 28.6 99.2 L 14.4 85 L 0.1 70.6 L 0.1 163 L 28.6 163 Z" />
    </svg>
  );
}
