import { useState } from "react";
import { Layers, Plus, Check, Pencil, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { cn } from "../../app/lib/utils";
import {
    useModSets,
    useCreateModSet,
    useRenameModSet,
    useDeleteModSet,
    useActivateModSet,
} from "../../app/query/hooks";

export type ModSetsBarProps = {
    instanceId: string;
};

export function ModSetsBar({ instanceId }: ModSetsBarProps) {
    const { data: modSets } = useModSets(instanceId);
    const createModSet = useCreateModSet();
    const renameModSet = useRenameModSet();
    const deleteModSet = useDeleteModSet();
    const activateModSet = useActivateModSet();

    const [creating, setCreating] = useState(false);
    const [newName, setNewName] = useState("");
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState("");

    const sets = modSets?.sets ?? [];
    const activeId = modSets?.activeModSetId;

    function submitCreate() {
        const name = newName.trim();
        if (!name) {
            // Blank submit (incl. blur with no text) cancels rather than leaving
            // the input stuck open.
            setNewName("");
            setCreating(false);
            return;
        }
        createModSet.mutate(
            { instanceId, name },
            {
                onSuccess: () => {
                    setNewName("");
                    setCreating(false);
                },
            }
        );
    }

    function submitRename(modSetId: string) {
        const name = editName.trim();
        if (!name) {
            setEditingId(null);
            return;
        }
        renameModSet.mutate(
            { instanceId, modSetId, name },
            { onSuccess: () => setEditingId(null) }
        );
    }

    return (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[1.125rem] border border-border bg-card p-3">
            <div className="flex items-center gap-1.5 text-muted-foreground">
                <Layers size={15} />
                <span className="font-body text-xs font-semibold uppercase tracking-[0.14em] text-foreground">
                    Mod sets
                </span>
            </div>

            {sets.map(set => {
                const isActive = set.id === activeId;
                if (editingId === set.id) {
                    return (
                        <Input
                            key={set.id}
                            autoFocus
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            onBlur={() => submitRename(set.id)}
                            onKeyDown={e => {
                                if (e.key === "Enter") submitRename(set.id);
                                if (e.key === "Escape") setEditingId(null);
                            }}
                            className="h-8 w-40"
                        />
                    );
                }
                return (
                    <div
                        key={set.id}
                        className={cn(
                            "group flex items-center gap-1 rounded-full border px-2.5 py-1 font-body text-xs transition-colors",
                            isActive ? "border-accent bg-accent/10" : "border-border"
                        )}
                    >
                        <button
                            onClick={() => activateModSet.mutate({ instanceId, modSetId: set.id })}
                            disabled={isActive || activateModSet.isPending}
                            className="focus-ring flex items-center gap-1 font-body font-medium text-foreground disabled:cursor-default"
                            title={isActive ? "Active mod set" : "Activate this mod set"}
                        >
                            {isActive && <Check size={12} className="text-accent" />}
                            {set.name}
                        </button>
                        <button
                            onClick={() => {
                                setEditingId(set.id);
                                setEditName(set.name);
                            }}
                            className="focus-ring text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                            title="Rename"
                        >
                            <Pencil size={11} />
                        </button>
                        {!isActive && (
                            <button
                                onClick={() => deleteModSet.mutate({ instanceId, modSetId: set.id })}
                                className="focus-ring text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                                title="Delete"
                            >
                                <Trash2 size={11} />
                            </button>
                        )}
                    </div>
                );
            })}

            {sets.length === 0 && (
                <Badge variant="secondary">No saved sets yet</Badge>
            )}

            {creating ? (
                <Input
                    autoFocus
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onBlur={submitCreate}
                    onKeyDown={e => {
                        if (e.key === "Enter") submitCreate();
                        if (e.key === "Escape") {
                            setNewName("");
                            setCreating(false);
                        }
                    }}
                    placeholder="Set name…"
                    className="h-8 w-40"
                />
            ) : (
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setCreating(true)}
                    className="ml-auto uppercase"
                >
                    <Plus size={14} /> New set
                </Button>
            )}
        </div>
    );
}
