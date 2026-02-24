import { useState, useMemo, useRef, useEffect } from 'react';
import { User, Send, Smile, Hash, AtSign, Pencil, Check, X, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useChannelMessages, useOrgMemberSearch } from "@/hooks/useChat";
import { CommandDialog, Command, CommandGroup, CommandItem, CommandInput, CommandList, CommandEmpty } from "@/components/ui/command";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverTrigger, PopoverContent, PopoverAnchor } from "@/components/ui/popover";

type ChatTabProps = { channelId: string; channelName?: string; channelType?: 'dm' | 'team' };

function highlightContent(text: string) {
    const parts = text.split(/(\s+)/);
    return parts.map((part, idx) => {
        // Linkar tokens de pedidos (#Pedidos:<id>) para a página de Pedidos
        if (part.startsWith('#Pedidos:')) {
            const label = part.replace('#Pedidos:', '').trim();
            const href = `/pedidos?order_id=${encodeURIComponent(label)}`;
            return (
                <a key={idx} href={href} className="text-purple-700 underline">
                    Pedido {label}
                </a>
            );
        }
        if (part.startsWith('@') || part.startsWith('#')) {
            return <span key={idx} className="text-purple-700 font-semibold">{part}</span>;
        }
        return <span key={idx}>{part}</span>;
    });
}

export const ChatTab: React.FC<ChatTabProps> = ({ channelId, channelName, channelType }) => {
    const { messages, sendMessage, sending, loadOlder, hasMore, typingUsers, emitTyping, emitTypingStop } = useChannelMessages(channelId);
    const { user, organizationId } = useAuth();
    const [messageInput, setMessageInput] = useState('');
    const [showCommand, setShowCommand] = useState(false);
    const [selectedModule, setSelectedModule] = useState<string | null>(null);
    const [moduleDetail, setModuleDetail] = useState('');
    const lastTypingSentRef = useRef<number>(0);
    const [headerTitle, setHeaderTitle] = useState<string>('');
    const [headerSubtitle, setHeaderSubtitle] = useState<string>('');
    const [isDirect, setIsDirect] = useState<boolean>(channelType ? channelType === 'dm' : false);
    const [otherUserId, setOtherUserId] = useState<string | null>(null);
    const [otherUserName, setOtherUserName] = useState<string>('');
    const [channelMemberIds, setChannelMemberIds] = useState<string[]>([]);
    const [memberNames, setMemberNames] = useState<Record<string, string>>({});
    const [hasNewIndicator, setHasNewIndicator] = useState<boolean>(false);
    const [unreadCount, setUnreadCount] = useState<number>(0);
    const [isAtBottom, setIsAtBottom] = useState<boolean>(true);
    const lastMessageIdRef = useRef<string | null>(null);
    const bottomRef = useRef<HTMLDivElement | null>(null);
    const scrollContainerRef = useRef<HTMLDivElement | null>(null);

    // Edição de nome do canal (somente equipe)
    const [editingName, setEditingName] = useState<boolean>(false);
    const [pendingName, setPendingName] = useState<string>('');
    const [savingName, setSavingName] = useState<boolean>(false);

    // Popover de comandos (# módulos / @ menções)
    const [showCmdPopover, setShowCmdPopover] = useState<boolean>(false);
    const [cmdMode, setCmdMode] = useState<'module' | 'mention' | null>(null);
    const [cmdQuery, setCmdQuery] = useState<string>('');
    const [moduleItems, setModuleItems] = useState<any[]>([]);
    const [moduleLoading, setModuleLoading] = useState<boolean>(false);

useEffect(() => {
    // Abrir popover ao digitar '#' ou '@'
    if (messageInput.endsWith('#')) {
        setCmdMode('module');
        setCmdQuery('');
        setShowCmdPopover(true);
    } else if (messageInput.endsWith('@')) {
        setCmdMode('mention');
        setCmdQuery('');
        setShowCmdPopover(true);
    }
}, [messageInput]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        const content = messageInput.trim();
        if (!content) return;
        await sendMessage(content);
        setMessageInput('');
        await emitTypingStop();
    };

    const emojiCategories = useMemo(() => ([
        { label: 'Carinhas', emojis: ['😀','😂','😍','😎','🤔','😊','😭','😅'] },
        { label: 'Status', emojis: ['✅','⚠️','❌','⏳','🟢','🟡','🔴'] },
        { label: 'Trabalho', emojis: ['📦','🚚','💼','📈','🛠️','📞','🧾'] },
    ]), []);

    const modules = useMemo(() => ([
        { id: 'Produtos', hint: 'Digite o SKU' },
        { id: 'Pedidos', hint: 'Digite o número do pedido' },
        { id: 'Anúncios', hint: 'Digite o SKU do anúncio' },
        { id: 'NotasFiscais', hint: 'Digite a chave ou número' },
    ]), []);

    const applyModuleShortcut = () => {
        if (!selectedModule) { setShowCommand(false); return; }
        const detail = moduleDetail.trim();
        const token = detail ? `#${selectedModule}:${detail} ` : `#${selectedModule} `;
        setMessageInput(prev => prev.replace(/#$/, '') + token);
        setSelectedModule(null);
        setModuleDetail('');
        setShowCommand(false);
    };

useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages.length]);

// Persistir novo nome do canal
const saveChannelName = async () => {
    if (!channelId || !pendingName.trim()) { setEditingName(false); return; }
    try {
        setSavingName(true);
        const { error } = await supabase
            .from('chat_channels')
            .update({ name: pendingName.trim() })
            .eq('id', channelId);
        if (error) throw error;
        setHeaderTitle(pendingName.trim());
        setEditingName(false);
    } catch (e) {
        // silencioso para manter a UI
    } finally {
        setSavingName(false);
    }
};

    useEffect(() => {
        let active = true;
        const loadHeader = async () => {
            try {
                if (channelName || channelType) {
                    const title = channelName ?? (channelType === 'team' ? 'Canal da Equipe' : '');
                    const subtitle = channelType === 'team' ? 'Equipe' : 'Privado';
                    if (active) { setHeaderTitle(title); setHeaderSubtitle(subtitle); setIsDirect(channelType === 'dm'); }
                    // Mesmo com props, buscamos membros para exibir nomes em mensagens de grupo
                    try {
                        const { data: ch } = await supabase
                            .from('chat_channels')
                            .select('member_ids')
                            .eq('id', channelId)
                            .single();
                        if (active) setChannelMemberIds((ch as any)?.member_ids || []);
                    } catch {}
                    return;
                }
                const { data, error } = await supabase
                    .from('chat_channels')
                    .select('type,name,member_ids')
                    .eq('id', channelId)
                    .single();
                if (error) throw error;
                let title = (data as any)?.name || '';
                const type = (data as any)?.type as 'dm' | 'team' | undefined;
                const subtitle = type === 'team' ? 'Equipe' : 'Privado';
                if (active) setChannelMemberIds(Array.isArray((data as any)?.member_ids) ? (data as any).member_ids : []);
                if (type === 'dm') {
                    const members: string[] = Array.isArray((data as any)?.member_ids) ? (data as any).member_ids : [];
                    const otherId = members.find((id) => id !== user?.id);
                    if (otherId) {
                        if (active) setOtherUserId(otherId);
                        let nome: string | null = null;
                        let email: string | null = null;
                        try {
                            const { data: profile, error: pErr } = await supabase
                                .from('user_profiles')
                                .select('id,nome,email')
                                .eq('id', otherId)
                                .single();
                            if (!pErr && profile) { nome = (profile as any).nome; email = (profile as any).email; }
                        } catch {}
                        if (!nome && !email && organizationId) {
                            try {
                                const { data: mems } = await supabase
                                    .rpc('search_org_members', { p_org_id: organizationId, p_term: null, p_limit: 200 });
                                const found = (mems as any[])?.find((u) => u.id === otherId);
                                nome = (found as any)?.nome ?? null; email = (found as any)?.email ?? null;
                            } catch {}
                        }
                        title = nome || email || '';
                        if (active) setOtherUserName(title);
                    }
                }
                if (active) {
                    setHeaderTitle(title || (type === 'team' ? 'Canal da Equipe' : ''));
                    setHeaderSubtitle(subtitle);
                    setIsDirect(type === 'dm');
                }
            } catch {
                if (active) {
                    const fallbackType = channelType === 'team' ? 'Equipe' : 'Privado';
                    setHeaderTitle(channelName ?? '');
                    setHeaderSubtitle(fallbackType);
                    setIsDirect((channelType ?? 'dm') === 'dm');
                }
            }
        };
        loadHeader();
        return () => { active = false; };
    }, [channelId, channelName, channelType, user, organizationId]);

    // Carregar membros do canal quando channelId mudar (garantia adicional)
    useEffect(() => {
        let active = true;
        (async () => {
            try {
                const { data: ch } = await supabase
                    .from('chat_channels')
                    .select('member_ids')
                    .eq('id', channelId)
                    .single();
                if (active) setChannelMemberIds((ch as any)?.member_ids || []);
            } catch {}
        })();
        return () => { active = false; };
    }, [channelId]);

    // Resolver nomes dos remetentes para exibição em chats de equipe
    useEffect(() => {
        const ids = new Set<string>();
        channelMemberIds.forEach(id => ids.add(id));
        messages.forEach(m => ids.add(m.sender_id));
        const toFetch = Array.from(ids).filter((id) => !memberNames[id]);
        if (!toFetch.length) return;
        let active = true;
        (async () => {
            try {
                const { data, error } = await supabase
                    .from('user_profiles')
                    .select('id,nome,email')
                    .in('id', toFetch);
                if (!error && data) {
                    const map: Record<string, string> = {};
                    (data as any[]).forEach((p) => { map[p.id] = p.nome || p.email || 'Membro'; });
                    if (active) setMemberNames(prev => ({ ...prev, ...map }));
                    return;
                }
            } catch {}
            // Fallback usando RPC da organização
            try {
                if (organizationId) {
                    const { data: mems } = await supabase
                        .rpc('search_org_members', { p_org_id: organizationId, p_term: null, p_limit: 200 });
                    const map: Record<string, string> = {};
                    (mems as any[]).forEach((u) => { if (ids.has(u.id)) map[u.id] = u.nome || u.email || 'Membro'; });
                    if (active) setMemberNames(prev => ({ ...prev, ...map }));
                }
            } catch {}
        })();
        return () => { active = false; };
    }, [channelMemberIds, messages, organizationId]);

    // Indicador visual de nova mensagem
    useEffect(() => {
        if (!messages.length) return;
        const last = messages[messages.length - 1];
        const prevId = lastMessageIdRef.current;
        if (!prevId) {
            lastMessageIdRef.current = last.id;
            return;
        }
        if (last.id !== prevId) {
            lastMessageIdRef.current = last.id;
            if (!user || last.sender_id !== user.id) {
                setHasNewIndicator(true);
                const t = setTimeout(() => setHasNewIndicator(false), 4000);
                return () => clearTimeout(t);
            }
        }
    }, [messages, user]);

    useEffect(() => {
        const handler = (ev: any) => {
            const detail = ev?.detail || {};
            const msg = detail?.message || {};
            if (detail?.channelId === channelId) {
                // Se não está no final e a mensagem não é própria, incrementar
                if (!isAtBottom && (!user || msg?.sender_id !== user.id)) {
                    setUnreadCount((c) => c + 1);
                    setHasNewIndicator(true);
                }
                // Esconder indicador depois de um curto período, mas manter contador até o usuário rolar
                const t = setTimeout(() => setHasNewIndicator(false), 4000);
                return () => clearTimeout(t);
            }
        };
        window.addEventListener('chat:message-received', handler as any);
        return () => { window.removeEventListener('chat:message-received', handler as any); };
    }, [channelId, isAtBottom, user]);

    // Ao mudar canal, resetar não lidas e indicador e persistir leitura
    useEffect(() => {
        setUnreadCount(0);
        setIsAtBottom(true);
        setHasNewIndicator(false);
        (async () => {
            try { await supabase.rpc('mark_channel_read', { p_channel_id: channelId }); } catch {}
        })();
    }, [channelId]);

    // Emitir mudanças de não lidas do canal ativo para agregação/persistência
    useEffect(() => {
        window.dispatchEvent(new CustomEvent('chat:active-unread-changed', { detail: { channelId, count: unreadCount } }));
    }, [channelId, unreadCount]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const el = e.currentTarget;
        const nearBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 8;
        setIsAtBottom(nearBottom);
        if (nearBottom) {
            setHasNewIndicator(false);
            setUnreadCount(0);
            (async () => {
                try { await supabase.rpc('mark_channel_read', { p_channel_id: channelId }); } catch {}
            })();
        }
    };

    // Ao mudar de canal, resetar contador
    useEffect(() => { setUnreadCount(0); setIsAtBottom(true); setHasNewIndicator(false); }, [channelId]);

return (
    <Card className="flex flex-col h-full w-full border-none shadow-none">
        <header className="flex items-center justify-between p-3 border-b bg-white">
            <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center text-white relative">
                    <User className="w-5 h-5" />
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full ring-2 ring-white"></span>
                </div>
                <div className="flex items-center gap-2">
                    {!editingName ? (
                        <div>
                            <h2 className="text-base font-semibold text-gray-900">{isDirect ? (otherUserName || headerTitle || '') : (headerTitle || channelName || 'Canal da Equipe')}</h2>
                            <p className="text-xs text-gray-600">{headerSubtitle || (channelType === 'team' ? 'Equipe' : 'Privado')}</p>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <Input className="h-8 w-56" value={pendingName} onChange={(e) => setPendingName(e.target.value)} autoFocus />
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={saveChannelName} disabled={savingName}><Check className="w-4 h-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingName(false)}><X className="w-4 h-4" /></Button>
                        </div>
                    )}
                    {!isDirect && !editingName && (
                        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setPendingName(headerTitle || channelName || ''); setEditingName(true); }}>
                            <Pencil className="w-4 h-4 text-gray-600" />
                        </Button>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2">
                {(hasNewIndicator || unreadCount > 0) && (
                    <div className="flex items-center gap-1">
                        <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Nova</span>
                        {unreadCount > 0 && (
                            <span className="text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded-full min-w-[18px] text-center">{unreadCount}</span>
                        )}
                    </div>
                )}
            </div>
        </header>

<div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50">
                {hasMore && (
                    <div className="flex justify-center">
                        <Button variant="outline" size="sm" onClick={loadOlder}>Carregar anteriores</Button>
                    </div>
                )}
                {messages.map((m) => {
                    const isSelf = !!user && m.sender_id === user.id;
                    const displayName = isDirect ? (isSelf ? 'Você' : (otherUserName || 'Contato')) : (isSelf ? 'Você' : (memberNames[m.sender_id] || 'Membro'));
                    const body = (m.attachment_path && !m.content) ? (
                        <span className="text-sm text-blue-700">[Anexo enviado]</span>
                    ) : (
                        <span className="text-sm">{highlightContent(m.content)}</span>
                    );
                    return (
                        <div key={m.id} className={`flex mb-1.5 ${isSelf ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[70%] sm:max-w-[65%] md:max-w-[60%] p-2 rounded-xl shadow-sm ${isSelf ? 'bg-purple-600 text-white rounded-br-none' : 'bg-gray-200 text-gray-800 rounded-tl-none'}`}>
                                {!isDirect && (
                                  <span className={`block text-[10px] font-medium mb-0.5 ${isSelf ? 'text-purple-100' : 'text-gray-600'}`}>
                                      {displayName}
                                  </span>
                                )}
                                {body}
                                <span className={`block mt-0.5 text-[10px] ${isSelf ? 'text-purple-100/80' : 'text-gray-500'} text-right`}>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        </div>
                    );
                })}
                {typingUsers.length > 0 && (
                    <div className="flex items-center gap-2 pl-2">
                        <div className="flex items-center justify-center w-7 h-5 rounded-full bg-gray-200 text-gray-600">
                            <span className="animate-pulse">•••</span>
                        </div>
                        <span className="text-[10px] text-gray-500">Digitando...</span>
                    </div>
                )}
                <div ref={bottomRef} />
            </div>

            <footer className="p-3 border-t bg-white">
                <form onSubmit={handleSend} className="flex items-center space-x-2">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button type="button" variant="ghost" size="icon" className="text-gray-500 hover:bg-gray-100 h-9 w-9">
                                <Smile className="w-4 h-4" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 p-2">
                            <div className="space-y-2">
                                {emojiCategories.map(cat => (
                                    <div key={cat.label}>
                                        <div className="text-[11px] text-gray-500 mb-1">{cat.label}</div>
                                        <div className="grid grid-cols-8 gap-1">
                                            {cat.emojis.map(em => (
                                                <button
                                                    key={em}
                                                    type="button"
                                                    className="h-7 w-7 flex items-center justify-center rounded hover:bg-gray-100"
                                                    onClick={() => {
                                                        setMessageInput(prev => (prev + em));
                                                        const now = Date.now();
                                                        if (now - (lastTypingSentRef.current || 0) > 300) {
                                                            lastTypingSentRef.current = now;
                                                            emitTyping();
                                                        }
                                                    }}
                                                >{em}</button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </PopoverContent>
                    </Popover>
                    <Popover open={showCmdPopover} onOpenChange={setShowCmdPopover}>
                        <PopoverAnchor asChild>
                            <Input
                                className="flex-1 h-10 rounded-full px-5 bg-gray-100 border-gray-200 focus:border-purple-500 transition-colors text-sm"
                        placeholder="Escreva uma mensagem... Use # para módulos, @ para mencionar"
                        value={messageInput}
                        onChange={(e) => {
                            const val = e.target.value;
                            const prevHadText = messageInput.trim().length > 0;
                            setMessageInput(val);
                            const now = Date.now();
                            if (val.trim().length > 0) {
                                if (now - (lastTypingSentRef.current || 0) > 300) {
                                    lastTypingSentRef.current = now;
                                    emitTyping();
                                }
                            } else if (prevHadText) {
                                emitTypingStop();
                            }
                            if (cmdMode) {
                                const match = cmdMode === 'module' ? /#([^\s]*)$/ : /@([^\s]*)$/;
                                const m = val.match(match);
                                setCmdQuery(m ? m[1] || '' : '');
                            }
                        }}
                        onFocus={() => {
                            if (messageInput.trim().length > 0) {
                                const now = Date.now();
                                if (now - (lastTypingSentRef.current || 0) > 300) {
                                    lastTypingSentRef.current = now;
                                    emitTyping();
                                }
                            }
                        }}
                        onBlur={() => { emitTypingStop(); }}
                        onKeyDown={() => {
                            if (messageInput.trim().length > 0) {
                                const now = Date.now();
                                if (now - (lastTypingSentRef.current || 0) > 300) {
                                    lastTypingSentRef.current = now;
                                    emitTyping();
                                }
                            }
                        }}
                            />
                        </PopoverAnchor>
                        <PopoverContent className="w-72 p-2" side="top" align="start">
                            {cmdMode === 'module' ? (
                                <div className="space-y-2">
                                    <div className="text-[11px] text-gray-500">Módulos</div>
                                    <div className="max-h-40 overflow-auto">
                                        {modules
                                            .map(m => ({ id: m.id }))
                                            .filter(m => m.id.toLowerCase().includes((cmdQuery || '').toLowerCase()))
                                            .map(m => (
                                                <button key={m.id} type="button" className="w-full text-left px-2 py-1 rounded hover:bg-gray-100 text-sm flex items-center justify-between"
                                                    onClick={async () => {
                                                        setSelectedModule(m.id);
                                                        setModuleLoading(true);
                                                        try {
                                                            let items: any[] = [];
                                                            if (m.id === 'Pedidos') {
                                                                const { data } = await (supabase as any)
                                                                    .from('marketplace_orders_presented')
                                                                    .select('id, marketplace_order_id, customer_name, created_at, order_total')
                                                                    .order('created_at', { ascending: false })
                                                                    .limit(10);
                                                                items = (data as any[]) || [];
                                                            } else if (m.id === 'Produtos') {
                                                                const { data } = await (supabase as any)
                                                                    .from('products')
                                                                    .select('id, name, sku, price, stock')
                                                                    .order('updated_at', { ascending: false })
                                                                    .limit(10);
                                                                items = (data as any[]) || [];
                                                            } else if (m.id === 'Anúncios') {
                                                                const { data } = await (supabase as any)
                                                                    .from('marketplace_items_unified')
                                                                    .select('id, title, sku, price, available_quantity, marketplace_item_id')
                                                                    .order('updated_at', { ascending: false })
                                                                    .limit(10);
                                                                items = (data as any[]) || [];
                                                            } else if (m.id === 'NotasFiscais') {
                                                                const { data } = await (supabase as any)
                                                                    .from('notas_fiscais')
                                                                    .select('id, nfe_number, nfe_key, status, emission_date')
                                                                    .order('emission_date', { ascending: false })
                                                                    .limit(10);
                                                                items = (data as any[]) || [];
                                                            }
                                                            setModuleItems(items);
                                                        } catch {
                                                            setModuleItems([]);
                                                        } finally {
                                                            setModuleLoading(false);
                                                        }
                                                    }}
                                                >
                                                    <span>{m.id}</span>
                                                    {m.id === 'Pedidos' ? (
                                                      selectedModule === 'Pedidos' ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />
                                                    ) : null}
                                                </button>
                                            ))}
                                    </div>
                                    {selectedModule && (
                                        <div className="border-t pt-2">
                                            <div className="text-[11px] text-gray-500 mb-1 flex items-center gap-1">
                                                <span>{selectedModule}</span>
                                                <ChevronDown className="w-3 h-3 text-gray-400" />
                                            </div>
                                            <div className="max-h-40 overflow-auto space-y-1">
                                                {moduleLoading ? (
                                                    <div className="text-xs text-gray-500">Carregando...</div>
                                                ) : (
                                                    moduleItems.length ? moduleItems.map((it: any) => (
                                                        <button key={it.id} type="button" className="w-full text-left px-2 py-1 rounded hover:bg-gray-100 text-xs"
                                                            onClick={() => {
                                                                const label = selectedModule === 'Pedidos'
                                                                    ? (it.marketplace_order_id || it.id)
                                                                    : selectedModule === 'Produtos'
                                                                    ? (it.sku || it.name || it.id)
                                                                    : selectedModule === 'Anúncios'
                                                                    ? (it.sku || it.title || it.marketplace_item_id || it.id)
                                                                    : (it.nfe_number || it.nfe_key || it.id);
                                                                const token = `#${selectedModule}:${label}`;
                                                                setMessageInput(prev => prev.replace(/#$/, '') + token + ' ');
                                                                setShowCmdPopover(false);
                                                                setCmdMode(null);
                                                                setSelectedModule(null);
                                                                setModuleItems([]);
                                                            }}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <span className="truncate">
                                                                    {selectedModule === 'Pedidos' && `${it.marketplace_order_id || it.id} — ${it.customer_name || ''}`}
                                                                    {selectedModule === 'Produtos' && `${it.sku || it.name || it.id}`}
                                                                    {selectedModule === 'Anúncios' && `${it.sku || it.title || it.marketplace_item_id || it.id}`}
                                                                    {selectedModule === 'NotasFiscais' && `${it.nfe_number || ''} ${it.nfe_key ? '— ' + String(it.nfe_key).slice(0,12)+'...' : ''}`}
                                                                </span>
                                                                <span className="text-[10px] text-gray-500">Selecionar</span>
                                                            </div>
                                                        </button>
                                                    )) : (
                                                        <div className="text-xs text-gray-500">Nenhum item</div>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : cmdMode === 'mention' ? (
                                <MentionList query={cmdQuery} onSelect={(u) => {
                                    const token = `@${u.nome || u.email || u.id}`;
                                    setMessageInput(prev => prev.replace(/@$/, '') + token + ' ');
                                    setShowCmdPopover(false);
                                    setCmdMode(null);
                                }} />
                            ) : null}
                        </PopoverContent>
                    </Popover>
                    <Button type="submit" className="w-10 h-10 rounded-full bg-purple-600 hover:bg-purple-700" size="icon" disabled={!messageInput.trim() || sending}>
                        <Send className="w-4 h-4" />
                    </Button>
                </form>
            </footer>

            
        </Card>
    );
};

// Lista de menções (@) com busca pelos membros da organização
const MentionList: React.FC<{ query: string; onSelect: (u: { id: string; nome?: string | null; email?: string | null }) => void }>
  = ({ query, onSelect }) => {
    const { results } = useOrgMemberSearch(query, { alwaysList: true });
    return (
      <div className="space-y-2">
        <div className="text-[11px] text-gray-500">Mencionar</div>
        <div className="max-h-40 overflow-auto">
          {results.length ? results.map((u) => (
            <button key={u.id} type="button" className="w-full text-left px-2 py-1 rounded hover:bg-gray-100 text-sm"
              onClick={() => onSelect(u)}>
              {u.nome || u.email || u.id}
            </button>
          )) : (
            <div className="text-xs text-gray-500">Nenhum membro</div>
          )}
        </div>
      </div>
    );
  };
