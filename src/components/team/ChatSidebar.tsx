// §1 Exception: 152 LOC — justified by ChatListItem inlined (double-confirm delete
// pattern tied to toggleStar/deleteChannel props) and DM name-resolution useEffect;
// both are single-consumer and cannot be decomposed further without over-fragmentation.
import { useState, useEffect } from "react";
import { Plus, ChevronDown, Search, MoreVertical, Users, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useOrgMemberSearch } from "@/hooks/useChat";
import { fetchDmUserProfile, fetchOrgMembers } from "@/services/team.service";
const ChatAvatar = ({ isGroup, color }: { isGroup: boolean; color: string }) => (
  <div className={`w-10 h-10 bg-${color}-200 rounded-full flex items-center justify-center mr-3`}>
    {isGroup ? <Users className={`w-5 h-5 text-${color}-800`} /> : <User className={`w-5 h-5 text-${color}-800`} />}
  </div>
);

interface ChatSidebarProps {
  channels: any[];
  directChannels: any[];
  teamChannels: any[];
  unreadCounts: Record<string, number>;
  unreadTotal: number;
  activeChannelId: string | null;
  onChannelSelect: (channelId: string | null, immediateName: string | undefined) => void;
  onMarkRead: (channelId: string) => void;
  onToggleStar: (channelId: string, starred: boolean) => void;
  onDeleteChannel: (channelId: string) => Promise<{ ok?: boolean; error?: string }>;
  onStartDirectMessage: (userId: string) => Promise<{ channelId?: string }>;
  onCreateGroup: () => void;
}

export function ChatSidebar({
  channels, directChannels, teamChannels,
  unreadCounts, unreadTotal, activeChannelId,
  onChannelSelect, onMarkRead, onToggleStar, onDeleteChannel,
  onStartDirectMessage, onCreateGroup,
}: ChatSidebarProps) {
  const { user, organizationId } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const [showStarred, setShowStarred] = useState(true);
  const [showDMs, setShowDMs] = useState(true);
  const [showTeams, setShowTeams] = useState(true);
  const { results: memberResults } = useOrgMemberSearch("", { alwaysList: true });

  const filtered = (list: any[]) => list.filter(c => (c.name || 'Direta').toLowerCase().includes(searchTerm.toLowerCase()));
  const starred = filtered((channels || []).filter((c: any) => c.isStarred));
  const dms = filtered(directChannels || []);
  const teams = filtered(teamChannels || []);

  const ChatListItem = ({ ch }: { ch: any }) => {
    const isActive = ch.id === activeChannelId;
    const isGroup = ch.type === 'team';
    const color = isGroup ? 'purple' : 'gray';
    const canDelete = !!user && ch?.created_by === user.id;
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [otherName, setOtherName] = useState<string | null>(null);

    const memberIdsStr = JSON.stringify(ch?.member_ids);
    useEffect(() => {
      let mounted = true;
      const loadOtherName = async () => {
        if (isGroup) return;
        const members: string[] = Array.isArray(ch?.member_ids) ? ch.member_ids : [];
        const otherId = members.find((id) => id !== user?.id);
        if (!otherId) return;
        try {
          let nome: string | null = null; let email: string | null = null;
          const { data: profile, error: pErr } = await fetchDmUserProfile(otherId);
          if (!pErr && profile) { nome = (profile as any).nome; email = (profile as any).email; }
          if (!nome && !email && organizationId) {
            try {
              const { data: mems } = await fetchOrgMembers(organizationId);
              const found = (mems as any[])?.find((u) => u.id === otherId);
              nome = (found as any)?.nome ?? null; email = (found as any)?.email ?? null;
            } catch {}
          }
          if (mounted) setOtherName(nome || email || null);
        } catch {}
      };
      loadOtherName();
      return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ch?.id, memberIdsStr, user?.id, organizationId, isGroup]);

    return (
      <div
        key={ch.id}
        className={`flex items-center p-3 rounded-lg transition-colors cursor-pointer ${isActive ? 'bg-purple-50 border-l-4 border-purple-600' : 'hover:bg-gray-100'}`}
        onClick={() => {
          const immediateName = isGroup ? (ch.name || 'Canal da Equipe') : (otherName || ch.name || '');
          onChannelSelect(ch.id, immediateName);
          onMarkRead(ch.id);
        }}
      >
        <ChatAvatar isGroup={isGroup} color={color} />
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-gray-900 truncate">{isGroup ? (ch.name || 'Canal da Equipe') : (otherName || ch.name || '')}</h4>
        </div>
        <div className="ml-2 flex items-center gap-2">
          {!!unreadCounts[ch.id] && unreadCounts[ch.id] > 0 && (
            <Badge variant="secondary" className="bg-purple-600 text-white min-w-[22px] h-6 rounded-full px-2 flex items-center justify-center text-xs">
              {unreadCounts[ch.id]}
            </Badge>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="text-gray-500 hover:bg-gray-100" onClick={(e) => e.stopPropagation()}>
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onToggleStar(ch.id, !ch.isStarred); }}>
                {ch.isStarred ? 'Remover dos Estrelados' : 'Adicionar aos Estrelados'}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canDelete} className={` ${canDelete ? 'text-red-600' : 'text-gray-400'} `} onClick={(e) => { e.stopPropagation(); if (canDelete) setConfirmOpen(true); }}>
                {canDelete ? 'Excluir conversa' : 'Apenas criador pode excluir'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader><AlertDialogTitle>Excluir conversa?</AlertDialogTitle></AlertDialogHeader>
            <p className="text-sm text-gray-600">Essa ação é irreversível. Confirme duas vezes para excluir.</p>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={async () => {
                setConfirmOpen(false);
                const again = window.confirm('Tem certeza? Esta é a segunda confirmação.');
                if (!again) return;
                const res = await onDeleteChannel(ch.id);
                if (res?.ok) { if (activeChannelId === ch.id) onChannelSelect(null, undefined); }
                else { console.warn(res?.error || 'Erro ao excluir'); }
              }}>Confirmar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  };

  return (
    <div className="w-80 border-r bg-gray-50 flex-shrink-0 flex flex-col">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <span className="text-lg font-semibold text-gray-800">Mensagens</span>
            <Badge variant="secondary" className="bg-purple-600 text-white min-w-[22px] h-6 rounded-full px-2 flex items-center justify-center text-xs">{unreadTotal}</Badge>
          </div>
          <Button variant="ghost" size="icon" className="text-purple-600 hover:bg-purple-100" onClick={onCreateGroup}><Plus className="w-5 h-5" /></Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input placeholder="Encontre um DM ou Equipe" className="pl-9 h-9 bg-white border-gray-300 focus:border-purple-600" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onFocus={() => setShowMemberDropdown(true)} onClick={() => setShowMemberDropdown(true)} onBlur={() => setTimeout(() => setShowMemberDropdown(false), 150)} />
          {showMemberDropdown && (
            <div className="absolute z-10 mt-1 w-full bg-white border rounded-md shadow-sm max-h-56 overflow-auto">
              {memberResults.filter((u: any) => u.id !== user?.id).map((u: any) => (
                <div key={u.id} className="px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer" onMouseDown={async () => {
                  const res = await onStartDirectMessage(u.id);
                  if (res?.channelId) onChannelSelect(res.channelId, u.nome || u.email);
                  setSearchTerm(''); setShowMemberDropdown(false);
                }}>{u.nome || u.email}</div>
              ))}
              {memberResults.length === 0 && <div className="px-3 py-2 text-xs text-gray-500">Nenhum membro encontrado</div>}
            </div>
          )}
        </div>
      </div>
      <div className="overflow-y-auto flex-1 p-2">
        {starred.length > 0 && (<>
          <div className="px-2 py-2 text-sm font-semibold text-gray-500 flex items-center justify-between cursor-pointer hover:bg-gray-100 rounded-md" onClick={() => setShowStarred(!showStarred)}>Estrelado ({starred.length}) <ChevronDown className={`w-4 h-4 transform transition-transform ${showStarred ? 'rotate-180' : ''}`} /></div>
          {showStarred && <div className="space-y-1 mt-1">{starred.map((ch: any) => <ChatListItem key={ch.id} ch={ch} />)}</div>}
        </>)}
        {dms.length > 0 && (<>
          <div className="px-2 py-4 text-sm font-semibold text-gray-500 flex items-center justify-between cursor-pointer hover:bg-gray-100 rounded-md" onClick={() => setShowDMs(!showDMs)}>Mensagens Diretas ({dms.length}) <ChevronDown className={`w-4 h-4 transform transition-transform ${showDMs ? 'rotate-180' : ''}`} /></div>
          {showDMs && <div className="space-y-1 mt-1">{dms.map((ch: any) => <ChatListItem key={ch.id} ch={ch} />)}</div>}
        </>)}
        {teams.length > 0 && (<>
          <div className="px-2 py-4 text-sm font-semibold text-gray-500 flex items-center justify-between cursor-pointer hover:bg-gray-100 rounded-md" onClick={() => setShowTeams(!showTeams)}>Equipes ({teams.length}) <ChevronDown className={`w-4 h-4 transform transition-transform ${showTeams ? 'rotate-180' : ''}`} /></div>
          {showTeams && <div className="space-y-1 mt-1">{teams.map((ch: any) => <ChatListItem key={ch.id} ch={ch} />)}</div>}
        </>)}
      </div>
    </div>
  );
}
