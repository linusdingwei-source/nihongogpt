/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState } from 'react';
import { Link } from '@/i18n/routing';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import UserMenu from '@/components/UserMenu';
import { WorkspaceViewProps } from './types';
import { SourcesPanel } from './components/SourcesPanel';
import { ChatPanel } from './components/ChatPanel';
import { StudioPanel } from './components/StudioPanel';
import { InteractiveTranscript } from './components/InteractiveTranscript';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export function WorkspaceView(props: WorkspaceViewProps) {
  const {
    locale, session, t,
    currentWorkspaceDeckName, currentWorkspaceDeckId, credits,
    showSourceViewModal, setShowSourceViewModal, selectedSourceId, setSelectedSourceId, sources, sourceContent, setSourceContent,
    selectedCard, setSelectedCardId, cardT, handleDeleteCard,
    showComparisonView, setShowComparisonView, comparisonSource
  } = props;

  const [isFullscreenCard, setIsFullscreenCard] = useState(false);

  const preprocessContent = (content: string) => {
    if (!content) return '';
    let result = content.trim();
    
    // Method 1: Try to match complete code fence block
    // Pattern: ```markdown<content>``` or ```<content>```
    const completeMatch = result.match(/^```(?:markdown)?\s*([\s\S]*?)\s*```$/i);
    if (completeMatch) {
      return completeMatch[1].trim();
    }
    
    // Method 2: Aggressively strip fence patterns
    // Remove opening fence at start (```markdown or ``` followed by optional language)
    result = result.replace(/^```(?:markdown|\w*)?\s*/i, '');
    // Remove closing fence at end
    result = result.replace(/\s*```\s*$/, '');
    
    return result.trim();
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
      {/* 顶部导航栏 */}
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity group">
                {/* 应用图标 */}
                <div className="w-9 h-9 rounded-[8px] bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center flex-shrink-0 shadow-sm group-hover:shadow-md transition-shadow">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                {/* 牌组名称 */}
                <h1 className="text-lg font-medium text-gray-900 dark:text-white leading-tight">
                  {currentWorkspaceDeckName && currentWorkspaceDeckName !== 'default'
                    ? (
                      <span className="flex items-center gap-2">
                        <span className="opacity-60 font-normal text-sm">{t('common.appName')}</span>
                        <span className="text-gray-300 dark:text-gray-600">/</span>
                        <span>{currentWorkspaceDeckName}</span>
                      </span>
                    )
                    : t('common.appName')}
              </h1>
            </Link>
            </div>
            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              {session?.user ? (
                <UserMenu credits={credits} />
              ) : (
                <Link
                  href="/login"
                  className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  {t('common.login')}
                </Link>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* 三栏布局 - Resizable */}
      <div ref={props.workspaceLayoutRef} className="flex-1 flex overflow-hidden relative">
        {/* Left Panel - Sources */}
        <div 
          style={{ width: props.isSourcePanelCollapsed ? '48px' : `${props.sourcePanelWidth}px` }} 
          className="flex-shrink-0 flex flex-col min-w-0"
        >
          <SourcesPanel {...props} />
        </div>

        {/* Left Resize Handle - 放置在 Sources 和 Chat 之间 */}
        {!props.isSourcePanelCollapsed && (
          <div
            className="w-1.5 flex-shrink-0 bg-transparent hover:bg-indigo-500/30 cursor-col-resize flex items-center justify-center transition-colors group z-10"
            onMouseDown={props.startResizingSource}
            title="拖动调整来源面板宽度"
          >
            <div className="w-[1px] h-full bg-gray-200 dark:bg-gray-700 group-hover:bg-indigo-500" />
            <div className="absolute w-0.5 h-8 bg-gray-400 dark:bg-gray-500 rounded-full opacity-0 group-hover:opacity-100" />
          </div>
        )}

        {/* Middle Panel - Chat */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <ChatPanel {...props} />
        </div>

        {/* Right Resize Handle - 放置在 Chat 和 Studio 之间 */}
        {!props.isStudioPanelCollapsed && (
          <div
            className="w-1.5 flex-shrink-0 bg-transparent hover:bg-indigo-500/30 cursor-col-resize flex items-center justify-center transition-colors group z-10"
            onMouseDown={props.startResizingStudio}
            title="拖动调整 Studio 面板宽度"
          >
            <div className="w-[1px] h-full bg-gray-200 dark:bg-gray-700 group-hover:bg-indigo-500" />
            <div className="absolute w-0.5 h-8 bg-gray-400 dark:bg-gray-500 rounded-full opacity-0 group-hover:opacity-100" />
          </div>
        )}

        {/* Right Panel - Studio */}
        <div 
          style={{ width: props.isStudioPanelCollapsed ? '48px' : `${props.studioPanelWidth}px` }} 
          className="flex-shrink-0 flex flex-col min-w-0"
        >
          <StudioPanel {...props} />
        </div>
      </div>

      {/* Modals integrated into SourcesPanel - no longer need these separate modals for source/paste */}
      {/* However, SourcesPanel only displays them inside itself. If we want them to overlay ONLY when prompted
          and stay within the left panel, we need SourcesPanel to handle the rendering logic.
          Currently SourcesPanel takes showAddSourceModal props but doesn't render the add UI inside itself yet.
          The user requested "Modal box directly reuses the space of the source component".
          I will remove these modals from here and move the JSX to SourcesPanel.tsx in the next step.
      */}
      
      {/* 卡片详情模态框 */}
      {showSourceViewModal && selectedSourceId && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white truncate pr-4">
                {sources.find(s => s.id === selectedSourceId)?.name || '来源内容'}
              </h2>
              <button
                onClick={() => {
                  setShowSourceViewModal(false);
                  setSelectedSourceId(null);
                  setSourceContent('');
                }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {(() => {
                const selectedSource = sources.find(s => s.id === selectedSourceId);
                const isImage = selectedSource?.type === 'image';
                const isAudio = selectedSource?.type === 'audio';
                const url = selectedSource?.contentUrl || selectedSource?.fileUrl;

                if (isImage && url) {
                  return (
                    <div className="flex justify-center">
                      <img src={url} alt={selectedSource?.name} className="max-w-full h-auto rounded-lg shadow-sm" />
                    </div>
                  );
                } else if (isAudio && url) {
                  return (
                    <div className="flex flex-col items-center justify-center py-12">
                      <audio controls src={url} className="w-full max-w-md" />
                    </div>
                  );
                } else {
                  return (
                    <div className="prose dark:prose-invert max-w-none">
                      <pre className="whitespace-pre-wrap text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-700 p-4 rounded-lg border border-gray-200 dark:border-gray-600 font-mono">
                        {sourceContent}
                      </pre>
                    </div>
                  );
                }
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 卡片详情模态框 */}
      {selectedCard && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 z-50 flex items-center justify-center p-0 md:p-4">
          <div className={`bg-white dark:bg-gray-800 shadow-xl ${isFullscreenCard ? 'w-screen h-screen max-w-none max-h-none rounded-none' : showComparisonView ? 'max-w-6xl w-full max-h-[90vh] rounded-lg' : 'max-w-5xl w-full max-h-[90vh] rounded-lg'} flex flex-col transition-all duration-300`}>
            {/* Header */}
            <div className="flex-shrink-0 flex justify-between items-center px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                  {selectedCard.cardType}
                </span>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(selectedCard.createdAt).toLocaleString(locale)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* 听写按钮 */}
                <button
                  onClick={() => props.handleStartDictationForCard?.(selectedCard)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-800/50 transition-colors"
                  title="启动当前卡片听写"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
                  </svg>
                  听写
                </button>

                {/* 跟读按钮 */}
                <button
                  onClick={() => props.handleStartShadowingForCard?.(selectedCard)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-800/50 transition-colors"
                  title="启动当前卡片跟读"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  跟读
                </button>

                {/* 全屏按钮 */}
                <button
                  onClick={() => setIsFullscreenCard(!isFullscreenCard)}
                  className={`p-1.5 rounded-lg border transition-colors ${
                    isFullscreenCard 
                      ? 'bg-indigo-100 dark:bg-indigo-900/50 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300' 
                      : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                  title={isFullscreenCard ? '退出全屏' : '全屏查看'}
                >
                  {isFullscreenCard ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0l5 0M4 4l0 5m11 0l5-5m0 0l-5 0m5 0l0 5m-5 11l5 5m0 0l-5 0m5 0l0-5m-11 0l-5 5m0 0l5 0m-5 0l0-5" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  )}
                </button>

                {/* 对比视图切换按钮 - 仅对有 sourceId 的笔记显示 */}
                {selectedCard.category === 'NOTE' && selectedCard.sourceId && (
                  <button
                    onClick={() => setShowComparisonView(!showComparisonView)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      showComparisonView 
                        ? 'bg-indigo-100 dark:bg-indigo-900/50 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300' 
                        : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'
                    }`}
                    title={showComparisonView ? '退出对比视图' : '对比原始资源'}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                    </svg>
                    {showComparisonView ? '退出对比' : '对比视图'}
                  </button>
                )}
                <button
                  onClick={() => {
                    setSelectedCardId(null);
                    setIsFullscreenCard(false); // 关闭时重置全屏
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content Area - 有原始资源时左右布局：左=原始资源，右=正面/背面/音频纵向；否则仅卡片内容纵向 */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {(() => {
                const cardContentBlocks = (
                  <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {/* 1. 正面部分 - 保证最小高度，便于阅读 */}
                <div className="flex-1 min-h-[20vh] flex flex-col border-b border-gray-200 dark:border-gray-700/50 overflow-hidden">
                  <div className="flex-shrink-0 px-4 py-2 bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700/50">
                    <h3 className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {cardT('frontContent')}
                    </h3>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
                    <div className="prose dark:prose-invert max-w-none prose-sm">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {preprocessContent(selectedCard.frontContent)}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>

                {/* 2. 背面部分 */}
                <div className="flex-1 min-h-0 flex flex-col border-b border-gray-200 dark:border-gray-700/50 overflow-hidden">
                  <div className="flex-shrink-0 px-4 py-2 bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700/50">
                    <h3 className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {selectedCard.category === 'NOTE' ? '内容' : cardT('backContent')}
                    </h3>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
                    <div className="prose dark:prose-invert max-w-none prose-sm">
                      <ReactMarkdown 
                        remarkPlugins={[remarkGfm, remarkMath]} 
                        rehypePlugins={[rehypeKatex, rehypeRaw]}
                        components={{
                          code({ node: _node, inline, className, children, ...props }: any) {
                            const match = /language-(\w+)/.exec(className || '');
                            if (!inline && match) {
                              return (
                                <SyntaxHighlighter
                                  style={vscDarkPlus as any}
                                  language={match[1]}
                                  PreTag="div"
                                  className="rounded-md my-2"
                                  {...props}
                                >
                                  {String(children).replace(/\n$/, '')}
                                </SyntaxHighlighter>
                              );
                            }
                            return (
                              <code 
                                className={`${className || ''} ${inline ? 'bg-gray-200 dark:bg-gray-600 px-1 rounded' : 'block bg-gray-100 dark:bg-gray-800 p-3 rounded-md my-2 overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200'}`} 
                                {...props}
                              >
                                {children}
                              </code>
                            );
                          },
                          table({ children }) {
                            return (
                              <div className="overflow-x-auto my-4 rounded-lg border border-gray-200 dark:border-gray-700">
                                <table className="border-collapse w-full text-left text-sm">{children}</table>
                              </div>
                            );
                          },
                          th({ children }) {
                            return <th className="border-b border-gray-200 dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-800 font-bold text-gray-900 dark:text-white">{children}</th>;
                          },
                          td({ children }) {
                            return <td className="border-b border-gray-200 dark:border-gray-700 p-2 text-gray-700 dark:text-gray-300">{children}</td>;
                          },
                          h1({ children }) {
                            return <h1 className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400 mb-3 mt-4 pb-1 border-b border-indigo-100 dark:border-indigo-900/50">{children}</h1>;
                          },
                          h2({ children }) {
                            return <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-2 mt-3 flex items-center gap-2">
                              <span className="w-1 h-1 rounded-full bg-indigo-500" />
                              {children}
                            </h2>;
                          },
                          h3({ children }) {
                            return <h3 className="text-base font-bold text-gray-800 dark:text-gray-200 mb-2 mt-3">{children}</h3>;
                          },
                          hr() {
                            return <hr className="my-4 border-gray-200 dark:border-gray-700" />;
                          },
                          blockquote({ children }) {
                            return <blockquote className="border-l-4 border-indigo-500 pl-3 py-0.5 italic bg-indigo-50/50 dark:bg-indigo-900/20 my-3 rounded-r-lg">{children}</blockquote>;
                          }
                        }}
                      >
                        {preprocessContent(selectedCard.backContent)}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>

                {/* 3. 音频与详情部分 */}
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-gray-50/20 dark:bg-gray-900/10">
                  <div className="flex-shrink-0 px-4 py-2 bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700/50">
                    <h3 className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      音频预览 & 标签
                    </h3>
                  </div>
                  <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar space-y-6">
                    {/* 音频播放器 */}
                    {selectedCard.audioUrl && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-semibold text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                          </svg>
                          {selectedCard.category === 'NOTE' && selectedCard.timestamps?.length > 0 
                            ? '音频转写' 
                            : cardT('pronunciationPreview')}
                        </h4>
                        <div className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                          {selectedCard.category === 'NOTE' && selectedCard.timestamps?.length > 0 ? (
                            <InteractiveTranscript
                              audioUrl={selectedCard.audioUrl}
                              timestamps={selectedCard.timestamps}
                            />
                          ) : (
                            <audio controls className="w-full h-10">
                              <source src={selectedCard.audioUrl} type="audio/mpeg" />
                              {cardT('audioNotSupported')}
                            </audio>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 标签 */}
                    <div>
                      <h4 className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-3 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                        </svg>
                        标签
                      </h4>
                      {selectedCard.tags && selectedCard.tags.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {selectedCard.tags.map((tag: string, index: number) => (
                            <span
                              key={index}
                              className="px-2 py-1 text-[10px] font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-md border border-indigo-100/50 dark:border-indigo-800/50"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-gray-400 italic">暂无标签</p>
                      )}
                    </div>

                    {/* 其它元数据 */}
                    <div className="pt-4 border-t border-gray-100 dark:border-gray-700/50">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-[10px] text-gray-400 mb-1">所在牌组</div>
                          <div className="text-xs font-medium text-gray-600 dark:text-gray-300">{selectedCard.deckName}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-gray-400 mb-1">分类</div>
                          <div className="text-xs font-medium text-gray-600 dark:text-gray-300">{selectedCard.category || 'CARD'}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              );
              return showComparisonView ? (
                <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
                  {/* 左侧：原始资源 */}
                  <div className="w-[45%] min-w-0 flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-gray-700 overflow-hidden">
                    <div className="flex-shrink-0 px-4 py-2 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                      <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        原始资源
                        {comparisonSource && (
                          <span className="text-[10px] text-gray-400 font-normal truncate ml-1" title={comparisonSource.name}>
                            - {comparisonSource.name}
                          </span>
                        )}
                      </h3>
                    </div>
                    <div className="flex-1 min-h-0 overflow-auto bg-gray-50/30 dark:bg-gray-900/30">
                      {comparisonSource ? (
                        (comparisonSource.type === 'pdf' || comparisonSource.name?.toLowerCase().endsWith('.pdf')) ? (
                          <iframe
                            src={`/api/sources/${comparisonSource.id}/view`}
                            className="w-full h-full min-h-[200px] border-none"
                            title={comparisonSource.name}
                          />
                        ) : comparisonSource.type === 'image' ? (
                          <div className="p-4 flex items-center justify-center min-h-[200px] h-full bg-gray-100 dark:bg-gray-900">
                            <img
                              src={comparisonSource.url}
                              alt={comparisonSource.name}
                              className="max-w-full max-h-full object-contain shadow-sm rounded"
                            />
                          </div>
                        ) : (
                          <div className="p-4 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono h-full overflow-y-auto">
                            {comparisonSource.content || '无法加载资源内容'}
                          </div>
                        )
                      ) : (
                        <div className="flex items-center justify-center min-h-[120px] text-gray-400 dark:text-gray-500 italic text-xs">
                          <p>资源已删除或不可用</p>
                        </div>
                      )}
                    </div>
                  </div>
                  {cardContentBlocks}
                </div>
              ) : cardContentBlocks;
              })()}
            </div>

            {/* Footer */}
            <div className="flex-shrink-0 flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => {
                  setSelectedCardId(null);
                  setIsFullscreenCard(false);
                }}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => handleDeleteCard(selectedCard.id)}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                {cardT('delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
