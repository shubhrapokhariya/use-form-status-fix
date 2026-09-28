import { SubmitButton } from "../src";

// app/actions.ts
async function savePost(formData: FormData) {
  "use server";
  const intent = formData.get("intent"); // "draft" | "publish"
  const body = formData.get("body");

  if (intent === "publish") {
    // publish the post
  } else {
    // save a draft
  }
}

export function PostForm() {
  return (
    <form action={savePost}>
      <textarea name="body" />

      {/*
        Put the safer action first. Pressing Enter in a text field clicks
        the form's default button, and the HTML standard defines that as
        the first submit button in tree order.
      */}
      <SubmitButton intent="draft" pendingText="Saving draft...">
        Save Draft
      </SubmitButton>

      <SubmitButton intent="publish" pendingText="Publishing...">
        Publish
      </SubmitButton>
    </form>
  );
}

/**
 * Without `intent`, useFormStatus's `pending` is shared across the whole
 * form, so both buttons would show a spinner for a single click on either
 * one. Give each button its own `intent` and only the pressed button shows
 * pending. Under the hood this reads formData.get("intent"), which the
 * browser fills in from the submitting button's name/value pair.
 */
