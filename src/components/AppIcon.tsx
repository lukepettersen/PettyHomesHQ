// The home-screen / browser-tab icon: the white Petty Homes mark on moss (SPEC.md §5 branding).
export const MOSS = "#727755";

export function appIconMarkup(px: number, rounded = false) {
  const h = Math.round(px * 0.56), w = Math.round((h * 118) / 165);
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: MOSS, borderRadius: rounded ? px * 0.22 : 0 }}>
      <svg viewBox="0 0 118 165" width={w} height={h} fill="#ffffff">
        <path d="M 59.1 39.6 L 78.6 59.1 L 117.6 59.1 L 78.6 20.1 L 59.1 0.6 L 39.5 20.1 L 0.5 59.1 L 39.6 59.1 Z" />
        <path d="M 89.1 102.1 L 37.6 102.1 L 37.6 129.6 L 117.6 129.6 L 117.6 65.9 L 89.1 65.9 Z" />
        <path d="M 28.6 99.2 L 14.4 85 L 0.1 70.6 L 0.1 163 L 28.6 163 Z" />
        <path d="M 19.1 80.4 L 33.1 94.4 L 80.6 94.4 L 80.6 65.9 L 4.7 65.9 Z" />
      </svg>
    </div>
  );
}
