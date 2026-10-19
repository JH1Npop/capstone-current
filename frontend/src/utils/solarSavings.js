// Mirrors backend/services/solar_calculator.py (calculation 1.1) so the page and the saved estimate agree.
// Solar used while the sun is up replaces power bought at the full rate; the rest is exported and,
// with net metering, earns only the export credit, up to the energy still bought from the grid.
export function estimateSolarSavings({ monthlyConsumption, monthlyGeneration, electricityRate, daytimeUsagePercent, exportCreditRate }) {
  const consumption = Math.max(0, Number(monthlyConsumption) || 0);
  const generation = Math.max(0, Number(monthlyGeneration) || 0);
  const rate = Math.max(0, Number(electricityRate) || 0);
  const daytimeShare = Math.min(100, Math.max(0, Number(daytimeUsagePercent) || 0)) / 100;
  const exportCredit = Math.min(rate, Math.max(0, Number(exportCreditRate) || 0));

  const selfConsumed = Math.min(generation, consumption * daytimeShare);
  const exported = generation - selfConsumed;
  const creditedExport = Math.min(exported, consumption - selfConsumed);
  const withoutNetMetering = selfConsumed * rate;
  return {
    selfConsumed,
    exported,
    exportCredit,
    withoutNetMetering,
    withNetMetering: withoutNetMetering + creditedExport * exportCredit,
  };
}
