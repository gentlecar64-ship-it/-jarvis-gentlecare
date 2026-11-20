'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_ROOT = path.resolve(__dirname, '..', 'knowledge');

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function listMarkdownFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const files = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) files.push(fullPath);
    }
  }
  return files.sort();
}

class KnowledgeManager {
  constructor(options = {}) {
    this.rootDir = path.resolve(options.rootDir || DEFAULT_ROOT);
    this.documents = [];
    this.loadedAt = null;
    this.errors = [];
  }

  initialize() {
    this.errors = [];
    this.documents = listMarkdownFiles(this.rootDir).map((filePath) => {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const relativePath = path.relative(this.rootDir, filePath).replaceAll(path.sep, '/');
        return {
          path: relativePath,
          title: this.extractTitle(content) || path.basename(filePath, '.md'),
          content,
          normalized: normalize(`${relativePath}\n${content}`),
          modifiedAt: fs.statSync(filePath).mtime.toISOString()
        };
      } catch (error) {
        this.errors.push({ path: filePath, message: error.message });
        return null;
      }
    }).filter(Boolean);
    this.loadedAt = new Date().toISOString();
    return this.status();
  }

  extractTitle(content) {
    const match = String(content || '').match(/^#\s+(.+)$/m);
    return match ? match[1].trim() : '';
  }

  ensureLoaded() {
    if (!this.loadedAt) this.initialize();
  }

  search(query, options = {}) {
    this.ensureLoaded();
    const terms = normalize(query).split(/\s+/).filter((term) => term.length > 1);
    if (!terms.length) return [];
    const limit = Math.max(1, Math.min(Number(options.limit || 8), 50));
    return this.documents
      .map((document) => {
        const score = terms.reduce((total, term) => {
          let points = 0;
          if (normalize(document.path).includes(term)) points += 5;
          if (normalize(document.title).includes(term)) points += 4;
          const matches = document.normalized.split(term).length - 1;
          return total + points + Math.min(matches, 10);
        }, 0);
        return { document, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.document.path.localeCompare(b.document.path))
      .slice(0, limit)
      .map(({ document, score }) => ({
        path: document.path,
        title: document.title,
        score,
        excerpt: this.excerpt(document.content, terms)
      }));
  }

  excerpt(content, terms) {
    const text = String(content || '').replace(/\s+/g, ' ').trim();
    const normalizedText = normalize(text);
    const positions = terms.map((term) => normalizedText.indexOf(term)).filter((index) => index >= 0);
    const start = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 180);
    return text.slice(start, start + 700);
  }

  getContext(query, options = {}) {
    this.ensureLoaded();
    const maxCharacters = Math.max(1000, Math.min(Number(options.maxCharacters || 12000), 50000));
    const matches = this.search(query, { limit: options.limit || 8 });
    let used = 0;
    const documents = [];
    for (const match of matches) {
      const document = this.documents.find((item) => item.path === match.path);
      if (!document) continue;
      const remaining = maxCharacters - used;
      if (remaining <= 0) break;
      const content = document.content.slice(0, remaining);
      used += content.length;
      documents.push({ path: document.path, title: document.title, content });
    }
    return { query: String(query || ''), generatedAt: new Date().toISOString(), documents };
  }

  getDocument(relativePath) {
    this.ensureLoaded();
    const cleanPath = String(relativePath || '').replaceAll('\\', '/').replace(/^\/+/, '');
    return this.documents.find((document) => document.path === cleanPath) || null;
  }

  status() {
    return {
      ready: Boolean(this.loadedAt),
      rootDir: this.rootDir,
      loadedAt: this.loadedAt,
      documentCount: this.documents.length,
      errorCount: this.errors.length,
      errors: this.errors.slice(0, 10)
    };
  }
}

const knowledgeManager = new KnowledgeManager();

module.exports = { KnowledgeManager, knowledgeManager };
