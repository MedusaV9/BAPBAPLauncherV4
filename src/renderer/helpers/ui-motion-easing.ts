export const UI_EASING = {
    enter: "outCubic",
    exit: "inOutQuad",
    hero: "outExpo",
} as const;

export type UiEasingName = (typeof UI_EASING)[keyof typeof UI_EASING];

export function isSupportedUiEasing(value: string): value is UiEasingName {
    return value === UI_EASING.enter || value === UI_EASING.exit || value === UI_EASING.hero;
}
