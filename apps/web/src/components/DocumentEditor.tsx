import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Table from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import ImageResize from "tiptap-extension-resize-image";
import { api } from "../api";
import { Callout } from "./editor/callout";
import { CodeBlockWithChrome } from "./editor/CodeBlockComponent";

interface Props {
  content: string;
  onChange: (json: string) => void;
  customerId?: string;
  documentId?: string;
}

/**
 * Wiki-Editor mit Toolbar, Blöcke-Dropdown (Panels/Code), Checklisten,
 * Bild-Upload und Tabellen.
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
      editor.chain().focus().setImage({ src, alt: file.name }).run();
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
        codeBlock: false,
      }),
      CodeBlockWithChrome,
      Callout,
      TaskList,
      TaskItem.configure({ nested: true }),
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
          <HeadingMenu editor={editor} />
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
            title="Checkliste"
            active={editor.isActive("taskList")}
            onClick={() => editor.chain().focus().toggleTaskList().run()}
          >
            <IconChecklist />
          </ToolbarBtn>
          <ToolbarBtn
            title="Zitat"
            active={editor.isActive("blockquote")}
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <IconQuote />
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
          <BlocksMenu editor={editor} />
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

      <div className="editor-body">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

const blockItems: {
  id: string;
  label: string;
  hint: string;
  run: (editor: Editor) => void;
  active?: (editor: Editor) => boolean;
}[] = [
  {
    id: "info",
    label: "Infopanel",
    hint: "Hinweise & Kontext",
    run: (ed) => ed.chain().focus().setCallout("info").run(),
    active: (ed) => ed.isActive("callout", { variant: "info" }),
  },
  {
    id: "warn",
    label: "Warnpanel",
    hint: "Vorsicht / Risiken",
    run: (ed) => ed.chain().focus().setCallout("warn").run(),
    active: (ed) => ed.isActive("callout", { variant: "warn" }),
  },
  {
    id: "tip",
    label: "Hinweispanel",
    hint: "Tipps & Best Practices",
    run: (ed) => ed.chain().focus().setCallout("tip").run(),
    active: (ed) => ed.isActive("callout", { variant: "tip" }),
  },
  {
    id: "danger",
    label: "Wichtig-Panel",
    hint: "Kritische Schritte",
    run: (ed) => ed.chain().focus().setCallout("danger").run(),
    active: (ed) => ed.isActive("callout", { variant: "danger" }),
  },
  {
    id: "code",
    label: "Codeblock",
    hint: "Mit Zeilen & Kopieren",
    run: (ed) => ed.chain().focus().toggleCodeBlock().run(),
    active: (ed) => ed.isActive("codeBlock"),
  },
];

/**
 * Dropdown für Überschriften H1–H3.
 */
function HeadingMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useDropdownDismiss(open, setOpen, rootRef);

  const activeLevel = editor.isActive("heading", { level: 1 })
    ? 1
    : editor.isActive("heading", { level: 2 })
      ? 2
      : editor.isActive("heading", { level: 3 })
        ? 3
        : 0;

  return (
    <div className={`toolbar-dropdown${open ? " is-open" : ""}`} ref={rootRef}>
      <ToolbarBtn
        title="Überschrift"
        active={open || activeLevel > 0}
        onClick={() => setOpen((v) => !v)}
        ariaExpanded={open}
      >
        <IconHeading />
        <span className="toolbar-btn-caret" aria-hidden>
          ▾
        </span>
      </ToolbarBtn>
      {open ? (
        <div className="toolbar-menu" role="menu" aria-label="Überschrift">
          {([1, 2, 3] as const).map((level) => (
            <button
              key={level}
              type="button"
              role="menuitem"
              className={`toolbar-menu-item${activeLevel === level ? " is-active" : ""}`}
              onClick={() => {
                editor.chain().focus().toggleHeading({ level }).run();
                setOpen(false);
              }}
            >
              <strong>H{level}</strong>
              <span>
                {level === 1 ? "Große Überschrift" : level === 2 ? "Mittel" : "Klein"}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Dropdown zum Einfügen von Panels und Codeblock.
 */
function BlocksMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useDropdownDismiss(open, setOpen, rootRef);

  const anyActive = editor.isActive("callout") || editor.isActive("codeBlock");

  return (
    <div className={`toolbar-dropdown${open ? " is-open" : ""}`} ref={rootRef}>
      <ToolbarBtn
        title="Einfügen"
        active={open || anyActive}
        onClick={() => setOpen((v) => !v)}
        ariaExpanded={open}
      >
        <span className="toolbar-btn-label">Einfügen</span>
        <span className="toolbar-btn-caret" aria-hidden>
          ▾
        </span>
      </ToolbarBtn>
      {open ? (
        <div className="toolbar-menu" role="menu" aria-label="Einfügen">
          {blockItems.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={`toolbar-menu-item${item.active?.(editor) ? " is-active" : ""}`}
              onClick={() => {
                item.run(editor);
                setOpen(false);
              }}
            >
              <strong>{item.label}</strong>
              <span>{item.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Schließt ein Toolbar-Dropdown bei Klick außerhalb oder Escape. */
function useDropdownDismiss(
  open: boolean,
  setOpen: (v: boolean | ((prev: boolean) => boolean)) => void,
  rootRef: RefObject<HTMLDivElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, rootRef, setOpen]);
}

function ToolbarBtn({
  title,
  onClick,
  active,
  disabled,
  children,
  ariaExpanded,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: ReactNode;
  ariaExpanded?: boolean;
}) {
  return (
    <button
      type="button"
      className={`toolbar-btn${active ? " is-active" : ""}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      aria-expanded={ariaExpanded}
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
    strokeWidth: 2,
    "aria-hidden": true as const,
  };
}

function IconHeading() {
  return (
    <svg {...iconProps()}>
      <path
        d="M8 7V17M16 7V17M16 12L8 12M7.8 21H16.2C17.8802 21 18.7202 21 19.362 20.673C19.9265 20.3854 20.3854 19.9265 20.673 19.362C21 18.7202 21 17.8802 21 16.2V7.8C21 6.11984 21 5.27976 20.673 4.63803C20.3854 4.07354 19.9265 3.6146 19.362 3.32698C18.7202 3 17.8802 3 16.2 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconBold() {
  return (
    <svg {...iconProps()}>
      <path
        d="M8.5 12H13C14.3807 12 15.5 10.8807 15.5 9.5C15.5 8.11929 14.3807 7 13 7H8.5V12ZM8.5 12H14C15.3807 12 16.5 13.1193 16.5 14.5C16.5 15.8807 15.3807 17 14 17H8.5V12ZM7.8 21H16.2C17.8802 21 18.7202 21 19.362 20.673C19.9265 20.3854 20.3854 19.9265 20.673 19.362C21 18.7202 21 17.8802 21 16.2V7.8C21 6.11984 21 5.27976 20.673 4.63803C20.3854 4.07354 19.9265 3.6146 19.362 3.32698C18.7202 3 17.8802 3 16.2 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconItalic() {
  return (
    <svg {...iconProps()}>
      <path
        d="M14 7L10 17M7.8 21H16.2C17.8802 21 18.7202 21 19.362 20.673C19.9265 20.3854 20.3854 19.9265 20.673 19.362C21 18.7202 21 17.8802 21 16.2V7.8C21 6.11984 21 5.27976 20.673 4.63803C20.3854 4.07354 19.9265 3.6146 19.362 3.32698C18.7202 3 17.8802 3 16.2 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconUnderline() {
  return (
    <svg {...iconProps()}>
      <path
        d="M15.5 7V10.5C15.5 12.433 13.933 14 12 14C10.067 14 8.5 12.433 8.5 10.5V7M8 17H16M7.8 21H16.2C17.8802 21 18.7202 21 19.362 20.673C19.9265 20.3854 20.3854 19.9265 20.673 19.362C21 18.7202 21 17.8802 21 16.2V7.8C21 6.11984 21 5.27976 20.673 4.63803C20.3854 4.07354 19.9265 3.6146 19.362 3.32698C18.7202 3 17.8802 3 16.2 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconList() {
  return (
    <svg {...iconProps()}>
      <path
        d="M21 5L10 5M21 19L10 19M21 12L10 12M6 5C6 5.82843 5.32843 6.5 4.5 6.5C3.67157 6.5 3 5.82843 3 5C3 4.17157 3.67157 3.5 4.5 3.5C5.32843 3.5 6 4.17157 6 5ZM6 19C6 19.8284 5.32843 20.5 4.5 20.5C3.67157 20.5 3 19.8284 3 19C3 18.1716 3.67157 17.5 4.5 17.5C5.32843 17.5 6 18.1716 6 19ZM6 12C6 12.8284 5.32843 13.5 4.5 13.5C3.67157 13.5 3 12.8284 3 12C3 11.1716 3.67157 10.5 4.5 10.5C5.32843 10.5 6 11.1716 6 12Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconOrdered() {
  return (
    <svg {...iconProps()}>
      <path
        d="M11 6H21M11 12H21M11 18H21M5 10V5M4 10h2.5M4 14.5c1.4 0 2.5.6 2.5 1.6S5.5 17.2 4.2 17.7c1.4.4 2.3 1.1 2.3 2.1S5.3 21.5 4 21.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconChecklist() {
  return (
    <svg {...iconProps()}>
      <path
        d="M9 11L12 14L22 4M16 3H7.8C6.11984 3 5.27976 3 4.63803 3.32698C4.07354 3.6146 3.6146 4.07354 3.32698 4.63803C3 5.27976 3 6.11984 3 7.8V16.2C3 17.8802 3 18.7202 3.32698 19.362C3.6146 19.9265 4.07354 20.3854 4.63803 20.673C5.27976 21 6.11984 21 7.8 21H16.2C17.8802 21 18.7202 21 19.362 20.673C19.9265 20.3854 20.3854 19.9265 20.673 19.362C21 18.7202 21 17.8802 21 16.2V12"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
function IconTable() {
  return (
    <svg {...iconProps()}>
      <path
        d="M3 9H21M9 9L9 21M7.8 3H16.2C17.8802 3 18.7202 3 19.362 3.32698C19.9265 3.6146 20.3854 4.07354 20.673 4.63803C21 5.27976 21 6.11984 21 7.8V16.2C21 17.8802 21 18.7202 20.673 19.362C20.3854 19.9265 19.9265 20.3854 19.362 20.673C18.7202 21 17.8802 21 16.2 21H7.8C6.11984 21 5.27976 21 4.63803 20.673C4.07354 20.3854 3.6146 19.9265 3.32698 19.362C3 18.7202 3 17.8802 3 16.2V7.8C3 6.11984 3 5.27976 3.32698 4.63803C3.6146 4.07354 4.07354 3.6146 4.63803 3.32698C5.27976 3 6.11984 3 7.8 3Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconImage() {
  return (
    <svg {...iconProps()}>
      <path
        d="M4.27209 20.7279L10.8686 14.1314C11.2646 13.7354 11.4627 13.5373 11.691 13.4632C11.8918 13.3979 12.1082 13.3979 12.309 13.4632C12.5373 13.5373 12.7354 13.7354 13.1314 14.1314L19.6839 20.6839M14 15L16.8686 12.1314C17.2646 11.7354 17.4627 11.5373 17.691 11.4632C17.8918 11.3979 18.1082 11.3979 18.309 11.4632C18.5373 11.5373 18.7354 11.7354 19.1314 12.1314L22 15M10 9C10 10.1046 9.10457 11 8 11C6.89543 11 6 10.1046 6 9C6 7.89543 6.89543 7 8 7C9.10457 7 10 7.89543 10 9ZM6.8 21H17.2C18.8802 21 19.7202 21 20.362 20.673C20.9265 20.3854 21.3854 19.9265 21.673 19.362C22 18.7202 22 17.8802 22 16.2V7.8C22 6.11984 22 5.27976 21.673 4.63803C21.3854 4.07354 20.9265 3.6146 20.362 3.32698C19.7202 3 18.8802 3 17.2 3H6.8C5.11984 3 4.27976 3 3.63803 3.32698C3.07354 3.6146 2.6146 4.07354 2.32698 4.63803C2 5.27976 2 6.11984 2 7.8V16.2C2 17.8802 2 18.7202 2.32698 19.362C2.6146 19.9265 3.07354 20.3854 3.63803 20.673C4.27976 21 5.11984 21 6.8 21Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconUndo() {
  return (
    <svg {...iconProps()}>
      <path
        d="M3 9H16.5C18.9853 9 21 11.0147 21 13.5C21 15.9853 18.9853 18 16.5 18H12M3 9L7 5M3 9L7 13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconRedo() {
  return (
    <svg {...iconProps()}>
      <path
        d="M21 9H7.5C5.01472 9 3 11.0147 3 13.5C3 15.9853 5.01472 18 7.5 18H12M21 9L17 5M21 9L17 13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
