# Publication and submission checklist

Nothing in this checklist authorizes publication or Devpost submission. The
entrant retains control of the license choice, repository visibility, external
accounts, and final submission action.

## Gate 1 — Entrant attestations and form inventory

- [x] The eligible Canadian organization is the named entrant, as confirmed by
      the user.
- [ ] The organization has appointed and authorized an eligible Representative.
- [ ] The Representative has authority to act and submit for the organization.
- [ ] The entrant confirms no prohibited financial or preferential support
      from the Sponsor or Administrator, as defined by the official rules.
- [ ] The entrant confirms original ownership and rights to the submitted code,
      text, screenshots, voice, and video.
- [ ] Every third-party dependency and asset has been inventoried and its use is
      compatible with its applicable terms or license.
- [ ] The video plan uses no unlicensed music, third-party footage, or trademark
      montage.
- [ ] Open the logged-in Devpost “Enter a Submission” page read-only.
- [ ] Inventory every visible required field and constraint without submitting.
- [ ] Map each field to `devpost-final-copy.md` or add the missing copy.

Evidence: dated entrant attestation record and live-form field map. These are
external facts and are not inferred from source code.

## Gate 2 — Challenge-period provenance

- [x] Establish the submitted project as a meaningful WebMCP extension of
      pre-existing SAVS research.
- [x] Write the bounded distinction between earlier SAVS research and this
      self-contained WebMCP reference implementation in
      `challenge-period-provenance.md`.
- [ ] Confirm that the public repository history or equivalent record supports
      the final provenance wording.
- [x] Include the bounded provenance wording in `devpost-final-copy.md`.

Evidence: dated commits or an equivalent bounded provenance record.

## Gate 3 — Live deployment

- [x] Select Render without changing the proven app behavior.
- [x] Deploy the exact reviewed revision.
- [x] Record the immutable deployment/revision identifier.
- [x] Bind the public URL:
      https://savs-webmcp-challenge.onrender.com.
- [x] Run the independent-origin verifier against the deployed origin.
- [x] Confirm R1 fresh `BLOCK`, R1 stale `BLOCK`, and R2 fresh `PASS`.
- [x] Confirm sessions remain isolated and reset is deterministic.
- [x] Confirm the project is free to access and currently requires no
      authentication. If authentication is later introduced,
      add working judge credentials to the testing instructions.

Evidence: deployment identifier, origin-verifier output, and timestamped result.

## Gate 4 — Required browser boundaries

### ChatGPT in-app browser — optional additional route

- [ ] Open https://savs-webmcp-challenge.onrender.com in ChatGPT's in-app
      browser.
- [ ] Discover all four registered tools.
- [ ] Complete the R0→R1→R2 flow using the tools.
- [ ] Confirm the visible page and structured results agree.

### Google Chrome

- [ ] Use Chrome 149 or later.
- [ ] Enable `chrome://flags/#enable-webmcp-testing`.
- [ ] Restart Chrome.
- [ ] Open https://savs-webmcp-challenge.onrender.com, discover all four tools,
      and complete the same flow.

The official rules allow judges to use ChatGPT's in-app browser or the
documented Chrome route; they do not require the submission team to claim both
routes as independently tested. Current native WebMCP evidence is Chrome-based.
The final gate is one public-origin Chrome native-tool smoke test after all
publication URLs are fixed.

Evidence: non-sensitive tool/result transcript and visible-state captures for
each route actually claimed.

## Gate 5 — Public repository transition

- [x] Choose MIT as the open-source license.
- [x] Confirm that NSP AI LABS INC. owns the first-party repository copyright
      and is authorized to appear as the MIT copyright holder.
- [x] Add the standard top-level MIT `LICENSE` and synchronize package,
      lockfile, boundary, and README metadata.
- [ ] Confirm that the repository host detects MIT at the top/About area after
      publication.
- [ ] Confirm the repository contains all required source, assets, setup, run,
      test, and deployment instructions.
- [ ] Update the root README so it no longer says Gate 0 is pending.
- [x] Update the root README with the live URL, architecture summary, WebMCP
      tool list, testing instructions, provenance, and public demo link slot.
- [ ] Run the repository's focused verification commands on the exact release
      revision.
- [ ] Entrant reviews the complete repository while it is still private.
- [ ] Entrant manually changes repository visibility to public.
- [ ] Replace `<PUBLIC_REPOSITORY_URL>` and verify anonymous read access.

Evidence: public URL, visible license, anonymous clone/read check, exact release
revision, and focused verification output.

## Gate 6 — Record and publish the demo

- [x] Bind the exact local native-WebMCP v4 export to the H2 acceptance
      receipt. The official rules do not require hosted-origin recording.
- [x] Keep the accepted export strictly below 03:00: 157.12 seconds.
- [x] Show real native WebMCP tool discovery and invocation.
- [x] Show fresh R1 `BLOCK`, stale R1 `BLOCK`, and fresh R2 `PASS`.
- [x] Confirm that narration and visible results match the separately verified
      public-origin behavior.
- [x] Confirm audio and burned-in English captions through complete H2
      playback.
- [ ] Confirm the entrant's submitted-media rights attestation.
- [x] Upload to YouTube and expose the expected public page at
      https://youtu.be/quJI1JD3FzE.
- [ ] Complete one signed-out 157-second playback and confirm narration,
      captions, 720p picture, and unrestricted availability after transcode.

Evidence: public URL, exact duration, anonymous playback, and final media-rights
confirmation.

## Gate 7 — Final submission rehearsal

- [ ] Reverify the official rules and deadline against the live pages.
- [ ] Rerun `node scripts/check-submission-materials.mjs --mode=final` after
      the public repository and YouTube URL placeholders have been replaced.
- [ ] Reopen all three external URLs in an anonymous context.
- [ ] Run one final public-origin ChatGPT or Chrome WebMCP smoke test.
- [ ] Copy final English text into every inventoried Devpost field.
- [ ] Confirm title, description, screenshots, links, repository revision, and
      video all describe the same behavior.
- [ ] Save a Devpost draft and inspect its rendered preview.
- [ ] Obtain explicit entrant authorization for the final submit action.
- [ ] Submit before **2026-09-03 13:00 PDT**.
- [ ] Record the submission confirmation and timestamp.

## Gate 8 — Judging-period availability

- [ ] Keep https://savs-webmcp-challenge.onrender.com free and accessible
      through **2026-09-21 17:00 PDT**.
- [ ] Keep the public repository and public YouTube video available.
- [ ] Check the live flow periodically without changing the submitted behavior.
- [ ] Preserve any required judge credentials until the judging period ends.

Submission readiness may be claimed only when Gates 1–7 are complete. Challenge
availability is not finished until Gate 8 reaches the end of the judging
period.
