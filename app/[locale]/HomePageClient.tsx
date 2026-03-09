'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { useSession } from 'next-auth/react';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import UserMenu from '@/components/UserMenu';
import { trackPageViewEvent, trackButtonClick } from '@/lib/analytics';

interface Deck {
  id: string;
  name: string;
  coverImageUrl?: string | null;
  cardCount: number;
  createdAt: string;
  updatedAt: string;
}

type TabType = 'all' | 'my' | 'featured';

export default function HomePageClient({ locale: _locale }: { locale: string }) {
  const t = useTranslations();
  const routerLocale = useLocale();
  const router = useRouter();
  const { data: session, status } = useSession();
  
  const [activeTab, setActiveTab] = useState<TabType>('my');
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [credits, setCredits] = useState<number | null>(null);

  // 创建牌组弹窗
  const [showCreateDeckModal, setShowCreateDeckModal] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckCoverUrl, setNewDeckCoverUrl] = useState('');
  const [createDeckLoading, setCreateDeckLoading] = useState(false);
  const [createDeckError, setCreateDeckError] = useState('');

  const [editingDeck, setEditingDeck] = useState<Deck | null>(null);
  const [editDeckName, setEditDeckName] = useState('');
  const [editDeckCoverUrl, setEditDeckCoverUrl] = useState('');
  const [editDeckLoading, setEditDeckLoading] = useState(false);
  const [editDeckError, setEditDeckError] = useState('');

  const [createCoverUploading, setCreateCoverUploading] = useState(false);
  const [editCoverUploading, setEditCoverUploading] = useState(false);

  const uploadCoverImage = useCallback(async (file: File): Promise<string> => {
    const { getAnonymousHeaders } = await import('@/hooks/useAnonymousUser');
    const headers = getAnonymousHeaders();
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/upload/cover', { method: 'POST', headers, body: form });
    const json = await res.json();
    const data = json.success ? json.data : json;
    if (!res.ok) throw new Error(data?.message || '上传失败');
    if (!data?.url) throw new Error('未返回图片地址');
    return data.url;
  }, []);

  // 获取牌组列表
  const fetchDecks = useCallback(async () => {
    try {
      setLoading(true);
      const { getAnonymousHeaders } = await import('@/hooks/useAnonymousUser');
      const headers = getAnonymousHeaders();
      const res = await fetch('/api/decks', { headers });
      const response = await res.json();
      const data = response.success ? response.data : response;
      if (data?.decks) {
        setDecks(data.decks);
      }
    } catch (err) {
      console.error('Failed to fetch decks:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 获取 Credits
  const fetchCredits = useCallback(async () => {
    try {
      const { getAnonymousHeaders } = await import('@/hooks/useAnonymousUser');
      const headers = getAnonymousHeaders();
      const res = await fetch('/api/user/credits', { headers });
      const response = await res.json();
      const data = response.success ? response.data : response;
      if (data?.credits !== undefined) {
        setCredits(data.credits);
      }
    } catch (err) {
      console.error('Failed to fetch credits:', err);
    }
  }, []);

  useEffect(() => {
    fetchDecks();
    if (status === 'authenticated') {
      fetchCredits();
    }
    trackPageViewEvent('HOME', { locale: routerLocale });
  }, [fetchDecks, fetchCredits, status, routerLocale]);

  // 处理牌组点击
  const handleDeckClick = (deckId: string) => {
    trackButtonClick('DECK_CLICK', 'home_page');
    router.push(`/workspace?deckId=${deckId}`);
  };

  // 处理创建新牌组：先打开弹窗，用户填写名称和可选封面后再创建
  const handleCreateDeck = () => {
    trackButtonClick('CREATE_DECK', 'home_page');
    setNewDeckName('');
    setNewDeckCoverUrl('');
    setCreateDeckError('');
    setShowCreateDeckModal(true);
  };

  const handleCreateDeckSubmit = async () => {
    const name = newDeckName.trim();
    if (!name) {
      setCreateDeckError('请输入牌组名称');
      return;
    }
    setCreateDeckLoading(true);
    setCreateDeckError('');
    try {
      const { getAnonymousHeaders } = await import('@/hooks/useAnonymousUser');
      const headers = getAnonymousHeaders();
      const res = await fetch('/api/decks', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          coverImageUrl: newDeckCoverUrl.trim() || undefined,
        }),
      });
      const response = await res.json();
      const data = response.success ? response.data : response;
      if (!res.ok) {
        setCreateDeckError((data?.message) || '创建失败');
        return;
      }
      setShowCreateDeckModal(false);
      await fetchDecks();
      router.push(`/workspace?deck=${encodeURIComponent(name)}`);
    } catch (err) {
      console.error('Create deck error:', err);
      setCreateDeckError('创建失败，请重试');
    } finally {
      setCreateDeckLoading(false);
    }
  };

  const openEditDeckModal = (deck: Deck) => {
    setEditingDeck(deck);
    setEditDeckName(deck.name);
    setEditDeckCoverUrl(deck.coverImageUrl ?? '');
    setEditDeckError('');
  };

  const handleEditDeckSubmit = async () => {
    if (!editingDeck) return;
    const name = editDeckName.trim();
    if (!name) {
      setEditDeckError('请输入牌组名称');
      return;
    }
    setEditDeckLoading(true);
    setEditDeckError('');
    try {
      const { getAnonymousHeaders } = await import('@/hooks/useAnonymousUser');
      const headers = getAnonymousHeaders();
      const body: Record<string, unknown> = { id: editingDeck.id };
      if (name !== editingDeck.name) body.newName = name;
      const newCover = editDeckCoverUrl.trim() || null;
      if (newCover !== (editingDeck.coverImageUrl ?? null)) body.coverImageUrl = newCover;
      if (Object.keys(body).length === 1) {
        setEditingDeck(null);
        return;
      }
      const res = await fetch('/api/decks', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const response = await res.json();
      const data = response.success ? response.data : response;
      if (!res.ok) {
        setEditDeckError((data?.message) || '保存失败');
        return;
      }
      setEditingDeck(null);
      await fetchDecks();
    } catch (err) {
      console.error('Edit deck error:', err);
      setEditDeckError('保存失败，请重试');
    } finally {
      setEditDeckLoading(false);
    }
  };

  // 过滤牌组
  const filteredDecks = decks.filter(deck => {
    if (activeTab === 'my') return true;
    if (activeTab === 'all') return true;
    if (activeTab === 'featured') return deck.cardCount > 0; // 精选：有卡片的牌组
    return true;
  });

  // 最近打开的牌组（最近3个）
  const recentDecks = decks.slice(0, 3);
  // 精选牌组（有卡片且按卡片数排序的前3个）
  const featuredDecks = [...decks]
    .filter(deck => deck.cardCount > 0)
    .sort((a, b) => b.cardCount - a.cardCount)
    .slice(0, 3);

  // 生成牌组卡片的背景颜色
  const getDeckColor = (index: number) => {
    const colors = [
      'from-purple-400 to-blue-500',
      'from-orange-300 to-pink-400',
      'from-blue-400 to-cyan-500',
      'from-green-400 to-emerald-500',
      'from-yellow-400 to-orange-500',
    ];
    return colors[index % colors.length];
  };

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* 顶部导航栏 */}
      <nav className="sticky top-0 z-50 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* 左侧 Logo */}
            <Link href="/" className="flex items-center space-x-2">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                {t('common.appName')}
              </h1>
            </Link>

            {/* 右侧控制 */}
            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              {session?.user ? (
                <UserMenu credits={credits} />
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    href="/login"
                    className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                  >
                    {t('common.login')}
                  </Link>
                  <Link
                    href="/register"
                    className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    {t('common.register')}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* 导航标签栏 */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === 'all'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                全部
              </button>
              <button
                onClick={() => setActiveTab('my')}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === 'my'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                我的牌组
              </button>
              <button
                onClick={() => setActiveTab('featured')}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === 'featured'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                精选牌组
              </button>
            </div>

            {/* 右侧控制 */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreateDeck}
                className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-white text-white dark:text-black rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                新建
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="container mx-auto px-4 py-6">
        {/* 精选牌组区域 */}
        {featuredDecks.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">精选牌组</h2>
              {featuredDecks.length > 3 && (
                <button className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                  查看全部 &gt;
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {featuredDecks.map((deck, deckIndex) => (
                <button
                  key={deck.id}
                  onClick={() => handleDeckClick(deck.id)}
                  className="group relative h-48 rounded-lg overflow-hidden shadow-sm hover:shadow-lg transition-all text-left"
                >
                  {/* 封面图或渐变背景 */}
                  {deck.coverImageUrl ? (
                    <>
                      <img src={deck.coverImageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40" />
                    </>
                  ) : (
                    <div className={`absolute inset-0 bg-gradient-to-br ${getDeckColor(deckIndex)} opacity-90`} />
                  )}
                  
                  {/* 内容 */}
                  <div className="relative h-full p-4 flex flex-col justify-between text-white">
                    <div>
                      <div className="text-xs font-medium mb-2 opacity-90">我的牌组</div>
                      <h3 className="text-lg font-semibold mb-2 line-clamp-2">{deck.name}</h3>
                      <div className="text-xs opacity-75">
                        {new Date(deck.updatedAt).toLocaleDateString('zh-CN')} · {deck.cardCount} 张卡片
                      </div>
                    </div>
                    <div className="flex items-center justify-end">
                      <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:bg-white/30 transition-colors">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 最近打开的牌组区域 */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">最近打开的牌组</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 创建新牌组卡片 */}
            <button
              onClick={handleCreateDeck}
              className="group h-48 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 hover:border-indigo-500 dark:hover:border-indigo-400 transition-colors flex items-center justify-center bg-gray-50 dark:bg-gray-800"
            >
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center group-hover:bg-indigo-200 dark:group-hover:bg-indigo-900/50 transition-colors">
                  <svg className="w-8 h-8 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">创建新牌组</p>
              </div>
            </button>

            {/* 最近打开的牌组卡片 */}
            {loading ? (
              <>
                {[1, 2].map((i) => (
                  <div key={i} className="h-48 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
                ))}
              </>
            ) : recentDecks.length > 0 ? (
              recentDecks.map((deck) => (
                <div
                  key={deck.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleDeckClick(deck.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDeckClick(deck.id); } }}
                  className="group h-48 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 dark:hover:border-indigo-400 hover:shadow-lg transition-all bg-white dark:bg-gray-800 p-4 flex flex-col cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-3">
                    {deck.coverImageUrl ? (
                      <img src={deck.coverImageUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditDeckModal(deck);
                      }}
                      className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
                    >
                      <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2">
                      {deck.name}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {deck.cardCount} 张卡片
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-3 text-center py-12">
                <p className="text-gray-500 dark:text-gray-400 mb-4">还没有牌组</p>
                <button
                  onClick={handleCreateDeck}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  创建第一个牌组
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 所有牌组列表（当选择"全部"或"我的牌组"时显示） */}
        {activeTab !== 'featured' && filteredDecks.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              {activeTab === 'all' ? '全部牌组' : '我的牌组'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredDecks.map((deck, deckIndex) => (
                <div
                  key={deck.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleDeckClick(deck.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleDeckClick(deck.id); } }}
                  className="group h-48 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-500 dark:hover:border-indigo-400 hover:shadow-lg transition-all bg-white dark:bg-gray-800 p-4 flex flex-col cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-3">
                    {deck.coverImageUrl ? (
                      <img src={deck.coverImageUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${getDeckColor(deckIndex)} flex items-center justify-center flex-shrink-0`}>
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditDeckModal(deck);
                      }}
                      className="w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2">
                      {deck.name}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {deck.cardCount} 张卡片 · {new Date(deck.updatedAt).toLocaleDateString('zh-CN')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 创建牌组弹窗 */}
      {showCreateDeckModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">创建新牌组</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">牌组名称 *</label>
                <input
                  type="text"
                  value={newDeckName}
                  onChange={(e) => setNewDeckName(e.target.value)}
                  placeholder="例如：N5 词汇"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">封面图片（选填）</label>
                {newDeckCoverUrl ? (
                  <div className="relative inline-block">
                    <img src={newDeckCoverUrl} alt="" className="h-24 w-full object-cover rounded-lg border border-gray-200 dark:border-gray-600" />
                    <button
                      type="button"
                      onClick={() => setNewDeckCoverUrl('')}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center text-sm hover:bg-black/80"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div
                    className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center bg-gray-50 dark:bg-gray-700/50"
                    onPaste={async (e) => {
                      const item = e.clipboardData?.items && Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
                      if (!item) return;
                      e.preventDefault();
                      const file = item.getAsFile();
                      if (!file) return;
                      setCreateCoverUploading(true);
                      try {
                        const url = await uploadCoverImage(file);
                        setNewDeckCoverUrl(url);
                      } catch (err) {
                        setCreateDeckError(err instanceof Error ? err.message : '上传失败');
                      } finally {
                        setCreateCoverUploading(false);
                      }
                    }}
                  >
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      id="create-cover-file"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setCreateCoverUploading(true);
                        try {
                          const url = await uploadCoverImage(file);
                          setNewDeckCoverUrl(url);
                        } catch (err) {
                          setCreateDeckError(err instanceof Error ? err.message : '上传失败');
                        } finally {
                          setCreateCoverUploading(false);
                        }
                        e.target.value = '';
                      }}
                    />
                    <label htmlFor="create-cover-file" className="cursor-pointer text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                      {createCoverUploading ? '上传中…' : '点击选择图片'}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">或在此处粘贴截图（Ctrl+V）</p>
                  </div>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">支持 JPG/PNG/WebP，不超过 2MB</p>
              </div>
              {createDeckError && (
                <p className="text-sm text-red-600 dark:text-red-400">{createDeckError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setShowCreateDeckModal(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleCreateDeckSubmit}
                disabled={createDeckLoading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {createDeckLoading ? '创建中…' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑牌组弹窗 */}
      {editingDeck && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">编辑牌组</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">牌组名称 *</label>
                <input
                  type="text"
                  value={editDeckName}
                  onChange={(e) => setEditDeckName(e.target.value)}
                  placeholder="例如：N5 词汇"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">封面图片（选填）</label>
                {editDeckCoverUrl ? (
                  <div className="relative inline-block">
                    <img src={editDeckCoverUrl} alt="" className="h-24 w-full object-cover rounded-lg border border-gray-200 dark:border-gray-600" />
                    <button
                      type="button"
                      onClick={() => setEditDeckCoverUrl('')}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center text-sm hover:bg-black/80"
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <div
                    className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center bg-gray-50 dark:bg-gray-700/50"
                    onPaste={async (e) => {
                      const item = e.clipboardData?.items && Array.from(e.clipboardData.items).find((i) => i.type.startsWith('image/'));
                      if (!item) return;
                      e.preventDefault();
                      const file = item.getAsFile();
                      if (!file) return;
                      setEditCoverUploading(true);
                      try {
                        const url = await uploadCoverImage(file);
                        setEditDeckCoverUrl(url);
                      } catch (err) {
                        setEditDeckError(err instanceof Error ? err.message : '上传失败');
                      } finally {
                        setEditCoverUploading(false);
                      }
                    }}
                  >
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      id="edit-cover-file"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setEditCoverUploading(true);
                        try {
                          const url = await uploadCoverImage(file);
                          setEditDeckCoverUrl(url);
                        } catch (err) {
                          setEditDeckError(err instanceof Error ? err.message : '上传失败');
                        } finally {
                          setEditCoverUploading(false);
                        }
                        e.target.value = '';
                      }}
                    />
                    <label htmlFor="edit-cover-file" className="cursor-pointer text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                      {editCoverUploading ? '上传中…' : '点击选择图片'}
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">或在此处粘贴截图（Ctrl+V）</p>
                  </div>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">支持 JPG/PNG/WebP，不超过 2MB</p>
              </div>
              {editDeckError && (
                <p className="text-sm text-red-600 dark:text-red-400">{editDeckError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setEditingDeck(null)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleEditDeckSubmit}
                disabled={editDeckLoading}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {editDeckLoading ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
