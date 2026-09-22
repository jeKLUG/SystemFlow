import { useId, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";

type Slice = { label: string; value: number; color: string };

/**
 * Schlankes Donut-Diagramm aus Wertescheiben (reine SVG, ohne Chart-Lib).
 */
export function DonutChart({
  slices,
  size = 118,
  thickness = 9,
  centerLabel,
  centerValue,
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
}) {
  const uid = useId().replace(/:/g, "");
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const active = slices.filter((s) => s.value > 0);
  const gap = active.length > 1 ? Math.min(14, c * 0.028) : 0;
  let offset = gap / 2;

  return (
    <div className="dash-donut" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        <defs>
          <filter id={`dash-donut-glow-${uid}`} x="-25%" y="-25%" width="150%" height="150%">
            <feGaussianBlur stdDeviation="1.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(148,163,184,0.12)"
          strokeWidth={thickness}
        />
        {slices.map((slice) => {
          if (slice.value <= 0) return null;
          const raw = (slice.value / total) * c;
          const len = Math.max(0.01, raw - gap);
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
              strokeLinecap="round"
              filter={`url(#dash-donut-glow-${uid})`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += raw;
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
 * Schlanke horizontale Balken für Verteilungen.
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
      {items.map((item) => {
        const pct = item.value <= 0 ? 0 : Math.max(4, (item.value / peak) * 100);
        const row = (
          <>
            <div className="dash-hbar-meta">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
            <div className="dash-hbar-track" aria-hidden>
              <i
                className={item.value <= 0 ? "is-zero" : undefined}
                style={{
                  width: `${pct}%`,
                  background: item.value <= 0 ? "transparent" : item.color,
                }}
              />
            </div>
          </>
        );
        return (
          <li key={item.label}>
            {item.href ? (
              <Link className="dash-hbar-link" to={item.href}>
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Schlankes Säulendiagramm (z. B. Termine der Woche).
 */
export function ColumnChart({
  columns,
}: {
  columns: { label: string; value: number; active?: boolean; tone?: string }[];
}) {
  const peak = Math.max(1, ...columns.map((c) => c.value));
  const hasAny = columns.some((c) => c.value > 0);

  return (
    <div className={`dash-cols${hasAny ? "" : " is-empty-week"}`} role="img" aria-label="Wochenverlauf">
      {columns.map((col) => (
        <div
          key={col.label}
          className={`dash-col${col.active ? " is-active" : ""}${col.value === 0 ? " is-empty" : ""}`}
        >
          <span className="dash-col-value">{col.value > 0 ? col.value : ""}</span>
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
 * Legende zu Diagramm-Scheiben – Wert und Anteil klar getrennt.
 */
export function ChartLegend({ slices }: { slices: Slice[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const showPct = slices.length > 1;
  return (
    <ul className="dash-legend">
      {slices.map((s) => (
        <li key={s.label}>
          <i style={{ background: s.color }} aria-hidden />
          <span className="dash-legend-label">{s.label}</span>
          <span className="dash-legend-stats">
            <strong>{s.value}</strong>
            {showPct ? <small>{Math.round((s.value / total) * 100)}%</small> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

type LinePoint = { t: number; v: number | null };

const HOUR = 3600_000;
const DAY = 86400_000;

function formatChartTick(t: number, span: number): string {
  const d = new Date(t);
  if (span <= 36 * HOUR) {
    return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }
  if (span <= 8 * DAY) {
    return d.toLocaleString("de-DE", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit" });
}

function formatChartTime(t: number, span: number): string {
  const d = new Date(t);
  const time = d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  if (span <= 36 * HOUR) return time;
  const date = d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  return `${date} ${time}`;
}

function timeStep(span: number): number {
  if (span <= 4 * HOUR) return 30 * 60_000;
  if (span <= 12 * HOUR) return HOUR;
  if (span <= 36 * HOUR) return 4 * HOUR;
  if (span <= 3 * DAY) return 12 * HOUR;
  if (span <= 10 * DAY) return DAY;
  if (span <= 20 * DAY) return 2 * DAY;
  return 7 * DAY;
}

function timeTicks(tMin: number, tMax: number): number[] {
  const span = Math.max(1, tMax - tMin);
  const step = timeStep(span);
  const out: number[] = [];
  const start = new Date(tMin);
  if (step >= DAY) {
    start.setHours(0, 0, 0, 0);
  } else {
    start.setMinutes(0, 0, 0);
    const hours = step / HOUR;
    const h = start.getHours();
    start.setHours(Math.floor(h / hours) * hours);
  }
  let t = start.getTime();
  while (t < tMin) t += step;
  while (t <= tMax) {
    out.push(t);
    t += step;
    if (out.length > 10) break;
  }
  return out;
}

function nearestValue(points: LinePoint[], t: number, maxDist: number): number | null {
  let best: number | null = null;
  let bestD = Infinity;
  for (const p of points) {
    if (p.v == null || !Number.isFinite(p.v)) continue;
    const d = Math.abs(p.t - t);
    if (d < bestD) {
      bestD = d;
      best = p.v;
    }
  }
  return bestD <= maxDist ? best : null;
}

function sampleGap(points: LinePoint[]): number {
  if (points.length < 2) return 90_000;
  const span = points[points.length - 1].t - points[0].t;
  return Math.max(90_000, (span / (points.length - 1)) * 1.6);
}

/**
 * SVG-Liniendiagramm mit Zeitachse und Hover-Werte-Label.
 */
export function LineChart({
  series,
  height = 168,
  yMax,
  ySuffix = "",
}: {
  series: { label: string; color: string; points: LinePoint[] }[];
  height?: number;
  yMax?: number;
  ySuffix?: string;
}) {
  const [hover, setHover] = useState<{ x: number; t: number } | null>(null);
  const width = 640;
  const padL = 38;
  const padR = 10;
  const padT = 10;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const all = series.flatMap((s) => s.points);
  const times = all.map((p) => p.t);
  const tMin = times.length ? Math.min(...times) : 0;
  const tMax = times.length ? Math.max(...times) : 1;
  const span = Math.max(1, tMax - tMin);
  const values = all.map((p) => p.v).filter((v): v is number => v != null && Number.isFinite(v));
  const peak = yMax ?? Math.max(1, ...values, 0);
  const nicePeak = peak <= 100 ? 100 : Math.ceil(peak / 10) * 10;
  const xTicks = timeTicks(tMin, tMax);

  function xOf(t: number) {
    return padL + ((t - tMin) / span) * innerW;
  }
  function yOf(v: number) {
    return padT + innerH - (Math.max(0, Math.min(nicePeak, v)) / nicePeak) * innerH;
  }

  function pathFor(points: LinePoint[]) {
    const usable = downsample(points, 120).filter((p) => p.v != null) as { t: number; v: number }[];
    if (usable.length < 2) return "";
    return usable.map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.t).toFixed(1)} ${yOf(p.v).toFixed(1)}`).join(" ");
  }

  function onMove(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const xSvg = ((e.clientX - rect.left) / rect.width) * width;
    const x = Math.max(padL, Math.min(width - padR, xSvg));
    const t = tMin + ((x - padL) / innerW) * span;
    setHover({ x, t });
  }

  const yTicks = [0, 0.5, 1].map((f) => Math.round(nicePeak * f));
  const hoverRows = hover
    ? series.map((s) => ({
        label: s.label,
        color: s.color,
        value: nearestValue(s.points, hover.t, sampleGap(s.points)),
      }))
    : [];
  const tipLeft = hover ? hover.x / width > 0.62 : false;

  return (
    <div className="mon-linechart" onMouseLeave={() => setHover(null)}>
      <div className="mon-linechart-plot">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Verlauf"
          onMouseMove={onMove}
        >
          {yTicks.map((tick) => (
            <g key={tick}>
              <line
                x1={padL}
                x2={width - padR}
                y1={yOf(tick)}
                y2={yOf(tick)}
                stroke="rgba(148,163,184,0.16)"
                strokeWidth="1"
              />
              <text x={padL - 6} y={yOf(tick) + 3} textAnchor="end" className="mon-linechart-tick">
                {tick}
                {ySuffix}
              </text>
            </g>
          ))}
          {xTicks.map((tick) => {
            const x = xOf(tick);
            const edge = x < padL + 22 ? "start" : x > width - padR - 22 ? "end" : "middle";
            return (
              <text
                key={tick}
                x={x}
                y={height - 6}
                textAnchor={edge}
                className="mon-linechart-tick"
              >
                {formatChartTick(tick, span)}
              </text>
            );
          })}
          {series.map((s) => (
            <path
              key={s.label}
              d={pathFor(s.points)}
              fill="none"
              stroke={s.color}
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
          ))}
          {hover ? (
            <g className="mon-linechart-cross" pointerEvents="none">
              <line
                x1={hover.x}
                x2={hover.x}
                y1={padT}
                y2={padT + innerH}
                stroke="rgba(226,232,240,0.72)"
                strokeWidth="1.2"
              />
              {hoverRows.map((row) =>
                row.value == null ? null : (
                  <circle
                    key={row.label}
                    cx={hover.x}
                    cy={yOf(row.value)}
                    r="3.6"
                    fill={row.color}
                    stroke="rgba(15,23,42,0.9)"
                    strokeWidth="1.4"
                  />
                ),
              )}
            </g>
          ) : null}
        </svg>
        {hover ? (
          <div
            className={`mon-linechart-tip${tipLeft ? " is-left" : ""}`}
            style={{ left: `${(hover.x / width) * 100}%` }}
          >
            <strong>{formatChartTime(hover.t, span)}</strong>
            <ul>
              {hoverRows.map((row) => (
                <li key={row.label}>
                  <i style={{ background: row.color }} aria-hidden />
                  <span>{row.label}</span>
                  <em>
                    {row.value == null ? "–" : `${Math.round(row.value)}${ySuffix}`}
                  </em>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      <ul className="mon-linechart-legend">
        {series.map((s) => (
          <li key={s.label}>
            <i style={{ background: s.color }} aria-hidden />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function downsample(points: LinePoint[], max: number): LinePoint[] {
  if (points.length <= max) return points;
  const bucket = points.length / max;
  const out: LinePoint[] = [];
  for (let i = 0; i < max; i++) {
    const start = Math.floor(i * bucket);
    const end = Math.floor((i + 1) * bucket);
    const slice = points.slice(start, Math.max(start + 1, end));
    const vals = slice.map((p) => p.v).filter((v): v is number => v != null);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    out.push({ t: slice[0]?.t ?? 0, v: avg });
  }
  return out;
}
