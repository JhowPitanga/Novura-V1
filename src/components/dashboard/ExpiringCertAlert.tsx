import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ExpiringCert } from "@/services/dashboard.service";

interface ExpiringCertAlertProps {
    certs: ExpiringCert[];
    loading?: boolean;
}

export function ExpiringCertAlert({ certs, loading }: ExpiringCertAlertProps) {
    if (certs.length === 0) return null;

    return (
        <Card className="mb-8 border-purple-200 bg-purple-50">
            <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5 text-purple-700" />
                        <h3 className="text-base font-semibold text-purple-800">
                            Certificados A1 vencendo em até 30 dias
                        </h3>
                    </div>
                    {loading && <span className="text-xs text-purple-700">Atualizando...</span>}
                </div>
                <div className="space-y-2">
                    {certs.map((c) => {
                        const expired = c.daysLeft < 0;
                        const critical = c.daysLeft <= 7;
                        const dateFmt = new Date(c.valid_to + 'T00:00:00').toLocaleDateString('pt-BR');
                        return (
                            <div
                                key={c.id}
                                className={`flex items-center justify-between p-3 rounded-md ${expired ? 'bg-red-50 border border-red-200' : 'bg-white border border-purple-200'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <Badge
                                        variant={expired ? "destructive" : "secondary"}
                                        className={expired ? "bg-red-600 text-white" : "bg-purple-100 text-purple-800"}
                                    >
                                        {expired ? 'Vencido' : `${c.daysLeft} dia${Math.abs(c.daysLeft) === 1 ? '' : 's'}`}
                                    </Badge>
                                    <div className="text-sm text-gray-800">
                                        <span className="font-medium">{c.company_name || 'Empresa'}</span>
                                        <span className="text-gray-500"> • Validade: {dateFmt}</span>
                                        {expired && (
                                            <div className="text-xs text-red-700 mt-1">
                                                Certificado vencido, atualize para voltar a emitir suas notas
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <Button
                                    asChild
                                    size="sm"
                                    className={critical || expired ? 'bg-red-600 hover:bg-red-700' : 'bg-novura-primary hover:bg-novura-primary/90'}
                                >
                                    <Link to={`/configuracoes/notas-fiscais/nova-empresa?companyId=${c.company_id}&step=2&mode=edit`}>
                                        Renovar
                                    </Link>
                                </Button>
                            </div>
                        );
                    })}
                </div>
            </CardContent>
        </Card>
    );
}
