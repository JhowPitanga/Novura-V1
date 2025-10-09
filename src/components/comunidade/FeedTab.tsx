import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ComposerModal } from "./ComposerModal";
import { PostCard } from "./PostCard";
import type { Post } from "./types";
import { Pencil, Filter, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const initialPosts: Post[] = [
  {
    id: "p1",
    author: "Guilherme William Menes Mota",
    title: "Atualização do curso After Effects",
    content: "Alguém sabe quando sai as atualizações do motion design essencial 3.0?",
    images: [],
    poll: null,
    likes: 12,
    comments: [
      { id: "c1", author: "João", text: "Também estou aguardando!", createdAt: new Date().toISOString() },
    ],
    reposts: 1,
    pinned: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: "p2",
    author: "Barbara Lucia Brito Costa",
    content: "Bem poética a introdução.",
    images: [],
    poll: {
      question: "Qual o nome desse estilo de efeito sonoro?",
      options: [
        { id: "o1", text: "Whoosh", votes: 4 },
        { id: "o2", text: "Swoosh", votes: 6 },
        { id: "o3", text: "Swish", votes: 1 },
      ],
    },
    likes: 8,
    comments: [],
    reposts: 0,
    pinned: true,
    createdAt: new Date().toISOString(),
  },
];

export function FeedTab() {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [openComposer, setOpenComposer] = useState(false);
  const [filter, setFilter] = useState<"relevantes"|"recentes"|"salvas">("recentes");
  const [search, setSearch] = useState("");

  const updatePost = (p: Post) => {
    setPosts((prev) => {
      const idx = prev.findIndex((x) => x.id === p.id);
      const copy = [...prev];
      copy[idx] = p;
      return copy.sort((a, b) => Number(b.pinned) - Number(a.pinned));
    });
  };

  const addPost = (p: Post) => {
    setPosts((prev) => [p, ...prev].sort((a, b) => Number(b.pinned) - Number(a.pinned)));
  };

  const addRepost = (original: Post) => {
    const newPost: Post = {
      id: Math.random().toString(36).slice(2),
      author: "Você",
      content: original.content,
      images: original.images,
      poll: null,
      likes: 0,
      comments: [],
      reposts: 0,
      pinned: false,
      saved: false,
      createdAt: new Date().toISOString(),
      repostOf: { id: original.id, author: original.author },
    };
    addPost(newPost);
  };

  const filteredPosts = posts
    .filter(p => {
      const text = `${p.title ?? ""} ${p.content} ${p.author}`.toLowerCase();
      return text.includes(search.toLowerCase());
    })
    .filter(p => {
      if (filter === "salvas") return !!p.saved;
      return true;
    })
    .sort((a, b) => {
      if (filter === "relevantes") {
        const scoreA = a.likes + a.comments.length * 2 + a.reposts * 3 + Number(a.pinned) * 5;
        const scoreB = b.likes + b.comments.length * 2 + b.reposts * 3 + Number(b.pinned) * 5;
        return scoreB - scoreA;
      }
      // recentes
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  return (
    <div>
      <Card className="p-4 mb-6 border-gray-100">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-gray-700">V</div>
          <Button variant="outline" className="flex-1 min-w-[280px] justify-start text-gray-500" onClick={() => setOpenComposer(true)}>
            <Pencil className="w-4 h-4 mr-2" /> Compartilhe algo com a comunidade...
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="w-4 h-4" />
                {filter === "relevantes" ? "Relevantes" : filter === "salvas" ? "Salvas" : "Recentes"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuItem onClick={() => setFilter("recentes")}>Recentes</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilter("relevantes")}>Relevantes</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setFilter("salvas")}>Salvas</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar termos, assuntos e marketplaces" className="pl-10 w-[280px]" />
          </div>
        </div>
      </Card>

      {filteredPosts.map((p) => (
        <PostCard key={p.id} post={p} onUpdate={updatePost} onRepost={addRepost} />
      ))}

      <ComposerModal open={openComposer} onOpenChange={setOpenComposer} onPublish={addPost} />
    </div>
  );
}