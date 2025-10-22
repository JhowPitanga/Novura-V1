import { useState, useMemo, useRef, useEffect } from 'react';
import { User, Send, Paperclip, Smile, MoreVertical, Phone, Video, Hash, AtSign } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useChannelMessages } from "@/hooks/useChat";
import { CommandDialog, Command, CommandGroup, CommandItem, CommandInput, CommandList, CommandEmpty } from "@/components/ui/command";

type ChatTabProps = { channelId: string; channelName?: string; channelType?: 'dm' | 'team' };

function highlightContent(text: string) {
    const parts = text.split(/(\s+)/);
    return parts.map((part, idx) => {
        if (part.startsWith('@') || part.startsWith('#')) {
            return <span key={idx} className="text-purple-700 font-semibold">{part}</span>;
        }
        return <span key={idx}>{part}</span>;
    });
}

export const ChatTab: React.FC<ChatTabProps> = ({ channelId, channelName, channelType }) => {
    const { messages, sendMessage, sending, loadOlder, hasMore, uploadAttachment } = useChannelMessages(channelId);
    const [messageInput, setMessageInput] = useState('');
    const [showCommand, setShowCommand] = useState(false);
    const [selectedModule, setSelectedModule] = useState<string | null>(null);
    const [moduleDetail, setModuleDetail] = useState('');
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        // Open command modal when user types '#'
        if (messageInput.endsWith('#')) {
            setShowCommand(true);
        }
    }, [messageInput]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        const content = messageInput.trim();
        if (!content) return;
        await sendMessage(content);
        setMessageInput('');
    };

    const handleFilePick = () => fileInputRef.current?.click();
    const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        await uploadAttachment(channelId, f);
        e.target.value = '';
    };

    const modules = useMemo(() => ([
        { id: 'Produtos', hint: 'Digite o SKU' },
        { id: 'Pedidos', hint: 'Digite o número do pedido' },
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

    return (
        <Card className="flex flex-col h-full w-full border-none shadow-none">
            <header className="flex items-center justify-between p-4 border-b bg-white">
                <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center text-white relative">
                        <User className="w-6 h-6" />
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full ring-2 ring-white"></span>
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">{channelName || (channelType === 'team' ? 'Canal da Equipe' : 'Mensagem Direta')}</h2>
                        <p className="text-sm text-gray-600">{channelType === 'team' ? 'Equipe' : 'Privado'}</p>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    <Button variant="ghost" size="icon" className="text-gray-600 hover:bg-gray-100">
                        <Phone className="w-5 h-5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-gray-600 hover:bg-gray-100">
                        <Video className="w-5 h-5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-gray-600 hover:bg-gray-100">
                        <MoreVertical className="w-5 h-5" />
                    </Button>
                </div>
            </header>

            <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-gray-50">
                {hasMore && (
                    <div className="flex justify-center">
                        <Button variant="outline" size="sm" onClick={loadOlder}>Carregar anteriores</Button>
                    </div>
                )}
                {messages.map((m) => {
                    const isSelf = false; // sender highlighting could use auth context
                    const body = (m.attachment_path && !m.content) ? (
                        <span className="text-sm text-blue-700">[Anexo enviado]</span>
                    ) : (
                        <span className="text-sm">{highlightContent(m.content)}</span>
                    );
                    return (
                        <div key={m.id} className={`flex mb-2 ${isSelf ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-xs lg:max-w-md p-3 rounded-xl shadow-sm ${isSelf ? 'bg-purple-600 text-white rounded-br-none' : 'bg-gray-200 text-gray-800 rounded-tl-none'}`}>
                                {body}
                                <span className={`block mt-1 text-xs ${isSelf ? 'text-purple-100/80' : 'text-gray-500'} text-right`}>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            <footer className="p-4 border-t bg-white">
                <form onSubmit={handleSend} className="flex items-center space-x-3">
                    <input ref={fileInputRef} type="file" className="hidden" accept="image/*,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onFileChange} />
                    <Button type="button" variant="ghost" size="icon" className="text-gray-500 hover:bg-gray-100" onClick={handleFilePick}>
                        <Paperclip className="w-5 h-5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="text-gray-500 hover:bg-gray-100">
                        <Smile className="w-5 h-5" />
                    </Button>
                    <Input
                        className="flex-1 h-12 rounded-full px-6 bg-gray-100 border-gray-200 focus:border-purple-500 transition-colors"
                        placeholder="Escreva uma mensagem... Use # para módulos, @ para mencionar"
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                    />
                    <Button type="submit" className="w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-700" size="icon" disabled={!messageInput.trim() || sending}>
                        <Send className="w-5 h-5" />
                    </Button>
                </form>
            </footer>

            <CommandDialog open={showCommand} onOpenChange={setShowCommand}>
                <Command>
                    {!selectedModule ? (
                        <>
                            <CommandInput placeholder="Escolha um módulo (Produtos, Pedidos, Notas Fiscais)" />
                            <CommandList>
                                <CommandEmpty>Nenhum módulo encontrado</CommandEmpty>
                                <CommandGroup heading="Módulos">
                                    {modules.map((m) => (
                                        <CommandItem key={m.id} onSelect={() => setSelectedModule(m.id)}>
                                            <Hash className="w-4 h-4 mr-2" /> {m.id}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </>
                    ) : (
                        <div className="p-3 space-y-3">
                            <div className="text-sm">{selectedModule} — informe o detalhe</div>
                            <Input value={moduleDetail} onChange={(e) => setModuleDetail(e.target.value)} placeholder={modules.find(m => m.id === selectedModule)?.hint || 'Detalhe'} />
                            <div className="flex justify-end space-x-2">
                                <Button variant="outline" onClick={() => { setSelectedModule(null); setModuleDetail(''); }}>Voltar</Button>
                                <Button onClick={applyModuleShortcut}>Inserir</Button>
                            </div>
                        </div>
                    )}
                </Command>
            </CommandDialog>
        </Card>
    );
};