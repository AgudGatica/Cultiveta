/** VPD (kPa) con la hoja 2 °C más fría que el aire si no se midió (Tetens). Sin navegador: lo usa también el servidor. */
export function calculateVPD(airTempC: number, humidityPct: number, leafTempC?: number): number {
  const leafTemp = leafTempC ?? airTempC - 2;
  const vpsat = 0.61078 * Math.exp((17.27 * leafTemp) / (leafTemp + 237.3));
  const vpair = 0.61078 * Math.exp((17.27 * airTempC) / (airTempC + 237.3)) * (humidityPct / 100);
  return Number(Math.max(0, vpsat - vpair).toFixed(2));
}
