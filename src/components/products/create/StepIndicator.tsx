
import { Check } from "lucide-react";
import { ProductStep } from "@/types/products";

interface StepIndicatorProps {
  steps: ProductStep[];
  currentStep: number;
  clickable?: boolean;
  maxVisitedStep?: number;
  onStepClick?: (stepId: number) => void;
  errorSteps?: number[];
}

export function StepIndicator({ steps, currentStep, clickable = false, maxVisitedStep, onStepClick, errorSteps = [] }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-between mb-5">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center">
          <div
            className={`flex flex-col items-center ${clickable && ((maxVisitedStep ?? 0) >= step.id) ? "cursor-pointer" : "cursor-default"}`}
            onClick={() => {
              const canClick = clickable && ((maxVisitedStep ?? 0) >= step.id);
              if (canClick && onStepClick) onStepClick(step.id);
            }}
          >
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center border-2 ${
                errorSteps.includes(step.id)
                  ? "bg-red-500 border-red-500 text-white"
                  : (currentStep >= step.id
                      ? "bg-novura-primary border-novura-primary text-white"
                      : "border-gray-300 text-gray-400")
              }`}
            >
              {currentStep > step.id ? (
                <Check className="w-6 h-6" />
              ) : (
                <span className="text-sm font-medium">{step.id}</span>
              )}
            </div
            >
            <div className="mt-2 text-center w-20">
              <p className="text-sm font-medium text-gray-900 leading-tight">{step.title}</p>
              <p className="text-xs text-gray-500 leading-snug h-8 overflow-hidden">{step.description}</p>
            </div>
          </div>
          {index < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mx-6 ${
              currentStep > step.id ? "bg-novura-primary" : "bg-gray-300"
            }`} />
          )}
        </div>
      ))}
    </div>
  );
}
