import { useEffect, useState } from 'react'
import { DashboardApp } from './features/dashboard/DashboardApp'
import { NavigationShell } from './features/navigation/components/NavigationShell'

function App() {
  const [pathname, setPathname] = useState(() => window.location.pathname)

  useEffect(() => {
    const handleNavigation = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', handleNavigation)

    const originalPushState = window.history.pushState
    const originalReplaceState = window.history.replaceState

    window.history.pushState = function pushState(...args) {
      originalPushState.apply(window.history, args)
      handleNavigation()
    }
    window.history.replaceState = function replaceState(...args) {
      originalReplaceState.apply(window.history, args)
      handleNavigation()
    }

    return () => {
      window.removeEventListener('popstate', handleNavigation)
      window.history.pushState = originalPushState
      window.history.replaceState = originalReplaceState
    }
  }, [])

  if (pathname.startsWith('/dashboard')) {
    return <DashboardApp />
  }

  return <NavigationShell />
}

export default App
