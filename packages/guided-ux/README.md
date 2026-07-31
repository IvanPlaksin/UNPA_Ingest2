# @guided-ux/tour

Guided product tours that **ask the host what exists** instead of assuming it.

No build step, no CSS file, no dependencies in the core. Drop it into an existing app
and it changes nothing about the bundler.

---

## The one idea

Most tour libraries put a CSS selector in the tour content:

```js
{ step: 1, selector: '#save-button', text: 'Click Save' }   // ← the problem
```

The tour now *claims* to know somebody else's markup. Every rename, conditional render
or lazy load turns that claim into a confident lie: a spotlight over empty space, or
over the wrong control entirely. Nothing errors. The tour just points at nothing.

Here the direction is inverted. The **host declares** what exists:

```jsx
function SaveButton() {
  const ref = useTourAnchor('editor.save', {
    label: 'Save version',
    available: () => hasUnsavedChanges,     // optional; defaults to "it is mounted"
    route: '/editor',                       // where to find it, for a helpful message
  });
  return <button ref={ref}>Save</button>;
}
```

…and the tour **asks**. The answer is never a boolean — it is one of five, and keeping
them apart is what makes the tour honest:

| answer | meaning | what the tour does |
|---|---|---|
| `ready` | the element is there and usable | spotlight it |
| `not_registered` | nobody declared this id | say so; skip if the step is optional |
| `not_mounted` | declared, not on screen | say where it lives (`route`) |
| `unavailable` | on screen, `available()` said no | say it exists but is not usable yet |
| `threw` | the host's own code failed | treat as absent, never crash the tour |

A **required** step whose anchor is missing **blocks and explains**. An **optional**
one is **skipped aloud** — silently dropping it would leave a numbered tour quietly
losing steps, with no way for the user to know they missed something.

---

## Install

It is plain ESM. Point your bundler at the directory:

```js
// vite.config.js
resolve: { alias: { '@guided-ux/tour': '/abs/path/to/packages/guided-ux' } }
```

React is an **optional** peer dependency — the core does not import it.

---

## Use

```jsx
import { TourProvider, TourSpotlight, TourPanel, TourAssistant, useTour } from '@guided-ux/tour/react';
import { createHttpNarrator } from '@guided-ux/tour/voice';
import { createJsonProvider } from '@guided-ux/tour/providers/json';

const provider = createJsonProvider({ scenarios: [ /* … */ ] });
const narrator = createHttpNarrator({ endpoint: '/api/tour/speak', enabled: false });

<TourProvider provider={provider} narrator={narrator} lang="en">
  <YourApp />
  <TourSpotlight />
  <TourPanel />
  <TourAssistant ask={myAnswerFunction} />
</TourProvider>
```

Start one from anywhere inside: `const tour = useTour(); tour.start('scenario-id')`.

---

## A scenario

A graph, not a list — steps name their successors, and a successor may be conditional
on what the host reports.

```js
{
  id: 'operator-path',
  entry: 'intro',
  steps: [
    { id: 'intro', content: { text: { en: 'This tour follows one task.' } }, next: 'find' },
    { id: 'find',  anchorId: 'editor.explorer',
      content: { title: { en: 'Find the rule' }, text: { en: 'Search here uses the text the model was given.' } },
      next: [
        { to: 'advanced', when: { anchorAvailable: 'editor.filters' } },
        { to: 'save' },                                    // unguarded = default
      ] },
  ],
}
```

`validateScenario()` refuses, before anyone sees it: dangling successors, duplicate
ids, an entry that does not exist. It warns about unreachable steps and about
narration nobody will listen to the end of (see below).

---

## The knowledge provider

Three methods. That is the entire contract:

```js
{
  capabilities(),                    // { vectorSearch, graph, languages }
  listScenarios(),
  getScenario(id),
  search(query, { lang, limit, scenarioId }),
}
```

Ship `providers/json` and everything works from a static object. Implement the same
three over a graph database and a vector store and the front end is unchanged — that
substitutability is the point, not a nicety.

`capabilities().vectorSearch` is surfaced **to the user**: an assistant that cannot
look things up must say so rather than answering anyway.

---

## Narration

The narrator does not know any speech vendor. Give it `synthesize` and `play`:

- **Muted by default.** Sound that starts by itself is the most complained-about
  behaviour a tour has — open-plan offices, shared screens, meetings.
- **Prefetches the next step.** Measured against Azure Speech (swedencentral), the
  first audio chunk arrives 540–1317 ms after the request. Unprefetched, that gap sits
  between the click and any sound, and users click again into it.
- **Stops instantly** when the assistant opens. Talking over someone asking a question
  is the rudest thing this system could do. Resuming is always an explicit act.
- A speech failure **never** ends the tour; it degrades to text and says why.

### Narration length is validated, not suggested

Measured: 68 characters took 3,988 ms to speak — about **17 characters per second**.
Research puts the attention limit for one spoken step at 10–15 seconds. So:

| length | ≈ spoken | validator |
|---|---|---|
| ≤ 250 chars | ≤ 15 s | fine |
| 250–500 | 15–30 s | warning |
| > 500 | > 30 s | **error** |

---

## The assistant

Opening it pauses and silences the tour. It searches the provider, optionally passes
the hits to your `ask` function, and shows **where the answer came from**. A hit that
names a step becomes an offer to *go there* — usually the best answer to "where is
that?".

Without an `ask` function it still works: it shows the retrieved passages, labelled as
passages. Worse, and honest — and it means the package needs no model to run.

---

## Testing

```
npm test          # 43 tests, node --test, no bundler and no dependencies
```

That the core's suite needs neither is deliberate: a test run that required a bundler
would quietly disprove the portability claim on the first line of this file.
