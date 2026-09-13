import { TimelineEvent, Cultivation } from '../types';
import { wateringService } from './wateringService';
import { environmentService } from './environmentService';
import { photoService } from './photoService';
import { diaryService } from './diaryService';
import { harvestService } from './harvestService';
import { aiService } from './aiService';

export const timelineService = {
  async getCultivationTimeline(cultivation: Cultivation): Promise<TimelineEvent[]> {
    const [waterings, envRecords, photos, notes, harvest, aiAnalyses] = await Promise.all([
      wateringService.getWateringsByCultivation(cultivation.id).catch(() => []),
      environmentService.getEnvironmentRecordsByCultivation(cultivation.id).catch(() => []),
      photoService.getPhotosByCultivation(cultivation.id).catch(() => []),
      diaryService.getDiaryEntriesByCultivation(cultivation.id).catch(() => []),
      harvestService.getHarvestByCultivationId(cultivation.id).catch(() => null),
      aiService.getAnalysesByCultivation(cultivation.id).catch(() => []),
    ]);

    const events: TimelineEvent[] = [];

    // Stage start
    if (cultivation.startDate) {
      events.push({
        id: `start-${cultivation.id}`,
        type: 'stage',
        date: cultivation.startDate,
        title: 'Inicio del cultivo 🌱',
        description: `Comenzó el seguimiento de ${cultivation.name} (${cultivation.type}) con ${cultivation.plantCount} planta(s).`,
        icon: 'Sprout',
        color: 'emerald',
      });
    }

    if (cultivation.floweringStartDate) {
      events.push({
        id: `flower-start-${cultivation.id}`,
        type: 'stage',
        date: cultivation.floweringStartDate,
        title: 'Paso a Floración 🌸',
        description: `Inicio del ciclo de floración 12/12 o prefloración automática.`,
        icon: 'Flower2',
        color: 'amber',
      });
    }

    // Waterings
    waterings.forEach((w) => {
      const phEcInfo = [
        w.phIn ? `pH: ${w.phIn}` : null,
        w.ecIn ? `EC: ${w.ecIn} mS/cm` : null,
        w.volumeLiters ? `${w.volumeLiters}L` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      events.push({
        id: `w-${w.id}`,
        type: 'watering',
        date: w.date + (w.time ? `T${w.time}:00` : 'T12:00:00'),
        title: `Riego ${w.volumeLiters ? `${w.volumeLiters} L` : ''} 💧`,
        description: [
          phEcInfo,
          w.productsUsed && w.productsUsed.length > 0
            ? `Productos: ${w.productsUsed.map((p) => p.name).join(', ')}`
            : null,
          w.observations,
        ]
          .filter(Boolean)
          .join('\n'),
        details: w as any,
        icon: 'Droplet',
        color: 'cyan',
        relatedId: w.id,
      });
    });

    // Environment records
    envRecords.forEach((e) => {
      events.push({
        id: `env-${e.id}`,
        type: 'environment',
        date: e.date + (e.time ? `T${e.time}:00` : 'T12:00:00'),
        title: `Registro Ambiental 🌡️`,
        description: `${e.temperatureC}°C · ${e.humidityPct}% HR ${
          e.vpdKPa ? `· VPD: ${e.vpdKPa} kPa` : ''
        } ${e.ppfd ? `· PPFD: ${e.ppfd} µmol` : ''} ${e.notes ? `\nNota: ${e.notes}` : ''}`,
        details: e as any,
        icon: 'Thermometer',
        color: 'orange',
        relatedId: e.id,
      });
    });

    // Photos
    photos.forEach((p) => {
      events.push({
        id: `p-${p.id}`,
        type: 'photo',
        date: p.date + 'T12:00:00',
        title: `Fotografía: ${p.category} 📸`,
        description: `Día ${p.dayOfCultivation} (${p.stage})${p.caption ? ` · "${p.caption}"` : ''}`,
        details: p as any,
        icon: 'Camera',
        color: 'blue',
        relatedId: p.id,
      });
    });

    // Diary notes
    notes.forEach((n) => {
      events.push({
        id: `note-${n.id}`,
        type: 'diary',
        date: n.date + 'T12:00:00',
        title: n.title || 'Nota de Diario 📝',
        description: n.content,
        details: n as any,
        icon: 'BookOpen',
        color: 'stone',
        relatedId: n.id,
      });
    });

    // AI Analyses
    aiAnalyses.forEach((ai) => {
      events.push({
        id: `ai-${ai.id}`,
        type: 'ai_analysis',
        date: ai.date + 'T12:00:00',
        title: `Análisis Cultiveta IA 🤖`,
        description: `${ai.observed.slice(0, 140)}... (Confianza: ${ai.confidence})`,
        details: ai as any,
        icon: 'Sparkles',
        color: 'purple',
        relatedId: ai.id,
      });
    });

    // Harvest
    if (harvest) {
      events.push({
        id: `harvest-${harvest.id}`,
        type: 'harvest',
        date: harvest.harvestDate + 'T12:00:00',
        title: `Cosecha Finalizada 🏁`,
        description: `Rendimiento final: ${harvest.finalDryWeightGrams}g secos (${harvest.gramsPerPlant}g/planta). Calificación: ${harvest.rating1To5}/5 ⭐`,
        details: harvest as any,
        icon: 'CheckCircle2',
        color: 'emerald',
        relatedId: harvest.id,
      });
    }

    // Sort descending by date
    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
};
