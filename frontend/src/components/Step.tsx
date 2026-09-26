import type { ReactNode } from 'react';

interface StepProps {
  step: number;
  total: number;
  onBack?: () => void;
  /** Label override, e.g. "Last step" */
  label?: string;
  children: ReactNode;
}

/** Card with Base's step header: back arrow, "STEP N OF M" and a green progress bar. */
export function Step({ step, total, onBack, label, children }: StepProps) {
  return (
    <div className="card">
      <div className="step-head">
        <button className="step-back" onClick={onBack} disabled={!onBack} aria-label="Back">
          ←
        </button>
        <span className="step-label">{label ?? `Step ${step} of ${total}`}</span>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={step} aria-valuemin={0} aria-valuemax={total}>
        <div className="progress__fill" style={{ width: `${(step / total) * 100}%` }} />
      </div>
      {children}
    </div>
  );
}

interface OptionProps {
  children: ReactNode;
  hint?: ReactNode;
  selected?: boolean;
  onClick: () => void;
  className?: string;
}

export function Option({ children, hint, selected, onClick, className = '' }: OptionProps) {
  return (
    <button className={`option ${selected ? 'option--selected' : ''} ${className}`} onClick={onClick}>
      {children}
      {hint && <span className="option__hint">{hint}</span>}
    </button>
  );
}
