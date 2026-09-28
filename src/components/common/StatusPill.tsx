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
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30 shadow-xs ${className}`}
        >
          {showIcon && <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>}
          <span>COSECHADO</span>
        </span>
      );
    case 'ESTABLE':
      return (
        <span
          id={`status-pill-${normStatus.toLowerCase()}`}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-xs ${className}`}
        >
          {showIcon && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>}
          <span>ESTABLE</span>
        </span>
      );
    case 'REVISAR':
      return (
        <span
          id={`status-pill-${normStatus.toLowerCase()}`}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-xs ${className}`}
        >
          {showIcon && <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>}
          <span>REVISAR</span>
        </span>
      );
    case 'ATENCION':
    case 'ATENCIÓN':
      return (
        <span
          id={`status-pill-${normStatus.toLowerCase()}`}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 shadow-xs ${className}`}
        >
          {showIcon && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>}
          <span>ATENCIÓN</span>
        </span>
      );
    default:
      if (status) {
        return (
          <span
            id={`status-pill-${String(status).toLowerCase()}`}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold bg-stone-500/10 text-stone-400 border border-stone-500/30 shadow-xs ${className}`}
          >
            {showIcon && <span className="w-1.5 h-1.5 rounded-full bg-stone-400"></span>}
            <span>{String(status).toUpperCase()}</span>
          </span>
        );
      }
      return null;
  }
};

