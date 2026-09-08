import { Node, mergeAttributes, type CommandProps } from "@tiptap/core";

export type CalloutVariant = "info" | "warn" | "tip" | "danger";

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

const labels: Record<CalloutVariant, string> = {
  info: "Info",
  warn: "Warnung",
  tip: "Hinweis",
  danger: "Wichtig",
};

/**
 * TipTap-Block für farbige Info-/Warn-/Hinweis-Panels.
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
        "data-label": labels[variant] ?? "Info",
      }),
      0,
    ];
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
});
