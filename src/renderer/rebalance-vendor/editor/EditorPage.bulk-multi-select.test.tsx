// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EditorPage } from "./EditorPage";

/* ============================================================================
   Phase 3 — additional integration tests for the wiring of the
   BulkActionToolbar and SmartFilterChips into the EditorPage shell.

   These complement EditorPage.component.test.tsx (which covers high-level
   rendering invariants) by asserting the contract that the page mounts the
   bulk-action host element and the smart-filter chip row in the expected
   places, with the expected per-chip identifiers.
   ============================================================================ */

vi.mock("./motion", () => ({
    usePageEntranceMotion: () => React.createRef<HTMLDivElement>(),
    useSelectionChangeMotion: () => React.createRef<HTMLDivElement>(),
    useSidebarCollapseMotion: () => React.createRef<HTMLElement>(),
    useCollapsibleSection: () => React.createRef<HTMLElement>(),
    useTabTransition: () => ({ ref: React.createRef<HTMLElement>() }),
}));

vi.mock("./ui", () => ({
    Button: ({
        children,
        onPress,
        startContent: _startContent,
        ...props
    }: React.PropsWithChildren<{ onPress?: () => void; startContent?: React.ReactNode }> & Record<string, unknown>) => (
        <button type="button" onClick={onPress} {...props}>
            {children}
        </button>
    ),
    Card: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    CardBody: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    CardHeader: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    Input: React.forwardRef<HTMLInputElement, any>(({ value, onValueChange, startContent: _startContent, ...props }, ref) => (
        <input ref={ref} value={value} onChange={(event) => onValueChange?.(event.target.value)} {...props} />
    )),
    Spinner: () => <div>Loading</div>,
}));

vi.mock("./common", () => ({
    CardPreviewPanel: () => <div data-testid="card-preview-panel">Preview card</div>,
    IconPreview: () => <div>Icon</div>,
    MissingIconBadge: () => <div>Missing icon</div>,
    QuickEditControl: ({ item }: { item: { path: string } }) => (
        <div data-testid={`quick-edit-${item.path}`}>
            <span>{item.path}</span>
        </div>
    ),
    SectionCard: ({ title, subtitle, children }: React.PropsWithChildren<{ title: string; subtitle?: string }>) => (
        <section>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
            {children}
        </section>
    ),
    resolveFriendlyName: (...values: Array<string | undefined>) => values.find(Boolean) ?? "",
    stringifyInlineSafe: (value: unknown) => (value == null ? "" : typeof value === "string" ? value : JSON.stringify(value)),
}));

/**
 * Build a minimal but realistic prop payload for the EditorPage. The
 * BulkActionToolbar host and SmartFilterChips mount unconditionally, so the
 * underlying document content is intentionally lightweight here — these
 * tests only care about shell-level wiring.
 */
function renderEditorPageShell() {
    return render(
        <EditorPage
            editorGroups={[{ key: "augments", label: "Augments", count: 1, entries: [] } as never]}
            editorGroup="augments"
            mode="studio"
            onChangeGroup={vi.fn()}
            entries={[
                {
                    id: "entry-firewave",
                    title: "Custom Firewave Plus",
                    subtitle: "augment",
                    absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Passives/0158_P_Firewave.json",
                    relativePath: "Runtime/Passives/0158_P_Firewave.json",
                    targetType: "Passive",
                } as never,
            ]}
            search=""
            onSearchChange={vi.fn()}
            selectedEntry={
                {
                    id: "entry-firewave",
                    title: "Custom Firewave Plus",
                    subtitle: "augment",
                    absolutePath: "C:/Profiles/Standard/UserData/BalanceMod/Runtime/Passives/0158_P_Firewave.json",
                    relativePath: "Runtime/Passives/0158_P_Firewave.json",
                    targetType: "Passive",
                } as never
            }
            selectedState={
                {
                    document: {
                        id: "entry-firewave",
                        displayName: "Custom Firewave Plus",
                        quickEdit: [{ path: "configuration.speed", editable: true, value: 14, defaultValue: 12 }],
                        simpleSettings: {
                            whatThisConfigDoes: "Firewave test document",
                            groups: [],
                        },
                        advanced: { fields: [] },
                        overrides: {},
                        operations: { entries: [] },
                        cardPreview: {
                            title: "Firewave",
                            description: "Burn the map in a line.",
                        },
                    },
                    draftOverrides: {},
                    draftOperations: [],
                    overrideText: "{}",
                    loading: false,
                    saving: false,
                } as never
            }
            onSelectEntry={vi.fn()}
            onUpdateValue={vi.fn()}
            onResetValue={vi.fn()}
            onOverrideTextChange={vi.fn()}
            onSave={vi.fn()}
            onRevert={vi.fn()}
            onReset={vi.fn()}
            onReload={vi.fn()}
            // Keep the sidebar expanded so the SmartFilterChips host is in the DOM.
            collapseSidebarOnSelection={false}
        />
    );
}

describe("EditorPage bulk-multi-select wiring", () => {
    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it("mounts the BulkActionToolbar host element even when zero fields are selected", () => {
        renderEditorPageShell();

        const host = screen.getByTestId("editor-bulk-action-host");
        expect(host).toBeTruthy();
        // With count=0 the inner toolbar self-hides — the host wrapper still
        // exists so the BulkActionToolbar can mount on first selection without
        // restructuring the page tree.
        expect(host.querySelector('[data-testid="rebalance-bulk-action-toolbar"]')).toBeNull();
    });

    it("mounts the SmartFilterChips group inside the editor sidebar", () => {
        renderEditorPageShell();

        const chipsHost = screen.getByTestId("editor-smart-filter-chips");
        expect(chipsHost).toBeTruthy();

        // The inner SmartFilterChips component renders its own toolbar with a
        // dedicated test id — sanity-check that the wiring composes correctly.
        const chipsToolbar = chipsHost.querySelector('[data-testid="rebalance-smart-filter-chips"]');
        expect(chipsToolbar).toBeTruthy();
        expect(chipsToolbar?.getAttribute("role")).toBe("toolbar");
    });

    it("renders all five smart-filter chip ids in the DOM", () => {
        renderEditorPageShell();

        const expectedIds = [
            "smart-filter-modified-only",
            "smart-filter-has-overrides",
            "smart-filter-recently-changed",
            "smart-filter-has-icon",
            "smart-filter-empty-values",
        ] as const;

        for (const testId of expectedIds) {
            const chip = screen.getByTestId(testId);
            expect(chip).toBeTruthy();
            expect(chip.getAttribute("aria-pressed")).toBe("false");
            expect(chip.getAttribute("data-rebalance-pressable")).toBe("true");
        }
    });

    it("places the bulk-action host as a sibling of the editor main content area", () => {
        renderEditorPageShell();

        const layout = screen.getByTestId("rebalance-editor-layout");
        const mainArea = screen.getByTestId("rebalance-editor-main");
        const host = screen.getByTestId("editor-bulk-action-host");

        // Both the main panel and the bulk-action host hang off the layout
        // root so the toolbar overlays the page rather than nesting inside
        // the scrollable main column.
        expect(host.parentElement).toBe(layout);
        expect(mainArea.parentElement).toBe(layout);
        expect(host).not.toBe(mainArea);
    });

    it("toggles aria-pressed on a smart-filter chip when it is clicked", () => {
        renderEditorPageShell();

        const chip = screen.getByTestId("smart-filter-modified-only");
        expect(chip.getAttribute("aria-pressed")).toBe("false");

        fireEvent.click(chip);

        // After clicking the chip, EditorPage's `activeSmartFilters` state
        // flips and SmartFilterChips re-renders the chip with aria-pressed=true.
        const chipAfter = screen.getByTestId("smart-filter-modified-only");
        expect(chipAfter.getAttribute("aria-pressed")).toBe("true");
    });
});
