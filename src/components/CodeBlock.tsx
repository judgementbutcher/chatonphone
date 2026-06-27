import { Check, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface CodeBlockProps {
  children: React.ReactNode;
  language?: string;
  blockNumber: number;
}

let highlighterPromise: Promise<any> | null = null;
let highlighterInstance: any = null;

const languageAliases: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  md: 'markdown',
  yml: 'yaml',
  sh: 'bash'
};

const supportedLanguages = new Set([
  'tsx',
  'typescript',
  'jsx',
  'javascript',
  'json',
  'bash',
  'python',
  'go',
  'rust',
  'html',
  'css',
  'sql',
  'yaml',
  'markdown',
  'xml'
]);

function normalizeLanguage(language: string | null | undefined) {
  if (!language) {
    return null;
  }

  const normalized = languageAliases[language.toLowerCase()] ?? language.toLowerCase();
  return supportedLanguages.has(normalized) ? normalized : null;
}

async function getHighlighter() {
  if (highlighterInstance) {
    return highlighterInstance;
  }

  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const { createHighlighterCore } = await import('shiki/core');
      const { createJavaScriptRegexEngine } = await import('shiki/engine/javascript');
      const [
        githubLight,
        githubDark,
        tsx,
        typescript,
        jsx,
        javascript,
        json,
        bash,
        python,
        go,
        rust,
        html,
        css,
        sql,
        yaml,
        markdown,
        xml
      ] = await Promise.all([
        import('@shikijs/themes/github-light'),
        import('@shikijs/themes/github-dark'),
        import('@shikijs/langs/tsx'),
        import('@shikijs/langs/typescript'),
        import('@shikijs/langs/jsx'),
        import('@shikijs/langs/javascript'),
        import('@shikijs/langs/json'),
        import('@shikijs/langs/bash'),
        import('@shikijs/langs/python'),
        import('@shikijs/langs/go'),
        import('@shikijs/langs/rust'),
        import('@shikijs/langs/html'),
        import('@shikijs/langs/css'),
        import('@shikijs/langs/sql'),
        import('@shikijs/langs/yaml'),
        import('@shikijs/langs/markdown'),
        import('@shikijs/langs/xml')
      ]);

      const instance = await createHighlighterCore({
        themes: [githubLight.default, githubDark.default],
        langs: [
          tsx.default,
          typescript.default,
          jsx.default,
          javascript.default,
          json.default,
          bash.default,
          python.default,
          go.default,
          rust.default,
          html.default,
          css.default,
          sql.default,
          yaml.default,
          markdown.default,
          xml.default
        ],
        engine: createJavaScriptRegexEngine()
      });

      highlighterInstance = instance;
      return instance;
    })();
  }

  return highlighterPromise;
}

function extractLanguage(children: React.ReactNode): string | null {
  if (!children || typeof children !== 'object') {
    return null;
  }

  if ('props' in children) {
    const props = (children as any).props;
    if (props?.className && typeof props.className === 'string') {
      const match = props.className.match(/language-(\w+)/);
      if (match) {
        return match[1];
      }
    }
  }

  return null;
}

function textFromNode(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(textFromNode).join('');
  }

  if (node && typeof node === 'object' && 'props' in node) {
    return textFromNode((node as { props?: { children?: unknown } }).props?.children);
  }

  return '';
}

export default function CodeBlock({ children, language: propLanguage, blockNumber }: CodeBlockProps) {
  const detectedLanguage = normalizeLanguage(propLanguage || extractLanguage(children));
  const codeText = textFromNode(children).replace(/\n$/, '');
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lineCount = codeText.split('\n').length;
  const charCount = codeText.length;
  const needsCollapse = lineCount > 18 || charCount > 600;

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains('dark');
    setIsDark(isDarkMode);

    const observer = new MutationObserver(() => {
      const isDarkMode = document.documentElement.classList.contains('dark');
      setIsDark(isDarkMode);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!detectedLanguage) {
      setHighlightedHtml(null);
      return;
    }

    let isCancelled = false;
    setHighlightedHtml(null);

    (async () => {
      try {
        const highlighter = await getHighlighter();
        const theme = isDark ? 'github-dark' : 'github-light';

        const loadedLanguages = highlighter.getLoadedLanguages();

        if (loadedLanguages.includes(detectedLanguage)) {
          const html = highlighter.codeToHtml(codeText, {
            lang: detectedLanguage,
            theme
          });
          if (!isCancelled) {
            setHighlightedHtml(html);
          }
        }
      } catch (error) {
        // Fallback to plain text if highlighting fails
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [detectedLanguage, codeText, isDark]);

  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current) {
        clearTimeout(copyResetTimerRef.current);
      }
    };
  }, []);

  function handleCopy() {
    void navigator.clipboard?.writeText(codeText);
    setIsCopied(true);
    if (copyResetTimerRef.current) {
      clearTimeout(copyResetTimerRef.current);
    }
    copyResetTimerRef.current = setTimeout(() => {
      setIsCopied(false);
      copyResetTimerRef.current = null;
    }, 1600);
  }

  return (
    <div className="my-3 overflow-hidden rounded-[1rem] bg-zinc-950 text-zinc-50 shadow-[0_16px_44px_rgb(0_0_0_/_0.24),inset_0_0_0_1px_rgb(63_63_70_/_0.82)]">
      <div className="flex items-center justify-between bg-zinc-900/[0.88] px-3 py-2 shadow-[inset_0_-1px_0_rgb(63_63_70_/_0.7)]">
        <div className="flex items-center gap-2">
          {detectedLanguage && (
            <span className="chip rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              {detectedLanguage}
            </span>
          )}
          {!detectedLanguage && (
            <span className="text-xs font-medium text-zinc-400">代码</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {needsCollapse && (
            <button
              type="button"
              className="inline-flex h-7 items-center gap-1.5 rounded-full bg-zinc-800 px-2.5 text-xs text-zinc-200 shadow-[inset_0_0_0_1px_rgb(113_113_122_/_0.55)] transition hover:bg-zinc-700"
              aria-label={isExpanded ? '收起代码' : '展开代码'}
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <>
                  <ChevronUp aria-hidden="true" size={12} strokeWidth={2.25} />
                  收起
                </>
              ) : (
                <>
                  <ChevronDown aria-hidden="true" size={12} strokeWidth={2.25} />
                  展开
                </>
              )}
            </button>
          )}
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-zinc-800 px-2.5 text-xs text-zinc-200 shadow-[inset_0_0_0_1px_rgb(113_113_122_/_0.55)] transition hover:bg-zinc-700"
            aria-label={`复制代码块 ${blockNumber}`}
            onClick={handleCopy}
          >
            {isCopied ? (
              <>
                <Check aria-hidden="true" size={12} strokeWidth={2.25} />
                已复制
              </>
            ) : (
              <>
                <Copy aria-hidden="true" size={12} strokeWidth={2.25} />
                复制
              </>
            )}
          </button>
        </div>
      </div>
      <div
        className={`relative overflow-hidden ${
          needsCollapse && !isExpanded ? 'max-h-72' : ''
        }`}
      >
        {highlightedHtml ? (
          <div
            className="overflow-x-auto [&_pre]:!bg-transparent [&_pre]:p-3 [&_pre]:text-sm [&_pre]:leading-6 [&_pre]:m-0"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : (
          <pre className="overflow-x-auto p-3 text-sm leading-6">{children}</pre>
        )}
        {needsCollapse && !isExpanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-zinc-950 to-transparent" />
        )}
      </div>
    </div>
  );
}
