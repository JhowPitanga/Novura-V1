import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNavigate } from "react-router-dom";

interface DraftsListProps {
    drafts: any[];
    selectedDraftIds: Set<string>;
    onToggleSelect: (id: string) => void;
    onDeleteDraft: (id: string) => Promise<void>;
}

export function DraftsList({ drafts, selectedDraftIds, onToggleSelect, onDeleteDraft }: DraftsListProps) {
    const navigate = useNavigate();
    const [deletePopoverOpenId, setDeletePopoverOpenId] = useState<string | null>(null);

    if (drafts.length === 0) {
        return <div className="p-6 text-sm text-gray-600">Nenhum rascunho encontrado.</div>;
    }

    return (
        <div>
            {drafts.map((d: any) => (
                <div key={String(d.id)} className="relative bg-white border border-gray-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Checkbox
                                size="sm"
                                indicatorStyle="square"
                                checked={selectedDraftIds.has(String(d.id))}
                                onCheckedChange={() => onToggleSelect(String(d.id))}
                            />
                            <div className="text-sm text-gray-900 font-medium">{String(d.title || 'Sem título')}</div>
                            <div className="text-xs text-gray-600">{String(d.site_id || '')} · {String(d.marketplace_name || '')}</div>
                            <div className="text-xs text-gray-600">
                                Atualizado: {new Date(String(d.updated_at)).toLocaleString()}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                className="bg-novura-primary hover:bg-novura-primary/90"
                                onClick={() => navigate(`/anuncios/criar/?draft_id=${String(d.id)}`)}
                            >
                                Continuar cadastro
                            </Button>
                            <Popover
                                open={deletePopoverOpenId === String(d.id)}
                                onOpenChange={(open) => setDeletePopoverOpenId(open ? String(d.id) : null)}
                            >
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-red-600 hover:text-red-700"
                                        aria-label="Excluir rascunho"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent align="end" sideOffset={8} className="w-64 bg-white border p-3 rounded-xl">
                                    <div className="text-sm text-gray-800 font-medium mb-2">Excluir rascunho?</div>
                                    <div className="text-xs text-gray-600 mb-3">
                                        Esta ação remove definitivamente o rascunho do banco de dados.
                                    </div>
                                    <div className="flex justify-end gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setDeletePopoverOpenId(null)}
                                        >
                                            Cancelar
                                        </Button>
                                        <Button
                                            size="sm"
                                            className="bg-red-600 hover:bg-red-700"
                                            onClick={async () => {
                                                await onDeleteDraft(String(d.id));
                                                setDeletePopoverOpenId(null);
                                            }}
                                        >
                                            Excluir
                                        </Button>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
