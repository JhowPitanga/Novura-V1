// src/components/comunidade/PostCard.tsx

import React, { useState } from 'react';
// Ícones (usando Lucide como exemplo, ajuste conforme sua biblioteca de ícones)
import { Heart, MessageCircle, Share, Verified } from 'lucide-react';
// Importe seus componentes de UI.
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User as UserIcon } from 'lucide-react';
// Importe as tipagens que definimos
import { Post, User } from '@/components/comunidade/types'; 

interface PostCardProps {
    post: Post;
    currentUser: User;
}

export const PostCard: React.FC<PostCardProps> = ({ post, currentUser }) => {
    // Estado para controlar a visibilidade do bloco de comentários
    const [showComments, setShowComments] = useState(false);
    const [commentText, setCommentText] = useState('');

    // Comentários: lista e curtidas
    const comments = post.comments ?? [];
    const [showAllComments, setShowAllComments] = useState(false);
    const [commentLikes, setCommentLikes] = useState<number[]>(comments.map(c => c.likes));
    const [commentLiked, setCommentLiked] = useState<boolean[]>(comments.map(() => false));
    const visibleComments = showAllComments ? comments : comments.slice(0, 3);
    const handleCommentLike = (idx: number) => {
        setCommentLikes(prev => prev.map((v, i) => (i === idx ? (commentLiked[idx] ? Math.max(v - 1, 0) : v + 1) : v)));
        setCommentLiked(prev => prev.map((v, i) => (i === idx ? !v : v)));
    };

    // Curtidas: ícone fica roxo quando clicado e contador atualiza
    const [liked, setLiked] = useState(false);
    const [likesCount, setLikesCount] = useState(post.likes);
    const handleLike = () => {
        setLikesCount(prev => (liked ? Math.max(prev - 1, 0) : prev + 1));
        setLiked(prev => !prev);
    };

    // Enquete
    const hasPoll = Array.isArray(post.pollOptions) && post.pollOptions.length > 0;
    const [pollSelected, setPollSelected] = useState<number | null>(null);
    const [pollVoted, setPollVoted] = useState(false);
    const [pollVotes, setPollVotes] = useState<number[]>(hasPoll ? Array(post.pollOptions!.length).fill(0) : []);
    const handleVote = () => {
        if (pollSelected === null) return;
        setPollVotes(prev => prev.map((v, i) => (i === pollSelected ? v + 1 : v)));
        setPollVoted(true);
    };

    return (
        <Card className="mb-6 p-4 md:p-6 shadow-lg rounded-xl border border-gray-100 bg-white">
            {/* 1. Header da Postagem */}
            <div className="flex flex-col">
                <div className="flex items-start">
                    <Avatar className="w-10 h-10 mr-3">
                        <AvatarImage src={post.user.avatarUrl} alt={post.user.name} />
                        <AvatarFallback>
                            <UserIcon className="w-5 h-5 text-gray-400" />
                        </AvatarFallback>
                    </Avatar>
                    <div>
                        <div className="flex items-center">
                            <p className="font-semibold text-gray-800 mr-1">{post.user.name}</p>
                            {post.user.isVerified && <Verified size={16} className="text-purple-600" />}
                        </div>
                        <p className="text-sm text-gray-500">{post.timestamp}</p>
                    </div>
                </div>

                {/* 2. Título e descrição */}
                {post.title && (
                    <h3 className="mt-3 text-lg font-semibold text-gray-900">{post.title}</h3>
                )}
                <p className="mt-2 text-gray-700 whitespace-pre-wrap">{post.text}</p>

                {/* 3. Mídia (Opcional) */}
                {post.mediaUrl && post.mediaType === 'image' && (
                    <div className="mt-3 rounded-lg w-full overflow-hidden aspect-square">
                        <img src={post.mediaUrl} alt="Post media" className="w-full h-full object-cover" />
                    </div>
                )}

                {/* 4. Enquete (Opcional) */}
                {hasPoll && (
                    !pollVoted ? (
                        <div className="mt-4 space-y-3">
                            {post.pollOptions!.map((opt, i) => (
                                <label
                                    key={i}
                                    className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:border-purple-600"
                                    onClick={() => {
                                        setPollSelected(i);
                                        setPollVotes(prev => prev.map((v, idx) => (idx === i ? v + 1 : v)));
                                        setPollVoted(true);
                                    }}
                                >
                                    <span className="text-gray-800">{opt}</span>
                                </label>
                            ))}
                        </div>
                    ) : (
                        <div className="mt-4 space-y-3">
                            {post.pollOptions!.map((opt, i) => {
                                const total = pollVotes.reduce((a, b) => a + b, 0);
                                const percent = total > 0 ? Math.round((pollVotes[i] / total) * 100) : 0;
                                return (
                                    <div key={i} className="p-3 border rounded-lg">
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="text-gray-800">{opt}</span>
                                            <span className="text-purple-700 font-semibold">{percent}%</span>
                                        </div>
                                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                                            <div className="h-2 bg-purple-600 rounded-full" style={{ width: `${percent}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                            <p className="text-xs text-gray-500">{pollVotes.reduce((a, b) => a + b, 0)} votos</p>
                        </div>
                    )
                )}

                {/* 5. Ações da Postagem (horizontal) */}
                <div className="mt-4 flex flex-row items-center gap-4 text-sm text-gray-600">
                    <button onClick={handleLike} className={`inline-flex items-center hover:text-purple-700`}>
                        <Heart size={18} className="text-purple-600" fill={liked ? 'currentColor' : 'none'} />
                        <span className="ml-2">{likesCount}</span>
                    </button>
                    <button className={`inline-flex items-center hover:text-purple-700`} onClick={() => setShowComments(!showComments)}>
                        <MessageCircle size={18} className="text-purple-600" />
                        <span className="ml-2">{post.commentsCount}</span>
                    </button>
                    <button className={`inline-flex items-center hover:text-purple-700`}>
                        <Share size={18} className="text-purple-600" />
                        <span className="ml-2">{post.shareCount}</span>
                    </button>
                </div>

                {/* 6. Comentários: listar os principais e carregar mais */}
                {showComments && (
                    <div className="mt-4 border-t pt-4">
                        <div className="space-y-4">
                            {visibleComments.map((c, idx) => (
                                <div key={c.id} className="flex items-start">
                                    <Avatar className="w-8 h-8 mr-2">
                                        <AvatarImage src={c.user.avatarUrl} alt={c.user.name} />
                                        <AvatarFallback>
                                            <UserIcon className="w-4 h-4 text-gray-400" />
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <p className="text-sm text-gray-800">
                                                <span className="font-semibold">{c.user.name}</span>
                                                <span className="text-gray-500 text-xs ml-2">{c.timestamp}</span>
                                            </p>
                                            <button onClick={() => handleCommentLike(idx)} className="inline-flex items-center text-xs text-gray-600 hover:text-purple-700">
                                                <Heart size={14} className="text-purple-600" fill={commentLiked[idx] ? 'currentColor' : 'none'} />
                                                <span className="ml-1">{commentLikes[idx]}</span>
                                            </button>
                                        </div>
                                        <p className="text-sm text-gray-700 mt-1">{c.content}</p>
                                    </div>
                                </div>
                            ))}
                            {comments.length > 3 && !showAllComments && (
                                <div className="text-center">
                                    <button className="text-purple-600 hover:text-purple-700 font-semibold transition" onClick={() => setShowAllComments(true)}>
                                        Carregar mais comentários
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Campo para novo comentário */}
                        <div className="flex items-center mt-4">
                            <Avatar className="w-8 h-8 mr-2">
                                <AvatarImage src={currentUser.avatarUrl} alt={currentUser.name} />
                                <AvatarFallback>
                                    <UserIcon className="w-4 h-4 text-gray-400" />
                                </AvatarFallback>
                            </Avatar>
                            <input
                                value={commentText}
                                onChange={(e) => setCommentText(e.target.value)}
                                placeholder="Escreva um comentário..."
                                className="flex-1 border border-gray-300 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                            <Button className="ml-2 bg-purple-600 hover:bg-purple-700 text-white">Comentar</Button>
                        </div>
                    </div>
                )}
            </div>
        </Card>
    );
};