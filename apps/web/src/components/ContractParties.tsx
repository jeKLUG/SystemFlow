/**
 * Zwei Adressblöcke Auftragnehmer / Auftraggeber (wie im Vertrags-PDF).
 */
export function ContractParties({
  contractor,
  customer,
}: {
  contractor: string[];
  customer: string[];
}) {
  if (!contractor.length && !customer.length) return null;
  return (
    <div className="sla-parties">
      <article>
        <span className="label">Auftragnehmer</span>
        {(contractor.length ? contractor : ["Systemhaus-Ess"]).map((line, i) =>
          i === 0 ? <strong key={`${i}-${line}`}>{line}</strong> : <p key={`${i}-${line}`}>{line}</p>,
        )}
      </article>
      <article>
        <span className="label">Auftraggeber</span>
        {(customer.length ? customer : ["–"]).map((line, i) =>
          i === 0 ? <strong key={`${i}-${line}`}>{line}</strong> : <p key={`${i}-${line}`}>{line}</p>,
        )}
      </article>
    </div>
  );
}
