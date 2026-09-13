import { Cultivation, GoogleCalendarEvent, CultivationCalendarPlan, Watering } from '../types';

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
      const nextDay = new Date(plan.date);
      nextDay.setDate(nextDay.getDate() + 1);
      endDate = nextDay.toISOString().split('T')[0];
    }

    const payload: Record<string, any> = {
      summary: `🌱 [Cultiveta] ${plan.title} - ${cultivation.name}`,
      description: `${plan.description}\n\n━━━━━━━━━━━━━━━━━━━━\nCultivo: ${cultivation.name} (${cultivation.geneticsName || 'Genética s/d'})\nEtapa actual: ${cultivation.currentStage}\nID: ${cultivation.id}\nSincronizado desde Cultiveta OS.`,
      start: isAllDay ? { date: plan.date } : { dateTime: new Date(plan.date).toISOString() },
      end: isAllDay ? { date: endDate } : { dateTime: new Date(endDate).toISOString() },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 540 }, // 9:00 AM on the day
          { method: 'email', minutes: 1440 }, // 1 day before
        ],
      },
      extendedProperties: {
        private: {
          cultivationId: cultivation.id,
          cropEventCategory: plan.type,
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
      const nextDay = new Date(plan.date);
      nextDay.setDate(nextDay.getDate() + 1);
      endDate = nextDay.toISOString().split('T')[0];
    }

    const payload: Record<string, any> = {
      summary: `🌱 [Cultiveta] ${plan.title} - ${cultivation.name}`,
      description: `${plan.description}\n\n━━━━━━━━━━━━━━━━━━━━\nCultivo: ${cultivation.name} (${cultivation.geneticsName || 'Genética s/d'})\nEtapa actual: ${cultivation.currentStage}\nID: ${cultivation.id}\nSincronizado desde Cultiveta OS.`,
      start: isAllDay ? { date: plan.date } : { dateTime: new Date(plan.date).toISOString() },
      end: isAllDay ? { date: endDate } : { dateTime: new Date(endDate).toISOString() },
      extendedProperties: {
        private: {
          cultivationId: cultivation.id,
          cropEventCategory: plan.type,
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
   * Calculate smart cultivation roadmap and calendar events
   */
  generateSuggestedPlans(
    cultivation: Cultivation,
    latestWatering?: Watering | null
  ): CultivationCalendarPlan[] {
    const plans: CultivationCalendarPlan[] = [];
    const today = new Date();

    // 1. Next watering recommendation
    let nextWateringDate = new Date();
    if (latestWatering?.date) {
      const lastW = new Date(latestWatering.date);
      // Typically water every 2-3 days
      nextWateringDate = new Date(lastW);
      nextWateringDate.setDate(nextWateringDate.getDate() + 3);
      if (nextWateringDate < today) {
        // overdue - schedule for today or tomorrow morning
        nextWateringDate = new Date(today);
        nextWateringDate.setDate(nextWateringDate.getDate() + 1);
      }
    } else {
      nextWateringDate.setDate(today.getDate() + 1);
    }

    plans.push({
      id: `suggested_water_${cultivation.id}`,
      title: 'Recordatorio de Riego y Nutrición',
      date: nextWateringDate.toISOString().split('T')[0],
      type: 'watering',
      description: `Comprobar peso de la maceta y humedad del sustrato. Preparar solución nutritiva con pH calibrado (6.0 - 6.5) y EC recomendada para etapa de ${cultivation.currentStage}.`,
    });

    // 2. Stage-based milestones
    const startDate = new Date(cultivation.startDate);
    const floweringWeeks = cultivation.declaredFloweringWeeks || 9;
    const isAuto = cultivation.photoperiodType === 'Automática';

    if (isAuto) {
      // Autos typically flower around day 25-30 and finish around day 70-85
      const estimatedFlowerDate = new Date(startDate);
      estimatedFlowerDate.setDate(estimatedFlowerDate.getDate() + 28);
      if (estimatedFlowerDate >= today) {
        plans.push({
          id: `suggested_preflower_${cultivation.id}`,
          title: 'Inicio estimado de Floración (Auto)',
          date: estimatedFlowerDate.toISOString().split('T')[0],
          type: 'stage_change',
          description: `Las plantas automáticas inician su floración. Cambiar fertilizante base a booster de prefloración y verificar altura de luminaria.`,
        });
      }

      const estimatedHarvestDate = new Date(startDate);
      estimatedHarvestDate.setDate(estimatedHarvestDate.getDate() + (floweringWeeks * 7 + 21));
      if (estimatedHarvestDate >= today) {
        const flushDate = new Date(estimatedHarvestDate);
        flushDate.setDate(flushDate.getDate() - 12);
        if (flushDate >= today) {
          plans.push({
            id: `suggested_flush_${cultivation.id}`,
            title: 'Lavado de Raíces (Flush)',
            date: flushDate.toISOString().split('T')[0],
            type: 'flush',
            description: `Comenzar riego exclusivo con agua osmotizada/desclorada sin nutrientes para limpiar sales residuales antes de la cosecha.`,
          });
        }

        plans.push({
          id: `suggested_harvest_${cultivation.id}`,
          title: 'Ventana Estimada de Cosecha',
          date: estimatedHarvestDate.toISOString().split('T')[0],
          type: 'harvest',
          description: `Inspección de tricomas con lupa o microscopio 60x (buscar 70-80% lechosos y 15-20% ámbar). Preparar espacio de secado a 18-20°C y 55-60% HR.`,
        });
      }
    } else {
      // Photoperiodic
      if (cultivation.floweringStartDate) {
        const flowStart = new Date(cultivation.floweringStartDate);
        // Defoliation / Poda de bajos at day 21 of flower
        const defoliationDate = new Date(flowStart);
        defoliationDate.setDate(defoliationDate.getDate() + 21);
        if (defoliationDate >= today) {
          plans.push({
            id: `suggested_defol_${cultivation.id}`,
            title: 'Desfoliación y Limpieza de Bajos (Semana 3)',
            date: defoliationDate.toISOString().split('T')[0],
            type: 'defoliation',
            description: `Retirar hojas tapadas y brotes bajos sin potencial para maximizar el paso de luz y ventilación en las flores principales.`,
          });
        }

        const estimatedHarvestDate = new Date(flowStart);
        estimatedHarvestDate.setDate(estimatedHarvestDate.getDate() + floweringWeeks * 7);
        if (estimatedHarvestDate >= today) {
          const flushDate = new Date(estimatedHarvestDate);
          flushDate.setDate(flushDate.getDate() - 14);
          if (flushDate >= today) {
            plans.push({
              id: `suggested_flush_${cultivation.id}`,
              title: 'Lavado de Raíces (Flush)',
              date: flushDate.toISOString().split('T')[0],
              type: 'flush',
              description: `Comenzar lavado de sales con agua sola. Dejar secar el sustrato adecuadamente entre aplicaciones.`,
            });
          }

          plans.push({
            id: `suggested_harvest_${cultivation.id}`,
            title: 'Ventana Estimada de Cosecha',
            date: estimatedHarvestDate.toISOString().split('T')[0],
            type: 'harvest',
            description: `Monitorear tricomas en cálices medios. Planificar corte de plantas por la mañana antes del encendido del foco.`,
          });
        }
      } else {
        // Still in vegetative - suggest switch date if older than 30 days
        const switchDate = new Date(startDate);
        switchDate.setDate(switchDate.getDate() + 35);
        if (switchDate >= today) {
          plans.push({
            id: `suggested_switch_${cultivation.id}`,
            title: 'Revisión para Cambio a 12/12 (Floración)',
            date: switchDate.toISOString().split('T')[0],
            type: 'stage_change',
            description: `Evaluar si la canopia ha cubierto el 70-80% del espacio de cultivo para cambiar el fotoperiodo a 12 horas de luz y 12 de oscuridad.`,
          });
        }
      }
    }

    return plans;
  },
};
