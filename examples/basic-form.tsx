import { SubmitButton } from "../src";

// Server Action, or any async function passed to `action`.
async function saveProfile(formData: FormData) {
  "use server";
  const name = formData.get("name");
  // ... write to your database here
}

export function ProfileForm() {
  return (
    <form action={saveProfile}>
      <input name="name" />
      <SubmitButton pendingText="Saving...">Save</SubmitButton>
    </form>
  );
}

/**
 * This is the shape the file exists to prevent. useFormStatus() is called in
 * the same component that renders the <form>, so it always returns
 * pending: false. Nothing throws, the button just never disables.
 *
 *   function BrokenForm() {
 *     const { pending } = useFormStatus();
 *     return (
 *       <form action={saveProfile}>
 *         <button disabled={pending}>Save</button>
 *       </form>
 *     );
 *   }
 *
 * SubmitButton calls the hook inside itself, a child of the <form>, so the
 * mistake above can't happen when you use it.
 */
