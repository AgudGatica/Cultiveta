import React, { useState } from 'react';
import { Download, Search, Filter, Droplets, Thermometer, Calendar } from 'lucide-react';
import { Watering, EnvironmentRecord, Cultivation } from '../../types';
import { cultivationService } from '../../services/cultivationService';

interface MeasurementsTableViewProps {
  cultivation: Cultivation;
  waterings: Watering[];
  envRecords: EnvironmentRecord[];
}

export const MeasurementsTableView: React.FC<MeasurementsTableViewProps> = ({
  cultivation,
  waterings,
  envRecords,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'watering' | 'environment'>('all');

  // Merge records by date
  const combinedRows: {
    id: string;
    date: string;
    day: number;
    type: 'watering' | 'environment';
    phIn?: number;
    ecIn?: number;
    volumeLiters?: number;
    tempC?: number;
    humidityPct?: number;
    vpdKPa?: number;
    notes?: string;
    isAutoLogged?: boolean;
  }[] = [];

  waterings.forEach((w) => {
    const day = cultivationService.calculateDays(cultivation.startDate, w.date);
    combinedRows.push({
      id: `w-${w.id}`,
      date: w.date,
      day,
      type: 'watering',
      phIn: w.phIn,
      ecIn: w.ecIn,
      volumeLiters: w.volumeLiters,
      notes: [
        w.productsUsed ? w.productsUsed.map((p) => p.name).join(', ') : null,
        w.observations,
      ]
        .filter(Boolean)
        .join(' · '),
    });
  });

  envRecords.forEach((e) => {
    const day = cultivationService.calculateDays(cultivation.startDate, e.date);
    combinedRows.push({
      id: `env-${e.id}`,
      date: e.date,
      day,
      type: 'environment',
      tempC: e.temperatureC,
      humidityPct: e.humidityPct,
      vpdKPa: e.vpdKPa,
      notes: e.notes,
      isAutoLogged: e.isAutoLogged,
    });
  });

  // Sort descending by date
  const sortedRows = combinedRows.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const filteredRows = sortedRows.filter((r) => {
    if (filterType !== 'all' && r.type !== filterType) return false;
    if (searchTerm) {
      const matchNotes = r.notes?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchDate = r.date.includes(searchTerm);
      return matchNotes || matchDate;
    }
    return true;
  });

  const handleExportCSV = () => {
    const headers = ['Fecha', 'Día', 'Tipo', 'pH Entrada', 'EC Entrada', 'Volumen L', 'Temp C', 'HR %', 'VPD kPa', 'Notas'];
    const csvContent = [
      headers.join(','),
      ...filteredRows.map((r) =>
        [
          r.date,
          r.day,
          r.type === 'watering' ? 'Riego' : 'Ambiente',
          r.phIn ?? '',
          r.ecIn ?? '',
          r.volumeLiters ?? '',
          r.tempC ?? '',
          r.humidityPct ?? '',
          r.vpdKPa ?? '',
          `"${(r.notes || '').replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `cultiveta_${cultivation.name.replace(/\s+/g, '_')}_mediciones.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-3xl p-6 border border-[#EFE3CF] shadow-xs space-y-4">
      {/* Table Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-[#EFE3CF]">
        <div>
          <h3 className="font-extrabold text-base text-[#29202F]">Tabla Histórica de Mediciones 📋</h3>
          <p className="text-xs text-[#6E5D77]">
            Todos los registros cuantitativos de riego y ambiente
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Filter Type */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-3.5 py-2 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs font-bold text-[#29202F] focus:outline-hidden focus:border-[#6C45C7] cursor-pointer"
          >
            <option value="all">Todos los registros</option>
            <option value="watering">💧 Solo Riegos</option>
            <option value="environment">🌡️ Solo Ambiente</option>
          </select>

          {/* Search */}
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 text-[#9887A2] absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Buscar fecha o nota..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3.5 py-2 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs font-medium text-[#29202F] focus:outline-hidden focus:border-[#6C45C7] focus:bg-white w-full"
            />
          </div>

          {/* Export button */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-4 py-2 rounded-2xl bg-[#FAF2E1] hover:bg-[#ebdcc0] text-[#29202F] border border-[#EFE3CF] text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Descargar tabla en formato CSV"
          >
            <Download className="w-3.5 h-3.5 text-[#6C45C7]" />
            <span className="hidden md:inline">Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-[#FFFDF7] text-[#9887A2] font-bold uppercase tracking-wider border-b border-[#EFE3CF]">
              <th className="py-3 px-3">Fecha</th>
              <th className="py-3 px-3">Día</th>
              <th className="py-3 px-3">Tipo</th>
              <th className="py-3 px-3">pH In</th>
              <th className="py-3 px-3">EC (mS)</th>
              <th className="py-3 px-3">Agua (L)</th>
              <th className="py-3 px-3">Temp (°C)</th>
              <th className="py-3 px-3">HR (%)</th>
              <th className="py-3 px-3">VPD (kPa)</th>
              <th className="py-3 px-4">Notas y Productos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFE3CF]">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-[#9887A2]">
                  No hay registros que coincidan con el filtro.
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => (
                <tr key={r.id} className="hover:bg-[#FFFDF7] transition-colors">
                  <td className="py-2.5 px-3 font-bold text-[#29202F]">{r.date}</td>
                  <td className="py-2.5 px-3 text-[#6E5D77] font-semibold">Día {r.day}</td>
                  <td className="py-2.5 px-3">
                    {r.type === 'watering' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#62B95B]/15 text-[#62B95B] border border-[#62B95B]/30">
                        <Droplets className="w-3 h-3 text-[#62B95B]" />
                        Riego
                      </span>
                    ) : (
                      <div className="flex flex-col gap-1 items-start">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#F3C843]/20 text-[#29202F] border border-[#F3C843]/40">
                          <Thermometer className="w-3 h-3 text-[#EB7864]" />
                          Ambiente
                        </span>
                        {r.isAutoLogged ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#6C45C7]/15 text-[#6C45C7] border border-[#6C45C7]/30">
                            🌤️ Auto (API)
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#FAF2E1] text-[#6E5D77] border border-[#EFE3CF]">
                            ✍️ Manual
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-bold text-[#29202F]">{r.phIn ?? '—'}</td>
                  <td className="py-2.5 px-3 font-bold text-[#29202F]">{r.ecIn ?? '—'}</td>
                  <td className="py-2.5 px-3 font-extrabold text-[#62B95B]">
                    {r.volumeLiters ? `${r.volumeLiters} L` : '—'}
                  </td>
                  <td className="py-2.5 px-3 font-bold text-[#29202F]">
                    {r.tempC ? `${r.tempC}°` : '—'}
                  </td>
                  <td className="py-2.5 px-3 font-bold text-[#29202F]">
                    {r.humidityPct ? `${r.humidityPct}%` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-[#6C45C7] font-bold">{r.vpdKPa ?? '—'}</td>
                  <td className="py-2.5 px-4 text-[#6E5D77] max-w-xs truncate" title={r.notes}>
                    {r.notes || '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card Rows */}
      <div className="md:hidden space-y-2.5">
        {filteredRows.length === 0 ? (
          <div className="py-8 text-center text-[#9887A2] text-xs">
            No hay registros que coincidan.
          </div>
        ) : (
          filteredRows.map((r) => (
            <div
              key={r.id}
              className="p-3.5 rounded-2xl bg-[#FFFDF7] border border-[#EFE3CF] text-xs space-y-2 shadow-2xs"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-extrabold text-[#29202F]">{r.date}</span>
                  <span className="text-[#9887A2] font-semibold">· Día {r.day}</span>
                </div>
                {r.type === 'watering' ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#62B95B]/15 text-[#62B95B] border border-[#62B95B]/30">
                    💧 Riego
                  </span>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#F3C843]/20 text-[#29202F] border border-[#F3C843]/40">
                      🌡️ Ambiente
                    </span>
                    {r.isAutoLogged ? (
                      <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-[#6C45C7]/15 text-[#6C45C7]">
                        🌤️ Auto (API)
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-[#FAF2E1] text-[#6E5D77]">
                        ✍️ Manual
                      </span>
                    )}
                  </div>
                )}
              </div>

              {r.type === 'watering' && (
                <div className="grid grid-cols-3 gap-2 bg-white p-2.5 rounded-xl border border-[#EFE3CF] text-center font-bold">
                  <div>
                    <span className="text-[10px] text-[#9887A2] block font-normal">Volumen</span>
                    <span className="text-[#62B95B] font-extrabold">{r.volumeLiters} L</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#9887A2] block font-normal">pH In</span>
                    <span className="text-[#29202F]">{r.phIn ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#9887A2] block font-normal">EC In</span>
                    <span className="text-[#29202F]">{r.ecIn ? `${r.ecIn} mS` : '—'}</span>
                  </div>
                </div>
              )}

              {r.type === 'environment' && (
                <div className="grid grid-cols-3 gap-2 bg-white p-2.5 rounded-xl border border-[#EFE3CF] text-center font-bold">
                  <div>
                    <span className="text-[10px] text-[#9887A2] block font-normal">Temp</span>
                    <span className="text-[#29202F]">{r.tempC}°C</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#9887A2] block font-normal">Humedad</span>
                    <span className="text-[#29202F]">{r.humidityPct}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-[#9887A2] block font-normal">VPD</span>
                    <span className="text-[#6C45C7]">{r.vpdKPa ? `${r.vpdKPa} kPa` : '—'}</span>
                  </div>
                </div>
              )}

              {r.notes && <p className="text-[#6E5D77] text-[11px] italic">{r.notes}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
