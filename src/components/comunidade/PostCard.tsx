import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Heart, MessageSquare, Repeat, Pin, Bookmark } from "lucide-react";
import type { Post } from "./types";

type Props = {
  post: Post;
  onUpdate: (post: Post) => void;
  onRepost?: (original: Post) => void;
};

export function PostCard({ post, onUpdate, onRepost }: Props) {
  const [commentText, setCommentText] = useState("");

  const handleLike = () => {
    if (post.likedByUser) return;
    onUpdate({ ...post, likes: post.likes + 1, likedByUser: true });
  };

  const handleRepost = () => {
    if (post.repostedByUser) return;
    const updated = { ...post, reposts: post.reposts + 1, repostedByUser: true };
    onUpdate(updated);
    onRepost?.(updated);
  };

  const handleTogglePin = () => {
    onUpdate({ ...post, pinned: !post.pinned });
  };

  const handleToggleSave = () => {
    onUpdate({ ...post, saved: !post.saved });
  };

  const handleAddComment = () => {
    const trimmed = commentText.trim();
    if (!trimmed) return;
    const newComment = {
      id: Math.random().toString(36).slice(2),
      author: "Você",
      text: trimmed,
      createdAt: new Date().toISOString(),
    };
    onUpdate({ ...post, comments: [...post.comments, newComment] });
    setCommentText("");
  };

  const voted = post.poll?.hasVoted;

  const handleVote = (index: number) => {
    if (!post.poll || voted) return;
    const chosenId = post.poll.options[index].id;
    const options = post.poll.options.map((opt, i) => ({
      ...opt,
      votes: i === index ? opt.votes + 1 : opt.votes,
    }));
    onUpdate({ ...post, poll: { ...post.poll, options, hasVoted: true, selectedOptionId: chosenId } });
  };

  return (
    <Card className="mb-6 border-gray-100">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base text-gray-900 flex items-center gap-3">
              <div className="w-10 h-10 bg-novura-primary rounded-xl flex items-center justify-center text-white">
                {post.author.charAt(0)}
              </div>
              <div>
                <div className="font-semibold">{post.author}</div>
                <div className="text-xs text-gray-500">{new Date(post.createdAt).toLocaleString()}</div>
              </div>
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {post.pinned && <Badge className="bg-gray-100 text-gray-700">Fixado</Badge>}
            <Button variant="ghost" size="sm" onClick={handleTogglePin}>
              <Pin className="w-4 h-4 mr-2" />
              {post.pinned ? "Desafixar" : "Fixar"}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleToggleSave}>
              <Bookmark className={`w-4 h-4 mr-2 ${post.saved ? "text-novura-primary" : "text-gray-600"}`} />
              {post.saved ? "Salvo" : "Salvar"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {post.title && <div className="text-lg font-semibold text-gray-900">{post.title}</div>}
        {post.repostOf && (
          <div className="text-xs text-gray-500">Republicado de <span className="font-medium">{post.repostOf.author}</span></div>
        )}
        <p className="text-gray-700 whitespace-pre-wrap">{post.content}</p>

        {post.images && post.images.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {post.images.map((img, i) => (
              <div key={i} className="rounded-lg overflow-hidden border border-gray-100">
                <img src={img} alt="imagem" className="w-full h-48 object-cover" />
              </div>
            ))}
          </div>
        )}

        {post.poll && (
          <div className="rounded-lg border border-gray-100 p-4">
            <div className="font-medium text-gray-900 mb-2">{post.poll.question}</div>
            <div className="space-y-3">
              {post.poll.options.map((opt, i) => {
                const total = post.poll!.options.reduce((sum, o) => sum + o.votes, 0) || 0;
                const percent = total ? Math.round((opt.votes / total) * 100) : 0;
                const isSelected = !!voted && post.poll!.selectedOptionId === opt.id;
                return (
                  <div key={opt.id} className="w-full">
                    <button
                      className={`w-full text-left px-3 py-2 rounded-md border border-gray-100 ${voted ? "cursor-default" : "cursor-pointer"}`}
                      onClick={() => handleVote(i)}
                      disabled={!!voted}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-800">{opt.text}</span>
                        <span className="text-sm text-gray-600">{percent}%</span>
                      </div>
                      <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${isSelected ? "bg-novura-primary" : "bg-gray-300"}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={handleLike} disabled={!!post.likedByUser} className="gap-2">
            <Heart className={`w-4 h-4 transition-transform duration-200 ${post.likedByUser ? "text-red-500 scale-110" : "text-gray-600"}`} />
            <span className="text-sm">{post.likes}</span>
          </Button>
          <Button variant="ghost" size="sm" className="gap-2">
            <MessageSquare className="w-4 h-4 text-gray-600" />
            <span className="text-sm">{post.comments.length}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={handleRepost} disabled={!!post.repostedByUser} className="gap-2">
            <Repeat className="w-4 h-4 text-gray-600" />
            <span className="text-sm">{post.reposts}</span>
          </Button>
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-novura-primary rounded-lg flex items-center justify-center text-white">V</div>
            <Input
              placeholder="Escreva um comentário..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <Button onClick={handleAddComment} className="bg-novura-primary text-white">Comentar</Button>
          </div>
          {post.comments.length > 0 && (
            <div className="mt-3 space-y-3">
              {post.comments.map((c) => (
                <div key={c.id} className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600">
                    {c.author.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{c.author}</div>
                    <div className="text-sm text-gray-700">{c.text}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}