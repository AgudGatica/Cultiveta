import { Cultivation, GoogleCalendarEvent, CultivationCalendarPlan, Watering } from '../types';
import {
  buildCultivationStageSchedule,
  addDays,
  formatDateOnly,
} from '../utils/growthStageUtils';

const CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3';

export const calendarService = {
  /**
   * Fetch events from the user's primary Google Calendar associated with a specific cultivation
   */
  async listCultivationEvents(accessToken: string, cultivationId?: string): Promise<GoogleCalendarEvent[]> {
    try {
      const url = new URL(`${CALENDAR_API_BASE}/calendars/primary/events`);
      url.searchParams.set('maxResults', '100');
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');
      // Look from 30 days ago into the future
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 30);
      url.searchParams.set('timeMin', pastDate.toISOString());

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Error ${res.status} al consultar Google Calendar`);
      }

      const data = await res.json();
      const items: GoogleCalendarEvent[] = data.items || [];

      if (!cultivationId) {
        return items.filter(item => item.summary?.includes('[Cultiveta]') || item.extendedProperties?.private?.cultivationId);
      }

      return items.filter((item) => {
        const itemCropId = item.extendedProperties?.private?.cultivationId;
        if (itemCropId === cultivationId) return true;
        // Fallback title match
        return item.summary?.includes(`[Cultiveta]`) && item.description?.includes(`ID: ${cultivationId}`);
      });
    } catch (err: any) {
      console.error('Error in listCultivationEvents:', err);
      throw err;
    }
  },

  /**
   * Create an event in the user's primary Google Calendar
   */
  async createCalendarEvent(
    accessToken: string,
    cultivation: Cultivation,
    plan: CultivationCalendarPlan
  ): Promise<GoogleCalendarEvent> {
    const isAllDay = !plan.date.includes('T');
    
    // Add end date for all day events (+1 day standard RFC3339 for Google Calendar all-day)
    let endDate = plan.endDate || plan.date;
    if (isAllDay) {
      endDate = addDays(plan.date, 1);
    }

    const payload: Record<string, any> = {
      summary: `🌱 [Cultiveta] ${plan.title} - ${cultivation.name}`,
      description: `${plan.description}\n\n━━━━━━━━━━━━━━━━━━━━\nCultivo: ${cultivation.name} (${cultivation.geneticsName || 'Genética s/d'})\nEtapa actual: ${cultivation.currentStage}\nID: ${cultivation.id}\nSincronizado desde Cultiveta OS.`,
      start: isAllDay ? { date: plan.date } : { dateTime: new Date(plan.date).toISOString() },
      end: isAllDay ? { date: endDate } : { dateTime: new Date(endDate).toISOString() },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 1440 }, // Recordatorio 1 día antes (1440 min)
          { method: 'email', minutes: 1440 }, // Email 1 día antes
        ],
      },
      extendedProperties: {
        private: {
          cultivationId: cultivation.id,
          cropEventCategory: plan.type,
          stageId: plan.stageId || '',
          cultivetaApp: 'true',
        },
      },
    };

    const res = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Error ${res.status} al crear evento en Google Calendar`);
    }

    return await res.json();
  },

  /**
   * Update an existing event in Google Calendar
   */
  async updateCalendarEvent(
    accessToken: string,
    eventId: string,
    cultivation: Cultivation,
    plan: CultivationCalendarPlan
  ): Promise<GoogleCalendarEvent> {
    const isAllDay = !plan.date.includes('T');
    let endDate = plan.endDate || plan.date;
    if (isAllDay) {
      endDate = addDays(plan.date, 1);
    }

    const payload: Record<string, any> = {
      summary: `🌱 [Cultiveta] ${plan.title} - ${cultivation.name}`,
      description: `${plan.description}\n\n━━━━━━━━━━━━━━━━━━━━\nCultivo: ${cultivation.name} (${cultivation.geneticsName || 'Genética s/d'})\nEtapa actual: ${cultivation.currentStage}\nID: ${cultivation.id}\nSincronizado desde Cultiveta OS.`,
      start: isAllDay ? { date: plan.date } : { dateTime: new Date(plan.date).toISOString() },
      end: isAllDay ? { date: endDate } : { dateTime: new Date(endDate).toISOString() },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 1440 }, // Recordatorio 1 día antes (1440 min)
          { method: 'email', minutes: 1440 },
        ],
      },
      extendedProperties: {
        private: {
          cultivationId: cultivation.id,
          cropEventCategory: plan.type,
          stageId: plan.stageId || '',
          cultivetaApp: 'true',
        },
      },
    };

    const res = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events/${eventId}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Error ${res.status} al actualizar evento en Google Calendar`);
    }

    return await res.json();
  },

  /**
   * Delete an event from Google Calendar.
   * NOTE: Mandated user confirmation should be handled in UI before calling this!
   */
  async deleteCalendarEvent(accessToken: string, eventId: string): Promise<void> {
    const res = await fetch(`${CALENDAR_API_BASE}/calendars/primary/events/${eventId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok && res.status !== 404) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Error ${res.status} al eliminar evento en Google Calendar`);
    }
  },

  /**
   * Calculate smart cultivation roadmap and calendar events.
   * Strictly uses buildCultivationStageSchedule(cultivation) as source of truth.
   */
  generateSuggestedPlans(
    cultivation: Cultivation,
    latestWatering?: Watering | null
  ): CultivationCalendarPlan[] {
    const plans: CultivationCalendarPlan[] = [];
    const now = new Date();
    const todayStr = formatDateOnly(now.getFullYear(), now.getMonth() + 1, now.getDate());

    // 1. Next watering recommendation
    let nextWateringDateStr = addDays(todayStr, 1);
    if (latestWatering?.date) {
      const cleanWaterDate = latestWatering.date.split('T')[0];
      nextWateringDateStr = addDays(cleanWaterDate, 3);
      if (nextWateringDateStr < todayStr) {
        nextWateringDateStr = addDays(todayStr, 1);
      }
    }

    plans.push({
      id: `suggested_water_${cultivation.id}`,
      title: 'Recordatorio de Riego y Nutrición',
      date: nextWateringDateStr,
      type: 'watering',
      description: `Comprobar peso de la maceta y humedad del sustrato. Preparar solución nutritiva con pH calibrado (6.0 - 6.5) y EC recomendada para etapa de ${cultivation.currentStage || 'Vegetativo'}.`,
    });

    // 2. Stage schedule roadmap events strictly derived from buildCultivationStageSchedule
    const schedule = buildCultivationStageSchedule(cultivation);

    for (let i = 0; i < schedule.stages.length; i++) {
      const st = schedule.stages[i];

      // For stage transitions (i > 0), the transition occurs at st.startDate
      if (i > 0) {
        const prevSt = schedule.stages[i - 1];
        const isHarvest = st.name === 'Cosecha' || st.name === 'Secado' || st.name === 'Finalizado';

        const stageTitle = isHarvest
          ? 'Floración → Cosecha (Corte estimado)'
          : `${prevSt.name} → ${st.name}`;

        if (st.startDate >= todayStr) {
          plans.push({
            id: `suggested_stage_${cultivation.id}_${st.id}`,
            stageId: st.id,
            title: stageTitle,
            date: st.startDate,
            type: isHarvest ? 'harvest' : 'stage_change',
            description: isHarvest
              ? `Ventana estimada de cosecha para ${cultivation.name}. Monitorear tricomas en cálices medios (70-80% lechosos, 15-20% ámbar). Preparar secadero a 18-20°C y 55-60% HR.`
              : `Transición estimada de ${prevSt.name} a ${st.name} en ${cultivation.name}. Revisar cambio de fotoperiodo, nutrientes y parámetros ambientales según corresponda.`,
          });
        }
      }
    }

    // 3. Agronomic milestones derived from schedule
    const flowStage = schedule.floweringStage;
    if (flowStage) {
      // Defoliation at week 3 (day 21 of flower)
      const defolDate = addDays(flowStage.startDate, 21);
      if (defolDate >= todayStr && defolDate < schedule.estimatedHarvestDate) {
        plans.push({
          id: `suggested_defol_${cultivation.id}`,
          title: 'Desfoliación y Limpieza de Bajos (Semana 3)',
          date: defolDate,
          type: 'defoliation',
          description: `Retirar hojas tapadas y brotes bajos sin potencial en ${cultivation.name} para maximizar el paso de luz y ventilación en las flores principales.`,
        });
      }

      // Flush 12 days before harvest
      const flushDate = addDays(schedule.estimatedHarvestDate, -12);
      if (flushDate >= todayStr && flushDate > flowStage.startDate) {
        plans.push({
          id: `suggested_flush_${cultivation.id}`,
          title: 'Lavado de Raíces (Flush)',
          date: flushDate,
          type: 'flush',
          description: `Comenzar riego exclusivo con agua osmotizada/desclorada sin nutrientes para limpiar sales residuales antes de la cosecha en ${cultivation.name}.`,
        });
      }
    }

    return plans;
  },
};
