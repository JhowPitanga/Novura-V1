import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Post, PollOption } from "./types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublish: (post: Post) => void;
};

export function ComposerModal({ open, onOpenChange, onPublish }: Props) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<PollOption[]>([]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).slice(0, 4); // até 4 imagens
    const urls = arr.map((f) => URL.createObjectURL(f));
    setImages((prev) => [...prev, ...urls]);
  };

  const addPollOption = () => {
    const text = prompt("Texto da opção da enquete:");
    if (!text) return;
    setPollOptions((prev) => [...prev, { id: Math.random().toString(36).slice(2), text, votes: 0 }]);
  };

  const clear = () => {
    setTitle("");
    setContent("");
    setImages([]);
    setPollQuestion("");
    setPollOptions([]);
  };

  const publish = () => {
    const newPost: Post = {
      id: Math.random().toString(36).slice(2),
      author: "Você",
      title: title || undefined,
      content,
      images,
      poll: pollQuestion && pollOptions.length > 0 ? { question: pollQuestion, options: pollOptions } : null,
      likes: 0,
      comments: [],
      reposts: 0,
      pinned: false,
      createdAt: new Date().toISOString(),
    };
    onPublish(newPost);
    clear();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Criar uma publicação</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input placeholder="Título (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea placeholder="No que você está pensando?" value={content} onChange={(e) => setContent(e.target.value)} />

          <div>
            <label className="text-sm font-medium">Imagens</label>
            <input type="file" multiple accept="image/*" onChange={(e) => handleFiles(e.target.files)} />
            {images.length > 0 && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                {images.map((src, i) => (
                  <img key={i} src={src} alt="preview" className="w-full h-32 object-cover rounded-lg border" />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Enquete</label>
            <Input placeholder="Pergunta" value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} />
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={addPollOption}>Adicionar opção</Button>
              {pollOptions.length > 0 && <span className="text-sm text-gray-600">{pollOptions.length} opções</span>}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button className="bg-novura-primary text-white" onClick={publish} disabled={!content.trim()}>Publicar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}