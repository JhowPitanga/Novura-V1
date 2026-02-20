
import { useState } from "react";
import { Plus, X, Video } from "lucide-react";
import { Label } from "@/components/ui/label";

interface VideoUploadProps {
  video: File | string | null;
  onVideoChange: (video: File | string | null) => void;
  maxSizeMB?: number;
  maxResolution?: { width: number; height: number };
  minDurationSec?: number;
  maxDurationSec?: number;
  accept?: string;
  variant?: "default" | "purple";
}

export function VideoUpload({ video, onVideoChange, maxSizeMB = 30, maxResolution = { width: 1280, height: 1280 }, minDurationSec = 10, maxDurationSec = 60, accept = "video/mp4", variant = "default" }: VideoUploadProps) {
  const isPurple = variant === "purple";
  const [error, setError] = useState<string | null>(null);
  const handleVideoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    const file = files[0];
    if (accept && file.type !== accept) { setError("Formato inválido. Use MP4."); return; }
    if (file.size > maxSizeMB * 1024 * 1024) { setError(`Tamanho máximo ${maxSizeMB}MB.`); return; }
    try {
      const url = URL.createObjectURL(file);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.src = url;
      await new Promise<void>((resolve, reject) => {
        v.onloadedmetadata = () => resolve();
        v.onerror = () => reject(new Error("Falha ao ler vídeo"));
      });
      URL.revokeObjectURL(url);
      const w = Number(v.videoWidth || 0);
      const h = Number(v.videoHeight || 0);
      const d = Number(v.duration || 0);
      if (w > maxResolution.width || h > maxResolution.height) { setError(`Resolução máxima ${maxResolution.width}x${maxResolution.height}px.`); return; }
      if (d < minDurationSec || d > maxDurationSec) { setError(`Duração entre ${minDurationSec}s e ${maxDurationSec}s.`); return; }
      setError(null);
      onVideoChange(file);
    } catch {
      setError("Não foi possível validar o vídeo.");
    }
  };

  const removeVideo = () => {
    onVideoChange(null);
  };

  let src: string | null = null;
  if (video instanceof File) {
    src = URL.createObjectURL(video);
  } else if (typeof video === "string") {
    src = video; // YouTube ID or URL? If ID, we can't preview easily without iframe.
    // If it's a YouTube ID (no dots, short), we might assume it's an ID.
    // If it's a URL, we use it.
  }

  const isYouTubeId = typeof video === "string" && !video.includes("/") && !video.includes(".");

  return (
    <div className="mt-6">
      <Label>Vídeo do Anúncio</Label>
      <div className="mt-4">
        {video ? (
          <div className="relative w-40 h-40">
            <div className={`aspect-square border-2 ${isPurple ? "border-novura-primary/20 bg-purple-50" : "border-gray-300 bg-gray-50"} rounded-lg overflow-hidden flex items-center justify-center`}>
               {isYouTubeId ? (
                 <div className="text-center p-2">
                   <Video className={`w-8 h-8 mx-auto mb-2 ${isPurple ? "text-novura-primary" : "text-red-500"}`} />
                   <span className="text-xs block truncate max-w-full">{video as string}</span>
                 </div>
               ) : (
                  <video
                    src={src || ""}
                    className="w-full h-full object-cover"
                    controls
                  />
               )}
            </div>
            <button
              type="button"
              onClick={removeVideo}
              className={`absolute -top-2 -right-2 ${isPurple ? "bg-novura-primary hover:bg-novura-primary/80" : "bg-red-500 hover:bg-red-600"} text-white rounded-full w-6 h-6 flex items-center justify-center transition-colors text-xs`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="w-40 h-40 relative">
            <input
              type="file"
              accept={accept}
              onChange={handleVideoUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              id="video-upload"
            />
            <label
              htmlFor="video-upload"
              className={`w-full h-full border-2 border-dashed ${isPurple ? "border-novura-primary/30 hover:border-novura-primary bg-purple-50" : "border-gray-300 hover:border-gray-400 bg-gray-50"} rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors`}
            >
              <Video className={isPurple ? "w-6 h-6 text-novura-primary mb-2" : "w-6 h-6 text-gray-400 mb-2"} />
              <span className={`text-xs ${isPurple ? "text-novura-primary" : "text-gray-500"} text-center px-2`}>
                Adicionar Vídeo
              </span>
            </label>
          </div>
        )}
      </div>
      {error ? <p className="text-xs text-red-600 mt-3">{error}</p> : <p className={`text-xs ${isPurple ? "text-gray-700" : "text-gray-500"} mt-3`}>Formato MP4. Máx. 30MB, 1280x1280px, 10s-60s.</p>}
    </div>
  );
}
