const NAVI_PERF_STORAGE_KEY = 'naviPerf'

function isRoutePerformanceEnabled() {
  return Boolean(
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    window.localStorage.getItem(NAVI_PERF_STORAGE_KEY) === '1',
  )
}

export function markRoutePerformance(name: string) {
  if (!isRoutePerformanceEnabled()) {
    return
  }

  window.performance.mark(`navi:${name}`)
}

export function measureRoutePerformance(name: string, startMark: string, endMark: string) {
  if (!isRoutePerformanceEnabled()) {
    return
  }

  const start = `navi:${startMark}`
  const end = `navi:${endMark}`
  window.performance.measure(`navi:${name}`, start, end)
  const [entry] = window.performance.getEntriesByName(`navi:${name}`).slice(-1)

  if (entry) {
    console.info(`[navi:perf] ${name}: ${entry.duration.toFixed(1)}ms`)
  }
}
