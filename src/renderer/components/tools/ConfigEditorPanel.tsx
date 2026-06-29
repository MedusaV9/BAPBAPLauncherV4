import { useEffect, useState } from "react";
import { FileText, Save } from "lucide-react";
import { BapCard } from "../brand/BapCard";
import { Row } from "../brand/Row";
import { Button } from "../ui/button";
import { ScrollArea } from "../ui/scroll-area";
import { Badge } from "../ui/badge";
import { cn } from "../../app/lib/utils";
import { useConfigList, useConfigFile, useWriteConfig } from "../../app/query/hooks";

export type ConfigEditorPanelProps = {
    instanceId: string;
};

export function ConfigEditorPanel({ instanceId }: ConfigEditorPanelProps) {
    const { data: files, isLoading } = useConfigList(instanceId);
    const [selectedPath, setSelectedPath] = useState<string | null>(null);
    const { data: file } = useConfigFile(instanceId, selectedPath ?? undefined);
    const writeConfig = useWriteConfig();

    const [draft, setDraft] = useState("");
    const [dirty, setDirty] = useState(false);

    useEffect(() => {
        if (file) {
            setDraft(file.content);
            setDirty(false);
        }
    }, [file]);

    function save() {
        if (!selectedPath) return;
        writeConfig.mutate(
            { instanceId, filePath: selectedPath, content: draft },
            { onSuccess: () => setDirty(false) }
        );
    }

    return (
        <div className="flex h-full gap-4">
            {/* File list */}
            <BapCard className="flex w-64 shrink-0 flex-col overflow-hidden p-0">
                <div className="border-b border-border px-3 py-2">
                    <span className="font-display text-xs text-foreground">Config files</span>
                </div>
                <ScrollArea className="flex-1">
                    <div className="flex flex-col gap-0.5 p-2">
                        {isLoading && <p className="px-2 text-xs text-muted-foreground">Loading…</p>}
                        {files?.length === 0 && (
                            <p className="px-2 text-xs text-muted-foreground">No editable config files found.</p>
                        )}
                        {files?.map(entry => (
                            <Row
                                key={entry.path}
                                active={selectedPath === entry.path}
                                onClick={() => setSelectedPath(entry.path)}
                                className="flex-col items-start gap-0.5"
                            >
                                <span className="truncate font-mono text-xs text-foreground">
                                    {entry.path.split(/[\\/]/).pop()}
                                </span>
                                <span className="text-[10px] text-muted-foreground">{entry.section}</span>
                            </Row>
                        ))}
                    </div>
                </ScrollArea>
            </BapCard>

            {/* Editor */}
            <BapCard className="flex min-w-0 flex-1 flex-col overflow-hidden p-0">
                {selectedPath && file ? (
                    <>
                        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
                            <div className="flex min-w-0 items-center gap-2">
                                <FileText size={14} className="shrink-0 text-muted-foreground" />
                                <span className="truncate font-mono text-xs text-foreground">{selectedPath}</span>
                                <Badge variant="secondary">{file.extension}</Badge>
                                <span
                                    className={cn(
                                        "shrink-0 font-mono text-[0.65rem] uppercase tracking-wide",
                                        dirty ? "text-gold" : "text-muted-foreground"
                                    )}
                                >
                                    {dirty ? "Unsaved changes" : "All changes saved"}
                                </span>
                            </div>
                            <Button
                                size="sm"
                                variant="default"
                                onClick={save}
                                disabled={!dirty || writeConfig.isPending}
                            >
                                <Save size={14} /> Save
                            </Button>
                        </div>
                        <textarea
                            value={draft}
                            onChange={e => {
                                setDraft(e.target.value);
                                setDirty(true);
                            }}
                            spellCheck={false}
                            className="flex-1 resize-none bg-background p-4 font-mono text-[0.8125rem] leading-[1.6] text-foreground caret-accent selection:bg-cyan/20 focus:outline-none"
                        />
                    </>
                ) : (
                    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                        Select a config file to edit.
                    </div>
                )}
            </BapCard>
        </div>
    );
}
