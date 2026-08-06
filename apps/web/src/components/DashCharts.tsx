type Slice = { label: string; value: number; color: string };

/**
 * Donut-Diagramm aus Wertescheiben (reine SVG, ohne Chart-Lib).
 */
export function DonutChart({
  slices,
  size = 168,
  thickness = 22,
  centerLabel,
  centerValue,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="dash-donut" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(148,163,184,0.12)"
          strokeWidth={thickness}
        />
        {slices.map((slice) => {
          const len = (Math.max(0, slice.value) / total) * c;
          const el = (
            <circle
              key={slice.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={slice.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="dash-donut-center">
        {centerValue != null ? <strong>{centerValue}</strong> : null}
        {centerLabel ? <span>{centerLabel}</span> : null}
      </div>
    </div>
  );
}

/**
 * Horizontale Balken für Verteilungen.
 */
export function HBarChart({
  items,
  max,
}: {
  items: { label: string; value: number; color: string; href?: string }[];
  max?: number;
}) {
  const peak = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="dash-hbar">
      {items.map((item) => (
        <li key={item.label}>
          <div className="dash-hbar-meta">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
          <div className="dash-hbar-track" aria-hidden>
            <i style={{ width: `${(item.value / peak) * 100}%`, background: item.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * Einfaches Säulendiagramm (z. B. Termine der Woche).
 */
export function ColumnChart({
  columns,
}: {
  columns: { label: string; value: number; active?: boolean; tone?: string }[];
}) {
  const peak = Math.max(1, ...columns.map((c) => c.value));
  return (
    <div className="dash-cols" role="img" aria-label="Wochenverlauf">
      {columns.map((col) => (
        <div
          key={col.label}
          className={`dash-col${col.active ? " is-active" : ""}${col.value === 0 ? " is-empty" : ""}`}
        >
          <span className="dash-col-value">{col.value || ""}</span>
          <div className="dash-col-bar-wrap">
            <div
              className="dash-col-bar"
              style={{
                height: `${Math.max(col.value ? 12 : 4, (col.value / peak) * 100)}%`,
                background: col.tone || undefined,
              }}
            />
          </div>
          <span className="dash-col-label">{col.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Legende zu Diagramm-Scheiben.
 */
export function ChartLegend({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  return (
    <ul className="dash-legend">
      {slices.map((s) => (
        <li key={s.label}>
          <i style={{ background: s.color }} />
          <span>{s.label}</span>
          <em>
            {s.value}
            <small>{Math.round((s.value / total) * 100)}%</small>
          </em>
        </li>
      ))}
    </ul>
  );
}
