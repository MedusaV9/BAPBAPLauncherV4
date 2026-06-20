import { Button, Card, CardBody, CardHeader } from "./ui";
import { BookOpen, FolderOpen, Save, Settings2, Sparkles } from "lucide-react";
import { useState } from "react";

import { useAttentionPulse, usePageEntranceMotion } from "./motion";
import type { BootstrapPayload } from "./types";
import type { ExperienceMode } from "./common";

type TutorialTargetPage = "dashboard" | "editor" | "custom" | "settings";

export function TutorialPage({
  bootstrap,
  embedded = false,
  onPageChange,
  onOpenFolder,
  onSnapshot,
  onDismissQuickStart,
  onStartInteractiveTour,
}: {
  bootstrap: BootstrapPayload | null;
  embedded?: boolean;
  mode: ExperienceMode;
  onPageChange: (page: TutorialTargetPage) => void;
  onOpenFolder: (path: string) => void;
  onSnapshot: () => void;
  onDismissQuickStart: () => void;
  onStartInteractiveTour: () => void;
  onChangeMode: (value: ExperienceMode) => void;
}) {
  const workspace = bootstrap?.workspace;
  const pageMotionRef = usePageEntranceMotion();
  const primaryActionRef = useAttentionPulse<HTMLDivElement>(true);
  const [activeHelpPanel, setActiveHelpPanel] = useState<"steps" | "utilities">("steps");
  const heroClass = embedded
    ? "soft-panel rounded-[24px] border-none shadow-none"
    : "support-card rounded-[30px] border-none shadow-none";
  const titleClass = embedded ? "mt-2 text-2xl font-semibold text-slate-100" : "mt-2 text-2xl font-semibold text-slate-950";
  const copyClass = embedded ? "mt-2 max-w-2xl text-sm leading-6 text-slate-400" : "mt-2 max-w-2xl text-sm leading-6 text-slate-500";
  const stepCardClass = embedded
    ? "rounded-[22px] border border-white/8 bg-[#12181f] px-5 py-5"
    : "rounded-[26px] bg-white px-5 py-5 shadow-[0_16px_38px_rgba(15,23,42,0.08)]";
  const stepTitleClass = embedded ? "mt-2 text-lg font-semibold text-slate-100" : "mt-2 text-lg font-semibold text-slate-950";
  const stepBodyClass = embedded ? "text-sm leading-6 text-slate-400" : "text-sm leading-6 text-slate-500";
  const tutorialRootTestId = embedded ? "rebalance-tutorial-embedded" : "rebalance-tutorial-standalone";
  const noteCardClass = embedded
    ? "soft-panel rounded-[22px] border-none px-5 py-5 shadow-none"
    : "support-card rounded-[22px] border-none px-5 py-5 shadow-none";
  const helpMetaPanel = (
    <section className={noteCardClass}>
      <div className="space-y-4">
        <div className="task-section-picker task-section-picker--inline">
          <p className="task-section-picker-label">Help surface</p>
          <div className="task-segmented" role="tablist" aria-label="Tutorial panels">
            <button type="button" className={activeHelpPanel === "steps" ? "is-active" : ""} aria-pressed={activeHelpPanel === "steps"} onClick={() => setActiveHelpPanel("steps")}>
              3-step flow
            </button>
            <button type="button" className={activeHelpPanel === "utilities" ? "is-active" : ""} aria-pressed={activeHelpPanel === "utilities"} onClick={() => setActiveHelpPanel("utilities")}>
              Utilities
            </button>
          </div>
        </div>
        <div className="rebalance-utility-note-card">
          <p className="atelier-kicker">Remember</p>
          <div className="rebalance-utility-note-list">
            <p>Start in `Change`, not `Create`, for the first live test.</p>
            <p>Save, restart the game, then validate before the next edit.</p>
            <p>Use snapshots when a change touches more than one gameplay file.</p>
          </div>
        </div>
      </div>
    </section>
  );

  const steps = [
    {
      step: "1",
      title: embedded ? "Check the selected profile" : "Check the game folder",
      body:
        embedded
          ? "Open Settings first and confirm the selected launcher profile, instance source, and derived BalanceMod folders are the ones you want to edit."
          : "Open Settings first and confirm the launcher points at the installed game folder with bapbap.exe. The tool derives UserData/BalanceMod paths from that automatically.",
      actionLabel: "Open Settings",
      action: () => onPageChange("settings"),
      icon: Settings2,
    },
    {
      step: "2",
      title: "Change one existing thing",
      body:
        "Use Change first. Pick one real augment, item, or passive, edit one clear value, and stop there for the first test.",
      actionLabel: "Open Change",
      action: () => onPageChange("editor"),
      icon: Sparkles,
    },
    {
      step: "3",
      title: "Save, restart, and test",
      body:
        "Save the file, restart BAPBAP, and confirm the result in game before you make the next change. Create a snapshot when you want a safe restore point.",
      actionLabel: "Create Snapshot",
      action: onSnapshot,
      icon: Save,
    },
  ];

  return (
    <div ref={pageMotionRef} className="rebalance-utility-shell rebalance-utility-shell--tutorial" data-testid={tutorialRootTestId}>
      <div className="rebalance-utility-stack">
        <Card className={heroClass} data-motion-item data-tour="tutorial-hero">
          <CardHeader className="px-6 py-5">
            <div className="space-y-4">
              <div>
                <p className="atelier-kicker">Start here</p>
                <h3 className={titleClass}>Three safe steps</h3>
                <p className={copyClass}>
                  {embedded
                    ? "The launcher already picked the profile. Check the folder context only when you need it, change one existing thing, then save and test after a restart."
                    : "Confirm the game folder once, change one existing thing, then save and test after a restart. Ignore everything else for the first run."}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <div ref={primaryActionRef}>
                  <Button color="primary" startContent={<BookOpen className="h-4 w-4" />} onPress={onStartInteractiveTour}>
                    Start 3-step tour
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {embedded ? helpMetaPanel : null}

        {activeHelpPanel === "steps" ? (
          <Card className={noteCardClass} data-motion-item>
            <CardHeader className="px-6 py-5">
              <div>
                <p className="atelier-kicker">3-step flow</p>
                <h3 className={sectionTitleClass(embedded)}>Stay inside one safe edit loop</h3>
                <p className={embedded ? "mt-2 text-sm leading-6 text-slate-400" : "mt-2 text-sm leading-6 text-slate-500"}>
                  Open one tool, make one change, then test. This page stays narrow on purpose so the sequence is easy to scan.
                </p>
              </div>
            </CardHeader>
            <CardBody className="px-6 pb-6 pt-0">
              <div className="rebalance-guide-step-list">
                {steps.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.step} className={stepCardClass}>
                      <div className="rebalance-guide-step-row">
                        <div className="task-step-icon-chip flex h-11 w-11 items-center justify-center rounded-2xl text-slate-100">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="rebalance-guide-step-copy">
                          <p className="text-xs uppercase tracking-[0.24em] text-slate-400">Step {item.step}</p>
                          <h4 className={stepTitleClass}>{item.title}</h4>
                          <p className={stepBodyClass}>{item.body}</p>
                        </div>
                        <div className="rebalance-guide-step-action">
                          <Button color="secondary" variant="flat" onPress={item.action}>
                            {item.actionLabel}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        ) : (
          <section className={noteCardClass} data-motion-item>
            <div className="home-secondary-head">
              <div>
                <p className="atelier-kicker">Utilities</p>
                <h3 className={embedded ? "text-lg font-semibold text-slate-100" : "text-lg font-semibold text-slate-950"}>Open support tools only when you need them</h3>
              </div>
              <p className={embedded ? "home-secondary-copy text-slate-400" : "home-secondary-copy text-slate-500"}>
                The help tab stays focused on the safe first run. Raw folder access and profile checks live here.
              </p>
            </div>
            <div className="rebalance-guide-utility-list">
              {workspace?.workspaceRoot ? (
                <div className="rebalance-guide-utility-card">
                  <div>
                    <p className={embedded ? "font-semibold text-slate-100" : "font-semibold text-slate-900"}>Workspace folder</p>
                    <p className={embedded ? "text-sm text-slate-400" : "text-sm text-slate-500"}>Use this only when you need the raw files behind the selected profile.</p>
                  </div>
                  <Button variant="flat" startContent={<FolderOpen className="h-4 w-4" />} onPress={() => onOpenFolder(workspace.workspaceRoot)}>
                    {embedded ? "Open Profile Workspace" : "Open Workspace Folder"}
                  </Button>
                </div>
              ) : null}
              <div className="rebalance-guide-utility-card">
                <div>
                  <p className={embedded ? "font-semibold text-slate-100" : "font-semibold text-slate-900"}>Settings check</p>
                  <p className={embedded ? "text-sm text-slate-400" : "text-sm text-slate-500"}>Confirm the selected profile, launcher source, and derived folders before you edit again.</p>
                </div>
                <Button variant="flat" startContent={<Settings2 className="h-4 w-4" />} onPress={() => onPageChange("settings")}>
                  {embedded ? "Check selected profile" : "Check game folder"}
                </Button>
              </div>
              <div className="rebalance-guide-utility-card">
                <div>
                  <p className={embedded ? "font-semibold text-slate-100" : "font-semibold text-slate-900"}>Dashboard help strip</p>
                  <p className={embedded ? "text-sm text-slate-400" : "text-sm text-slate-500"}>Hide the extra help strip once the first-run flow is clear.</p>
                </div>
                <Button variant="flat" startContent={<BookOpen className="h-4 w-4" />} onPress={onDismissQuickStart}>
                  Hide Dashboard Help Strip
                </Button>
              </div>
            </div>
          </section>
        )}
      </div>

      {!embedded ? (
        <aside className="rebalance-utility-rail" data-motion-item>
          {helpMetaPanel}
        </aside>
      ) : null}
    </div>
  );
}

function sectionTitleClass(embedded: boolean) {
  return embedded ? "text-xl font-semibold text-slate-100" : "text-xl font-semibold text-slate-950";
}
