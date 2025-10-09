// src/components/comunidade/types.ts

// 1. Tipo para o Usuário
export type User = {
    id: string;
    username: string;
    name: string;
    avatarUrl: string;
    // Opcional: Para verificar se o perfil é verificado, como no Anexo 4
    isVerified?: boolean; 
};

// 2. Tipo para um Comentário
export type Comment = {
    id: string;
    user: User;
    content: string;
    timestamp: string;
    likes: number;
};

// 3. Tipo para uma Postagem (PostCard)
export type Post = {
    id: string;
    user: User;
    timestamp: string;
    title?: string;
    text: string;
    // Opcional: Para posts que contenham imagem ou vídeo
    mediaUrl?: string; 
    mediaType?: 'image' | 'video' | 'gif';
    // Opcional: Para posts de Enquete (Poll)
    pollOptions?: string[]; 
    
    likes: number;
    commentsCount: number;
    // Novo: lista real de comentários para exibir os 3 principais e carregar mais
    comments?: Comment[];
    shareCount: number;
    
    // Opcional: Para postagens direcionadas a um grupo específico
    groupId?: string; 
};