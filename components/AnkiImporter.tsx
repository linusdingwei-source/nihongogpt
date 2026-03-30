'use client';

import { useState, useCallback, useRef } from 'react';
import { parseAnkiPackage, replaceMediaRefs, type AnkiParseResult, type AnkiParseProgress, type AnkiMedia } from '@/lib/client/anki-parser';

interface AnkiImporterProps {
  onImportComplete?: (result: ImportResult) => void;
  onClose?: () => void;
}

interface ImportResult {
  deckName: string;
  deckId: string;
  imported: number;
  skipped: number;
  total: number;
}

type ImportStage = 'idle' | 'parsing' | 'uploading' | 'importing' | 'complete' | 'error';

interface ImportProgress {
  stage: ImportStage;
  message: string;
  current: number;
  total: number;
}

export default function AnkiImporter({ onImportComplete, onClose }: AnkiImporterProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<AnkiParseResult | null>(null);
  const [selectedDeck, setSelectedDeck] = useState<string>('');
  const [customDeckName, setCustomDeckName] = useState<string>('');
  const [progress, setProgress] = useState<ImportProgress>({ stage: 'idle', message: '', current: 0, total: 0 });
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string>('');
  const [includeMedia, setIncludeMedia] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.apkg')) {
      setError('Please select a valid Anki package (.apkg) file');
      return;
    }

    setFile(selectedFile);
    setError('');
    setParseResult(null);
    setProgress({ stage: 'parsing', message: 'Reading package...', current: 0, total: 100 });

    try {
      const result = await parseAnkiPackage(selectedFile, (p: AnkiParseProgress) => {
        setProgress({
          stage: 'parsing',
          message: p.message,
          current: p.current,
          total: p.total,
        });
      });

      setParseResult(result);
      
      // Set default deck name
      if (result.decks.length > 0) {
        const mainDeck = result.decks.find(d => d.name !== 'Default') || result.decks[0];
        setSelectedDeck(mainDeck.name);
        setCustomDeckName(mainDeck.name);
      }

      setProgress({ stage: 'idle', message: '', current: 0, total: 0 });
    } catch (err) {
      console.error('Parse error:', err);
      setError(err instanceof Error ? err.message : 'Failed to parse Anki package');
      setProgress({ stage: 'error', message: 'Parse failed', current: 0, total: 0 });
    }
  }, []);

  const uploadMedia = async (media: AnkiMedia[]): Promise<Map<string, string>> => {
    const urlMap = new Map<string, string>();
    
    if (!includeMedia || media.length === 0) {
      return urlMap;
    }

    for (let i = 0; i < media.length; i++) {
      const m = media[i];
      setProgress({
        stage: 'uploading',
        message: `Uploading ${m.filename} (${i + 1}/${media.length})...`,
        current: i,
        total: media.length,
      });

      try {
        // Get presigned URL
        const presignRes = await fetch('/api/upload/media/presign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: m.filename,
            contentType: m.type,
            size: m.data.size,
          }),
        });

        if (!presignRes.ok) {
          console.warn(`Failed to get presigned URL for ${m.filename}`);
          continue;
        }

        const presignData = await presignRes.json();
        
        if (presignData.data?.method === 'PUT') {
          // Direct upload to OSS
          const uploadRes = await fetch(presignData.data.uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': m.type },
            body: m.data,
          });

          if (uploadRes.ok) {
            urlMap.set(m.filename, presignData.data.publicUrl);
            // Also map by index (Anki uses numeric indices)
            urlMap.set(m.index, presignData.data.publicUrl);
          }
        } else {
          // Fallback: upload through server (TODO: implement if needed)
          console.warn(`Server upload not implemented for ${m.filename}`);
        }
      } catch (err) {
        console.warn(`Failed to upload ${m.filename}:`, err);
      }
    }

    return urlMap;
  };

  const handleImport = async () => {
    if (!parseResult) return;

    const deckName = customDeckName.trim() || selectedDeck || 'Anki Import';
    
    setError('');
    setProgress({ stage: 'uploading', message: 'Preparing media...', current: 0, total: parseResult.media.length });

    try {
      // Upload media files
      const mediaUrlMap = await uploadMedia(parseResult.media);

      // Prepare cards with updated media URLs
      setProgress({ stage: 'importing', message: 'Importing cards...', current: 0, total: parseResult.cards.length });

      const cards = parseResult.cards.map(card => ({
        frontContent: replaceMediaRefs(card.frontContent, mediaUrlMap),
        backContent: replaceMediaRefs(card.backContent, mediaUrlMap),
        tags: card.tags,
        cardType: card.isCloze ? 'Cloze' : 'Basic',
      }));

      // Send to import API
      const res = await fetch('/api/decks/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckName,
          cards,
          description: `Imported from Anki: ${file?.name}`,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || 'Import failed');
      }

      const data = await res.json();
      
      const result: ImportResult = {
        deckName: data.data.deck.name,
        deckId: data.data.deck.id,
        imported: data.data.imported,
        skipped: data.data.skipped,
        total: data.data.total,
      };

      setImportResult(result);
      setProgress({ stage: 'complete', message: 'Import complete!', current: 100, total: 100 });
      onImportComplete?.(result);
    } catch (err) {
      console.error('Import error:', err);
      setError(err instanceof Error ? err.message : 'Import failed');
      setProgress({ stage: 'error', message: 'Import failed', current: 0, total: 0 });
    }
  };

  const resetForm = () => {
    setFile(null);
    setParseResult(null);
    setSelectedDeck('');
    setCustomDeckName('');
    setProgress({ stage: 'idle', message: '', current: 0, total: 0 });
    setImportResult(null);
    setError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isProcessing = progress.stage !== 'idle' && progress.stage !== 'complete' && progress.stage !== 'error';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Import Anki Deck</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Import .apkg files from Anki</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Success State */}
          {importResult && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Import Complete!</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Successfully imported <span className="font-semibold text-green-600">{importResult.imported}</span> cards
                {importResult.skipped > 0 && (
                  <span className="text-gray-500"> ({importResult.skipped} duplicates skipped)</span>
                )}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Deck: <span className="font-medium">{importResult.deckName}</span>
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={resetForm}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Import Another
                </button>
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* File Selection */}
          {!importResult && !parseResult && (
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                isProcessing
                  ? 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800 cursor-not-allowed'
                  : 'border-gray-300 dark:border-gray-600 hover:border-green-400 dark:hover:border-green-500 hover:bg-green-50/50 dark:hover:bg-green-900/10'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".apkg"
                onChange={handleFileSelect}
                disabled={isProcessing}
                className="hidden"
              />
              
              {progress.stage === 'parsing' ? (
                <div className="space-y-4">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600 mx-auto"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{progress.message}</p>
                    <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Click to select an Anki package
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Supports .apkg files up to 100MB
                  </p>
                </>
              )}
            </div>
          )}

          {/* Parse Result */}
          {!importResult && parseResult && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{parseResult.totalCards}</p>
                  <p className="text-xs text-blue-600/70 dark:text-blue-400/70">Cards</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{parseResult.decks.length}</p>
                  <p className="text-xs text-purple-600/70 dark:text-purple-400/70">Decks</p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{parseResult.media.length}</p>
                  <p className="text-xs text-orange-600/70 dark:text-orange-400/70">Media</p>
                </div>
              </div>

              {/* Deck Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Import to Deck
                </label>
                <input
                  type="text"
                  value={customDeckName}
                  onChange={(e) => setCustomDeckName(e.target.value)}
                  placeholder="Enter deck name"
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                {parseResult.decks.length > 1 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {parseResult.decks.slice(0, 5).map((deck) => (
                      <button
                        key={deck.id}
                        onClick={() => setCustomDeckName(deck.name)}
                        className={`px-3 py-1 text-xs rounded-full transition-colors ${
                          customDeckName === deck.name
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        {deck.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Media Option */}
              {parseResult.media.length > 0 && (
                <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeMedia}
                    onChange={(e) => setIncludeMedia(e.target.checked)}
                    className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Include media files</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Upload {parseResult.media.length} images/audio files
                    </p>
                  </div>
                </label>
              )}

              {/* Progress */}
              {isProcessing && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-green-600"></div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{progress.message}</p>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(progress.current / Math.max(progress.total, 1)) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              {!isProcessing && (
                <div className="flex gap-3">
                  <button
                    onClick={resetForm}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={!customDeckName.trim()}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Import {parseResult.totalCards} Cards
                  </button>
                </div>
              )}
            </>
          )}

          {/* Error */}
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
