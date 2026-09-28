# Changelog

## 1.0.0 - 2026-09-27

Initial release.

- `SubmitButton`, `PendingFieldset`, `FormStatusText`, `useFormStatusForIntent`, `useSubmittedField`, and the `FormStatus` type derived from `useFormStatus`'s own return type.
- All three components share the same dev-only "not inside a `<form>`" placement check and the same `unsafeSkipFormCheck` escape hatch, so a misplaced fieldset or status message fails as loudly, in development, as a misplaced button.
- `intent`-based scoping for forms with more than one submit button, so pending state shows only on the button that was actually pressed.
- Tested in jsdom, Chromium, and Firefox: Enter and Space ignored while pending, a real double click blocked, `aria-disabled` keeps keyboard focus on `SubmitButton` while a plain `disabled` button loses it to the page body, multi-button `intent` scoping picks the right button, Enter-key submission routes through the first submit button in tree order, and the placement warning fires correctly on all three components when misplaced. Reduced motion and strict CSP behavior checked in Chromium.
- Tested against a Next.js production build with a Server Action, and against Vite in dev and build.
