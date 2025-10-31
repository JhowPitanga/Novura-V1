import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

type CheckboxSize = "sm" | "md" | "lg"

const sizeToClasses: Record<CheckboxSize, { root: string; icon: string; square: string }> = {
  sm: { root: "h-4 w-4", icon: "h-3.5 w-3.5", square: "h-2 w-2" },
  md: { root: "h-5 w-5", icon: "h-4 w-4", square: "h-2.5 w-2.5" },
  lg: { root: "h-6 w-6", icon: "h-5 w-5", square: "h-3 w-3" },
}

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & {
    size?: CheckboxSize
    whiteOnPurple?: boolean
    indicatorStyle?: "check" | "square"
  }
>(({ className, size = "sm", whiteOnPurple = false, indicatorStyle = "check", ...props }, ref) => {
  const { root, icon, square } = sizeToClasses[size]
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        "peer shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        indicatorStyle === "square"
          ? "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground"
          : whiteOnPurple
            ? "data-[state=checked]:bg-white data-[state=checked]:text-primary"
            : "data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        root,
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className={cn("flex items-center justify-center text-current")}
      >
        {indicatorStyle === "square" ? (
          <span className={cn("bg-white", square)} />
        ) : (
          <Check className={icon} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
})
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
