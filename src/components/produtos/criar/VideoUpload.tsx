
import { useState } from "react";
import { Plus, X, Video } from "lucide-react";
import { Label } from "@/components/ui/label";

interface VideoUploadProps {
  video: File | string | null;
  onVideoChange: (video: File | string | null) => void;
}

export function VideoUpload({ video, onVideoChange }: VideoUploadProps) {
  const handleVideoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
      const file = files[0];
      // Basic validation
      if (file.type.startsWith("video/")) {
        onVideoChange(file);
      }
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
            <div className="aspect-square border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center">
               {isYouTubeId ? (
                 <div className="text-center p-2">
                   <Video className="w-8 h-8 mx-auto mb-2 text-red-500" />
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
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 transition-colors text-xs"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="w-40 h-40 relative">
            <input
              type="file"
              accept="video/*"
              onChange={handleVideoUpload}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              id="video-upload"
            />
            <label
              htmlFor="video-upload"
              className="w-full h-full border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-colors bg-gray-50"
            >
              <Video className="w-6 h-6 text-gray-400 mb-2" />
              <span className="text-xs text-gray-500 text-center px-2">
                Adicionar Vídeo
              </span>
            </label>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-3">
        Formatos aceitos: MP4, AVI, MOV, etc.
      </p>
    </div>
  );
}
