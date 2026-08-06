import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef, useState, type ReactNode } from "react";
import ImageResize from "tiptap-extension-resize-image";
import { api } from "../api";

interface Props {
  content: string;
  onChange: (json: string) => void;
  customerId?: string;
  documentId?: string;
}

/**
 * Wiki-Editor mit Toolbar, Bild-Upload (inline/skalierbar) und Tabellen.
 */
export function DocumentEditor({ content, onChange, customerId, documentId }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editorRef = useRef<Editor | null>(null);

  async function uploadAndInsert(editor: Editor, file: File) {
    if (!customerId || !documentId) {
      setError("Bild-Upload nur in gespeicherten Wiki-Seiten möglich.");
      return;
    }
    if (!file.type.startsWith("image/")) {
      setError("Nur Bilddateien können eingefügt werden.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const att = await api.uploadAttachment(customerId, file, { documentId });
      const src = `/api/attachments/${att.id}/download?inline=1`;
      editor
        .chain()
        .focus()
        .setImage({ src, alt: file.name })
        .run();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bild-Upload fehlgeschlagen");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({
        placeholder: "Schreibe hier – Text, Bilder, Listen, Tabellen…",
      }),
      ImageResize.configure({
        inline: true,
        allowBase64: false,
        minWidth: 64,
        maxWidth: 960,
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: safeParse(content),
    onUpdate: ({ editor: ed }) => {
      onChange(JSON.stringify(ed.getJSON()));
    },
    editorProps: {
      attributes: {
        class: "tiptap-surface",
      },
      handlePaste(_view, event) {
        const ed = editorRef.current;
        if (!ed || !customerId || !documentId) return false;
        const items = event.clipboardData?.items;
        if (!items) return false;
        const images = [...items].filter((i) => i.type.startsWith("image/"));
        if (images.length === 0) return false;
        event.preventDefault();
        for (const item of images) {
          const file = item.getAsFile();
          if (file) void uploadAndInsert(ed, file);
        }
        return true;
      },
      handleDrop(_view, event) {
        const ed = editorRef.current;
        if (!ed || !customerId || !documentId) return false;
        const files = event.dataTransfer?.files;
        if (!files?.length) return false;
        const images = [...files].filter((f) => f.type.startsWith("image/"));
        if (images.length === 0) return false;
        event.preventDefault();
        for (const file of images) void uploadAndInsert(ed, file);
        return true;
      },
    },
  });

  editorRef.current = editor;

  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    if (current !== content) {
      editor.commands.setContent(safeParse(content), false);
    }
  }, [content, editor]);

  if (!editor) return null;

  return (
    <div className={`editor${busy ? " is-busy" : ""}`}>
      <div className="editor-toolbar" role="toolbar" aria-label="Formatierung">
        <div className="toolbar-group">
          <ToolbarBtn
            title="Überschrift 1"
            active={editor.isActive("heading", { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            H1
          </ToolbarBtn>
          <ToolbarBtn
            title="Überschrift 2"
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            H2
          </ToolbarBtn>
          <ToolbarBtn
            title="Überschrift 3"
            active={editor.isActive("heading", { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          >
            H3
          </ToolbarBtn>
        </div>

        <div className="toolbar-group">
          <ToolbarBtn
            title="Fett"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <IconBold />
          </ToolbarBtn>
          <ToolbarBtn
            title="Kursiv"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <IconItalic />
          </ToolbarBtn>
          <ToolbarBtn
            title="Unterstrichen"
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <IconUnderline />
          </ToolbarBtn>
        </div>

        <div className="toolbar-group">
          <ToolbarBtn
            title="Aufzählung"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <IconList />
          </ToolbarBtn>
          <ToolbarBtn
            title="Nummerierte Liste"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <IconOrdered />
          </ToolbarBtn>
          <ToolbarBtn
            title="Zitat"
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <IconQuote />
          </ToolbarBtn>
          <ToolbarBtn
            title="Codeblock"
            active={editor.isActive("codeBlock")}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          >
            <IconCode />
          </ToolbarBtn>
          <ToolbarBtn
            title="Tabelle"
            active={editor.isActive("table")}
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          >
            <IconTable />
          </ToolbarBtn>
        </div>

        <div className="toolbar-group">
          <ToolbarBtn
            title="Bild einfügen"
            active={editor.isActive("imageResize") || editor.isActive("image")}
            disabled={busy || !customerId || !documentId}
            onClick={() => fileRef.current?.click()}
          >
            <IconImage />
          </ToolbarBtn>
        </div>

        <div className="toolbar-group toolbar-group-end">
          <ToolbarBtn title="Rückgängig" onClick={() => editor.chain().focus().undo().run()}>
            <IconUndo />
          </ToolbarBtn>
          <ToolbarBtn title="Wiederholen" onClick={() => editor.chain().focus().redo().run()}>
            <IconRedo />
          </ToolbarBtn>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadAndInsert(editor, file);
        }}
      />

      {error ? <p className="form-error editor-upload-error">{error}</p> : null}
      {busy ? <p className="muted editor-upload-hint">Bild wird hochgeladen…</p> : null}

      <EditorContent editor={editor} />
      <p className="editor-hint muted">
        Bilder per Toolbar, Einfügen aus der Zwischenablage oder Drag & Drop. Anfassen zum
        Verschieben, Ecken zum Skalieren.
      </p>
    </div>
  );
}

function ToolbarBtn({
  title,
  onClick,
  active,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`toolbar-btn${active ? " is-active" : ""}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function safeParse(raw: string) {
  try {
    return JSON.parse(raw) as object;
  } catch {
    return {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: raw }] }],
    };
  }
}

function iconProps() {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    "aria-hidden": true as const,
  };
}

function IconBold() {
  return (
    <svg {...iconProps()}>
      <path d="M7 5h6a3.5 3.5 0 010 7H7zm0 7h7a3.5 3.5 0 010 7H7z" strokeLinejoin="round" />
    </svg>
  );
}
function IconItalic() {
  return (
    <svg {...iconProps()}>
      <path d="M12 5h6M8 19h6M14.5 5l-5 14" strokeLinecap="round" />
    </svg>
  );
}
function IconUnderline() {
  return (
    <svg {...iconProps()}>
      <path d="M7 5v6a5 5 0 0010 0V5M6 19h12" strokeLinecap="round" />
    </svg>
  );
}
function IconList() {
  return (
    <svg {...iconProps()}>
      <path d="M9 7h11M9 12h11M9 17h11M5 7h.01M5 12h.01M5 17h.01" strokeLinecap="round" />
    </svg>
  );
}
function IconOrdered() {
  return (
    <svg {...iconProps()}>
      <path d="M10 7h11M10 12h11M10 17h11M4 6.5h2v4M4 14.5h2.5v.01M6.5 17H4" strokeLinecap="round" />
    </svg>
  );
}
function IconQuote() {
  return (
    <svg {...iconProps()}>
      <path d="M8 17h4l2-5V7H8v5h3zm7 0h4l2-5V7h-6v5h3z" strokeLinejoin="round" />
    </svg>
  );
}
function IconCode() {
  return (
    <svg {...iconProps()}>
      <path d="M9 8l-4 4 4 4M15 8l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconTable() {
  return (
    <svg {...iconProps()}>
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <path d="M4 10h16M4 14h16M10 5v14M14 5v14" />
    </svg>
  );
}
function IconImage() {
  return (
    <svg {...iconProps()}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M7 17l4-4 3 3 2-2 3 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconUndo() {
  return (
    <svg {...iconProps()}>
      <path d="M9 8H5V4M5 8a8 8 0 118 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconRedo() {
  return (
    <svg {...iconProps()}>
      <path d="M15 8h4V4M19 8a8 8 0 10-8 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
