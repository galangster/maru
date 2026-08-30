// Maru's tooltip.
//
// Retuned from the shadcn default, which shipped tw-animate-css's zoom/slide
// vocabulary and a 12 px popup — neither of which is in DIRECTION. The popup is
// now a solid inverted chip on the Maru radius and type scale, and its motion is
// the same `wren-anchored-*` pair every other anchored surface uses, declared in
// features/shell/surfaces.css because Base UI owns the unmount.
//
// Solid, not glass: an icon button inside the composer sheet would otherwise
// put glass on glass, and DIRECTION §7 budgets two layers total.

import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "@/lib/utils"

/**
 * One provider at the root. The delay is shared across siblings, so moving
 * along a toolbar shows the second tooltip immediately instead of re-waiting —
 * which is the whole reason a provider exists.
 */
function TooltipProvider({
  delay = 500,
  closeDelay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      closeDelay={closeDelay}
      {...props}
    />
  )
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 6,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "font-ui bg-ink text-canvas shadow-md",
            "flex h-6 w-fit max-w-64 origin-(--transform-origin) items-center gap-2 rounded-xs px-2 text-xs",
            className
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

/**
 * The keyboard shortcut, printed after the label: a help tag that teaches the
 * faster path at the moment of the slower one (MAGIC §2.7, Things 3). Muted
 * against the inverted chip rather than wearing the `Keycap` recipe, which is
 * built for a light surface.
 */
function TooltipHint({ children }: { children: React.ReactNode }) {
  return <span className="text-canvas/60">{children}</span>
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipHint, TooltipProvider }
