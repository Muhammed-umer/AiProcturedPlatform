"use client";

import { useActionState } from "react";
import { updateTestSettings, type AdminState } from "@/app/actions/admin";
import { Alert, CheckboxRow } from "@/components/ui";
import { MAX_ATTEMPTS_LIMIT } from "@/lib/attempts";

/**
 * How the test is sat: how many times, in what order, and under the camera.
 * A student already writing keeps their open attempt; changes apply from the
 * next attempt started.
 */
export function TestSettings({
  testId,
  maxAttempts,
  shuffleQuestions,
  shuffleOptions,
  cameraRequired,
}: {
  testId: string;
  maxAttempts: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  cameraRequired: boolean;
}) {
  const [state, action, pending] = useActionState<AdminState, FormData>(
    updateTestSettings,
    {},
  );

  return (
    <div className="card p-5">
      <h2 className="font-bold text-[16px] mb-1">Test settings</h2>
      <p className="text-[13.5px] text-ink-2 mb-4">
        Full screen and tab switching are always checked.
      </p>

      <form action={action} className="space-y-3.5">
        {state.error && <Alert tone="error">{state.error}</Alert>}
        {state.success && <Alert tone="success">{state.success}</Alert>}

        <input type="hidden" name="testId" value={testId} />

        <div>
          <label htmlFor="maxAttempts" className="label">
            Attempts allowed per student
          </label>
          <input
            id="maxAttempts"
            name="maxAttempts"
            type="number"
            min={1}
            max={MAX_ATTEMPTS_LIMIT}
            defaultValue={maxAttempts}
            className="input max-w-[120px]"
            required
          />
          <p className="text-[12.5px] text-ink-2 mt-1.5">
            Results count each student&rsquo;s best attempt. With more than one,
            consider turning off &ldquo;Show which answers were right&rdquo; so
            a first attempt does not reveal the key.
          </p>
        </div>

        <CheckboxRow
          name="shuffleQuestions"
          title="Shuffle questions for each student"
          description="Every student gets the questions in a different order. Sections stay in order; questions move only within their section."
          defaultChecked={shuffleQuestions}
        />

        <CheckboxRow
          name="shuffleOptions"
          title="Shuffle options for each student"
          description="The choices under each question appear in a different order for every student."
          defaultChecked={shuffleOptions}
        />

        <CheckboxRow
          name="cameraRequired"
          title="Camera proctoring"
          description="Webcam must stay on, and no face, more than one person or turning away counts as a warning."
          defaultChecked={cameraRequired}
        />

        <button type="submit" className="btn-primary btn-sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
    </div>
  );
}
