# Challenge-period provenance

## Public-facing statement

SAVS began as pre-existing visual-verification research. During the WebMCP
Challenge period, we built this self-contained reference implementation to
make revision-bound visual proof available through native WebMCP tools. The
Challenge work includes the page-registered four-tool interface, immutable
R0→R1→R2 workflow, freshness-aware audit verdicts, constrained repair path,
native WebMCP browser verification, public deployment, and narrated demo.

The Challenge repository does not import the private `nsp-savs` runtime. It is
a standalone implementation containing its own source, test surface, assets,
instructions, and bounded evidence.

## Inspectable boundary

| Before the Challenge extension | Challenge-period WebMCP contribution |
| --- | --- |
| The broader idea that agents need visual evidence about rendered results | Four native tools registered through `document.modelContext.registerTool` |
| SAVS visual-verification research and empirical experiments | A self-contained Node.js workbench with isolated sessions and immutable revisions |
| No claim that the private research runtime is part of this entry | R1 fresh `BLOCK`, R1 stale `BLOCK`, and R2 fresh `PASS` as one inspectable WebMCP flow |
| No public Challenge demo | Native browser verification, public Render deployment, and a sub-three-minute narrated demo |

## Current evidence

- Prior Gate 0 implementation revision:
  `fdc78a1c3a083e1fc7557b3375b82a0b964617d1`.
- Public origin: https://savs-webmcp-challenge.onrender.com.
- Public accepted demo: https://youtu.be/quJI1JD3FzE.

Before submission, the entrant must confirm that the public repository history
or an equivalent visible dated record supports this boundary. This document
does not convert a private repository into public provenance by itself.
