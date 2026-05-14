# Theming — @unpa/chat

All visual styling is driven by CSS custom properties scoped to the root element. You can override individual variables or swap full palettes without touching any JavaScript.

---

## CSS Variable Reference

All variables are declared on `.unpa-chat-root`. The dark palette is the default; the light palette overrides a subset.

### Background layers

| Variable | Dark default | Light override | Purpose |
|----------|-------------|---------------|---------|
| `--unpa-bg-primary` | `#0d1117` | `#ffffff` | Outermost container background |
| `--unpa-bg-secondary` | `#161b22` | `#f6f8fa` | Bot bubble background, input bar |
| `--unpa-bg-tertiary` | `#21262d` | `#eaeef2` | Choice buttons, avatar background, text input |
| `--unpa-input-bg` | `var(--unpa-bg-tertiary)` | `#ffffff` | Text input field background |

### Text

| Variable | Dark default | Light override | Purpose |
|----------|-------------|---------------|---------|
| `--unpa-text-primary` | `#e6edf3` | `#1f2328` | Main message text |
| `--unpa-text-secondary` | `#8b949e` | `#656d76` | Muted labels, placeholders, timestamps |

### Borders and structure

| Variable | Dark default | Light override | Purpose |
|----------|-------------|---------------|---------|
| `--unpa-border` | `#30363d` | `#d0d7de` | Dividers, bubble borders, input borders |
| `--unpa-radius` | `12px` | *(unchanged)* | Large border radius (bubbles, root container) |
| `--unpa-radius-sm` | `6px` | *(unchanged)* | Small border radius (inputs, send button) |

### Accent / interactive

| Variable | Dark default | Light override | Purpose |
|----------|-------------|---------------|---------|
| `--unpa-accent` | `#6366f1` | *(unchanged)* | Send button, input focus ring, selected choice border, link color |
| `--unpa-accent-hover` | `#818cf8` | *(unchanged)* | Hover state for accent elements |

### Message bubbles

| Variable | Dark default | Light override | Purpose |
|----------|-------------|---------------|---------|
| `--unpa-user-bg` | `rgba(99,102,241,0.12)` | `rgba(99,102,241,0.08)` | User message bubble background |
| `--unpa-bot-bg` | `var(--unpa-bg-secondary)` | *(unchanged)* | Bot message bubble background |

### Status colors

| Variable | Dark default | Light override | Purpose |
|----------|-------------|---------------|---------|
| `--unpa-error-color` | `#f85149` | *(unchanged)* | Error bubble border, error text |
| `--unpa-success-color` | `#3fb950` | *(unchanged)* | Not used in built-in UI; available for custom extensions |

### Typography

| Variable | Dark default | Light override | Purpose |
|----------|-------------|---------------|---------|
| `--unpa-font` | `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` | *(unchanged)* | Font stack applied to the whole component |

---

## CSS Class Reference

These class names are stable public API. Use them for custom overrides in your host app's stylesheet.

### Root

| Class | Description |
|-------|-------------|
| `.unpa-chat-root` | Outermost container. All CSS variables are declared here. |
| `.unpa-theme-dark` | Applied automatically when `theme="dark"` (default). |
| `.unpa-theme-light` | Applied automatically when `theme="light"`. |

### Messages

| Class | Description |
|-------|-------------|
| `.unpa-chat-messages` | Scrollable message list container. |
| `.unpa-chat-message` | Wrapper for a single message row (avatar + bubble). |
| `.unpa-chat-message-user` | Modifier: user message (reversed layout, accent bubble). |
| `.unpa-chat-message-bot` | Modifier: bot message. |
| `.unpa-chat-message-error` | Modifier: error message (red border). |
| `.unpa-chat-avatar` | Circular avatar icon. |
| `.unpa-chat-message-content` | Message bubble. |

### Choices

| Class | Description |
|-------|-------------|
| `.unpa-chat-choices` | Flex container wrapping all choice buttons. |
| `.unpa-chat-choice-btn` | Individual choice button. |
| `.unpa-chat-choice-btn.selected` | The choice the user clicked. |
| `.unpa-chat-choice-btn.disabled` | Unselected choices after one was picked. |
| `.unpa-chat-choice-label` | "Choose one" label above choice buttons. |
| `.unpa-chat-choice-prompt` | Optional prompt text above choices. |

### Input area

| Class | Description |
|-------|-------------|
| `.unpa-chat-input-area` | Bottom bar containing the text field and send button. |
| `.unpa-chat-input` | Text `<input>` element. |
| `.unpa-chat-send-btn` | Send button (`<button>`). |

### Loading

| Class | Description |
|-------|-------------|
| `.unpa-chat-typing` | Typing indicator shown while `isLoading` is true. |
| `.unpa-chat-spin` | Spinning icon animation class. |

---

## Applying a Theme

### Built-in presets

```jsx
<UnpaChat theme="dark" ... />   {/* default */}
<UnpaChat theme="light" ... />
```

### Override variables — scoped to one instance

Use the `className` prop and target `.unpa-chat-root` in your stylesheet:

```jsx
<UnpaChat className="my-chat" ... />
```

```css
.my-chat.unpa-chat-root {
  --unpa-accent:       #0ea5e9;   /* sky blue */
  --unpa-accent-hover: #38bdf8;
  --unpa-radius:       6px;       /* flatter bubbles */
}
```

### Override variables — global default

If you have only one chat instance and want to set defaults globally:

```css
/* after importing @unpa/chat/dist/styles.css */
.unpa-chat-root {
  --unpa-font: 'Inter', sans-serif;
  --unpa-radius: 8px;
}
```

### Complete custom theme example

```css
/* Brand: UN blue palette, sharp corners */
.unpa-chat-root.unpa-theme-un {
  --unpa-bg-primary:   #003c6e;
  --unpa-bg-secondary: #005189;
  --unpa-bg-tertiary:  #006aaf;
  --unpa-border:       rgba(255, 255, 255, 0.15);
  --unpa-text-primary: #ffffff;
  --unpa-text-secondary: rgba(255, 255, 255, 0.6);
  --unpa-accent:       #009edb;
  --unpa-accent-hover: #40c1f0;
  --unpa-user-bg:      rgba(0, 158, 219, 0.18);
  --unpa-bot-bg:       var(--unpa-bg-secondary);
  --unpa-input-bg:     var(--unpa-bg-tertiary);
  --unpa-radius:       4px;
  --unpa-radius-sm:    2px;
}
```

```jsx
<UnpaChat theme="un" className="" ... />
```

> **Note:** `theme="un"` applies the class `.unpa-theme-un`. The built-in stylesheet only defines dark/light; your CSS defines the rest.

---

## Inline Style Override

For one-off adjustments that don't warrant a CSS class:

```jsx
<UnpaChat
  style={{ borderRadius: 0, boxShadow: '0 4px 24px rgba(0,0,0,0.3)' }}
  ...
/>
```

`style` is merged onto the root `<div>` after the CSS-variable-driven styles, so it can override layout properties (box-shadow, border, margin, etc.) but not CSS variables.
