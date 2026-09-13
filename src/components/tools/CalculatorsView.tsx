import React, { useState } from 'react';
import { Calculator, Thermometer, Zap, Droplets, Sliders, Info, ShieldCheck, AlertTriangle } from 'lucide-react';
import { environmentService } from '../../services/environmentService';

export const CalculatorsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'vpd' | 'nutrients' | 'energy'>('vpd');

  // VPD state
  const [vpdAirTemp, setVpdAirTemp] = useState(25);
  const [vpdHumidity, setVpdHumidity] = useState(60);
  const [leafTempOffset, setLeafTempOffset] = useState(-2);

  const leafTemp = vpdAirTemp + leafTempOffset;
  const currentVpd = environmentService.calculateVPD(vpdAirTemp, vpdHumidity, leafTemp);

  // VPD Zone Helper
  const getVpdStatus = (val: number) => {
    if (val < 0.4) {
      return {
        stage: 'Riesgo de Humedad Excesiva',
        color: 'text-blue-700 bg-blue-50 border-blue-200',
        advice: 'Poco gradiente de transpiración. Riesgo de hongos foliares y podredumbre.',
      };
    }
    if (val <= 0.8) {
      return {
        stage: 'Ideal para Plántulas y Esquejes',
        color: 'text-emerald-800 bg-emerald-50 border-emerald-200',
        advice: 'Baja transpiración, perfecto para plantas con sistema radicular tierno.',
      };
    }
    if (val <= 1.2) {
      return {
        stage: 'Ideal para Vegetativo y Crecimiento',
        color: 'text-emerald-800 bg-emerald-50 border-emerald-200',
        advice: 'Transpiración óptima para absorción de nitrógeno y rápido crecimiento.',
      };
    }
    if (val <= 1.6) {
      return {
        stage: 'Ideal para Floración Media / Avanzada',
        color: 'text-amber-800 bg-amber-50 border-amber-200',
        advice: 'Estimula la producción de tricomas y previene moho en cogollos densos.',
      };
    }
    return {
      stage: 'Estrés Hídrico Severo (VPD muy alto)',
      color: 'text-rose-800 bg-rose-50 border-rose-200',
      advice: 'Cierre estomático. Las hojas transpiran más rápido de lo que las raíces pueden absorber.',
    };
  };

  const vpdInfo = getVpdStatus(currentVpd);

  // Nutrient dilution state
  const [waterTankLiters, setWaterTankLiters] = useState(20);
  const [nutrientsList, setNutrientsList] = useState([
    { name: 'Base A (Grow/Bloom)', mlPerL: 2.0 },
    { name: 'Base B (Grow/Bloom)', mlPerL: 2.0 },
    { name: 'CalMag Booster', mlPerL: 0.5 },
    { name: 'Estimulador de Raíz', mlPerL: 1.0 },
  ]);

  // Energy cost state
  const [lightWatts, setLightWatts] = useState(240);
  const [extractorWatts, setExtractorWatts] = useState(45);
  const [fansWatts, setFansWatts] = useState(30);
  const [lightHoursDaily, setLightHoursDaily] = useState(18);
  const [kwhCost, setKwhCost] = useState(0.15); // e.g. $0.15 USD or currency unit

  const totalWatts = lightWatts + extractorWatts + fansWatts;
  const dailyKwh = (lightWatts * lightHoursDaily + (extractorWatts + fansWatts) * 24) / 1000;
  const monthlyKwh = dailyKwh * 30;
  const monthlyCost = monthlyKwh * kwhCost;
  const cycleCost = dailyKwh * 80 * kwhCost; // approx 80-day cycle

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Banner */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-800">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-xl text-stone-900">Calculadoras Agronómicas 🧮</h2>
            <p className="text-xs text-stone-500">
              Herramientas de precisión para VPD, soluciones nutritivas y consumo energético
            </p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-2xl text-xs font-bold text-stone-600">
          <button
            type="button"
            onClick={() => setActiveTab('vpd')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'vpd' ? 'bg-white text-stone-900 shadow-2xs' : 'hover:text-stone-900'
            }`}
          >
            VPD Foliar
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('nutrients')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'nutrients' ? 'bg-white text-stone-900 shadow-2xs' : 'hover:text-stone-900'
            }`}
          >
            Dilución Nutrientes
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('energy')}
            className={`px-3.5 py-2 rounded-xl transition-all cursor-pointer ${
              activeTab === 'energy' ? 'bg-white text-stone-900 shadow-2xs' : 'hover:text-stone-900'
            }`}
          >
            Costo Eléctrico
          </button>
        </div>
      </div>

      {/* TAB 1: VPD CALCULATOR */}
      {activeTab === 'vpd' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Controls */}
          <div className="md:col-span-2 bg-white rounded-3xl p-6 border border-stone-200 shadow-sm space-y-6">
            <h3 className="font-bold text-base text-stone-900 flex items-center gap-2">
              <Thermometer className="w-5 h-5 text-emerald-600" />
              Calculadora de Presión de Vapor (VPD)
            </h3>

            {/* Slider 1: Air Temp */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-stone-700">
                <span>Temperatura del Aire (°C)</span>
                <span className="text-emerald-800 text-sm font-extrabold">{vpdAirTemp}°C</span>
              </div>
              <input
                type="range"
                min="15"
                max="35"
                step="0.5"
                value={vpdAirTemp}
                onChange={(e) => setVpdAirTemp(parseFloat(e.target.value))}
                className="w-full accent-emerald-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-stone-400 font-medium">
                <span>15°C</span>
                <span>25°C (Recomendado)</span>
                <span>35°C</span>
              </div>
            </div>

            {/* Slider 2: Relative Humidity */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-stone-700">
                <span>Humedad Relativa (% HR)</span>
                <span className="text-cyan-800 text-sm font-extrabold">{vpdHumidity}%</span>
              </div>
              <input
                type="range"
                min="20"
                max="90"
                step="1"
                value={vpdHumidity}
                onChange={(e) => setVpdHumidity(parseFloat(e.target.value))}
                className="w-full accent-cyan-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-stone-400 font-medium">
                <span>20%</span>
                <span>55% (Promedio flora)</span>
                <span>90%</span>
              </div>
            </div>

            {/* Slider 3: Leaf Temp Offset */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-bold text-stone-700">
                <span>Diferencial Temp Foliar vs Aire (°C)</span>
                <span className="text-purple-800 text-sm font-extrabold">{leafTempOffset}°C ({leafTemp.toFixed(1)}°C foliar)</span>
              </div>
              <input
                type="range"
                min="-5"
                max="2"
                step="0.5"
                value={leafTempOffset}
                onChange={(e) => setLeafTempOffset(parseFloat(e.target.value))}
                className="w-full accent-purple-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-stone-400 font-medium">
                <span>-5°C (LED frío)</span>
                <span>-2°C (Promedio general)</span>
                <span>+2°C (Sodio infrarrojo)</span>
              </div>
            </div>

            {/* Table of Recommended Ranges */}
            <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 text-xs space-y-2">
              <span className="font-bold text-stone-800 block">Rangos Óptimos por Etapa:</span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px]">
                <div className="p-2 rounded-xl bg-white border border-stone-200">
                  <span className="text-stone-400 block text-[10px]">Esqueje / Plántula</span>
                  <span className="font-bold text-emerald-800">0.4 – 0.8 kPa</span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-stone-200">
                  <span className="text-stone-400 block text-[10px]">Vegetativo</span>
                  <span className="font-bold text-emerald-800">0.8 – 1.1 kPa</span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-stone-200">
                  <span className="text-stone-400 block text-[10px]">Flora Temprana</span>
                  <span className="font-bold text-amber-800">1.0 – 1.3 kPa</span>
                </div>
                <div className="p-2 rounded-xl bg-white border border-stone-200">
                  <span className="text-stone-400 block text-[10px]">Flora Tardía</span>
                  <span className="font-bold text-amber-800">1.2 – 1.5 kPa</span>
                </div>
              </div>
            </div>
          </div>

          {/* Result Card */}
          <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm flex flex-col justify-between space-y-4">
            <div>
              <span className="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1">
                Déficit de Presión de Vapor
              </span>
              <div className="text-4xl font-extrabold text-stone-900 tracking-tight">
                {currentVpd} <span className="text-lg font-semibold text-stone-500">kPa</span>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border text-xs space-y-2 ${vpdInfo.color}`}>
              <div className="font-extrabold text-sm">{vpdInfo.stage}</div>
              <p className="leading-relaxed font-medium">{vpdInfo.advice}</p>
            </div>

            <div className="text-[11px] text-stone-400 space-y-1">
              <div>• Aire: {vpdAirTemp}°C | {vpdHumidity}% HR</div>
              <div>• Hoja: {leafTemp.toFixed(1)}°C</div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: NUTRIENT DILUTION */}
      {activeTab === 'nutrients' && (
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
            <div>
              <h3 className="font-bold text-base text-stone-900 flex items-center gap-2">
                <Droplets className="w-5 h-5 text-cyan-600" />
                Calculadora de Mezcla y Dosificación en Tanque
              </h3>
              <p className="text-xs text-stone-500">Calcula los mililitros exactos según el volumen a preparar</p>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-stone-700">Litros a preparar:</label>
              <input
                type="number"
                min="1"
                max="500"
                value={waterTankLiters}
                onChange={(e) => setWaterTankLiters(parseFloat(e.target.value) || 1)}
                className="w-20 px-3 py-1.5 rounded-xl bg-cyan-50 border border-cyan-300 font-extrabold text-stone-900 text-sm text-center focus:outline-hidden"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-stone-50 text-stone-500 font-bold uppercase tracking-wider border-b border-stone-200">
                  <th className="py-3 px-4">Fertilizante / Aditivo</th>
                  <th className="py-3 px-4">Dosis recomendada (ml / L)</th>
                  <th className="py-3 px-4 text-right">Total a dosificar para {waterTankLiters} Litros</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {nutrientsList.map((nut, idx) => {
                  const totalMl = (nut.mlPerL * waterTankLiters).toFixed(1);
                  return (
                    <tr key={idx} className="hover:bg-stone-50/60 transition-colors">
                      <td className="py-3 px-4 font-bold text-stone-800">{nut.name}</td>
                      <td className="py-3 px-4">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={nut.mlPerL}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            const updated = [...nutrientsList];
                            updated[idx].mlPerL = val;
                            setNutrientsList(updated);
                          }}
                          className="w-20 px-2 py-1 rounded-lg bg-stone-50 border border-stone-200 font-semibold text-xs text-stone-800 focus:outline-hidden"
                        />{' '}
                        <span className="text-stone-400">ml/L</span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="px-3 py-1 rounded-xl bg-cyan-100 text-cyan-900 font-extrabold text-sm">
                          {totalMl} ml
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/80 text-xs text-amber-900 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <p>
              <strong>Orden de mezcla recomendado:</strong> Primero añade Silicio (si utilizas), luego CalMag y remueve bien. A continuación añade las bases nutricionales (A y luego B) y finalmente estimuladores biológicos o enzimas. Calibra el pH al final.
            </p>
          </div>
        </div>
      )}

      {/* TAB 3: ENERGY COST */}
      {activeTab === 'energy' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 bg-white rounded-3xl p-6 border border-stone-200 shadow-sm space-y-5">
            <h3 className="font-bold text-base text-stone-900 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-600" />
              Consumo Eléctrico del Indoor
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-stone-700 mb-1">Iluminación (Watts)</label>
                <input
                  type="number"
                  min="0"
                  value={lightWatts}
                  onChange={(e) => setLightWatts(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 font-bold text-stone-800 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Horas diarias de luz</label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={lightHoursDaily}
                  onChange={(e) => setLightHoursDaily(parseInt(e.target.value) || 1)}
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 font-bold text-stone-800 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Extractor / Ventilación (Watts)</label>
                <input
                  type="number"
                  min="0"
                  value={extractorWatts}
                  onChange={(e) => setExtractorWatts(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 font-bold text-stone-800 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block font-bold text-stone-700 mb-1">Ventiladores recirculación (Watts)</label>
                <input
                  type="number"
                  min="0"
                  value={fansWatts}
                  onChange={(e) => setFansWatts(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 font-bold text-stone-800 focus:outline-hidden"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-stone-700 mb-1">Costo por kWh ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={kwhCost}
                  onChange={(e) => setKwhCost(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-xl bg-stone-50 border border-stone-200 font-bold text-stone-800 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm flex flex-col justify-between space-y-4">
            <div>
              <span className="text-xs font-bold text-stone-400 uppercase tracking-wider block mb-1">
                Estimación de Costo
              </span>
              <div className="text-3xl font-extrabold text-stone-900 tracking-tight">
                ${monthlyCost.toFixed(2)}{' '}
                <span className="text-xs font-semibold text-stone-400">/ mes</span>
              </div>
            </div>

            <div className="space-y-2 text-xs bg-stone-50 p-4 rounded-2xl border border-stone-200/80">
              <div className="flex justify-between text-stone-600">
                <span>Potencia Total:</span>
                <span className="font-bold text-stone-900">{totalWatts} W</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Consumo Diario:</span>
                <span className="font-bold text-stone-900">{dailyKwh.toFixed(2)} kWh</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Consumo Mensual:</span>
                <span className="font-bold text-stone-900">{monthlyKwh.toFixed(1)} kWh</span>
              </div>
              <div className="flex justify-between text-stone-800 font-bold pt-2 border-t border-stone-200">
                <span>Costo Ciclo Completo (80d):</span>
                <span className="text-emerald-800">${cycleCost.toFixed(2)}</span>
              </div>
            </div>

            <p className="text-[10px] text-stone-400 italic">
              *Los valores son aproximados y varían según la tarifa eléctrica local contratada.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
