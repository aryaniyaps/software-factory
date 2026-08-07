# Software Factory Dashboard — Operate Mode

## Purpose

Local-only operations console for the Software Factory execution pipeline. Not a product marketing surface — a sparse clinical tool for engineers running the factory on their machine.

## Mode: Operate

- **Audience:** developer operating the factory locally
- **Primary task:** create runs, watch node progression, cancel or rerun
- **Tone:** dark, minimal, monospace accents, no decorative chrome

## Layout

| Zone | Content |
|------|---------|
| Header | Brand label "Software Factory" + mode subtitle |
| Left sidebar | Create-task form; scrollable run list (status, current node, time) |
| Main canvas | Fixed left-to-right React Flow pipeline (factory execution graph) |
| Toolbar | Run id, status, cancel / rerun actions |
| Footer strip | Outcome explanation + recent events |

## Visual rules

- Background `#0b0d10`, surfaces `#12151a`, borders `#252a33`
- No gradients, no card stacks, no SaaS hero sections
- Status colors: blue (running), green (succeeded), red (failed), amber (cancelled)
- Current node pulses; attempt count shown on nodes with history
- IBM Plex Mono for ids and node labels; Plex Sans for UI copy

## Interactions

- Poll API every 1–2s; pause when browser tab hidden
- Click run in list to focus; click graph node to select rerun target
- Cancel signals running workflow; Rerun requires selected node

## Out of scope (v1)

- Authentication UI
- Product graph explorer
- Evidence browser
- SSE / WebSocket realtime
