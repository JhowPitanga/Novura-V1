import { useEffect, useState } from "react";
import UniqueLoading from "@/components/ui/morph-loading";

const MESSAGES = [
  "Calma aí. Estamos carregando o sistema",
  "Pegue um café",
  "Quase lá...",
  "Preparando seu ambiente",
];

interface LoadingOverlayProps {
  durationMs?: number;
  fullscreen?: boolean;
  message?: string;
  messages?: string[];
  topOffset?: number;
}

export default function LoadingOverlay({ durationMs = 5000, fullscreen = false, message, messages, topOffset = 0 }: LoadingOverlayProps) {
  const [index, setIndex] = useState(0);
  const list = Array.isArray(messages) && messages.length > 0 ? messages : MESSAGES;

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % list.length);
    }, 1400);
    return () => clearInterval(interval);
  }, [list.length]);

  return (
    <div
      className={`${fullscreen ? "fixed inset-0" : "absolute inset-0"} z-[1000] bg-white flex flex-col items-center justify-center`}
      style={fullscreen ? undefined : { top: topOffset }}
    >
      <UniqueLoading variant="morph" size="lg" className="mb-6" />
      <div className="h-7">
        <span
          key={index}
          className="text-primary font-medium transition-opacity duration-500 ease-in-out"
        >
          {message ?? list[index]}
        </span>
      </div>
    </div>
  );
}
