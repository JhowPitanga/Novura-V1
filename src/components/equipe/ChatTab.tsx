import { useState } from 'react';
import { User, Send, Paperclip, Smile, MoreVertical, Phone, Video, Search } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

// Mock data for the active chat conversation
const mockChat = {
    name: "Fushiguro Megumi",
    status: "online",
    role: "Desenvolvedor Backend",
    messages: [
        { id: 1, text: "Oi Ana, tudo bem? O endpoint de autenticação está instável. Você consegue dar uma olhada?", sender: "other", time: "10:30" },
        { id: 2, text: "Vou verificar agora. Parece que é um problema de cache no lado do servidor.", sender: "self", time: "10:32" },
        { id: 3, text: "Obrigado! Fico no aguardo.", sender: "other", time: "10:35" },
        { id: 4, text: "Anexo: [auth-log-01.txt] | Já subi o fix. Por favor, faça o deploy para o ambiente de staging.", sender: "self", time: "10:45" },
    ]
};

// Componente individual da Mensagem
interface MessageProps {
    message: typeof mockChat.messages[0];
    isSelf: boolean;
}

const ChatMessage: React.FC<MessageProps> = ({ message, isSelf }) => (
    <div className={`flex mb-4 ${isSelf ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-xs lg:max-w-md p-3 rounded-xl shadow-sm ${isSelf 
            ? 'bg-purple-600 text-white rounded-br-none' 
            : 'bg-gray-200 text-gray-800 rounded-tl-none'
        }`}>
            <p className="text-sm">{message.text}</p>
            <span className={`block mt-1 text-xs ${isSelf ? 'text-purple-100/80' : 'text-gray-500'} text-right`}>
                {message.time}
            </span>
        </div>
    </div>
);

// Componente Principal: ChatTab
export const ChatTab: React.FC = () => {
    const [messageInput, setMessageInput] = useState('');

    const handleSendMessage = (e: React.FormEvent) => {
        e.preventDefault();
        if (messageInput.trim()) {
            console.log("Mensagem enviada:", messageInput);
            // Lógica para enviar a mensagem (adicionar ao estado mockado ou chamar API)
            setMessageInput('');
        }
    };

    if (!mockChat.name) {
        // Estado inicial, quando nenhuma conversa foi selecionada na sidebar
        return (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 p-8 bg-gray-50/50 rounded-lg border-2 border-dashed border-gray-200">
                <MessageSquare className="w-12 h-12 text-purple-400 mb-4" />
                <h3 className="text-xl font-semibold text-gray-700">Comece a Conversar</h3>
                <p className="mt-2 text-sm max-w-sm">
                    Selecione uma **Mensagem Direta** ou um **Canal/Equipe** na barra lateral para abrir a conversa.
                </p>
            </div>
        );
    }

    return (
        <Card className="flex flex-col h-full w-full border-none shadow-none">
            {/* Cabeçalho da Conversa (Design limpo e focado) */}
            <header className="flex items-center justify-between p-4 border-b bg-white">
                <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center text-white relative">
                        <User className="w-6 h-6" />
                        {/* Indicador de Status Online */}
                        <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full ring-2 ring-white"></span>
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">{mockChat.name}</h2>
                        <p className="text-sm text-gray-600">{mockChat.role}</p>
                    </div>
                </div>
                {/* Ações de Chamada/Configuração */}
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

            {/* Corpo das Mensagens (Rolável) */}
            <div className="flex-1 overflow-y-auto p-6 space-y-3 bg-gray-50">
                {mockChat.messages.map(msg => (
                    <ChatMessage 
                        key={msg.id} 
                        message={msg} 
                        isSelf={msg.sender === 'self'} 
                    />
                ))}
            </div>

            {/* Área de Input da Mensagem */}
            <footer className="p-4 border-t bg-white">
                <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
                    <Button type="button" variant="ghost" size="icon" className="text-gray-500 hover:bg-gray-100">
                        <Paperclip className="w-5 h-5" /> {/* Anexos */}
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="text-gray-500 hover:bg-gray-100">
                        <Smile className="w-5 h-5" /> {/* Emojis */}
                    </Button>
                    
                    <Input
                        className="flex-1 h-12 rounded-full px-6 bg-gray-100 border-gray-200 focus:border-purple-500 transition-colors"
                        placeholder="Escreva uma mensagem..."
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                    />
                    
                    <Button type="submit" className="w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-700" size="icon" disabled={!messageInput.trim()}>
                        <Send className="w-5 h-5" />
                    </Button>
                </form>
            </footer>
        </Card>
    );
};