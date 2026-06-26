const MIN_SIMULATION_DURATION_MS = 60_000
const MAX_SIMULATION_DURATION_MS = 20 * 60_000
const SIMULATION_SPEED_METERS_PER_SECOND = 12.5

export function getSimulationDurationMs(
  routeDurationSeconds: number,
  routeDistanceMeters?: number,
) {
  const steadySpeedDurationMs = routeDistanceMeters && routeDistanceMeters > 0
    ? (routeDistanceMeters / SIMULATION_SPEED_METERS_PER_SECOND) * 1000
    : routeDurationSeconds * 1000

  return Math.max(
    MIN_SIMULATION_DURATION_MS,
    Math.min(
      steadySpeedDurationMs,
      MAX_SIMULATION_DURATION_MS,
    ),
  )
}
