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
    <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm space-y-4">
      {/* Table Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-stone-100">
        <div>
          <h3 className="font-bold text-base text-stone-900">Tabla Histórica de Mediciones</h3>
          <p className="text-xs text-stone-500">
            Todos los registros cuantitativos de riego y ambiente
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Filter Type */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-xs font-semibold text-stone-700 focus:outline-hidden cursor-pointer"
          >
            <option value="all">Todos los registros</option>
            <option value="watering">💧 Solo Riegos</option>
            <option value="environment">🌡️ Solo Ambiente</option>
          </select>

          {/* Search */}
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar fecha o nota..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200 text-xs text-stone-800 focus:outline-hidden focus:bg-white w-full"
            />
          </div>

          {/* Export button */}
          <button
            type="button"
            onClick={handleExportCSV}
            className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Descargar tabla en formato CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Exportar CSV</span>
          </button>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-stone-50 text-stone-500 font-bold uppercase tracking-wider border-b border-stone-200">
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
          <tbody className="divide-y divide-stone-100">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-8 text-center text-stone-400">
                  No hay registros que coincidan con el filtro.
                </td>
              </tr>
            ) : (
              filteredRows.map((r) => (
                <tr key={r.id} className="hover:bg-stone-50/80 transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-stone-800">{r.date}</td>
                  <td className="py-2.5 px-3 text-stone-500">Día {r.day}</td>
                  <td className="py-2.5 px-3">
                    {r.type === 'watering' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-cyan-50 text-cyan-800 border border-cyan-200">
                        <Droplets className="w-3 h-3 text-cyan-600" />
                        Riego
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        <Thermometer className="w-3 h-3 text-amber-600" />
                        Ambiente
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-bold text-stone-700">{r.phIn ?? '—'}</td>
                  <td className="py-2.5 px-3 font-bold text-stone-700">{r.ecIn ?? '—'}</td>
                  <td className="py-2.5 px-3 font-bold text-cyan-900">
                    {r.volumeLiters ? `${r.volumeLiters} L` : '—'}
                  </td>
                  <td className="py-2.5 px-3 font-bold text-stone-700">
                    {r.tempC ? `${r.tempC}°` : '—'}
                  </td>
                  <td className="py-2.5 px-3 font-bold text-stone-700">
                    {r.humidityPct ? `${r.humidityPct}%` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-stone-600">{r.vpdKPa ?? '—'}</td>
                  <td className="py-2.5 px-4 text-stone-600 max-w-xs truncate" title={r.notes}>
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
          <div className="py-8 text-center text-stone-400 text-xs">
            No hay registros que coincidan.
          </div>
        ) : (
          filteredRows.map((r) => (
            <div
              key={r.id}
              className="p-3.5 rounded-2xl bg-stone-50/80 border border-stone-200/80 text-xs space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-stone-900">{r.date}</span>
                  <span className="text-stone-400">· Día {r.day}</span>
                </div>
                {r.type === 'watering' ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-cyan-100 text-cyan-800">
                    💧 Riego
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800">
                    🌡️ Ambiente
                  </span>
                )}
              </div>

              {r.type === 'watering' && (
                <div className="grid grid-cols-3 gap-2 bg-white p-2.5 rounded-xl border border-stone-200 text-center font-bold">
                  <div>
                    <span className="text-[10px] text-stone-400 block font-normal">Volumen</span>
                    <span className="text-cyan-900">{r.volumeLiters} L</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-400 block font-normal">pH In</span>
                    <span>{r.phIn ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-400 block font-normal">EC In</span>
                    <span>{r.ecIn ? `${r.ecIn} mS` : '—'}</span>
                  </div>
                </div>
              )}

              {r.type === 'environment' && (
                <div className="grid grid-cols-3 gap-2 bg-white p-2.5 rounded-xl border border-stone-200 text-center font-bold">
                  <div>
                    <span className="text-[10px] text-stone-400 block font-normal">Temp</span>
                    <span>{r.tempC}°C</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-400 block font-normal">Humedad</span>
                    <span>{r.humidityPct}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-stone-400 block font-normal">VPD</span>
                    <span>{r.vpdKPa ? `${r.vpdKPa} kPa` : '—'}</span>
                  </div>
                </div>
              )}

              {r.notes && <p className="text-stone-600 text-[11px] italic">{r.notes}</p>}
            </div>
          ))
        )}
      </div>
    </div>
  );
};
