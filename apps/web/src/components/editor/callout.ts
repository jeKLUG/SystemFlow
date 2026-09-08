import { Node, mergeAttributes, type CommandProps } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { CalloutView, type CalloutVariant } from "./CalloutView";

export type { CalloutVariant };

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      /** Panel um die aktuelle Auswahl legen bzw. einfügen. */
      setCallout: (variant: CalloutVariant) => ReturnType;
      /** Panel-Typ umschalten oder entfernen. */
      toggleCallout: (variant: CalloutVariant) => ReturnType;
      /** Panel aufheben. */
      unsetCallout: () => ReturnType;
    };
  }
}

function isEmptyParagraph(node: { type: { name: string }; content: { size: number } } | null | undefined) {
  return Boolean(node && node.type.name === "paragraph" && node.content.size === 0);
}

function calloutDepth($from: { depth: number; node: (d: number) => { type: { name: string } } }, name: string) {
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === name) return d;
  }
  return -1;
}

/**
 * TipTap-Block für farbige Info-/Warn-/Hinweis-Panels (Icon links).
 */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      variant: {
        default: "info" satisfies CalloutVariant,
        parseHTML: (el) =>
          (el.getAttribute("data-callout") as CalloutVariant | null) ?? "info",
        renderHTML: (attrs) => ({ "data-callout": attrs.variant }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "aside[data-callout]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const variant = (node.attrs.variant as CalloutVariant) || "info";
    return [
      "aside",
      mergeAttributes(HTMLAttributes, {
        "data-callout": variant,
        class: `editor-callout editor-callout-${variant}`,
      }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },

  addCommands() {
    return {
      setCallout:
        (variant: CalloutVariant) =>
        ({ commands, state }: CommandProps) => {
          if (state.selection.empty) {
            return commands.insertContent({
              type: this.name,
              attrs: { variant },
              content: [{ type: "paragraph" }],
            });
          }
          return commands.wrapIn(this.name, { variant });
        },
      toggleCallout:
        (variant: CalloutVariant) =>
        ({ commands, editor }: CommandProps) => {
          if (editor.isActive(this.name, { variant })) {
            return commands.lift(this.name);
          }
          if (editor.isActive(this.name)) {
            return commands.updateAttributes(this.name, { variant });
          }
          return commands.setCallout(variant);
        },
      unsetCallout:
        () =>
        ({ commands }: CommandProps) =>
          commands.lift(this.name),
    };
  },

  addKeyboardShortcuts() {
    return {
      /** Leeres Panel per Backspace entfernen. */
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parentOffset !== 0) return false;

        const depth = calloutDepth($from, this.name);
        if (depth < 0) return false;

        const callout = $from.node(depth);
        const onlyEmpty = callout.childCount === 1 && isEmptyParagraph(callout.firstChild);
        if (!onlyEmpty) return false;

        const from = $from.before(depth);
        const to = $from.after(depth);
        return editor.chain().focus().deleteRange({ from, to }).run();
      },

      /** Zweimal Enter ohne Text → Panel verlassen. */
      Enter: ({ editor }) => {
        const { state } = editor;
        const { $from, empty } = state.selection;
        if (!empty || !isEmptyParagraph($from.parent)) return false;

        const depth = calloutDepth($from, this.name);
        if (depth < 0) return false;

        const callout = $from.node(depth);
        const index = $from.index(depth);
        if (index === 0) return false;

        const prev = callout.child(index - 1);
        if (!isEmptyParagraph(prev)) return false;

        const calloutFrom = $from.before(depth);
        const calloutTo = $from.after(depth);
        const remaining = callout.childCount - 2;

        return editor
          .chain()
          .focus()
          .command(({ tr, dispatch }) => {
            if (!dispatch) return true;

            let pos = $from.start(depth);
            for (let i = 0; i < index - 1; i++) {
              pos += callout.child(i).nodeSize;
            }
            const deleteFrom = pos;
            const deleteTo = pos + prev.nodeSize + $from.parent.nodeSize;

            if (remaining <= 0) {
              tr.replaceWith(calloutFrom, calloutTo, state.schema.nodes.paragraph.create());
              tr.setSelection(TextSelection.near(tr.doc.resolve(calloutFrom + 1)));
              return true;
            }

            tr.delete(deleteFrom, deleteTo);
            const after = tr.mapping.map(calloutTo, -1);
            tr.insert(after, state.schema.nodes.paragraph.create());
            tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1)));
            return true;
          })
          .run();
      },
    };
  },
});
