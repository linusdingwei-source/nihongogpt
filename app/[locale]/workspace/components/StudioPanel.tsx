/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { WorkspaceViewProps } from '../types';

// 间隔重复学习卡片类型
type StudyCard = {
  id: string;
  frontContent: string;
  backContent: string;
  cardType: string;
  audioUrl?: string;
  kanaText?: string;
  interval: number;
  easeFactor: number;
  reviewCount: number;
};

type StudyStats = {
  new: number;
  review: number;
  total: number;
};

// Strip markdown code fence wrappers from content
function preprocessContent(content: string): string {
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
}

export function StudioPanel(props: WorkspaceViewProps) {
  const {
    workspaceT, cardT,     locale,
    isStudioPanelCollapsed, setIsStudioPanelCollapsed,
    activeStudioTab, setActiveStudioTab,
    cards, cardsLoading, cardsError,
    total, totalPages, page, setPage,
    searchQuery, setSearchQuery, debouncedSearchQuery,
    selectedCardId, setSelectedCardId,
    showCardMenuId, setShowCardMenuId,
    selectedSourceId, sources,
    handleGenerateCardsFromSource,
    handleDeleteCard,
    generateCardAudio,
    currentWorkspaceDeckName,
    currentWorkspaceDeckId,
    specialStudyCard,
    setSpecialStudyCard,
    specialStudyType,
    setSpecialStudyType
  } = props;

  const selectedSource = sources.find(s => s.id === selectedSourceId);
  
  // 间隔重复学习状态
  const [showStudyModal, setShowStudyModal] = useState(false);
  const [showDictationModal, setShowDictationModal] = useState(false);
  const [showShadowingModal, setShowShadowingModal] = useState(false);

  // 处理从外部（如卡片查看详情）触发的听写或跟读
  useEffect(() => {
    if (specialStudyCard && specialStudyType && setSpecialStudyCard && setSpecialStudyType) {
      // 设置学习卡片为当前选中的单张卡片
      setStudyCards([specialStudyCard]);
      setStudyStats({ new: 0, review: 0, total: 1 });
      setCurrentStudyIndex(0);
      setShowAnswer(false);
      setStudyCompleted(false);
      setIsSingleCardMode(true); // 激活单卡片模式，防止 fetchStudyCards 覆盖数据

      if (specialStudyType === 'dictation') {
        setShowDictationModal(true);
      } else if (specialStudyType === 'shadowing') {
        setShowShadowingModal(true);
      }

      // 重置外部触发状态，防止重复触发
      setSpecialStudyCard(null);
      setSpecialStudyType(null);
    }
  }, [specialStudyCard, specialStudyType, setSpecialStudyCard, setSpecialStudyType]);

  // 当所有学习模态框关闭时，重置单卡片模式
  useEffect(() => {
    if (!showStudyModal && !showDictationModal && !showShadowingModal) {
      setIsSingleCardMode(false);
    }
  }, [showStudyModal, showDictationModal, showShadowingModal]);
  const [studyType, setStudyType] = useState<'word' | 'sentence' | 'all'>('all');
  const [studyCards, setStudyCards] = useState<StudyCard[]>([]);
  const [studyStats, setStudyStats] = useState<StudyStats>({ new: 0, review: 0, total: 0 });
  const [currentStudyIndex, setCurrentStudyIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [studyLoading, setStudyLoading] = useState(false);
  const [studyCompleted, setStudyCompleted] = useState(false);
  const [isSingleCardMode, setIsSingleCardMode] = useState(false);
  const [isAutoPlay, setIsAutoPlay] = useState(true);
  const [isLoop, setIsLoop] = useState(false);
  const [loopInterval, setLoopInterval] = useState(3); // 默认3秒
  const [playbackRate, setPlaybackRate] = useState(1.0); // 默认1倍速
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loopTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 获取待学习的卡片（若左侧选中了资源，则只拉取该资源下的卡片和句子）
  const fetchStudyCards = useCallback(async () => {
    setStudyLoading(true);
    try {
      const { getAnonymousHeaders } = await import('@/hooks/useAnonymousUser');
      const headers = getAnonymousHeaders();
      const params = new URLSearchParams();
      if (currentWorkspaceDeckId) {
        params.append('deckId', currentWorkspaceDeckId);
      } else if (currentWorkspaceDeckName && currentWorkspaceDeckName !== 'default') {
        params.append('deck', currentWorkspaceDeckName);
      }
      if (studyType !== 'all') {
        params.append('type', studyType);
      }
      if (selectedSourceId) {
        params.append('sourceId', selectedSourceId);
      }
      params.append('limit', '50');

      const res = await fetch(`/api/cards/study?${params.toString()}`, { headers });
      const response = await res.json();
      
      if (response.success && response.data?.cards) {
        const cardsData = response.data.cards;
        setStudyCards(cardsData);
        setStudyStats(response.data.stats || { new: 0, review: 0, total: cardsData.length });
        setCurrentStudyIndex(0);
        setShowAnswer(false);
        setStudyCompleted(cardsData.length === 0);
      } else {
        setStudyCards([]);
        setStudyCompleted(true);
      }
    } catch (err) {
      console.error('Failed to fetch study cards:', err);
    } finally {
      setStudyLoading(false);
    }
  }, [currentWorkspaceDeckId, currentWorkspaceDeckName, studyType, selectedSourceId]);

  // 提交复习结果
  const submitReview = async (rating: number) => {
    const currentCard = studyCards[currentStudyIndex];
    if (!currentCard) return;

    try {
      const { getAnonymousHeaders } = await import('@/hooks/useAnonymousUser');
      const headers = getAnonymousHeaders();
      await fetch('/api/cards/review', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: currentCard.id, rating }),
      });

      // 移动到下一张卡片
      if (currentStudyIndex < studyCards.length - 1) {
        setCurrentStudyIndex(prev => prev + 1);
        setShowAnswer(false);
      } else {
        setStudyCompleted(true);
      }
    } catch (err) {
      console.error('Failed to submit review:', err);
    }
  };

  // 开始学习时获取卡片
  useEffect(() => {
    if ((showStudyModal || showDictationModal || showShadowingModal) && !isSingleCardMode) {
      fetchStudyCards();
    }
  }, [showStudyModal, showDictationModal, showShadowingModal, fetchStudyCards, isSingleCardMode]);

  // 1. 自动播放逻辑：仅在卡片切换时自动播放
  useEffect(() => {
    if ((showStudyModal || showDictationModal || showShadowingModal) && isAutoPlay && !studyLoading && studyCards[currentStudyIndex]) {
      // 延迟一小段时间播放，给 UI 渲染和音频资源加载留出余量
      const timer = setTimeout(() => {
        playAudio();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentStudyIndex, isAutoPlay, studyLoading, showStudyModal]); // 移除了 showAnswer 依赖

  // 2. 循环播放及间隔逻辑
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      if (isLoop && showStudyModal) {
        // 清除旧定时器
        if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
        // 按设置的间隔再次播放
        loopTimerRef.current = setTimeout(() => {
          playAudio();
        }, loopInterval * 1000);
      }
    };

    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('ended', handleEnded);
      if (loopTimerRef.current) clearTimeout(loopTimerRef.current);
    };
  }, [isLoop, loopInterval, showStudyModal]);

  // 播放音频
  const playAudio = () => {
    if (audioRef.current) {
      // 只要触发 play 即可，src 已经由 React 绑定到标签上了
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(err => {
        console.warn('Audio auto-play blocked or failed:', err);
      });
    }
  };

  // 当前学习的卡片
  const currentCard = studyCards[currentStudyIndex];

  if (isStudioPanelCollapsed) {
    return (
      <div className="w-12 flex-shrink-0 bg-white dark:bg-gray-800 flex flex-col items-center py-2 gap-1 border-l border-gray-200 dark:border-gray-700">
        <StudyModal
          isOpen={showStudyModal}
          onClose={() => setShowStudyModal(false)}
          cards={studyCards}
          currentIndex={currentStudyIndex}
          showAnswer={showAnswer}
          setShowAnswer={setShowAnswer}
          onReview={submitReview}
          stats={studyStats}
          completed={studyCompleted}
          loading={studyLoading}
          playAudio={playAudio}
          audioRef={audioRef}
          cardT={cardT}
          sourceName={selectedSource?.name}
          isAutoPlay={isAutoPlay}
          setIsAutoPlay={setIsAutoPlay}
          isLoop={isLoop}
          setIsLoop={setIsLoop}
          loopInterval={loopInterval}
          setLoopInterval={setLoopInterval}
          playbackRate={playbackRate}
          setPlaybackRate={setPlaybackRate}
        />
        <button
          onClick={() => setIsStudioPanelCollapsed(false)}
          className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="展开Studio面板"
          title="展开 Studio"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 flex flex-col items-center gap-2 pt-2">
          {/* 制作 */}
          <button
            onClick={handleGenerateCardsFromSource}
            disabled={props.cardLoading}
            title="制作"
            className={`p-2 rounded-lg transition-all ${
              props.cardLoading
                ? 'bg-gray-100 dark:bg-gray-700/50 opacity-50 cursor-not-allowed'
                : 'bg-indigo-100 dark:bg-indigo-900/50 hover:bg-indigo-200 dark:hover:bg-indigo-800/50 text-indigo-600 dark:text-indigo-400'
            }`}
          >
            {props.cardLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600" />
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            )}
          </button>
          {/* 学习 */}
          <button
            onClick={() => {
              setStudyType(activeStudioTab === 'SENTENCE' ? 'sentence' : activeStudioTab === 'WORD' ? 'word' : 'all');
              setShowStudyModal(true);
            }}
            title="学习"
            className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 hover:bg-emerald-200 dark:hover:bg-emerald-800/50 text-emerald-600 dark:text-emerald-400 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </button>
          {/* 听写 */}
          <button
            onClick={() => {
              setStudyType(activeStudioTab === 'SENTENCE' ? 'sentence' : activeStudioTab === 'WORD' ? 'word' : 'all');
              setShowDictationModal(true);
            }}
            title="听写"
            className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/50 hover:bg-orange-200 dark:hover:bg-orange-800/50 text-orange-600 dark:text-orange-400 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>
          {/* 跟读 */}
          <button
            onClick={() => {
              setStudyType(activeStudioTab === 'SENTENCE' ? 'sentence' : activeStudioTab === 'WORD' ? 'word' : 'all');
              setShowShadowingModal(true);
            }}
            title="跟读"
            className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/50 hover:bg-purple-200 dark:hover:bg-purple-800/50 text-purple-600 dark:text-purple-400 transition-all cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              <path d="M10 9l5 3-5 3V9z" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: props.isStudioPanelCollapsed ? 'auto' : '100%' }} className="flex-shrink-0 bg-white dark:bg-gray-800 flex flex-col h-full min-h-0">
      {/* 学习模态框渲染 */}
      <StudyModal
        isOpen={showStudyModal}
        onClose={() => setShowStudyModal(false)}
        cards={studyCards}
        currentIndex={currentStudyIndex}
        showAnswer={showAnswer}
        setShowAnswer={setShowAnswer}
        onReview={submitReview}
        stats={studyStats}
        completed={studyCompleted}
        loading={studyLoading}
        playAudio={playAudio}
        audioRef={audioRef}
        cardT={cardT}
        sourceName={selectedSource?.name}
        isAutoPlay={isAutoPlay}
        setIsAutoPlay={setIsAutoPlay}
        isLoop={isLoop}
        setIsLoop={setIsLoop}
        loopInterval={loopInterval}
        setLoopInterval={setLoopInterval}
        playbackRate={playbackRate}
        setPlaybackRate={setPlaybackRate}
      />

      <DictationModal
        isOpen={showDictationModal}
        onClose={() => setShowDictationModal(false)}
        cards={studyCards}
        currentIndex={currentStudyIndex}
        onReview={submitReview}
        stats={studyStats}
        completed={studyCompleted}
        loading={studyLoading}
        playAudio={playAudio}
        audioRef={audioRef}
        sourceName={selectedSource?.name}
      />

      <ShadowingModal
        isOpen={showShadowingModal}
        onClose={() => setShowShadowingModal(false)}
        cards={studyCards}
        currentIndex={currentStudyIndex}
        onReview={submitReview}
        stats={studyStats}
        completed={studyCompleted}
        loading={studyLoading}
        playAudio={playAudio}
        audioRef={audioRef}
        sourceName={selectedSource?.name}
      />
        <ShadowingModal
          isOpen={showShadowingModal}
          onClose={() => setShowShadowingModal(false)}
          cards={studyCards}
          currentIndex={currentStudyIndex}
          onReview={submitReview}
          stats={studyStats}
          completed={studyCompleted}
          loading={studyLoading}
          playAudio={playAudio}
          audioRef={audioRef}
          sourceName={selectedSource?.name}
        />
      {/* 面板标题 */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
          {workspaceT('studio')}
        </h2>
        <button 
          onClick={() => setIsStudioPanelCollapsed(true)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="收起Studio面板"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Studio 输出选项网格 */}
      <div className="flex-shrink-0 p-4 border-b border-gray-100 dark:border-gray-700/50">
        <div className="grid grid-cols-4 gap-3">
          {/* 制作 */}
          <button
            onClick={handleGenerateCardsFromSource}
            disabled={props.cardLoading}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
              props.cardLoading 
                ? 'bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed' 
                : 'bg-indigo-50/50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 hover:border-indigo-400 dark:hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 group'
            }`}
          >
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 transition-transform group-hover:scale-110 ${props.cardLoading ? 'bg-gray-100 dark:bg-gray-800' : 'bg-indigo-100 dark:bg-indigo-900/50'}`}>
              {props.cardLoading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
              ) : (
                <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              )}
            </div>
            <span className="text-xs font-bold text-indigo-900 dark:text-indigo-100">制作</span>
          </button>

          {/* 学习 */}
          <button
            onClick={() => {
              setStudyType(activeStudioTab === 'SENTENCE' ? 'sentence' : activeStudioTab === 'WORD' ? 'word' : 'all');
              setShowStudyModal(true);
            }}
            className="flex flex-col items-center justify-center p-3 bg-emerald-50/50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800 hover:border-emerald-400 dark:hover:border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-all group"
          >
            <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg flex items-center justify-center mb-2 text-emerald-600 dark:text-emerald-400 transition-transform group-hover:scale-110">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span className="text-xs font-bold text-emerald-900 dark:text-emerald-100">学习</span>
          </button>

          {/* 听写 */}
          <button
            onClick={() => {
              setStudyType(activeStudioTab === 'SENTENCE' ? 'sentence' : activeStudioTab === 'WORD' ? 'word' : 'all');
              setShowDictationModal(true);
            }}
            className="flex flex-col items-center justify-center p-3 bg-orange-50/50 dark:bg-orange-900/20 rounded-xl border border-orange-200 dark:border-orange-800 hover:border-orange-400 dark:hover:border-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/30 transition-all group"
          >
            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/50 rounded-lg flex items-center justify-center mb-2 text-orange-600 dark:text-orange-400 transition-transform group-hover:scale-110">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <span className="text-xs font-bold text-orange-900 dark:text-orange-100">听写</span>
          </button>

          {/* 跟读 */}
          <button
            onClick={() => {
              setStudyType(activeStudioTab === 'SENTENCE' ? 'sentence' : activeStudioTab === 'WORD' ? 'word' : 'all');
              setShowShadowingModal(true);
            }}
            className="flex flex-col items-center justify-center p-3 bg-purple-50/50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800 hover:border-purple-400 dark:hover:border-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-all group cursor-pointer"
          >
            <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/50 rounded-lg flex items-center justify-center mb-2 text-purple-600 dark:text-purple-400 transition-transform group-hover:scale-110">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                <path d="M10 9l5 3-5 3V9z" fill="currentColor" />
              </svg>
            </div>
            <span className="text-xs font-bold text-purple-900 dark:text-purple-100">跟读</span>
          </button>
        </div>
      </div>

      {/* 卡片列表（在 Studio 面板底部） */}
      <div className="border-t border-gray-200 dark:border-gray-700 flex flex-col flex-1 min-h-0">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50">
          <button
            onClick={() => setActiveStudioTab('WORD')}
            className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeStudioTab === 'WORD'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-800'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            单词
          </button>
          <button
            onClick={() => setActiveStudioTab('SENTENCE')}
            className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeStudioTab === 'SENTENCE'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-800'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            句子
          </button>
          <button
            onClick={() => setActiveStudioTab('NOTE')}
            className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-all ${
              activeStudioTab === 'NOTE'
                ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-800'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            笔记
          </button>
        </div>

        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
              {activeStudioTab === 'NOTE' ? '我的笔记' : activeStudioTab === 'WORD' ? '单词卡片' : '句子卡片'}
            </h3>
            {total > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {total}
              </span>
            )}
          </div>
          {selectedSource && (
            <div className="mb-2 p-1.5 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <svg className="w-3 h-3 text-indigo-600 dark:text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                <span className="text-[10px] text-indigo-700 dark:text-indigo-300 truncate">
                  仅显示来自: {selectedSource.name}
                </span>
              </div>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  props.setSelectedSourceId(null);
                }}
                className="text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-200"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
                <input
                  type="text"
            placeholder={activeStudioTab === 'NOTE' ? '搜索笔记内容...' : cardT('searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-indigo-500 focus:border-transparent"
          />
            </div>

            {/* 卡片列表 */}
            <div className="flex-1 overflow-y-auto">
              {cardsError && (
                <div className="p-2 m-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-xs">
                  <p className="text-xs text-red-600 dark:text-red-400">{cardsError}</p>
                </div>
              )}
              {cardsLoading ? (
                <div className="flex justify-center items-center h-24">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
                </div>
              ) : cards.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-500 dark:text-gray-400">
              {debouncedSearchQuery ? cardT('noSearchResults') : (activeStudioTab === 'NOTE' ? '还没有笔记' : cardT('noCardsYet'))}
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {cards.map((card: any) => (
                    <div
                      key={card.id}
                      onClick={async () => {
                        setSelectedCardId(card.id);
                        // 如果卡片没有音频，自动生成
                        if (!card.audioUrl) {
                          await generateCardAudio(card);
                        }
                      }}
                      className={`group relative w-full text-left p-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer ${
                        selectedCardId === card.id
                      ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-2 border-indigo-600'
                          : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-medium text-gray-900 dark:text-white line-clamp-2 flex-1">
                          {preprocessContent(card.frontContent)}
                        </p>
                        <div className="relative card-menu-container flex-shrink-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowCardMenuId(showCardMenuId === card.id ? null : card.id);
                            }}
                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                            </svg>
                          </button>
                          {showCardMenuId === card.id && (
                            <div className="absolute right-0 top-8 z-20 w-32 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1">
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  handleDeleteCard(card.id);
                                  setShowCardMenuId(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                {cardT('delete') || '删除'}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-2">
                          {card.pageNumber && (
                            <span className="text-[10px] text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">
                              第 {card.pageNumber} 页
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          {new Date(card.createdAt).toLocaleDateString(locale)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {totalPages > 1 && (
                <div className="p-2 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => setPage((p: number) => Math.max(1, p - 1))}
                      disabled={page === 1}
                  className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                  {cardT('previousPage')}
                    </button>
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  {cardT('pageInfo', { page, totalPages })}
                    </span>
                    <button
                      onClick={() => setPage((p: number) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                  className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                  {cardT('nextPage')}
                    </button>
                  </div>
                </div>
              )}
        </div>
              </div>
    </div>
  );
}

// 辅助组件：跟读模态框
function ShadowingModal({
  isOpen,
  onClose,
  cards,
  currentIndex,
  onReview,
  stats,
  completed,
  loading,
  playAudio,
  audioRef,
  sourceName
}: any) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingBlob, setRecordingBlob] = useState<Blob | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [asrText, setAsrText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const currentCard = cards[currentIndex];

  // 切题时重置状态
  useEffect(() => {
    setRecordingBlob(null);
    setRecordingUrl(null);
    setAsrText('');
    setScore(null);
    setIsProcessing(false);
  }, [currentIndex]);

  if (!isOpen) return null;

  // 开始录音
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        setRecordingBlob(blob);
        setRecordingUrl(URL.createObjectURL(blob));
        
        // 停止流
        stream.getTracks().forEach(track => track.stop());
        
        // 自动上传并 ASR
        handleUploadAndAsr(blob);
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording:', err);
      alert('无法访问麦克风，请检查权限设置');
    }
  };

  // 停止录音
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // 上传并进行 ASR 识别
  const handleUploadAndAsr = async (blob: Blob) => {
    setIsProcessing(true);
    try {
      // 1. 上传文件
      const formData = new FormData();
      formData.append('file', blob, 'recording.webm');
      
      const { getAnonymousHeaders } = await import('@/hooks/useAnonymousUser');
      const headers = getAnonymousHeaders() as Record<string, string>;
      
      // 注意：上传 FormData 时不能手动设置 Content-Type，fetch 会自动设置包含 boundary 的 multipart/form-data
      const { 'Content-Type': _, ...uploadHeaders } = headers;

      const uploadRes = await fetch('/api/sources', {
        method: 'POST',
        headers: uploadHeaders,
        body: formData,
      });
      const uploadData = await uploadRes.json();
      
      if (!uploadData.success || !uploadData.data.source.contentUrl) {
        throw new Error('上传录音失败');
      }

      const audioUrl = uploadData.data.source.contentUrl;

      // 2. 提交 ASR 任务
      const asrRes = await fetch('/api/llm/asr', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioUrl, languageHints: ['ja'] }),
      });
      const asrData = await asrRes.json();
      
      if (!asrData.success || !asrData.data.taskId) {
        throw new Error('提交识别任务失败');
      }

      const taskId = asrData.data.taskId;

      // 3. 轮询结果
      pollAsrStatus(taskId);
    } catch (err) {
      console.error('ASR process failed:', err);
      setIsProcessing(false);
    }
  };

  // 轮询 ASR 状态
  const pollAsrStatus = async (taskId: string) => {
    const maxRetries = 30;
    let retries = 0;

    const check = async () => {
      try {
        const { getAnonymousHeaders } = await import('@/hooks/useAnonymousUser');
        const headers = getAnonymousHeaders();
        const res = await fetch(`/api/llm/asr?taskId=${taskId}`, { headers });
        const data = await res.json();

        if (data.success && data.data.status === 'SUCCEEDED') {
          setAsrText(data.data.text);
          calculateScore(data.data.text);
          setIsProcessing(false);
          return;
        }

        // 如果明确返回失败状态，停止轮询
        if (data.success && data.data.status === 'FAILED') {
          console.error('ASR task failed:', data.error);
          setIsProcessing(false);
          return;
        }

        // 如果接口本身报错 (data.success 为 false)，也记录错误
        if (!data.success) {
          console.warn('ASR status check returned error:', data.message || 'Unknown error');
          // 暂时允许重试，因为可能是网络抖动或任务还没同步
        }

        if (retries < maxRetries) {
          retries++;
          setTimeout(check, 1000);
        } else {
          setIsProcessing(false);
        }
      } catch (err) {
        console.error('Poll ASR status failed:', err);
        setIsProcessing(false);
      }
    };

    check();
  };

  // 简单的评分逻辑
  const calculateScore = (recognizedText: string) => {
    if (!currentCard || !recognizedText) return;
    
    const normalize = (str: string) => str.replace(/[\s。！？、，.!?,]/g, '').toLowerCase();
    const target = normalize(currentCard.frontContent);
    const actual = normalize(recognizedText);
    
    // 简单的字符包含比例评分
    let matches = 0;
    const targetChars = target.split('');
    const actualChars = actual.split('');
    
    targetChars.forEach(char => {
      const idx = actualChars.indexOf(char);
      if (idx !== -1) {
        matches++;
        actualChars.splice(idx, 1);
      }
    });

    const calculatedScore = Math.round((matches / targetChars.length) * 100);
    setScore(calculatedScore);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
      <div className={`bg-white dark:bg-gray-800 shadow-xl flex flex-col relative overflow-hidden border border-gray-200 dark:border-gray-700 transition-all duration-300 ${isFullscreen ? 'w-screen h-screen max-w-none rounded-none' : 'rounded-xl w-full max-w-4xl h-[80vh]'}`}>
        {/* 顶部标题栏 */}
        <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200">跟读练习</h2>
            {currentCard?.audioUrl && (
              <audio ref={audioRef} controls src={currentCard.audioUrl} className="h-8 w-48 md:w-64" />
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-600">
              {currentIndex + 1} / {cards.length}
            </span>
            <div className="flex items-center gap-2 border-l border-gray-100 dark:border-gray-700 ml-2 pl-4">
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className={`p-1.5 rounded-lg border transition-colors ${
                  isFullscreen 
                    ? 'bg-purple-100 dark:bg-purple-900/50 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300' 
                    : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
                title={isFullscreen ? '退出全屏' : '全屏查看'}
              >
                {isFullscreen ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0l5 0M4 4l0 5m11 0l5-5m0 0l-5 0m5 0l0 5m-5 11l5 5m0 0l-5 0m5 0l0-5m-11 0l-5 5m0 0l5 0m-5 0l0-5" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                )}
              </button>
              <button onClick={() => { onClose(); setIsFullscreen(false); }} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mb-4"></div>
            <p className="text-gray-500">加载跟读内容...</p>
          </div>
        ) : completed ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="text-6xl mb-6">🎙️</div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">练习完成！</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-8">坚持练习，你的发音会越来越标准。</p>
            <button onClick={onClose} className="px-8 py-3 bg-purple-600 text-white rounded-xl font-semibold hover:bg-purple-700 transition-colors">返回工作区</button>
          </div>
        ) : !currentCard ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="text-6xl mb-6">☕</div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">暂无待跟读内容</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-8">{sourceName ? `当前选中来源「${sourceName}」下暂无待复习的卡片或句子。` : '换个牌组看看，或者稍后再来。'}</p>
            <button onClick={onClose} className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">关闭</button>
          </div>
        ) : (
          <>
            <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-8">
              {/* 原文展示 */}
              <div className="text-center space-y-4">
                <p className="text-xs text-gray-400 uppercase font-bold tracking-widest">跟读内容</p>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white leading-tight">
                  {currentCard.frontContent}
                </h2>
                {currentCard.kanaText && <p className="text-xl text-gray-500 italic">{currentCard.kanaText}</p>}
              </div>

              {/* 录音控制 */}
              <div className="flex flex-col items-center space-y-6">
                <div 
                  className={`w-24 h-24 rounded-full flex items-center justify-center cursor-pointer transition-all ${
                    isRecording 
                      ? 'bg-red-500 animate-pulse scale-110 shadow-lg shadow-red-200' 
                      : 'bg-purple-100 hover:bg-purple-200 text-purple-600 shadow-sm'
                  }`}
                  onClick={isRecording ? stopRecording : startRecording}
                >
                  {isRecording ? (
                    <div className="w-8 h-8 bg-white rounded-sm"></div>
                  ) : (
                    <svg className="w-12 h-12" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.17 6.43 5.23 7.17V21h3.54v-2.83c3.06-.74 5.23-3.64 5.23-7.17h-2z"/>
                    </svg>
                  )}
                </div>
                <p className={`text-sm font-bold ${isRecording ? 'text-red-500' : 'text-gray-400'}`}>
                  {isRecording ? '正在录音...' : '点击图标开始跟读'}
                </p>
              </div>

              {/* ASR 结果与评分 */}
              {(isProcessing || score !== null) && (
                <div className="w-full max-w-lg p-6 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 space-y-4 animate-in fade-in zoom-in-95 duration-300">
                  {isProcessing ? (
                    <div className="flex flex-col items-center py-4 space-y-3">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                      <p className="text-xs text-gray-500">AI 正在分析发音...</p>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">识别结果</span>
                        <span className={`text-sm font-bold ${score! > 80 ? 'text-green-500' : score! > 60 ? 'text-orange-500' : 'text-red-500'}`}>
                          评分: {score}%
                        </span>
                      </div>
                      <p className="text-lg text-gray-700 dark:text-gray-200 text-center font-medium">
                        {asrText || '（未能识别出有效内容）'}
                      </p>
                      {recordingUrl && (
                        <div className="pt-2 flex justify-center">
                          <audio src={recordingUrl} controls className="h-8 w-full max-w-xs" />
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 底部评分按钮组 */}
            <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20 min-h-[100px] flex items-center justify-center">
              {score === null ? (
                <p className="text-xs text-gray-400 italic">完成跟读后即可进行评分</p>
              ) : (
                <div className="grid grid-cols-4 gap-4 w-full h-20">
                  <button onClick={() => onReview(1)} className="flex flex-col items-center justify-center gap-1 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 border border-red-100"><span className="font-bold text-lg">重来</span><span className="text-[10px] opacity-70">10分钟</span></button>
                  <button onClick={() => onReview(2)} className="flex flex-col items-center justify-center gap-1 bg-orange-50 text-orange-500 rounded-lg hover:bg-orange-100 border border-orange-100"><span className="font-bold text-lg">困难</span><span className="text-[10px] opacity-70">1天</span></button>
                  <button onClick={() => onReview(3)} className="flex flex-col items-center justify-center gap-1 bg-green-50 text-green-500 rounded-lg hover:bg-green-100 border border-green-100"><span className="font-bold text-lg">记得</span><span className="text-[10px] opacity-70">1天</span></button>
                  <button onClick={() => onReview(4)} className="flex flex-col items-center justify-center gap-1 bg-blue-50 text-blue-500 rounded-lg hover:bg-blue-100 border border-blue-100"><span className="font-bold text-lg">简单</span><span className="text-[10px] opacity-70">4天</span></button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
function DictationModal({
  isOpen,
  onClose,
  cards,
  currentIndex,
  onReview,
  stats,
  completed,
  loading,
  playAudio,
  audioRef,
  sourceName
}: any) {
  const [userInput, setUserInput] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const currentCard = cards[currentIndex];

  // 自动聚焦输入框
  useEffect(() => {
    if (isOpen && !loading && !completed && !showResult) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen, loading, completed, showResult, currentIndex]);

  // 切题时重置状态
  useEffect(() => {
    setUserInput('');
    setShowResult(false);
  }, [currentIndex]);

  if (!isOpen) return null;

  // 规范化比对逻辑
  const checkAnswer = () => {
    if (!currentCard) return;
    setShowResult(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (!showResult) {
        if (userInput.trim()) checkAnswer();
      }
    }
  };

  // 简单的比对辅助：忽略空格和特定标点
  const normalize = (str: string) => (str || '').replace(/[\s。！？、，.!?,]/g, '').toLowerCase();
  const isCorrect = currentCard && normalize(userInput) === normalize(currentCard.frontContent);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
      <div className={`bg-white dark:bg-gray-800 shadow-xl flex flex-col relative overflow-hidden border border-gray-200 dark:border-gray-700 transition-all duration-300 ${isFullscreen ? 'w-screen h-screen max-w-none rounded-none' : 'rounded-xl w-full max-w-4xl h-[80vh]'}`}>
        {/* 顶部标题栏 */}
        <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200">听写练习</h2>
            {currentCard?.audioUrl && (
              <audio ref={audioRef} controls src={currentCard.audioUrl} className="h-8 w-48 md:w-64" />
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-600">
              {currentIndex + 1} / {cards.length}
            </span>
            <div className="flex items-center gap-2 border-l border-gray-100 dark:border-gray-700 ml-2 pl-4">
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className={`p-1.5 rounded-lg border transition-colors ${
                  isFullscreen 
                    ? 'bg-orange-100 dark:bg-orange-900/50 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300' 
                    : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
                title={isFullscreen ? '退出全屏' : '全屏查看'}
              >
                {isFullscreen ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0l5 0M4 4l0 5m11 0l5-5m0 0l-5 0m5 0l0 5m-5 11l5 5m0 0l-5 0m5 0l0-5m-11 0l-5 5m0 0l5 0m-5 0l0-5" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                )}
              </button>
              <button onClick={() => { onClose(); setIsFullscreen(false); }} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mb-4"></div>
            <p className="text-gray-500">加载听写内容...</p>
          </div>
        ) : completed ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="text-6xl mb-6">🏆</div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">听写完成！</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-8">太棒了，你已经完成了该资源的全部听写练习。</p>
            <button onClick={onClose} className="px-8 py-3 bg-orange-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors">返回工作区</button>
          </div>
        ) : !currentCard ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="text-6xl mb-6">☕</div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">暂无待听写内容</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-8">{sourceName ? `当前选中来源「${sourceName}」下暂无待复习的卡片或句子。` : '换个牌组看看，或者稍后再来。'}</p>
            <button onClick={onClose} className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">关闭</button>
          </div>
        ) : (
          <>
            <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-12">
              {/* 听力引导 */}
              <div className="text-center space-y-4">
                <div className="w-20 h-20 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto animate-pulse cursor-pointer" onClick={() => playAudio()}>
                  <svg className="w-10 h-10 text-orange-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 5v14l-7-7H2V7h3l7-7zm3 7c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM12.5 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                  </svg>
                </div>
                <p className="text-sm text-gray-400 font-medium tracking-widest uppercase">请听录音并输入内容</p>
              </div>

              {/* 输入区域 */}
              <div className="w-full max-w-2xl space-y-6">
                <input
                  ref={inputRef}
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={showResult}
                  placeholder="在此输入你听到的内容..."
                  className={`w-full px-6 py-4 text-xl border-2 rounded-2xl outline-none transition-all text-center ${
                    showResult 
                      ? (isCorrect ? 'border-green-500 bg-green-50 text-green-700' : 'border-red-400 bg-red-50 text-red-700')
                      : 'border-gray-200 focus:border-orange-500 bg-gray-50 dark:bg-gray-700 dark:border-gray-600'
                  }`}
                />

                {/* 比对结果展示 */}
                {showResult && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="p-6 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm text-center">
                      <p className="text-xs text-gray-400 mb-2 uppercase font-bold tracking-widest">原文对比</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{currentCard.frontContent}</p>
                      {currentCard.kanaText && <p className="text-lg text-gray-500 mt-1 italic">{currentCard.kanaText}</p>}
                    </div>
                    {!isCorrect && (
                      <div className="flex items-center justify-center gap-2 text-red-500 font-medium">
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                        <span>听错了，再接再厉！</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 底部评分按钮组 (仅显示结果后可见) */}
            <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20 min-h-[100px] flex items-center justify-center">
              {!showResult ? (
                <button
                  onClick={checkAnswer}
                  disabled={!userInput.trim()}
                  className="w-full max-w-md py-4 bg-orange-600 text-white rounded-xl font-bold text-lg hover:bg-orange-700 shadow-lg shadow-orange-500/30 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  检查答案 (Enter)
                </button>
              ) : (
                <div className="grid grid-cols-4 gap-4 w-full h-20">
                  <button onClick={() => onReview(1)} className="flex flex-col items-center justify-center gap-1 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 border border-red-100"><span className="font-bold text-lg">重来</span><span className="text-[10px] opacity-70">10分钟</span></button>
                  <button onClick={() => onReview(2)} className="flex flex-col items-center justify-center gap-1 bg-orange-50 text-orange-500 rounded-lg hover:bg-orange-100 border border-orange-100"><span className="font-bold text-lg">困难</span><span className="text-[10px] opacity-70">1天</span></button>
                  <button onClick={() => onReview(3)} className="flex flex-col items-center justify-center gap-1 bg-green-50 text-green-500 rounded-lg hover:bg-green-100 border border-green-100"><span className="font-bold text-lg">记得</span><span className="text-[10px] opacity-70">1天</span></button>
                  <button onClick={() => onReview(4)} className="flex flex-col items-center justify-center gap-1 bg-blue-50 text-blue-500 rounded-lg hover:bg-blue-100 border border-blue-100"><span className="font-bold text-lg">简单</span><span className="text-[10px] opacity-70">4天</span></button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
function StudyModal({ 
  isOpen, 
  onClose, 
  cards, 
  currentIndex, 
  showAnswer, 
  setShowAnswer, 
  onReview, 
  stats,
  completed,
  loading,
  playAudio,
  audioRef,
  cardT,
  sourceName,
  isAutoPlay,
  setIsAutoPlay,
  isLoop,
  setIsLoop,
  loopInterval,
  setLoopInterval,
  playbackRate,
  setPlaybackRate,
}: any) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  if (!isOpen) return null;

  const currentCard = cards[currentIndex];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
      <div className={`bg-white dark:bg-gray-800 shadow-xl flex flex-col relative overflow-hidden border border-gray-200 dark:border-gray-700 transition-all duration-300 ${isFullscreen ? 'w-screen h-screen max-w-none rounded-none' : 'rounded-xl w-full max-w-5xl h-[85vh]'}`}>
        {/* 顶部标题栏 */}
        <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800 flex-shrink-0">
          <div className="flex items-center gap-6">
            <h2 className="text-sm font-bold text-gray-700 dark:text-gray-200 flex-shrink-0">闪卡学习</h2>
            
            {/* 系统自带音频播放器 - 整合在顶栏 */}
            {currentCard?.audioUrl && (
              <div className="flex items-center h-8">
                <audio 
                  ref={audioRef} 
                  controls 
                  src={currentCard.audioUrl}
                  className="h-8 w-48 md:w-64"
                >
                  您的浏览器不支持音频播放
                </audio>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                新卡 {stats.new}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
                复习 {stats.review}
              </span>
            </div>
            <div className="flex items-center gap-2 border-l border-gray-100 dark:border-gray-700 ml-2 pl-4">
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className={`p-1.5 rounded-lg border transition-colors ${
                  isFullscreen 
                    ? 'bg-indigo-100 dark:bg-indigo-900/50 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300' 
                    : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
                title={isFullscreen ? '退出全屏' : '全屏查看'}
              >
                {isFullscreen ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0l5 0M4 4l0 5m11 0l5-5m0 0l-5 0m5 0l0 5m-5 11l5 5m0 0l-5 0m5 0l0-5m-11 0l-5 5m0 0l5 0m-5 0l0-5" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                )}
              </button>
              <button onClick={() => { onClose(); setIsFullscreen(false); }} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
            <p className="text-gray-500">加载学习内容...</p>
          </div>
        ) : completed ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="text-6xl mb-6">🎉</div>
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">学习完成！</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-8">你已经完成了当前所有的复习任务。</p>
            <button onClick={onClose} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors">返回工作区</button>
          </div>
        ) : !currentCard ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="text-6xl mb-6">☕</div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">暂无待复习内容</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-8">{sourceName ? `当前选中来源「${sourceName}」下暂无待复习的卡片或句子。` : '换个牌组看看，或者稍后再来。'}</p>
            <button onClick={onClose} className="px-6 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">关闭</button>
          </div>
        ) : (
          <>
            {/* 进度与信息 */}
            <div className="px-6 py-3 flex items-center justify-between border-b border-gray-50 dark:border-gray-700 flex-shrink-0">
              <div className="flex items-center gap-4">
                <span className="text-xs text-gray-400 font-medium">{currentIndex + 1} / {cards.length}</span>
                {sourceName && (
                  <span className="text-[10px] text-gray-400">来源: {sourceName}</span>
                )}
              </div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">
                {currentCard.cardType || '问答题'}
              </div>
            </div>

            {/* 卡片主内容 */}
            <div className="flex-1 flex flex-col overflow-y-auto custom-scrollbar">
              <div className="w-full max-w-4xl mx-auto px-8 py-12 flex flex-col min-h-full">
                {/* 正面 */}
                <div className="text-center py-8">
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white leading-tight">
                    {currentCard.frontContent}
                  </h2>
                </div>

                {!showAnswer ? (
                  <div className="flex-1 flex flex-col items-center justify-start pt-8">
                    <button
                      onClick={() => setShowAnswer(true)}
                      className="w-full max-w-2xl py-4 bg-indigo-600 text-white rounded-lg font-bold text-lg hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 transition-all active:scale-[0.98]"
                    >
                      显示答案
                    </button>
                  </div>
                ) : (
                  /* 答案显示后 */
                  <div className="flex-1 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="w-full border-t border-gray-100 dark:border-gray-700 my-6"></div>
                    <div 
                      className="w-full text-gray-700 dark:text-gray-200 prose dark:prose-invert max-w-none prose-sm"
                      dangerouslySetInnerHTML={{ __html: currentCard.backContent || '<p>暂无答案内容</p>' }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 底部评分按钮组 */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
              {showAnswer && (
                <div className="grid grid-cols-4 gap-4 h-20">
                  <button
                    onClick={() => onReview(1)}
                    className="flex flex-col items-center justify-center gap-1 bg-red-50 dark:bg-red-900/10 text-red-500 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    <span className="font-bold text-lg">重来</span>
                    <span className="text-[10px] opacity-70 font-medium">10分钟</span>
                  </button>
                  <button
                    onClick={() => onReview(2)}
                    className="flex flex-col items-center justify-center gap-1 bg-orange-50 dark:bg-orange-900/10 text-orange-500 rounded-lg hover:bg-orange-100 transition-colors"
                  >
                    <span className="font-bold text-lg">困难</span>
                    <span className="text-[10px] opacity-70 font-medium">1天</span>
                  </button>
                  <button
                    onClick={() => onReview(3)}
                    className="flex flex-col items-center justify-center gap-1 bg-green-50 dark:bg-green-900/10 text-green-500 rounded-lg hover:bg-green-100 transition-colors"
                  >
                    <span className="font-bold text-lg">记得</span>
                    <span className="text-[10px] opacity-70 font-medium">1天</span>
                  </button>
                  <button
                    onClick={() => onReview(4)}
                    className="flex flex-col items-center justify-center gap-1 bg-blue-50 dark:bg-blue-900/10 text-blue-500 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    <span className="font-bold text-lg">简单</span>
                    <span className="text-[10px] opacity-70 font-medium">4天</span>
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
