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
import type { App, AppConnection } from "@/types/apps";

interface ConnectedAppCardProps {
    app: App;
    conn: AppConnection | undefined;
    status: 'active' | 'reconnect' | 'inactive';
    color: string;
    onDisconnect: (appId: string) => void;
}

export function ConnectedAppCard({ app, conn, status, color, onDisconnect }: ConnectedAppCardProps) {
    return (
        <Card className="hover:shadow-md transition-shadow">
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
            <CardContent className="pt-0">
                <CardDescription className="text-sm mb-4">{app.description}</CardDescription>
                <div className="grid grid-cols-1 gap-2 text-xs text-gray-600 mb-4">
                    <div>Autenticado em: {conn?.authenticatedAt ? new Date(conn.authenticatedAt).toLocaleDateString('pt-BR') : '—'}</div>
                    <div>Expira em: {conn?.expiresAt ? new Date(conn.expiresAt).toLocaleDateString('pt-BR') : '—'}</div>
                    <div>Nome da loja: {conn?.storeName || '—'}</div>
                </div>
                <div className="flex space-x-2">
                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700">
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
    );
}
