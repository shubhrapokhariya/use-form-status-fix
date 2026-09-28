import { FormStatusText, PendingFieldset, SubmitButton } from "../src";
import { SubmittedUsername } from "./submitted-username";

async function requestUsername(formData: FormData) {
  "use server";
  const username = formData.get("username");
  // ... call your API here
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

/**
 * PendingFieldset disables every field inside it while the action runs, so
 * nobody can edit the input mid-submit. Trade-off: a focused input loses
 * focus the moment it becomes disabled, so only reach for this where
 * blocking edits matters more than keeping the cursor in place.
 *
 * FormStatusText is a role="status" live region that stays mounted the
 * whole time. A live region that appears at the same moment its text
 * changes is not reliably announced, so it needs to already exist before
 * the pending state flips.
 */
