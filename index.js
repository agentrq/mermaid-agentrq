/**
 * Mermaid diagrams in AgentRQ.
 *
 * Claims the ```mermaid fence. When a task body or a chat message contains one,
 * AgentRQ asks this extension what to do with it, and it answers with a
 * `diagram` node carrying the source. AgentRQ draws it.
 *
 * ## Why this extension does not render anything
 *
 * It would be shorter to turn the source into SVG here and hand that back. It
 * would also be the one thing AgentRQ's extension model exists to prevent: the
 * renderer is on a privileged `app://` origin with a bridge to files, the
 * clipboard and the shell, and third-party markup there has the machine through
 * an API built for the app's own UI.
 *
 * So the contract is the same as every other surface — **extensions describe,
 * AgentRQ renders**. This extension's job is policy, and there is real policy
 * to have:
 *
 *   - which workspaces diagrams are drawn in,
 *   - how large a diagram is worth drawing at all,
 *   - and refusing sources that would reconfigure the renderer.
 *
 * ## `%%{init: ...}%%` is refused
 *
 * Mermaid reads configuration out of the diagram source, and one of the things
 * it can set is `securityLevel` — so a diagram could otherwise turn off
 * mermaid's own escaping from inside the text being drawn. AgentRQ already
 * initialises mermaid with `securityLevel: 'strict'`, and this refuses the
 * directive as well. Two guards, failing differently: one is a setting that
 * could be changed by a later refactor, the other is a rule with a test.
 *
 * A refused diagram is **not** an error — the block stays as the text it was,
 * which is exactly what somebody needs in order to see what is wrong with it.
 */

export const name = 'mermaid'

export const inject = ['renderers']

/** How much diagram is worth drawing, when the setting is blank. */
export const DEFAULT_MAX_LINES = 400

/**
 * A mermaid configuration directive.
 *
 * `%%{init: {...}}%%`, optionally with spaces, optionally not at the start of a
 * line. Matched loosely on purpose: this is a refusal, so over-matching costs a
 * diagram that renders as text and under-matching costs the guard.
 */
const INIT_DIRECTIVE = /%%\s*\{\s*init\s*:/i

/** Which workspaces the user limited this to, or none meaning all of them. */
export function allowedWorkspaces(config) {
  return String(config?.workspaces ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
}

/**
 * Whether diagrams are drawn in this workspace.
 *
 * Blank means everywhere, which is what somebody who has not thought about it
 * wants. A list means those and nowhere else.
 */
export function appliesTo(config, workspaceId) {
  const allowed = allowedWorkspaces(config)
  if (allowed.length === 0) return true
  return Boolean(workspaceId) && allowed.includes(workspaceId)
}

/** The largest diagram worth drawing, in lines. */
export function maxLines(config) {
  const limit = Number(config?.maxLines)
  return Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_MAX_LINES
}

/**
 * What to do with one fence.
 *
 * Answers a `diagram` node, or nothing at all. Nothing means the block stays as
 * the text it was — which is the right answer for every refusal here: a
 * diagram that is too long, or one asking to reconfigure the renderer, is still
 * something the reader wants to see.
 */
export function renderBlock(source, config = {}) {
  const text = String(source ?? '')
  if (!text.trim()) return null

  if (INIT_DIRECTIVE.test(text)) {
    // Left as text rather than drawn. Mermaid takes its configuration from the
    // source, including its own security level, and a diagram is not the place
    // that decision gets made.
    return null
  }

  if (text.split('\n').length > maxLines(config)) return null

  return { type: 'diagram', format: 'mermaid', source: text }
}

export function apply(ctx, config) {
  ctx.renderers.add({
    id: 'mermaid',
    language: 'mermaid',
    label: 'Mermaid',
    // Asked per block, with the workspace the message is in — so "enabled for
    // this workspace" is this extension's answer rather than a setting AgentRQ
    // keeps on its behalf.
    when: (context) => appliesTo(config, context?.workspaceId),
    run: (context) => {
      const view = renderBlock(context?.source, config)
      // Nothing drawn is a legitimate answer, and AgentRQ leaves the fence as
      // the text it was. An error would replace a readable code block with a
      // complaint about it.
      return view ? { nodes: [view] } : null
    },
  })
}
