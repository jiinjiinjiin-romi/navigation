export function loadTmapSdk() {
  if (window.Tmapv3) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1

      if (window.Tmapv3) {
        window.clearInterval(timer)
        resolve()
        return
      }

      if (attempts >= 50) {
        window.clearInterval(timer)
        reject(new Error('TMAP SDK를 불러오지 못했습니다.'))
      }
    }, 100)
  })
}
