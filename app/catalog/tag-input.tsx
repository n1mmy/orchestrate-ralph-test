"use client";

import { useId, useMemo, useRef, useState } from "react";
import { normalizeTag } from "@/lib/normalize-tag";

/**
 * The autocomplete token input the Catalog `OptionForm` uses to attach Tags to
 * an Option. The Household types a Tag — typing filters the existing-Tag
 * suggestions and offers a `Create "…"` row for free text — and confirms with
 * Enter, comma, or a click; Backspace on an empty field removes the last
 * token. There is no separate Tags-management screen: this input is the only
 * place Tags are created or changed.
 *
 * The widget is an ARIA combobox: the text input is `role="combobox"` with
 * `aria-expanded` and `aria-autocomplete="list"`, and the suggestions list is
 * `role="listbox"` with `role="option"` rows.
 *
 * Every Tag passes through the shared `normalizeTag` helper on the way in —
 * the tokens shown are already canonical (trimmed, lowercased), so a user
 * typing "Pasta" and then "pasta" never gets two visible tokens. The server
 * action normalizes again before any DB write; that double normalization is
 * deliberate (a stale client cannot bypass the `tags.lower(name)` unique
 * index).
 */
type Props = {
  /** Currently attached tag names (already normalized). */
  value: string[];
  /** All existing tag names in the Catalog — drives autocomplete. */
  suggestions: string[];
  /** Called whenever the token set changes; always normalized + deduped. */
  onChange: (next: string[]) => void;
  /** The label rendered above the input (§18 — every input has a label). */
  label?: string;
  /** Hidden-field name the form serializes the tag set as. */
  name?: string;
};

export function TagInput({
  value,
  suggestions,
  onChange,
  label = "Tags",
  name = "tags",
}: Props) {
  const inputId = useId();
  const listboxId = useId();
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const normalizedDraft = normalizeTag(draft);

  // Suggestion list: existing tags that match the typed prefix and are not
  // already attached, plus — when the typed text does not exactly match any
  // existing tag — a `Create "…"` row.
  const matches = useMemo(() => {
    if (normalizedDraft === "") {
      return suggestions.filter((s) => !value.includes(s));
    }
    return suggestions.filter(
      (s) => s.includes(normalizedDraft) && !value.includes(s),
    );
  }, [normalizedDraft, suggestions, value]);

  const exactExists =
    normalizedDraft !== "" &&
    (suggestions.includes(normalizedDraft) || value.includes(normalizedDraft));
  const showCreate = normalizedDraft !== "" && !exactExists;

  // Index space: [...matches, (create row if shown)].
  const optionCount = matches.length + (showCreate ? 1 : 0);

  function commit(rawTag: string) {
    const tag = normalizeTag(rawTag);
    if (tag === "") return;
    if (value.includes(tag)) {
      setDraft("");
      return;
    }
    onChange([...value, tag]);
    setDraft("");
    setActiveIndex(0);
  }

  function removeAt(index: number) {
    const next = value.slice();
    next.splice(index, 1);
    onChange(next);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (open && activeIndex < matches.length) {
        commit(matches[activeIndex]);
      } else if (showCreate || normalizedDraft !== "") {
        commit(draft);
      }
      return;
    }
    if (event.key === ",") {
      event.preventDefault();
      if (normalizedDraft !== "") commit(draft);
      return;
    }
    if (event.key === "Backspace" && draft === "" && value.length > 0) {
      event.preventDefault();
      removeAt(value.length - 1);
      return;
    }
    if (event.key === "ArrowDown" && optionCount > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i + 1) % optionCount);
      return;
    }
    if (event.key === "ArrowUp" && optionCount > 0) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (i - 1 + optionCount) % optionCount);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
  }

  const expanded = open && optionCount > 0;
  const activeOptionId =
    expanded && activeIndex < optionCount
      ? `${listboxId}-option-${activeIndex}`
      : undefined;

  return (
    <div className="flex flex-col gap-2xs">
      <label htmlFor={inputId} className="text-meta font-medium text-ink">
        {label}
      </label>
      <div
        className="flex flex-wrap items-center gap-xs rounded-input border border-line bg-surface px-sm py-xs"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag, index) => (
          <span
            key={tag}
            className="inline-flex items-center gap-2xs rounded-badge bg-raised px-xs py-2xs text-meta text-ink"
          >
            <span>{tag}</span>
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              onClick={(event) => {
                event.stopPropagation();
                removeAt(index);
              }}
              className="min-h-[20px] min-w-[20px] text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={expanded}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // A blur fires before a click on a suggestion lands; defer so the
            // click can commit the tag first.
            window.setTimeout(() => setOpen(false), 100);
          }}
          onKeyDown={handleKeyDown}
          className="min-h-[44px] flex-1 bg-transparent text-body text-ink focus-visible:outline-none"
          placeholder={value.length === 0 ? "Add a tag" : ""}
        />
      </div>
      {expanded ? (
        <ul
          id={listboxId}
          role="listbox"
          className="flex flex-col rounded-input border border-line bg-surface"
        >
          {matches.map((match, index) => (
            <li
              key={match}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => {
                // `mousedown` fires before the input's `blur`, so the commit
                // lands before the listbox unmounts.
                event.preventDefault();
                commit(match);
              }}
              className={`cursor-pointer px-sm py-xs text-body ${
                index === activeIndex ? "bg-raised text-ink" : "text-ink"
              }`}
            >
              {match}
            </li>
          ))}
          {showCreate ? (
            <li
              id={`${listboxId}-option-${matches.length}`}
              role="option"
              aria-selected={matches.length === activeIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                commit(draft);
              }}
              className={`cursor-pointer px-sm py-xs text-body ${
                matches.length === activeIndex ? "bg-raised text-ink" : "text-muted"
              }`}
            >
              Create &quot;{normalizedDraft}&quot;
            </li>
          ) : null}
        </ul>
      ) : null}
      {/* The form serializes the tag set as repeated hidden inputs so a plain
          `FormData` parse in the server action sees every tag — no JSON
          encoding step in the middle. */}
      {value.map((tag) => (
        <input key={tag} type="hidden" name={name} value={tag} />
      ))}
    </div>
  );
}
