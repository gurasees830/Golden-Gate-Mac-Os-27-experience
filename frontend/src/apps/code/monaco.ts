/** Monaco (the editor component of VS Code) with its language workers, loaded only when Code Studio opens. */
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === 'json') return new JsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new CssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new HtmlWorker();
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  },
};

const compiler = {
  target: monaco.typescript.ScriptTarget.ES2020,
  module: monaco.typescript.ModuleKind.ESNext,
  allowJs: true,
  allowNonTsExtensions: true,
  jsx: monaco.typescript.JsxEmit.React,
  strict: true,
  moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
};
monaco.typescript.typescriptDefaults.setCompilerOptions(compiler);
monaco.typescript.javascriptDefaults.setCompilerOptions(compiler);
monaco.typescript.typescriptDefaults.setEagerModelSync(true);

// A theme close to VS Code's "Dark Modern" chrome
monaco.editor.defineTheme('gg-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: { 'editor.background': '#1f1f1f', 'editorGutter.background': '#1f1f1f', 'editor.lineHighlightBackground': '#2a2d2e', 'editorLineNumber.foreground': '#6e7681', 'editorLineNumber.activeForeground': '#cccccc' },
});
monaco.editor.defineTheme('gg-light', { base: 'vs', inherit: true, rules: [], colors: { 'editor.background': '#ffffff' } });

const EXT_LANG: Record<string, string> = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', json: 'json', html: 'html', htm: 'html', css: 'css', scss: 'scss', less: 'less',
  md: 'markdown', py: 'python', java: 'java', c: 'c', h: 'c', cpp: 'cpp', cs: 'csharp', go: 'go', rs: 'rust', rb: 'ruby', php: 'php', sh: 'shell', yml: 'yaml', yaml: 'yaml', xml: 'xml', sql: 'sql', swift: 'swift', kt: 'kotlin', txt: 'plaintext',
};
export function languageFor(name: string): string {
  return EXT_LANG[name.split('.').pop()?.toLowerCase() ?? ''] ?? 'plaintext';
}

/** Compile a TypeScript model to JavaScript with the TypeScript worker. */
export async function emitJs(model: monaco.editor.ITextModel): Promise<string> {
  const get = await monaco.typescript.getTypeScriptWorker();
  const worker = await get(model.uri);
  const out = await worker.getEmitOutput(model.uri.toString());
  return out.outputFiles.find((f) => f.name.endsWith('.js'))?.text ?? '';
}

export { monaco };
