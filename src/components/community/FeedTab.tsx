// src/components/comunidade/FeedTab.tsx

import React from 'react';
// Importe seus componentes de UI. Ajuste os caminhos conforme sua estrutura.
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { User as UserIcon } from 'lucide-react';

// Importe o PostCard, que listará as postagens
import { PostCard } from '@/components/comunidade/PostCard'; 
// Importe as tipagens que definimos
import { Post, User } from '@/components/comunidade/types'; 

interface FeedTabProps {
    onOpenCreatePost: () => void; // Função passada pelo Comunidade.tsx para abrir o modal
}

// Usuário atual (Ajuste conforme o seu contexto de autenticação)
const currentUser: User = {
    id: 'u1',
    username: 'vendedor_novura',
    name: 'Vendedor Novura',
    avatarUrl: '', // sem foto para testar fallback
};

// Perfil oficial da Novura (para as publicações solicitadas)
const novuraUser: User = {
    id: 'novura',
    username: 'novura',
    name: 'Novura ERP',
    avatarUrl: '',
    isVerified: true,
};

// 3 novas publicações do perfil Novura
const mockPosts: Post[] = [
    {
        id: 'p-novura-1',
        user: novuraUser,
        timestamp: '04 de setembro de 2025 às 14:00',
        title: 'Atualização do sistema: nova funcionalidade liberada',
        text: 'Lançamos uma nova funcionalidade que melhora a visualização de KPIs no painel. Agora você pode acompanhar métricas em tempo real com filtros avançados e design roxo NOVURA.',
        mediaUrl: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=60',
        mediaType: 'image',
        likes: 1200,
        commentsCount: 24,
        comments: [
          { id: 'c1', user: novuraUser, content: 'Recurso muito aguardado! 👏', timestamp: '04 de setembro de 2025 às 14:15', likes: 32 },
          { id: 'c2', user: { id:'u2', username:'loja_xyz', name:'Loja XYZ', avatarUrl:'', isVerified:true }, content: 'Ajudará bastante no dia a dia, parabéns equipe!', timestamp: '04 de setembro de 2025 às 14:30', likes: 21 },
          { id: 'c3', user: { id:'u3', username:'maria', name:'Maria', avatarUrl:'' }, content: 'Podem mostrar um exemplo de filtro avançado?', timestamp: '04 de setembro de 2025 às 14:45', likes: 12 },
          { id: 'c4', user: { id:'u4', username:'joao', name:'João', avatarUrl:'' }, content: 'Testei aqui e ficou ótimo!', timestamp: '04 de setembro de 2025 às 15:05', likes: 8 }
        ],
        shareCount: 8,
    },
    {
        id: 'p-novura-2',
        user: novuraUser,
        timestamp: '05 de setembro de 2025 às 09:30',
        title: 'Shopee: atualização de logística e prazos',
        text: 'A Shopee anunciou ajustes nos prazos de coleta e SLA de entrega para alguns centros logísticos. Recomendamos revisar suas regras de despacho e etiquetagem. Veja um galpão em operação como referência.',
        mediaUrl: 'https://images.unsplash.com/photo-1556761175-4b46a572b786?auto=format&fit=crop&w=1200&q=60',
        mediaType: 'image',
        likes: 980,
        commentsCount: 36,
        comments: [
          { id: 'c5', user: { id:'u5', username:'lojistaA', name:'Lojista A', avatarUrl:'' }, content: 'Valeu pelo aviso! Vou ajustar o despacho.', timestamp: '05 de setembro de 2025 às 09:45', likes: 19 },
          { id: 'c6', user: { id:'u6', username:'market', name:'Market Pro', avatarUrl:'', isVerified:true }, content: 'Importante observar o SLA na alta demanda.', timestamp: '05 de setembro de 2025 às 10:02', likes: 11 },
          { id: 'c7', user: { id:'u7', username:'ana', name:'Ana', avatarUrl:'' }, content: 'Alguma mudança na etiquetagem?', timestamp: '05 de setembro de 2025 às 10:20', likes: 7 }
        ],
        shareCount: 12,
    },
    {
        id: 'p-novura-3',
        user: novuraUser,
        timestamp: '06 de setembro de 2025 às 11:15',
        title: 'Enquete: qual nova funcionalidade você prefere?',
        text: 'Ajude a priorizar nosso roadmap! Escolha a próxima funcionalidade que você considera mais importante para o dia a dia.',
        pollOptions: [
            'Dashboard de KPIs por canal',
            'Integração nativa com marketplace (Shopee/ML)',
            'Automação de faturamento e conciliação',
        ],
        likes: 450,
        commentsCount: 18,
        comments: [
          { id: 'c8', user: { id:'u8', username:'time_dev', name:'Time Dev', avatarUrl:'' }, content: 'Comentem suas prioridades!', timestamp: '06 de setembro de 2025 às 11:20', likes: 5 },
          { id: 'c9', user: { id:'u9', username:'carla', name:'Carla', avatarUrl:'' }, content: 'Integração nativa seria top!', timestamp: '06 de setembro de 2025 às 11:25', likes: 9 },
          { id: 'c10', user: { id:'u10', username:'rodrigo', name:'Rodrigo', avatarUrl:'' }, content: 'KPIs por canal me ajudariam muito.', timestamp: '06 de setembro de 2025 às 11:28', likes: 6 }
        ],
        shareCount: 5,
    },
];

export const FeedTab: React.FC<FeedTabProps> = ({ onOpenCreatePost }) => {
    return (
        <div className="max-w-2xl mx-auto px-4 space-y-6">
            {/* 1. Área de Criação de Postagem */}
            <Card className="p-4 shadow-md rounded-lg">
                <div className="flex items-center space-x-3">
                    <Avatar className="w-10 h-10">
                        <AvatarImage src={currentUser.avatarUrl} alt={currentUser.name} />
                        <AvatarFallback>
                            <UserIcon className="w-5 h-5 text-gray-400" />
                        </AvatarFallback>
                    </Avatar>
                    <button
                        onClick={onOpenCreatePost}
                        className="flex-1 text-left bg-gray-100 text-gray-500 py-2.5 px-4 rounded-full transition duration-150 ease-in-out hover:bg-gray-200 focus:outline-none"
                    >
                        No que você está pensando, {currentUser.name.split(' ')[0]}?
                    </button>
                </div>
            </Card>

            {/* 2. Filtros do Feed (Opcional) */}
            <div className="flex items-center justify-between border-b pb-2">
                <h3 className="text-lg font-semibold text-gray-800">Postagens Recentes</h3>
                <select className="text-sm border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500">
                    <option>Todos os NOVURADORES</option>
                    <option>Meus Grupos</option>
                    <option>Mais Populares</option>
                </select>
            </div>

            {/* 3. Lista de Postagens (Loop) */}
            <div className="space-y-6">
                {mockPosts.map(post => (
                    <PostCard key={post.id} post={post} currentUser={currentUser} />
                ))}
            </div>

            {/* 4. Carregando Mais Posts (Exemplo) */}
            <div className="text-center pt-4">
                <button className="text-purple-600 hover:text-purple-700 font-semibold transition">
                    Carregar mais publicações...
                </button>
            </div>
        </div>
    );
};