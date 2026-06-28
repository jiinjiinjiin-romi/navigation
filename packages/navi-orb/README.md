# Navi Orb

AI voice assistant orb component for React.

## Build

```bash
npm run build:lib
```

## Install From Another Local Project

```bash
npm install /Users/anjeonghyeon/web/navi_orb/orb
```

## Usage

```tsx
import { VoiceOrb } from 'navi-orb'

export function AssistantOrb() {
  return (
    <VoiceOrb
      state="listening"
      energy={0.6}
      size={240}
      colorTheme="daylight"
    />
  )
}
```

Use `colorTheme="daylight"` on white or bright service backgrounds.
The component renders a transparent canvas and does not add a wrapper background or frame.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `state` | `'idle' \| 'listening' \| 'thinking' \| 'speaking' \| 'success' \| 'error'` | Required | Orb state. Controls expression and motion. |
| `energy` | `number` | `0` | Voice energy from `0` to `1`. Use for mic or TTS volume. |
| `volume` | `number` | `0` | Alias for `energy`. `energy` takes priority. |
| `size` | `number \| string` | `416` | Orb size. Number values are treated as pixels. |
| `colorTheme` | `'aurora' \| 'ocean' \| 'violet' \| 'daylight'` | `'aurora'` | Orb color theme. Use `daylight` on white or bright backgrounds. |
| `reducedMotion` | `boolean` | `false` | Reduces animation intensity. |
| `className` | `string` | `undefined` | Extra wrapper class name. |
| `style` | `CSSProperties` | `undefined` | Extra wrapper inline style. |

## States

| State | Use Case |
|-------|----------|
| `idle` | Waiting for user input. |
| `listening` | User is speaking. Pass mic volume to `energy`. |
| `thinking` | AI is processing. |
| `speaking` | AI is responding. Pass TTS volume to `energy`. |
| `success` | Short completion feedback. |
| `error` | Short failure feedback. |

## Local Update

After changing this package, rebuild and reinstall it in the target project:

```bash
cd /Users/anjeonghyeon/web/navi_orb/orb
npm run build:lib

cd /path/to/other-project
npm install /Users/anjeonghyeon/web/navi_orb/orb
```
