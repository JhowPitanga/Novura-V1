import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Plus, Settings } from "lucide-react";
import type { App } from "@/types/apps";

interface AppCardProps {
    app: App;
    onConnect: (app: App) => void;
}

export function AppCard({ app, onConnect }: AppCardProps) {
    return (
        <Card className="overflow-hidden hover:shadow-lg transition-all duration-200 hover:scale-105">
            <CardHeader className="pb-4">
                <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-novura-primary to-purple-600 rounded-xl flex items-center justify-center">
                            {app.logo ? (
                                <img src={app.logo} alt={app.name} className="w-8 h-8 rounded" />
                            ) : (
                                <Settings className="w-6 h-6 text-white" />
                            )}
                        </div>
                        <div>
                            <CardTitle className="text-sm font-semibold">{app.name}</CardTitle>
                            <div className="flex items-center space-x-2 mt-1">
                                <Badge variant={app.price === 'free' ? 'default' : 'secondary'} className="text-xs">
                                    {app.price === 'free' ? 'Gratuito' : 'Pago'}
                                </Badge>
                                {app.isConnected && (
                                    <Badge className="bg-green-100 text-green-800 text-xs">
                                        <Check className="w-3 h-3 mr-1" />
                                        Conectado
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-0">
                <CardDescription className="text-sm mb-4 line-clamp-2">{app.description}</CardDescription>
                <Button
                    className="w-full"
                    variant={app.isConnected ? "outline" : "default"}
                    onClick={() => !app.isConnected && onConnect(app)}
                    disabled={app.isConnected}
                    size="sm"
                >
                    {app.isConnected ? (
                        <><Check className="w-4 h-4 mr-2" />Conectado</>
                    ) : (
                        <><Plus className="w-4 h-4 mr-2" />Conectar</>
                    )}
                </Button>
            </CardContent>
        </Card>
    );
}
