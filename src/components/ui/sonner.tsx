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
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
