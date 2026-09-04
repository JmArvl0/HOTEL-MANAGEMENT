"use client";

import { useState } from "react";
import { ConfirmDialog, PromptDialog, SelectDialog } from "./Modal";
import type { ConfirmDialogProps, PromptDialogProps, SelectDialogProps } from "./Modal";
import {
  ChecklistDialog,
  FormDialog,
  MultiStepFormDialog,
  RoomSelectDialog,
} from "./FormDialog";
import type { FormField, ChecklistDialogProps, RoomSelectDialogProps } from "./FormDialog";

/**
 * Promise bridge over the on-site dialog kit so dashboard actions can `await`
 * a user decision exactly like the old native blocking prompt calls —
 * but rendered as the polished, keyboard-trapped, touch-friendly in-app dialogs.
 *
 * Render `{dialogs.view}` once per client, then:
 *   const ok = await dialogs.askConfirm({...});        // boolean
 *   const name = await dialogs.askPrompt({...});       // string | null (null = cancelled)
 *   const role = await dialogs.askSelect({...});       // string | null
 *   const data  = await dialogs.askForm({...});        // Record | null
 *   const data  = await dialogs.askMultiStep({...});   // Record | null
 *   const room  = await dialogs.askRoom({...});        // room number | null
 *   const flags = await dialogs.askChecklist({...});   // Record<string, boolean> | null
 *
 * Only one dialog can be open at a time; asking while one is pending dismisses
 * the earlier one (as if cancelled) instead of stacking native-style prompts.
 */
export type DialogCallback = (value: unknown) => void;

type Pending = {
  kind: "confirm" | "prompt" | "select" | "form" | "multistep" | "room" | "checklist";
  props: unknown;
  resolve: DialogCallback;
};

export type AskConfirmOptions = Pick<ConfirmDialogProps, "title" | "message" | "confirmText" | "cancelText" | "variant">;
export type AskPromptOptions = Pick<
  PromptDialogProps,
  | "title"
  | "message"
  | "label"
  | "placeholder"
  | "defaultValue"
  | "inputType"
  | "multiline"
  | "rows"
  | "required"
  | "min"
  | "max"
  | "step"
  | "validation"
  | "submitText"
  | "cancelText"
>;
export type AskSelectOptions = Pick<
  SelectDialogProps,
  "title" | "message" | "label" | "options" | "defaultValue" | "required" | "submitText" | "cancelText"
>;
export interface AskFormOptions {
  title: string;
  description?: string;
  fields: FormField[];
  initialData?: Record<string, string | number | boolean>;
  submitText?: string;
  cancelText?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
}
export interface AskMultiStepOptions extends AskFormOptions {
  steps: { title: string; description?: string; fields: FormField[] }[];
}
export type AskRoomOptions = Pick<RoomSelectDialogProps, "title" | "message" | "rooms" | "currentRoom">;
export type AskChecklistOptions = Pick<ChecklistDialogProps, "title" | "message" | "items" | "submitText" | "cancelText">;

export type AskFormData = Record<string, string | number | boolean>;

export function useActionDialogs() {
  const [pending, setPending] = useState<Pending | null>(null);

  const ask = (kind: Pending["kind"], props: unknown) =>
    new Promise<unknown>((resolve) => {
      setPending((prev) => {
        // Superseded ask resolves as cancelled so no awaiting handler hangs.
        if (prev) prev.resolve(prev.kind === "confirm" ? false : null);
        return { kind, props, resolve };
      });
    });

  const commit = (value: unknown) => setPending((prev) => {
    prev?.resolve(value);
    return null;
  });

  const cancel = () => setPending((prev) => {
    if (!prev) return null;
    prev.resolve(prev.kind === "confirm" ? false : null);
    return null;
  });

  const askConfirm = (options: AskConfirmOptions) =>
    ask("confirm", options) as Promise<boolean>;
  const askPrompt = (options: AskPromptOptions) =>
    ask("prompt", options) as Promise<string | null>;
  const askSelect = (options: AskSelectOptions) =>
    ask("select", options) as Promise<string | null>;
  const askForm = (options: AskFormOptions) =>
    ask("form", options) as Promise<AskFormData | null>;
  const askMultiStep = (options: AskMultiStepOptions) =>
    ask("multistep", options) as Promise<AskFormData | null>;
  const askRoom = (options: AskRoomOptions) =>
    ask("room", options) as Promise<string | null>;
  const askChecklist = (options: AskChecklistOptions) =>
    ask("checklist", options) as Promise<Record<string, boolean> | null>;

  const view = (() => {
    if (!pending) return null;
    switch (pending.kind) {
      case "confirm":
        return (
          <ConfirmDialog
            isOpen
            onClose={cancel}
            onConfirm={() => commit(true)}
            {...(pending.props as AskConfirmOptions)}
          />
        );
      case "prompt":
        return (
          <PromptDialog
            isOpen
            onClose={cancel}
            onSubmit={(value) => commit(value)}
            {...(pending.props as AskPromptOptions)}
          />
        );
      case "select":
        return (
          <SelectDialog
            isOpen
            onClose={cancel}
            onSubmit={(value) => commit(value)}
            {...(pending.props as AskSelectOptions)}
          />
        );
      case "form":
        return (
          <FormDialog
            isOpen
            onClose={cancel}
            onSubmit={(data) => commit(data)}
            {...(pending.props as AskFormOptions)}
          />
        );
      case "multistep":
        return (
          <MultiStepFormDialog
            isOpen
            onClose={cancel}
            onSubmit={(data) => commit(data)}
            {...(pending.props as AskMultiStepOptions)}
          />
        );
      case "room":
        return (
          <RoomSelectDialog
            isOpen
            onClose={cancel}
            onSelect={(room) => commit(room)}
            {...(pending.props as AskRoomOptions)}
          />
        );
      case "checklist":
        return (
          <ChecklistDialog
            isOpen
            onClose={cancel}
            onSubmit={(data) => commit(data)}
            {...(pending.props as AskChecklistOptions)}
          />
        );
    }
  })();

  return {
    view,
    askConfirm,
    askPrompt,
    askSelect,
    askForm,
    askMultiStep,
    askRoom,
    askChecklist,
  };
}
