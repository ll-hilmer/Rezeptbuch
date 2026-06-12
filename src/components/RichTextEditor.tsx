import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import BulletList from '@tiptap/extension-bullet-list';
import ListItem from '@tiptap/extension-list-item';
import { Bold, Italic, Underline as UnderlineIcon, List } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bold: {
          HTMLAttributes: { class: 'font-bold' },
        },
        italic: {
          HTMLAttributes: { class: 'italic' },
        },
        bulletList: false, // Customized below
      }),
      Underline,
      BulletList.configure({
        HTMLAttributes: { class: 'list-disc ml-4 space-y-1' },
      }),
      ListItem,
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[100px] p-4 bg-natural-bg rounded-2xl border border-transparent focus:border-natural-primary/20 transition-all',
      },
      handleKeyDown: (view, event) => {
        const isMod = event.ctrlKey || event.metaKey;
        const isShift = event.shiftKey;

        // Custom Shortcuts
        // Fett = strg + Umschalt + f
        if (isMod && isShift && event.key.toLowerCase() === 'f') {
          editor?.commands.toggleBold();
          return true;
        }

        // Kursiv = strg + Umschalt + k
        if (isMod && isShift && event.key.toLowerCase() === 'k') {
          editor?.commands.toggleItalic();
          return true;
        }

        // Unterstrichen = strg + Umschalt + u
        if (isMod && isShift && event.key.toLowerCase() === 'u') {
          editor?.commands.toggleUnderline();
          return true;
        }

        // Bullet Point = strg + .
        if (isMod && event.key === '.') {
          editor?.commands.toggleBulletList();
          return true;
        }

        return false;
      },
    },
  });

  // React to external value changes (e.g. form resets)
  React.useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value);
    }
  }, [value, editor]);

  if (!editor) return null;

  return (
    <div className="space-y-2">
      <div className="flex gap-1 p-1 bg-white border border-natural-bg rounded-xl w-fit">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('bold') ? 'bg-natural-primary text-white' : 'hover:bg-natural-bg text-natural-primary/60'}`}
          title="Fett (Strg+Shift+F)"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('italic') ? 'bg-natural-primary text-white' : 'hover:bg-natural-bg text-natural-primary/60'}`}
          title="Kursiv (Strg+Shift+K)"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('underline') ? 'bg-natural-primary text-white' : 'hover:bg-natural-bg text-natural-primary/60'}`}
          title="Unterstrichen (Strg+Shift+U)"
        >
          <UnderlineIcon className="w-4 h-4" />
        </button>
        <div className="w-[1px] bg-natural-bg mx-1 my-1" />
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-2 rounded-lg transition-colors ${editor.isActive('bulletList') ? 'bg-natural-primary text-white' : 'hover:bg-natural-bg text-natural-primary/60'}`}
          title="Aufzählung (Strg+.)"
        >
          <List className="w-4 h-4" />
        </button>
      </div>
      <EditorContent editor={editor} placeholder={placeholder} />
    </div>
  );
}
