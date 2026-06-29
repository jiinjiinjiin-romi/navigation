# Navi Orb

Internal visual state module for the Navi assistant orb.

## Import

```tsx
import { VoiceOrb, normalizeVoiceLevel } from '@/features/orb'
import type { OrbAssistantState, OrbColorTheme, VoiceOrbProps } from '@/features/orb'
```

## VoiceOrb

```tsx
<VoiceOrb
  state="listening"
  energy={0.6}
  size={240}
  colorTheme="daylight"
  reducedMotion={prefersReducedMotion}
/>
```

Props:

- `state`: `idle`, `listening`, `thinking`, `speaking`, `success`, or `error`.
- `energy`: normalized voice energy from `0` to `1`.
- `volume`: alias for `energy`; `energy` takes priority.
- `size`: number pixels or CSS size string. Default is `416`.
- `colorTheme`: `aurora`, `ocean`, `violet`, or `daylight`. Default is `aurora`.
- `reducedMotion`: reduce animation intensity.
- `className`: wrapper class name.
- `style`: wrapper inline style.

## State Mapping

- `idle`: standby with no voice energy.
- `listening`: wake call or user speech capture; pass mic energy.
- `thinking`: route lookup, action resolving, or assistant reasoning.
- `speaking`: Navi spoken prompt or response; pass TTS energy when available.
- `success`: completed action.
- `error`: failure, blocked permission, or unsafe action.

Use `normalizeVoiceLevel(value)` before passing analyser or synthetic voice levels into `energy`.
