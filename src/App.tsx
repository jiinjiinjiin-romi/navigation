import { NavigationShell, type AssistantVariant } from './features/navigation/components/NavigationShell'

function getAssistantVariant(pathname: string): AssistantVariant | undefined {
  if (pathname === '/1') {
    return 'focus-hud'
  }

  if (pathname === '/2') {
    return 'action-dock'
  }

  if (pathname === '/3') {
    return 'timeline-sheet'
  }

  return undefined
}

function App() {
  return <NavigationShell assistantVariant={getAssistantVariant(window.location.pathname)} />
}

export default App
