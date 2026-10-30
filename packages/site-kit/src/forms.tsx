"use client";

import { cn } from "@figbud/ui";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { type KeyboardEvent, useId, useMemo, useRef, useState } from "react";

import { type Country, type CountryCode, type PhoneEntry, SUGGESTED, countries, phoneE164 } from "./phone";
import { useDismiss } from "./use-dismiss";

/**
 * Shared form fields (UI-F1): a searchable country selector, an
 * international phone input and a list of up to N phone numbers. Data and
 * validation live in ./phone.
 */

export interface CountryLabels {
  placeholder: string;
  search: string;
  none: string;
  suggested: string;
  all: string;
}

export const DEFAULT_COUNTRY_LABELS: CountryLabels = {
  placeholder: "Select a country",
  search: "Search countries",
  none: "No countries match",
  suggested: "Suggested",
  all: "All countries",
};

function matches(country: Country, query: string) {
  const q = query.trim().toLowerCase().replace(/^\+/, "");
  if (!q) return true;
  return (
    country.name.toLowerCase().includes(q) || country.code.toLowerCase() === q || country.dial.startsWith(q)
  );
}

/**
 * The searchable list behind both selectors: a button opens a popover with
 * a search box (combobox) and options (listbox); arrows, Enter and Escape
 * work; outside clicks close it.
 */
function CountryPicker({
  id,
  value,
  onChange,
  locale,
  labels,
  compact,
  invalid,
  describedBy,
  label,
  disabled,
}: {
  id: string;
  value: CountryCode | "";
  onChange: (code: CountryCode) => void;
  locale: string;
  labels: CountryLabels;
  /** The phone input's country button: flag and dialling code only. */
  compact?: boolean;
  invalid?: boolean;
  describedBy?: string;
  /** Accessible name for the compact button. */
  label?: string;
  disabled?: boolean;
}) {
  const all = useMemo(() => countries(locale), [locale]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // Placed under the button, as wide as needed but always inside the viewport.
  const [place, setPlace] = useState<{ width: number; left: number }>({ width: 352, left: 0 });
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = `${id}-list`;
  useDismiss(root, open, () => setOpen(false));

  const filtered = all.filter((c) => matches(c, query));
  const suggested = query
    ? []
    : (SUGGESTED.map((code) => all.find((c) => c.code === code)).filter(Boolean) as Country[]);
  const options = [...suggested, ...filtered];
  const selected = all.find((c) => c.code === value);

  const choose = (code: CountryCode) => {
    onChange(code);
    setOpen(false);
    setQuery("");
    button.current?.focus();
  };
  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, Math.min(options.length - 1, i + (event.key === "ArrowDown" ? 1 : -1))));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = options[active];
      if (option) choose(option.code);
    } else if (event.key === "Escape") {
      setOpen(false);
      button.current?.focus();
    }
  };
  const optionId = (i: number) => `${id}-opt-${i}`;

  return (
    <div ref={root} className={cn("relative", !compact && "w-full")}>
      <button
        ref={button}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-label={
          compact
            ? `${label ?? ""}: ${selected ? `${selected.name} +${selected.dial}` : labels.placeholder}`
            : undefined
        }
        onClick={() => {
          const rect = button.current?.getBoundingClientRect();
          if (rect) {
            const width = Math.min(Math.max(rect.width, 288), 352, window.innerWidth - 16);
            setPlace({ width, left: Math.min(0, window.innerWidth - 8 - (rect.left + width)) });
          }
          setOpen((o) => !o);
          setActive(0);
          requestAnimationFrame(() => search.current?.focus());
        }}
        className={cn(
          "flex min-h-12 items-center gap-2 rounded-xl border border-line-strong bg-bg/60 text-start text-text transition-[border-color,box-shadow] outline-none",
          "hover:border-accent/40 focus-visible:border-accent focus-visible:shadow-[0_0_0_3px_var(--accent-soft)] disabled:opacity-60 aria-[invalid=true]:border-danger",
          compact ? "shrink-0 px-3" : "w-full px-4",
        )}
      >
        {selected ? (
          <>
            <span aria-hidden className="fb-flag text-lg leading-none">
              {selected.flag}
            </span>
            {compact ? (
              <span className="text-sm tabular-nums">+{selected.dial}</span>
            ) : (
              <span className="min-w-0 flex-1 truncate">{selected.name}</span>
            )}
          </>
        ) : (
          <span className="min-w-0 flex-1 truncate text-subtle">{labels.placeholder}</span>
        )}
        <ChevronDown aria-hidden className="size-4 shrink-0 text-subtle" />
      </button>
      {open && (
        <div
          style={{ width: place.width, left: place.left }}
          className="absolute top-full z-50 mt-2 overflow-hidden rounded-2xl border border-line bg-bg-elevated shadow-[var(--shadow-elevated)]"
        >
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search aria-hidden className="size-4 text-subtle" />
            <input
              ref={search}
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={options[active] ? optionId(active) : undefined}
              aria-label={labels.search}
              placeholder={labels.search}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKey}
              className="min-h-11 w-full bg-transparent text-sm text-text outline-none placeholder:text-subtle"
            />
          </div>
          <ul
            id={listId}
            role="listbox"
            aria-label={labels.all}
            className="max-h-72 overflow-y-auto overscroll-contain py-1"
          >
            {options.length === 0 && <li className="px-4 py-3 text-sm text-muted">{labels.none}</li>}
            {options.map((c, i) => (
              <li
                key={`${i < suggested.length ? "s" : "a"}-${c.code}`}
                id={optionId(i)}
                role="option"
                aria-selected={c.code === value}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(c.code)}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center gap-3 px-4 text-sm text-text",
                  i === active && "bg-surface-2",
                  i === suggested.length - 1 && suggested.length > 0 && "border-b border-line",
                )}
              >
                <span aria-hidden className="fb-flag text-lg leading-none">
                  {c.flag}
                </span>
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="text-muted tabular-nums">+{c.dial}</span>
                {c.code === value && <Check aria-hidden className="size-4 text-accent" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A searchable country selector (stores the ISO code). */
export function CountrySelect({
  id,
  value,
  onChange,
  locale = "en",
  labels = DEFAULT_COUNTRY_LABELS,
  invalid,
  describedBy,
}: {
  id: string;
  value: CountryCode | "";
  onChange: (code: CountryCode) => void;
  locale?: string;
  labels?: CountryLabels;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <CountryPicker
      id={id}
      value={value}
      onChange={onChange}
      locale={locale}
      labels={labels}
      invalid={invalid}
      describedBy={describedBy}
    />
  );
}

export interface PhoneLabels extends CountryLabels {
  /** The country button's name, e.g. "Phone country". */
  country: string;
  add: string;
  remove: string;
  second: string;
}

export const DEFAULT_PHONE_LABELS: PhoneLabels = {
  ...DEFAULT_COUNTRY_LABELS,
  country: "Phone country",
  add: "Add another number",
  remove: "Remove",
  second: "Second phone number",
};

/** One international phone number: country (flag and code) and the number. */
export function PhoneInput({
  id,
  value,
  onChange,
  onBlur,
  locale = "en",
  labels = DEFAULT_PHONE_LABELS,
  invalid,
  describedBy,
  required,
}: {
  id: string;
  value: PhoneEntry;
  onChange: (value: PhoneEntry) => void;
  onBlur?: () => void;
  locale?: string;
  labels?: PhoneLabels;
  invalid?: boolean;
  describedBy?: string;
  required?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <CountryPicker
        id={`${id}-country`}
        value={value.country}
        onChange={(country) => onChange({ ...value, country })}
        locale={locale}
        labels={labels}
        label={labels.country}
        compact
      />
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={value.number}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        onChange={(e) => onChange({ ...value, number: e.target.value })}
        onBlur={onBlur}
        className="block min-h-12 w-full min-w-0 rounded-xl border border-line-strong bg-bg/60 px-4 text-text tabular-nums transition-[border-color,box-shadow] outline-none placeholder:text-subtle hover:border-accent/40 focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)] aria-[invalid=true]:border-danger"
      />
    </div>
  );
}

/**
 * Up to `max` phone numbers. "Add another number" appears once the first
 * number is valid; a new number starts in the first one's country; clearing
 * the first number removes the others (they can't stand alone).
 */
export function PhoneNumbers({
  id,
  value,
  onChange,
  onBlur,
  max = 2,
  locale = "en",
  labels = DEFAULT_PHONE_LABELS,
  errors = [],
  label,
  optional,
}: {
  id: string;
  value: PhoneEntry[];
  onChange: (value: PhoneEntry[]) => void;
  onBlur?: (index: number) => void;
  max?: number;
  locale?: string;
  labels?: PhoneLabels;
  /** An error message per number (index), or undefined. */
  errors?: (string | undefined)[];
  label: string;
  optional?: string;
}) {
  const uid = useId();
  const [primary, ...rest] = value;
  const update = (index: number, next: PhoneEntry) => {
    // An explicitly cleared first number takes the others with it.
    if (index === 0 && !next.number.trim()) onChange([next]);
    else onChange(value.map((v, i) => (i === index ? next : v)));
  };
  const canAdd = value.length < max && primary !== undefined && phoneE164(primary) !== null;
  return (
    <div className="space-y-3">
      {[primary, ...rest].map((entry, i) =>
        entry ? (
          <div key={i}>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor={`${id}-${i}`} className="text-sm font-medium text-text">
                {i === 0 ? label : labels.second}
              </label>
              {i === 0 && optional && <span className="text-xs font-normal text-subtle">{optional}</span>}
              {i > 0 && (
                <button
                  type="button"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  className="inline-flex min-h-8 items-center gap-1 text-xs text-muted hover:text-danger"
                >
                  <X aria-hidden className="size-3.5" />
                  {labels.remove}
                  <span className="sr-only"> {labels.second}</span>
                </button>
              )}
            </div>
            <div className="mt-2">
              <PhoneInput
                id={`${id}-${i}`}
                value={entry}
                onChange={(next) => update(i, next)}
                onBlur={() => onBlur?.(i)}
                locale={locale}
                labels={labels}
                invalid={Boolean(errors[i])}
                describedBy={errors[i] ? `${uid}-error-${i}` : undefined}
              />
            </div>
            {errors[i] && (
              <p id={`${uid}-error-${i}`} className="mt-2 text-sm text-danger">
                {errors[i]}
              </p>
            )}
          </div>
        ) : null,
      )}
      {canAdd && (
        <button
          type="button"
          onClick={() => onChange([...value, { country: primary!.country, number: "" }])}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-sm font-medium text-accent hover:underline"
        >
          <Plus aria-hidden className="size-4" />
          {labels.add}
        </button>
      )}
    </div>
  );
}
