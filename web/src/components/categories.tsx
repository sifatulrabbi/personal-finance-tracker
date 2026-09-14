import { useRef, useState } from "react";
import { api, mutationKey, type Category, type MutationKey } from "@/lib/api";
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
  value,
} from "@/components/forms";

export function CategoryChoice({
  categories,
  type,
  initial,
  onEditingChange,
  onCreated,
}: {
  categories: Category[];
  type: Category["type"];
  initial?: string;
  onEditingChange: (editing: boolean) => void;
  onCreated: () => void;
}) {
  const [selected, setSelected] = useState(initial || `others-${type}`);
  const [created, setCreated] = useState<Category[]>([]);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef<MutationKey | undefined>(undefined);
  const inFlight = useRef(false);
  const options = [
    ...categories,
    ...created.filter(
      (c) => !categories.some((existing) => existing.id === c.id),
    ),
  ].filter((c) => c.type === type);
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
    key.current = mutationKey(key.current, "/categories", body);
    try {
      const category = await api<Category>(
        "/categories",
        "POST",
        body,
        key.current.key,
      );
      setCreated((previous) => [...previous, category]);
      setSelected(category.id);
      setName("");
      toggle(false);
      onCreated();
    } catch {
      setError(
        "Could not create the category. Check for an identical name in this list, or retry.",
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
        <Button type="button" variant="outline" onClick={() => toggle(true)}>
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

export function CategorySettings({
  categories,
  onSaved,
}: {
  categories: Category[];
  onSaved: () => void;
}) {
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
                <ul className="flex flex-col gap-2">
                  {categories
                    .filter((c) => c.type === type)
                    .map((c) => (
                      <li
                        className="whitespace-pre-wrap break-words"
                        key={c.id}
                      >
                        {c.name}
                      </li>
                    ))}
                </ul>
                <SaveForm
                  key={categories.length}
                  path="/categories"
                  label="Create category"
                  onSaved={onSaved}
                  body={(form) => ({
                    name: value(form, `${type}_category_name`),
                    type,
                  })}
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
