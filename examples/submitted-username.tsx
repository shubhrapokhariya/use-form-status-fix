"use client";

import { useSubmittedField } from "../src";

// Must be rendered inside the <form>, same rule as any useFormStatus read.
export function SubmittedUsername() {
  const username = useSubmittedField("username");
  return username ? <p>Requesting {username}...</p> : null;
}
