
import * as React from "react"
import { Drawer as DrawerPrimitive } from "vaul"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"

const Drawer = ({
  shouldScaleBackground = true,
  direction = "right",
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root> & {
  direction?: "right" | "left" | "top" | "bottom"
}) => (
  <DrawerPrimitive.Root
    shouldScaleBackground={shouldScaleBackground}
    direction={direction}
    dismissible={true}
    {...props}
  />
)
Drawer.displayName = "Drawer"

const DrawerTrigger = DrawerPrimitive.Trigger

const DrawerPortal = DrawerPrimitive.Portal

const DrawerClose = DrawerPrimitive.Close

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-[10000] bg-black/80", className)}
    {...props}
  />
))
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DrawerPortal>
    <DrawerOverlay />
    <DrawerPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-y-0 z-50 flex h-full w-[35%] flex-col border-0 bg-white shadow-2xl data-[side=right]:right-0 data-[side=left]:left-0 data-[side=right]:rounded-l-[20px] data-[side=left]:rounded-r-[20px]",
        className
      )}
      {...props}
    >
      <div className="mx-auto mt-4 h-1 w-[60px] rounded-full bg-novura-primary" />
      <div className="absolute top-4 right-4">
        <DrawerClose asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-novura-primary"
            aria-label="Fechar a página"
            title="Fechar a página"
          >
            <X className="w-4 h-4" />
            <span>Fechar a página</span>
          </button>
        </DrawerClose>
      </div>
      {children}
    </DrawerPrimitive.Content>
  </DrawerPortal>
))
DrawerContent.displayName = "DrawerContent"

const DrawerHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("grid gap-2 p-6 text-center sm:text-left border-b border-gray-100", className)}
    {...props}
  />
)
DrawerHeader.displayName = "DrawerHeader"

const DrawerFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("mt-auto flex flex-col gap-3 p-6 border-t border-gray-100", className)}
    {...props}
  />
)
DrawerFooter.displayName = "DrawerFooter"

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn(
      "text-xl font-bold leading-none tracking-tight text-gray-900",
      className
    )}
    {...props}
  />
))
DrawerTitle.displayName = DrawerPrimitive.Title.displayName

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description
    ref={ref}
    className={cn("text-sm text-gray-600", className)}
    {...props}
  />
))
DrawerDescription.displayName = DrawerPrimitive.Description.displayName

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
