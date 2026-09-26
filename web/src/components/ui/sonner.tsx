import { CircleCheck, CircleAlert, Info, TriangleAlert, LoaderCircle } from "lucide-react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useTheme } from "@/theme/provider";

// shadcn/ui Sonner, themed from the app's own theme provider instead of next-themes.
function Toaster(props: ToasterProps) {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheck className="size-4 text-income" />,
        info: <Info className="size-4" />,
        warning: <TriangleAlert className="size-4 text-warning" />,
        error: <CircleAlert className="size-4 text-destructive" />,
        loading: <LoaderCircle className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--card)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "0.75rem",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
