import { Button } from "@/components/ui/button";

interface ShopBannerProps {
  title: string;
  subtitle: string;
  buttonText: string;
  className?: string;
}

export function ShopBanner({ title, subtitle, buttonText, className }: ShopBannerProps) {
  return (
    <div className={(className ?? "") + " rounded-lg p-6 shadow-sm"}>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-sm opacity-90 mt-1">{subtitle}</p>
        </div>
        <Button variant="secondary" className="bg-white text-purple-700 hover:bg-gray-100">
          {buttonText}
        </Button>
      </div>
    </div>
  );
}