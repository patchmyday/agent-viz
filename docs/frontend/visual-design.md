# Visual Design

Dark sci-fi / holographic aesthetic with neon accents, glassmorphism panels, and particle effects.

## Color Palette

```css
/* Base */
--bg-primary: #080b14;          /* deep space black-blue */
--bg-surface: #0d1117;          /* panel backgrounds */
--bg-glass: rgba(13,17,23,0.7); /* glassmorphism panels */

/* Neon accents */
--accent-cyan: #00d9ff;         /* active agent nodes */
--accent-magenta: #ff2d78;      /* error/warning states */
--accent-purple: #7c3aed;       /* edges / connections */
--accent-green: #00ff9f;        /* success / completed */

/* Text */
--text-primary: #e6edf3;        /* main UI text */
--text-muted: #8b949e;          /* secondary info */
--text-code: #79c0ff;           /* monospace data */

/* Glows */
--glow-cyan: 0 0 20px rgba(0,217,255,0.4), 0 0 40px rgba(0,217,255,0.2);
--glow-magenta: 0 0 20px rgba(255,45,120,0.4);
```

## Typography

| Use | Font | Notes |
|-----|------|-------|
| UI labels/headings | Inter or Geist | System-level, no font load required |
| Code/data/IDs | JetBrains Mono or Fira Code | Monospace with ligatures |
| Node titles | Geist Mono | Matches Claude Code's own aesthetic |

## Visual Techniques

| Technique | Implementation |
|---|---|
| **Node glow** | CSS `box-shadow` with accent colors + `filter: blur()` |
| **Gradient borders** | CSS `conic-gradient` with rotation animation (Turbo Flow pattern) |
| **Edge animation** | SVG `linearGradient` + CSS animation along path |
| **Background particles** | tsParticles canvas layer behind React Flow viewport |
| **Panel glass** | `backdrop-filter: blur(12px)` + semi-transparent background |
| **Active node pulse** | CSS `@keyframes` pulsing `box-shadow` |
| **Message flow** | GSAP animation of dot traveling along edge SVG path |

## Agent Node States

| State | Visual |
|-------|--------|
| Active / Thinking | Cyan glow, pulsing border |
| Tool calling | Cyan glow + spinner badge |
| Completed | Green glow, solid border |
| Error | Magenta glow, shake animation |
| Idle / Waiting | Muted border, dim glow |
