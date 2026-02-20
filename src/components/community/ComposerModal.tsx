// src/components/comunidade/ComposerModal.tsx

import React, { useState } from 'react';
// Ícones
import { X, Image, Smile, Play, BarChart, Users } from 'lucide-react';
// Importe seus componentes de UI.
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input'; 

interface ComposerModalProps {
    onClose: () => void;
    // Função para lidar com a submissão do post
    onSubmit?: (postData: { title: string, content: string, targetGroup: string, media?: any }) => void;
}

export const ComposerModal: React.FC<ComposerModalProps> = ({ onClose, onSubmit }) => {
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [targetGroup, setTargetGroup] = useState('Comunidade NOVURA'); // Default
    
    const handlePost = () => {
        if (content.trim() === '') return;
        
        if (onSubmit) {
            onSubmit({ title, content, targetGroup });
        }
        
        onClose();
    };

    const novuraPurple = 'bg-purple-600 hover:bg-purple-700 text-white';

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl">
                {/* Header do Modal */}
                <div className="flex justify-between items-center p-5 border-b">
                    <h2 className="text-xl font-bold text-gray-800">Criar uma publicação</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800 transition">
                        <X size={24} /> 
                    </button>
                </div>

                {/* Corpo - Conteúdo da Postagem */}
                <div className="p-5">
                    {/* Título (opcional) */}
                    <Input 
                        placeholder="Título (opcional)" 
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="mb-2 border-0 focus:ring-0 text-lg placeholder:text-gray-400"
                    />
                    {/* O que você está pensando */}
                    <Textarea 
                        placeholder="No que você está pensando?" 
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        className="w-full resize-none border-0 focus:ring-0 p-2 min-h-[150px] placeholder:text-gray-500 text-gray-700" 
                        autoFocus
                    />
                    
                    {/* Seletor de Target (Para onde o post vai) */}
                    <div className="flex items-center text-sm text-gray-500 mt-3">
                        <Users size={16} className="mr-1 text-purple-600" />
                        Postar em: 
                        <select 
                            value={targetGroup} 
                            onChange={(e) => setTargetGroup(e.target.value)}
                            className="ml-2 border border-gray-300 bg-gray-50 rounded-md p-1 focus:ring-purple-500 focus:border-purple-500"
                        >
                            <option value="Comunidade NOVURA">Comunidade NOVURA (Geral)</option>
                            <option value="Grupo Suporte">Grupo: Suporte Avançado</option> 
                            <option value="Grupo ML">Grupo: Mercado Livre Estratégico</option> 
                        </select>
                    </div>

                    {/* Área de Mídia e Botão Publicar */}
                    <div className="flex justify-between items-center p-3 border-t mt-4">
                        <div className="flex gap-3">
                            <Button title="Adicionar Imagem" size="icon" variant="ghost" className="text-gray-600 hover:text-purple-600">
                                <Image size={22} />
                            </Button>
                            <Button title="Adicionar Emoji" size="icon" variant="ghost" className="text-gray-600 hover:text-purple-600">
                                <Smile size={22} />
                            </Button>
                            <Button title="Adicionar Vídeo" size="icon" variant="ghost" className="text-gray-600 hover:text-purple-600">
                                <Play size={22} />
                            </Button>
                            <Button title="Criar Enquete" size="icon" variant="ghost" className="text-gray-600 hover:text-purple-600">
                                <BarChart size={22} />
                            </Button>
                        </div>
                        
                        <div className='flex space-x-2'>
                           <Button 
                              onClick={onClose} 
                              variant="ghost" 
                              className="text-gray-500 hover:bg-gray-200 font-semibold"
                            >
                              Descartar
                            </Button>
                            <Button 
                                onClick={handlePost} 
                                className={`px-6 py-2 rounded-full font-semibold ${novuraPurple}`} 
                                disabled={!content.trim()}
                            >
                                Publicar
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};