"use client";

import { useId } from "react";

/**
 * The shared form-field primitive used inside `OptionForm`. Every field is a
 * visible `<label>` + `<input>` pair (§18 accessibility rules); the input
 * carries a 44px minimum height for touch targets and a visible focus ring
 * driven by the design tokens.
 */
type Props = {
  label: string;
  name: string;
  defaultValue?: string;
  type?: "text" | "url" | "tel" | "number";
  inputMode?: "text" | "url" | "tel" | "decimal" | "numeric";
  required?: boolean;
  autoFocus?: boolean;
  error?: string;
  multiline?: boolean;
  placeholder?: string;
};

export function TextField({
  label,
  name,
  defaultValue,
  type = "text",
  inputMode,
  required,
  autoFocus,
  error,
  multiline,
  placeholder,
}: Props) {
  const id = useId();
  const errorId = error ? `${id}-error` : undefined;
  const sharedProps = {
    id,
    name,
    defaultValue,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": errorId,
    className:
      "block w-full min-h-[44px] rounded-input border border-line bg-surface px-sm py-xs text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action",
    placeholder,
  } as const;

  return (
    <div className="flex flex-col gap-2xs">
      <label htmlFor={id} className="text-meta font-medium text-ink">
        {label}
      </label>
      {multiline ? (
        <textarea
          {...sharedProps}
          rows={3}
          autoFocus={autoFocus}
        />
      ) : (
        <input
          {...sharedProps}
          type={type}
          inputMode={inputMode}
          required={required}
          autoFocus={autoFocus}
        />
      )}
      {error ? (
        <p id={errorId} className="text-meta text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
