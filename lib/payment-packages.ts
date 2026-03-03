/**
 * 套餐定义（Stripe / 支付宝 / 微信共用）
 * 金额：Stripe 为美元，支付宝/微信为人民币元，amountCents 统一为分（1元=100分）
 */
export const PAYMENT_PACKAGES = [
  {
    id: 'starter',
    name: 'Starter',
    priceUsd: 5,
    priceCny: 35, // 约 1:7 展示用，实际以商户后台为准
    credits: 5,
    bonusCredits: 2,
    totalCredits: 7,
    stripePriceId: process.env.STRIPE_PRICE_ID_STARTER || '',
  },
  {
    id: 'pro',
    name: 'Pro',
    priceUsd: 20,
    priceCny: 140,
    credits: 20,
    bonusCredits: 10,
    totalCredits: 30,
    stripePriceId: process.env.STRIPE_PRICE_ID_PRO || '',
  },
  {
    id: 'premium',
    name: 'Premium',
    priceUsd: 100,
    priceCny: 700,
    credits: 100,
    bonusCredits: 50,
    totalCredits: 150,
    stripePriceId: process.env.STRIPE_PRICE_ID_PREMIUM || '',
  },
] as const;

export type PackageId = (typeof PAYMENT_PACKAGES)[number]['id'];
