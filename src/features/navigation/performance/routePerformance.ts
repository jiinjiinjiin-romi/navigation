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

  window.performance.mark(`roadie:${name}`)
}

export function measureRoutePerformance(name: string, startMark: string, endMark: string) {
  if (!isRoutePerformanceEnabled()) {
    return
  }

  const start = `roadie:${startMark}`
  const end = `roadie:${endMark}`
  window.performance.measure(`roadie:${name}`, start, end)
  const [entry] = window.performance.getEntriesByName(`roadie:${name}`).slice(-1)

  if (entry) {
    console.info(`[roadie:perf] ${name}: ${entry.duration.toFixed(1)}ms`)
  }
}
