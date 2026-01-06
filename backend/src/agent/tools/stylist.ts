// @ts-nocheck
/**
 * Stylist Tool - 搭配师
 * 
 * 分析核心单品、模特和场景图像，生成专业的服装搭配建议（outfit_instruct）
 * 这个搭配建议可以用于后续的图像生成 prompt
 * 
 * 输出：中英文双语版本
 * - zh: 中文搭配描述（给用户看）
 * - en: 英文搭配描述（用于图像生成 prompt）
 * 
 * @author Onstage Team
 * @version 1.1.0
 */

import { getGenAIClient, safetySettings, createImagePart, extractText } from '../../lib/genai.js';
import { config } from '../../config/index.js';
import { createLogger } from '../../lib/logger.js';

const logger = createLogger('tool:stylist');

// ============================================
// 配置
// ============================================

const STYLIST_MODEL = config.ai.models.stylist;

// 输出配置
const MAX_OUTPUT_TOKENS = 2048;  // 需要容纳中英文双语
const TARGET_LENGTH_ZH = 500;    // 中文约 500 字
const TARGET_LENGTH_EN = 300;    // 英文约 300 词

// ============================================
// 类型定义
// ============================================

export interface StylistInput {
  /** 核心单品图（必须）- Base64 或 URL */
  productImage: string;
  /** 模特图（可选）- 用于分析模特特征以匹配搭配风格 */
  modelImage?: string;
  /** 场景图（可选）- 用于让搭配与环境协调 */
  sceneImage?: string;
  /** 风格偏好（可选）- 如 '简约高级'、'街头潮流'、'法式优雅' */
  stylePreference?: string;
  /** 输出语言（可选）- 默认返回双语 */
  outputLanguage?: 'zh' | 'en' | 'both';
}

export interface StylistOutput {
  /** 中文搭配描述 - 给用户展示 */
  outfit_instruct_zh: string;
  /** 英文搭配描述 - 用于图像生成 prompt */
  outfit_instruct_en: string;
  /** 单品分析摘要（可选） */
  product_analysis?: string;
}

// ============================================
// 主函数
// ============================================

/**
 * 生成搭配建议（双语版本）
 * 
 * @param input - 输入参数
 * @returns 中英文搭配描述
 * 
 * @example
 * ```ts
 * const result = await generateOutfitInstruct({
 *   productImage: 'data:image/jpeg;base64,...',
 *   modelImage: 'data:image/jpeg;base64,...',
 *   sceneImage: 'data:image/jpeg;base64,...',
 *   stylePreference: '法式优雅'
 * });
 * 
 * console.log(result.outfit_instruct_zh); // "模特身穿浅蓝色法式方领衬衫..."
 * console.log(result.outfit_instruct_en); // "The model wears a light blue French..."
 * ```
 */
export async function generateOutfitInstruct(input: StylistInput): Promise<StylistOutput> {
  logger.info('Starting outfit instruction generation', {
    hasProductImage: !!input.productImage,
    hasModelImage: !!input.modelImage,
    hasSceneImage: !!input.sceneImage,
    stylePreference: input.stylePreference,
    productImageLength: input.productImage?.length || 0,
  });
  
  const client = getGenAIClient();
  
  // 构建 prompt
  const prompt = buildStylistPrompt(input);
  
  // 构建 parts（图片 + 文本）
  const parts: any[] = [];
  
  // 添加核心单品图（必须）
  const imagePart = createImagePart(input.productImage);
  logger.debug('Created image part', { type: Object.keys(imagePart)[0] });
  parts.push(imagePart);
  
  // 添加模特图（可选）
  if (input.modelImage) {
    parts.push(createImagePart(input.modelImage));
  }
  
  // 添加场景图（可选）
  if (input.sceneImage) {
    parts.push(createImagePart(input.sceneImage));
  }
  
  // 添加 prompt
  parts.push({ text: prompt });
  
  try {
    logger.info('Calling Gemini API', { model: STYLIST_MODEL, partsCount: parts.length });
    
    // 调用模型
    const response = await client.models.generateContent({
      model: STYLIST_MODEL,
      contents: [{ role: 'user', parts }],
      config: {
        safetySettings,
      },
    });
    
    logger.info('Gemini API response received');
    
    // 提取文本响应
    const rawOutput = extractText(response);
    
    if (!rawOutput) {
      logger.error('No text in response', { response: JSON.stringify(response).substring(0, 500) });
      throw new Error('Stylist Tool: Failed to generate outfit instruction');
    }
    
    logger.debug('Raw output length', { length: rawOutput.length });
    
    // 解析双语输出
    const result = parseBilingualOutput(rawOutput);
    
    logger.info('Outfit instruction generated successfully');
    return result;
    
  } catch (error: any) {
    logger.error('Gemini API call failed', {
      errorName: error?.name,
      errorMessage: error?.message,
      errorCode: error?.code,
      errorStatus: error?.status,
      errorDetails: JSON.stringify(error).substring(0, 1000),
    });
    throw error;
  }
}

/**
 * 解析双语输出
 * 期望格式:
 * ---ZH---
 * 中文内容
 * ---EN---
 * 英文内容
 */
function parseBilingualOutput(rawOutput: string): StylistOutput {
  // 尝试解析结构化输出
  const zhMatch = rawOutput.match(/---ZH---([\s\S]*?)(?=---EN---|$)/i);
  const enMatch = rawOutput.match(/---EN---([\s\S]*?)$/i);
  
  if (zhMatch && enMatch) {
    return {
      outfit_instruct_zh: zhMatch[1].trim(),
      outfit_instruct_en: enMatch[1].trim(),
    };
  }
  
  // 如果没有标记，尝试按段落分割（假设前半是中文，后半是英文）
  const paragraphs = rawOutput.split(/\n\n+/);
  const midPoint = Math.floor(paragraphs.length / 2);
  
  // 检测语言
  const hasChineseChars = (text: string) => /[\u4e00-\u9fa5]/.test(text);
  
  const zhParagraphs = paragraphs.filter(p => hasChineseChars(p));
  const enParagraphs = paragraphs.filter(p => !hasChineseChars(p) && p.trim().length > 20);
  
  if (zhParagraphs.length > 0 && enParagraphs.length > 0) {
    return {
      outfit_instruct_zh: zhParagraphs.join('\n\n'),
      outfit_instruct_en: enParagraphs.join('\n\n'),
    };
  }
  
  // 兜底：如果只有一种语言，返回相同内容（后续可以再翻译）
  return {
    outfit_instruct_zh: rawOutput,
    outfit_instruct_en: rawOutput,
  };
}

// ============================================
// Prompt 构建
// ============================================

/**
 * 构建搭配师 Prompt（双语输出版本）
 */
function buildStylistPrompt(input: StylistInput): string {
  // 确定图片顺序说明
  let imageDescriptionZh = '第一张图是核心单品';
  let imageDescriptionEn = 'The first image is the core product';
  
  if (input.modelImage && input.sceneImage) {
    imageDescriptionZh = '第一张图是核心单品，第二张图是模特参考，第三张图是拍摄环境';
    imageDescriptionEn = 'First image: core product. Second: model reference. Third: shooting environment';
  } else if (input.modelImage) {
    imageDescriptionZh = '第一张图是核心单品，第二张图是模特参考';
    imageDescriptionEn = 'First image: core product. Second: model reference';
  } else if (input.sceneImage) {
    imageDescriptionZh = '第一张图是核心单品，第二张图是拍摄环境';
    imageDescriptionEn = 'First image: core product. Second: shooting environment';
  }
  
  let prompt = `你是由《Vogue》和《GQ》特聘的资深时尚造型总监。你的任务是基于核心单品，为电商拍摄设计一套极具高级感、符合当下流行趋势的服装搭配（Look）。

# Inputs
${imageDescriptionZh}
`;

  // 添加风格偏好
  if (input.stylePreference) {
    prompt += `- 用户偏好风格 / Style preference: ${input.stylePreference}\n`;
  }

  prompt += `
# Styling Logic (Think step-by-step, but don't output)
1. 分析核心单品: 识别核心单品的主色调、材质（如丹宁、丝绸、皮革）和版型。
2. ${input.sceneImage ? '环境融合: 搭配的色系必须与环境图形成和谐（同色系高级感）或撞色（视觉冲击）的关系。' : '色彩搭配: 选择与核心单品和谐或形成高级撞色的色系。'}
3. 材质互补: 如果核心单品是哑光，搭配光泽感配饰；如果是重工面料，搭配简约基础款。
4. 主次分明: 所有搭配单品（上装/下装/鞋/配饰）都是为了烘托核心单品，严禁在色彩或设计上喧宾夺主。
${input.modelImage ? '5. 模特适配: 搭配风格需要与模特的气质相匹配。' : ''}

# Task
生成一段详细的搭配描述，包含上装、下装、鞋履、配饰和整体风格氛围。
**必须同时输出中文和英文两个版本**，用于不同场景使用。

# Output Format (STRICTLY FOLLOW)
---ZH---
[中文搭配描述，约 ${TARGET_LENGTH_ZH} 字]

---EN---
[English outfit description, around ${TARGET_LENGTH_EN} words]

# Content Requirements
描述必须包含以下细节 / Must include:
1. 具体款式与剪裁 / Specific styles and cuts (e.g., oversized blazer, high-waisted straight-leg pants)
2. 精确的面料与质感 / Precise fabrics and textures (e.g., chunky knit, patent leather, distressed denim)
3. 准确的色彩术语 / Accurate color terminology (e.g., Morandi gray, Klein blue, earth tones)
4. 配饰细节 / Accessory details (e.g., minimalist metal earrings, vintage sunglasses, underarm bag)

# Example Style (for reference only)
中文示例：
'模特身穿[核心单品]，搭配一条米白色高腰羊毛阔腿裤，面料呈现细腻的绒感。外搭一件深驼色大廓形风衣，敞开穿着以露出核心单品。脚踩一双方头切尔西靴，皮革光泽感强。佩戴金色粗链条项链，整体呈现出一种慵懒而高级的风格。'

English example:
'The model wears [core product], paired with off-white high-waisted wool wide-leg trousers with a fine fuzzy texture. Layered with a deep camel oversized trench coat worn open to showcase the core piece. Square-toe Chelsea boots in glossy leather complete the look. Accessorized with a chunky gold chain necklace, creating an effortlessly luxurious aesthetic.'

# Constraints
- 不要输出任何推理过程 / Do not output reasoning process
- 直接输出结构化的双语内容 / Output structured bilingual content directly
- 中英文内容要对应，但不是逐字翻译 / Content should correspond but not be literal translation

现在，请开始搭配：`;

  return prompt;
}

// ============================================
// Tool Definition（给 Agent 使用）
// ============================================

export const STYLIST_TOOL_DEFINITION = {
  name: 'stylist',
  description: `时尚搭配师工具。分析核心单品、模特和场景，生成专业的服装搭配建议。
返回中英文双语版本：
- outfit_instruct_zh: 中文搭配描述（给用户展示）
- outfit_instruct_en: 英文搭配描述（用于图像生成 prompt）
这个搭配建议可以直接用于后续的图像生成，或返回给用户确认后再使用。`,
  parameters: {
    type: 'object',
    properties: {
      product_image: {
        type: 'string',
        description: "核心单品图片引用（必须），如 'image_1'",
      },
      model_image: {
        type: 'string',
        description: '模特图片引用（可选），用于分析模特特征以匹配搭配风格',
      },
      scene_image: {
        type: 'string',
        description: '场景/背景图片引用（可选），用于让搭配与环境协调',
      },
      style_preference: {
        type: 'string',
        description: "用户偏好的风格方向（可选），如 '简约高级'、'街头潮流'、'法式优雅'",
      },
    },
    required: ['product_image'],
  },
};


