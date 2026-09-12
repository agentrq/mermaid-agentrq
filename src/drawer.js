/**
 * Drawing mermaid, inside the frame AgentRQ gives this extension.
 *
 * This file is the whole of what runs on the other side of the boundary. It is
 * bundled — mermaid and all — into one script, because that is what a drawer
 * is: text posted into a sandboxed document with an opaque origin, no bridge,
 * and no network at all. Nothing here can fetch anything, so everything it
 * needs has to already be in the bundle.
 *
 * ## What the host used to do, and now does not
 *
 * AgentRQ used to draw mermaid itself: it depended on mermaid, turned the
 * source into an `<svg>` string, ran that through DOMPurify and put it in the
 * page. The frame replaces all of it. Markup produced from this extension's
 * source now stays inside a document that can reach nothing, so there is no
 * sanitiser to get right and no third-party markup on a privileged origin.
 *
 * The sanitiser is gone, not moved. The boundary is the guard now.
 *
 * ## Configuration is still not the diagram's to choose
 *
 * Mermaid reads `%%{init: ...}%%` directives out of the *source*, and one of
 * the things they can set is `securityLevel`. Left alone, a diagram could turn
 * off mermaid's own HTML escaping from inside the text being drawn. The
 * extension refuses that directive before a diagram ever reaches here, and
 * mermaid is initialised with `securityLevel: 'strict'` and `htmlLabels: false`
 * regardless — two guards that fail differently.
 *
 * The whole configuration goes in on every call: `initialize` **replaces**
 * rather than merges, and a partial call once put `htmlLabels` back to its
 * default, which turned every label into a `foreignObject` and produced a
 * diagram with nothing written on it.
 */
import mermaid from 'mermaid'

/** Distinct per diagram: mermaid uses it as an element id while measuring. */
let nextId = 0

const THEMES = { light: 'default', dark: 'dark' }

function configFor(theme) {
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    fontFamily: 'inherit',
    theme: THEMES[theme] ?? THEMES.light,
  }
}

/**
 * Draws one diagram into the element the frame provides.
 *
 * Throws on a diagram that will not parse, and lets the frame report it: the
 * block outside shows the reason with the source underneath, which is what
 * whoever wrote the diagram needs in order to fix it.
 */
export default async function draw(root, source, { theme = 'light' } = {}) {
  const text = String(source ?? '').trim()
  if (!text) throw new Error('This diagram is empty.')

  mermaid.initialize(configFor(theme))
  const { svg } = await mermaid.render(`agentrq-diagram-${nextId++}`, text)

  // `innerHTML` here, deliberately, and it is the one place it is right: this
  // document is the sandbox. The markup cannot reach the app, the bridge or
  // anything else, which is the entire reason the frame exists.
  root.innerHTML = svg

  const drawn = root.querySelector('svg')
  if (drawn) {
    drawn.style.maxWidth = '100%'
    drawn.style.height = 'auto'
  }
}
