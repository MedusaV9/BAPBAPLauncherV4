import React from "react";
import {
  DragDropContext as DragDropContextRaw,
  Draggable as DraggableRaw,
  Droppable as DroppableRaw,
  type DraggableProvided,
  type DraggableStateSnapshot,
  type DroppableProvided,
  type DropResult,
} from "react-beautiful-dnd";
import { GripVertical } from "lucide-react";

// react-beautiful-dnd ships outdated React 17-era typings. The runtime is
// fine on React 18, but TS chokes on the JSX element type because of a
// `ReactNode` mismatch between the duplicated React type trees. We relax
// the JSX types here without affecting runtime behavior.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DragDropContext = DragDropContextRaw as unknown as React.ComponentType<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Droppable = DroppableRaw as unknown as React.ComponentType<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Draggable = DraggableRaw as unknown as React.ComponentType<any>;

/**
 * Phase 3 Task 22 — SortableFieldList.
 *
 * Generic drag-and-drop list using `react-beautiful-dnd` (already installed).
 * Drag handles are keyboard-accessible (focus + space to grab; arrow keys to
 * move; space again to drop; escape to cancel) — provided out-of-box by
 * `react-beautiful-dnd`.
 *
 * Used by GameModePage / EditorPage / CustomBuilderPage to reorder preset
 * chains, effect chains, and other array fields.
 */

export interface SortableItem {
  id: string;
  label: string;
  body?: React.ReactNode;
}

export interface SortableFieldListProps {
  items: SortableItem[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  isDisabled?: boolean;
  /** Optional droppableId override (defaults to a stable string). */
  listId?: string;
}

export function SortableFieldList({
  items,
  onReorder,
  isDisabled = false,
  listId = "rebalance-sortable-list",
}: SortableFieldListProps): React.ReactElement {
  const handleDragEnd = (result: DropResult) => {
    if (isDisabled) return;
    const { source, destination } = result;
    if (!destination) return;
    if (source.index === destination.index) return;
    onReorder(source.index, destination.index);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId={listId} isDropDisabled={isDisabled}>
        {(droppableProvided: DroppableProvided) => (
          <ul
            ref={droppableProvided.innerRef}
            {...droppableProvided.droppableProps}
            className="rebalance-sortable-list"
            data-testid="rebalance-sortable-list"
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {items.map((item, index) => (
              <Draggable
                key={item.id}
                draggableId={item.id}
                index={index}
                isDragDisabled={isDisabled}
              >
                {(draggableProvided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
                  <li
                    ref={draggableProvided.innerRef}
                    {...draggableProvided.draggableProps}
                    data-rebalance-pressable="true"
                    data-testid={`rebalance-sortable-row-${item.id}`}
                    data-dragging={snapshot.isDragging || undefined}
                    className="rebalance-sortable-row"
                    style={{
                      ...draggableProvided.draggableProps.style,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 12px",
                      background: snapshot.isDragging
                        ? "rgba(99, 102, 241, 0.10)"
                        : "var(--bg-1, #070911)",
                      border: `1px solid ${
                        snapshot.isDragging
                          ? "rgba(99, 102, 241, 0.55)"
                          : "var(--line, rgba(40,52,86,0.4))"
                      }`,
                      borderRadius: 6,
                      color: "var(--text, #f8fafc)",
                      cursor: isDisabled ? "not-allowed" : "default",
                      opacity: isDisabled ? 0.5 : 1,
                    }}
                  >
                    <span
                      {...draggableProvided.dragHandleProps}
                      className="rebalance-sortable-handle"
                      data-testid={`rebalance-sortable-handle-${item.id}`}
                      aria-label={`Drag to reorder ${item.label}`}
                      aria-disabled={isDisabled || undefined}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: isDisabled ? "not-allowed" : "grab",
                        color: "var(--text-muted, #94a3b8)",
                        padding: 2,
                      }}
                    >
                      <GripVertical size={14} aria-hidden="true" />
                    </span>
                    <span style={{ flex: 1, fontSize: 13 }}>{item.label}</span>
                    {item.body ? <span>{item.body}</span> : null}
                  </li>
                )}
              </Draggable>
            ))}
            {droppableProvided.placeholder as React.ReactNode}
          </ul>
        )}
      </Droppable>
    </DragDropContext>
  );
}
