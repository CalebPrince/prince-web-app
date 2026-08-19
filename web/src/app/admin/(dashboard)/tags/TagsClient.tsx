"use client";

import { useState } from "react";
import { adminApi, asList } from "@/lib/api";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  PageHeader, Card, Table, Row, Cell, EmptyRow, Button, IconButton,
  Modal, Field, Input, ErrorBanner,
} from "@/components/admin/ui";

export type AdminTag = {
  id: number;
  name: string;
  slug: string;
  project_count: number;
};

export default function TagsClient({ initialTags }: { initialTags: AdminTag[] }) {
  const [tags, setTags] = useState(initialTags);
  const [editing, setEditing] = useState<AdminTag | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setTags(asList<AdminTag>(await adminApi.get("/api/v1/admin/tags")));
  };

  const openNew = () => {
    setEditing(null);
    setName("");
    setIsOpen(true);
  };

  const openEdit = (tag: AdminTag) => {
    setEditing(tag);
    setName(tag.name);
    setIsOpen(true);
  };

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await adminApi.put(`/api/v1/admin/tags/${editing.id}`, { name });
      } else {
        await adminApi.post("/api/v1/admin/tags", { name });
      }
      setIsOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the tag.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (tag: AdminTag) => {
    const warning = tag.project_count > 0
      ? `Delete "${tag.name}"? It will be removed from ${tag.project_count} project(s).`
      : `Delete "${tag.name}"?`;
    if (!confirm(warning)) return;
    try {
      await adminApi.del(`/api/v1/admin/tags/${tag.id}`);
      setTags((prev) => prev.filter((t) => t.id !== tag.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the tag.");
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Content"
        title="Keep the taxonomy tidy."
        description="Rename or remove the tags used across your projects."
        actions={
          <Button variant="primary" onClick={openNew}>
            <Plus className="w-4 h-4" />
            New tag
          </Button>
        }
      />

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <Card title="All tags">
        <Table head={["Name", "Slug", "Projects", "Actions"]}>
          {tags.length === 0 ? (
            <EmptyRow colSpan={4}>
              No tags yet — they are also created automatically when you save a project.
            </EmptyRow>
          ) : (
            tags.map((tag) => (
              <Row key={tag.id}>
                <Cell className="font-medium text-text">{tag.name}</Cell>
                <Cell>
                  <code className="text-xs text-text-2 bg-bg-3 px-1.5 py-0.5 rounded">{tag.slug}</code>
                </Cell>
                <Cell className="text-text-2 tabular-nums">{tag.project_count}</Cell>
                <Cell>
                  <div className="flex items-center justify-end gap-2">
                    <IconButton title="Rename" onClick={() => openEdit(tag)}>
                      <Pencil className="w-4 h-4" />
                    </IconButton>
                    <IconButton title="Delete" tone="danger" onClick={() => remove(tag)}>
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  </div>
                </Cell>
              </Row>
            ))
          )}
        </Table>
      </Card>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={editing ? "Rename tag" : "New tag"}
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving || !name.trim()}>
              {saving ? "Saving…" : "Save tag"}
            </Button>
          </>
        }
      >
        <Field label="Name" hint="Shown on project cards; the URL slug is generated automatically.">
          <Input
            value={name}
            maxLength={50}
            placeholder="Tag name"
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
          />
        </Field>
      </Modal>
    </div>
  );
}
