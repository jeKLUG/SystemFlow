import type { MonitoringHardware } from "../types";

function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "–";
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  const gb = n / 1024 ** 3;
  if (gb < 1024) return `${gb >= 10 ? gb.toFixed(0) : gb.toFixed(1)} GB`;
  return `${(gb / 1024).toFixed(1)} TB`;
}

function joinParts(parts: Array<string | null | undefined>): string {
  return parts.map((p) => p?.trim()).filter(Boolean).join(" · ");
}

function Facts({ rows }: { rows: Array<[string, string | null | undefined]> }) {
  const visible = rows.filter(([, v]) => v && v.trim());
  if (!visible.length) return null;
  return (
    <dl className="mon-hw-facts">
      {visible.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Verbaute Hardware aus dem Agent-Snapshot (System, CPU, RAM-Riegel, Datenträger, GPU, NICs).
 */
export function MonitoringHardwarePanel({ hardware }: { hardware?: MonitoringHardware | null }) {
  if (!hardware) {
    return (
      <div className="mon-block">
        <h3>Verbaute Hardware</h3>
        <p className="muted">
          Noch keine Komponenten gemeldet. Agent 1.0.2 oder neuer installieren — die Inventur kommt
          mit dem nächsten Heartbeat.
        </p>
      </div>
    );
  }

  const sys = joinParts([hardware.system?.manufacturer, hardware.system?.model, hardware.system?.sku]);
  const board = joinParts([hardware.board?.manufacturer, hardware.board?.product]);
  const bios = joinParts([hardware.bios?.vendor, hardware.bios?.version, hardware.bios?.date]);
  const hasAny =
    sys ||
    board ||
    bios ||
    (hardware.cpus?.length ?? 0) > 0 ||
    (hardware.memoryModules?.length ?? 0) > 0 ||
    (hardware.storage?.length ?? 0) > 0 ||
    (hardware.gpus?.length ?? 0) > 0 ||
    (hardware.nics?.length ?? 0) > 0;

  if (!hasAny) {
    return (
      <div className="mon-block">
        <h3>Verbaute Hardware</h3>
        <p className="muted">Keine Komponenten erkannt. Agent 1.0.2 oder neuer verwenden.</p>
      </div>
    );
  }

  return (
    <div className="mon-block">
      <h3>Verbaute Hardware</h3>
      <Facts
        rows={[
          ["System", sys],
          ["Seriennr.", hardware.system?.serial],
          ["Mainboard", board],
          ["Board-SN", hardware.board?.serial],
          ["BIOS", bios],
        ]}
      />

      {hardware.cpus?.length ? (
        <table className="mon-table mon-hw-table">
          <thead>
            <tr>
              <th>CPU</th>
              <th>Kerne</th>
              <th>Takt</th>
              <th>Sockel</th>
            </tr>
          </thead>
          <tbody>
            {hardware.cpus.map((c, i) => (
              <tr key={`${c.name}-${i}`}>
                <td>{c.name || "–"}</td>
                <td>
                  {c.cores ?? "–"}
                  {c.threads && c.threads !== c.cores ? ` / ${c.threads} Threads` : ""}
                </td>
                <td>{c.mhz ? `${c.mhz} MHz` : "–"}</td>
                <td>{c.socket || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {hardware.memoryModules?.length ? (
        <table className="mon-table mon-hw-table">
          <thead>
            <tr>
              <th>RAM-Riegel</th>
              <th>Größe</th>
              <th>Typ / Takt</th>
              <th>Teilenummer</th>
            </tr>
          </thead>
          <tbody>
            {hardware.memoryModules.map((m, i) => (
              <tr key={`${m.slot}-${m.serial}-${i}`}>
                <td>
                  {joinParts([m.slot, m.manufacturer]) || "Riegel"}
                  {m.serial ? <span className="muted"> · {m.serial}</span> : null}
                </td>
                <td>{formatBytes(m.sizeBytes)}</td>
                <td>{joinParts([m.type, m.speedMhz ? `${m.speedMhz} MT/s` : null]) || "–"}</td>
                <td className="is-mono">{m.partNumber || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {hardware.storage?.length ? (
        <table className="mon-table mon-hw-table">
          <thead>
            <tr>
              <th>Datenträger (verbaut)</th>
              <th>Größe</th>
              <th>Bus / Medium</th>
              <th>Seriennr.</th>
            </tr>
          </thead>
          <tbody>
            {hardware.storage.map((s, i) => (
              <tr key={`${s.serial}-${s.model}-${i}`}>
                <td>{s.model || s.name || "–"}</td>
                <td>{formatBytes(s.sizeBytes)}</td>
                <td>{joinParts([s.bus, s.media]) || "–"}</td>
                <td className="is-mono">{s.serial || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {hardware.gpus?.length ? (
        <table className="mon-table mon-hw-table">
          <thead>
            <tr>
              <th>Grafik</th>
              <th>VRAM</th>
              <th>Treiber</th>
            </tr>
          </thead>
          <tbody>
            {hardware.gpus.map((g, i) => (
              <tr key={`${g.name}-${i}`}>
                <td>{g.name || "–"}</td>
                <td>{formatBytes(g.vramBytes)}</td>
                <td>{g.driver || "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {hardware.nics?.length ? (
        <table className="mon-table mon-hw-table">
          <thead>
            <tr>
              <th>Netzwerk</th>
              <th>MAC</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {hardware.nics.map((n, i) => (
              <tr key={`${n.mac}-${i}`}>
                <td>
                  {n.name || "–"}
                  {n.manufacturer ? <span className="muted"> · {n.manufacturer}</span> : null}
                </td>
                <td className="is-mono">{n.mac || "–"}</td>
                <td>{n.speedMbps ? `${n.speedMbps} Mbit/s` : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
