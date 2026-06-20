import { ArrowRight, FolderOpen } from "lucide-react";

import { Button, Card, CardBody, Input } from "./ui";
import { ModeSwitch, type ExperienceMode } from "./common";
import { usePageEntranceMotion } from "./motion";
import type { BootstrapPayload } from "./types";

export function SetupPage({
  bootstrap,
  workspaceInput,
  onWorkspaceInputChange,
  onChooseWorkspace,
  onApplyWorkspace,
  mode,
  onModeChange,
  onFinishSetup,
  onOpenTutorial,
}: {
  bootstrap: BootstrapPayload | null;
  workspaceInput: string;
  onWorkspaceInputChange: (value: string) => void;
  onChooseWorkspace: () => void;
  onApplyWorkspace: () => void;
  mode: ExperienceMode;
  onModeChange: (value: ExperienceMode) => void;
  onFinishSetup: () => void;
  onOpenTutorial: () => void;
}) {
  const workspace = bootstrap?.workspace;
  const pageMotionRef = usePageEntranceMotion();

  return (
    <div ref={pageMotionRef} className="min-h-screen px-5 py-8">
      <div className="mx-auto max-w-[760px] space-y-6">
        <Card className="atelier-hero rounded-[24px] border-none shadow-none" data-motion-item>
          <CardBody className="px-6 py-6 text-white">
            <p className="text-3xl font-semibold tracking-[-0.02em]">Set up the launcher.</p>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
              We only need two things to begin: the normal game folder with <code>bapbap.exe</code> and the mode you want to start with.
            </p>
          </CardBody>
        </Card>

        <Card className="support-card rounded-[24px] border-none shadow-none" data-motion-item>
          <CardBody className="space-y-5 px-6 py-6">
            <div>
              <p className="text-lg font-semibold text-slate-100">1. Choose your mode</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Guided Mode is the best first choice. It keeps the app calmer and hides the deeper controls until you need them.
              </p>
            </div>
            <ModeSwitch value={mode} onChange={onModeChange} />
          </CardBody>
        </Card>

        <Card className="support-card rounded-[24px] border-none shadow-none" data-motion-item>
          <CardBody className="space-y-5 px-6 py-6">
            <div>
              <p className="text-lg font-semibold text-slate-100">2. Confirm your game folder</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Point this at the installed game folder that contains <code>bapbap.exe</code>. The launcher derives <code>UserData/BalanceMod</code> automatically, and the mod can create the runtime folder on first launch.
              </p>
            </div>
            <Input
              label="Game folder"
              labelPlacement="outside"
              value={workspaceInput}
              onValueChange={onWorkspaceInputChange}
              description="Browse to the folder with bapbap.exe or paste that folder path directly."
            />
            <div className="flex flex-wrap gap-3">
              <Button variant="flat" startContent={<FolderOpen className="h-4 w-4" />} onPress={onChooseWorkspace}>
                Browse
              </Button>
              <Button color="secondary" variant="flat" startContent={<ArrowRight className="h-4 w-4" />} onPress={onApplyWorkspace}>
                Use this folder
              </Button>
            </div>
            <p className="break-all text-xs text-slate-500">
              Current folder: {workspace?.workspaceRoot ?? "No game folder connected yet"}
            </p>
          </CardBody>
        </Card>

        <Card className="support-card rounded-[24px] border-none shadow-none" data-motion-item>
          <CardBody className="space-y-4 px-6 py-6">
            <div>
              <p className="text-lg font-semibold text-slate-100">3. Start with one small change</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Once you enter the app, begin with something simple like HP, damage, cooldown, duration, or price.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button color="primary" onPress={onFinishSetup}>
                Continue
              </Button>
              <Button variant="flat" onPress={onOpenTutorial}>
                Open help first
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
