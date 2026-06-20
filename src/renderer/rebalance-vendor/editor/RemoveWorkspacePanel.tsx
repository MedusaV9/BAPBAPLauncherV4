import { ShieldAlert, Trash2, Undo2 } from "lucide-react";

import { IconPreview, SectionCard, resolveFriendlyName, stringifyInlineSafe } from "./common";
import { Button, Chip } from "./ui";
import type { JsonValue, OperationStatusEntry, RemovalCandidate, RuntimeDocument, TargetOperationEntry } from "./types";

interface QueuedRemovalEntry {
  index: number;
  entry: TargetOperationEntry;
}

export function RemoveWorkspacePanel({
  document,
  draftOperations,
  onQueueOperation,
  onRemoveQueuedOperation,
  onClearQueuedOperations,
  onResetFile,
}: {
  document?: RuntimeDocument;
  draftOperations: TargetOperationEntry[];
  onQueueOperation: (operation: TargetOperationEntry) => void;
  onRemoveQueuedOperation: (index: number) => void;
  onClearQueuedOperations: () => void;
  onResetFile: () => void;
}) {
  if (!document) {
    return null;
  }

  const removalCandidates = document.removalCandidates ?? [];
  const guidedCandidates = removalCandidates.filter((candidate) => !isAdvancedRemoval(candidate));
  const advancedCandidates = removalCandidates.filter((candidate) => isAdvancedRemoval(candidate));
  const queuedRemovals = draftOperations
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.type === "remove" || entry.type === "clear");
  const operationStatusEntries = (document.operationStatus?.entries ?? []).filter(
    (entry) => entry.type === "remove" || entry.type === "clear",
  );

  return (
    <>
      <SectionCard
        title="Remove one thing"
        subtitle="Only concrete remove actions are shown here. Soft removal stays first, and harder actions stay behind an explicit advanced section."
        actions={
          <div className="task-button-row">
            <Button variant="flat" onPress={onResetFile}>
              Reset this file
            </Button>
          </div>
        }
      >
        {guidedCandidates.length ? (
          <div className="task-remove-list">
            {guidedCandidates.map((candidate) => (
              <RemovalCandidateCard
                key={candidate.id}
                candidate={candidate}
                queued={isRemovalQueued(queuedRemovals, candidate)}
                onQueue={() => onQueueOperation(buildRemovalOperation(candidate))}
              />
            ))}
          </div>
        ) : (
          <div className="task-empty-card">
            <p>No guided remove actions were exported for this file yet.</p>
            <p>That usually means this file still needs a more specific runtime export instead of a generic collection fallback.</p>
          </div>
        )}

        {advancedCandidates.length ? (
          <details className="task-details">
            <summary>Advanced remove actions</summary>
            <div className="task-details-body">
              <div className="task-remove-list">
                {advancedCandidates.map((candidate) => (
                  <RemovalCandidateCard
                    key={candidate.id}
                    candidate={candidate}
                    queued={isRemovalQueued(queuedRemovals, candidate)}
                    onQueue={() => onQueueOperation(buildRemovalOperation(candidate))}
                  />
                ))}
              </div>
            </div>
          </details>
        ) : null}
      </SectionCard>

      <SectionCard
        title="Queued removes"
        subtitle="These are the remove actions that will be written into the file the next time you save."
        actions={
          queuedRemovals.length ? (
            <div className="task-button-row">
              <Button variant="flat" onPress={onClearQueuedOperations}>
                Clear queued removes
              </Button>
            </div>
          ) : undefined
        }
      >
        {queuedRemovals.length ? (
          <div className="task-remove-list">
            {queuedRemovals.map(({ entry, index }) => (
              <div key={`${entry.type}:${entry.path}:${index}`} className="task-remove-card task-remove-card--queued">
                <div className="task-remove-card-head">
                  <div className="task-remove-preview">
                    <IconPreview
                      previewPath={entry.previewIconPath}
                      cropX={entry.previewIconCropX}
                      cropY={entry.previewIconCropY}
                      cropWidth={entry.previewIconCropWidth}
                      cropHeight={entry.previewIconCropHeight}
                      sourceWidth={entry.previewIconSourceWidth}
                      sourceHeight={entry.previewIconSourceHeight}
                      className="task-remove-icon"
                      size={52}
                      fallback={
                        <div className="task-remove-icon task-remove-icon--fallback">
                          <ShieldAlert className="h-5 w-5" />
                        </div>
                      }
                    />
                    <div>
                      <p className="task-remove-title" title={entry.label ?? buildQueuedRemovalTitle(entry)}>{entry.label ?? buildQueuedRemovalTitle(entry)}</p>
                      <p className="task-remove-copy">{entry.previewSubtitle ?? entry.path}</p>
                      {entry.previewName ? <p className="task-muted">{entry.previewName}</p> : null}
                    </div>
                  </div>
                  <Button variant="flat" startContent={<Undo2 className="h-4 w-4" />} onPress={() => onRemoveQueuedOperation(index)}>
                    Undo
                  </Button>
                </div>
                <div className="task-remove-meta">
                  <Chip size="sm" variant="flat" color={buildSafetyChipColor(entry.safetyLevel)}>
                    {buildSafetyLabel(entry.safetyLevel)}
                  </Chip>
                  <Chip size="sm" variant="flat" color="secondary">
                    {buildApplyTimingLabel(entry.applyTiming ?? document.applyTiming)}
                  </Chip>
                  {entry.sourceCollectionId ? (
                    <Chip size="sm" variant="flat" color="default">
                      {describeCollection(entry.sourceCollectionId)}
                    </Chip>
                  ) : null}
                  {entry.mode ? (
                    <Chip size="sm" variant="flat" color={entry.mode === "soft" ? "success" : "warning"}>
                      {entry.mode}
                    </Chip>
                  ) : null}
                </div>
                <div className="task-remove-diff">
                  <ValueChangeTile label="Before" value={entry.beforeValue} />
                  <ValueChangeTile label="After" value={entry.afterValue} emptyLabel={entry.type === "remove" ? "Removed" : "Cleared"} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="task-empty-card">
            <p>No remove actions are queued for this file.</p>
          </div>
        )}
      </SectionCard>

      {operationStatusEntries.length ? (
        <SectionCard
          title="Last restart result"
          subtitle="This is what the mod reported the last time BAPBAP loaded this file."
        >
          <div className="task-remove-status-list">
            {operationStatusEntries.map((entry, index) => (
              <div
                key={`${entry.type}:${entry.path}:${index}`}
                className={`task-remove-status-card ${entry.applied ? "is-success" : "is-failed"}`}
              >
                <div className="task-remove-card-head">
                  <div>
                    <p className="task-remove-title" title={entry.label ?? buildQueuedRemovalTitle(entry)}>{entry.label ?? buildQueuedRemovalTitle(entry)}</p>
                    <p className="task-remove-copy">{entry.message ?? entry.path ?? "No extra message was reported."}</p>
                  </div>
                  <Chip size="sm" variant="flat" color={entry.applied ? "success" : "warning"}>
                    {entry.applied ? "Applied" : "Failed"}
                  </Chip>
                </div>
                <div className="task-remove-diff">
                  <ValueChangeTile label="Before" value={entry.beforeValue} />
                  <ValueChangeTile label="After" value={entry.afterValue} emptyLabel={entry.type === "remove" ? "Removed" : "Cleared"} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </>
  );
}

function RemovalCandidateCard({
  candidate,
  queued,
  onQueue,
}: {
  candidate: RemovalCandidate;
  queued: boolean;
  onQueue: () => void;
}) {
  return (
    <article className={`task-remove-card ${queued ? "is-queued" : ""}`}>
      <div className="task-remove-card-head">
        <div className="task-remove-preview">
          <IconPreview
            previewPath={candidate.previewIconPath}
            cropX={candidate.previewIconCropX}
            cropY={candidate.previewIconCropY}
            cropWidth={candidate.previewIconCropWidth}
            cropHeight={candidate.previewIconCropHeight}
            sourceWidth={candidate.previewIconSourceWidth}
            sourceHeight={candidate.previewIconSourceHeight}
            className="task-remove-icon"
            size={52}
            fallback={
              <div className="task-remove-icon task-remove-icon--fallback">
                <ShieldAlert className="h-5 w-5" />
              </div>
            }
          />
          <div>
            <p className="task-remove-title" title={candidate.label}>{candidate.label}</p>
            <p className="task-remove-copy">
              {candidate.description ?? candidate.previewSubtitle ?? candidate.path}
            </p>
          </div>
        </div>
        <Button
          color="warning"
          variant="flat"
          startContent={<Trash2 className="h-4 w-4" />}
          isDisabled={queued}
          onPress={onQueue}
        >
          {queued ? "Queued" : "Queue remove"}
        </Button>
      </div>

      <div className="task-remove-meta">
        <Chip size="sm" variant="flat" color={buildSafetyChipColor(candidate.safetyLevel)}>
          {buildSafetyLabel(candidate.safetyLevel)}
        </Chip>
        <Chip size="sm" variant="flat" color="secondary">
          {buildApplyTimingLabel(candidate.applyTiming)}
        </Chip>
        {candidate.sourceCollectionId ? (
          <Chip size="sm" variant="flat" color="default">
            {describeCollection(candidate.sourceCollectionId)}
          </Chip>
        ) : null}
        {candidate.mode ? (
          <Chip size="sm" variant="flat" color={candidate.mode === "soft" ? "success" : "warning"}>
            {candidate.mode}
          </Chip>
        ) : null}
      </div>

      <div className="task-remove-diff">
        <ValueChangeTile label="Before" value={candidate.beforeValue} />
        <ValueChangeTile
          label="After"
          value={candidate.afterValue}
          emptyLabel={candidate.operationType === "remove" ? "Removed" : "Cleared"}
        />
      </div>
    </article>
  );
}

function ValueChangeTile({
  label,
  value,
  emptyLabel = "Empty",
}: {
  label: string;
  value: JsonValue | undefined;
  emptyLabel?: string;
}) {
  const displayValue = value === null || value === undefined ? emptyLabel : stringifyInlineSafe(value);
  return (
    <div className="task-remove-diff-tile">
      <span>{label}</span>
      <strong>{displayValue}</strong>
    </div>
  );
}

function buildRemovalOperation(candidate: RemovalCandidate): TargetOperationEntry {
  return {
    type: candidate.operationType,
    path: candidate.path,
    mode: candidate.mode,
    label: candidate.label,
    applyTiming: candidate.applyTiming,
    safetyLevel: candidate.safetyLevel,
    sourcePath: candidate.sourceCollectionId,
    sourceCollectionId: candidate.sourceCollectionId,
    previewName: candidate.previewName,
    previewSubtitle: candidate.previewSubtitle,
    previewIconPath: candidate.previewIconPath,
    previewIconCropX: candidate.previewIconCropX,
    previewIconCropY: candidate.previewIconCropY,
    previewIconCropWidth: candidate.previewIconCropWidth,
    previewIconCropHeight: candidate.previewIconCropHeight,
    previewIconSourceWidth: candidate.previewIconSourceWidth,
    previewIconSourceHeight: candidate.previewIconSourceHeight,
    beforeValue: candidate.beforeValue,
    afterValue: candidate.afterValue,
  };
}

function isRemovalQueued(queuedRemovals: QueuedRemovalEntry[], candidate: RemovalCandidate): boolean {
  return queuedRemovals.some(({ entry }) =>
    entry.type === candidate.operationType &&
    entry.path === candidate.path &&
    (entry.mode ?? "") === (candidate.mode ?? ""));
}

function buildQueuedRemovalTitle(entry: Pick<TargetOperationEntry, "type" | "path" | "label"> | OperationStatusEntry): string {
  if (entry.label) {
    return entry.label;
  }

  if (entry.type === "clear") {
    return `Clear ${resolveFriendlyName(entry.path)}`;
  }

  return `Remove ${resolveFriendlyName(entry.path)}`;
}

function buildSafetyLabel(safetyLevel?: string): string {
  switch ((safetyLevel ?? "").toLowerCase()) {
    case "safe":
      return "Safe";
    case "medium":
      return "Medium";
    case "advanced":
      return "Advanced";
    case "experimental":
    default:
      return "Experimental";
  }
}

function buildSafetyChipColor(safetyLevel?: string): "default" | "success" | "warning" | "secondary" {
  switch ((safetyLevel ?? "").toLowerCase()) {
    case "safe":
      return "success";
    case "medium":
      return "secondary";
    case "advanced":
    case "experimental":
      return "warning";
    default:
      return "default";
  }
}

function buildApplyTimingLabel(applyTiming?: string): string {
  switch ((applyTiming ?? "").toLowerCase()) {
    case "now":
      return "Applies now";
    case "next_match":
      return "Next match";
    case "restart_recommended":
    default:
      return "Restart required";
  }
}

function describeCollection(sourceCollectionId: string): string {
  switch ((sourceCollectionId ?? "").toLowerCase()) {
    case "vaultedaugments":
      return "Vaulted augments";
    case "availableitems":
      return "Allowed items";
    case "availableentities":
      return "Allowed entities";
    case "availablemapentities":
      return "Allowed map entities";
    case "soft-flag":
      return "Soft disable";
    case "reference":
      return "Reference";
    default:
      return resolveFriendlyName(sourceCollectionId);
  }
}

function isAdvancedRemoval(candidate: RemovalCandidate): boolean {
  const safety = (candidate.safetyLevel ?? "").toLowerCase();
  const mode = (candidate.mode ?? "").toLowerCase();
  return safety === "advanced" || safety === "experimental" || mode === "hard" || mode === "advanced";
}
