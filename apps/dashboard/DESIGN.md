---
name: Software Factory Dashboard
description: Sparse local ops console for pipeline runs — clinical surfaces, mono instruments, status color only for state.
colors:
  accent: "#c4cdd8"
  accent-contrast: "#0b0d10"
  bg: "#0b0d10"
  surface: "#12151a"
  border: "#252a33"
  text: "#d8dde6"
  text-muted: "#8b95a5"
  idle: "#2a303a"
  running: "#3d8bfd"
  selection: "#3d8bfd"
  success: "#3ecf8e"
  warning: "#e6b450"
  danger: "#e85d5d"
typography:
  title:
    fontFamily: "IBM Plex Mono, SF Mono, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.04em"
  body:
    fontFamily: "IBM Plex Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  label:
    fontFamily: "IBM Plex Mono, SF Mono, Consolas, monospace"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.06em"
  badge:
    fontFamily: "IBM Plex Mono, SF Mono, Consolas, monospace"
    fontSize: "10px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.04em"
rounded:
  control: "2px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "5px 10px"
    typography: "{typography.badge}"
  button-hover:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "5px 10px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-contrast}"
    rounded: "{rounded.control}"
    padding: "5px 10px"
  button-primary-hover:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-contrast}"
    rounded: "{rounded.control}"
    padding: "5px 10px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.danger}"
    rounded: "{rounded.control}"
    padding: "5px 10px"
  input:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "6px 8px"
  status-badge:
    backgroundColor: "{colors.idle}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.control}"
    padding: "1px 6px"
    typography: "{typography.badge}"
  factory-node:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
    typography: "{typography.badge}"
---

# Design System: Software Factory Dashboard

## Overview

**Creative North Star: "Clinical Ops Console"**

This is a local operate surface, not a product marketing page. The built UI is a near-black, low-chrome monitor: pipeline state and actions first, surfaces that read as instrument panels rather than cards. IBM Plex Sans carries UI copy; IBM Plex Mono marks the instruments — brand title, section labels, run ids, buttons, badges, graph nodes, and event lines.

Depth comes from tonal stacking (`#0b0d10` field / `#12151a` panels) and 1px `#252a33` borders. Chromatic color is reserved for run and node status. The Create CTA is a neutral cool-gray fill (`#c4cdd8` on `#0b0d10`), not a branded accent splash. Confirmed rejections: SaaS dashboard costume, gradients, card stacks, hero chrome, decorative glow as default elevation.

**Key Characteristics:**
- Near-black clinical field with one surface step up
- 1px hairline borders; essentially flat elevation
- Dual type: Plex Sans UI + Plex Mono instruments
- Status hues only for run/node state (and matching selection)
- Dense operate layout: header / create+runs / toolbar+graph+outcome

## Colors

A cool near-black neutral system with a silver instrument accent; chroma appears only as status.

### Primary
- **Instrument Silver** (`#c4cdd8`): Neutral Create CTA fill and link color. Paired with **Pit Ink** (`#0b0d10`) as accent contrast text. Deliberately unsaturated so it never competes with status.

### Neutral
- **Pit Ink** (`#0b0d10`): Page field, graph canvas, field backgrounds.
- **Panel Steel** (`#12151a`): Header, sidebar, outcome strip, node fills, control chrome.
- **Hairline Slate** (`#252a33`): All structural borders, graph edges, dividers.
- **Signal Mist** (`#d8dde6`): Primary readable text.
- **Quiet Mist** (`#8b95a5`): Muted labels, meta, empty-state copy, idle node text.
- **Idle Well** (`#2a303a`): Pending/idle badge wells.

### Status (functional — not brand accents)
- **Run Blue** (`#3d8bfd`): Running state and selection tint (same token as selection).
- **Pass Green** (`#3ecf8e`): Succeeded.
- **Warn Amber** (`#e6b450`): Cancelled / abstained.
- **Fail Coral** (`#e85d5d`): Failed, rolled back, danger actions, error banner.

### Named Rules
**The Status-Only Color Rule.** Chromatic color is for run/node status (and the matching selection cue). UI chrome, fills, and the primary CTA stay neutral.

**The Neutral CTA Rule.** Primary actions use Instrument Silver on Pit Ink — never a saturated brand fill.

## Typography

**Display Font:** unused (no marketing display ramp)
**Body Font:** IBM Plex Sans (with system-ui, sans-serif)
**Label/Mono Font:** IBM Plex Mono (with SF Mono, Consolas, monospace)

**Character:** Clinical dual-face pairing. Sans for readable operate copy; mono for everything that behaves like an instrument readout or control.

### Hierarchy
- **Title** (600, 14px, uppercase, 0.04em tracking, mono): Header brand "Software Factory".
- **Body** (400, 13px / 1.4, sans): Default UI text; secondary blocks often 12px.
- **Label** (500, 11px, uppercase, 0.06em tracking, mono, muted): Sidebar section headings; form labels are 11px sans muted without forced uppercase.
- **Badge** (400, 10px, uppercase, 0.04em, mono): Status badges, buttons (11px mono on `.btn`), factory nodes (10px), attempt lines (9px).

### Named Rules
**The Mono Instrument Rule.** Run ids, node labels, buttons, badges, section titles, and event lines use IBM Plex Mono. Body explanation copy stays on Plex Sans.

## Layout

Full-height operate shell: header row, optional error banner, then a two-column body (`300px` sidebar + fluid main). Sidebar stacks Create task over a flex-scrolling Runs list. Main stacks toolbar → graph panel (min-height `280px`) → outcome strip. Base spacing token is `12px`; common paddings are `8 / 10 / 12 / 14 / 16 / 20`. Below `840px`, the body stacks: sidebar as a capped upper band (`minmax(220px, 38vh)`), graph below — a real stack, not a collapsed costume.

## Elevation & Depth

Flat by default. Surfaces separate by tone (bg vs surface) and 1px borders. No ambient drop shadows; React Flow controls explicitly set `box-shadow: none`. Depth cues that do appear are state rings: focus (`0 0 0 2px` bg + `4px` selection), selected node (`0 0 0 1px` selection), and a running-node pulse (expanding transparent ring, 1.4s).

### Named Rules
**The Flat Panel Rule.** Do not introduce drop shadows for resting chrome. Use tonal steps and 1px borders; rings only for focus, selection, or running pulse.

## Shapes

Near-square controls: global radius `2px` on buttons, inputs, badges, nodes, and flow controls. Borders are always 1px solid Hairline Slate (or status color on live nodes). No pills, no large card radii, no clipped hero shapes.

## Components

### Buttons
Tight mono controls — transparent by default, silver when primary, coral outline when destructive.
- **Shape:** 2px radius; 1px border; padding `5px 10px`; mono ~11px
- **Default:** transparent on field; hover brightens border to Quiet Mist
- **Primary:** Instrument Silver fill + Pit Ink text; hover `brightness(1.08)`
- **Danger:** transparent with Fail Coral border/text; hover 12% coral wash
- **Disabled:** opacity `0.4`

### Status badges
Inline uppercase mono chips. Fill is a 20% mix of the status hue (idle uses Idle Well). Text takes the status color (or Quiet Mist when idle).

### Cards / Containers
No card component. Panels are full-bleed zones (header, sidebar, outcome) with border dividers — not floated cards.

### Inputs / Fields
Pit Ink wells, 1px Hairline Slate, 2px radius, padding `6px 8px`. Hover border → Quiet Mist. Focus uses the global double-ring. Errors are 11px Fail Coral text under the field.

### Navigation
Brand header only: mono uppercase product name + 12px muted subtitle. No marketing nav, no icon rail.

### Factory node (signature)
Mono readout tile (`min-width: 120px`) on Panel Steel. Border/text follow status; current/running pulses. Selected adds selection wash + 1px selection ring. Attempt count appears as a quiet 9px secondary line.

### Run list item
Full-width transparent rows with hairline separators. Hover: 4% text wash. Selected: 12% selection wash. Id in mono; meta row holds badge + node + time.

### Outcome strip
Surface band under the graph: uppercase mono "Outcome" label, sans explanation, optional mono event list (max-height ~80px, hairline separators).

## Do's and Don'ts

### Do:
- **Do** keep chromatic color on status, selection, and danger affordances only.
- **Do** use Instrument Silver for the primary Create action and links.
- **Do** separate zones with 1px Hairline Slate and bg/surface tone steps.
- **Do** put ids, nodes, buttons, and badges on IBM Plex Mono.
- **Do** stack sidebar above graph below `840px` with a real scrollable upper band.

### Don't:
- **Don't** costume the console as a SaaS dashboard (card stacks, gradients, hero chrome, purple glow themes).
- **Don't** introduce a saturated brand primary that competes with status blue/green/amber/coral.
- **Don't** add resting drop shadows or large radii; keep the 2px control language.
- **Don't** use display/marketing type scales — this surface has title/body/label/badge only.
