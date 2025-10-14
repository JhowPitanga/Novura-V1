
import { useState } from "react";
import { Send, Hash, Users, Settings, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

const teamGroups = [
  { id: "logistica", name: "Logística", members: 8, unread: 3, color: "bg-blue-500" },
  { id: "comercial", name: "Comercial", members: 12, unread: 0, color: "bg-green-500" },
  { id: "marketing", name: "Marketing", members: 6, unread: 7, color: "bg-purple-500" },
  { id: "financeiro", name: "Financeiro", members: 4, unread: 1, color: "bg-yellow-500" },
  { id: "geral", name: "Geral", members: 30, unread: 2, color: "bg-gray-500" },
];

const mockMessages = [
  { id: 1, user: "Ana Silva", message: "Pedido #PED123 pronto para coleta", time: "14:30", avatar: "AS" },
  { id: 2, user: "Carlos Lima", message: "Estoque do iPhone baixo - 5 unidades", time: "14:25", avatar: "CL" },
  { id: 3, user: "Marina Costa", message: "Cliente perguntou sobre prazo de entrega", time: "14:20", avatar: "MC" },
];

export function TeamChat() {
  const [selectedGroup, setSelectedGroup] = useState("logistica");
  const [message, setMessage] = useState("");

  const currentGroup = teamGroups.find(g => g.id === selectedGroup);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-gray-100/60">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Chat da Equipe</h3>
          <Button variant="ghost" size="sm">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
        
        {/* Group Selector */}
        <div className="flex space-x-2 overflow-x-auto pb-2">
          {teamGroups.map((group) => (
            <button
              key={group.id}
              onClick={() => setSelectedGroup(group.id)}
              className={`flex items-center space-x-2 px-3 py-2 rounded-xl text-sm whitespace-nowrap transition-all ${
                selectedGroup === group.id
                  ? "bg-gradient-to-r from-novura-primary to-purple-600 text-white shadow-lg"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${group.color}`}></div>
              <Hash className="w-3 h-3" />
              <span>{group.name}</span>
              {group.unread > 0 && (
                <Badge variant="destructive" className="h-5 w-5 text-xs p-0 flex items-center justify-center">
                  {group.unread}
                </Badge>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Current Group Info */}
      <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-purple-50/30 border-b border-gray-100/60">
        <div className="flex items-center space-x-3">
          <div className={`w-3 h-3 rounded-full ${currentGroup?.color}`}></div>
          <span className="font-medium text-gray-900">#{currentGroup?.name}</span>
          <Badge variant="outline" className="text-xs">
            <Users className="w-3 h-3 mr-1" />
            {currentGroup?.members}
          </Badge>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4">
        {mockMessages.map((msg) => (
          <div key={msg.id} className="flex items-start space-x-3">
            <div className="w-8 h-8 bg-gradient-to-br from-novura-primary to-purple-600 rounded-lg flex items-center justify-center text-white text-xs font-medium">
              {msg.avatar}
            </div>
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-1">
                <span className="text-sm font-medium text-gray-900">{msg.user}</span>
                <span className="text-xs text-gray-500">{msg.time}</span>
              </div>
              <div className="bg-white border border-gray-100/60 rounded-xl px-4 py-2 shadow-sm">
                <p className="text-sm text-gray-700">{msg.message}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Message Input */}
      <div className="p-6 border-t border-gray-100/60 bg-gradient-to-r from-gray-50/50 to-white">
        <div className="flex items-center space-x-3">
          <div className="flex-1 relative">
            <Input
              placeholder={`Mensagem para #${currentGroup?.name}...`}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="pr-12 bg-white border-gray-200 rounded-xl"
              onKeyPress={(e) => e.key === 'Enter' && message.trim() && setMessage('')}
            />
            <Button
              size="sm"
              className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-gradient-to-r from-novura-primary to-purple-600 hover:from-novura-primary/90 hover:to-purple-600/90 rounded-lg h-7 w-7 p-0"
              onClick={() => message.trim() && setMessage('')}
            >
              <Send className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
