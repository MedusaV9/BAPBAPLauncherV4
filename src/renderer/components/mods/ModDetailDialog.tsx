import { Plus, Check, Tag, User } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { usePackageDetail } from "../../app/query/hooks";

export type ModDetailDialogProps = {
    channelId: string;
    packageId: string | null;
    installed: boolean;
    busy: boolean;
    onInstall: (version: string) => void;
    onClose: () => void;
};

export function ModDetailDialog({ channelId, packageId, installed, busy, onInstall, onClose }: ModDetailDialogProps) {
    const { data: detail, isLoading } = usePackageDetail(channelId, packageId ?? "");
    const open = Boolean(packageId);

    const heroSrc = detail?.heroImagePath || detail?.imagePath || detail?.thumbnailPath;
    const author = detail?.owner?.name || detail?.authors?.[0]?.name;
    const version = detail?.latestVersion ?? "";

    return (
        <Dialog open={open} onOpenChange={next => !next && onClose()}>
            <DialogContent className="max-w-lg">
                {isLoading || !detail ? (
                    <div className="flex flex-col gap-3 py-2">
                        <div className="h-40 w-full animate-pulse rounded-lg bg-secondary" />
                        <div className="h-5 w-1/2 animate-pulse rounded bg-secondary" />
                        <div className="h-3 w-full animate-pulse rounded bg-secondary" />
                        <div className="h-3 w-5/6 animate-pulse rounded bg-secondary" />
                    </div>
                ) : (
                    <>
                        {heroSrc && (
                            <div className="-mx-6 -mt-6 mb-1 aspect-[16/9] w-[calc(100%+3rem)] overflow-hidden rounded-t-xl bg-secondary">
                                <img src={heroSrc} alt="" className="h-full w-full object-cover" />
                            </div>
                        )}
                        <DialogHeader>
                            <DialogTitle className="font-display uppercase tracking-wide">
                                {detail.name}
                            </DialogTitle>
                            {detail.summary && (
                                <DialogDescription className="font-body">
                                    {detail.summary}
                                </DialogDescription>
                            )}
                        </DialogHeader>

                        <div className="flex flex-col gap-4 py-1">
                            {detail.description && (
                                <p className="whitespace-pre-wrap font-body text-sm leading-relaxed text-muted-foreground">
                                    {detail.description}
                                </p>
                            )}

                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-body text-xs text-muted-foreground">
                                {version && (
                                    <span className="font-semibold uppercase tracking-[0.08em]">
                                        Latest <span className="text-foreground">v{version}</span>
                                    </span>
                                )}
                                {author && (
                                    <span className="flex items-center gap-1">
                                        <User size={12} /> {author}
                                    </span>
                                )}
                                {detail.versions && detail.versions.length > 0 && (
                                    <span>{detail.versions.length} versions</span>
                                )}
                            </div>

                            {detail.tags && detail.tags.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <Tag size={12} className="text-muted-foreground" />
                                    {detail.tags.map(tag => (
                                        <Badge key={tag} variant="secondary" className="font-body">
                                            {tag}
                                        </Badge>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" className="uppercase" onClick={onClose}>
                                Close
                            </Button>
                            {installed ? (
                                <Button variant="outline" className="uppercase" disabled>
                                    <Check size={14} /> Installed
                                </Button>
                            ) : (
                                <Button
                                    variant="default"
                                    className="uppercase"
                                    disabled={busy || !version}
                                    onClick={() => onInstall(version)}
                                >
                                    <Plus size={14} /> Install
                                </Button>
                            )}
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
