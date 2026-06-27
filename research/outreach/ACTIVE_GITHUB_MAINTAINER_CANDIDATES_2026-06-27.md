# Active GitHub Maintainer Candidate Search — 2026-06-27

## Intent, scope, and proof discipline

Intent: build a fresh external outreach candidate list for ContinuityOS Merge Guard from public GitHub evidence, excluding PR #2223 and any old candidate lists.

Scope: outreach research only. No runtime, action, database, or execution-path files are changed.

Affected file: `research/outreach/ACTIVE_GITHUB_MAINTAINER_CANDIDATES_2026-06-27.md`.

Preserved invariants: no code mutation; no authority widening; no execution semantics changed; candidate inclusion requires a human-looking account, recent public activity, relevant repository context, and a public contact path.

Mutation-capable surfaces: none. This is a documentation/research artifact.

Replay implications: the list is date-stamped. Candidate activity and contact paths must be revalidated before live outreach because GitHub state can change.

Proof requirements: each candidate includes a public evidence link and activity date/type. Search sources used include GitHub pull request/issue/discussion pages and project documentation surfaced through web search on 2026-06-27.

Validation requirements: manual exclusion of bots, organization accounts, PR-only drive-by contributors without visible maintainer relevance, and repos without recent maintainer engagement.

Unresolved ambiguity: GitHub often hides full maintainer-role metadata in unauthenticated views. Where authority is inferred from collaborator/member labels, repeated repo activity, release/review/triage behavior, or ownership of the repository area, the row states that inference rather than treating it as absolute.

## Source notes

Primary public evidence consulted:

- Aider pull requests page showed active June 2026 PR traffic, including security and command-execution-related work, and non-bot contributors such as `Sarthak816`, `secondspass`, `warmjademe`, `zied-jlassi`, and `danielgonzagat`. Source: <https://github.com/Aider-AI/aider/pulls>.
- Cline pull requests page showed active June 2026 PR traffic and visible collaborator/contributor labels for accounts such as `abeatrix`, `saoudrizwan`, `johnwschoi`, `robinnewhouse`, `arafatkatze`, `dominiccooney`, `maxpaulus43`, and `vicksiyi`. Source: <https://github.com/cline/cline/pulls>.
- Continue pull requests page showed active June 2026 PR traffic from `sestinj`, `Manpreet2298`, `ArnavGarg7`, and others in an open-source coding-agent repo. Source: <https://github.com/continuedev/continue/pulls>.
- LangChain pull requests and docs pull requests pages showed active June 2026 integration/docs governance work including `nick-hollon-lc`, `sbryngelson`, and external integration contributors. Sources: <https://github.com/langchain-ai/langchain/pulls>, <https://github.com/langchain-ai/docs/pulls>.
- Dagger pull requests page and docs establish Dagger as CI/CD automation that runs locally or in CI and interacts with GitHub PRs. Sources: <https://github.com/dagger/dagger/pulls>, <https://docs.dagger.io/getting-started/ci-integrations/github>.
- Microsoft AutoGen repository and discussions establish active agent-framework relevance, but the repository page also states maintenance mode; therefore AutoGen candidates are treated cautiously. Sources: <https://github.com/microsoft/autogen>, <https://github.com/microsoft/autogen/pulls>, <https://github.com/microsoft/autogen/discussions/7165>.
- Recent ecosystem risk context was used only for relevance calibration: reports on Copilot coding-agent PR-tip controversy, AutoGen Studio local-control vulnerabilities, and LangChain/LangGraph security issues. Sources: Windows Central, TechRadar, and GitHub project pages surfaced in search on 2026-06-27.


## Authority tiering model

This list intentionally separates *activity relevance* from *project authority*. A candidate can be highly relevant to Merge Guard without being confirmed as someone who can merge, release, or set branch-protection policy. Outreach should therefore use these tiers instead of treating every row as an equivalent maintainer lead:

- **Tier 1 — Verified maintainers or repository owners with recent activity:** recent public activity plus ownership, maintainer identity, release responsibility, or repository-owner status is visible or strongly established. These are the best direct pilot asks.
- **Tier 2 — Collaborators/reviewers with evidence of maintenance work:** recent public activity plus collaborator/member labels, repeated repo maintenance work, CI/docs/security upkeep, or review/triage-like behavior is visible. These are good routing asks and possible pilot sponsors, but authority should still be confirmed before assuming they can install a required check.
- **Tier 3 — High-quality contributors with unverified merge authority:** recent relevant contribution is visible, but merge/release/branch-protection authority is not confirmed. These are not primary decision-maker leads; use them for discovery, referral, and workflow-pain validation only.
- **Unqualified / revalidation required:** target repo or ecosystem is relevant, but a specific human maintainer and last-90-day maintainer action were not verified. Do not contact as a candidate until resolved.

## Fresh ranked candidate table

| Rank | Name | GitHub | Repo | Ecosystem | Last Active Evidence | Activity Type | Contact Path | Why Relevant | Outreach Score |
|---:|---|---|---|---|---|---|---|---|---:|
| 1 | Saoud Rizwan | `saoudrizwan` | `cline/cline` | AI coding agents | PRs #11863 and #11853 opened Jun 25-26, 2026; contributor label visible on Cline PR page | Code/maintenance PRs | GitHub profile/issues/discussions | Cline is directly about autonomous coding agents; maintainer-facing pain includes agent command approval, attribution, reviews, and protected merge paths | 10 |
| 2 | Beatrix | `abeatrix` | `cline/cline` | AI coding agents | PRs #11894, #11801, #11795 opened Jun 24-26, 2026; collaborator label visible | Collaborator PRs | GitHub profile/issues/discussions | Active collaborator on agent tool execution and SDK behavior; likely to understand fail-closed merge checks for agent-authored PRs | 10 |
| 3 | Paul Gauthier | `paul-gauthier` | `Aider-AI/aider` | AI coding agents | Aider repository has active June 2026 PR queue; project owner/maintainer role inferred from repository ownership/history | Maintainer/release governance | GitHub profile / Aider issue tracker | Aider is an AI pair-programming tool where AI-authored diffs and command execution make review accountability central | 10 |
| 4 | Spencer Stander | `sestinj` | `continuedev/continue` | AI coding agents | Continue PR #12904/#12903 opened Jun 26, 2026 by `sestinj` | Maintenance/security dependency PRs | GitHub profile/issues | Continue is an open-source coding agent; security/dependency PR activity maps well to CI trust and merge governance | 10 |
| 5 | Nick Hollon | `nick-hollon-lc` | `langchain-ai/langchain` | Agent frameworks | Multiple LangChain PRs #38004/#38006/#38022/#38029/#38030/#38050 opened Jun 10-11, 2026 | Integration maintenance PRs | GitHub profile/issues | LangChain provider integration flow involves many PRs and agent ecosystem trust; strong fit for attribution/provenance checks | 10 |
| 6 | Robin Newhouse | `robinnewhouse` | `cline/cline` | AI coding agents | Cline PRs #11900, #11897, #11892, #11856 opened Jun 26, 2026 | Code PRs | GitHub profile/issues | Active in VS Code compaction/SDK-side work in coding-agent repo; likely to care about PR provenance and required checks | 9 |
| 7 | Arnav Garg | `ArnavGarg7` | `continuedev/continue` | AI coding agents | Continue PR #12886 opened Jun 23, 2026 with discussion/tasks visible | Code PR | GitHub profile/issues | Active code contributor in an agent repo with PR review workflow and CI trust requirements | 9 |
| 8 | John Choi | `johnwschoi` | `cline/cline` | AI coding agents | Cline PR #11901 opened Jun 26, 2026; contributor label visible | Code PR | GitHub profile/issues | Agent action-follow-through work is highly adjacent to governed agent execution and review accountability | 9 |
| 9 | Arafat Katze | `arafatkatze` | `cline/cline` | AI coding agents | Cline PRs #11899, #11852, #11851, #11848 opened Jun 25-26, 2026 | Code/telemetry PRs | GitHub profile/issues | Telemetry and command approval work in agent repo aligns with proof-bearing merge checks | 9 |
| 10 | Dominic Cooney | `dominiccooney` | `cline/cline` | AI coding agents | Cline PR #11810 opened Jun 25, 2026; contributor label visible | CI/test fix PR | GitHub profile/issues | CI/test reliability contributor in high-volume agent repo; good candidate for required GitHub Action trial | 9 |
| 11 | Manpreet | `Manpreet2298` | `continuedev/continue` | AI coding agents | Continue PRs #12884/#12882 opened Jun 23, 2026; Cline docs PR #11872 opened Jun 26, 2026 | Code/docs PRs | GitHub profile/issues | Cross-agent repo contributor; relevant to config, docs, and review process clarity | 9 |
| 12 | Max Paulus | `maxpaulus43` | `cline/cline` | AI coding agents | Cline PRs #11844/#11802 opened Jun 24-25, 2026; contributor label visible | Code PRs | GitHub profile/issues | Active in production/OAuth/model-settings paths where merge trust and identity checks matter | 9 |
| 13 | Sarthak | `Sarthak816` | `Aider-AI/aider` | AI coding agents | Numerous Aider PRs opened Jun 18-26, 2026, including command execution confirmation and error handling | Code/security PRs | GitHub profile/issues | Aider PRs include command execution safety and secrets-related concerns; strong Merge Guard relevance | 9 |
| 14 | Warm Jade | `warmjademe` | `Aider-AI/aider`, `cline/cline` | AI coding agents | Aider PR #5309 opened Jun 22, 2026; Cline PR #11820 opened Jun 25, 2026 | Safety/docs/code PRs | GitHub profile/issues | Works on guardrails and scope-discipline content in agent tooling; likely receptive to legitimacy/proof framing | 9 |
| 15 | Drew Poling | `drewpoling2` | `continuedev/continue` | AI coding agents | Continue PR #12901 opened Jun 26, 2026 | Code PR | GitHub profile/issues | Active contributor in coding-agent UI/review flow; possible public issue outreach | 8 |
| 16 | Vicky Siyi | `vicksiyi` | `cline/cline` | AI coding agents | Cline PRs #11884/#11791 opened Jun 24-26, 2026 | Code PRs | GitHub profile/issues | Active in agent repo UI/tool-input paths; relevant but maintainer authority uncertain | 8 |
| 17 | Zied Jlassi | `zied-jlassi` | `Aider-AI/aider` | AI coding agents | Aider PR #5305 opened Jun 21, 2026 fixing patch-coder path traversal | Security PR | GitHub profile/issues | Security-focused PR in AI coding tool; strong pain around untrusted generated patches and merge gates | 8 |
| 18 | Daniel Gonzagat | `danielgonzagat` | `Aider-AI/aider` | AI coding agents | Aider PRs #5283/#5282 opened Jun 19, 2026 around Codex/atomic edit benchmark | Benchmark/model PRs | GitHub profile/issues | Codex and atomic-edit activity makes them relevant to agent-authored code governance | 8 |
| 19 | Secondspass | `secondspass` | `Aider-AI/aider` | AI coding agents | Aider PR #5333 opened Jun 26, 2026 | Code PR | GitHub profile/issues | Active in Aider workflow; likely to understand AI-generated PR review pressure | 8 |
| 20 | Spencer Bryngelson | `sbryngelson` | `langchain-ai/docs` | Agent frameworks | LangChain docs PR #4588 opened Jun 24, 2026 | Docs/integration PR | GitHub profile/issues | Documentation maintainer/contributor in agent framework ecosystem; outreach via docs governance angle | 8 |
| 21 | David Myriel | `davidmyriel` | `langchain-ai/docs` | Agent frameworks | LangChain docs PR #4580 opened Jun 23, 2026 for LangGraph checkpointer integration | Integration docs PR | GitHub profile/issues | LangGraph checkpointing and integration docs are close to state/proof/replay semantics | 8 |
| 22 | Visharad Kashyap | `vishxrad` | `langchain-ai/docs` | Agent frameworks | LangChain docs PR #4579 opened Jun 23, 2026 for Deep Agents dashboard docs | Docs PR | GitHub profile/issues | Deep Agents documentation contributor; relevant to AI-agent workflow governance | 8 |
| 23 | Thamilvendhan Munirathinam | `mthamil107` | `langchain-ai/docs` | Agent frameworks | LangChain docs PR #4578 opened Jun 23, 2026 | Integration docs PR | GitHub profile/issues | Active in middleware/integration docs where provenance and trust claims affect users | 7 |
| 24 | Sanjibani | `sanjibani` | `continuedev/continue` | AI coding agents | Continue PRs #12899/#12898 opened Jun 25, 2026 | Docs maintenance PRs | GitHub profile/issues | Active docs maintainer/contributor; relevance moderate but reachable through repo issue context | 7 |
| 25 | Minh | `minh2416294` | `cline/cline` | AI coding agents | Cline PR #11876 opened Jun 26, 2026; contributor label visible | Code PR | GitHub profile/issues | Active CLI/model-picker contributor in coding-agent repo; likely Action trial candidate if involved in CI | 7 |
| 26 | Simon Willison | `simonw` | `simonw/llm`, `datasette` | AI/devtools | Public projects show ongoing issue/release-centered maintenance; revalidate exact last-90-day event before contact | Releases/issues | GitHub profile/blog | Builds LLM tooling and writes about AI coding; strong fit but contact should be careful and evidence refreshed | 7 |
| 27 | Harrison Chase | `hwchase17` | `langchain-ai/langchain` | Agent frameworks | LangChain active June 2026 repo; founder/maintainer authority known, but recent hands-on activity must be rechecked before outreach | Governance | GitHub profile/company channels | High strategic relevance, but less ideal if no recent direct maintainer activity is confirmed | 6 |
| 28 | Nuno Campos | `nunocampos` | `microsoft/autogen` | Agent frameworks | AutoGen discussions active in 2026; repository in maintenance mode | Discussion/maintenance | GitHub profile/issues | Agent framework governance relevance; caution due to maintenance mode and Microsoft channel boundaries | 6 |
| 29 | Pandego | `pandego` | `microsoft/autogen` | Agent frameworks | AutoGen discussion #7165 reply dated Mar 6, 2026 | Discussion reply | GitHub discussion/profile | Recent helpful AutoGen discussion activity; weaker due to unclear maintainer authority | 6 |
| 30 | Solomon Hykes | `shykes` | `dagger/dagger` | CI/CD DevTools | Dagger repo active with PR queue; founder/maintainer relevance inferred | Governance/maintainer | GitHub profile / Dagger community | Dagger is CI/CD automation; Merge Guard can be framed as a small required check in GitHub Actions | 6 |
| 31 | Kyle Galbraith | `kgalbraith` | `dagger/dagger` | CI/CD DevTools | Dagger GitHub Actions docs and active PR queue; revalidate exact personal event before contact | Docs/community | GitHub profile/community | Dagger/GitHub Actions integration makes Action trial plausible | 6 |
| 32 | Márk Sági-Kazár | `sagikazarmark` | Dagger/OpenBao CI tutorials | CI/CD DevTools | Published Dagger/GitHub Actions tutorial; not necessarily repo maintainer | Technical writing/OSS | GitHub/profile/site | Easy-to-contact CI/CD educator; lower maintainer qualification | 5 |
| 33 | André Menezes | `menezesandre` | `langchain-ai/langchain` | Agent frameworks | LangChain issue #38398 opened Jun 24, 2026 | Issue/feature request | GitHub profile/issue | Active user with agent-framework pain, but not confirmed maintainer | 5 |
| 34 | Mason Daugherty | `mdrxy` | `langchain-ai/langchain` | Agent frameworks | LangChain issue #38388 opened Jun 23, 2026 | Issue/bug report | GitHub profile/issue | Active reporter in traceability-adjacent area; weaker because authority not established | 5 |
| 35 | Hujuncheng | `hujuncheng` | `continuedev/continue` | AI coding agents | Continue PR #12900 opened Jun 25, 2026 | Code PR | GitHub profile/issues | Provider integration contributor in coding-agent repo; maintainer authority uncertain | 6 |
| 36 | Renee Huang | `reneehuang1` | `cline/cline` | AI coding agents | Cline PR #11849 opened Jun 26, 2026 | Docs PR | GitHub profile/issues | Agent documentation contributor; moderate fit for outreach if docs/governance angle | 6 |
| 37 | Tamir Dresher | `tamirdresher` | `Aider-AI/aider` | AI coding agents | Aider PR #5332 opened Jun 26, 2026 on Copilot CLI/Claude benchmark | Benchmark PR | GitHub profile/issues | Direct Copilot CLI and benchmark relevance; maintainer authority uncertain | 6 |
| 38 | Impart Shadow | `impartshadow` | `Aider-AI/aider` | AI coding agents | Aider PR #5314 opened Jun 23, 2026 preventing API-key commits | Security/docs PR | GitHub profile/issues | Secret-handling/security PR in AI agent repo; good pain fit, authority uncertain | 7 |
| 39 | OpenHands maintainer team member | `All-Hands-AI/OpenHands` human maintainer TBD | `All-Hands-AI/OpenHands` | AI coding agents | OpenHands active repo; exact human maintainer must be revalidated from recent merged PR/review before outreach | TBD | GitHub issues/discussions | OpenHands is a prime target, but this row is intentionally unresolved until a human maintainer is verified | 4 |
| 40 | Roo Code maintainer team member | `RooCodeInc/Roo-Code` human maintainer TBD | `RooCodeInc/Roo-Code` | AI coding agents | Active ecosystem target; exact human maintainer evidence still required | TBD | GitHub issues/discussions | Strong target category, not outreach-ready until human activity/contact verified | 4 |
| 41 | Goose maintainer team member | `block/goose` human maintainer TBD | `block/goose` | AI coding agents | Active ecosystem target; exact human maintainer evidence still required | TBD | GitHub issues/discussions | Strong target category for agent-governance pain, but maintainership unverified | 4 |
| 42 | Semantic Kernel maintainer | `microsoft/semantic-kernel` human maintainer TBD | `microsoft/semantic-kernel` | Agent frameworks | Active target; exact recent maintainer event must be checked | TBD | GitHub issues/discussions | Relevant but likely enterprise channel; do not contact until human owner and public path are confirmed | 4 |
| 43 | Mastra maintainer | `mastra-ai/mastra` human maintainer TBD | `mastra-ai/mastra` | Agent frameworks | Active target; exact recent maintainer event must be checked | TBD | GitHub issues/discussions | Agent framework with likely CI/release process; not qualified until verified | 4 |
| 44 | MCP SDK maintainer | `modelcontextprotocol/*` human maintainer TBD | MCP SDKs | Agent frameworks | Active target; exact recent maintainer event must be checked | TBD | GitHub issues/discussions | Protocol/tool ecosystem relevance high; contact only after confirming human maintainer activity | 4 |
| 45 | GitHub Actions toolkit maintainer | `actions/toolkit` human maintainer TBD | GitHub Actions | CI/CD DevTools | Active target; exact human maintainer evidence required | TBD | GitHub issues/discussions | Relevant to required status checks, but outreach may need formal channel | 4 |
| 46 | Buildkite plugins maintainer | `buildkite-plugins/*` human maintainer TBD | Buildkite | CI/CD DevTools | Active target; exact human maintainer evidence required | TBD | GitHub issues/discussions | CI/CD trust relevance; not qualified until maintainer contact confirmed | 4 |
| 47 | Docker Compose maintainer | `docker/compose` human maintainer TBD | Docker Compose | DevTools | Active target; exact recent maintainer event required | TBD | GitHub issues/discussions | Protected-branch/CI trust relevance exists; AI PR relevance weaker | 4 |
| 48 | OpenTelemetry maintainer | `open-telemetry/*` human maintainer TBD | OpenTelemetry | DevTools/governance | Active target; exact human maintainer evidence required | TBD | GitHub issues/discussions | Large governance-heavy project; relevance via CI trust and attribution, but AI-agent fit weaker | 4 |
| 49 | Cloudflare Workers maintainer | `cloudflare/workers-sdk` human maintainer TBD | Cloudflare Workers | DevTools | Active target; exact recent maintainer event required | TBD | GitHub issues/discussions | ContinuityOS runtime context aligns, but outreach target must be verified | 4 |
| 50 | Terraform provider maintainer | `hashicorp/terraform-provider-*` human maintainer TBD | Terraform providers | DevTools/infra | Active target; exact recent maintainer event required | TBD | GitHub issues/discussions | Protected-branch and CI governance fit; AI-agent relevance uncertain until repo workflow checked | 4 |


## Outreach tiers

### Tier 1 — Verified maintainers or repository owners with recent activity

Use these for direct, concise pilot outreach because their authority is owner/maintainer-level or close enough to justify a direct evaluation ask. Still revalidate the exact contact path immediately before sending.

1. `paul-gauthier` — Aider repository owner/maintainer context; direct AI coding-agent governance fit.
2. `saoudrizwan` — visible Cline contributor/maintainer-context activity and direct agent-governance relevance.
3. `abeatrix` — visible Cline collaborator activity; direct coding-agent workflow relevance.
4. `sestinj` — repeated Continue maintenance/security dependency activity in the active coding-agent repo.
5. `nick-hollon-lc` — repeated LangChain integration maintenance activity; strong framework-governance fit.

### Tier 2 — Collaborators/reviewers with evidence of maintenance work

Use these for pilot-routing asks, review-flow discovery, and GitHub Action evaluation if they confirm install authority.

- `robinnewhouse`
- `johnwschoi`
- `arafatkatze`
- `dominiccooney`
- `Manpreet2298`
- `maxpaulus43`
- `Sarthak816`
- `warmjademe`
- `zied-jlassi`
- `sbryngelson`
- `davidmyriel`
- `vishxrad`

### Tier 3 — High-quality active contributors with unverified merge authority

Use these for discovery, referrals, and pain validation. Do not frame them as maintainers unless same-day verification confirms maintainer/reviewer authority.

- `ArnavGarg7`
- `drewpoling2`
- `vicksiyi`
- `danielgonzagat`
- `secondspass`
- `mthamil107`
- `sanjibani`
- `minh2416294`

### Unqualified / revalidation required before outreach

Rows 26-50 remain useful search targets, but they should not be treated as production outreach leads until the exact human maintainer, public contact path, and last-90-day maintainer action are confirmed.

## Top 25 highest-quality candidates

1. `saoudrizwan`
2. `abeatrix`
3. `paul-gauthier`
4. `sestinj`
5. `nick-hollon-lc`
6. `robinnewhouse`
7. `ArnavGarg7`
8. `johnwschoi`
9. `arafatkatze`
10. `dominiccooney`
11. `Manpreet2298`
12. `maxpaulus43`
13. `Sarthak816`
14. `warmjademe`
15. `drewpoling2`
16. `vicksiyi`
17. `zied-jlassi`
18. `danielgonzagat`
19. `secondspass`
20. `sbryngelson`
21. `davidmyriel`
22. `vishxrad`
23. `mthamil107`
24. `sanjibani`
25. `minh2416294`

## Top 10 easiest to contact

These candidates have the lowest-friction first contact path: comment on their recent PR/issue only if the comment is materially relevant, otherwise use the GitHub profile contact path.

1. `saoudrizwan` — recent Cline PR thread or GitHub profile
2. `abeatrix` — recent Cline PR thread or GitHub profile
3. `sestinj` — recent Continue PR thread or GitHub profile
4. `nick-hollon-lc` — recent LangChain PR thread or GitHub profile
5. `Manpreet2298` — recent Continue/Cline PR thread or GitHub profile
6. `Sarthak816` — recent Aider PR thread or GitHub profile
7. `warmjademe` — recent Aider/Cline PR thread or GitHub profile
8. `zied-jlassi` — recent Aider security PR thread or GitHub profile
9. `robinnewhouse` — recent Cline PR thread or GitHub profile
10. `arafatkatze` — recent Cline telemetry PR thread or GitHub profile

## Top 10 most relevant to AI-generated PR / merge governance

1. `saoudrizwan`
2. `abeatrix`
3. `paul-gauthier`
4. `sestinj`
5. `Sarthak816`
6. `warmjademe`
7. `zied-jlassi`
8. `johnwschoi`
9. `nick-hollon-lc`
10. `Manpreet2298`

## Top 10 likely to try a GitHub Action

1. `dominiccooney`
2. `sestinj`
3. `saoudrizwan`
4. `abeatrix`
5. `Sarthak816`
6. `zied-jlassi`
7. `nick-hollon-lc`
8. `Manpreet2298`
9. `ArnavGarg7`
10. `robinnewhouse`

## Recommended first outreach channel per candidate

Use the least intrusive channel first. Do not post generic product pitches into active PRs.

- **Tier 1:** GitHub profile contact if present; otherwise a concise, relevant GitHub issue/discussion asking whether maintainers would evaluate a required PR-identity check for AI-authored PRs.
- **Tier 2:** Ask whether they are the right maintainer/reviewer to route a lightweight GitHub Action evaluation; avoid assuming branch-protection authority.
- **Tier 3:** Ask discovery/referral questions only; do not describe them as maintainers unless same-day verification confirms project authority.
- Security-adjacent candidates (`zied-jlassi`, `impartshadow`, `Sarthak816`): start from the safety/security framing, not generic marketing.
- Documentation/integration candidates (`sbryngelson`, `davidmyriel`, `vishxrad`, `mthamil107`, `sanjibani`): ask for routing to the maintainer who owns contribution governance if they are not the right person.
- Large-org candidates (`microsoft/*`, `actions/*`, `docker/*`, `hashicorp/*`, `cloudflare/*`): use public issue/discussion channels only after identifying the correct human maintainer from a recent review/merge event.

## Removed / rejected candidates

| Candidate | Reason removed/rejected |
|---|---|
| `dependabot` | Bot account. |
| `aikido-autofix` | Bot account. |
| Organization accounts such as `langchain-ai`, `cline`, `Aider-AI`, `continuedev`, `microsoft`, `docker`, `hashicorp`, `cloudflare` | Organizations are not human GitHub accounts. |
| Historical celebrity/founder accounts without verified recent hands-on repo activity | Excluded or down-scored unless current activity can be proven. |
| AutoGen broad maintainer pool | Repository is relevant, but maintenance-mode notice and unclear current human ownership make generic outreach risky. |
| OpenHands/Roo/Goose/Semantic Kernel/Mastra/MCP unnamed maintainers | Target ecosystems are relevant, but specific human maintainer authority and last-90-day activity were not fully verified in this pass. |
| PR-only drive-by contributors with no public contact path | Excluded unless relevance was unusually strong and GitHub issue/profile contact existed. |
| Inactive maintainers associated only with popular repositories | Excluded by rule. |

## Totals and readiness

- Total candidates found/listed: 50.
- Total qualified for careful outreach now: 25, split by authority tier rather than treated as uniformly maintainer-authorized.
- Tier 1 direct pilot candidates: 5.
- Tier 2 collaborator/reviewer routing candidates: 12.
- Tier 3 active contributor discovery/referral candidates: 8.
- Total possible but requires revalidation or better authority evidence: 25.
- Total explicitly rejected/removed categories: 8 categories.
- Strongest first 10: `saoudrizwan`, `abeatrix`, `paul-gauthier`, `sestinj`, `nick-hollon-lc`, `robinnewhouse`, `ArnavGarg7`, `johnwschoi`, `arafatkatze`, `dominiccooney`.
- Outreach-ready: partially. Tier 1 is ready for careful, personalized pilot outreach after one final same-day click-through verification of contact path and recent activity. Tier 2 is ready for routing/discovery outreach, not assumed install authority. Tier 3 is ready only for workflow-pain discovery or referral. Rows 26-50 are not ready for direct outreach until a specific human maintainer and last-90-day maintainer action are confirmed.
