import { useRef, useState } from "react";
import { errorMessage } from "@/api/errors";
import { mutationKey, type MutationKey } from "@/api/idempotency";
import type { Category } from "@/api/types";
import { useWrites } from "@/cache/writes";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Choice,
  TextField,
  ErrorMessage,
  SaveForm,
} from "@/components/forms";

export function CategoryChoice({
  categories,
  type,
  initial,
  onEditingChange,
}: {
  categories: Category[];
  type: Category["type"];
  initial?: string;
  onEditingChange: (editing: boolean) => void;
}) {
  const writes = useWrites();
  const [selected, setSelected] = useState(initial || `others-${type}`);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef<MutationKey | undefined>(undefined);
  const inFlight = useRef(false);
  // The created category arrives through the categories cache, so it is listed here too.
  const options = categories.filter((c) => c.type === type);
  function toggle(open: boolean) {
    setEditing(open);
    onEditingChange(open);
    setError("");
  }
  async function create() {
    if (inFlight.current || !name.trim()) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    const body = { name, type };
    key.current = mutationKey(key.current, "category", body);
    try {
      const category = await writes.createCategory(body, { key: key.current.key });
      // A new name typed later is a new request, not a replay of this one.
      key.current = undefined;
      setSelected(category.id);
      setName("");
      toggle(false);
    } catch (problem) {
      setError(
        errorMessage(
          problem,
          "Could not create the category. Check for an identical name in this list, or retry.",
        ),
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Choice
        label="Category"
        name="category_id"
        value={selected}
        onChange={setSelected}
        options={options.map((c) => ({ value: c.id, label: c.name }))}
      />
      {!editing ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-mt-2 self-start text-primary"
          onClick={() => toggle(true)}
        >
          <Plus data-icon="inline-start" />
          New category
        </Button>
      ) : (
        <>
          <TextField
            label="New category name"
            name="new_category_name"
            value={name}
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void create();
              }
            }}
          />
          <ErrorMessage error={error} />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy || !name.trim()}
              onClick={() => void create()}
            >
              {busy ? "Creating…" : "Create and select"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => toggle(false)}
            >
              Cancel category
            </Button>
          </div>
        </>
      )}
    </>
  );
}

export function CategorySettings({ categories }: { categories: Category[] }) {
  const writes = useWrites();
  return (
    <>
      {(["expense", "income"] as const).map((type) => {
        const title =
          type === "expense" ? "Expense categories" : "Income categories";
        return (
          <section key={type} aria-label={title}>
            <Card>
              <CardHeader>
                <CardTitle>{title}</CardTitle>
                <CardDescription>
                  One category per record. Names appear as you type them.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ul className="flex flex-wrap gap-2">
                  {categories
                    .filter((c) => c.type === type)
                    .map((c) => (
                      <li
                        className="max-w-full rounded-full bg-muted px-3 py-1 text-sm whitespace-pre-wrap break-words"
                        key={c.id}
                      >
                        {c.name}
                      </li>
                    ))}
                </ul>
                {/* Not keyed by the category count: creating one category must not wipe
                    a half-typed name in the other form. This form clears only itself. */}
                <SaveForm
                  label="Create category"
                  saved="Category created"
                  resetOnSuccess
                  body={(form) => ({
                    name: form.text(`${type}_category_name`),
                    type,
                  })}
                  send={(body, key) => writes.createCategory(body, { key })}
                >
                  <TextField
                    label="Category name"
                    name={`${type}_category_name`}
                    maxLength={120}
                    required
                  />
                </SaveForm>
              </CardContent>
            </Card>
          </section>
        );
      })}
    </>
  );
}
