'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { useSession } from 'next-auth/react';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { trackPageViewEvent, trackButtonClick } from '@/lib/analytics';

interface Deck {
  id: string;
  name: string;
  coverImageUrl?: string | null;
  description?: string | null;
  cardCount: number;
  author: string;
  authorImage?: string | null;
  updatedAt: string;
}

export default function SharePage({ params }: { params: { token: string; locale: string } }) {
  const { token } = params;
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const { data: session } = useSession();
  
  const [deck, setDeck] = useState<Deck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [collectLoading, setCollectLoading] = useState(false);

  useEffect(() => {
    const fetchDeck = async () => {
      try {
        const res = await fetch(`/api/decks/share/${token}`);
        const response = await res.json();
        const data = response.success ? response.data : response;
        if (!res.ok) throw new Error(data?.message || 'Failed to fetch deck');
        setDeck(data.deck);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error');
      } finally {
        setLoading(false);
      }
    };
    fetchDeck();
    trackPageViewEvent('SHARE_PAGE', { token });
  }, [token]);

  const handleCollect = async () => {
    if (!deck) return;
    if (!session) {
      router.push(`/login?callbackUrl=/share/${token}`);
      return;
    }

    setCollectLoading(true);
    try {
      const { getAnonymousHeaders } = await import('@/hooks/useAnonymousUser');
      const headers = getAnonymousHeaders();
      const res = await fetch(`/api/decks/${deck.id}/collect`, {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        trackButtonClick('COLLECT_FROM_SHARE', 'share_page');
        router.push('/');
      } else {
        const data = await res.json();
        alert(data.message || '收藏失败');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setCollectLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error || !deck) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">哎呀，链接失效了</h1>
        <p className="text-gray-500 mb-8">{error || '找不到该牌组'}</p>
        <button onClick={() => router.push('/')} className="bg-indigo-600 text-white px-6 py-2 rounded-lg">
          回到首页
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <nav className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <div className="container mx-auto flex justify-between items-center">
          <button onClick={() => router.push('/')} className="text-xl font-bold text-indigo-600">
            NihongoGPT
          </button>
          <LanguageSwitcher />
        </div>
      </nav>

      <main className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="relative h-48 md:h-64">
            {deck.coverImageUrl ? (
              <img src={deck.coverImageUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-purple-600" />
            )}
          </div>
          
          <div className="p-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{deck.name}</h1>
                <div className="flex items-center text-sm text-gray-500">
                  <span>@{deck.author}</span>
                  <span className="mx-2">·</span>
                  <span>{deck.cardCount} 张卡片</span>
                </div>
              </div>
            </div>

            <p className="text-gray-600 dark:text-gray-300 mb-8 leading-relaxed">
              {deck.description || '这个牌组的主人很懒，什么都没有留下。'}
            </p>

            <button
              onClick={handleCollect}
              disabled={collectLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
            >
              {collectLoading ? '处理中...' : (session ? '收藏并导入我的空间' : '登录以收藏该牌组')}
            </button>
            <button
              type="button"
              onClick={() => {
                trackButtonClick('PREVIEW_SHARED_DECK', 'share_page');
                router.push(`/${locale}/workspace?deckId=${deck.id}`);
              }}
              className="w-full mt-3 border-2 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold py-3 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
            >
              在线预览资源与卡片（无需登录）
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
