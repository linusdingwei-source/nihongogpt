import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserId } from '@/lib/anonymous-user';
import { errorResponse, ErrorCodes } from '@/lib/api-response';
import { getSignedUrlForStorageUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sources/[id]/view
 * 预览资源代理：解决阿里云 OSS 默认域名强制下载的问题。
 * 逻辑：后端获取签名 URL，fetch 之后以 inline 方式流式返回给前端。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    const userId = await getUserId(session, request);

    if (!userId) {
      return NextResponse.json(
        errorResponse(ErrorCodes.UNAUTHORIZED, 'Unauthorized'),
        { status: 401 }
      );
    }

    const { id } = await params;

    const source = await prisma.source.findFirst({
      where: { id, userId },
      select: {
        contentUrl: true,
        fileUrl: true,
        mimeType: true,
        name: true,
      },
    });

    if (!source) {
      return NextResponse.json(
        errorResponse(ErrorCodes.NOT_FOUND, 'Source not found'),
        { status: 404 }
      );
    }

    const rawUrl = source.fileUrl || source.contentUrl;
    if (!rawUrl) {
      return NextResponse.json(
        errorResponse(ErrorCodes.NOT_FOUND, 'Resource URL not found'),
        { status: 404 }
      );
    }

    // 获取签名 URL（内联预览模式）
    const signedUrl = await getSignedUrlForStorageUrl(rawUrl, 3600);
    if (!signedUrl) {
      return NextResponse.json(
        errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to sign URL'),
        { status: 500 }
      );
    }

    console.log(`[PDF View Proxy] Fetching from OSS: ${signedUrl.split('?')[0]}... (signature hidden)`);

    // 请求 OSS 资源
    const response = await fetch(signedUrl);
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[PDF View Proxy] OSS fetch failed (${response.status}):`, errorText);
      return NextResponse.json(
        errorResponse(ErrorCodes.INTERNAL_ERROR, `Failed to fetch from storage: ${response.statusText}`),
        { status: response.status }
      );
    }

    // 构造流式响应，强制 Content-Disposition 为 inline
    const contentType = response.headers.get('content-type') || source.mimeType || 'application/octet-stream';
    
    // 创建新的 Headers，保留必要的元数据但修改 Disposition
    const headers = new Headers();
    headers.set('Content-Type', contentType);
    headers.set('Content-Disposition', 'inline');
    // 如果是 PDF，额外确保安全
    if (contentType === 'application/pdf') {
      headers.set('X-Content-Type-Options', 'nosniff');
    }

    // 流式返回
    return new NextResponse(response.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('Source view proxy error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Internal Server Error'),
      { status: 500 }
    );
  }
}
