import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { PAYMENT_PACKAGES } from '@/lib/payment-packages';
import { getAlipayPagePayUrl } from '@/lib/alipay';
import { getLocaleFromRequest, buildLocalizedPath } from '@/lib/locale-utils';

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
    const locale = getLocaleFromRequest(request);
    const returnUrl = `${baseUrl}${buildLocalizedPath(locale, 'payment/success')}?provider=alipay&out_trade_no=`;
    const notifyUrl = `${baseUrl}/api/payment/alipay/notify`;

    // 商户订单号唯一，用 cuid
    const order = await prisma.order.create({
      data: {
        userId: session.user.id as string,
        stripeId: `alipay_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        provider: 'alipay',
        amount: pkg.priceCny * 100, // 存为分
        credits: pkg.totalCredits,
        status: 'pending',
      },
    });
    const outTradeNo = order.stripeId.replace(/^alipay_/, '');
    // 支付宝要求 out_trade_no 商户订单号，我们存的是 stripeId 含前缀，传参用无前缀或直接用 stripeId
    const outTradeNoForAlipay = order.stripeId;

    const totalAmount = (pkg.priceCny).toFixed(2);
    const payUrl = getAlipayPagePayUrl({
      outTradeNo: outTradeNoForAlipay,
      totalAmount,
      subject: `Credits - ${pkg.name} (${pkg.totalCredits} credits)`,
      returnUrl: returnUrl + encodeURIComponent(outTradeNoForAlipay),
      notifyUrl,
      body: `userId=${session.user.id}&packageId=${pkg.id}`,
    });

    if (!payUrl) {
      await prisma.order.update({
        where: { id: order.id },
        data: { status: 'failed' },
      });
      return NextResponse.json(
        { error: 'Alipay is not configured. Set ALIPAY_APP_ID, ALIPAY_PRIVATE_KEY, ALIPAY_PUBLIC_KEY.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: payUrl, outTradeNo: outTradeNoForAlipay });
  } catch (error) {
    console.error('Alipay create error:', error);
    return NextResponse.json(
      { error: 'Failed to create Alipay order' },
      { status: 500 }
    );
  }
}
