import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { QuickSetupModal } from "@/components/apps/QuickSetupModal";
import type { App, AppConnection } from "@/types/apps";

interface ConnectedAppCardProps {
    app: App;
    conn: AppConnection | undefined;
    status: 'active' | 'reconnect' | 'inactive';
    color: string;
    onDisconnect: (appId: string) => void;
    /** Real marketplace_integrations.id — needed to open the warehouse config modal. */
    integrationId?: string | null;
    organizationId?: string | null;
}

export function ConnectedAppCard({
    app,
    conn,
    status,
    color,
    onDisconnect,
    integrationId,
    organizationId,
}: ConnectedAppCardProps) {
    const [settingsModalOpen, setSettingsModalOpen] = useState(false);
    const shortDescription = (app.description || "").slice(0, 96);
    const descriptionText = app.description && app.description.length > 96
        ? `${shortDescription}...`
        : (app.description || "");

    return (
        <>
            <Card className="h-full hover:shadow-md transition-shadow flex flex-col">
                <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-novura-primary to-purple-600 rounded-lg flex items-center justify-center">
                                {app.logo ? (
                                    <img src={app.logo} alt={app.name} className="w-6 h-6 rounded" />
                                ) : (
                                    <Settings className="w-5 h-5 text-white" />
                                )}
                            </div>
                            <div>
                                <CardTitle className="text-sm">{app.name}</CardTitle>
                                <div className="flex items-center space-x-2 mt-1">
                                    <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
                                    <span className="text-xs text-gray-600">
                                        {status === 'active' ? 'Ativo' : status === 'reconnect' ? 'Reconectar' : 'Inativo'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-0 flex flex-col flex-1">
                    <CardDescription className="text-sm mb-4 min-h-[40px]">
                        {descriptionText}
                    </CardDescription>
                    <div className="grid grid-cols-1 gap-2 text-xs text-gray-600 mb-4 min-h-[64px]">
                        <div>Autenticado em: {conn?.authenticatedAt ? new Date(conn.authenticatedAt).toLocaleDateString('pt-BR') : '—'}</div>
                        <div>Expira em: {conn?.expiresAt ? new Date(conn.expiresAt).toLocaleDateString('pt-BR') : '—'}</div>
                        <div>Nome da loja: {conn?.storeName || '—'}</div>
                    </div>
                    <div className="mt-auto flex flex-col sm:flex-row gap-2">
                        {/* Unified settings modal button */}
                        {integrationId && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-9 sm:flex-1 text-novura-primary border-novura-primary/40 hover:bg-novura-primary/5"
                                onClick={() => setSettingsModalOpen(true)}
                            >
                                <Settings className="w-3.5 h-3.5 mr-1.5" />
                                Configurações
                            </Button>
                        )}

                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm" className="h-9 sm:flex-1 text-red-600 hover:text-red-700">
                                    Desconectar
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir aplicativo?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Tem certeza de que deseja excluir este aplicativo? Isso removerá as configurações salvas para esta loja.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction asChild>
                                        <Button variant="destructive" onClick={() => onDisconnect(app.id)}>
                                            Excluir
                                        </Button>
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </CardContent>
            </Card>

            {/* Unified settings modal */}
            {integrationId && (
                <QuickSetupModal
                    open={settingsModalOpen}
                    onOpenChange={setSettingsModalOpen}
                    integrationId={integrationId}
                    providerKey={app.providerKey ?? ""}
                    providerDisplayName={app.providerDisplayName ?? app.name}
                    initialTab="store"
                />
            )}
        </>
    );
}
