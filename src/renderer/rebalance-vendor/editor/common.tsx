import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RotateCcw, Search, ChevronDown } from "lucide-react";

import { Button, Input, Select, Switch } from "./ui";
import { resolveBundledInlineIconRun } from "./bundledFallbacks";
import { useOverlayEntranceMotion, useOverlayTransition } from "./motion";
import { VirtualizedList } from "./components/VirtualizedList";
import { ProvenanceTooltip } from "./components/ProvenanceTooltip";
import { ValueHistorySparkline } from "./components/ValueHistorySparkline";
import inspectCardTemplate from "../assets/gamecard/textures/inspect-card-template.png";
import type {
  CardInlineIconRun,
  CardPreview,
  CardPreviewStatLine,
  CardPreviewVariant,
  CardRichTextRun,
  JsonValue,
  QuickEditEntry,
  TextToken,
} from "./types";

export type ExperienceMode = "guided" | "studio";

export interface EffectReferenceOption {
  value: string;
  label: string;
  kind: "PassiveSO" | "StatusEffectSO" | "Effect";
  source?: string;
  description?: string;
}

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function stringifyInlineSafe(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function resolveFriendlyName(...values: Array<string | null | undefined>): string {
  for (const raw of values) {
    const value = raw?.trim();
    if (!value) continue;
    const humanized = humanizeFriendlyCandidate(value);
    if (humanized) {
      return humanized;
    }
    return value;
  }
  return "Unnamed";
}

export function SectionCard({
  title,
  subtitle,
  actions,
  className,
  overrideCount,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  overrideCount?: number;
  children: ReactNode;
}) {
  return (
    <section data-motion-item className={cx("task-section-card support-card rounded-[22px] border-none px-5 py-5 shadow-none", className)}>
      <div className="task-section-head flex flex-wrap items-start justify-between gap-3">
        <div className="task-section-copy space-y-1 flex items-center gap-2">
          <h4 className="task-section-title text-[var(--type-subtitle-size)] text-[var(--text)] font-[var(--type-subtitle-weight)]">{title}</h4>
          {overrideCount != null && overrideCount > 0 ? (
            <span className="v2-badge--highlighted">{overrideCount}</span>
          ) : null}
        </div>
        {actions ? <div className="task-button-row">{actions}</div> : null}
      </div>
      {subtitle ? <p className="task-section-subtitle max-w-3xl text-sm leading-6 text-[var(--text-muted)]">{subtitle}</p> : null}
      <div className="task-section-body mt-4">{children}</div>
    </section>
  );
}

export function FlowCard({
  title,
  body,
  actionLabel,
  onAction,
  icon,
  selected = false,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
  icon?: ReactNode;
  selected?: boolean;
}) {
  return (
    <article
      data-motion-item
      className={cx(
        "flow-card task-flow-card support-card rounded-[22px] border px-5 py-5 shadow-none",
        selected ? "border-[#5871ff]/30 bg-[#121a31]" : "border-[#26333d] bg-[#10161d]",
      )}
    >
      <div className="task-flow-card-copy-wrap space-y-3">
        <div className="task-flow-card-title-row flex items-center gap-2 text-sm font-semibold text-slate-100">
          {icon}
          <span className="task-flow-card-title" title={title}>{title}</span>
        </div>
        <p className="flow-card-copy task-flow-card-copy text-sm leading-6 text-slate-400" title={body}>{body}</p>
      </div>
      <div className="flow-card-actions task-flow-card-actions mt-4">
        <Button color={selected ? "primary" : "secondary"} variant="flat" onPress={onAction}>
          {actionLabel}
        </Button>
      </div>
    </article>
  );
}

export function PathCard({
  label,
  path,
  onOpen,
}: {
  label: string;
  path: string;
  onOpen: () => void;
}) {
  return (
    <div data-motion-item className="task-path-card rounded-[18px] border border-white/8 bg-[#12181f] px-4 py-4">
      <p className="task-path-card-label text-sm font-semibold text-slate-100" title={label}>{label}</p>
      <p className="task-path-card-copy mt-1 break-all text-xs leading-5 text-slate-400" title={path}>{path}</p>
      <div className="mt-3">
        <Button variant="flat" onPress={onOpen}>
          Open
        </Button>
      </div>
    </div>
  );
}

export function ModeSwitch({
  value,
  onChange,
}: {
  value: ExperienceMode;
  onChange: (value: ExperienceMode) => void;
}) {
  return (
    <div data-motion-item className="task-mode-switch grid gap-3 md:grid-cols-2">
      <button
        className={cx(
          "task-mode-switch-button rounded-[18px] border px-4 py-4 text-left transition",
          value === "guided" ? "border-[#5871ff]/28 bg-[#121a31]" : "border-white/8 bg-[#12181f]",
        )}
        aria-pressed={value === "guided"}
        onClick={() => onChange("guided")}
        type="button"
      >
        <p className="task-mode-switch-title font-semibold text-slate-100">Guided</p>
        <p className="task-mode-switch-copy mt-1 text-sm leading-6 text-slate-400">Calmer screens and one clear next step.</p>
      </button>
      <button
        className={cx(
          "task-mode-switch-button rounded-[18px] border px-4 py-4 text-left transition",
          value === "studio" ? "border-[#5871ff]/28 bg-[#121a31]" : "border-white/8 bg-[#12181f]",
        )}
        aria-pressed={value === "studio"}
        onClick={() => onChange("studio")}
        type="button"
      >
        <p className="task-mode-switch-title font-semibold text-slate-100">Studio</p>
        <p className="task-mode-switch-copy mt-1 text-sm leading-6 text-slate-400">Keeps deeper controls visible when you want them.</p>
      </button>
    </div>
  );
}

export function MissingIconBadge({
  className,
  label = "Missing icon",
  subtitle,
}: {
  className?: string;
  label?: string;
  subtitle?: string;
}) {
  return (
    <div
      className={cx(
        "task-record-icon flex items-center justify-center rounded-[14px] border border-dashed border-white/16 bg-[#0f141a] text-center",
        className,
      )}
    >
      <div className="px-2">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.16em] text-slate-200">{label}</p>
        {subtitle ? <p className="mt-1 text-[0.66rem] text-slate-500">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function readFiniteNumber(value: number | null | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function hasCropData({
  cropX,
  cropY,
  cropWidth,
  cropHeight,
  sourceWidth,
  sourceHeight,
}: {
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  sourceWidth?: number;
  sourceHeight?: number;
}): boolean {
  return [cropX, cropY, cropWidth, cropHeight, sourceWidth, sourceHeight].every(
    (value) => typeof value === "number" && Number.isFinite(value),
  );
}

export const IconPreview = memo(function IconPreview({
  previewPath,
  cropX,
  cropY,
  cropWidth,
  cropHeight,
  sourceWidth,
  sourceHeight,
  className,
  size = 48,
  fallback,
}: {
  previewPath?: string | null;
  cropX?: number | null;
  cropY?: number | null;
  cropWidth?: number | null;
  cropHeight?: number | null;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  className?: string;
  size?: number;
  fallback?: ReactNode;
}) {
  const src = previewPath?.trim();
  const [didFail, setDidFail] = useState(false);

  useEffect(() => {
    setDidFail(false);
  }, [src]);

  if (didFail) {
    return fallback ?? <MissingIconBadge className={className} label="Missing" subtitle="Icon" />;
  }

  if (!src) {
    return fallback ?? <MissingIconBadge className={className} label="Missing" subtitle="Icon" />;
  }

  const crop = {
    cropX: readFiniteNumber(cropX ?? undefined),
    cropY: readFiniteNumber(cropY ?? undefined),
    cropWidth: readFiniteNumber(cropWidth ?? undefined),
    cropHeight: readFiniteNumber(cropHeight ?? undefined),
    sourceWidth: readFiniteNumber(sourceWidth ?? undefined),
    sourceHeight: readFiniteNumber(sourceHeight ?? undefined),
  };

  const shouldCrop = hasCropData(crop) && !/^data:image\/svg\+xml/i.test(src);

  if (shouldCrop) {
    const scaleX = size / (crop.cropWidth ?? size);
    const scaleY = size / (crop.cropHeight ?? size);
    return (
      <div className={cx("task-icon-crop-shell", className)} style={{ width: size, height: size }}>
        <img
          alt=""
          className="task-icon-crop-image"
          draggable={false}
          onError={() => setDidFail(true)}
          src={src}
          style={{
            width: (crop.sourceWidth ?? size) * scaleX,
            height: (crop.sourceHeight ?? size) * scaleY,
            transform: `translate(${-1 * (crop.cropX ?? 0) * scaleX}px, ${-1 * (crop.cropY ?? 0) * scaleY}px)`,
          }}
        />
      </div>
    );
  }

  return (
    <img
      alt=""
      className={className}
      draggable={false}
      onError={() => setDidFail(true)}
      src={src}
      style={{ width: size, height: size }}
    />
  );
});

function describeChoice(value: JsonValue): string {
  return stringifyInlineSafe(value);
}

function buildRangeHint(item: QuickEditEntry): string | undefined {
  const range = item.extendedRange ?? item.valueRange ?? item.vanillaRange;
  if (!range) return item.category;
  const parts: string[] = [];
  if (typeof range.minimum === "number") parts.push(`min ${range.minimum}`);
  if (typeof range.maximum === "number") parts.push(`max ${range.maximum}`);
  if (typeof range.step === "number") parts.push(`step ${range.step}`);
  if (range.unit) parts.push(range.unit);
  return parts.join(" | ") || item.category;
}

function resolveStandardDisplay(item: QuickEditEntry): {
  exactValue: string;
  label: "Standard" | "Raw default";
  known: boolean;
} {
  const rawStandard = item.defaultValue;
  const identity = `${item.path ?? ""} ${item.setting ?? ""} ${item.category ?? ""}`.toLowerCase();
  const looksLikeSentinel =
    rawStandard === null ||
    rawStandard === undefined ||
    (typeof rawStandard === "number" &&
      rawStandard === 255 &&
      /(trigger|voice|voiceline|component|index)/i.test(identity));

  if (looksLikeSentinel) {
    return {
      exactValue: "Unknown / raw export fallback",
      label: "Raw default",
      known: false,
    };
  }

  const exactValue = stringifyInlineSafe(rawStandard);
  if (!exactValue || exactValue === "Object") {
    return {
      exactValue: "Structured raw value",
      label: "Raw default",
      known: false,
    };
  }

  return {
    exactValue,
    label: "Standard",
    known: true,
  };
}

/** Memoized effect grid item – rendered in effect reference grids. */
const EffectGridItem = memo(function EffectGridItem({
  value,
  label,
  isActive,
  onSelect,
}: {
  value: string;
  label: string;
  isActive: boolean;
  onSelect: (value: string) => void;
}) {
  const handleClick = useCallback(() => onSelect(value), [value, onSelect]);
  return (
    <button
      type="button"
      className={isActive ? "is-active" : ""}
      onClick={handleClick}
    >
      <span>{label}</span>
      <em>{value}</em>
    </button>
  );
});

interface SearchableAutocompleteProps {
  value: string;
  onValueChange: (value: string) => void;
  referenceChoice: {
    label: string;
    referenceType?: string;
    currentReference?: string;
    availableReferences?: string[];
    suggestions?: string[];
  };
  label?: string;
  description?: string;
  className?: string;
}

export function SearchableAutocomplete({
  value,
  onValueChange,
  referenceChoice,
  label,
  description,
  className,
}: SearchableAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState(value);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => {
    const list: string[] = [];
    if (referenceChoice.currentReference) {
      list.push(referenceChoice.currentReference);
    }
    if (referenceChoice.availableReferences) {
      list.push(...referenceChoice.availableReferences);
    }
    if (referenceChoice.suggestions) {
      list.push(...referenceChoice.suggestions);
    }
    return Array.from(new Set(list.map((s) => s.trim()).filter(Boolean)));
  }, [referenceChoice]);

  const filteredOptions = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return options;
    return options.filter((opt) => {
      const friendly = humanizeFriendlyCandidate(opt) || "";
      return opt.toLowerCase().includes(term) || friendly.toLowerCase().includes(term);
    });
  }, [options, searchTerm]);

  useEffect(() => {
    setSearchTerm(value);
  }, [value]);

  // Reset active index when filtered options change
  useEffect(() => {
    setActiveIndex(-1);
  }, [filteredOptions.length]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm(value);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value]);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return;
    const activeItem = listRef.current.querySelector(`[data-autocomplete-index="${activeIndex}"]`);
    if (activeItem) {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setIsOpen(true);
        return;
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => (filteredOptions.length > 0 ? (prev < filteredOptions.length - 1 ? prev + 1 : 0) : -1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => (filteredOptions.length > 0 ? (prev > 0 ? prev - 1 : filteredOptions.length - 1) : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < filteredOptions.length) {
          const selected = filteredOptions[activeIndex];
          onValueChange(selected);
          setSearchTerm(selected);
          setIsOpen(false);
          setActiveIndex(-1);
        }
        break;
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSearchTerm(value);
        setActiveIndex(-1);
        break;
    }
  };

  const activeDescendant = activeIndex >= 0 ? `autocomplete-opt-${activeIndex}` : undefined;

  return (
    <div ref={containerRef} className={cx("relative w-full", className)}>
      <Input
        label={label}
        value={searchTerm}
        onValueChange={(val) => {
          setSearchTerm(val);
          onValueChange(val);
          if (!isOpen) setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Type or search reference..."
        description={description}
        startContent={<Search className="h-4 w-4 text-[var(--text-muted)] mr-2 shrink-0" />}
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-activedescendant={activeDescendant}
        role="combobox"
      />
      {isOpen && (
        <div ref={listRef} className="absolute left-0 right-0 z-[100] mt-1 max-h-60 overflow-y-auto rounded-lg border border-[#283456] bg-[#0c1222] p-1 shadow-2xl backdrop-blur-md thin-scrollbar" role="listbox">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, index) => {
              const friendly = humanizeFriendlyCandidate(opt) || opt;
              const isSelected = opt === value;
              const isActive = index === activeIndex;
              return (
                <button
                  key={opt}
                  id={`autocomplete-opt-${index}`}
                  data-autocomplete-index={index}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    onValueChange(opt);
                    setSearchTerm(opt);
                    setIsOpen(false);
                    setActiveIndex(-1);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cx(
                    "flex w-full flex-col gap-0.5 rounded px-3 py-2 text-left transition hover:bg-white/5",
                    isSelected && "bg-white/8 text-[var(--accent-cool)]",
                    isActive && "bg-white/10 outline outline-1 outline-[#5871ff]/40"
                  )}
                >
                  <span className="text-xs font-semibold text-slate-100">{friendly}</span>
                  <span className="font-mono text-[10px] text-slate-400 break-all">{opt}</span>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-2 text-xs italic text-[var(--text-muted)]">
              No matching suggestions. Press enter to use custom value.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function QuickEditControl({
  item,
  value,
  onChange,
  onReset,
  effectReferenceOptions = [],
}: {
  item: QuickEditEntry;
  value: JsonValue | undefined;
  onChange: (value: string | boolean) => void;
  onReset: () => void;
  effectReferenceOptions?: EffectReferenceOption[];
}) {
  const [effectPickerOpen, setEffectPickerOpen] = useState(false);
  const [effectPickerSearch, setEffectPickerSearch] = useState("");
  const valueType = (item.valueType ?? "").toLowerCase();
  const currentValue = value ?? item.defaultValue ?? item.value;
  const currentSummary = summarizeQuickValue(currentValue);
  const standardDisplay = resolveStandardDisplay(item);
  const currentExactValue = stringifyInlineSafe(currentValue) || currentSummary;
  const choiceOptions = (item.verifiedChoices ?? []).map((choice) => ({
    label: choice.label,
    value: stringifyInlineSafe(choice.value),
    description: choice.description,
  }));
  const effectChoices = useMemo(
    () => buildEffectReferenceChoices(item, currentValue, effectReferenceOptions),
    [effectReferenceOptions, item, currentValue],
  );
  const effectPreviewChoices = useMemo(() => effectChoices.slice(0, 12), [effectChoices]);
  const filteredEffectChoices = useMemo(
    () => filterEffectReferenceChoices(effectChoices, effectPickerSearch).slice(0, 160),
    [effectChoices, effectPickerSearch],
  );
  const selectedEffectValue = normalizeEffectReference(currentValue);
  const showEffectTray = isPassiveEffectReferenceField(item, currentValue) && effectChoices.length > 0;
  const effectPickerMotionRef = useOverlayTransition(effectPickerOpen);

  useEffect(() => {
    if (!effectPickerMotionRef.mounted) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEffectPickerOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [effectPickerMotionRef.mounted]);

  const isModified = value !== undefined && value !== item.defaultValue;
  const range = item.extendedRange ?? item.valueRange ?? item.vanillaRange;
  const hasRangeLimits = range && (typeof range.minimum === "number" || typeof range.maximum === "number");

  return (
    <div className={cx("task-quick-control min-w-0 bg-[var(--bg-0)] rounded-[var(--control-radius)] border border-[var(--line)] p-[var(--space-md)]", isModified && "border-l-[3px] border-l-[var(--accent-cool)]")}>
      <div className="task-quick-control-head flex items-center justify-between gap-3">
        <p className="task-quick-control-title break-words text-[var(--text-muted)]">{item.setting}</p>
        {valueType ? <span className="v2-badge--muted">{valueType}</span> : null}
        <span className="flex-1" />
        <ProvenanceTooltip
          standardValue={item.value}
          defaultValue={item.defaultValue}
          provenance="quick"
        >
          <span className="task-quick-control-value break-words text-[var(--text)]" title={currentExactValue}>{currentExactValue}</span>
        </ProvenanceTooltip>
        <Button className="task-quick-control-reset" size="sm" variant="flat" onPress={onReset}>
          {standardDisplay.known ? "Reset to standard" : "Reset field"}
        </Button>
      </div>
      <div className="task-quick-control-meta text-[var(--text-muted)]">
        <span>
          <strong>Current</strong>
          <ProvenanceTooltip
            standardValue={item.value}
            defaultValue={item.defaultValue}
            provenance="quick"
          >
            <em title={currentExactValue}>{currentExactValue}</em>
          </ProvenanceTooltip>
        </span>
        <span>
          <strong>{standardDisplay.label}</strong>
          <em title={standardDisplay.exactValue}>{standardDisplay.exactValue}</em>
        </span>
      </div>

      <div className="task-quick-control-value mt-4">
        {valueType === "boolean" ? (
          <div className="task-quick-control-toggle flex items-center justify-between gap-3">
            <div className="task-quick-control-toggle-copy">
              <div className="task-quick-control-toggle-meta">
                <p className="task-quick-control-toggle-label text-[0.95rem] text-slate-300">Enabled</p>
                <span className="task-quick-control-state">{Boolean(currentValue) ? "On" : "Off"}</span>
              </div>
              <p className="task-quick-control-toggle-hint text-[0.78rem] text-slate-500">Toggle this value directly.</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch isSelected={Boolean(currentValue)} onValueChange={onChange} />
              {isModified && (
                <Button
                  isIconOnly
                  variant="flat"
                  onPress={onReset}
                  className="h-9 w-9 flex items-center justify-center rounded-lg border border-white/8 hover:bg-white/5 text-[var(--accent-cool)]"
                  title="Reset to default"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ) : item.referenceChoice ? (
          <div className="flex items-end gap-2">
            <SearchableAutocomplete
              className="flex-1"
              value={describeChoice(currentValue)}
              onValueChange={onChange}
              referenceChoice={item.referenceChoice}
              label={item.referenceChoice.label || "Value"}
              description={buildRangeHint(item)}
            />
            {isModified && (
              <Button
                isIconOnly
                variant="flat"
                onPress={onReset}
                className="mb-5 h-[48px] w-[48px] flex items-center justify-center rounded-lg border border-white/8 hover:bg-white/5 text-[var(--accent-cool)]"
                title="Reset to default"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : choiceOptions.length ? (
          <div className="task-stack">
            <div className="flex items-end gap-2">
              <Select
                className="task-quick-control-field flex-1"
                label={item.allowCustomValue ? "Choose existing" : "Value"}
                value={describeChoice(currentValue)}
                options={choiceOptions}
                onValueChange={onChange}
                description={item.valueRange?.unit ?? undefined}
              />
              {isModified && (
                <Button
                  isIconOnly
                  variant="flat"
                  onPress={onReset}
                  className="mb-5 h-[48px] w-[48px] flex items-center justify-center rounded-lg border border-white/8 hover:bg-white/5 text-[var(--accent-cool)]"
                  title="Reset to default"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </div>
            {item.allowCustomValue ? (
              <div className="flex items-end gap-2 mt-2">
                <Input
                  className="task-quick-control-field flex-1"
                  label="Or type exact value"
                  value={describeChoice(currentValue)}
                  onValueChange={onChange}
                  description="Paste any exact exported reference here when the bundled list is not enough."
                  type="text"
                />
                {isModified && (
                  <Button
                    isIconOnly
                    variant="flat"
                    onPress={onReset}
                    className="mb-5 h-[48px] w-[48px] flex items-center justify-center rounded-lg border border-white/8 hover:bg-white/5 text-[var(--accent-cool)]"
                    title="Reset to default"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        ) : (valueType === "integer" || valueType === "number") && hasRangeLimits ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-end gap-3">
              <div className="flex-1 flex flex-col gap-1 mb-5">
                <span className="v2-field-label">Value</span>
                <input
                  type="range"
                  min={range.minimum ?? 0}
                  max={range.maximum ?? 100}
                  step={range.step ?? (valueType === "integer" ? 1 : 0.1)}
                  value={Number(currentValue) || 0}
                  onChange={(e) => onChange(e.target.value)}
                  className="w-full accent-[var(--accent-cool)] cursor-pointer h-2 rounded-lg bg-white/10 appearance-none outline-none focus:ring-2 focus:ring-[var(--accent-cool)]"
                />
              </div>
              <Input
                className="w-24 shrink-0"
                value={describeChoice(currentValue)}
                onValueChange={onChange}
                type="number"
                step={range.step ?? (valueType === "integer" ? 1 : 0.1)}
              />
              {isModified && (
                <Button
                  isIconOnly
                  variant="flat"
                  onPress={onReset}
                  className="mb-[5px] h-[48px] w-[48px] flex items-center justify-center rounded-lg border border-white/8 hover:bg-white/5 text-[var(--accent-cool)]"
                  title="Reset to default"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="flex justify-between text-xs text-[var(--text-muted)] px-1">
              <span>Min: {range.minimum ?? 0}</span>
              <span>Max: {range.maximum ?? 100}</span>
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <Input
              className="task-quick-control-field flex-1"
              label="Value"
              value={describeChoice(currentValue)}
              onValueChange={onChange}
              type={valueType === "integer" || valueType === "number" ? "number" : "text"}
              description={buildRangeHint(item)}
            />
            {isModified && (
              <Button
                isIconOnly
                variant="flat"
                onPress={onReset}
                className="mb-5 h-[48px] w-[48px] flex items-center justify-center rounded-lg border border-white/8 hover:bg-white/5 text-[var(--accent-cool)]"
                title="Reset to default"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}
        {showEffectTray ? (
          <div className="task-effect-reference-tray">
            <div className="task-effect-reference-head">
              <div>
                <p className="task-section-eyebrow">PassiveSO effect</p>
                <strong>Pick a linked effect without editing the raw reference.</strong>
                <span>
                  Add effect opens every indexed PassiveSO / StatusEffectSO candidate. Single-reference fields replace this slot; true multi-effect lists stay in collection editors.
                </span>
              </div>
              <Button
                variant="flat"
                onPress={() => {
                  setEffectPickerSearch("");
                  setEffectPickerOpen(true);
                }}
              >
                Add effect
              </Button>
            </div>
            <div className="task-effect-reference-grid" role="list" aria-label="Available PassiveSO effects">
              {effectPreviewChoices.map((choice) => (
                <EffectGridItem
                  key={choice.value}
                  value={choice.value}
                  label={choice.label}
                  isActive={choice.value === selectedEffectValue}
                  onSelect={onChange}
                />
              ))}
            </div>
            {effectChoices.length > effectPreviewChoices.length ? (
              <p className="task-effect-reference-count">
                {effectChoices.length - effectPreviewChoices.length} more effects are available in the searchable picker.
              </p>
            ) : null}
            {effectPickerMotionRef.mounted && typeof document !== "undefined" ? createPortal(
              <div className="task-effect-picker-overlay" role="dialog" aria-modal="true" aria-label="Choose SO effect" ref={effectPickerMotionRef.ref}>
                <button
                  type="button"
                  className="task-effect-picker-backdrop"
                  data-motion-backdrop
                  aria-label="Close effect picker"
                  onClick={() => setEffectPickerOpen(false)}
                />
                <div className="task-effect-picker-sheet" data-motion-dialog>
                  <div className="task-effect-picker-head">
                    <div>
                      <p className="task-section-eyebrow">SO effect index</p>
                      <h5>Choose an exported effect</h5>
                      <span>{effectChoices.length} known PassiveSO / StatusEffectSO references are indexed for this field.</span>
                    </div>
                    <Button variant="flat" size="sm" onPress={() => setEffectPickerOpen(false)}>
                      Close
                    </Button>
                  </div>
                  <Input
                    className="task-effect-picker-search"
                    label="Search"
                    placeholder="Search by name, id, source, or type..."
                    value={effectPickerSearch}
                    onValueChange={setEffectPickerSearch}
                  />
                  <div className="task-effect-picker-results thin-scrollbar" role="listbox" aria-label="Known SO effects">
                    {filteredEffectChoices.length > 30 ? (
                      <VirtualizedList
                        items={filteredEffectChoices}
                        itemHeight={58}
                        containerHeight="100%"
                        renderItem={(choice) => (
                          <button
                            key={choice.value}
                            type="button"
                            className={choice.value === selectedEffectValue ? "is-active" : ""}
                            onClick={() => {
                              onChange(choice.value);
                              setEffectPickerOpen(false);
                            }}
                          >
                            <span>
                              <strong>{choice.label}</strong>
                              <em>{choice.value}</em>
                            </span>
                            <small>{[choice.kind, choice.source].filter(Boolean).join(" / ")}</small>
                            {choice.description ? <p>{choice.description}</p> : null}
                          </button>
                        )}
                        emptyState={null}
                      />
                    ) : filteredEffectChoices.length > 0 ? (
                      filteredEffectChoices.map((choice) => (
                        <button
                          key={choice.value}
                          type="button"
                          className={choice.value === selectedEffectValue ? "is-active" : ""}
                          data-motion-result
                          onClick={() => {
                            onChange(choice.value);
                            setEffectPickerOpen(false);
                          }}
                        >
                          <span>
                            <strong>{choice.label}</strong>
                            <em>{choice.value}</em>
                          </span>
                          <small>{[choice.kind, choice.source].filter(Boolean).join(" / ")}</small>
                          {choice.description ? <p>{choice.description}</p> : null}
                        </button>
                      ))
                    ) : (
                      <div className="task-empty-card">
                        <p>No indexed SO effect matches that search.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>,
              document.body,
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function normalizeEffectReference(value: JsonValue | undefined) {
  return stringifyInlineSafe(value).trim();
}

function isPassiveEffectReferenceField(item: QuickEditEntry, currentValue: JsonValue | undefined) {
  const referenceType = `${item.referenceChoice?.referenceType ?? ""}`.toLowerCase();
  const current = normalizeEffectReference(currentValue).toLowerCase();
  const standard = normalizeEffectReference(item.defaultValue ?? item.value).toLowerCase();
  return (
    referenceType.includes("passiveso") ||
    referenceType.includes("statuseffectso") ||
    current.startsWith("passiveso:") ||
    current.startsWith("statuseffectso:") ||
    standard.startsWith("passiveso:") ||
    standard.startsWith("statuseffectso:")
  );
}

function buildEffectReferenceChoices(
  item: QuickEditEntry,
  currentValue: JsonValue | undefined,
  effectReferenceOptions: EffectReferenceOption[],
): EffectReferenceOption[] {
  const choices = new Map<string, EffectReferenceOption>();
  const addChoice = (value: JsonValue | undefined, source?: string, label?: string, description?: string) => {
    const normalized = normalizeEffectReference(value);
    if (!normalized || choices.has(normalized)) {
      return;
    }
    const isEffect = /^passiveso:/i.test(normalized) || /^statuseffectso:/i.test(normalized);
    if (!isEffect) {
      return;
    }
    choices.set(normalized, {
      value: normalized,
      label: resolveFriendlyName(humanizeFriendlyCandidate(normalized), label, normalized),
      kind: normalizeEffectReferenceKind(normalized),
      source,
      description,
    });
  };

  addChoice(currentValue, "Current", "Current effect");
  addChoice(item.defaultValue ?? item.value, "Standard", "Standard effect");
  for (const choice of item.verifiedChoices ?? []) {
    addChoice(choice.value, "Field options", choice.label, choice.description);
  }
  addChoice(item.referenceChoice?.currentReference, "Reference choice", item.referenceChoice?.label);
  for (const reference of item.referenceChoice?.availableReferences ?? []) {
    addChoice(reference, "Exported references");
  }
  for (const reference of item.referenceChoice?.suggestions ?? []) {
    addChoice(reference, "Suggestions");
  }
  for (const option of effectReferenceOptions) {
    addChoice(option.value, option.source, option.label, option.description);
  }

  return Array.from(choices.values()).sort((left, right) =>
    `${left.kind}:${left.label}:${left.value}`.localeCompare(`${right.kind}:${right.label}:${right.value}`, undefined, { sensitivity: "base" }),
  );
}

function normalizeEffectReferenceKind(value: string): EffectReferenceOption["kind"] {
  if (/^passiveso:/i.test(value)) {
    return "PassiveSO";
  }
  if (/^statuseffectso:/i.test(value)) {
    return "StatusEffectSO";
  }
  return "Effect";
}

function filterEffectReferenceChoices(choices: EffectReferenceOption[], search: string): EffectReferenceOption[] {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return choices;
  }

  return choices.filter((choice) =>
    [
      choice.label,
      choice.value,
      choice.kind,
      choice.source,
      choice.description,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

function summarizeQuickValue(value: JsonValue | undefined) {
  if (value === undefined || value === null) {
    return "Unset";
  }
  if (typeof value === "boolean") {
    return value ? "On" : "Off";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? `${value}` : value.toFixed(2).replace(/\.?0+$/, "");
  }
  if (typeof value === "string") {
    const cleaned = value.trim();
    if (!cleaned) {
      return "Empty";
    }
    return cleaned.length > 26 ? `${cleaned.slice(0, 26)}…` : cleaned;
  }
  if (Array.isArray(value)) {
    return `${value.length} entries`;
  }
  return "Object";
}

function sanitizeCardText(value?: string | null): string {
  return (value ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function humanizeFriendlyCandidate(value: string): string | null {
  const cleaned = value.trim();
  if (!cleaned) {
    return null;
  }

  if (!looksLikeTechnicalLabel(cleaned)) {
    return cleaned;
  }

  const normalized = cleaned
    .replace(/^Sprite:/i, "")
    .replace(/^GameObject:/i, "")
    .replace(/^PassiveSO:/i, "")
    .replace(/^StatusEffectSO:/i, "")
    .replace(/^P_/, "")
    .replace(/\bAbility\[(\d+)\]/gi, "Ability $1")
    .replace(/\bAbility\s*\[(\d+)\]/gi, "Ability $1")
    .replace(/\bAbility(\d+)\b/gi, "Ability $1")
    .replace(/\(Ability\)/gi, "")
    .replace(/\(Current\)/gi, "")
    .replace(/#\d+$/i, "")
    .replace(/\btrkey\b/gi, "")
    .replace(/\bdisplayname\b/gi, "")
    .replace(/\bshortdesc(?:ription)?\b/gi, "")
    .replace(/\bdesc(?:ription)?\b/gi, "")
    .replace(/\bname\b/gi, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/\s+/g, " ")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();

  if (!normalized) {
    return cleaned;
  }

  return normalized
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .filter((word, index, words) => index === 0 || word !== words[index - 1])
    .join(" ")
    .replace(/\b\w/g, match => match.toUpperCase());
}

function looksLikeTechnicalLabel(value: string): boolean {
  return (
    /[\[\]()\/:#_-]/.test(value)
    || /(^[A-Z0-9_]+$)/.test(value)
    || /(^P_[A-Za-z0-9_#]+$)/.test(value)
    || /(^Sprite:|^GameObject:|^PassiveSO:|^StatusEffectSO:)/i.test(value)
    || /([a-z])([A-Z])/.test(value)
    || /([A-Za-z])([0-9])/.test(value)
    || /([0-9])([A-Za-z])/.test(value)
    || /\b(?:trkey|_desc|_name|_short)\b/i.test(value)
  );
}

function simplifyCardStatLabel(label: string): string {
  return label
    .replace(/^Level \d+ \/ Tier \d+ \//i, "")
    .replace(/^configuration\./i, "")
    .replace(/\bAbility\[(\d+)\]/gi, "Ability $1")
    .replace(/\bAbility(\d+)\b/gi, "Ability $1")
    .replace(/\(Ability\)/gi, "")
    .replace(/_/g, " ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/([0-9])([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])([0-9])/g, "$1 $2")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

function resolveInlineTokenToneClass(tone?: string): string {
  switch ((tone ?? "").toLowerCase()) {
    case "poison":
      return "is-poison";
    case "damage":
      return "is-damage";
    case "attack":
    case "basicattack":
      return "is-attack";
    case "cooldown":
      return "is-cooldown";
    case "health":
    case "hp":
      return "is-health";
    case "attackspeed":
      return "is-attack-speed";
    case "burn":
      return "is-burn";
    case "duration":
    case "time":
      return "is-duration";
    default:
      return "";
  }
}

const FALLBACK_CARD_INLINE_ICONS: CardInlineIconRun[] = [
  resolveBundledInlineIconRun("damage", "Damage"),
  resolveBundledInlineIconRun("poison", "Poison"),
  resolveBundledInlineIconRun("burn", "Burn"),
  resolveBundledInlineIconRun("basicattack", "Basic Attack"),
  resolveBundledInlineIconRun("cooldown", "Cooldown"),
];

function buildInlineIconMap(preview?: CardPreviewVariant | CardPreview | null): Map<string, CardInlineIconRun> {
  const map = new Map<string, CardInlineIconRun>();
  for (const entry of FALLBACK_CARD_INLINE_ICONS) {
    map.set(entry.key.toLowerCase(), entry);
  }
  for (const entry of preview?.inlineIconRuns ?? []) {
    if (entry.key) {
      map.set(entry.key.toLowerCase(), entry);
    }
  }
  return map;
}

function replaceTokenText(text: string, tokens?: TextToken[] | null): string {
  return text.replace(/%[^%]+%/g, (token) => {
    const entry = tokens?.find((candidate) => candidate.token === token);
    if (!entry) {
      return token;
    }
    return entry.previewText ?? stringifyInlineSafe(entry.previewValue) ?? token;
  });
}

function buildDescriptionRuns(
  variant: CardPreviewVariant | undefined,
  tokens?: TextToken[] | null,
): CardRichTextRun[] {
  if (variant?.richTextRuns?.length) {
    return variant.richTextRuns.map((entry) => ({
      ...entry,
      text: replaceTokenText(entry.text, tokens),
    }));
  }

  const description = sanitizeCardText(replaceTokenText(variant?.description ?? variant?.shortDescription ?? "", tokens));
  return description ? [{ text: description }] : [];
}

function removeDuplicateLeadingShortDescription(
  shortDescription: string,
  runs: CardRichTextRun[],
): CardRichTextRun[] {
  const normalizedShortDescription = sanitizeCardText(shortDescription);
  if (!normalizedShortDescription || !runs.length) {
    return runs;
  }

  const [firstRun, ...rest] = runs;
  if (sanitizeCardText(firstRun.text) === normalizedShortDescription) {
    return rest;
  }

  return runs;
}

function buildStatRows(variant: CardPreviewVariant | undefined): CardPreviewStatLine[] {
  return (variant?.statLines ?? [])
    .map((row) => ({
      ...row,
      label: simplifyCardStatLabel(row.label),
      value: sanitizeCardText(row.value),
    }))
    .filter((row) => row.label || row.value);
}

function findInlineIconByAliases(
  inlineIcons: Map<string, CardInlineIconRun>,
  aliases: string[],
): CardInlineIconRun | undefined {
  for (const alias of aliases) {
    const normalized = alias.toLowerCase();
    const direct = inlineIcons.get(normalized);
    if (direct?.previewPath) {
      return direct;
    }
    for (const [key, icon] of inlineIcons) {
      if (!icon.previewPath) continue;
      if (key.includes(normalized) || normalized.includes(key)) {
        return icon;
      }
    }
  }
  return undefined;
}

function resolveStatLineIcon(
  row: CardPreviewStatLine,
  inlineIcons: Map<string, CardInlineIconRun>,
): CardInlineIconRun | undefined {
  const haystack = `${row.label} ${row.value}`.toLowerCase();
  const aliasGroups = [
    ["damage", "dmg"],
    ["cooldown reduction", "base cooldown", "cooldown", "cdr", "cd"],
    ["attack speed", "atk speed", "attackspeed"],
    ["basic attack", "attack", "melee"],
    ["poison"],
    ["burn"],
    ["health", "hp"],
    ["lifetime", "duration", "time"],
  ];

  for (const aliases of aliasGroups) {
    if (aliases.some((alias) => haystack.includes(alias))) {
      const icon = findInlineIconByAliases(inlineIcons, aliases);
      if (icon) {
        return icon;
      }
    }
  }

  return undefined;
}

function createFallbackVariant(preview: CardPreview, variant: "large" | "compact"): CardPreviewVariant {
  return {
    variant,
    kicker: variant === "large" ? "Existing Argument" : undefined,
    kindLabel: preview.cardKind === "item" ? "Item" : "Argument",
    title: preview.title,
    shortDescription: preview.shortDescription,
    description: preview.description,
    iconReference: preview.iconReference,
    iconPreviewPath: preview.iconPreviewPath,
    iconCropX: preview.iconCropX,
    iconCropY: preview.iconCropY,
    iconCropWidth: preview.iconCropWidth,
    iconCropHeight: preview.iconCropHeight,
    iconSourceWidth: preview.iconSourceWidth,
    iconSourceHeight: preview.iconSourceHeight,
    backgroundPreviewPath: preview.backgroundPreviewPath,
    framePreviewPath: preview.framePreviewPath,
    overlayPreviewPath: preview.overlayPreviewPath,
    titleFontPath: preview.titleFontPath,
    bodyFontPath: preview.bodyFontPath,
    rarityStyle: preview.rarityStyle,
    sourceHint: preview.sourceHint,
    statLines: preview.statLines,
    richTextRuns: preview.richTextRuns,
    inlineIconRuns: preview.inlineIconRuns,
  };
}

function resolveCardVariant(preview: CardPreview, variant: "large" | "compact"): CardPreviewVariant {
  return (variant === "large" ? preview.largeCard : preview.compactCard) ?? createFallbackVariant(preview, variant);
}

function renderInlineRichText(
  runs: CardRichTextRun[],
  inlineIcons: Map<string, CardInlineIconRun>,
  size: "large" | "compact",
): ReactNode {
  return runs.map((run, index) => {
    const toneClass = resolveInlineTokenToneClass(run.tone);
    const inlineIcon = run.inlineIconKey ? inlineIcons.get(run.inlineIconKey.toLowerCase()) : undefined;
    const Tag = run.strong ? "strong" : "span";
    return (
      <Tag
        key={`${run.text}-${index}`}
        className={cx(
          "argument-card-run",
          size === "large" ? "argument-card-run--large" : "argument-card-run--compact",
        )}
      >
        {inlineIcon ? (
          <span className={cx("argument-inline-token", toneClass)}>
            <IconPreview
              previewPath={inlineIcon.previewPath}
              cropX={inlineIcon.cropX}
              cropY={inlineIcon.cropY}
              cropWidth={inlineIcon.cropWidth}
              cropHeight={inlineIcon.cropHeight}
              sourceWidth={inlineIcon.sourceWidth}
              sourceHeight={inlineIcon.sourceHeight}
              className="argument-inline-icon"
              size={16}
              fallback={<span className="argument-inline-icon argument-inline-icon--fallback" />}
            />
            <span className="argument-inline-token-label">{sanitizeCardText(run.text)}</span>
          </span>
        ) : (
          sanitizeCardText(run.text)
        )}
      </Tag>
    );
  });
}

function renderInlineFlowingRichText(
  runs: CardRichTextRun[],
  inlineIcons: Map<string, CardInlineIconRun>,
): ReactNode {
  return runs.map((run, index) => {
    const toneClass = resolveInlineTokenToneClass(run.tone);
    const inlineIcon = run.inlineIconKey ? inlineIcons.get(run.inlineIconKey.toLowerCase()) : undefined;
    const Tag = run.strong ? "strong" : "span";
    return (
      <Tag
        key={`${run.text}-${index}`}
        className={cx("argument-card-flow-run", toneClass, run.strong && "is-strong")}
      >
        {inlineIcon ? (
          <span className={cx("argument-inline-token", toneClass)}>
            <IconPreview
              previewPath={inlineIcon.previewPath}
              cropX={inlineIcon.cropX}
              cropY={inlineIcon.cropY}
              cropWidth={inlineIcon.cropWidth}
              cropHeight={inlineIcon.cropHeight}
              sourceWidth={inlineIcon.sourceWidth}
              sourceHeight={inlineIcon.sourceHeight}
              className="argument-inline-icon"
              size={16}
              fallback={<span className="argument-inline-icon argument-inline-icon--fallback" />}
            />
            <span className="argument-inline-token-label">{sanitizeCardText(run.text)}</span>
          </span>
        ) : (
          sanitizeCardText(run.text)
        )}
      </Tag>
    );
  });
}

function buildMissingCardReason(
  preview: CardPreview | null | undefined,
  variant: CardPreviewVariant | undefined,
  hasBodyCopy: boolean,
  hasStatRows: boolean,
): string | null {
  if (!preview) return "No card preview was exported for this target yet.";

  const hasIcon = Boolean((variant?.iconPreviewPath ?? preview.iconPreviewPath)?.trim());
  const hasSurfaceArt = Boolean(
    (variant?.backgroundPreviewPath ?? preview.backgroundPreviewPath)?.trim()
    || (variant?.framePreviewPath ?? preview.framePreviewPath)?.trim()
    || (variant?.overlayPreviewPath ?? preview.overlayPreviewPath)?.trim(),
  );
  if (hasIcon || hasSurfaceArt) {
    return null;
  }

  if (hasBodyCopy || hasStatRows) {
    return "Using bundled fallback card chrome until runtime preview assets are exported.";
  }

  return "Preview assets are incomplete for this target.";
}

function PreviewSurfaceLayer({
  src,
  className,
}: {
  src?: string | null;
  className: string;
}) {
  const normalizedSrc = sanitizeCardText(src);
  if (!normalizedSrc) {
    return null;
  }

  return (
    <img
      alt=""
      className={className}
      draggable={false}
      onError={(event) => {
        event.currentTarget.style.display = "none";
      }}
      src={normalizedSrc}
    />
  );
}

const LargeArgumentCard = memo(function LargeArgumentCard({
  preview,
  tokens,
  iconSize = 112,
}: {
  preview: CardPreview;
  tokens?: TextToken[] | null;
  iconSize?: number;
}) {
  const variant = resolveCardVariant(preview, "large");
  const rawDescriptionRuns = buildDescriptionRuns(variant, tokens);
  const statRows = buildStatRows(variant);
  const inlineIcons = buildInlineIconMap(variant);
  const title = sanitizeCardText(variant.title) || "Unnamed";
  const shortDescription = sanitizeCardText(variant.shortDescription);
  const descriptionRuns = removeDuplicateLeadingShortDescription(shortDescription, rawDescriptionRuns);
  const bodyRuns = descriptionRuns.length ? descriptionRuns : shortDescription ? [{ text: shortDescription }] : [];
  const hasBodyCopy = bodyRuns.some((run) => Boolean(sanitizeCardText(run.text)));
  const missingReason = buildMissingCardReason(preview, variant, hasBodyCopy, statRows.length > 0);

  return (
    <div className="game-card-shell task-inspect-card">
      <div className="task-inspect-card-surface">
        <div aria-hidden className="task-inspect-card-backdrop" />
        <PreviewSurfaceLayer
          className="task-inspect-card-layer task-inspect-card-layer--background"
          src={variant.backgroundPreviewPath}
        />
        <PreviewSurfaceLayer
          className="task-inspect-card-layer task-inspect-card-layer--frame"
          src={variant.framePreviewPath}
        />
        <PreviewSurfaceLayer
          className="task-inspect-card-layer task-inspect-card-layer--overlay"
          src={variant.overlayPreviewPath}
        />
        <img
          alt=""
          className="task-inspect-card-template"
          draggable={false}
          src={inspectCardTemplate}
        />
        <div className="task-inspect-card-overlay">
          <div className="task-inspect-card-art">
            <div className="task-inspect-card-icon-stage">
              {variant.iconPreviewPath ? (
                <IconPreview
                  previewPath={variant.iconPreviewPath}
                  cropX={variant.iconCropX}
                  cropY={variant.iconCropY}
                  cropWidth={variant.iconCropWidth}
                  cropHeight={variant.iconCropHeight}
                  sourceWidth={variant.iconSourceWidth}
                  sourceHeight={variant.iconSourceHeight}
                  className="task-inspect-card-icon"
                  size={iconSize}
                  fallback={<div className="task-inspect-card-icon task-inspect-card-art-fallback">{title.slice(0, 2)}</div>}
                />
              ) : (
                <div className="task-inspect-card-icon task-inspect-card-art-fallback">{title.slice(0, 2)}</div>
              )}
            </div>
          </div>

          <div className="task-inspect-card-copy">
            <h4 className="task-inspect-card-title">{title}</h4>
            <div className="task-inspect-card-text">
              <div className="task-inspect-card-description task-inspect-card-description--merged">
                <div className="task-inspect-card-body-copy">
                  {renderInlineFlowingRichText(bodyRuns, inlineIcons)}
                </div>
                {statRows.map((row, index) => {
                  const statIcon = resolveStatLineIcon(row, inlineIcons);
                  const rowClass = row.value.trim().startsWith("-")
                    ? "task-inspect-card-line--negative"
                    : "task-inspect-card-line--positive";
                  const rowText = [row.value, row.label].filter(Boolean).join(" ").trim();
                  return (
                    <div
                      key={`${row.label}-${row.value}-${index}`}
                      className={cx("task-inspect-card-line", rowClass, index === 0 && "task-inspect-card-line--first")}
                    >
                      {statIcon ? (
                        <IconPreview
                          previewPath={statIcon.previewPath}
                          cropX={statIcon.cropX}
                          cropY={statIcon.cropY}
                          cropWidth={statIcon.cropWidth}
                          cropHeight={statIcon.cropHeight}
                          sourceWidth={statIcon.sourceWidth}
                          sourceHeight={statIcon.sourceHeight}
                          className="task-inspect-card-line-icon"
                          size={15}
                          fallback={<span className="task-inspect-card-line-icon task-inspect-card-line-icon--fallback" />}
                        />
                      ) : null}
                      <span className="task-inspect-card-line-copy">{rowText}</span>
                    </div>
                  );
                })}
              </div>
              {missingReason ? (
                <div className="task-inspect-card-missing">
                  <strong>{missingReason}</strong>
                  <span>The rest of the preview stays available from bundled launcher assets.</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

const CompactArgumentCard = memo(function CompactArgumentCard({
  preview,
  tokens,
}: {
  preview: CardPreview;
  tokens?: TextToken[] | null;
}) {
  const variant = resolveCardVariant(preview, "compact");
  const rawDescriptionRuns = buildDescriptionRuns(variant, tokens);
  const statRows = buildStatRows(variant);
  const inlineIcons = buildInlineIconMap(variant);
  const title = sanitizeCardText(variant.title) || "Unnamed";
  const shortDescription = sanitizeCardText(variant.shortDescription);
  const descriptionRuns = removeDuplicateLeadingShortDescription(shortDescription, rawDescriptionRuns);

  return (
    <div className="compact-game-card-shell">
      <div className="compact-game-card-copy">
        <h5 className="compact-game-card-title">{title}</h5>
        <div className="compact-game-card-text">
          {shortDescription ? <span className="argument-card-run argument-card-run--compact">{shortDescription}</span> : null}
          {renderInlineRichText(descriptionRuns, inlineIcons, "compact")}
          {statRows.length ? (
            <div className="compact-game-card-stat-list">
              {statRows.map((row, index) => {
                const statIcon = resolveStatLineIcon(row, inlineIcons);
                const rowClass = row.value.trim().startsWith("-") ? "compact-game-card-stat-line--negative" : "compact-game-card-stat-line--positive";
                return (
                  <div key={`${row.label}-${row.value}-${index}`} className={cx("compact-game-card-stat-line", rowClass)}>
                    {statIcon ? (
                      <IconPreview
                        previewPath={statIcon.previewPath}
                        cropX={statIcon.cropX}
                        cropY={statIcon.cropY}
                        cropWidth={statIcon.cropWidth}
                        cropHeight={statIcon.cropHeight}
                        sourceWidth={statIcon.sourceWidth}
                        sourceHeight={statIcon.sourceHeight}
                        className="compact-game-card-stat-line-icon"
                        size={14}
                        fallback={<span className="compact-game-card-stat-line-icon compact-game-card-stat-line-icon--fallback" />}
                      />
                    ) : null}
                    <span className="compact-game-card-stat-line-value">{row.value}</span>
                    {row.label ? <span className="compact-game-card-stat-line-label">{row.label}</span> : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
      <div className="compact-game-card-icon-slot">
        <IconPreview
          previewPath={variant.iconPreviewPath}
          cropX={variant.iconCropX}
          cropY={variant.iconCropY}
          cropWidth={variant.iconCropWidth}
          cropHeight={variant.iconCropHeight}
          sourceWidth={variant.iconSourceWidth}
          sourceHeight={variant.iconSourceHeight}
          className="compact-game-card-icon"
          size={40}
          fallback={<div className="compact-game-card-icon compact-game-card-missing"><strong>?</strong></div>}
        />
      </div>
    </div>
  );
});

export const CardPreviewPanel = memo(function CardPreviewPanel({
  preview,
  tokens,
  title = "Card preview",
  subtitle,
  displayMode = "large",
  chrome = "default",
  showDetails = true,
}: {
  preview?: CardPreview | null;
  tokens?: TextToken[] | null;
  title?: string;
  subtitle?: string;
  displayMode?: "both" | "large" | "compact";
  chrome?: "default" | "minimal" | "game-only";
  showDetails?: boolean;
}) {
  const isMinimal = chrome === "minimal";
  const isGameOnly = chrome === "game-only";
  const previewCard = preview
    ? (displayMode === "compact"
        ? <CompactArgumentCard preview={preview} tokens={tokens} />
        : <LargeArgumentCard preview={preview} tokens={tokens} iconSize={isGameOnly ? 96 : 112} />)
    : null;

  return (
    <section
      className={cx(
        "task-card-preview-panel",
        isGameOnly
          ? "task-card-preview-panel--game-only"
          : isMinimal
            ? "task-card-preview-panel--minimal"
            : "support-card rounded-[22px] border-none px-5 py-5 shadow-none",
      )}
    >
      {!isMinimal && !isGameOnly ? (
        <div className="space-y-1">
          <h4 className="text-lg font-semibold text-slate-100">{title}</h4>
          {subtitle ? <p className="text-sm leading-6 text-slate-400">{subtitle}</p> : null}
        </div>
      ) : null}

      <div className={cx("task-card-preview-body", !isMinimal && !isGameOnly && "mt-5", !isGameOnly && "space-y-5")}>
        {preview ? (
          <>
            {isGameOnly ? previewCard : <div className="task-card-preview-stage">{previewCard}</div>}
            {showDetails && !isGameOnly && displayMode === "both" ? (
              <details className="task-details task-card-detail-preview">
                <summary>Compact card</summary>
                <div className="task-details-body">
                  <CompactArgumentCard preview={preview} tokens={tokens} />
                </div>
              </details>
            ) : null}
            {showDetails && !isGameOnly ? (
              <details className="task-details">
                <summary>Card details</summary>
                <div className="task-details-body">
                  <div className="task-card-detail-grid">
                    <div>
                      <span>Kind</span>
                      <strong>{sanitizeCardText(resolveCardVariant(preview, "large").kindLabel) || "Argument"}</strong>
                    </div>
                    <div>
                      <span>Icon</span>
                      <strong>{preview.iconStatus ?? (preview.iconPreviewPath ? "resolved" : "missing")}</strong>
                    </div>
                    <div>
                      <span>Preview source</span>
                      <strong>{sanitizeCardText(preview.sourceHint) || "Runtime export"}</strong>
                    </div>
                  </div>
                </div>
              </details>
            ) : null}
          </>
        ) : (
          <div className="task-empty-card">
            <p>No preview is available for this target yet.</p>
          </div>
        )}
      </div>
    </section>
  );
});
