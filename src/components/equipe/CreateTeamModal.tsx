import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { fetchAccountMembers, useChatChannels } from "@/hooks/useChat";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
};

export function CreateTeamModal({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { createTeam } = useChatChannels();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<string>("Logística");
  const [members, setMembers] = useState<{ id: string; email?: string; nome?: string }[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadMembers = async () => {
    if (!user) return;
    try {
      setLoadingMembers(true);
      const result = await fetchAccountMembers(user.id);
      setMembers(result);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message || 'Falha ao carregar membros', variant: 'destructive' });
    } finally {
      setLoadingMembers(false);
    }
  };

  const onSave = async () => {
    if (!name.trim()) {
      toast({ title: 'Nome obrigatório', description: 'Informe o nome da equipe.' });
      return;
    }
    setSaving(true);
    const { error } = await createTeam(name.trim(), category, selectedMemberIds);
    setSaving(false);
    if (!error) {
      onOpenChange(false);
      setName("");
      setSelectedMemberIds([]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (v) loadMembers(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar nova equipe</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Nome da equipe</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Logística - Operações" />
          </div>

          <div>
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Logística">Logística</SelectItem>
                <SelectItem value="Comercial">Comercial</SelectItem>
                <SelectItem value="Financeiro">Financeiro</SelectItem>
                <SelectItem value="Marketing">Marketing</SelectItem>
                <SelectItem value="Geral">Geral</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Membros</Label>
            <div className="max-h-40 overflow-auto rounded-md border p-2 space-y-2 text-sm">
              {loadingMembers && <div>Carregando membros...</div>}
              {!loadingMembers && members.length === 0 && <div>Nenhum membro encontrado.</div>}
              {!loadingMembers && members.map((m) => {
                const checked = selectedMemberIds.includes(m.id);
                return (
                  <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={checked} onChange={() => {
                      setSelectedMemberIds(prev => checked ? prev.filter(id => id !== m.id) : [...prev, m.id]);
                    }} />
                    <span>{m.nome || m.email || m.id}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={onSave} disabled={saving}>{saving ? 'Salvando...' : 'Criar equipe'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}