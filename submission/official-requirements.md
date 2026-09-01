# Official WebMCP Challenge requirements

Verified against the live official pages: 2026-09-01

## Sources

- [Devpost challenge overview](https://webmcp.devpost.com/)
- [Official rules](https://webmcp.devpost.com/rules)
- [OpenAI challenge page](https://openai.com/webmcp-challenge/)
- [WebMCP specification draft](https://webmachinelearning.github.io/webmcp/)

The official rules and live challenge website remain authoritative if any
prepared material conflicts with this snapshot.

## Dates

- Submission deadline: **2026-09-03 13:00 PDT**
- Judging period: **2026-09-04 10:00 PDT through 2026-09-21 17:00 PDT**
- Winners announced: on or around **2026-09-23 14:00 PDT**

## Required submission artifacts

| Official obligation | Prepared artifact | Current state |
| --- | --- | --- |
| Working live URL accessible to judges | `https://savs-webmcp-challenge.onrender.com`; deployment and availability receipts | Verified; final pre-submission smoke test remains |
| English description explaining WebMCP fit | `devpost-final-copy.md` | Prepared |
| Better user experience | `devpost-final-copy.md` | Prepared |
| New human-agent collaboration | `devpost-final-copy.md` | Prepared |
| Brief WebMCP implementation explanation | `devpost-final-copy.md` | Prepared from current source and receipts |
| Public YouTube demo with audio, under three minutes | H2-accepted 157.12-second v4 export at https://youtu.be/quJI1JD3FzE; `youtube-upload-copy.md` | Public page and expected metadata verified; complete signed-out transcode playback pending |
| Public source repository with code, assets, instructions, and visible open-source license | https://github.com/NSPbuilder/savs-webmcp-challenge; `publication-checklist.md` | Verified through anonymous GitHub access; GitHub detects the top-level MIT license |
| Complete every required field in the live Devpost form | `devpost-final-copy.md` plus `publication-checklist.md` live-form inventory gate | Standard copy prepared; unpublished form fields and limits still require inventory |

## Project and entrant prerequisites

### Challenge-period provenance

A project must be new during the submission period or a pre-existing project
must have been meaningfully extended with WebMCP during that period. A
pre-existing project must distinguish prior work from the new WebMCP work with
dated history or equivalent evidence. The final public repository must make
the challenge entry's bounded provenance inspectable before submission.

### Depicted-versus-tested consistency

The submitted project must install and run consistently on its intended
platform and behave as depicted in the description and video. The official
rules do not require the video to be recorded from the hosted origin. This
project separately binds the H2-accepted local recording and verifies the same
R0→R1→R2 behavior at the public Render origin; the live URL still receives a
final smoke test before submission.

### Third-party integrations and intellectual property

The entrant must be authorized to use every third-party SDK, API, dataset, and
asset. The submission must be the entrant's original work, solely owned by the
entrant, and must not infringe another party's rights. The video may not use
third-party trademarks, music, or copyrighted material without permission.
Open-source components must be used in compliance with their licenses.

### Representative authorization

An organization must appoint and authorize an eligible individual to act as
its Representative and enter the submission. This is an entrant attestation,
not a conclusion produced by the repository.

### Prohibited support

The entrant must attest that the project was not developed, or derived from a
project developed, with financial or preferential support from the Sponsor or
Administrator as defined by the official rules.

### Judge access window

The working project must be available to judges free of charge and without
restriction through the end of the judging period. If authentication is used,
working credentials must be included in the testing instructions. This project
currently plans a credential-free demo unless deployment changes that fact.

### Supported WebMCP test routes

Judges may use ChatGPT's in-app browser, which supports WebMCP, or **Chrome 149 or later**. For Chrome, enable
`chrome://flags/#enable-webmcp-testing` and restart the browser before testing.

### Language

All submitted materials must be in English or include an English translation.
This material kit is English.

## Judging criteria and evidence strategy

| Criterion | What the entry must demonstrate |
| --- | --- |
| WebMCP Leverage | Four real page-registered tools create, inspect, audit, and repair immutable UI revisions through the WebMCP surface. |
| Execution | A coherent visible workflow moves from approved R0 to blocked R1, refuses stale evidence, and reaches fresh R2 `PASS`. |
| Potential Impact | Agent-driven websites need a result contract for human-visible output, not only successful structured actions. |
| Creativity & Ambition | Visual truth is bound to an exact revision, so the same successful action can be operationally successful yet visually blocked until repaired and re-audited. |

## Public rules versus live form

This file covers the published requirements verified on the date above. It
does not claim knowledge of every current widget or required field in the
logged-in Devpost submission form. A read-only form inventory and one-to-one
mapping to the application copy is a mandatory final gate.
