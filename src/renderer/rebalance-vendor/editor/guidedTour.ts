import { driver, type Config, type DriveStep, type Driver } from "driver.js";

export type GuidedTourPage = "dashboard" | "editor" | "custom" | "settings" | "tutorial";

function moveToPageAndContinue(
  instance: Driver,
  setPage: (page: GuidedTourPage) => void,
  page: GuidedTourPage,
  nextSelector: string,
) {
  setPage(page);
  const startedAt = Date.now();

  const continueWhenReady = () => {
    if (document.querySelector(nextSelector) || Date.now() - startedAt > 5000) {
      instance.moveNext();
      return;
    }
    window.setTimeout(continueWhenReady, 120);
  };

  window.setTimeout(continueWhenReady, 180);
}

export function createGuidedTour(options: {
  setPage: (page: GuidedTourPage) => void;
  onSeen: () => void;
}): Driver {
  let instance: Driver;

  const steps: DriveStep[] = [
    {
      element: '[data-tour="settings-workspace"]',
      popover: {
        title: "Check the workspace",
        description: "Make sure the launcher points at the right project folder before you save anything.",
        side: "bottom",
        align: "start",
        onNextClick: () => moveToPageAndContinue(instance, options.setPage, "editor", '[data-tour="editor-quick-edit"]'),
      },
    },
    {
      element: '[data-tour="editor-quick-edit"]',
      popover: {
        title: "Change one easy value",
        description: "Pick a simple value like HP, damage, cooldown, duration, range, or price.",
        side: "top",
        align: "start",
        onNextClick: () => moveToPageAndContinue(instance, options.setPage, "editor", '[data-tour="editor-save"]'),
      },
    },
    {
      element: '[data-tour="editor-save"]',
      popover: {
        title: "Save and test",
        description: "Save this one change, test it in game, then come back for the next one.",
        side: "left",
        align: "start",
        onNextClick: () => {
          options.onSeen();
          instance.destroy();
        },
      },
    },
  ];

  const config: Config = {
    steps,
    animate: true,
    allowClose: true,
    allowKeyboardControl: true,
    overlayOpacity: 0.52,
    overlayColor: "#081425",
    stagePadding: 12,
    stageRadius: 18,
    showButtons: ["previous", "next", "close"],
    showProgress: true,
    progressText: "Step {{current}} of {{total}}",
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Finish",
    popoverClass: "rebalance-tour-popover",
  };

  instance = driver(config);
  return instance;
}
