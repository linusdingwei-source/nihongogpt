import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { getUserId } from '@/lib/anonymous-user';
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-response';

export const dynamic = 'force-dynamic';

// 获取所有目录
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

    console.log(`[GET /api/folders] Fetching folders for userId: ${userId}, deckId: ${deckId}`);

    const where: any = { userId };
    if (deckId) {
      where.deckId = {
        equals: deckId
      };
    }

    try {
      console.log('[GET /api/folders] Calling prisma.sourceFolder.findMany with:', JSON.stringify(where));
      const folders = await prisma.sourceFolder.findMany({
        where,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          parentId: true,
          createdAt: true,
          deckId: true,
          _count: {
            select: { sources: true },
          },
        },
      });
      console.log(`[GET /api/folders] Found ${folders.length} folders`);

      return NextResponse.json(
        successResponse({
          folders: folders.map(f => ({
            ...f,
            sourceCount: f._count.sources,
          })),
        })
      );
    } catch (prismaError) {
      console.error('[GET /api/folders] Prisma error:', prismaError);
      throw prismaError;
    }
  } catch (error) {
    console.error('Get folders error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to fetch folders'),
      { status: 500 }
    );
  }
}

// 创建目录
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

    const body = await request.json();
    const { name, parentId, deckId } = body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, 'Folder name is required'),
        { status: 400 }
      );
    }

    // 如果指定了父目录，验证其存在
    if (parentId) {
      const parentFolder = await prisma.sourceFolder.findFirst({
        where: { id: parentId, userId },
      });
      if (!parentFolder) {
        return NextResponse.json(
          errorResponse(ErrorCodes.NOT_FOUND, 'Parent folder not found'),
          { status: 404 }
        );
      }
    }

    // 检查同目录下是否存在同名目录（在同一个牌组内）
    const existingFolder = await prisma.sourceFolder.findFirst({
      where: {
        userId,
        name: name.trim(),
        parentId: parentId || null,
        deckId: deckId || null,
      },
    });

    if (existingFolder) {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, 'Folder with this name already exists in this deck'),
        { status: 400 }
      );
    }

    const folder = await prisma.sourceFolder.create({
      data: {
        userId,
        name: name.trim(),
        parentId: parentId || null,
        deckId: deckId || null,
      },
      select: {
        id: true,
        name: true,
        parentId: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      successResponse({ folder }),
      { status: 201 }
    );
  } catch (error) {
    console.error('Create folder error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create folder'),
      { status: 500 }
    );
  }
}
