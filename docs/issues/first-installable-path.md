# Issue draft: First installable path for governed filesystem execution

## Summary

Package the filesystem governed-execution path as the first installable developer path for ContinuityOS/MindShift, using the filesystem-write adapter as the reference adapter.

## Goal

A developer should be able to install or run a minimal package/demo that proves:

```text
any model -> agent action -> VALID/NULL -> proof/lineage when valid
```

## Proposed acceptance criteria

- Provide a documented command that runs without Cloudflare credentials.
- Show a valid filesystem-governed write producing a receipt and lineage node.
- Show at least one NULL path that emits no proof and no lineage.
- Preserve `validated_object_hash == executed_object_hash` in the visible output.
- Keep authority creation, policy definition, replay state, proof persistence, and lineage append boundaries explicit.
- Identify the adapter boundary that downstream installers should implement for other substrates.

## Reference adapter

Use the existing filesystem-write route and runtime gateway as the reference adapter:

- Runtime route: `POST /gateway/tool/filesystem-write`
- Kernel chain: capture -> compile -> canonical validation -> replay -> Ω validation -> execute -> nonce consumption
- Post-execution persistence: virtual filesystem object -> proof receipt -> lineage node

## Non-goals

- No new authority source.
- No additional execution-capable route.
- No shell/network/deploy adapter.
- No distributed finality claim.
- No bypass of replay or proof requirements.

## Initial demo path

The first committed demo path is `npm run demo`, backed by `demo/portability/filesystem-governed-execution.mjs`.
