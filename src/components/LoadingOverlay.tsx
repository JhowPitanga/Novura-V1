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
  topOffset?: number;
}

export default function LoadingOverlay({ durationMs = 5000, fullscreen = false, message, topOffset = 0 }: LoadingOverlayProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % MESSAGES.length);
    }, 1400);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={`${fullscreen ? "fixed inset-0" : "absolute left-0 right-0 bottom-0"} z-[1000] bg-white flex flex-col items-center justify-center`}
      style={fullscreen ? undefined : { top: topOffset }}
    >
      <UniqueLoading variant="morph" size="lg" className="mb-6" />
      <div className="h-7">
        <span
          key={index}
          className="text-primary font-medium transition-opacity duration-500 ease-in-out"
        >
          {message ?? MESSAGES[index]}
        </span>
      </div>
    </div>
  );
}