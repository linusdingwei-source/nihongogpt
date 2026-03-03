import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { PAYMENT_PACKAGES } from '@/lib/payment-packages';
import { createWechatNativeOrder } from '@/lib/wechatpay';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { packageId } = await request.json();
    if (!packageId) {
      return NextResponse.json({ error: 'Package ID is required' }, { status: 400 });
    }

    const pkg = PAYMENT_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) {
      return NextResponse.json({ error: 'Invalid package' }, { status: 400 });
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const notifyUrl = `${baseUrl}/api/payment/wechat/notify`;

    const outTradeNo = `wechat_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const order = await prisma.order.create({
      data: {
        userId: session.user.id as string,
        stripeId: outTradeNo,
        provider: 'wechat',
        amount: pkg.priceCny * 100,
        credits: pkg.totalCredits,
        status: 'pending',
      },
    });

    const result = await createWechatNativeOrder({
      outTradeNo: order.stripeId,
      description: `Credits - ${pkg.name} (${pkg.totalCredits} credits)`,
      totalCents: pkg.priceCny * 100,
      notifyUrl,
    });

    if (!result) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'failed' },
      });
      return NextResponse.json(
        {
          error:
            'WeChat Pay is not configured. Set WECHAT_PAY_APP_ID, WECHAT_PAY_MCH_ID, WECHAT_PAY_PRIVATE_KEY, WECHAT_PAY_API_V3_KEY (and WECHAT_PAY_PUBLIC_CERT, WECHAT_PAY_SERIAL_NO).',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ code_url: result.code_url, outTradeNo: order.stripeId });
  } catch (error) {
    console.error('WeChat create error:', error);
    return NextResponse.json(
      { error: 'Failed to create WeChat Pay order' },
      { status: 500 }
    );
  }
}
