import { Toaster as Sonner, type ToasterProps } from "sonner"

import { Icon } from "@/components/ui/icon"

import { useUi } from "@/features/mail/ui-store"
import { resolveTheme } from "@/features/shell/use-theme"

// Maru owns the theme (a class on <html>, persisted through MailService), so
// the toaster reads it from there instead of from next-themes.
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = resolveTheme(useUi((s) => s.theme))

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <Icon name="success" size={16} />,
        info: <Icon name="info" size={16} />,
        warning: <Icon name="warning" size={16} />,
        error: <Icon name="error" size={16} />,
        loading: <Icon name="loading" size={16} className="animate-spin" />,
      }}
      offset={16}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--wren-radius-lg)",
          "--width": "336px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          // The Undo control — issue #36. Sonner ships it as a 4 px chip in
          // 12 px type, and the app has neither: every other button here is a
          // pill or carries one of DIRECTION §6's radii, and no other text in
          // the app is 12 px. A sharp little rectangle inside a 14 px-radius
          // toast reads as borrowed from somewhere else.
          //
          // It is a pill at the app's 11.5 px `text-xs`, which is what the bulk
          // bar's verbs are — the same kind of control at the same size. The
          // `!` is not decoration: sonner injects its own stylesheet at runtime
          // and its rule is `[data-sonner-toast][data-styled='true']
          // [data-button]`, which outranks a utility class and lands in an
          // order this file cannot depend on.
          actionButton:
            "h-6! rounded-full! px-2.5! font-ui! text-xs! font-medium!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
