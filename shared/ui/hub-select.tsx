"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "@/platform/i18n";
import { cn } from "@/shared/ui/utils";
import { filterHubSelectOptionsByQuery, sortHubSelectOptionsByLocalizedName } from "@/shared/ui/hub-select-utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

export interface HubSelectOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  searchText?: string;
  sortLabel?: string;
}

export type HubSelectVariant = "default" | "compact";

export interface HubSelectProps {
  options: readonly HubSelectOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  label?: ReactNode;
  ariaLabel?: string;
  description?: ReactNode;
  error?: ReactNode;
  variant?: HubSelectVariant;
  searchable?: boolean;
  preserveOptionOrder?: boolean;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  testId?: string;
}

export function HubSelect({
  options,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  disabled = false,
  required = false,
  name,
  id,
  label,
  ariaLabel,
  description,
  error,
  variant = "default",
  searchable = true,
  preserveOptionOrder = false,
  className,
  triggerClassName,
  contentClassName,
  testId,
}: HubSelectProps) {
  const generatedId = useId();
  const controlId = id ?? `hub-select-${generatedId}`;
  const labelId = `${controlId}-label`;
  const descriptionId = `${controlId}-description`;
  const errorId = `${controlId}-error`;
  const describedBy = [description ? descriptionId : null, error ? errorId : null]
    .filter(Boolean)
    .join(" ");

  if (searchable) {
    return (
      <SearchableHubSelect
        options={options}
        preserveOptionOrder={preserveOptionOrder}
        value={value}
        defaultValue={defaultValue}
        onValueChange={onValueChange}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        name={name}
        controlId={controlId}
        labelId={labelId}
        descriptionId={descriptionId}
        errorId={errorId}
        describedBy={describedBy}
        label={label}
        ariaLabel={ariaLabel}
        description={description}
        error={error}
        variant={variant}
        className={className}
        triggerClassName={triggerClassName}
        contentClassName={contentClassName}
        testId={testId}
      />
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label ? (
        <label id={labelId} htmlFor={controlId} className="text-sm font-medium text-foreground">
          {label}{required ? <span aria-hidden="true" className="ml-1 text-destructive">*</span> : null}
        </label>
      ) : null}
      <Select
        {...(value !== undefined ? { value } : {})}
        {...(defaultValue !== undefined ? { defaultValue } : {})}
        onValueChange={onValueChange}
        disabled={disabled}
        required={required}
        name={name}
      >
        <SelectTrigger
          id={controlId}
          aria-label={label ? undefined : ariaLabel}
          aria-labelledby={label ? labelId : undefined}
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          data-testid={testId}
          className={cn(
            variant === "compact" && "h-8 w-full rounded-md px-2 py-1 text-xs",
            triggerClassName,
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className={contentClassName}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description ? <p id={descriptionId} className="text-xs text-muted-foreground">{description}</p> : null}
      {error ? <p id={errorId} role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function SearchableHubSelect({
  options,
  preserveOptionOrder,
  value,
  defaultValue,
  onValueChange,
  placeholder,
  disabled,
  required,
  name,
  controlId,
  labelId,
  descriptionId,
  errorId,
  describedBy,
  label,
  ariaLabel,
  description,
  error,
  variant,
  className,
  triggerClassName,
  contentClassName,
  testId,
}: Omit<HubSelectProps, "id" | "searchable"> & {
  preserveOptionOrder: boolean;
  controlId: string;
  labelId: string;
  descriptionId: string;
  errorId: string;
  describedBy: string;
}) {
  const { state, t } = useTranslation();
  const searchId = `${controlId}-search`;
  const listboxId = `${controlId}-listbox`;
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const listboxRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [hasMoreBelow, setHasMoreBelow] = useState(false);
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue ?? "");
  const isControlled = value !== undefined;
  const selectedValue = isControlled ? value : uncontrolledValue;
  const orderedOptions = useMemo(
    () => preserveOptionOrder ? [...options] : sortHubSelectOptionsByLocalizedName(options, state.locale),
    [options, preserveOptionOrder, state.locale],
  );
  const filteredOptions = useMemo(
    () => filterHubSelectOptionsByQuery(orderedOptions, query, state.locale),
    [orderedOptions, query, state.locale],
  );
  const selectedOption = options.find((option) => option.value === selectedValue);
  const selected = Boolean(selectedValue && selectedOption);

  useEffect(() => {
    if (!open) {
      setHasMoreBelow(false);
      return;
    }
    let frameId = 0;
    let observer: ResizeObserver | null = null;
    let cancelled = false;
    let observedListbox: HTMLDivElement | null = null;
    const updateScrollIndicator = (listbox: HTMLDivElement) => {
      const nextHasMoreBelow = listbox.scrollTop + listbox.clientHeight < listbox.scrollHeight - 1;
      setHasMoreBelow((current) => current === nextHasMoreBelow ? current : nextHasMoreBelow);
    };
    const measureScroll = () => {
      if (cancelled) return;
      const listbox = listboxRef.current;
      if (!listbox) {
        frameId = requestAnimationFrame(measureScroll);
        return;
      }
      updateScrollIndicator(listbox);
      if (observedListbox === listbox) return;
      observedListbox = listbox;
      listbox.addEventListener("scroll", measureScroll, { passive: true });
      observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => updateScrollIndicator(listbox));
      observer?.observe(listbox);
      window.addEventListener("resize", measureScroll, { passive: true });
    };
    frameId = requestAnimationFrame(measureScroll);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      observer?.disconnect();
      observedListbox?.removeEventListener("scroll", measureScroll);
      window.removeEventListener("resize", measureScroll);
    };
  }, [filteredOptions, open, query]);

  useEffect(() => {
    if (activeIndex < 0) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const setValue = (nextValue: string) => {
    if (!isControlled) setUncontrolledValue(nextValue);
    onValueChange?.(nextValue);
  };
  const selectOption = (option: HubSelectOption) => {
    if (option.disabled) return;
    setValue(option.value);
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
  };
  const findEnabledOption = (start: number, direction: 1 | -1) => {
    for (let index = start; index >= 0 && index < filteredOptions.length; index += direction) {
      if (!filteredOptions[index].disabled) return index;
    }
    return -1;
  };
  const moveActiveOption = (direction: 1 | -1) => {
    const start = activeIndex < 0
      ? direction === 1 ? 0 : filteredOptions.length - 1
      : activeIndex + direction;
    setActiveIndex(findEnabledOption(start, direction));
  };

  return (
    <div className={cn("relative flex min-w-0 flex-col gap-1.5", className)}>
      {label ? (
        <label id={labelId} htmlFor={controlId} className="text-sm font-medium text-foreground">
          {label}{required ? <span aria-hidden="true" className="ml-1 text-destructive">*</span> : null}
        </label>
      ) : null}
      {name || required ? (
        <input
          type={required ? "text" : "hidden"}
          name={name}
          value={selectedValue ?? ""}
          required={required}
          disabled={disabled}
          tabIndex={required ? -1 : undefined}
          aria-hidden="true"
          data-testid={testId ? `${testId}-required` : undefined}
          className={required ? "sr-only" : undefined}
          onChange={() => undefined}
          onInvalid={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        />
      ) : null}
      <PopoverPrimitive.Root
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          setQuery("");
          setActiveIndex(-1);
        }}
      >
        <div className="relative">
          <PopoverPrimitive.Trigger asChild>
            <button
              ref={triggerRef}
              id={controlId}
              type="button"
              disabled={disabled}
              aria-label={label ? undefined : ariaLabel}
              aria-labelledby={label ? labelId : undefined}
              role="combobox"
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-controls={open ? listboxId : undefined}
              aria-describedby={describedBy || undefined}
              aria-invalid={error ? true : undefined}
              aria-required={required || undefined}
              data-state={open ? "open" : "closed"}
              data-testid={testId}
              className={cn(
                "flex h-12 w-full items-center justify-between rounded-[12px] border border-border bg-card px-4 py-2 pr-10 text-sm font-normal text-foreground outline-none transition-colors hover:border-ring/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/55 aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive/30 disabled:cursor-not-allowed disabled:opacity-50",
                variant === "compact" && "h-8 rounded-md px-2 py-1 pr-8 text-xs",
                triggerClassName,
              )}
            >
              <span className={cn("min-w-0 truncate text-left", !selected && "text-muted-foreground")}>
                {selectedOption?.label ?? placeholder}
              </span>
              <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 opacity-50" />
            </button>
          </PopoverPrimitive.Trigger>
          {selected && Boolean(placeholder) && !required && !disabled ? (
            <button
              type="button"
              aria-label={t("hubSelect.clearSelection")}
              data-testid={testId ? `${testId}-clear` : undefined}
              className="absolute right-8 top-1/2 z-10 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(event) => {
                event.stopPropagation();
                setValue("");
                setQuery("");
                setActiveIndex(-1);
                triggerRef.current?.focus();
              }}
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            align="start"
            sideOffset={4}
            collisionPadding={8}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              inputRef.current?.focus();
            }}
            className={cn(
              "z-50 w-[var(--radix-popover-trigger-width)] min-w-64 max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-lg outline-none",
              contentClassName,
            )}
          >
            <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-background px-2 focus-within:ring-2 focus-within:ring-ring/55">
              <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                id={searchId}
                type="text"
                role="combobox"
                aria-label={t("hubSelect.searchPlaceholder")}
                aria-autocomplete="list"
                aria-expanded="true"
                aria-controls={listboxId}
                aria-activedescendant={activeIndex >= 0 ? `${controlId}-option-${activeIndex}` : undefined}
                aria-describedby={describedBy || undefined}
                autoComplete="off"
                placeholder={t("hubSelect.searchPlaceholder")}
                value={query}
                data-testid={testId ? `${testId}-search` : undefined}
                className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveIndex(-1);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    moveActiveOption(1);
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    moveActiveOption(-1);
                  } else if (event.key === "Home" && filteredOptions.length > 0) {
                    event.preventDefault();
                    setActiveIndex(findEnabledOption(0, 1));
                  } else if (event.key === "End" && filteredOptions.length > 0) {
                    event.preventDefault();
                    setActiveIndex(findEnabledOption(filteredOptions.length - 1, -1));
                  } else if (event.key === "Enter" && activeIndex >= 0) {
                    event.preventDefault();
                    const option = filteredOptions[activeIndex];
                    if (option) selectOption(option);
                  }
                }}
              />
              {query ? (
                <button
                  type="button"
                  aria-label={t("hubSelect.clearSearch")}
                  className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setQuery("");
                    setActiveIndex(-1);
                    inputRef.current?.focus();
                  }}
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <div
              ref={listboxRef}
              id={listboxId}
              role="listbox"
              aria-label={t("hubSelect.optionsLabel")}
              className="hub-select-options-scrollbar mt-2 max-h-56 overflow-y-auto overscroll-contain rounded-md border border-border bg-card p-1"
              style={{ maxHeight: "min(14rem, calc(100dvh - 12rem))" }}
            >
              {filteredOptions.length > 0 ? filteredOptions.map((option, index) => (
                <div
                  key={option.value}
                  ref={(element) => { optionRefs.current[index] = element; }}
                  id={`${controlId}-option-${index}`}
                  role="option"
                  aria-selected={selectedValue === option.value}
                  aria-disabled={option.disabled || undefined}
                  aria-posinset={index + 1}
                  aria-setsize={filteredOptions.length}
                  data-highlighted={activeIndex === index || undefined}
                  className={cn(
                    "flex min-h-8 cursor-default items-center gap-2 rounded-md px-3 py-1.5 text-sm text-foreground outline-none",
                    "data-[highlighted=true]:bg-accent data-[highlighted=true]:text-accent-foreground",
                    "aria-[disabled=true]:pointer-events-none aria-[disabled=true]:opacity-50",
                    selectedValue === option.value && "bg-primary/10",
                  )}
                  onMouseMove={() => { if (!option.disabled) setActiveIndex(index); }}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option)}
                >
                  {option.label}
                  <span className="ml-auto flex h-4 w-4 shrink-0 items-center justify-center">
                    {selectedValue === option.value ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : null}
                  </span>
                </div>
              )) : (
                <div role="status" className="px-3 py-2 text-sm text-muted-foreground">
                  {t("hubSelect.noResults")}
                </div>
              )}
            </div>
            {hasMoreBelow ? (
              <div role="note" className="flex items-center justify-center gap-1 pt-2 text-xs text-muted-foreground">
                <ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
                {t("hubSelect.scrollHint")}
              </div>
            ) : null}
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      {description ? <p id={descriptionId} className="text-xs text-muted-foreground">{description}</p> : null}
      {error ? <p id={errorId} role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
