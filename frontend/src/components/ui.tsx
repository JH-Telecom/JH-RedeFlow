import { useEffect } from "react";
import { ClipboardList, LockKeyhole, X } from "lucide-react";

export function AccessDenied() {
  return (
    <div className="panel access-denied" role="alert">
      <LockKeyhole size={22} />
      <h2>Acesso não permitido</h2>
      <p>Seu cargo não tem permissão para abrir esta tela. Fale com um administrador se precisar de acesso.</p>
    </div>
  );
}

export function Metric({
  label,
  value,
  note,
  positive,
}: {
  label: string;
  value: string;
  note: string;
  positive?: boolean;
}) {
  return (
    <section className="metric">
      <div className="metric-icon">
        <ClipboardList size={17} />
      </div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={positive ? "positive" : ""}>
        {positive && "↗ "}
        {note}
      </small>
    </section>
  );
}

export function ActivityRow({
  color,
  text,
  detail,
  time,
}: {
  color: string;
  text: string;
  detail: string;
  time: string;
}) {
  return (
    <div className="activity-row">
      <i className={`activity-dot ${color}`} />
      <div>
        <strong>{text}</strong>
        <span>{detail}</span>
      </div>
      <time>{time}</time>
    </div>
  );
}

export function AdminModal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  // Esc fecha a janela (e nao sai da tela: o atalho global ignora quando ha janela aberta).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape" && !event.defaultPrevented) { event.preventDefault(); onClose(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="modal-backdrop" onClick={onClose}><section className="admin-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" type="button" onClick={onClose} title="Fechar"><X size={18} /></button></div>{children}</section></div>;
}

export function DateRangeFilter({ value, onChange }: { value: { from: string; to: string }; onChange: (value: { from: string; to: string }) => void }) {
  return <div className="date-range-filter"><label>De<input type="date" value={value.from} onChange={(event) => onChange({ ...value, from: event.target.value })} /></label><label>Ate<input type="date" value={value.to} onChange={(event) => onChange({ ...value, to: event.target.value })} /></label>{(value.from || value.to) && <button className="text-button" type="button" onClick={() => onChange({ from: "", to: "" })}>Limpar periodo</button>}</div>;
}

export function EditableDetailItem({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="detail-item editable-detail-item"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-item">
      <span>{label}</span>
      <strong>{value || "-"}</strong>
    </div>
  );
}
