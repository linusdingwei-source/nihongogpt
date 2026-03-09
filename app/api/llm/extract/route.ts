import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { consumeCredits, getCredits } from '@/lib/credits';
import { getUserId } from '@/lib/anonymous-user';
import { successResponse, errorResponse, ErrorCodes } from '@/lib/api-response';
import OpenAI from 'openai';

const LLM_CREDITS_COST = 0.01; // 提取消耗 0.01 credit (100次调用=1credit)

interface ExtractedItem {
  text: string;
  type: 'SENTENCE' | 'WORD';
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    // 获取用户 ID（支持登录用户和临时用户）
    const userId = await getUserId(session, request);
    
    if (!userId) {
      return NextResponse.json(
        errorResponse(ErrorCodes.UNAUTHORIZED, 'Unauthorized'),
        { status: 401 }
      );
    }

    const { text } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, 'Text is required'),
        { status: 400 }
      );
    }

    if (text.length > 2000) {
      return NextResponse.json(
        errorResponse(ErrorCodes.BAD_REQUEST, 'Text is too long (max 2000 characters)'),
        { status: 400 }
      );
    }

    // 检查 credits
    const currentCredits = await getCredits(userId);
    
    if (currentCredits < LLM_CREDITS_COST) {
      return NextResponse.json(
        errorResponse(
          ErrorCodes.INSUFFICIENT_CREDITS,
          'Insufficient credits. Please purchase a package.',
          { credits: currentCredits, required: LLM_CREDITS_COST }
        ),
        { status: 402 }
      );
    }

    // 检查 DashScope API Key
    if (!process.env.DASHSCOPE_API_KEY) {
      return NextResponse.json(
        errorResponse(ErrorCodes.INTERNAL_ERROR, 'DashScope API key is not configured'),
        { status: 500 }
      );
    }

    // 构建 LLM Prompt - 提取日文句子和关键词
    const systemContent = `你是一个专业的日语教育专家和内容分析助手。你的任务是深入理解用户提供的日语学习材料（包括语法说明、例句、单词解释等），识别出其中核心的日语知识点，并据此提炼或创作出最适合制作成闪卡（Anki卡片）的内容。`;
    
    const userContent = `请分析以下文本，提炼出其中的核心日语知识点，并按照要求转换为适合制作闪卡的条目。

任务目标：
1. **识别知识点**：分析文本中提到的语法、词汇用法、表达方式等。
2. **提炼与创作**：
   - 如果文本中有现成的经典例句，直接提取为 SENTENCE。
   - 如果文本解释了某个知识点但缺乏例句，请**基于该知识点创作一个简单且地道的日语例句**，标记为 SENTENCE。
   - 提取文本中的核心关键词或新词汇，标记为 WORD。
   - 对于核心语法点，可以将其核心表达结构提取为 WORD。

输出规则：
1. 每一行只输出一个条目。
2. 格式：类型|内容（类型必须是 SENTENCE 或 WORD）。
3. 优先保证内容的记忆价值，不要只是机械地拆分原文。
4. 条目内容应简洁明了，适合在闪卡正面展示。

待处理文本：
${text}

请按格式输出结果，每行一个，严禁任何额外的解释或开场白：`;

    // 使用 OpenAI 兼容 Chat Completions API 调用 qwen3.5-plus
    const openai = new OpenAI({
      apiKey: process.env.DASHSCOPE_API_KEY,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    });

    const completion = await openai.chat.completions.create({
      model: 'qwen3.5-plus',
      max_tokens: 4096,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent }
      ]
    });

    const llmOutput = completion.choices[0]?.message?.content;
    
    if (llmOutput) {
      
      // 解析 LLM 输出
      const items: ExtractedItem[] = [];
      const lines = llmOutput.split('\n').filter((line: string) => line.trim());
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        // 匹配格式：SENTENCE|xxx 或 WORD|xxx
        const match = trimmedLine.match(/^(SENTENCE|WORD)\|(.+)$/);
        if (match) {
          items.push({
            type: match[1] as 'SENTENCE' | 'WORD',
            text: match[2].trim()
          });
        }
      }
      
      // 如果没有解析到任何内容，尝试将整个文本作为句子
      if (items.length === 0 && text.trim()) {
        items.push({
          type: 'SENTENCE',
          text: text.trim()
        });
      }
      
      // 消耗 credits
      await consumeCredits(userId, LLM_CREDITS_COST);
      
      const remainingCredits = await getCredits(userId);

      return NextResponse.json(
        successResponse({
          items,
          credits: remainingCredits,
        })
      );
    } else {
      // 如果 LLM 没有返回有效内容，将原文作为句子返回
      return NextResponse.json(
        successResponse({
          items: [{
            type: 'SENTENCE' as const,
            text: text.trim()
          }],
          credits: await getCredits(userId),
        })
      );
    }
  } catch (error) {
    console.error('LLM extract error:', error);
    return NextResponse.json(
      errorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to extract content'),
      { status: 500 }
    );
  }
}
