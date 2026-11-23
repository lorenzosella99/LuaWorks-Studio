import { Children, isValidElement, type ReactElement, type ReactNode, useMemo, useState } from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js/lib/common';
import { Check, Copy, Github } from 'lucide-react';
import type { ChatMode } from '../types';

type Props = {
  content: string;
  mode: ChatMode;
  onSaveCode: (code: string, language: string) => void;
  onToast: (message: string) => void;
};

function CodeBlock({
  code,
  language,
  mode,
  onSaveCode,
  onToast,
}: {
  code: string;
  language: string;
  mode: ChatMode;
  onSaveCode: (code: string, language: string) => void;
  onToast: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const chars = Array.from(code).length;
  const overLimit = mode === 'stormworks' && chars > 4096;
  const highlighted = useMemo(() => {
    try {
      if (language && hljs.getLanguage(language)) return hljs.highlight(code, { language }).value;
      return hljs.highlightAuto(code).value;
    } catch {
      return code.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    }
  }, [code, language]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      onToast('Código copiado.');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      onToast('Não foi possível copiar automaticamente neste navegador.');
    }
  }

  return (
    <section className={`code-block ${overLimit ? 'code-block--over' : ''}`}>
      <div className="code-toolbar">
        <span className="code-language">{language || 'código'}</span>
        <div className="code-actions">
          {mode === 'stormworks' && (
            <span className={`char-count ${overLimit ? 'char-count--over' : ''}`}>
              {chars.toLocaleString('pt-BR')} / 4.096 caracteres
            </span>
          )}
          <button className="code-action" onClick={copyCode} type="button" title="Copiar código">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? 'Copiado' : 'Copiar'}</span>
          </button>
          <button className="code-action code-action--github" onClick={() => onSaveCode(code, language)} type="button">
            <Github size={14} />
            <span>Salvar no GitHub</span>
          </button>
        </div>
      </div>
      {overLimit && <div className="code-warning">Este bloco ultrapassa o limite de 4.096 caracteres do Stormworks.</div>}
      <pre className="highlighted-code"><code className="hljs" dangerouslySetInnerHTML={{ __html: highlighted }} /></pre>
    </section>
  );
}

function getCodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getCodeText).join('');
  if (isValidElement(node)) return getCodeText((node as ReactElement<{ children?: ReactNode }>).props.children);
  return '';
}

function GeneratedImage({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="generated-image-trigger" onClick={() => setOpen(true)} aria-label="Ampliar imagem">
        <img className="generated-image" src={src} alt={alt} loading="lazy" />
      </button>
      {open && (
        <div className="image-viewer" role="dialog" aria-modal="true" aria-label="Imagem ampliada" onClick={() => setOpen(false)}>
          <button type="button" className="image-viewer-close" onClick={() => setOpen(false)} aria-label="Fechar imagem">×</button>
          <img src={src} alt={alt} className="image-viewer-full" onClick={(event) => event.stopPropagation()} />
        </div>
      )}
    </>
  );
}

export default function MarkdownMessage({ content, mode, onSaveCode, onToast }: Props) {
  const components: Components = {
    pre({ children }) {
      const first = Children.toArray(children)[0];
      const languageClass = isValidElement(first)
        ? String((first.props as { className?: string }).className ?? '')
        : '';
      const language = languageClass.replace(/^language-/, '').trim();
      const code = getCodeText(first).replace(/\n$/, '');
      return <CodeBlock code={code} language={language} mode={mode} onSaveCode={onSaveCode} onToast={onToast} />;
    },
    code({ children, className }) {
      return <code className={className}>{children}</code>;
    },
    a({ href, children }) {
      return <a href={href} target="_blank" rel="noreferrer">{children}</a>;
    },
    img({ src, alt }) {
      if (!src) return null;
      return <GeneratedImage src={src} alt={alt ?? 'Imagem gerada'} />;
    },
    table({ children }) {
      return <div className="markdown-table-wrap"><table>{children}</table></div>;
    },
  };

  return (
    <div className="markdown-content">
      <ReactMarkdown\n        remarkPlugins={[remarkGfm]}\n        components={components}\n        urlTransform={(url) => /^data:image\\/(?:png|jpe?g|webp|gif);base64,/i.test(url) ? url : defaultUrlTransform(url)}\n      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
