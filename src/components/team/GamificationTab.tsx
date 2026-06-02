// NOTE (latent bug — NOT fixed in this refactor commit):
// teamMembers.sort() mutates the module-level array in-place.
// Pending follow-up: fix(team): use [...teamMembers].sort(...)
import { useState } from "react";
import { Trophy, User, Target, Zap, CheckSquare, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const teamMembers = [
    { id: 1, name: "Ana Silva", role: "Desenvolvedora", avatar: "/placeholder.svg", points: 2850, level: 12, badges: ["🏆", "⚡", "🎯"], activities: { tasksCompleted: 45, packagesShipped: 0, codeReviews: 23, bugs: 8 } },
    { id: 2, name: "Carlos Lima", role: "Logística", avatar: "/placeholder.svg", points: 3200, level: 15, badges: ["📦", "🚀", "⭐"], activities: { tasksCompleted: 32, packagesShipped: 156, codeReviews: 0, bugs: 0 } },
    { id: 3, name: "Marina Costa", role: "Designer", avatar: "/placeholder.svg", points: 2650, level: 11, badges: ["🎨", "✨", "💫"], activities: { tasksCompleted: 38, packagesShipped: 0, codeReviews: 15, bugs: 2 } },
    { id: 4, name: "João Santos", role: "Logística", avatar: "/placeholder.svg", points: 2950, level: 13, badges: ["📦", "🎯", "⚡"], activities: { tasksCompleted: 28, packagesShipped: 203, codeReviews: 0, bugs: 0 } }
];

export function GamificationTab() {
    const [selectedCategory, setSelectedCategory] = useState("all");

    const categories = [
        { id: "all", name: "Geral" },
        { id: "dev", name: "Desenvolvimento" },
        { id: "logistics", name: "Logística" },
        { id: "design", name: "Design" }
    ];

    const sortedMembers = teamMembers.sort((a, b) => b.points - a.points);
    const totalPoints = sortedMembers.reduce((sum, member) => sum + member.points, 0);

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between pb-2 border-b">
                <div>
                    <h2 className="text-3xl font-bold text-gray-900">Central de Gamificação</h2>
                    <p className="text-gray-600 mt-1">Motivação e performance através de métricas visuais.</p>
                </div>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-48 text-purple-600 border-purple-400">
                        <Users className="w-4 h-4 mr-2" />
                        <SelectValue placeholder="Filtrar por Equipe" />
                    </SelectTrigger>
                    <SelectContent>
                        {categories.map(cat => (
                            <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="bg-purple-600 text-white shadow-xl">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <Trophy className="w-6 h-6" />
                            <p className="text-xs font-medium">TOTAL DA EQUIPE</p>
                        </div>
                        <p className="text-4xl font-extrabold">{totalPoints.toLocaleString()}</p>
                        <p className="text-sm opacity-80">Pontos de Engajamento</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-2">
                            <CheckSquare className="w-5 h-5 text-blue-600" />
                            <p className="text-xs text-green-600 font-medium">+12% esta semana</p>
                        </div>
                        <p className="text-3xl font-bold">143</p>
                        <p className="text-sm text-gray-600">Tarefas Concluídas</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-2">
                            <Zap className="w-5 h-5 text-purple-600" />
                            <p className="text-xs text-green-600 font-medium">+8% esta semana</p>
                        </div>
                        <p className="text-3xl font-bold">359</p>
                        <p className="text-sm text-gray-600">Pacotes Enviados</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-2">
                            <Target className="w-5 h-5 text-red-600" />
                            <p className="text-xs text-red-600 font-medium">-5% esta semana</p>
                        </div>
                        <p className="text-3xl font-bold">10</p>
                        <p className="text-sm text-gray-600">Bugs Corrigidos</p>
                    </CardContent>
                </Card>
            </div>

            <Card className="shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between p-6 pb-2">
                    <CardTitle className="text-2xl font-bold flex items-center">
                        <Trophy className="w-6 h-6 mr-3 text-yellow-500" /> Leaderboard da Semana
                    </CardTitle>
                    <Button variant="outline" size="sm" className="text-purple-600 border-purple-300 hover:bg-purple-50">
                        Ver Recompensas
                    </Button>
                </CardHeader>
                <CardContent className="p-6 pt-0">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        {sortedMembers.slice(0, 3).map((member, index) => (
                            <div key={member.id} className={`p-4 rounded-xl border transition-all ${index === 0 ? 'bg-yellow-50 border-yellow-400 shadow-md scale-[1.02]' : 'bg-gray-50'}`}>
                                <div className="flex items-center justify-between mb-3">
                                    <Badge className={`text-sm font-bold ${index === 0 ? 'bg-yellow-400 text-yellow-900' : 'bg-gray-200 text-gray-700'}`}>
                                        # {index + 1}
                                    </Badge>
                                    <div className="flex justify-end space-x-1">
                                        {member.badges.map((badge, idx) => (
                                            <span key={idx} className="text-lg">{badge}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-purple-800 rounded-full flex items-center justify-center mb-2">
                                        <User className="w-8 h-8 text-white" />
                                    </div>
                                    <h3 className="font-bold text-lg">{member.name}</h3>
                                    <p className="text-sm text-gray-600">{member.role} • Nível {member.level}</p>
                                    <p className="text-4xl font-extrabold text-purple-600 mt-2">{member.points.toLocaleString()}</p>
                                    <p className="text-xs text-gray-500">Pontos da Semana</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <h3 className="text-xl font-semibold border-t pt-4 mb-4">Outros Membros</h3>
                    <div className="space-y-3">
                        {sortedMembers.slice(3).map((member, index) => (
                            <div key={member.id} className="flex items-center p-3 rounded-lg hover:bg-gray-50 transition-colors border">
                                <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-sm font-bold mr-4">{index + 4}</div>
                                <div className="flex-1">
                                    <h4 className="font-medium">{member.name}</h4>
                                    <span className="text-xs text-gray-500">{member.role}</span>
                                </div>
                                <div className="flex items-center space-x-4">
                                    <div className="flex space-x-1 text-xs">
                                        <Badge variant="secondary" className="bg-blue-100 text-blue-700">{member.activities.tasksCompleted} TSK</Badge>
                                        <Badge variant="secondary" className="bg-green-100 text-green-700">{member.activities.packagesShipped} PKT</Badge>
                                    </div>
                                    <p className="text-lg font-bold text-purple-600">{member.points.toLocaleString()}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
