import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function WelcomeCard() {
    return (
        <Card className="mb-8 bg-gradient-to-r from-novura-primary to-purple-600 text-white overflow-hidden relative rounded-xl">
            <CardContent className="px-8 py-10 md:py-12">
                <div className="flex items-center justify-between">
                    <div className="flex-1">
                        <h2 className="text-2xl md:text-3xl font-bold mb-2">🎉 Bem-vindo(a) ao Novura</h2>
                        <p className="text-purple-100 mb-6">
                            Gerencie sua empresa em um só lugar com desempenho e simplicidade.
                        </p>
                        <Button asChild variant="secondary" className="bg-white text-novura-primary hover:bg-gray-100 rounded-xl h-11 px-5">
                            <Link to="/novura-academy">
                                Explorar Novura
                                <ChevronRight className="w-4 h-4 ml-2" />
                            </Link>
                        </Button>
                    </div>
                    <div className="hidden md:block">
                        <div className="w-36 h-36 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm">
                            <span className="text-4xl">✨</span>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
