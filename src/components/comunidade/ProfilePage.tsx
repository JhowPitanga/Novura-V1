

import React from 'react';
// Ícones (Lucide como exemplo)
import { Link, Mail, Users, Ellipsis, Verified } from 'lucide-react';
// Importe seus componentes de UI.
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
// Tipagem
import { User } from '@/components/comunidade/types'; 

interface ProfilePageProps {
    user: User & { // Expansão do tipo User para incluir dados do perfil
        bio: string;
        website?: string;
        email: string;
        followingCount: number;
        novuradoresCount: number;
        bannerImage: string;
        novuradoresAvatars: string[]; // Avatares de quem está novurando
    };
    isCurrentUser: boolean; // Verifica se é o perfil do usuário logado
    isNovurando: boolean; // Verifica se o usuário logado está novurando este perfil
    handleNovurar: () => void; // Função para novurar/deixar de novurar
}

export const ProfilePage: React.FC<ProfilePageProps> = ({ 
    user, 
    isCurrentUser, 
    isNovurando, 
    handleNovurar 
}) => {
    
    const novurarButtonText = isNovurando ? 'Novurando' : 'Novurar';
    
    return (
        <div className="max-w-6xl mx-auto bg-white rounded-xl shadow-2xl mt-8">
            {/* 1. Banner e Avatar */}
            <div className="relative">
                {/* Imagem do Banner */}
                <div 
                    className="h-64 bg-cover bg-center rounded-t-xl" 
                    style={{ backgroundImage: `url(${user.bannerImage})` }}
                >
                    {/* Pode ter um botão de editar banner aqui para isCurrentUser */}
                </div>
                
                {/* Área do Avatar, Nome e Botões */}
                <div className="absolute -bottom-16 left-8 flex items-end w-[calc(100%-4rem)]">
                    <Avatar 
                        src={user.avatarUrl} 
                        alt={user.name} 
                        className="w-36 h-36 border-4 border-white rounded-full shadow-xl" 
                    />
                    
                    {/* Container para Botões e Nome */}
                    <div className="flex justify-between items-end flex-1 pl-6 pb-4">
                        <div className="mt-4">
                            <div className='flex items-center'>
                                <h1 className="text-3xl font-bold text-gray-900 mr-2">{user.name}</h1>
                                {user.isVerified && <Verified size={20} className="text-purple-600" />}
                            </div>
                            <p className="text-md text-gray-600 mt-1">@{user.username}</p>
                        </div>

                        {/* Botões de Ação */}
                        <div className="flex space-x-3">
                            {!isCurrentUser && (
                                <Button 
                                    onClick={handleNovurar} 
                                    variant={isNovurando ? 'outline' : 'default'}
                                    className={`font-semibold px-6 py-2 rounded-full transition-colors 
                                        ${isNovurando 
                                            ? 'border-purple-600 text-purple-600 hover:bg-purple-50' 
                                            : 'bg-purple-600 hover:bg-purple-700 text-white'
                                        }`
                                    }
                                >
                                    <Users size={18} className="mr-2" /> {novurarButtonText}
                                </Button>
                                // REMOVIDO: Botão de Mensagem Direta
                            )}
                            
                            {/* Botão de Opções */}
                            <Button variant="outline" className="text-gray-600 hover:bg-gray-50 p-2 h-10 w-10">
                                <Ellipsis size={20} />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
            
            {/* 2. Bio, Links e Estatísticas */}
            <div className="pt-20 px-8 pb-6">
                <p className="text-gray-700 mt-2 mb-4 whitespace-pre-wrap">{user.bio}</p>
                
                <div className="flex flex-wrap items-center space-x-4 text-sm text-gray-700">
                    {user.website && (
                        <a href={user.website} target="_blank" className="flex items-center text-purple-600 hover:underline">
                            <Link size={16} className="mr-1" /> {user.website}
                        </a>
                    )}
                    {user.email && (
                        <span className="flex items-center">
                            <Mail size={16} className="mr-1 text-gray-500" /> {user.email}
                        </span>
                    )}
                </div>
                
                {/* Contadores e Avatares de Novuradores */}
                <div className="flex items-center mt-4 text-sm text-gray-700">
                    <span className="font-bold mr-1">{user.followingCount}</span> Seguindo
                    <span className="font-bold mx-2 text-gray-400">·</span>
                    <span className="font-bold mr-1">{user.novuradoresCount}</span> Novuradores
                    
                    {/* Avatars dos Novuradores (Anexo 4) */}
                    <div className="ml-4 flex -space-x-2">
                        {user.novuradoresAvatars.map((url, index) => (
                            <Avatar 
                                key={index} 
                                src={url} 
                                className="w-6 h-6 border-2 border-white shadow-sm" 
                            />
                        ))}
                    </div>
                </div>
            </div>
            
            {/* 3. Abas de Navegação */}
            <div className="mt-4 border-t border-gray-100">
                <Tabs defaultValue="posts" className="w-full">
                    <TabsList className="flex border-b border-gray-100 px-8">
                        <TabsTrigger value="posts" className="py-3 px-4 text-lg font-semibold border-b-2 border-transparent data-[state=active]:border-purple-600 data-[state=active]:text-purple-600 transition-colors">Postagens</TabsTrigger>
                        <TabsTrigger value="groups" className="py-3 px-4 text-lg font-semibold border-b-2 border-transparent data-[state=active]:border-purple-600 data-[state=active]:text-purple-600 transition-colors">Grupos</TabsTrigger>
                        <TabsTrigger value="events" className="py-3 px-4 text-lg font-semibold border-b-2 border-transparent data-[state=active]:border-purple-600 data-[state=active]:text-purple-600 transition-colors">Eventos</TabsTrigger>
                    </TabsList>
                    <TabsContent value="posts" className="p-6">
                        {/* Aqui será listado os PostCard do usuário */}
                        <p className='text-gray-500'>Postagens do perfil...</p>
                    </TabsContent>
                    <TabsContent value="groups" className="p-6">
                        <p className='text-gray-500'>Grupos que o usuário participa...</p>
                    </TabsContent>
                    <TabsContent value="events" className="p-6">
                         <p className='text-gray-500'>Eventos que o usuário criou/participa...</p>
                    </TabsContent>
                </Tabs>
            </div>
        </div>
    );
};