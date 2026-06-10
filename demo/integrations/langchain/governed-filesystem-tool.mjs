// LangChain tool wrapper around the governed filesystem-write gateway.
//
// This is the only mutation-capable surface this tool exposes: `func` does
// nothing but POST to the existing `/gateway/tool/filesystem-write` route
// (the same route used by demo/portability/filesystem-governed-execution.mjs)
// and return the route's response verbatim. There is no direct filesystem
// write inside this tool — every proposed action goes through
// ATAO -> AEO -> Validator -> Execution Boundary -> Proof, and the agent
// only ever sees EXECUTED+receipt or the bounded NULL response.

import { z } from 'zod'
import { DynamicStructuredTool } from '@langchain/core/tools'
import { postJson } from '../../lib/governed-worker-harness.mjs'

const filesystemWriteSchema = z.object({
  path: z.string().describe('Repository-relative path to write, e.g. "governed/filesystem-write-gateway/notes.md"'),
  content: z.string().describe('File content to write'),
  intent: z.string().describe('Natural-language description of why this write is being proposed'),
  replay_nonce: z.string().describe('Unique nonce for this proposed action; reusing a nonce is rejected as a replay'),
})

// createGovernedFilesystemWriteTool: builds a LangChain DynamicStructuredTool
// bound to a single (worker, env, agent_id, session_id) context.
//
// Every invocation of this tool is a proposed action submitted to the
// ContinuityOS gateway. The tool returns the gateway's JSON response
// (EXECUTED + proof receipt, or bounded NULL) as a string, unmodified.
export function createGovernedFilesystemWriteTool({ worker, env, agentId, sessionId }) {
  return new DynamicStructuredTool({
    name: 'governed_filesystem_write',
    description:
      'Propose a filesystem write through the ContinuityOS governed execution boundary. ' +
      'Returns EXECUTED with a proof receipt if the action is VALID, or a bounded NULL ' +
      'response (no execution, no proof) if it is denied (e.g. replay or policy).',
    schema: filesystemWriteSchema,
    func: async ({ path, content, intent, replay_nonce }) => {
      const response = await postJson(worker, env, {
        agent_id: agentId,
        session_id: sessionId,
        intent,
        path,
        content,
        replay_nonce,
      })
      return JSON.stringify(response)
    },
  })
}
