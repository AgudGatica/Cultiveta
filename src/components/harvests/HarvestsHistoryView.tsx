import React, { useState } from 'react';
import { Award, Scale, Star, Calendar, FileText, TrendingUp, Sparkles, Pencil } from 'lucide-react';
import { Harvest, Cultivation } from '../../types';
import { HarvestReportView } from '../cultivations/HarvestReportView';
import { EditHarvestModal } from './EditHarvestModal';

interface HarvestsHistoryViewProps {
  harvests: Harvest[];
  cultivations: Cultivation[];
  userId?: string;
  onNavigateToCompare?: (cropAId?: string) => void;
  onHarvestUpdated?: (updated: Harvest) => void;
}

export const HarvestsHistoryView: React.FC<HarvestsHistoryViewProps> = ({
  harvests,
  cultivations,
  userId,
  onNavigateToCompare,
  onHarvestUpdated,
}) => {
  const [selectedHarvestForReport, setSelectedHarvestForReport] = useState<{
    harvest: Harvest;
    cultivation: Cultivation;
  } | null>(null);
  const [harvestToEdit, setHarvestToEdit] = useState<Harvest | null>(null);

  const handleHarvestUpdated = (updated: Harvest) => {
    if (selectedHarvestForReport && selectedHarvestForReport.harvest.id === updated.id) {
      setSelectedHarvestForReport({
        ...selectedHarvestForReport,
        harvest: updated,
      });
    }
    if (onHarvestUpdated) {
      onHarvestUpdated(updated);
    }
  };

  // Global Calculations
  const totalDryGrams = harvests.reduce((acc, h) => acc + (h.finalDryWeightGrams || 0), 0);
  const totalPlants = harvests.reduce((acc, h) => acc + (h.plantCount || 1), 0);
  const avgGramsPerPlant = totalPlants > 0 ? (totalDryGrams / totalPlants).toFixed(1) : '0';
  const avgTotalDays =
    harvests.length > 0
      ? Math.round(harvests.reduce((acc, h) => acc + h.totalDays, 0) / harvests.length)
      : 0;

  if (selectedHarvestForReport) {
    return (
      <>
        <HarvestReportView
          harvest={selectedHarvestForReport.harvest}
          cultivation={selectedHarvestForReport.cultivation}
          onBack={() => setSelectedHarvestForReport(null)}
          onEditHarvest={(h) => setHarvestToEdit(h)}
        />
        <EditHarvestModal
          isOpen={harvestToEdit !== null}
          harvest={harvestToEdit}
          userId={userId}
          onClose={() => setHarvestToEdit(null)}
          onHarvestUpdated={handleHarvestUpdated}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-amber-100 text-amber-800">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-xl text-stone-900">Historial de Cosechas 🏆</h2>
            <p className="text-xs text-stone-500">
              Registro histórico de rendimientos, duraciones, catas y reportes finales
            </p>
          </div>
        </div>

        {onNavigateToCompare && (
          <button
            type="button"
            onClick={() => onNavigateToCompare()}
            className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-2 transition-all cursor-pointer shadow-sm hover:shadow-md active:scale-95"
          >
            <Scale className="w-4 h-4" />
            <span>Comparar 2 Cultivos</span>
          </button>
        )}
      </div>

      {/* Global Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs text-center space-y-1">
          <span className="text-xs font-semibold text-stone-500">Total Cosechado</span>
          <div className="text-2xl sm:text-3xl font-extrabold text-emerald-950">
            {totalDryGrams.toFixed(1)} g
          </div>
          <span className="text-[11px] text-emerald-700 font-medium">Peso seco acumulado</span>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs text-center space-y-1">
          <span className="text-xs font-semibold text-stone-500">Rendimiento Promedio</span>
          <div className="text-2xl sm:text-3xl font-extrabold text-stone-900">
            {avgGramsPerPlant} g
          </div>
          <span className="text-[11px] text-stone-500 font-medium">Por cada planta</span>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs text-center space-y-1">
          <span className="text-xs font-semibold text-stone-500">Duración Promedio</span>
          <div className="text-2xl sm:text-3xl font-extrabold text-stone-900">
            {avgTotalDays} días
          </div>
          <span className="text-[11px] text-stone-500 font-medium">De semilla/esqueje a corte</span>
        </div>

        <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs text-center space-y-1">
          <span className="text-xs font-semibold text-stone-500">Ciclos Completados</span>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-800">
            {harvests.length}
          </div>
          <span className="text-[11px] text-stone-500 font-medium">Cultivos finalizados</span>
        </div>
      </div>

      {/* Harvests Cards List */}
      {harvests.length === 0 ? (
        <div className="bg-white rounded-3xl p-12 border border-stone-200 text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-amber-50 text-amber-700 flex items-center justify-center mx-auto">
            <Award className="w-8 h-8" />
          </div>
          <h4 className="font-bold text-stone-800 text-base">Aún no hay cosechas registradas</h4>
          <p className="text-xs text-stone-500 max-w-sm mx-auto">
            Cuando completes un cultivo, utiliza el botón "Finalizar Cultivo" para guardar el peso seco y ficha de cata.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {harvests.map((h) => {
            const correspondingCrop =
              cultivations.find((c) => c.id === h.cultivationId) ||
              ({
                id: h.cultivationId,
                userId: h.userId,
                name: h.cultivationName,
                startDate: h.startDate,
                currentStage: 'Finalizado',
                stageStartDate: h.harvestDate,
                type: 'Indoor',
                plantCount: h.plantCount,
                geneticsName: h.geneticsName,
                seedBank: h.seedBank,
                substrate: { type: 'Sustrato orgánico', potVolumeLiters: 11, potType: 'Geotextil' },
                status: 'ESTABLE',
                isFinished: true,
                createdAt: h.createdAt,
                updatedAt: h.createdAt,
              } as unknown as Cultivation);

            return (
              <div
                key={h.id}
                className="bg-white rounded-3xl p-6 border border-stone-200 shadow-2xs hover:shadow-md transition-all space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-lg text-stone-900">{h.cultivationName}</h3>
                      <p className="text-xs text-stone-500 font-medium">
                        {h.geneticsName} {h.seedBank && `(${h.seedBank})`}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className="flex items-center gap-0.5 text-amber-400">
                        {[...Array(h.rating1To5)].map((_, i) => (
                          <Star key={i} className="w-4 h-4 fill-amber-400" />
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setHarvestToEdit(h)}
                        className="p-1.5 rounded-xl text-stone-400 hover:text-amber-700 hover:bg-amber-50 transition-colors cursor-pointer"
                        title="Editar cuánto se cosechó y ficha"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Highlight stats */}
                  <div className="grid grid-cols-3 gap-2 bg-stone-50 p-3 rounded-2xl border border-stone-200/60 text-center text-xs">
                    <div>
                      <span className="text-[10px] text-stone-400 block">Total Seco</span>
                      <span className="font-extrabold text-emerald-950 text-sm">
                        {h.finalDryWeightGrams} g
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 block">Promedio</span>
                      <span className="font-bold text-stone-800 text-sm">
                        {h.gramsPerPlant} g/planta
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-stone-400 block">Duración</span>
                      <span className="font-bold text-stone-800 text-sm">{h.totalDays} días</span>
                    </div>
                  </div>

                  {/* Tasting profile if available */}
                  {(h.aromaReview || h.flavorReview) && (
                    <div className="text-xs space-y-1 bg-amber-50/40 p-3 rounded-2xl border border-amber-100">
                      {h.aromaReview && (
                        <div className="text-stone-700">
                          <span className="font-bold text-amber-950">Aroma:</span> {h.aromaReview}
                        </div>
                      )}
                      {h.flavorReview && (
                        <div className="text-stone-700">
                          <span className="font-bold text-amber-950">Sabor:</span> {h.flavorReview}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-[11px] text-stone-400">
                    Cosechado el {h.harvestDate} · {h.plantCount} plantas
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedHarvestForReport({ harvest: h, cultivation: correspondingCrop })
                    }
                    className="py-2.5 px-2 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    title="Ver ficha completa imprimible"
                  >
                    <FileText className="w-3.5 h-3.5 shrink-0" />
                    <span>Ficha</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setHarvestToEdit(h)}
                    className="py-2.5 px-2 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200/80 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    title="Editar cuánto se cosechó (peso seco/húmedo) y notas"
                  >
                    <Pencil className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>Editar</span>
                  </button>

                  {onNavigateToCompare ? (
                    <button
                      type="button"
                      onClick={() => onNavigateToCompare(h.cultivationId)}
                      className="py-2.5 px-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      title="Comparar con otro cultivo"
                    >
                      <Scale className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Comparar</span>
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Harvest Modal */}
      <EditHarvestModal
        isOpen={harvestToEdit !== null}
        harvest={harvestToEdit}
        userId={userId}
        onClose={() => setHarvestToEdit(null)}
        onHarvestUpdated={handleHarvestUpdated}
      />
    </div>
  );
};
