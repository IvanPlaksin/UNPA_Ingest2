# Custom Forms — @unpa/chat

How to integrate your application's FormRenderer component with the chat widget for structural multi-field forms.

---

## Overview

The chat component handles two kinds of input nodes:

| Node kind | What triggers it | How it's rendered |
|-----------|-----------------|-------------------|
| **Simple node** | `wait_input` with `inputType: 'text'` / `'search'` / `'textarea'` or a short `choices` list | Built-in textarea or choice buttons — no FormRenderer needed |
| **Structural node** | `wait_input` with `structuralGraphId` set | Requires a `FormRenderer` component from the host app; falls back to built-in textarea if not provided |

Structural nodes represent multi-field forms defined as separate GXE graphs. The chat widget delegates rendering entirely to your FormRenderer — it only supplies the `FormDefinition` and calls your `onSubmit` callback.

---

## Passing a FormRenderer

```jsx
import { UnpaChat } from '@unpa/chat';
import { MyFormRenderer } from './components/MyFormRenderer';

<UnpaChat
  apiBaseUrl="/api/v1"
  userId="user-1"
  formRenderer={MyFormRenderer}
/>
```

With `useUnpaChat` (headless):

```jsx
import { useUnpaChat } from '@unpa/chat';
import { waitingNodeToFormDefinition, extractFormResponse } from '@unpa/chat/src/utils/waitingNodeToForm';
import { MyFormRenderer } from './components/MyFormRenderer';

function MyChat() {
  const { messages, submitForm, dialogState } = useUnpaChat({ ... });

  return messages.map(msg => {
    if (!msg.waitingNode || msg.formSubmitted) return null;
    const definition = waitingNodeToFormDefinition(msg.waitingNode, dialogState);
    return (
      <MyFormRenderer
        key={msg.waitingNode.nodeId}
        definition={definition}
        onSubmit={(data) => submitForm(extractFormResponse(data), msg)}
      />
    );
  });
}
```

---

## `FormDefinition` Schema

`waitingNodeToFormDefinition(waitingNode, sessionState?)` returns:

```ts
interface FormDefinition {
  id:          string;           // 'form_{nodeId}'
  name:        string;           // human-readable title (node label)
  description: string | null;    // node prompt, or null
  status:      'ACTIVE';
  sections:    FormSection[];
}

interface FormSection {
  id:          string;
  title:       string | null;
  order:       number;
  collapsible?: boolean;         // true for the context section
  fields:      FormField[];
}

interface FormField {
  id:           string;          // '{nodeId}_choice' | '{nodeId}_text' | '{nodeId}_form'
  name:         string;          // 'userInput' for the main field; '_ctx_*' for context fields
  type:         'select' | 'text' | 'textarea';
  label:        string;
  required:     boolean;
  placeholder?: string;
  rows?:        number;          // present on textarea fields
  options?:     { value: string; label: string }[];  // present on select fields
  defaultValue?: string;         // present on context (read-only) fields
  readOnly?:    boolean;         // true for context fields
  order:        number;
}
```

### Field type mapping

| `waitingNode.choices` | `waitingNode.inputType` | Generated `type` |
|----------------------|------------------------|-----------------|
| Non-empty array | any | `select` |
| Empty / undefined | `'text'` | `textarea` |
| Empty / undefined | `'search'` | `text` |
| Empty / undefined | `undefined` or other | `textarea` |

### Context section

When `dialogState` contains session-scoped context, a second section is appended with read-only fields:

| `dialogState` key | Field label | Field name |
|-------------------|-------------|------------|
| `service_code` | `"Service"` | `_ctx_service` |
| `location.name` or `dutyStation` | `"Location"` | `_ctx_location` |

The context section has `collapsible: true` and `order: 1`. Main fields have `order: 0`.

---

## Detecting Structural Nodes

```js
import { isStructuralNode } from '@unpa/chat/src/utils/waitingNodeToForm';

isStructuralNode({ structuralGraphId: 'equipment-request' }); // true
isStructuralNode({ inputType: 'text' });                       // false
```

`FormWidget` uses this internally to decide whether to delegate to `FormRenderer` or render the built-in fallback.

---

## `FormRenderer` Component Contract

Your component receives:

| Prop | Type | Description |
|------|------|-------------|
| `definition` | `FormDefinition` | Form structure, fields, and context |
| `onSubmit` | `(data: Record<string, unknown>) => void` | Call with form data when the user submits |
| `isLoading` | `boolean` | True while the API request is in flight — disable the submit button |
| `sessionState` | `Record<string, unknown>` | Full dialog state object |

```tsx
interface FormRendererProps {
  definition:   FormDefinition;
  onSubmit:     (data: Record<string, unknown>) => void;
  isLoading?:   boolean;
  sessionState?: Record<string, unknown>;
}
```

### Minimal example

```tsx
import React, { useState } from 'react';

export function MyFormRenderer({ definition, onSubmit, isLoading }) {
  const mainSection = definition.sections.find(s => s.order === 0);
  const [values, setValues] = useState({});

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(values);
  };

  return (
    <form onSubmit={handleSubmit}>
      <h4>{definition.name}</h4>
      {definition.description && <p>{definition.description}</p>}

      {mainSection?.fields.map(field => (
        <div key={field.id}>
          <label htmlFor={field.id}>{field.label}</label>
          {field.type === 'select' ? (
            <select
              id={field.id}
              value={values[field.name] || ''}
              onChange={e => setValues({ ...values, [field.name]: e.target.value })}
              required={field.required}
            >
              <option value="">{field.placeholder || 'Choose...'}</option>
              {field.options.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            <textarea
              id={field.id}
              name={field.name}
              rows={field.rows || 3}
              placeholder={field.placeholder}
              required={field.required}
              value={values[field.name] || ''}
              onChange={e => setValues({ ...values, [field.name]: e.target.value })}
            />
          )}
        </div>
      ))}

      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Sending...' : 'Submit'}
      </button>
    </form>
  );
}
```

---

## Extracting the Response

`submitForm` expects either a `string` or an object. When the FormRenderer calls `onSubmit(data)`, pass the result of `extractFormResponse` to normalize it:

```js
import { extractFormResponse } from '@unpa/chat/src/utils/waitingNodeToForm';

// In FormWidget or your headless handler:
onSubmit={(data) => chat.submitForm(extractFormResponse(data), message)}
```

`extractFormResponse` logic:
1. Returns `data.userInput` if present.
2. Otherwise returns the first value whose key does NOT start with `_ctx_`.
3. Returns `null` if all keys are context fields or data is falsy.

Object values (multi-field forms) are JSON-stringified by `submitForm` before being sent to the API.

---

## Built-in Fallback

If `formRenderer` is not provided, `FormWidget` renders:
- A `<select>` dropdown if the node has `choices`.
- A `<textarea>` for all other input types.

The fallback handles simple nodes correctly but cannot render structural multi-field forms. Always provide a `FormRenderer` when your graphs use structural nodes.
