import { lazy } from 'react';
import type { AppCategory, AppDefinition } from '../../types';

/**
 * Web apps in the App Store: the real services, launched from Golden Gate.
 * Most of these sites forbid being shown inside another page, so they open in their own
 * browser window (`popup`); the few that allow embedding open inside Safari (`safari`).
 * Icons are original monograms in each service's colours, not the services' logos.
 */
export interface WebApp {
  id: string;
  name: string;
  url: string;
  category: AppCategory;
  colors: [string, string];
  glyph: string;
  subtitle: string;
  keywords: string;
  mode?: 'popup' | 'safari';
}

const S = 'social media network chat friends';
export const WEB_APPS: WebApp[] = [
  // Social
  { id: 'web.instagram', name: 'Instagram', url: 'https://www.instagram.com/', category: 'Social', colors: ['#f9ce34', '#c13584'], glyph: 'Ig', subtitle: 'Photos, Reels and Stories', keywords: `${S} photo reels stories` },
  { id: 'web.whatsapp', name: 'WhatsApp', url: 'https://web.whatsapp.com/', category: 'Social', colors: ['#5df27a', '#128c4b'], glyph: 'W', subtitle: 'Messages and calls with your phone', keywords: `${S} messenger messaging` },
  { id: 'web.facebook', name: 'Facebook', url: 'https://www.facebook.com/', category: 'Social', colors: ['#4c8dff', '#1450c9'], glyph: 'f', subtitle: 'Friends, groups and Marketplace', keywords: `${S} meta groups marketplace` },
  { id: 'web.messenger', name: 'Messenger', url: 'https://www.messenger.com/', category: 'Social', colors: ['#00c6ff', '#a033ff'], glyph: 'M', subtitle: 'Chat with Facebook friends', keywords: `${S} messaging meta` },
  { id: 'web.x', name: 'X', url: 'https://x.com/', category: 'Social', colors: ['#3a3a3c', '#000000'], glyph: 'X', subtitle: 'What’s happening right now', keywords: `${S} twitter tweets news` },
  { id: 'web.threads', name: 'Threads', url: 'https://www.threads.net/', category: 'Social', colors: ['#444', '#0a0a0a'], glyph: '@', subtitle: 'Share text updates', keywords: `${S} meta posts` },
  { id: 'web.linkedin', name: 'LinkedIn', url: 'https://www.linkedin.com/', category: 'Social', colors: ['#2a8de0', '#0a5aa8'], glyph: 'in', subtitle: 'Your professional network', keywords: `${S} jobs career professional work` },
  { id: 'web.reddit', name: 'Reddit', url: 'https://www.reddit.com/', category: 'Social', colors: ['#ff7a3d', '#ff3d00'], glyph: 'r/', subtitle: 'Communities for every interest', keywords: `${S} forum communities news` },
  { id: 'web.tiktok', name: 'TikTok', url: 'https://www.tiktok.com/', category: 'Social', colors: ['#25f4ee', '#fe2c55'], glyph: '♪', subtitle: 'Short videos', keywords: `${S} video short` },
  { id: 'web.snapchat', name: 'Snapchat', url: 'https://web.snapchat.com/', category: 'Social', colors: ['#fffc00', '#f5c400'], glyph: 'S', subtitle: 'Snaps and chat', keywords: `${S} photo messaging` },
  { id: 'web.pinterest', name: 'Pinterest', url: 'https://www.pinterest.com/', category: 'Social', colors: ['#ff4f5e', '#c8102e'], glyph: 'P', subtitle: 'Ideas and inspiration', keywords: `${S} ideas boards inspiration` },
  { id: 'web.telegram', name: 'Telegram', url: 'https://web.telegram.org/', category: 'Social', colors: ['#5ec6ff', '#1f8fd8'], glyph: '➤', subtitle: 'Fast, secure messaging', keywords: `${S} messenger messaging` },
  { id: 'web.discord', name: 'Discord', url: 'https://discord.com/app', category: 'Social', colors: ['#7983f5', '#4752c4'], glyph: 'D', subtitle: 'Talk with communities and friends', keywords: `${S} voice gaming servers` },
  // Entertainment & music
  { id: 'web.youtube', name: 'YouTube', url: 'https://www.youtube.com/', category: 'Entertainment', colors: ['#ff4e45', '#d40000'], glyph: '▶', subtitle: 'Watch videos in Safari', keywords: 'video streaming music social media', mode: 'safari' },
  { id: 'web.netflix', name: 'Netflix', url: 'https://www.netflix.com/', category: 'Entertainment', colors: ['#3a0b0b', '#000'], glyph: 'N', subtitle: 'Films and series', keywords: 'movies tv streaming shows' },
  { id: 'web.primevideo', name: 'Prime Video', url: 'https://www.primevideo.com/', category: 'Entertainment', colors: ['#2fb5ff', '#0f79af'], glyph: 'pv', subtitle: 'Films, series and sport', keywords: 'movies tv streaming amazon' },
  { id: 'web.twitch', name: 'Twitch', url: 'https://www.twitch.tv/', category: 'Entertainment', colors: ['#a970ff', '#6441a5'], glyph: 'T', subtitle: 'Live streams', keywords: 'live streaming gaming social media' },
  { id: 'web.spotify', name: 'Spotify', url: 'https://open.spotify.com/', category: 'Music', colors: ['#3be477', '#13923f'], glyph: '≋', subtitle: 'Music and podcasts', keywords: 'music podcasts streaming songs' },
  // Productivity
  { id: 'web.gmail', name: 'Gmail', url: 'https://mail.google.com/', category: 'Productivity', colors: ['#ff6a5c', '#d93025'], glyph: 'G', subtitle: 'Google email', keywords: 'email mail google inbox' },
  { id: 'web.drive', name: 'Google Drive', url: 'https://drive.google.com/', category: 'Productivity', colors: ['#5fb6ff', '#1a73e8'], glyph: '△', subtitle: 'Your files in the cloud', keywords: 'cloud storage files google docs' },
  { id: 'web.docs', name: 'Google Docs', url: 'https://docs.google.com/', category: 'Productivity', colors: ['#6aa5ff', '#2a62d4'], glyph: '≡', subtitle: 'Documents together', keywords: 'documents word writing google' },
  { id: 'web.outlook', name: 'Outlook', url: 'https://outlook.live.com/', category: 'Productivity', colors: ['#3aa0f3', '#0a5eb8'], glyph: 'O', subtitle: 'Microsoft email and calendar', keywords: 'email mail microsoft calendar' },
  { id: 'web.teams', name: 'Microsoft Teams', url: 'https://teams.microsoft.com/', category: 'Productivity', colors: ['#7b83eb', '#4b53bc'], glyph: 'T', subtitle: 'Meetings and chat for work', keywords: 'meetings video chat work microsoft' },
  { id: 'web.zoom', name: 'Zoom', url: 'https://app.zoom.us/wc', category: 'Productivity', colors: ['#4aa3ff', '#0b5cff'], glyph: 'Z', subtitle: 'Video meetings', keywords: 'meetings video calls' },
  { id: 'web.slack', name: 'Slack', url: 'https://app.slack.com/', category: 'Productivity', colors: ['#7a2f7c', '#4a154b'], glyph: '#', subtitle: 'Team chat', keywords: 'chat work team messaging' },
  { id: 'web.notion', name: 'Notion', url: 'https://www.notion.so/', category: 'Productivity', colors: ['#fafafa', '#d9d9d9'], glyph: 'N', subtitle: 'Notes, docs and wikis', keywords: 'notes docs wiki tasks' },
  { id: 'web.trello', name: 'Trello', url: 'https://trello.com/', category: 'Productivity', colors: ['#3a8cf5', '#0052cc'], glyph: '▥', subtitle: 'Boards for any project', keywords: 'kanban tasks project management' },
  { id: 'web.chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com/', category: 'Productivity', colors: ['#2fc5a0', '#0f8a6d'], glyph: '✦', subtitle: 'AI assistant by OpenAI', keywords: 'ai assistant chat gpt' },
  { id: 'web.claude', name: 'Claude', url: 'https://claude.ai/', category: 'Productivity', colors: ['#e8a17a', '#c4633a'], glyph: '✳', subtitle: 'AI assistant by Anthropic', keywords: 'ai assistant chat' },
  { id: 'web.gemini', name: 'Gemini', url: 'https://gemini.google.com/', category: 'Productivity', colors: ['#78a6ff', '#8a5cf6'], glyph: '✧', subtitle: 'AI assistant by Google', keywords: 'ai assistant chat google' },
  // Design & development
  { id: 'web.canva', name: 'Canva', url: 'https://www.canva.com/', category: 'Graphics & Design', colors: ['#3fd0e0', '#7d2ae8'], glyph: 'C', subtitle: 'Design anything', keywords: 'design graphics posters social media' },
  { id: 'web.figma', name: 'Figma', url: 'https://www.figma.com/', category: 'Graphics & Design', colors: ['#ff7262', '#a259ff'], glyph: 'F', subtitle: 'Design and prototype together', keywords: 'design ui prototype' },
  { id: 'web.vscode', name: 'VS Code for the Web', url: 'https://vscode.dev/', category: 'Developer Tools', colors: ['#3aa6f5', '#0065a9'], glyph: '</>', subtitle: 'The real Visual Studio Code in a browser window', keywords: 'visual studio code vscode editor ide programming microsoft' },
  { id: 'web.github', name: 'GitHub', url: 'https://github.com/', category: 'Developer Tools', colors: ['#3b3f46', '#0d1117'], glyph: 'GH', subtitle: 'Code hosting and collaboration', keywords: 'git code repositories developer social' },
  { id: 'web.stackoverflow', name: 'Stack Overflow', url: 'https://stackoverflow.com/', category: 'Developer Tools', colors: ['#ffa043', '#e7700d'], glyph: 'SO', subtitle: 'Answers for developers', keywords: 'questions programming developer help' },
  { id: 'web.codepen', name: 'CodePen', url: 'https://codepen.io/', category: 'Developer Tools', colors: ['#3a3a3a', '#111'], glyph: '◇', subtitle: 'Front-end playground', keywords: 'html css javascript playground' },
  { id: 'web.replit', name: 'Replit', url: 'https://replit.com/', category: 'Developer Tools', colors: ['#ff8a3d', '#f26207'], glyph: 'R', subtitle: 'Code and run in the cloud', keywords: 'ide cloud programming python' },
  // Reference
  { id: 'web.wikipedia', name: 'Wikipedia', url: 'https://en.wikipedia.org/', category: 'Reference', colors: ['#fafafa', '#cfcfcf'], glyph: 'W', subtitle: 'The free encyclopedia, in Safari', keywords: 'encyclopedia knowledge reference', mode: 'safari' },
  { id: 'web.duolingo', name: 'Duolingo', url: 'https://www.duolingo.com/', category: 'Reference', colors: ['#7ee03a', '#46a302'], glyph: 'D', subtitle: 'Learn a language', keywords: 'language learning education' },
];

export const webApp = (id: string) => WEB_APPS.find((w) => w.id === id);

const Launcher = lazy(() => import('./WebApp'));

export const WEB_APP_DEFS: AppDefinition[] = WEB_APPS.map((w) => ({
  id: w.id,
  name: w.name,
  component: Launcher,
  window: { width: 440, height: 360, minWidth: 380, minHeight: 300, singleton: true },
  category: w.category,
  store: {
    subtitle: w.subtitle,
    description:
      w.mode === 'safari'
        ? `${w.name} opens inside Golden Gate’s Safari.`
        : `Opens the real ${w.name} (${new URL(w.url).hostname}). ${w.name} doesn’t allow other sites to show it inside them, so it runs in its own browser window, where you sign in to your own account as usual.`,
    version: 'Web',
    sizeMB: 1,
    whatsNew: 'Always the latest version — it’s the live website.',
    features: ['Web app', w.mode === 'safari' ? 'Opens in Safari' : 'Own browser window', 'Your own account'],
    status: 'implemented',
    keywords: w.keywords,
  },
}));
