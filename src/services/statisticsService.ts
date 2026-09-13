import { Cultivation, Harvest, Watering, EnvironmentRecord } from '../types';

export interface UserStatistics {
  totalCultivations: number;
  activeCultivations: number;
  finishedCultivations: number;
  totalGramsHarvested: number;
  avgGramsPerPlant: number;
  avgCycleDays: number;
  avgFloweringDays: number;
  geneticsDistribution: { name: string; count: number; totalGrams: number }[];
  typeDistribution: { type: string; count: number }[];
  historicalYields: { name: string; date: string; dryGrams: number; rating: number }[];
}

export const statisticsService = {
  computeStatistics(
    cultivations: Cultivation[],
    harvests: Harvest[]
  ): UserStatistics {
    const totalCultivations = cultivations.length;
    const activeCultivations = cultivations.filter((c) => !c.isFinished).length;
    const finishedCultivations = harvests.length;

    const totalGramsHarvested = harvests.reduce((acc, h) => acc + (h.finalDryWeightGrams || 0), 0);

    const totalPlantsHarvested = harvests.reduce((acc, h) => acc + (h.plantCount || 1), 0);
    const avgGramsPerPlant = totalPlantsHarvested > 0 ? Number((totalGramsHarvested / totalPlantsHarvested).toFixed(1)) : 0;

    const avgCycleDays = harvests.length > 0
      ? Math.round(harvests.reduce((acc, h) => acc + (h.totalDays || 0), 0) / harvests.length)
      : 0;

    const harvestsWithFlowering = harvests.filter((h) => h.floweringDays && h.floweringDays > 0);
    const avgFloweringDays = harvestsWithFlowering.length > 0
      ? Math.round(harvestsWithFlowering.reduce((acc, h) => acc + (h.floweringDays || 0), 0) / harvestsWithFlowering.length)
      : 0;

    // Genetics distribution
    const genMap: Record<string, { count: number; totalGrams: number }> = {};
    cultivations.forEach((c) => {
      const gName = c.geneticsName || 'Sin especificar';
      if (!genMap[gName]) genMap[gName] = { count: 0, totalGrams: 0 };
      genMap[gName].count += 1;
    });
    harvests.forEach((h) => {
      const gName = h.geneticsName || 'Sin especificar';
      if (genMap[gName]) {
        genMap[gName].totalGrams += h.finalDryWeightGrams || 0;
      }
    });

    const geneticsDistribution = Object.entries(genMap).map(([name, data]) => ({
      name,
      count: data.count,
      totalGrams: data.totalGrams,
    }));

    // Type distribution (Indoor, Outdoor, Invernadero)
    const typeMap: Record<string, number> = { Indoor: 0, Outdoor: 0, Invernadero: 0 };
    cultivations.forEach((c) => {
      if (typeMap[c.type] !== undefined) {
        typeMap[c.type] += 1;
      } else {
        typeMap[c.type] = 1;
      }
    });
    const typeDistribution = Object.entries(typeMap).map(([type, count]) => ({ type, count }));

    // Historical yields
    const historicalYields = harvests
      .slice()
      .sort((a, b) => new Date(a.harvestDate).getTime() - new Date(b.harvestDate).getTime())
      .map((h) => ({
        name: h.cultivationName,
        date: h.harvestDate,
        dryGrams: h.finalDryWeightGrams,
        rating: h.rating1To5,
      }));

    return {
      totalCultivations,
      activeCultivations,
      finishedCultivations,
      totalGramsHarvested,
      avgGramsPerPlant,
      avgCycleDays,
      avgFloweringDays,
      geneticsDistribution,
      typeDistribution,
      historicalYields,
    };
  }
};
