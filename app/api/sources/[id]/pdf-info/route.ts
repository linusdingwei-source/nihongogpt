import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { getSignedUrlForStorageUrl } from '@/lib/storage';

// 必须配置 worker
// @ts-ignore
if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  // 在服务端环境，我们可以直接引用 build 目录下的 worker
  // 或者使用 CDN（对于 Node 环境，通常不需要 workerSrc，但 pdfjs-dist 在某些版本下会校验）
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const source = await prisma.source.findUnique({
      where: { id: params.id, userId: session.user.id },
    });

    if (!source || source.type !== 'pdf') {
      return NextResponse.json({ error: 'Source not found or not a PDF' }, { status: 404 });
    }

    const signedUrl = await getSignedUrlForStorageUrl(source.fileUrl || source.contentUrl);
    
    // 在服务端读取 PDF 不需要 canvas
    const loadingTask = pdfjs.getDocument({
      url: signedUrl,
      disableRange: true,
      disableStream: true,
      disableAutoFetch: true,
    });
    
    const pdf = await loadingTask.promise;
    const pageCount = pdf.numPages;
    
    const metadata = await pdf.getMetadata().catch(() => null);
    const title = (metadata?.info as any)?.Title || source.name;

    await pdf.destroy();

    return NextResponse.json({
      success: true,
      data: {
        pageCount,
        title,
      }
    });
  } catch (error: any) {
    console.error('PDF info error:', error);
    return NextResponse.json({ error: error.message || 'Failed to get PDF info' }, { status: 500 });
  }
}
