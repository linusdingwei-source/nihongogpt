/**
 * Anki Package (.apkg) Parser
 * 
 * Parses Anki deck packages in the browser using JSZip and sql.js
 * Supports extracting cards, notes, and media files
 */

import JSZip from 'jszip';
import initSqlJs, { Database } from 'sql.js';

// Field separator used by Anki
const FIELD_SEPARATOR = '\x1f';

// SQL.js WASM URL (loaded from CDN)
const SQL_WASM_URL = 'https://sql.js.org/dist/sql-wasm.wasm';

export interface AnkiNote {
  id: number;
  mid: number;  // Model ID
  fields: string[];
  tags: string;
}

export interface AnkiCard {
  id: number;
  nid: number;  // Note ID
  did: number;  // Deck ID
  ord: number;  // Card ordinal (for multi-card notes)
}

export interface AnkiDeck {
  id: number;
  name: string;
}

export interface AnkiModel {
  id: number;
  name: string;
  fields: string[];  // Field names
  type: number;      // 0 = standard, 1 = cloze
}

export interface AnkiMedia {
  index: string;     // Media file index (e.g., "0", "1")
  filename: string;  // Original filename
  data: Blob;        // File data
  type: string;      // MIME type
}

export interface ParsedAnkiCard {
  frontContent: string;
  backContent: string;
  tags: string[];
  deckName: string;
  modelName: string;
  isCloze: boolean;
  mediaRefs: string[];  // Media filenames referenced
}

export interface AnkiParseResult {
  cards: ParsedAnkiCard[];
  decks: AnkiDeck[];
  models: AnkiModel[];
  media: AnkiMedia[];
  totalNotes: number;
  totalCards: number;
}

export interface AnkiParseProgress {
  stage: 'extracting' | 'parsing' | 'processing' | 'media' | 'complete';
  current: number;
  total: number;
  message: string;
}

/**
 * Parse an Anki .apkg file
 */
export async function parseAnkiPackage(
  file: File,
  onProgress?: (progress: AnkiParseProgress) => void
): Promise<AnkiParseResult> {
  const report = (stage: AnkiParseProgress['stage'], current: number, total: number, message: string) => {
    onProgress?.({ stage, current, total, message });
  };

  // Stage 1: Extract ZIP
  report('extracting', 0, 100, 'Extracting package...');
  const zip = await JSZip.loadAsync(file);
  
  // Find the SQLite database file
  const dbFile = zip.file('collection.anki21') || zip.file('collection.anki2');
  if (!dbFile) {
    throw new Error('Invalid Anki package: no collection database found');
  }

  report('extracting', 50, 100, 'Loading database...');
  const dbData = await dbFile.async('uint8array');

  // Stage 2: Parse SQLite
  report('parsing', 0, 100, 'Initializing SQL parser...');
  const SQL = await initSqlJs({
    locateFile: () => SQL_WASM_URL,
  });
  
  const db = new SQL.Database(dbData);

  report('parsing', 30, 100, 'Reading collection data...');

  // Parse collection metadata (decks, models)
  const colResult = db.exec('SELECT decks, models FROM col LIMIT 1');
  if (!colResult.length || !colResult[0].values.length) {
    throw new Error('Invalid Anki database: no collection data');
  }

  const [decksJson, modelsJson] = colResult[0].values[0] as [string, string];
  const decksData = JSON.parse(decksJson) as Record<string, { id: number; name: string }>;
  const modelsData = JSON.parse(modelsJson) as Record<string, {
    id: number;
    name: string;
    flds: Array<{ name: string }>;
    type: number;
  }>;

  // Build deck and model maps
  const decks: AnkiDeck[] = Object.values(decksData).map(d => ({
    id: typeof d.id === 'string' ? parseInt(d.id) : d.id,
    name: d.name,
  }));
  
  const deckMap = new Map(decks.map(d => [d.id, d.name]));

  const models: AnkiModel[] = Object.values(modelsData).map(m => ({
    id: typeof m.id === 'string' ? parseInt(m.id) : m.id,
    name: m.name,
    fields: m.flds.map(f => f.name),
    type: m.type,
  }));
  
  const modelMap = new Map(models.map(m => [m.id, m]));

  report('parsing', 60, 100, 'Reading notes...');

  // Read all notes
  const notesResult = db.exec('SELECT id, mid, flds, tags FROM notes');
  const notes: AnkiNote[] = notesResult.length ? notesResult[0].values.map((row: (number | string | Uint8Array | null)[]) => ({
    id: row[0] as number,
    mid: row[1] as number,
    fields: (row[2] as string).split(FIELD_SEPARATOR),
    tags: row[3] as string,
  })) : [];

  const noteMap = new Map(notes.map(n => [n.id, n]));

  report('parsing', 80, 100, 'Reading cards...');

  // Read all cards
  const cardsResult = db.exec('SELECT id, nid, did, ord FROM cards');
  const ankiCards: AnkiCard[] = cardsResult.length ? cardsResult[0].values.map((row: (number | string | Uint8Array | null)[]) => ({
    id: row[0] as number,
    nid: row[1] as number,
    did: row[2] as number,
    ord: row[3] as number,
  })) : [];

  db.close();

  // Stage 3: Process cards
  report('processing', 0, ankiCards.length, 'Processing cards...');

  const parsedCards: ParsedAnkiCard[] = [];
  
  for (let i = 0; i < ankiCards.length; i++) {
    const card = ankiCards[i];
    const note = noteMap.get(card.nid);
    if (!note) continue;

    const model = modelMap.get(note.mid);
    if (!model) continue;

    const deckName = deckMap.get(card.did) || 'Default';
    const isCloze = model.type === 1;

    // Extract front and back content
    let frontContent = '';
    let backContent = '';

    if (model.fields.length >= 2) {
      // Standard 2+ field model: first field is front, second is back
      frontContent = note.fields[0] || '';
      backContent = note.fields[1] || '';
      
      // If there are more fields, append them to back
      if (note.fields.length > 2) {
        const extraFields = note.fields.slice(2).filter(f => f.trim());
        if (extraFields.length > 0) {
          backContent += '<hr>' + extraFields.join('<br>');
        }
      }
    } else if (model.fields.length === 1) {
      // Single field model (often cloze)
      frontContent = note.fields[0] || '';
      backContent = note.fields[0] || '';
    }

    // Handle cloze deletions
    if (isCloze) {
      const clozeNum = card.ord + 1;
      frontContent = convertClozeFront(frontContent, clozeNum);
      backContent = convertClozeBack(backContent, clozeNum);
    }

    // Extract media references
    const mediaRefs = extractMediaRefs(frontContent + backContent);

    // Parse tags
    const tags = note.tags.trim().split(/\s+/).filter(t => t);

    parsedCards.push({
      frontContent: sanitizeHtml(frontContent),
      backContent: sanitizeHtml(backContent),
      tags,
      deckName,
      modelName: model.name,
      isCloze,
      mediaRefs,
    });

    if (i % 100 === 0) {
      report('processing', i, ankiCards.length, `Processing card ${i + 1}/${ankiCards.length}...`);
    }
  }

  // Stage 4: Extract media files
  report('media', 0, 100, 'Extracting media files...');
  
  const media: AnkiMedia[] = [];
  const mediaJsonFile = zip.file('media');
  
  if (mediaJsonFile) {
    const mediaJson = await mediaJsonFile.async('string');
    const mediaMap: Record<string, string> = JSON.parse(mediaJson);
    
    const mediaEntries = Object.entries(mediaMap);
    for (let i = 0; i < mediaEntries.length; i++) {
      const [index, filename] = mediaEntries[i];
      const mediaFile = zip.file(index);
      
      if (mediaFile) {
        const data = await mediaFile.async('blob');
        const type = getMimeType(filename);
        
        media.push({
          index,
          filename,
          data,
          type,
        });
      }
      
      if (i % 10 === 0) {
        report('media', i, mediaEntries.length, `Extracting media ${i + 1}/${mediaEntries.length}...`);
      }
    }
  }

  report('complete', 100, 100, 'Import complete!');

  return {
    cards: parsedCards,
    decks,
    models,
    media,
    totalNotes: notes.length,
    totalCards: ankiCards.length,
  };
}

/**
 * Convert cloze deletion syntax for front (hide the answer)
 * {{c1::answer}} → [...]
 * {{c1::answer::hint}} → [hint]
 */
function convertClozeFront(content: string, clozeNum: number): string {
  // Replace the specific cloze number with blank
  const regex = new RegExp(`\\{\\{c${clozeNum}::([^}]+?)(?:::([^}]+?))?\\}\\}`, 'gi');
  content = content.replace(regex, (_, answer, hint) => {
    return hint ? `<span class="cloze-blank">[${hint}]</span>` : '<span class="cloze-blank">[...]</span>';
  });
  
  // Reveal other cloze deletions
  content = content.replace(/\{\{c\d+::([^}]+?)(?:::[^}]+?)?\}\}/gi, '$1');
  
  return content;
}

/**
 * Convert cloze deletion syntax for back (show the answer)
 * {{c1::answer}} → <span class="cloze-answer">answer</span>
 */
function convertClozeBack(content: string, clozeNum: number): string {
  // Highlight the specific cloze answer
  const regex = new RegExp(`\\{\\{c${clozeNum}::([^}]+?)(?:::[^}]+?)?\\}\\}`, 'gi');
  content = content.replace(regex, '<span class="cloze-answer" style="color: #2563eb; font-weight: bold;">$1</span>');
  
  // Reveal other cloze deletions
  content = content.replace(/\{\{c\d+::([^}]+?)(?:::[^}]+?)?\}\}/gi, '$1');
  
  return content;
}

/**
 * Extract media file references from content
 * Matches: <img src="filename">, [sound:filename]
 */
function extractMediaRefs(content: string): string[] {
  const refs: string[] = [];
  
  // Image references: <img src="...">
  const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;
  while ((match = imgRegex.exec(content)) !== null) {
    refs.push(match[1]);
  }
  
  // Sound references: [sound:...]
  const soundRegex = /\[sound:([^\]]+)\]/gi;
  while ((match = soundRegex.exec(content)) !== null) {
    refs.push(match[1]);
  }
  
  return refs;
}

/**
 * Sanitize HTML content for safe display
 */
function sanitizeHtml(html: string): string {
  // Remove script tags
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  
  // Remove event handlers
  html = html.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  html = html.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');
  
  // Remove javascript: URLs
  html = html.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, 'href="#"');
  
  return html;
}

/**
 * Get MIME type from filename
 */
function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'mp3': 'audio/mpeg',
    'ogg': 'audio/ogg',
    'wav': 'audio/wav',
    'm4a': 'audio/mp4',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Replace media references with uploaded URLs
 */
export function replaceMediaRefs(
  content: string,
  mediaUrlMap: Map<string, string>
): string {
  // Replace image sources
  content = content.replace(
    /<img([^>]+)src=["']([^"']+)["']/gi,
    (match, attrs, src) => {
      const newUrl = mediaUrlMap.get(src);
      return newUrl ? `<img${attrs}src="${newUrl}"` : match;
    }
  );
  
  // Replace sound references with audio elements
  content = content.replace(
    /\[sound:([^\]]+)\]/gi,
    (match, filename) => {
      const url = mediaUrlMap.get(filename);
      return url 
        ? `<audio controls src="${url}" style="max-width: 100%;"></audio>`
        : match;
    }
  );
  
  return content;
}
