import { toast } from "sonner";

// Short confirmations after a save. A toast floats above the page, so it never pushes
// content down the way an inline status line did.
export function notifySaved(saved: string | { message: string; id: string }) {
  if (typeof saved === "string") toast.success(saved);
  else toast.success(saved.message, { id: saved.id });
}

// Removes a confirmation that no longer matches what is on screen, for example once the
// saved value is edited again.
export function dismissSaved(id: string) {
  toast.dismiss(id);
}

export function notifyError(message: string) {
  toast.error(message);
}
