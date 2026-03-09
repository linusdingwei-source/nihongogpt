import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserId } from '@/lib/anonymous-user';
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-response';
import { uploadToStorage, getSignedUrlForStorageUrl } from '@/lib/storage';

export const dynamic = 'force-dynamic';

// 获取用户的来源列表
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const userId = await getUserId(session, request);

    if (!userId) {
      return NextResponse.json(
        errorResponse(ErrorCodes.UNAUTHORIZED, 'Unauthorized'),
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const deckId = searchParams.get('deckId');

    console.log(`[GET /api/sources] Fetching sources for userId: ${userId}, deckId: ${deckId}`);

    const where: any = { 
      userId,
      parentSourceId: null, // Only show root sources, not page images
    };

    if (deckId) {
      where.deckId = {
        equals: deckId
      };
    }

    try {
      console.log('[GET /api/sources] Calling prisma.source.findMany with:', JSON.stringify(where));
      const sources = await prisma.source.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          type: true,
          folderId: true,
          contentUrl: true,
          fileUrl: true,
          fileName: true,
          mimeType: true,
          size: true,
          deckId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      console.log(`[GET /api/sources] Found ${sources.length} sources`);

      const sourcesWithSignedUrls = await Promise.all(
        sources.map(async (s) => ({
          ...s,
          contentUrl: await getSignedUrlForStorageUrl(s.contentUrl),
          fileUrl: await getSignedUrlForStorageUrl(s.fileUrl),
        }))
      );

      return NextResponse.json(
        successResponse({ sources: sourcesWithSignedUrls })
      );
    } catch (prismaError) {
      console.error('[GET /api/sources] Prisma error:', prismaError);
      throw prismaError;
    }
  } catch (error) {
    console.error('Get sources error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch sources'),
      { status: 500 }
    );
  }
}

// 创建新来源（上传文本内容到 Vercel Blob Storage）
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const userId = await getUserId(session, request);

    if (!userId) {
      return NextResponse.json(
        errorResponse(ErrorCodes.UNAUTHORIZED, 'Unauthorized'),
        { status: 401 }
      );
    }

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File;
      const parentSourceId = formData.get('parentSourceId') as string | null;
      const pageNumberStr = formData.get('pageNumber') as string | null;
      const pageNumber = pageNumberStr ? parseInt(pageNumberStr, 10) : null;
      const deckId = formData.get('deckId') as string | null;
      
      if (!file) {
        return NextResponse.json(
          errorResponse(ErrorCodes.BAD_REQUEST, 'File is required'),
          { status: 400 }
        );
      }

      let buffer: Buffer;
      try {
        console.log('[POST /api/sources] Converting file to buffer');
        buffer = Buffer.from(await file.arrayBuffer());
        console.log(`[POST /api/sources] Buffer created, size: ${buffer.length}`);
      } catch (bufErr) {
        console.error('[POST /api/sources] Failed to create buffer:', bufErr);
        return NextResponse.json(
          errorResponse(ErrorCodes.INTERNAL_ERROR, `Failed to process file buffer: ${bufErr instanceof Error ? bufErr.message : 'Unknown error'}`),
          { status: 500 }
        );
      }

      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filename = safeName; // 保持简单的文件名，由 storage 内部处理路径和唯一性
      console.log(`[POST /api/sources] Processing file: ${file.name}, size: ${file.size}, type: ${file.type}`);

      let contentUrl: string | null = null;
      try {
        console.log(`[POST /api/sources] Calling uploadToStorage for ${filename}`);
        const uploadResult = await uploadToStorage(
          buffer,
          filename,
          file.type,
          { pathPrefix: 'sources' }
        );
        contentUrl = uploadResult.url;
        console.log(`[POST /api/sources] Upload success: ${contentUrl}`);
      } catch (uploadError) {
        console.error('[POST /api/sources] Upload failed:', uploadError);
        return NextResponse.json(
          errorResponse(ErrorCodes.INTERNAL_ERROR, `Upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown error'}`),
          { status: 500 }
        );
      }

      const source = await prisma.source.create({
        data: {
          userId,
          name: file.name,
          type: file.type.startsWith('audio/') ? 'audio' : 
                file.type.startsWith('image/') ? 'image' : 'file',
          content: '', // 文件内容不直接存储在 content 字段
          contentUrl,
          size: file.size,
          mimeType: file.type,
          fileUrl: contentUrl, // 同时保存到 fileUrl
          fileName: file.name,
          parentSourceId: parentSourceId || null, // 关联父资源
          pageNumber: pageNumber || null, // PDF页码
          deckId: deckId || null, // 牌组 ID
        },
        select: {
          id: true,
          name: true,
          type: true,
          contentUrl: true,
          fileUrl: true,
          fileName: true,
          mimeType: true,
          size: true,
          parentSourceId: true,
          pageNumber: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return NextResponse.json(successResponse({ 
        source: {
          ...source,
          contentUrl: await getSignedUrlForStorageUrl(source.contentUrl),
          fileUrl: await getSignedUrlForStorageUrl(source.fileUrl),
        }
      }));
    }

    const body = await request.json().catch(() => ({}));
    const { name, content, type = 'text', deckId } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, 'Source name is required'),
        { status: 400 }
      );
    }

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, 'Source content is required'),
        { status: 400 }
      );
    }

    // 将文本内容转换为 Buffer 并上传到 Vercel Blob Storage
    const contentBuffer = Buffer.from(content, 'utf-8');
    const timestamp = Date.now();
    const filename = `sources/${timestamp}-${name.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;

    let contentUrl: string | null = null;
    try {
      const uploadResult = await uploadToStorage(
        contentBuffer,
        filename,
        'text/plain; charset=utf-8',
        { pathPrefix: 'sources' }
      );
      contentUrl = uploadResult.url;
    } catch (uploadError) {
      console.error('Failed to upload source to storage:', uploadError);
      // 如果上传失败，仍然保存到数据库，但 contentUrl 为 null
      // 内容会保存在 content 字段中
    }

    // 创建来源记录
    const source = await prisma.source.create({
      data: {
        userId,
        name: name.trim(),
        type,
        content: content.trim(),
        contentUrl,
        size: contentBuffer.length,
        mimeType: 'text/plain; charset=utf-8',
        deckId: deckId || null,
      },
      select: {
        id: true,
        name: true,
        type: true,
        contentUrl: true,
        fileUrl: true,
        fileName: true,
        mimeType: true,
        size: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(
      successResponse({ 
        source: {
          ...source,
          contentUrl: await getSignedUrlForStorageUrl(source.contentUrl),
          fileUrl: await getSignedUrlForStorageUrl(source.fileUrl),
        }
      })
    );
  } catch (error) {
    console.error('Create source error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create source'),
      { status: 500 }
    );
  }
}
