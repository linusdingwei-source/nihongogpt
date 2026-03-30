'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import { useSession } from 'next-auth/react';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import UserMenu from '@/components/UserMenu';
import AnkiImporter from '@/components/AnkiImporter';
import { trackPageViewEvent, trackButtonClick } from '@/lib/analytics';

interface Deck {
  id: string;
  name: string;
  coverImageUrl?: string | null;
  cardCount: number;
  isPublic: boolean;
  description?: string | null;
  shareToken?: string | null;
  author: string;
  authorImage?: string | null;
  isCollected?: boolean;
  createdAt: string;
  updatedAt: string;
}

type TabType = 'all' | 'my' | 'featured' | 'public';

export default function HomePageClient({ locale: _locale }: { locale: string }) {
  const t = useTranslations();
  const routerLocale = useLocale();
  const router = useRouter();
  const { data: session, status } = useSession();
  
  const [activeTab, setActiveTab] = useState<TabType>('my');
  const [decks, setDecks] = useState<Deck[]>([]);
  const [collectedDecks, setCollectedDecks] = useState<Deck[]>([]);
  const [publicDecks, setPublicDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [publicLoading, setPublicLoading] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);

  // 创建牌组弹窗
  const [showCreateDeckModal, setShowCreateDeckModal] = useState(false);
  const [showAnkiImporter, setShowAnkiImporter] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  /** 入库用的 OSS 永久 URL（非签名） */
  const [newDeckCoverStorageUrl, setNewDeckCoverStorageUrl] = useState('');
  /** 弹窗内预览（私有桶为签名 URL） */
  const [newDeckCoverPreviewUrl, setNewDeckCoverPreviewUrl] = useState('');
  const [newDeckIsPublic, setNewDeckIsPublic] = useState(false);
  const [newDeckDescription, setNewDeckDescription] = useState('');
  const [createDeckLoading, setCreateDeckLoading] = useState(false);
  const [createDeckError, setCreateDeckError] = useState('');

  const [editingDeck, setEditingDeck] = useState<Deck | null>(null);
  const [editDeckName, setEditDeckName] = useState('');
  const [editDeckCoverPreviewUrl, setEditDeckCoverPreviewUrl] = useState('');
  /** undefined=未改封面 null=去掉封面 string=新封面 canonical URL */
  const [editDeckCoverStorageDraft, setEditDeckCoverStorageDraft] = useState<
    string | null | undefined
  >(undefined);
  const [editDeckIsPublic, setEditDeckIsPublic] = useState(false);
  const [editDeckDescription, setEditDeckDescription] = useState('');
  const [editDeckLoading, setEditDeckLoading] = useState(false);
  const [editDeckError, setEditDeckError] = useState('');

  const [createCoverUploading, setCreateCoverUploading] = useState(false);
  const [editCoverUploading, setEditCoverUploading] = useState(false);

  const uploadCoverImage = useCallback(async (file: File): Promise<{ storageUrl: string; previewUrl: string }> => {
    const { compressImageFileIfNeeded } = await import(
      '@/lib/client/compress-image-for-cover'
    );
    const toUpload = await compressImageFileIfNeeded(file);
    const { getAnonymousHeaders } = await import('@/hooks/useAnonymousUser');
    const headers = getAnonymousHeaders() as Record<string, string>;
    // FormData 必须由浏览器设置 multipart boundary，不能带 application/json
    const { 'Content-Type': _ct, ...uploadHeaders } = headers;
    const form = new FormData();
    form.append('file', toUpload);
    const res = await fetch('/api/upload/cover', {
      method: 'POST',
      headers: uploadHeaders,
      body: form,
    });
    const json = await res.json();
    const data = json.success ? json.data : json;
    if (!res.ok) throw new Error(data?.message || '上传失败');
    if (!data?.url) throw new Error('未返回图片地址');
    const previewUrl =
      typeof data.displayUrl === 'string' && data.displayUrl.trim()
        ? data.displayUrl.trim()
        : data.url;
    return { storageUrl: data.url, previewUrl };
  }, []);

  // 获取牌组列表（silent：切回标签页时刷新签名 URL，不闪全页 loading）
  const fetchDecks = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) setLoading(true);
      const { getAnonymousHeaders } = await import('@/hooks/useAnonymousUser');
      const headers = getAnonymousHeaders();
      const res = await fetch('/api/decks', { headers });
      const response = await res.json();
      const data = response.success ? response.data : response;
      if (data?.decks) {
        setDecks(data.decks);
      }
      if (data?.collectedDecks) {
        setCollectedDecks(data.collectedDecks);
      }
    } catch (err) {
      console.error('Failed to fetch decks:', err);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  // 获取公开牌组
  const fetchPublicDecks = useCallback(async (query: string = '', options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) setPublicLoading(true);
      const { getAnonymousHeaders } = await import('@/hooks/useAnonymousUser');
      const headers = getAnonymousHeaders();
      const res = await fetch(`/api/decks/public?q=${encodeURIComponent(query)}`, { headers });
      const response = await res.json();
      const data = response.success ? response.data : response;
      if (data?.decks) {
        setPublicDecks(data.decks);
      }
    } catch (err) {
      console.error('Failed to fetch public decks:', err);
    } finally {
      if (!options?.silent) setPublicLoading(false);
    }
  }, []);

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
    if (activeTab === 'public') {
      fetchPublicDecks();
    }
    if (status === 'authenticated') {
      fetchCredits();
    }
    trackPageViewEvent('HOME', { locale: routerLocale });
  }, [fetchDecks, fetchCredits, fetchPublicDecks, activeTab, status, routerLocale]);

  // 私有 OSS 封面依赖短期签名：用户长时间挂页后再回来，静默重拉列表以换新签名
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      void fetchDecks({ silent: true });
      if (activeTab === 'public') {
        void fetchPublicDecks('', { silent: true });
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [fetchDecks, fetchPublicDecks, activeTab]);

  // 处理牌组点击
  const handleDeckClick = (deckId: string) => {
    trackButtonClick('DECK_CLICK', 'home_page');
    router.push(`/workspace?deckId=${deckId}`);
  };

  // 处理创建新牌组：先打开弹窗，用户填写名称和可选封面后再创建
  const handleCreateDeck = () => {
    trackButtonClick('CREATE_DECK', 'home_page');
    setNewDeckName('');
    setNewDeckCoverStorageUrl('');
    setNewDeckCoverPreviewUrl('');
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
          coverImageUrl: newDeckCoverStorageUrl.trim() || undefined,
          isPublic: newDeckIsPublic,
          description: newDeckDescription.trim() || undefined,
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
    setEditDeckCoverPreviewUrl(deck.coverImageUrl ?? '');
    setEditDeckCoverStorageDraft(undefined);
    setEditDeckIsPublic(deck.isPublic);
    setEditDeckDescription(deck.description ?? '');
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
      if (editDeckCoverStorageDraft !== undefined) {
        body.coverImageUrl = editDeckCoverStorageDraft;
      }
      if (editDeckIsPublic !== editingDeck.isPublic) body.isPublic = editDeckIsPublic;
      if (editDeckDescription !== (editingDeck.description ?? '')) body.description = editDeckDescription;

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

  const handleCollectDeck = async (deckId: string, isCollected: boolean) => {
    try {
      const { getAnonymousHeaders } = await import('@/hooks/useAnonymousUser');
      const headers = getAnonymousHeaders();
      const res = await fetch(`/api/decks/${deckId}/collect`, {
        method: isCollected ? 'DELETE' : 'POST',
        headers,
      });
      if (res.ok) {
        fetchDecks();
        if (activeTab === 'public') fetchPublicDecks();
      }
    } catch (err) {
      console.error('Collect deck error:', err);
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
              <button
                onClick={() => setActiveTab('public')}
                className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === 'public'
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                公开社区
              </button>
            </div>

            {/* 右侧控制 */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  trackButtonClick('IMPORT_ANKI', 'home_page');
                  setShowAnkiImporter(true);
                }}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                导入 Anki
              </button>
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
        {/* 公开社区区域 */}
        {activeTab === 'public' && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">公开牌组</h2>
              <div className="relative">
                <input
                  type="text"
                  placeholder="搜索公开牌组..."
                  className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm focus:ring-2 focus:ring-indigo-500"
                  onChange={(e) => fetchPublicDecks(e.target.value)}
                />
                <svg className="w-4 h-4 absolute left-3 top-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
            {publicLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map(i => <div key={i} className="h-64 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {publicDecks.map((deck, idx) => (
                  <div key={deck.id} className="group flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-all">
                    <div className="relative h-32">
                      {deck.coverImageUrl ? (
                        <img src={deck.coverImageUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${getDeckColor(idx)}`} />
                      )}
                      <div className="absolute top-2 right-2">
                        <button
                          onClick={() => handleCollectDeck(deck.id, !!deck.isCollected)}
                          className={`p-2 rounded-full backdrop-blur-md transition-colors ${
                            deck.isCollected ? 'bg-indigo-600 text-white' : 'bg-white/20 text-white hover:bg-white/40'
                          }`}
                        >
                          <svg className="w-4 h-4" fill={deck.isCollected ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <div className="p-4 flex-1 flex flex-col">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-1 line-clamp-1">{deck.name}</h3>
                      <p className="text-xs text-gray-500 mb-2 line-clamp-2">{deck.description || '暂无描述'}</p>
                      <div className="mt-auto flex items-center justify-between text-xs text-gray-400">
                        <div className="flex items-center">
                          <span className="truncate max-w-[80px]">@{deck.author}</span>
                        </div>
                        <span>{deck.cardCount} 张卡片</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 精选牌组区域 */}
        {activeTab !== 'public' && featuredDecks.length > 0 && (
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
        {activeTab !== 'public' && (
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

              {/* 收藏的牌组显示在最近列表 */}
              {collectedDecks.map((deck) => (
                <div
                  key={deck.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleDeckClick(deck.id)}
                  className="group h-48 rounded-lg border border-indigo-200 dark:border-indigo-900/50 hover:border-indigo-500 dark:hover:border-indigo-400 hover:shadow-lg transition-all bg-indigo-50/30 dark:bg-indigo-900/10 p-4 flex flex-col cursor-pointer relative"
                >
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded text-[10px] font-bold">收藏</div>
                  </div>
                  <div className="flex items-start justify-between mb-3">
                    {deck.coverImageUrl ? (
                      <img src={deck.coverImageUrl} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
                        <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2">
                      {deck.name}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {deck.cardCount} 张卡片 · @{deck.author}
                    </p>
                  </div>
                </div>
              ))}

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
        )}

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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">牌组描述</label>
                <textarea
                  value={newDeckDescription}
                  onChange={(e) => setNewDeckDescription(e.target.value)}
                  placeholder="简单介绍一下这个牌组的内容..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent min-h-[80px]"
                />
              </div>
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="new-deck-public"
                  checked={newDeckIsPublic}
                  onChange={(e) => setNewDeckIsPublic(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <label htmlFor="new-deck-public" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  公开牌组（所有人可见并收藏）
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">封面图片（选填）</label>
                {newDeckCoverPreviewUrl ? (
                  <div className="relative w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-900">
                    <img
                      src={newDeckCoverPreviewUrl}
                      alt=""
                      className="block h-32 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setNewDeckCoverStorageUrl('');
                        setNewDeckCoverPreviewUrl('');
                      }}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center text-sm hover:bg-black/80"
                      aria-label="移除封面"
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
                        const { storageUrl, previewUrl } = await uploadCoverImage(file);
                        setNewDeckCoverStorageUrl(storageUrl);
                        setNewDeckCoverPreviewUrl(previewUrl);
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
                          const { storageUrl, previewUrl } = await uploadCoverImage(file);
                          setNewDeckCoverStorageUrl(storageUrl);
                          setNewDeckCoverPreviewUrl(previewUrl);
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
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">支持 JPG/PNG/WebP，不超过 5MB（大图会自动压缩）</p>
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">牌组描述</label>
                <textarea
                  value={editDeckDescription}
                  onChange={(e) => setEditDeckDescription(e.target.value)}
                  placeholder="简单介绍一下这个牌组的内容..."
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:ring-2 focus:ring-indigo-500 focus:border-transparent min-h-[80px]"
                />
              </div>
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="edit-deck-public"
                  checked={editDeckIsPublic}
                  onChange={(e) => setEditDeckIsPublic(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                />
                <label htmlFor="edit-deck-public" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  公开牌组（所有人可见并收藏）
                </label>
              </div>
              {editDeckIsPublic && editingDeck?.shareToken && (
                <div className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-800">
                  <p className="text-xs text-gray-500 mb-2">分享链接：</p>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={`${window.location.origin}/share/${editingDeck.shareToken}`}
                      className="flex-1 bg-transparent text-xs text-gray-600 dark:text-gray-400 border-none p-0 focus:ring-0"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/share/${editingDeck.shareToken}`);
                        alert('链接已复制');
                      }}
                      className="text-xs text-indigo-600 hover:text-indigo-500 font-medium"
                    >
                      复制
                    </button>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">封面图片（选填）</label>
                {editDeckCoverPreviewUrl ? (
                  <div className="relative w-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-900">
                    <img
                      src={editDeckCoverPreviewUrl}
                      alt=""
                      className="block h-32 w-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setEditDeckCoverPreviewUrl('');
                        setEditDeckCoverStorageDraft(null);
                      }}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center text-sm hover:bg-black/80"
                      aria-label="移除封面"
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
                        const { storageUrl, previewUrl } = await uploadCoverImage(file);
                        setEditDeckCoverStorageDraft(storageUrl);
                        setEditDeckCoverPreviewUrl(previewUrl);
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
                          const { storageUrl, previewUrl } = await uploadCoverImage(file);
                          setEditDeckCoverStorageDraft(storageUrl);
                          setEditDeckCoverPreviewUrl(previewUrl);
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
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">支持 JPG/PNG/WebP，不超过 5MB（大图会自动压缩）</p>
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

      {/* Anki 导入弹窗 */}
      {showAnkiImporter && (
        <AnkiImporter
          onImportComplete={(result) => {
            // 导入完成后刷新牌组列表
            fetchDecks();
          }}
          onClose={() => setShowAnkiImporter(false)}
        />
      )}
    </div>
  );
}
