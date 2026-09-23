"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * A submit button that knows its form is on its way to the server: it is
 * disabled and shows `pendingText` until the action finishes, so a slow
 * request on a busy lab network is not answered with a second click.
 */
export function SubmitButton({
  children,
  pendingText,
  className = "btn-primary",
  disabled = false,
  name,
  value,
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
  disabled?: boolean;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled || pending}
      name={name}
      value={value}
      aria-busy={pending || undefined}
    >
      {pending && pendingText ? pendingText : children}
    </button>
  );
}

/**
 * A server-action form that asks first. For destructive actions: the browser's
 * own confirm dialog is plain, but it is keyboard-accessible, cannot be missed,
 * and needs nothing else on the page.
 */
export function ConfirmForm({
  action,
  confirm,
  children,
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  /** The question put to the admin, naming what will be lost. */
  confirm: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
