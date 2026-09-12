import { describe, it, expect, vi } from 'vitest'

import {
  DEFAULT_MAX_LINES,
  allowedWorkspaces,
  appliesTo,
  apply,
  maxLines,
  renderBlock,
} from '../index.js'

/**
 * This extension draws nothing, and that is the design rather than a shortcut.
 *
 * It answers with the diagram's *source* and AgentRQ draws it, because the
 * renderer is on a privileged origin and third-party markup there would have
 * the machine. So what is worth testing is the policy: which workspaces, how
 * large, and the one source it refuses.
 */

const GRAPH = 'graph TD;\n    A-->B;\n    A-->C;\n    B-->D;\n    C-->D;'

describe('allowedWorkspaces', () => {
  it('reads a list somebody typed, however they spaced it', () => {
    expect(allowedWorkspaces({ workspaces: 'ws1, ws2 ,ws3' })).toEqual(['ws1', 'ws2', 'ws3'])
  })

  it('is empty when nothing was said', () => {
    expect(allowedWorkspaces({})).toEqual([])
    expect(allowedWorkspaces({ workspaces: '  ' })).toEqual([])
    expect(allowedWorkspaces(undefined)).toEqual([])
  })

  it('drops the gaps left by a trailing comma', () => {
    expect(allowedWorkspaces({ workspaces: 'ws1,,ws2,' })).toEqual(['ws1', 'ws2'])
  })
})

describe('appliesTo', () => {
  // Blank means everywhere, which is what somebody who has not thought about
  // it wants. A list means those and nowhere else.
  it('draws everywhere when no workspaces were named', () => {
    expect(appliesTo({}, 'ws1')).toBe(true)
    expect(appliesTo({ workspaces: '' }, 'ws9')).toBe(true)
  })

  it('draws only where it was told to, once it was told', () => {
    const config = { workspaces: 'ws1,ws2' }

    expect(appliesTo(config, 'ws1')).toBe(true)
    expect(appliesTo(config, 'ws3')).toBe(false)
  })

  // A page with no workspace at all: there is nothing to match against, and
  // guessing "yes" would draw in a place the user excluded.
  it('does not apply with no workspace, once a list exists', () => {
    expect(appliesTo({ workspaces: 'ws1' }, '')).toBe(false)
    expect(appliesTo({ workspaces: 'ws1' }, undefined)).toBe(false)
    // But with no list, no workspace is still fine.
    expect(appliesTo({}, '')).toBe(true)
  })
})

describe('maxLines', () => {
  it('has a default worth having', () => {
    expect(maxLines({})).toBe(DEFAULT_MAX_LINES)
    expect(maxLines(undefined)).toBe(DEFAULT_MAX_LINES)
  })

  it('takes a number somebody typed', () => {
    expect(maxLines({ maxLines: 50 })).toBe(50)
    expect(maxLines({ maxLines: '80' })).toBe(80)
    expect(maxLines({ maxLines: 12.7 })).toBe(12)
  })

  // A zero or a negative would refuse every diagram, silently, which is not
  // what anybody means by typing one.
  it('ignores a limit that would draw nothing', () => {
    expect(maxLines({ maxLines: 0 })).toBe(DEFAULT_MAX_LINES)
    expect(maxLines({ maxLines: -5 })).toBe(DEFAULT_MAX_LINES)
    expect(maxLines({ maxLines: 'lots' })).toBe(DEFAULT_MAX_LINES)
  })
})

describe('renderBlock', () => {
  it('answers with the source, for AgentRQ to draw', () => {
    expect(renderBlock(GRAPH)).toEqual({ type: 'diagram', format: 'mermaid', source: GRAPH })
  })

  it('hands the source over untouched, because a diagram is whitespace', () => {
    const indented = 'graph TD;\n      A-->B;'

    expect(renderBlock(indented).source).toBe(indented)
  })

  /**
   * The one refusal that is about security rather than size.
   *
   * Mermaid reads `%%{init: ...}%%` out of the source, and it can set
   * `securityLevel` — so a diagram could otherwise turn off mermaid's own
   * escaping from inside the text being drawn. AgentRQ sets that strictly too;
   * these are two guards that fail differently.
   */
  it('refuses a source that reconfigures the renderer', () => {
    const directives = [
      '%%{init: {"securityLevel": "loose"}}%%\ngraph TD;\n  A-->B;',
      '%%{ init : { "theme": "x" } }%%\ngraph TD;',
      'graph TD;\n%%{INIT: {}}%%\n  A-->B;',
    ]

    for (const source of directives) {
      expect(renderBlock(source), source).toBeNull()
    }
  })

  it('leaves an ordinary mermaid comment alone', () => {
    // `%%` on its own is a comment, and refusing those would refuse a great
    // many perfectly ordinary diagrams.
    expect(renderBlock('%% what this shows\ngraph TD;\n  A-->B;')).not.toBeNull()
  })

  it('refuses one longer than it was told to draw', () => {
    const long = Array.from({ length: 20 }, (_, i) => `  A${i}-->B${i};`).join('\n')

    expect(renderBlock(long, { maxLines: 10 })).toBeNull()
    expect(renderBlock(long, { maxLines: 50 })).not.toBeNull()
  })

  it('has nothing to draw from nothing', () => {
    expect(renderBlock('')).toBeNull()
    expect(renderBlock('   \n  ')).toBeNull()
    expect(renderBlock(undefined)).toBeNull()
  })
})

describe('apply', () => {
  const register = (config = {}) => {
    const added = []
    apply({ renderers: { add: (entry) => added.push(entry) } }, config)
    return added[0]
  }

  it('claims the mermaid fence, and nothing else', () => {
    const entry = register()

    expect(entry).toMatchObject({ id: 'mermaid', language: 'mermaid', label: 'Mermaid' })
  })

  it('answers a fence with a diagram node', () => {
    const entry = register()

    expect(entry.run({ source: GRAPH })).toEqual({ nodes: [{ type: 'diagram', format: 'mermaid', source: GRAPH }] })
  })

  /**
   * Nothing drawn is a legitimate answer: AgentRQ leaves the fence as the text
   * it was, which is exactly what somebody needs in order to see what is wrong
   * with it. An error would replace a readable code block with a complaint.
   */
  it('answers nothing at all for a source it will not draw', () => {
    const entry = register({ maxLines: 1 })

    expect(entry.run({ source: GRAPH })).toBeNull()
    expect(entry.run({ source: '%%{init: {}}%%\ngraph TD;' })).toBeNull()
    expect(entry.run({})).toBeNull()
  })

  it('decides for itself which workspaces it applies to', () => {
    const entry = register({ workspaces: 'ws1' })

    expect(entry.when({ workspaceId: 'ws1' })).toBe(true)
    expect(entry.when({ workspaceId: 'ws2' })).toBe(false)
    expect(entry.when()).toBe(false)
  })

  it('applies everywhere when it was not told otherwise', () => {
    const entry = register()

    expect(entry.when({ workspaceId: 'anything' })).toBe(true)
    expect(entry.when()).toBe(true)
  })

  it('asks for the one registry it uses', async () => {
    const module = await import('../index.js')

    expect(module.inject).toEqual(['renderers'])
    expect(module.name).toBe('mermaid')
  })
})

describe('the manifest', () => {
  it('calls itself what the module calls itself', async () => {
    const [manifest, module] = await Promise.all([
      import('../agentrq-extension.json', { with: { type: 'json' } }),
      import('../index.js'),
    ])

    // The name is an address — it is how everything else refers to this
    // extension — so a module disagreeing with it means half the wiring points
    // somewhere that does not exist.
    expect(manifest.default.name).toBe(module.name)
  })

  it('asks for no MCP tools, because it reads nothing', () => {
    // Worth stating: this extension is handed the text it renders, and needs no
    // access to the workspace at all. Its install screen shows no permissions.
    return import('../agentrq-extension.json', { with: { type: 'json' } }).then(({ default: manifest }) => {
      expect(manifest.mcp).toBeUndefined()
    })
  })
})
