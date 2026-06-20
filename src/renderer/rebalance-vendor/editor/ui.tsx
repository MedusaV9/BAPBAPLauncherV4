import { forwardRef } from "react";
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

const EMBEDDED_INPUT_STYLE = {
  color: "#eef5fa",
  WebkitTextFillColor: "#eef5fa",
  caretColor: "#ff7a4f",
  background: "transparent",
  textShadow: "none",
} as const;

const EMBEDDED_SWITCH_STYLE = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  width: "60px",
  minWidth: "60px",
  height: "34px",
  padding: "3px",
  borderRadius: "999px",
  border: "1px solid rgba(40, 52, 86, 0.92)",
  background: "linear-gradient(180deg, rgba(23, 32, 58, 0.98), rgba(12, 17, 30, 0.98))",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 10px 18px rgba(0,0,0,0.28)",
  flexShrink: 0,
} as const;

const EMBEDDED_SWITCH_SELECTED_STYLE = {
  border: "1px solid rgba(88, 113, 255, 0.92)",
  background: "linear-gradient(180deg, rgba(88, 113, 255, 1), rgba(48, 72, 168, 1))",
} as const;

const EMBEDDED_SWITCH_THUMB_STYLE = {
  display: "block",
  width: "26px",
  height: "26px",
  borderRadius: "999px",
  background: "linear-gradient(180deg, rgba(255,252,245,0.98), rgba(237,224,203,0.98))",
  boxShadow: "0 2px 10px rgba(0,0,0,0.32)",
  transform: "translateX(0)",
  transition: "transform 140ms ease",
} as const;

const EMBEDDED_SWITCH_THUMB_SELECTED_STYLE = {
  transform: "translateX(26px)",
} as const;

export const Button = forwardRef<HTMLButtonElement, {
  children?: ReactNode;
  className?: string;
  color?: "primary-cta" | "primary-paper" | "primary" | "secondary" | "warning" | "destructive" | "ghost" | "success";
  variant?: "flat";
  startContent?: ReactNode;
  isIconOnly?: boolean;
  isDisabled?: boolean;
  loading?: boolean;
  size?: string;
  onPress?: () => void;
  type?: "button" | "submit" | "reset";
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className" | "color" | "disabled" | "onClick" | "type">>(function Button({
  children,
  className,
  color,
  variant,
  startContent,
  isIconOnly,
  isDisabled,
  loading,
  size,
  onPress,
  type = "button",
  ...rest
}, ref) {
  const effectivelyDisabled = isDisabled || loading;

  // Resolve variant CSS class:
  // - "primary-cta" or "primary-paper" or "primary" → cream/paper fill (all map to same style)
  // - "secondary" → outlined
  // - "ghost" or variant="flat" → ghost/flat
  // - "destructive" or "warning" → destructive (backward compatible)
  // - "success" → legacy success style
  // NOTE: NO orange on buttons — orange (#ff7a4f) is ONLY for input caret
  const variantClass =
    color === "primary-cta" || color === "primary-paper" || color === "primary"
      ? "v2-button--primary"
      : color === "secondary"
        ? "v2-button--secondary"
        : color === "destructive" || color === "warning"
          ? "v2-button--destructive"
          : color === "ghost" || variant === "flat"
              ? "v2-button--ghost"
              : color === "success"
                ? "v2-button--success"
                : "v2-button--secondary";

  return (
    <button
      {...rest}
      ref={ref}
      className={cx(
        "v2-button inline-flex items-center justify-center gap-2 [transition-property:transform,background-color,border-color,color,box-shadow,opacity] duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.96] motion-reduce:transform-none motion-reduce:transition-none",
        variantClass,
        size === "sm" && "v2-button--sm",
        isIconOnly && "v2-button--icon-only",
        !isIconOnly && "v2-button--regular",
        effectivelyDisabled && "v2-button--disabled",
        loading && "v2-button--loading",
        className,
      )}
      disabled={effectivelyDisabled}
      aria-disabled={effectivelyDisabled || undefined}
      aria-busy={loading || undefined}
      onClick={effectivelyDisabled ? undefined : onPress}
      type={type}
    >
      {loading ? <span className="v2-button-spinner" aria-hidden="true" /> : null}
      {startContent}
      {children}
    </button>
  );
});

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={className}>{children}</div>;
}

export function CardHeader({ children, className, ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={className}>{children}</div>;
}

export function CardBody({ children, className, ...rest }: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={className}>{children}</div>;
}

export function Chip({
  children,
  className,
  color,
  size,
  variant,
}: {
  children: ReactNode;
  className?: string;
  color?: "default" | "success" | "warning" | "secondary";
  size?: "sm";
  variant?: "flat";
}) {
  const palette =
    color === "success"
      ? "text-[#dce5ff]"
      : color === "warning"
        ? "text-[#f0d8b8]"
        : color === "secondary"
          ? "text-[#8ea4ff]"
          : "text-slate-500";
  return (
    <span
      className={cx(
        "v2-chip inline-flex items-center font-medium",
        size === "sm" ? "text-xs" : "text-sm",
        "px-0 py-0 tracking-[0.12em] uppercase",
        variant === "flat" || !variant ? palette : palette,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Divider({ className }: { className?: string }) {
  return <div className={cx("h-px w-full bg-white/8", className)} />;
}

const SPINNER_KEYFRAMES = `@keyframes __ui_spin{to{transform:rotate(360deg)}}`;
let spinnerStyleInjected = false;

function ensureSpinnerStyle() {
  if (spinnerStyleInjected) return;
  if (typeof document !== "undefined") {
    const style = document.createElement("style");
    style.textContent = SPINNER_KEYFRAMES;
    document.head.appendChild(style);
    spinnerStyleInjected = true;
  }
}

const SPINNER_SIZES = { sm: 16, md: 24, lg: 32 } as const;

export function Spinner({
  size = "md",
  color = "primary",
}: {
  size?: "sm" | "md" | "lg";
  color?: "primary" | "secondary" | "current" | string;
}) {
  ensureSpinnerStyle();

  const dim = SPINNER_SIZES[size as keyof typeof SPINNER_SIZES] ?? SPINNER_SIZES.md;

  let trackColor: string;
  let fillColor: string;

  if (color === "secondary") {
    trackColor = "rgba(255, 255, 255, 0.12)";
    fillColor = "#ffffff";
  } else if (color === "current") {
    trackColor = "currentColor";
    fillColor = "currentColor";
  } else {
    // primary (default)
    trackColor = "rgba(88, 113, 255, 0.15)";
    fillColor = "#5871ff";
  }

  return (
    <span
      aria-label="Loading"
      role="status"
      style={{
        display: "inline-block",
        width: dim,
        height: dim,
        border: `2px solid ${trackColor}`,
        borderTopColor: fillColor,
        borderRadius: "50%",
        animation: "__ui_spin 0.7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

export function Switch({
  isSelected,
  onValueChange,
  isDisabled,
  "aria-label": ariaLabel,
}: {
  isSelected: boolean;
  onValueChange: (value: boolean) => void;
  isDisabled?: boolean;
  "aria-label"?: string;
}) {
  const handleClick = () => {
    if (isDisabled) return;
    onValueChange(!isSelected);
  };

  return (
    <button
      aria-checked={isSelected}
      aria-disabled={isDisabled || undefined}
      aria-label={ariaLabel}
      className={cx(
        "v2-switch",
        isSelected && "v2-switch--selected",
        isDisabled && "v2-switch--disabled",
      )}
      disabled={isDisabled}
      onClick={handleClick}
      role="switch"
      style={{
        ...EMBEDDED_SWITCH_STYLE,
        ...(isSelected ? EMBEDDED_SWITCH_SELECTED_STYLE : {}),
        ...(isDisabled
          ? { opacity: 0.45, cursor: "not-allowed" as const }
          : {}),
      }}
      type="button"
    >
      <span
        className={cx(
          "v2-switch-thumb",
          isSelected && "v2-switch-thumb--selected",
        )}
        style={{
          ...EMBEDDED_SWITCH_THUMB_STYLE,
          ...(isSelected ? EMBEDDED_SWITCH_THUMB_SELECTED_STYLE : {}),
        }}
      />
    </button>
  );
}

export function Checkbox({
  isSelected,
  onValueChange,
  children,
}: {
  isSelected: boolean;
  onValueChange: (value: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="v2-checkbox">
      <input
        checked={isSelected}
        className="v2-checkbox-input"
        type="checkbox"
        onChange={(event) => onValueChange(event.currentTarget.checked)}
      />
      <span className="v2-checkbox-copy">{children}</span>
    </label>
  );
}

export function Select({
  label,
  value,
  options,
  onValueChange,
  description,
  className,
  isDisabled,
  "aria-label": ariaLabel,
}: {
  label?: string;
  value: string;
  options: Array<{ label: string; value: string; description?: string }>;
  onValueChange: (value: string) => void;
  description?: string;
  className?: string;
  isDisabled?: boolean;
  "aria-label"?: string;
}) {
  const currentOption = options.find((option) => option.value === value);

  return (
    <label className={cx("v2-field v2-field--select block min-w-0", className)}>
      {label ? <span className="v2-field-label">{label}</span> : null}
      <div
        className={cx("v2-select-shell", isDisabled && "v2-select-shell--disabled")}
        data-disabled={isDisabled || undefined}
      >
        <select
          aria-disabled={isDisabled || undefined}
          aria-label={ariaLabel}
          className="v2-select-input"
          disabled={isDisabled}
          style={EMBEDDED_INPUT_STYLE}
          value={value}
          onChange={(event) => onValueChange(event.currentTarget.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {description ? (
        <span className="v2-field-hint">
          {currentOption?.description ?? description}
        </span>
      ) : null}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, {
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
  description?: string;
  errorMessage?: string;
  isInvalid?: boolean;
  startContent?: ReactNode;
  className?: string;
  labelPlacement?: "outside";
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className">>(function Input({
  label,
  value,
  onValueChange,
  description,
  errorMessage,
  isInvalid,
  startContent,
  className,
  labelPlacement,
  type = "text",
  placeholder,
  ...rest
}, ref) {
  return (
    <label className={cx("v2-field v2-field--input block min-w-0", className)}>
      {label ? <span className="v2-field-label">{label}</span> : null}
      <div className={cx("task-control-shell v2-input-shell", isInvalid && "v2-input-shell--invalid")}>
        {startContent}
        <input
          {...rest}
          ref={ref}
          className="v2-input-element"
          placeholder={placeholder}
          style={EMBEDDED_INPUT_STYLE}
          type={type}
          value={value}
          onChange={(event) => onValueChange(event.currentTarget.value)}
        />
      </div>
      {errorMessage ? <span className="v2-field-error">{errorMessage}</span> : null}
      {!errorMessage && description ? <span className="v2-field-hint">{description}</span> : null}
    </label>
  );
});

export function Textarea({
  label,
  value,
  onValueChange,
  description,
  errorMessage,
  isInvalid,
  minRows = 6,
  className,
}: {
  label?: string;
  value: string;
  onValueChange: (value: string) => void;
  description?: string;
  errorMessage?: string;
  isInvalid?: boolean;
  minRows?: number;
  labelPlacement?: "outside";
  className?: string;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange" | "className">) {
  return (
    <label className={cx("v2-field v2-field--textarea block min-w-0", className)}>
      {label ? <span className="v2-field-label">{label}</span> : null}
      <textarea
        className={cx(
          "task-control-shell v2-textarea-shell",
          isInvalid && "v2-textarea-shell--invalid",
        )}
        rows={minRows}
        style={EMBEDDED_INPUT_STYLE}
        value={value}
        onChange={(event) => onValueChange(event.currentTarget.value)}
      />
      {errorMessage ? <span className="v2-field-error">{errorMessage}</span> : null}
      {!errorMessage && description ? <span className="v2-field-hint">{description}</span> : null}
    </label>
  );
}
