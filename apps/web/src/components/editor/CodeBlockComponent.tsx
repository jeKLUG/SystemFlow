import CodeBlock from "@tiptap/extension-code-block";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useEffect, useState } from "react";

/**
 * Codeblock mit Zeilennummern und Kopieren-Bestätigung.
 */
function CodeBlockView({ node }: NodeViewProps) {
  const [copied, setCopied] = useState(false);
  const text = node.textContent;
  const lineCount = Math.max(1, text.split("\n").length);
  const gutter = Array.from({ length: lineCount }, (_, i) => String(i + 1)).join("\n");

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(t);
  }, [copied]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <NodeViewWrapper className="code-block-view" data-type="codeBlock">
      <div className="code-block-chrome" contentEditable={false}>
        <span className="code-block-label">Code</span>
        <button
          type="button"
          className={`code-block-copy${copied ? " is-copied" : ""}`}
          onClick={() => void copyCode()}
          title={copied ? "In Zwischenablage kopiert" : "Code kopieren"}
        >
          {copied ? "Kopiert!" : "Kopieren"}
        </button>
      </div>
      <div className="code-block-body">
        <pre className="code-block-gutter" aria-hidden>
          {gutter}
        </pre>
        <pre className="code-block-pre">
          <NodeViewContent as="code" className="code-block-code" />
        </pre>
      </div>
    </NodeViewWrapper>
  );
}

/**
 * TipTap-Codeblock mit React-NodeView (Zeilen + Kopieren).
 */
export const CodeBlockWithChrome = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },
});
