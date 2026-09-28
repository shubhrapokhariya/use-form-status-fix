# use-form-status-fix

A single dependency-free file that fixes the most common mistake with React 19's `useFormStatus`: calling the hook in the same component that renders the `<form>`, which leaves `pending` stuck at `false` with no error and no warning.

It ships four pieces built on top of `useFormStatus`:

- **`SubmitButton`**: a submit button that reads `useFormStatus` itself, so the placement mistake can't happen through it. Handles per-button pending state for forms with more than one submit button, blocks repeat clicks while a submission is in flight, and keeps keyboard focus during that time.
- **`PendingFieldset`**: a `<fieldset>` that disables every field inside it while the form is submitting.
- **`FormStatusText`**: a live region that announces a pending message to screen readers.
- **`useFormStatusForIntent`** / **`useSubmittedField`**: the underlying hooks, if you want to build your own UI instead of using the components above.

Requires React 19 and react-dom 19, since `useFormStatus` is a React 19 API. Works with Next.js Server Actions and with plain client-side form actions.

## Why useFormStatus needs this

`useFormStatus` only reports on a **parent** `<form>`. Call it in the component that renders the `<form>` element and it has nothing to read yet, because at that point in the render the form doesn't exist as anyone's ancestor. React docs cover this, but nothing in the runtime warns you about it:

```tsx
// pending stays false, forever, no matter what the action does
function ProfileForm() {
  const { pending } = useFormStatus();

  return (
    <form action={saveProfile}>
      <input name="name" />
      <button disabled={pending}>Save</button>
    </form>
  );
}
```

The fix is moving the hook into a child of the `<form>`:

```tsx
import { SubmitButton } from "./src";

function ProfileForm() {
  return (
    <form action={saveProfile}>
      <input name="name" />
      <SubmitButton pendingText="Saving...">Save</SubmitButton>
    </form>
  );
}
```

`SubmitButton` calls `useFormStatus` inside itself, which is always a descendant of whatever `<form>` renders it, so the mistake above stops being possible once you're using it instead of writing the hook by hand.

## Installation

This is meant to be copied into your project, not installed as a package that gets bundled from `node_modules`. Grab `src/index.tsx`, drop it wherever your project keeps shared components (`components/`, `lib/`, `ui/`), and adjust the import paths in the examples to match.

```
curl -o use-form-status-fix.tsx https://raw.githubusercontent.com/shubhrapokhariya/use-form-status-fix/main/src/index.tsx
```

Or clone the whole repo if you also want the worked examples:

```
git clone https://github.com/shubhrapokhariya/use-form-status-fix.git
```

The file starts with `"use client"`, so it's safe to import from a Server Component as long as the component that renders it stays a Client Component.

## Usage

### One submit button

```tsx
import { SubmitButton } from "@/components/use-form-status-fix";
import { saveProfile } from "@/app/actions";

export function ProfileForm() {
  return (
    <form action={saveProfile}>
      <input name="name" />
      <SubmitButton pendingText="Saving...">Save</SubmitButton>
    </form>
  );
}
```

While the action runs, the button gets `aria-busy="true"`, `data-pending`, and `aria-disabled="true"`, shows the built-in spinner, and swaps its label for `pendingText`. When the action resolves, it all reverts.

### Two submit buttons, one form

Plain `useFormStatus().pending` is shared across the whole form, so with two buttons a single click lights up both of them. Give each button an `intent` and only the one that was pressed shows pending:

```tsx
<form action={savePost}>
  <textarea name="body" />

  <SubmitButton intent="draft" pendingText="Saving draft...">
    Save Draft
  </SubmitButton>

  <SubmitButton intent="publish" pendingText="Publishing...">
    Publish
  </SubmitButton>
</form>
```

```ts
// app/actions.ts
"use server";

export async function savePost(formData: FormData) {
  const intent = formData.get("intent"); // "draft" or "publish"
}
```

Pressing Enter inside a text field submits through the form's default button, and the HTML standard defines that as the first submit button in tree order. Put your safer action first.

### Locking fields, announcing status, echoing a submitted value

```tsx
import {
  FormStatusText,
  PendingFieldset,
  SubmitButton,
  useSubmittedField,
} from "@/components/use-form-status-fix";

function SubmittedUsername() {
  // must be rendered inside the <form>
  const username = useSubmittedField("username");
  return username ? <p>Requesting {username}...</p> : null;
}

export function UsernameForm() {
  return (
    <form action={requestUsername}>
      <PendingFieldset>
        <input name="username" />
      </PendingFieldset>

      <SubmitButton pendingText="Requesting...">Request</SubmitButton>
      <FormStatusText pendingText="Submitting, please keep this tab open." />
      <SubmittedUsername />
    </form>
  );
}
```

More complete, runnable versions of these three are in [`examples/`](./examples).

### Pairing with useActionState

`SubmitButton` only tracks pending state. For a result or a validation error, pair it with `useActionState`:

```tsx
import { useActionState } from "react";
import { SubmitButton } from "@/components/use-form-status-fix";

function PostForm() {
  const [state, formAction] = useActionState(savePost, { error: null });

  return (
    <form action={formAction}>
      <textarea name="body" />
      <SubmitButton pendingText="Saving...">Save</SubmitButton>
      {state.error ? <p role="alert">{state.error}</p> : null}
    </form>
  );
}
```

With `useActionState`, the action receives `(previousState, formData)` instead of just `formData`.

### Styling the pending state

`SubmitButton` uses `aria-disabled`, not the native `disabled` attribute, so style it with an attribute selector:

```css
button[aria-disabled="true"] {
  opacity: 0.6;
  cursor: progress;
}

button[data-pending] {
  cursor: progress;
}
```

With Tailwind, `aria-disabled:` and `data-[pending]:` variants do the same job.

## API

### `SubmitButton`

| Prop                  | Type                                               | Default  | Description                                                                     |
| --------------------- | -------------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| `children`            | `ReactNode` or `(status: FormStatus) => ReactNode` | required | Button content, or a function that receives the full form status                |
| `pendingText`         | `ReactNode`                                        | none     | Shown instead of `children` while this button's own submission is pending       |
| `intent`              | `string`                                           | none     | Adds `name="intent"` / `value={intent}` and scopes pending state to this button |
| `showSpinner`         | `boolean`                                          | `true`   | Renders the built-in SVG spinner while this button is pending                   |
| `unsafeSkipFormCheck` | `boolean`                                          | `false`  | Silences the dev-only "not inside a form" console warning                       |
| `disabled`            | `boolean`                                          | none     | Native `disabled`, which also sets `aria-disabled`                              |
| `onClick`             | click handler                                      | none     | Runs when idle, skipped while any submission in the form is pending             |
| `ref`                 | `Ref<HTMLButtonElement>`                           | none     | Object refs and React 19 cleanup-function callback refs both work               |

Every other native `button` prop passes through except `type`, which is always `"submit"`.

Attributes it sets on the DOM node:

| Attribute              | When                                                            |
| ---------------------- | --------------------------------------------------------------- |
| `aria-busy="true"`     | This specific button's submission is pending                    |
| `data-pending`         | Same as above                                                   |
| `aria-disabled="true"` | Any submission in the form is pending, or `disabled` was passed |

### `useFormStatusForIntent(intent?)`

Everything `useFormStatus` returns, plus `isThisIntentPending`: `true` only while the pending submission's `intent` field matches the one passed in. With no argument, it's identical to `pending`. Must be called from a descendant of the `<form>`.

### `useSubmittedField(name)`

The string value of a field from the submission currently in flight, or `null` when the form is idle. File inputs return `null`.

### `PendingFieldset`

Accepts every `fieldset` prop. Adds `disabled` while the form is pending, plus an inline style reset (no border, margin, or padding). Pass `unstyled` to skip that reset under a CSP that blocks inline styles, and apply your own class instead. Also accepts `unsafeSkipFormCheck` and `ref`, same as `SubmitButton`, since it carries the same "must be inside a `<form>`" requirement and the same dev-only check for it.

### `FormStatusText`

| Prop                  | Type                   | Default  | Description                                               |
| --------------------- | ---------------------- | -------- | --------------------------------------------------------- |
| `pendingText`         | `ReactNode`            | required | Shown while the form is pending                           |
| `idleText`            | `ReactNode`            | `null`   | Shown otherwise                                           |
| `className`           | `string`               | none     | Class applied to the wrapping `span`                      |
| `unsafeSkipFormCheck` | `boolean`              | `false`  | Silences the dev-only "not inside a form" console warning |
| `ref`                 | `Ref<HTMLSpanElement>` | none     | Object refs and cleanup-function callback refs both work  |

Renders a `role="status"` / `aria-live="polite"` span that stays mounted at all times, since a live region that appears at the same moment its text changes isn't reliably announced. It reads the React tree, so it also works inside a portal, but the placement check below only looks at the DOM, so a correctly placed portal still triggers the warning. Pass `unsafeSkipFormCheck` for that case.

### `FormStatus`

`export type FormStatus = ReturnType<typeof useFormStatus>`, so it always matches whichever `@types/react-dom` version you have installed.

## Design decisions

- **`aria-disabled` instead of `disabled` on the pending button.** In a Chromium 153 test, a button that became `disabled` lost keyboard focus, which moved to the page body. A button using `aria-disabled` kept it. Repeat clicks are still blocked, through a `preventDefault` in the click handler rather than the native attribute.
- **Every `SubmitButton` in a form ignores clicks while any one submission is pending**, including the click the browser fires for Enter-key implicit submission. Only the button that was actually pressed renders its spinner and `pendingText`.
- **`aria-busy` is not an announcement mechanism.** It's there for styling and for assistive tech that reads element state, not for triggering a spoken update. Use `FormStatusText` when you want the pending change read out loud.
- **The spinner is inline SVG using SMIL**, not a CSS animation or an icon library import, and it turns off for `prefers-reduced-motion: reduce`.
- **`SubmitButton`, `PendingFieldset`, and `FormStatusText` all run the same dev-only placement check and accept the same `unsafeSkipFormCheck` escape hatch.** Each one documents "must be rendered inside the `<form>`," so a misplaced fieldset or status message fails just as silently as a misplaced button, and all three get the same guardrail for it.

## Known limitations

- **`form.requestSubmit()` is not blocked.** It bypasses the button's click handler entirely. Guard that call site yourself if your code uses it.
- **No submitter means every intent button shows pending.** `requestSubmit()` called with no argument submits without a named submitter, so `useFormStatusForIntent` has no `intent` to compare against and every button with one lights up.
- **Two synchronous `click()` calls both go through.** The pending state hasn't rendered yet by the time the second call runs in the same task. Real user input, including a fast double click, arrives as separate events and is blocked correctly.
- **`intent` doesn't survive a per-button `formAction`.** With a per-button function `formAction`, React leaves the submitter's name and value out of the `FormData`, so no `intent` is found and every `SubmitButton` shows pending for that submission.
- **`PendingFieldset`'s inline style reset needs `unsafe-inline` (or use `unstyled`).** A CSP that blocks inline style attributes ignores the reset on server-rendered HTML, and the fieldset keeps its default border.
- **React 19 resets uncontrolled fields after a successful action.** Use controlled inputs, or return submitted values from the action via `useActionState`, if you need to keep them.
- **The dev check only knows about the DOM, not the React tree.** It runs on `SubmitButton`, `PendingFieldset`, and `FormStatusText`, and warns if any of them isn't inside a `<form>` element. It cannot detect a raw `useFormStatus()` call made directly in the component that renders the `<form>`; using these components instead of a raw call is what avoids that.

## Tested against

React 19.3.0.

| Environment                       | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| jsdom                             | Passes, including refs, `intent`, the dev guard, `PendingFieldset`, and `useActionState`                                                                                                                                                                                                                                                                                                                                                                            |
| Chromium 153 and Firefox          | Enter and Space ignored while pending, a real double click blocked, `aria-disabled` keeps keyboard focus on `SubmitButton` while a plain `disabled` button loses it to the page body, multi-button `intent` scoping picks the right button, Enter-key submission routes through the first submit button in tree order, and the placement warning fires correctly on `SubmitButton`, `PendingFieldset`, and `FormStatusText` when any is rendered outside a `<form>` |
| Chromium 153 only                 | No hydration warning with `prefers-reduced-motion`, spinner animates under a strict CSP                                                                                                                                                                                                                                                                                                                                                                             |
| Next.js 16.3.6 (production build) | A Server Action form goes idle → pending → idle with the correct `intent` received server-side                                                                                                                                                                                                                                                                                                                                                                      |
| Vite (dev and build)              | `process.env.NODE_ENV` replaced correctly in both                                                                                                                                                                                                                                                                                                                                                                                                                   |
| React 18                          | Not supported, `useFormStatus` is a React 19 API                                                                                                                                                                                                                                                                                                                                                                                                                    |

If you test it in an environment not listed here, a pull request adding it to this table is welcome.

## FAQ

**Why does `useFormStatus` always return `pending: false` for me?**
Almost always the hook is called in the same component that renders the `<form>`, or in a component with no `<form>` ancestor at all. React only reports on a parent form. Move the read into a child component, or use `SubmitButton`.

**Does this work with an `onSubmit` handler instead of the `action` prop?**
No. `useFormStatus` tracks the form's Action lifecycle specifically. A form that only calls `preventDefault()` inside `onSubmit` has no Action for it to read, regardless of where the hook sits.

**Does it replace `useActionState`?**
No, they answer different questions. `useActionState` gives you the result of an action from the component that called it. `useFormStatus` lets an unrelated descendant read the form's live pending state with nothing passed down to it. Use them together, as shown above.

## Contributing

Issues and pull requests are welcome. If you're filing a bug, include your React version, browser, and whether the form uses a Server Action or a client-side action.

## License

MIT. See [LICENSE](./LICENSE).
