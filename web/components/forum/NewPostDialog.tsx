"use client";

import type { Hex } from "@lancio/shared";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button, Dialog, DialogClose, Field, Input, Textarea, type ButtonSize } from "@/components/ui";
import { ForumError } from "@/db/fetch";
import { FORUM_LIMITS } from "@/db/types";
import { useSiwe } from "@/lib/siwe";
import { forumApi } from "./api";
import { SignInGate } from "./SignInGate";

const n = (v: number) => v.toLocaleString("en-US");

/** "New post" button + dialog for one token's room. Posting needs a SIWE session (the dialog asks for it). */
export function NewPostDialog({ token, symbol, size = "md" }: { token: Hex; symbol?: string | null; size?: ButtonSize }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const router = useRouter();
  const siwe = useSiwe();
  const id = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Add a title.");
    setSaving(true);
    setError(null);
    try {
      const post = await forumApi.createPost({ token, title, body });
      setOpen(false);
      setTitle("");
      setBody("");
      void qc.invalidateQueries({ queryKey: ["forum", "posts"] });
      toast.success("Posted.", { action: { label: "View", onClick: () => router.push(`/forum/post/${post.id}`) } });
    } catch (err) {
      if (err instanceof ForumError && err.status === 401) siwe.refresh();
      setError(err instanceof ForumError ? err.message : "Could not post. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button size={size}>
          <Plus size={size === "sm" ? 14 : 16} />
          New post
        </Button>
      }
      title="New post"
      description={symbol ? `Posting in the $${symbol} room. Plain text only.` : "Plain text only."}
      className="max-w-lg"
    >
      <SignInGate action="post">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Title" htmlFor={`${id}-title`} aside={`${title.length} / ${FORUM_LIMITS.title}`}>
            <Input
              id={`${id}-title`}
              value={title}
              maxLength={FORUM_LIMITS.title}
              onChange={(e) => setTitle(e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </Field>
          <Field label="Text" htmlFor={`${id}-body`} hint="Optional." aside={`${n(body.length)} / ${n(FORUM_LIMITS.body)}`}>
            <Textarea id={`${id}-body`} value={body} rows={8} maxLength={FORUM_LIMITS.body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          {error && (
            <p role="alert" className="text-13 text-sell">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <Button type="submit" loading={saving} disabled={!title.trim()}>
              Post
            </Button>
          </div>
        </form>
      </SignInGate>
    </Dialog>
  );
}
