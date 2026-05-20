/**
 * A single labelled text input. The label is always visible (§18) and the
 * focus ring is the browser-default `focus-visible` outline elevated via the
 * `focus-visible:outline-*` Tailwind utilities.
 */
import type {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
} from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
};

export function TextField({ id, label, hint, className, ...rest }: Props) {
  return (
    <label htmlFor={id} className="flex flex-col gap-xs">
      <span className="text-meta text-muted">{label}</span>
      <input
        id={id}
        {...rest}
        className={[
          "min-h-[44px] rounded-input border border-line bg-surface px-md py-sm",
          "text-body text-ink focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-ink",
          className ?? "",
        ].join(" ")}
      />
      {hint ? <span className="text-meta text-muted">{hint}</span> : null}
    </label>
  );
}

type TextAreaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id" | "rows"
> & {
  id: string;
  label: ReactNode;
  rows?: number;
};

export function TextArea({ id, label, rows = 3, ...rest }: TextAreaProps) {
  return (
    <label htmlFor={id} className="flex flex-col gap-xs">
      <span className="text-meta text-muted">{label}</span>
      <textarea
        id={id}
        rows={rows}
        {...rest}
        className={[
          "min-h-[44px] rounded-input border border-line bg-surface px-md py-sm",
          "text-body text-ink focus-visible:outline-none focus-visible:ring-2",
          "focus-visible:ring-ink",
        ].join(" ")}
      />
    </label>
  );
}
