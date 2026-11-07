import React from 'react';
import { HealthStatus } from '../../types';

interface StatusPillProps {
  status: HealthStatus;
  className?: string;
  showIcon?: boolean;
}

export const StatusPill: React.FC<StatusPillProps> = ({ status, className = '', showIcon = true }) => {
  const normStatus = String(status || '').toUpperCase();
  switch (normStatus) {
    case 'COSECHADO':
      return (
        <span
          id="status-pill-cosechado"
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-icon-bg text-brand border border-chip-line ${className}`}
        >
          {showIcon && <span className="w-1.5 h-1.5 rounded-full bg-brand"></span>}
          <span>COSECHADO</span>
        </span>
      );
    case 'ESTABLE':
      return (
        <span
          id={`status-pill-${normStatus.toLowerCase()}`}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-ok-bg text-ok-ink border border-ok-line ${className}`}
        >
          {showIcon && <span className="w-1.5 h-1.5 rounded-full bg-ok"></span>}
          <span>ESTABLE</span>
        </span>
      );
    case 'REVISAR':
      return (
        <span
          id={`status-pill-${normStatus.toLowerCase()}`}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-warn-bg text-warn-ink border border-warn-line ${className}`}
        >
          {showIcon && <span className="w-1.5 h-1.5 rounded-full bg-warn-line"></span>}
          <span>REVISAR</span>
        </span>
      );
    case 'ATENCION':
    case 'ATENCIÓN':
      return (
        <span
          id={`status-pill-${normStatus.toLowerCase()}`}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-error/10 text-error border border-error/30 ${className}`}
        >
          {showIcon && <span className="w-1.5 h-1.5 rounded-full bg-error"></span>}
          <span>ATENCIÓN</span>
        </span>
      );
    default:
      if (status) {
        return (
          <span
            id={`status-pill-${String(status).toLowerCase()}`}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-track text-ink-muted border border-line ${className}`}
          >
            {showIcon && <span className="w-1.5 h-1.5 rounded-full bg-ink-subtle"></span>}
            <span>{String(status).toUpperCase()}</span>
          </span>
        );
      }
      return null;
  }
};

