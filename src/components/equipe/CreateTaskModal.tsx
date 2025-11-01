import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useOrgMemberSearch } from "@/hooks/useChat";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Calendar } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export type TaskPriority = "high" | "medium" | "low";
export type TaskType = "story" | "bug" | "task" | "epic";
export type TaskStatus = "todo" | "doing" | "done";

export interface Task {
  id: number;
  title: string;
  assignee: string;
  assignees?: string[];
  priority: TaskPriority;
  dueDate: string; // YYYY-MM-DD
  startDate?: string; // YYYY-MM-DD
  type: TaskType;
  storyPoints: number;
  status: TaskStatus;
  timeTracked: number; // minutes
  labels: string[];
  dependencies: number[];
}

interface CreateTaskModalProps {
  onCreateTask: (task: Task & { visibility?: "private" | "team" | "members"; visibleMemberIds?: string[]; assignedToId?: string | null }) => void;
  openExternal?: boolean;
  onOpenChange?: (open: boolean) => void;
  showDefaultTrigger?: boolean; // quando false, não renderiza o botão padrão
}

export function CreateTaskModal({ onCreateTask, openExternal, onOpenChange, showDefaultTrigger = true }: CreateTaskModalProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openExternal !== undefined ? openExternal : internalOpen;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    if (openExternal === undefined) setInternalOpen(v);
  };
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [type, setType] = useState<TaskType>("task");
  const [dueDate, setDueDate] = useState<string>("");
  const [dueDatePickerOpen, setDueDatePickerOpen] = useState(false);
  const [startDate, setStartDate] = useState<string>("");
  const [startDatePickerOpen, setStartDatePickerOpen] = useState(false);
  const [visibility, setVisibility] = useState<"private" | "team" | "members">("team");
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const { results: memberResults } = useOrgMemberSearch(memberSearch, { alwaysList: true });
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const { results: assigneeResults } = useOrgMemberSearch(assigneeSearch, { alwaysList: true });
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(null);
  const [selectedAssigneeName, setSelectedAssigneeName] = useState<string>("");
  const [selectedAssigneeIds, setSelectedAssigneeIds] = useState<string[]>([]);
  const [selectedAssigneeNames, setSelectedAssigneeNames] = useState<string[]>([]);

  const reset = () => {
    setTitle("");
    setPriority("medium");
    setType("task");
    setDueDate("");
    setDueDatePickerOpen(false);
    setStartDate("");
    setStartDatePickerOpen(false);
    setVisibility("team");
    setMemberSearch("");
    setSelectedMembers([]);
    setAssigneeSearch("");
    setSelectedAssigneeId(null);
    setSelectedAssigneeName("");
    setSelectedAssigneeIds([]);
    setSelectedAssigneeNames([]);
  };

  const handleSubmit = () => {
    if (!title.trim()) return;
    const labels: string[] = [];
    if (startDate) labels.push(`start:${startDate}`);
    // Co-responsáveis: todos além do principal
    const coAssigneeIds = selectedAssigneeIds.filter(id => id !== selectedAssigneeId);
    const coAssigneeNames = selectedAssigneeNames.filter(name => name !== selectedAssigneeName);
    const newTask: Task & { visibility?: "private" | "team" | "members"; visibleMemberIds?: string[] } = {
      id: Date.now(),
      title,
      assignee: selectedAssigneeName || "",
      assignees: [selectedAssigneeName || "", ...coAssigneeNames].filter(Boolean),
      priority,
      dueDate: dueDate || "",
      type,
      storyPoints: 0,
      status: "todo",
      timeTracked: 0,
      labels,
      dependencies: [],
      visibility,
      visibleMemberIds: Array.from(new Set([...(visibility === "members" ? selectedMembers : []), ...coAssigneeIds])),
    };
    onCreateTask({ ...newTask, assignedToId: selectedAssigneeId });
    setOpen(false);
    reset();
  };

  return (
    <>
      {showDefaultTrigger && (
        <Button variant="default" onClick={() => setOpen(true)}>
          Nova tarefa
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar tarefa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="title">Título</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Corrigir bug no checkout" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Prioridade</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Data inicial</Label>
                <Popover open={startDatePickerOpen} onOpenChange={setStartDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={`w-full justify-start text-left font-normal ${!startDate && "text-gray-500"}`}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {startDate ? startDate : "Selecionar data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={startDate ? new Date(startDate) : undefined}
                      onSelect={(d) => {
                        if (d) {
                          setStartDate(format(d, 'yyyy-MM-dd'));
                          setStartDatePickerOpen(false);
                        }
                      }}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Data de entrega</Label>
                <Popover open={dueDatePickerOpen} onOpenChange={setDueDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={`w-full justify-start text-left font-normal ${!dueDate && "text-gray-500"}`}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {dueDate ? dueDate : "Selecionar data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={dueDate ? new Date(dueDate) : undefined}
                      onSelect={(d) => {
                        if (d) {
                          setDueDate(format(d, 'yyyy-MM-dd'));
                          setDueDatePickerOpen(false);
                        }
                      }}
                      locale={ptBR}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div>
              <Label>Responsáveis</Label>
              <Input placeholder="Buscar membros" value={assigneeSearch} onChange={(e) => setAssigneeSearch(e.target.value)} />
              <div className="mt-2 max-h-40 overflow-auto border rounded-md">
                {(assigneeResults || []).map((u: any) => {
                  const name = (u as any).nome || u.email;
                  const checked = selectedAssigneeIds.includes(u.id);
                  return (
                    <div
                      key={u.id}
                      className={`px-3 py-2 text-sm cursor-pointer ${checked ? 'bg-purple-50' : 'hover:bg-gray-50'}`}
                      onClick={() => {
                        setSelectedAssigneeIds(prev => {
                          const exists = prev.includes(u.id);
                          const next = exists ? prev.filter(id => id !== u.id) : [...prev, u.id];
                          return next;
                        });
                        setSelectedAssigneeNames(prev => {
                          const exists = prev.includes(name);
                          const next = exists ? prev.filter(n => n !== name) : [...prev, name];
                          return next;
                        });
                        // define principal como o último clicado quando adicionado
                        const exists = selectedAssigneeIds.includes(u.id);
                        if (!exists) { setSelectedAssigneeId(u.id); setSelectedAssigneeName(name); }
                        else if (selectedAssigneeId === u.id) { setSelectedAssigneeId(null); setSelectedAssigneeName(""); }
                      }}
                    >
                      {name}
                    </div>
                  );
                })}
                {(selectedAssigneeIds.length > 0) && (
                  <div className="px-3 py-2 text-xs text-gray-600">
                    Principal: {selectedAssigneeName || '—'}
                    <br/>
                    Co-responsáveis: {selectedAssigneeNames.filter(n => n !== selectedAssigneeName).join(', ') || '—'}
                  </div>
                )}
              </div>
            </div>

            <div>
              <Label>Visibilidade</Label>
              <RadioGroup value={visibility} onValueChange={(v) => setVisibility(v as any)} className="flex gap-6 mt-1">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="private" id="vis-private" />
                  <Label htmlFor="vis-private">Privado</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="team" id="vis-team" />
                  <Label htmlFor="vis-team">Equipe</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="members" id="vis-members" />
                  <Label htmlFor="vis-members">Selecionar membros</Label>
                </div>
              </RadioGroup>
            </div>

            {visibility === "members" && (
              <div>
                <Label>Membros</Label>
                <Input placeholder="Buscar membros" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
                <div className="mt-2 max-h-40 overflow-auto border rounded-md">
                  {(memberResults || []).map((u: any) => {
                    const checked = selectedMembers.includes(u.id);
                    return (
                      <div
                        key={u.id}
                        className={`px-3 py-2 text-sm cursor-pointer ${checked ? 'bg-purple-50' : 'hover:bg-gray-50'}`}
                        onClick={() => setSelectedMembers(prev => checked ? prev.filter(id => id !== u.id) : [...prev, u.id])}
                      >
                        {(u as any).nome || u.email}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Cancelar</Button>
              <Button onClick={handleSubmit}>Criar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}