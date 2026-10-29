/** Starter projects for Code Studio's “New Project…”. */
export interface Template {
  id: string;
  name: string;
  description: string;
  files: Record<string, string>;
  open: string;
}

export const TEMPLATES: Template[] = [
  {
    id: 'web',
    name: 'Web App',
    description: 'HTML, CSS and JavaScript with a live preview.',
    open: 'index.html',
    files: {
      'index.html': `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>My Web App</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <main>
      <h1>Hello, Golden Gate 👋</h1>
      <p>Edit <code>index.html</code>, <code>style.css</code> or <code>app.js</code> and press <kbd>Run</kbd>.</p>
      <button id="count">Clicked 0 times</button>
    </main>
    <script src="app.js"></script>
  </body>
</html>
`,
      'style.css': `:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: linear-gradient(135deg, #ff7a59, #c2185b); color: white; }
main { text-align: center; }
button { font: inherit; padding: .6em 1.2em; border: 0; border-radius: 999px; background: white; color: #c2185b; cursor: pointer; }
`,
      'app.js': `const button = document.getElementById('count');
let clicks = 0;
button.addEventListener('click', () => {
  clicks++;
  button.textContent = \`Clicked \${clicks} time\${clicks === 1 ? '' : 's'}\`;
  console.log('clicks:', clicks);
});
`,
      'README.md': '# My Web App\n\nPress **Run** (⌘R) to open the live preview.\n',
    },
  },
  {
    id: 'js',
    name: 'JavaScript',
    description: 'A script that prints to the Output panel.',
    open: 'main.js',
    files: {
      'main.js': `// Press Run (⌘R) — console output appears below.
const bridge = { name: 'Golden Gate', opened: 1937, lengthM: 2737 };
console.log(\`\${bridge.name} opened in \${bridge.opened}.\`);

const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));
console.log('First 10 Fibonacci numbers:', Array.from({ length: 10 }, (_, i) => fib(i)));
`,
    },
  },
  {
    id: 'ts',
    name: 'TypeScript',
    description: 'Typed code with live errors, compiled when you run it.',
    open: 'main.ts',
    files: {
      'main.ts': `// Type errors show up as you type; Run (⌘R) compiles and runs it.
interface Bridge {
  name: string;
  opened: number;
  spanM: number;
}

const bridges: Bridge[] = [
  { name: 'Golden Gate', opened: 1937, spanM: 1280 },
  { name: 'Akashi Kaikyō', opened: 1998, spanM: 1991 },
];

const longest = bridges.reduce((a, b) => (a.spanM > b.spanM ? a : b));
console.log(\`Longest main span: \${longest.name} (\${longest.spanM} m)\`);
`,
    },
  },
  {
    id: 'empty',
    name: 'Empty Folder',
    description: 'Start from nothing.',
    open: '',
    files: {},
  },
];
