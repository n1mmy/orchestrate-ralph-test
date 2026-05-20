"use client";

/**
 * `TagInput` — the autocomplete token input for Tag attachment on the
 * Catalog Option form. The Household types into a single field; existing
 * Tags filter in a popover `listbox`, plus a `Create "…"` row appears for
 * any free text that does not already match. Enter, comma, or click on a
 * suggestion adds a Tag token; Backspace on an empty field removes the
 * last token.
 *
 * The component is the only place in v1 where Tags are created or
 * renamed — there is no separate Tags-management screen. A Tag that ends
 * up with no Options simply stops appearing in any suggestion list.
 *
 * Tokens are kept canonical via `normalizeTag` (`raw.trim().toLowerCase()`)
 * so the visible tokens match what the server will write. The same helper
 * runs server-side before any DB write — the two call sites cannot drift
 * past the `tags.lower(name)` unique index.
 *
 * Accessibility: an ARIA combobox per the APG pattern. The text input
 * carries `role="combobox"`, `aria-expanded`, and
 * `aria-autocomplete="list"`; the suggestion popover is a
 * `role="listbox"` of `role="option"` rows.
 */
import { useId, useMemo, useRef, useState } from "react";

import { normalizeTag } from "@/lib/normalize-tag";

type Props = {
  /** Currently attached Tag names (already normalized). */
  value: string[];
  onChange: (next: string[]) => void;
  /** Existing Tag names in the Catalog — fed into the suggestion list. */
  suggestions: string[];
  label?: string;
  id?: string;
};

export function TagInput({
  value,
  onChange,
  suggestions,
  label = "Tags",
  id,
}: Props) {
  const reactId = useId();
  const baseId = id ?? `${reactId}-tag-input`;
  const listboxId = `${baseId}-listbox`;
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const normalizedDraft = normalizeTag(draft);

  const filtered = useMemo(() => {
    const attached = new Set(value);
    return suggestions
      .map((name) => normalizeTag(name))
      .filter((name) => !attached.has(name))
      .filter(
        (name) =>
          normalizedDraft === "" || name.includes(normalizedDraft),
      );
  }, [suggestions, value, normalizedDraft]);

  const hasExactMatch =
    normalizedDraft !== "" && filtered.some((name) => name === normalizedDraft);
  const showCreate = normalizedDraft !== "" && !hasExactMatch;

  const addToken = (raw: string) => {
    const tag = normalizeTag(raw);
    if (tag === "") return;
    if (value.includes(tag)) {
      setDraft("");
      return;
    }
    onChange([...value, tag]);
    setDraft("");
  };

  const removeAt = (index: number) => {
    const next = value.slice();
    next.splice(index, 1);
    onChange(next);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      if (normalizedDraft !== "") {
        event.preventDefault();
        addToken(normalizedDraft);
      }
      return;
    }
    if (event.key === ",") {
      event.preventDefault();
      if (normalizedDraft !== "") addToken(normalizedDraft);
      return;
    }
    if (event.key === "Backspace" && draft === "" && value.length > 0) {
      event.preventDefault();
      removeAt(value.length - 1);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const expanded = open && (filtered.length > 0 || showCreate);

  return (
    <div className="flex flex-col gap-xs">
      <label htmlFor={baseId} className="text-meta text-muted">
        {label}
      </label>
      <div
        className={[
          "flex min-h-[44px] flex-row flex-wrap items-center gap-xs",
          "rounded-input border border-line bg-surface px-md py-sm",
          "focus-within:outline-none focus-within:ring-2 focus-within:ring-ink",
        ].join(" ")}
      >
        {value.map((tag, index) => (
          <span
            key={tag}
            className="flex items-center gap-xs rounded-control border border-line bg-surface px-sm py-xs text-meta text-ink"
          >
            <span>{tag}</span>
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={() => removeAt(index)}
              className="min-h-[24px] min-w-[24px] rounded-control text-meta text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={baseId}
          type="text"
          role="combobox"
          aria-expanded={expanded}
          aria-autocomplete="list"
          aria-controls={listboxId}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Defer so a click on a listbox row registers before close.
            setTimeout(() => setOpen(false), 100);
          }}
          onKeyDown={handleKeyDown}
          className="min-h-[44px] flex-1 bg-transparent text-body text-ink outline-none"
        />
      </div>
      {expanded ? (
        <ul
          id={listboxId}
          role="listbox"
          className="flex flex-col rounded-input border border-line bg-surface"
        >
          {filtered.map((name) => (
            <li
              key={name}
              role="option"
              aria-selected={false}
              tabIndex={-1}
              onMouseDown={(event) => {
                event.preventDefault();
                addToken(name);
                inputRef.current?.focus();
              }}
              className="min-h-[44px] cursor-pointer px-md py-sm text-body text-ink hover:bg-line"
            >
              {name}
            </li>
          ))}
          {showCreate ? (
            <li
              role="option"
              aria-selected={false}
              tabIndex={-1}
              onMouseDown={(event) => {
                event.preventDefault();
                addToken(normalizedDraft);
                inputRef.current?.focus();
              }}
              className="min-h-[44px] cursor-pointer px-md py-sm text-body text-ink hover:bg-line"
            >
              Create &ldquo;{normalizedDraft}&rdquo;
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
