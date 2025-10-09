import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users } from "lucide-react";
import type { Group } from "./types";

const initialGroups: Group[] = [
  { id: "g1", name: "Designers", members: ["Barbara", "Guilherme"] },
];

export function GruposTab() {
  const [groups, setGroups] = useState<Group[]>(initialGroups);
  const [name, setName] = useState("");
  const [member, setMember] = useState("");

  const addGroup = () => {
    if (!name.trim()) return;
    const g: Group = { id: Math.random().toString(36).slice(2), name, members: member ? [member] : [] };
    setGroups((prev) => [g, ...prev]);
    setName("");
    setMember("");
  };

  const addMember = (id: string) => {
    const m = prompt("Nome do membro para adicionar:");
    if (!m) return;
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, members: [...g.members, m] } : g)));
  };

  return (
    <div className="space-y-6">
      <Card className="p-4 border-gray-100">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input placeholder="Nome do grupo" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Primeiro membro (opcional)" value={member} onChange={(e) => setMember(e.target.value)} />
          <Button className="bg-novura-primary text-white" onClick={addGroup}>Criar grupo</Button>
        </div>
      </Card>

      <div className="space-y-3">
        {groups.map((g) => (
          <Card key={g.id} className="p-4 border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <Users className="w-4 h-4" /> {g.name}
                </div>
                <div className="text-sm text-gray-600 mt-2">{g.members.length} membros</div>
                {g.members.length > 0 && (
                  <div className="text-sm text-gray-700 mt-1">{g.members.join(", ")}</div>
                )}
              </div>
              <Button variant="outline" onClick={() => addMember(g.id)}>Adicionar pessoa</Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}