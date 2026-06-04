// Surface Registry — maps GovernedSurfaceType to GovernedActionSurface implementations.
//
// Adding a new surface:
//   1. Import its surface adapter
//   2. Add a branch to GovernedSurface discriminated union
//   3. Add entry to SURFACE_MAP
//
// getSurface(type) returns the adapter or null — callers must handle null (fail-closed).

import type { GovernedSurfaceType } from './governed-action-template.js'
import { FilesystemWriteSurface } from './filesystem-write-gateway.js'
import { GitHubCommentSurface } from './surfaces/github-comment-gateway.js'
import type {
  FilesystemWriteATAO,
  FilesystemWriteATAOInput,
  FilesystemWriteATAOBinding,
  FilesystemWriteExecuteInput,
  FilesystemWriteExecutionProof,
} from './filesystem-write-gateway.js'
import type { FilesystemAEO } from './filesystem-aeo.js'
import type {
  GitHubCommentATAO,
  GitHubCommentATAOInput,
  GitHubCommentATAOBinding,
  GitHubCommentAEO,
  GitHubCommentExecuteInput,
  GitHubCommentExecutionProof,
} from './surfaces/github-comment-gateway.js'
import type { GovernedActionSurface } from './governed-action-template.js'

// ── Discriminated union of all registered surfaces ────────────────────────────
export type GovernedSurface =
  | {
      type: "filesystem"
      surface: GovernedActionSurface<
        FilesystemWriteATAO,
        FilesystemWriteATAOInput,
        FilesystemWriteATAOBinding,
        FilesystemAEO,
        FilesystemWriteExecuteInput,
        FilesystemWriteExecutionProof
      >
    }
  | {
      type: "github_comment"
      surface: GovernedActionSurface<
        GitHubCommentATAO,
        GitHubCommentATAOInput,
        GitHubCommentATAOBinding,
        GitHubCommentAEO,
        GitHubCommentExecuteInput,
        GitHubCommentExecutionProof
      >
    }

const SURFACE_MAP: Partial<Record<GovernedSurfaceType, GovernedSurface>> = {
  filesystem: { type: "filesystem", surface: FilesystemWriteSurface },
  github_comment: { type: "github_comment", surface: GitHubCommentSurface },
}

// getSurface: returns the registered surface adapter or null.
// Null means no governed execution path exists for this surface type.
export function getSurface(surfaceType: GovernedSurfaceType): GovernedSurface | null {
  return SURFACE_MAP[surfaceType] ?? null
}
