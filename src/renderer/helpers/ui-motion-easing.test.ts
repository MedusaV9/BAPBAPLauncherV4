import { describe, expect, it } from "vitest";
import { UI_EASING, isSupportedUiEasing } from "./ui-motion-easing";

describe("ui motion easing", () => {
    it("exposes the allowed ui easings", () => {
        expect(UI_EASING.enter).toBe("outCubic");
        expect(UI_EASING.exit).toBe("inOutQuad");
        expect(UI_EASING.hero).toBe("outExpo");
    });

    it("accepts only supported easing names", () => {
        expect(isSupportedUiEasing("outCubic")).toBe(true);
        expect(isSupportedUiEasing("inOutQuad")).toBe(true);
        expect(isSupportedUiEasing("outExpo")).toBe(true);
        expect(isSupportedUiEasing("linear")).toBe(false);
    });
});
