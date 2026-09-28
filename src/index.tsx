"use client";

/**
 * React 19 useFormStatus Toolkit
 * Requires: React 19+ / react-dom 19+ (useFormStatus) in a Client Component.
 * Works with Next.js Server Actions and plain client-side form actions.
 *
 * WHY THIS EXISTS
 *   useFormStatus() reports the status of the nearest PARENT <form>. Per the
 *   React docs it will not track a <form> rendered in the same component that
 *   calls the hook, and it returns pending: false forever when the component
 *   is not inside a <form>. Nothing throws, so the button silently never
 *   shows a pending state.
 *
 * WHAT YOU GET
 *   SubmitButton       A submit button that calls useFormStatus() itself, so
 *                      the common mistake (calling the hook in the component
 *                      that renders the <form>) can't happen when you use it.
 *                      Sets aria-busy, aria-disabled and data-pending, ignores
 *                      clicks while a submission is in flight, and scopes the
 *                      pending UI to the pressed button in multi-button forms.
 *   PendingFieldset    Disables every field while the form is submitting.
 *   FormStatusText     A live-region message ("Saving...") anywhere in the form.
 *   useFormStatusForIntent(intent)  The multi-button logic as a hook.
 *   useSubmittedField(name)         Read a submitted value while pending
 *                                   (e.g. "Requesting @shubhra...").
 *
 * DESIGN DECISIONS (each one is deliberate)
 *   - Pending uses aria-disabled + a blocked click, NOT the disabled
 *     attribute. A disabled button that has focus drops keyboard focus, and
 *     screen-reader users lose their place. aria-disabled keeps focus.
 *     Style it with [aria-disabled="true"] or the data-pending attribute.
 *   - While ANY submission is pending, every SubmitButton in the form ignores
 *     clicks (including Enter-key implicit submission, which arrives as a
 *     click on the default button). Only the button that was pressed shows
 *     the spinner and pendingText.
 *   - aria-busy is there for styling and assistive tech, but it is not an
 *     announcement mechanism. Use FormStatusText when you want the change
 *     read out.
 *   - The spinner is pure SVG (SMIL). No CSS injection, no icon library, no
 *     side effects in render, and it stops animating for users who have
 *     prefers-reduced-motion set.
 *   - SubmitButton, PendingFieldset, and FormStatusText all run the same
 *     dev-only placement check and all accept the same unsafeSkipFormCheck
 *     escape hatch. A misplaced fieldset or status message fails just as
 *     silently as a misplaced button, so all three get the same guardrail.
 *
 * KNOWN LIMITS
 *   - Programmatic form.requestSubmit() bypasses button clicks, so it is not
 *     blocked. Guard that call site yourself if you use it.
 *   - Multi-button scoping reads the submitter's name="intent" value from
 *     FormData. If a form is submitted with no submitter (requestSubmit()
 *     without an argument) there is no intent, so every intent button shows
 *     pending rather than none.
 *   - Enter in a text field clicks the form's default button, which the HTML
 *     standard defines as the first submit button in tree order. That button's
 *     intent is what the action receives, so put your safest action first
 *     (Save Draft before Publish).
 *   - Two click() calls dispatched in the same synchronous task both go
 *     through, because the pending state has not rendered yet. Real user
 *     input (including a fast double click) arrives as separate events and
 *     is blocked.
 *   - PendingFieldset ships an inline style reset. A CSP that forbids inline
 *     style attributes (style-src without 'unsafe-inline') ignores it on
 *     server-rendered HTML and the fieldset keeps its default border. Pass
 *     `unstyled` and style it with a class instead.
 *   - React 19 resets uncontrolled fields after a successful form action. If
 *     you need to keep values, return them from the action (useActionState)
 *     or use controlled inputs.
 *   - The dev check only knows about the DOM, not the React tree. It runs on
 *     SubmitButton, PendingFieldset, and FormStatusText, and warns if any of
 *     them isn't inside a <form> element. It cannot detect a raw
 *     useFormStatus() call made directly in the component that renders the
 *     <form>; use these components instead of a raw call to avoid that.
 *   - intent cannot travel with a per-button function formAction. React
 *     leaves the submitter's name and value out of the FormData in that
 *     case, so no intent is found and every SubmitButton shows pending for
 *     that submission.
 *   - Only submissions that run through a function action or formAction are
 *     tracked. A plain URL string action, or an onSubmit handler that only
 *     calls preventDefault(), does not report pending, with or without this
 *     file.
 *
 * TESTED (React 19.3.0)
 *   jsdom; Chromium 153 and Firefox (Enter and Space ignored while pending,
 *   a real double click blocked, aria-disabled keeps keyboard focus on
 *   SubmitButton while a plain disabled button loses it to the page body,
 *   multi-button intent scoping picks the right button, Enter-key submission
 *   routes through the first submit button in tree order, and the placement
 *   warning fires correctly on SubmitButton, PendingFieldset, and
 *   FormStatusText when misplaced); Chromium 153 only (no hydration warning
 *   with prefers-reduced-motion, spinner animates under a strict CSP);
 *   Next.js 16.3.6 production build with a Server Action; Vite dev and
 *   build. Safari and screen readers not yet verified.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import { useFormStatus } from "react-dom";

/**
 * Exactly what react-dom returns (a union: when idle, data/method/action are
 * null). Derived from the hook so it can never drift from the real types.
 */
export type FormStatus = ReturnType<typeof useFormStatus>;

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */

const isDev = process.env.NODE_ENV !== "production";

/**
 * Forward a ref the way React 19 does: a callback ref that returns a cleanup
 * function is cleaned up on detach and NOT called with null; any other ref
 * is reset to null on detach.
 */
function attachRef<T>(ref: Ref<T> | undefined, node: T): () => void {
  let userCleanup: void | (() => void);
  if (typeof ref === "function") userCleanup = ref(node);
  else if (ref) (ref as { current: T | null }).current = node;
  return () => {
    if (typeof userCleanup === "function") userCleanup();
    else if (typeof ref === "function") ref(null);
    else if (ref) (ref as { current: T | null }).current = null;
  };
}

/** Dev-only: warn on mount if this element is not inside a <form> in the DOM. */
function useDevFormCheck(
  ref: RefObject<HTMLElement | null>,
  componentName: string,
  skip = false,
) {
  useEffect(() => {
    if (!isDev || skip) return;
    const node = ref.current;
    if (node && !node.closest("form")) {
      console.error(
        `[${componentName}] is not inside a <form> element in the DOM. ` +
          `useFormStatus reads the nearest parent <form> in the React tree, ` +
          `so pending state will not show unless this component is rendered ` +
          `inside the <form> component. If you have confirmed this placement ` +
          `is intentional, pass unsafeSkipFormCheck to silence this warning.`,
      );
    }
  }, [ref, componentName, skip]);
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(REDUCED_MOTION);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () =>
      typeof window !== "undefined" && !!window.matchMedia
        ? window.matchMedia(REDUCED_MOTION).matches
        : false,
    () => false, // server snapshot
  );
}

function Spinner() {
  const reduceMotion = usePrefersReducedMotion();
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      style={{
        marginInlineEnd: "0.4em",
        verticalAlign: "-0.125em",
        flexShrink: 0,
      }}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        strokeOpacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      >
        {reduceMotion ? null : (
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 12 12"
            to="360 12 12"
            dur="0.8s"
            repeatCount="indefinite"
          />
        )}
      </path>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* useFormStatusForIntent                                              */
/* ------------------------------------------------------------------ */

/**
 * useFormStatus plus `isThisIntentPending`: true only while the submission
 * in flight came from the button whose name="intent" value equals `intent`.
 * With no `intent` it is simply `pending`. If the submission has no intent at
 * all (no submitter) it is true for every caller, so something visibly shows
 * progress. Must be called from a component rendered inside the <form>.
 */
export function useFormStatusForIntent(
  intent?: string,
): FormStatus & { isThisIntentPending: boolean } {
  const status = useFormStatus();
  const submitted = status.data?.get("intent");
  const isThisIntentPending =
    status.pending &&
    (intent === undefined || submitted == null || submitted === intent);
  return { ...status, isThisIntentPending };
}

/* ------------------------------------------------------------------ */
/* useSubmittedField                                                   */
/* ------------------------------------------------------------------ */

/**
 * The string value of a field in the submission currently in flight, or null
 * when idle. Useful for "Requesting @name..." messages. File fields return null.
 */
export function useSubmittedField(name: string): string | null {
  const value = useFormStatus().data?.get(name);
  return typeof value === "string" ? value : null;
}

/* ------------------------------------------------------------------ */
/* SubmitButton                                                        */
/* ------------------------------------------------------------------ */

export type SubmitButtonProps = Omit<
  ComponentProps<"button">,
  "type" | "children"
> & {
  /** Content, or a render function receiving the full form status. */
  children: ReactNode | ((status: FormStatus) => ReactNode);
  /** Shown instead of children while THIS button's submission is pending. */
  pendingText?: ReactNode;
  /**
   * Set on every submit button when a form has more than one. Renders
   * name="intent" value={intent}, so the action can read
   * formData.get("intent"), and scopes the pending UI to this button.
   */
  intent?: string;
  /** Show the built-in spinner while pending. Default true. */
  showSpinner?: boolean;
  /** Skip the dev-only "not inside a <form>" check (e.g. deliberate portals). */
  unsafeSkipFormCheck?: boolean;
};

export function SubmitButton({
  children,
  pendingText,
  intent,
  showSpinner = true,
  unsafeSkipFormCheck,
  disabled,
  onClick,
  ref,
  ...rest
}: SubmitButtonProps) {
  const innerRef = useRef<HTMLButtonElement | null>(null);
  const setRef = useCallback(
    (node: HTMLButtonElement | null) => {
      if (node === null) return;
      innerRef.current = node;
      const detach = attachRef(ref, node);
      return () => {
        innerRef.current = null;
        detach();
      };
    },
    [ref],
  );
  useDevFormCheck(innerRef, "SubmitButton", unsafeSkipFormCheck);

  const status = useFormStatusForIntent(intent);
  const { pending, isThisIntentPending } = status;

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (pending) {
      // Blocks a second submission from ANY submit button while one is in
      // flight, without removing focus from the button like `disabled` would.
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  const content = typeof children === "function" ? children(status) : children;

  return (
    <button
      {...rest}
      ref={setRef}
      type="submit"
      name={intent === undefined ? rest.name : "intent"}
      value={intent === undefined ? rest.value : intent}
      disabled={disabled}
      aria-disabled={disabled || pending ? true : undefined}
      aria-busy={isThisIntentPending ? true : undefined}
      data-pending={isThisIntentPending ? "" : undefined}
      onClick={handleClick}
    >
      {isThisIntentPending && showSpinner ? <Spinner /> : null}
      {isThisIntentPending && pendingText !== undefined ? pendingText : content}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* PendingFieldset                                                     */
/* ------------------------------------------------------------------ */

/**
 * A <fieldset> that disables all the fields inside it while the form is
 * submitting. Trade-off: a focused input loses focus when it becomes
 * disabled, so use it where blocking edits matters more than keeping focus.
 * Must be rendered inside the <form>, same rule as SubmitButton.
 */
export function PendingFieldset({
  disabled,
  style,
  unstyled = false,
  unsafeSkipFormCheck,
  ref,
  ...rest
}: ComponentProps<"fieldset"> & {
  /** Skip the inline style reset (border, margin, padding). Use with a strict CSP. */
  unstyled?: boolean;
  /** Skip the dev-only "not inside a <form>" check (e.g. deliberate portals). */
  unsafeSkipFormCheck?: boolean;
}) {
  const innerRef = useRef<HTMLFieldSetElement | null>(null);
  const setRef = useCallback(
    (node: HTMLFieldSetElement | null) => {
      if (node === null) return;
      innerRef.current = node;
      const detach = attachRef(ref, node);
      return () => {
        innerRef.current = null;
        detach();
      };
    },
    [ref],
  );
  useDevFormCheck(innerRef, "PendingFieldset", unsafeSkipFormCheck);

  const { pending } = useFormStatus();
  return (
    <fieldset
      {...rest}
      ref={setRef}
      disabled={disabled || pending}
      style={
        unstyled
          ? style
          : { border: 0, margin: 0, padding: 0, minInlineSize: 0, ...style }
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/* FormStatusText                                                      */
/* ------------------------------------------------------------------ */

export type FormStatusTextProps = {
  pendingText: ReactNode;
  idleText?: ReactNode;
  className?: string;
  /** Skip the dev-only "not inside a <form>" check (e.g. deliberate portals). */
  unsafeSkipFormCheck?: boolean;
  ref?: Ref<HTMLSpanElement>;
};

/**
 * A polite live region that screen readers announce when it changes. Must be
 * rendered inside the <form>, same rule as SubmitButton and PendingFieldset.
 * The region is always mounted (announcements only fire for regions that
 * already exist). The dev-only placement check below only looks at the DOM,
 * so a component rendered through a portal will warn there. If you render
 * it through a portal on purpose, pass unsafeSkipFormCheck.
 */
export function FormStatusText({
  pendingText,
  idleText = null,
  className,
  unsafeSkipFormCheck,
  ref,
}: FormStatusTextProps) {
  const innerRef = useRef<HTMLSpanElement | null>(null);
  const setRef = useCallback(
    (node: HTMLSpanElement | null) => {
      if (node === null) return;
      innerRef.current = node;
      const detach = attachRef(ref, node);
      return () => {
        innerRef.current = null;
        detach();
      };
    },
    [ref],
  );
  useDevFormCheck(innerRef, "FormStatusText", unsafeSkipFormCheck);

  const { pending } = useFormStatus();
  return (
    <span
      ref={setRef}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={className}
    >
      {pending ? pendingText : idleText}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Usage                                                               */
/* ------------------------------------------------------------------ */

/*
Single button, the common case:

  import { SubmitButton } from "./use-form-status-fix";
  import { saveProfile } from "./actions";

  function ProfileForm() {
    return (
      <form action={saveProfile}>
        <input name="name" />
        <SubmitButton pendingText="Saving...">Save</SubmitButton>
      </form>
    );
  }

Two buttons with separate pending states:

  <form action={savePost}>
    <textarea name="body" />
    <SubmitButton intent="draft" pendingText="Saving draft...">Save Draft</SubmitButton>
    <SubmitButton intent="publish" pendingText="Publishing...">Publish</SubmitButton>
  </form>

  // actions.ts
  "use server";
  export async function savePost(formData: FormData) {
    const intent = formData.get("intent"); // "draft" | "publish"
  }

Disable fields while saving, announce it, and echo what was submitted:

  <form action={requestUsername}>
    <PendingFieldset>
      <input name="username" />
    </PendingFieldset>
    <SubmitButton pendingText="Requesting...">Request</SubmitButton>
    <FormStatusText pendingText="Submitting, please keep this tab open." />
  </form>

  function Echo() {                       // must be a child of the <form>
    const username = useSubmittedField("username");
    return username ? <p>Requesting {username}...</p> : null;
  }

Pair with useActionState for results and errors (SubmitButton only handles pending):

  import { useActionState } from "react";

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
  // With useActionState the action receives (previousState, formData).

Style the pending state:

  button[aria-disabled="true"] { opacity: 0.6; cursor: progress; }
  button[data-pending] { cursor: progress; }

A PendingFieldset or FormStatusText rendered outside the <form> now warns the
same way a misplaced SubmitButton does, in development only:

  // Wrong: rendered as a sibling of <form>, not inside it.
  function BrokenLayout() {
    return (
      <>
        <form action={save} id="settings" />
        <FormStatusText pendingText="Saving..." /> // never shows, console warns in dev
      </>
    );
  }

  // Right: rendered inside the <form> it's meant to track.
  function WorkingLayout() {
    return (
      <form action={save}>
        <FormStatusText pendingText="Saving..." />
      </form>
    );
  }

The bug this file prevents:

  // Wrong: the hook is called in the component that renders the <form>.
  function BrokenForm() {
    const { pending } = useFormStatus();     // always false
    return <form action={save}><button disabled={pending}>Save</button></form>;
  }

  // Right: read it from a component rendered inside the form.
  function WorkingForm() {
    return <form action={save}><SubmitButton>Save</SubmitButton></form>;
  }
*/
