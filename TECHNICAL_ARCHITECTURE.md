# Onstage - 技术架构文档

> 版本: 1.0.0  
> 更新日期: 2025-01-01  
> 文档状态: Draft

---

## 1. 项目概述

**Onstage** 是一款 iOS 原生应用，为服饰品牌提供 AI 驱动的营销内容生成能力。本文档详细描述系统的技术架构、技术选型和实现方案。

### 1.1 核心功能模块

| 模块 | 功能描述 |
|------|----------|
| Chat Agent | 对话式 AI 交互，支持自然语言指令和图像编辑 |
| Shoot Room | 专业拍摄室，可视化控制光线、机位、焦距等参数 |
| 资产管理 | 管理模特、商品、场景、生成历史等素材资源 |
| 用户系统 | 账户管理、配额管理、订阅服务 |

---

## 2. 技术栈选型

### 2.1 iOS 客户端

```
语言: Swift 5.9+
UI 框架: SwiftUI (主) + UIKit (部分复杂交互)
最低版本: iOS 15.0
架构模式: MVVM + Clean Architecture
依赖管理: Swift Package Manager (SPM)
```

### 2.2 后端服务

```
运行时: Node.js 20 LTS / Python 3.11+ (AI 服务)
框架: Fastify (API Gateway) / FastAPI (AI Service)
数据库: PostgreSQL 15 (Supabase)
缓存: Redis 7
对象存储: Supabase Storage / AWS S3
消息队列: Redis Streams / AWS SQS
```

### 2.3 AI 服务

```
平台: Google Vertex AI (Gemini)
SDK: @google/genai (通过 API Key 调用)
备选模型: 预留其他模型 API 接口扩展能力
```

#### 2.3.1 模型配置表

| 用途 | 模型 | 说明 |
|------|------|------|
| Agent Thinking | `gemini-2.5-pro-preview-05-06` | Agent 主循环推理，支持 Tool Calling |
| 搭配师 Tool | `gemini-2.5-flash-preview-05-20` | 分析图像，生成搭配建议 |
| 图像生成 | `gemini-2.0-flash-preview-image-generation` | 生成模特图、商品图等 |
| 图像分析 | `gemini-2.5-flash-preview-05-20` | 分析图片内容（服装、模特、场景） |

> **注意**: 模型版本可能随 API 更新而变化，建议通过环境变量配置以便灵活切换。

### 2.4 基础设施

```
云平台: Google Cloud Platform (GCP) / Vercel
数据库托管: Supabase
CDN: Cloudflare
监控: Sentry + Datadog
CI/CD: GitHub Actions
```

---

## 3. 系统架构图

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              iOS Client (SwiftUI)                            │
│  ┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌──────────────┐ │
│  │   Chat View    │ │ Shoot Room View│ │  Assets View   │ │ Profile View │ │
│  └───────┬────────┘ └───────┬────────┘ └───────┬────────┘ └──────┬───────┘ │
│          │                  │                  │                  │          │
│  ┌───────┴──────────────────┴──────────────────┴──────────────────┴───────┐ │
│  │                        ViewModel Layer                                  │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │ │
│  │  │ChatViewModel │ │ShootViewModel│ │AssetViewModel│ │ UserViewModel│  │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │ │
│  └───────────────────────────────┬───────────────────────────────────────┘ │
│                                  │                                          │
│  ┌───────────────────────────────┴───────────────────────────────────────┐ │
│  │                         Domain Layer                                   │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │ │
│  │  │ ChatUseCase  │ │GenerateUseCase│ │AssetUseCase │ │ AuthUseCase  │  │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │ │
│  └───────────────────────────────┬───────────────────────────────────────┘ │
│                                  │                                          │
│  ┌───────────────────────────────┴───────────────────────────────────────┐ │
│  │                         Data Layer                                     │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐  │ │
│  │  │ APIService   │ │ ImageService │ │ CacheService │ │ AuthService  │  │ │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           API Gateway (Fastify)                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  /api/v1/chat      /api/v1/generate     /api/v1/assets    /api/v1/auth│   │
│  └───────┬────────────────────┬────────────────────┬───────────────┬────┘   │
└──────────┼────────────────────┼────────────────────┼───────────────┼────────┘
           │                    │                    │               │
           ▼                    ▼                    ▼               ▼
┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  ┌────────────┐
│   AI Service     │  │   AI Service     │  │   Supabase   │  │  Supabase  │
│   (Chat Agent)   │  │  (Generation)    │  │   Storage    │  │    Auth    │
│  ┌────────────┐  │  │  ┌────────────┐  │  │              │  │            │
│  │   Gemini   │  │  │  │   Gemini   │  │  │   Images     │  │   Users    │
│  │   (VLM)    │  │  │  │  (Image)   │  │  │   Assets     │  │   Sessions │
│  └────────────┘  │  │  └────────────┘  │  │              │  │            │
└──────────────────┘  └──────────────────┘  └──────────────┘  └────────────┘
                                                    │
                                                    ▼
                                           ┌──────────────┐
                                           │  PostgreSQL  │
                                           │  (Supabase)  │
                                           └──────────────┘
```

### 3.2 Chat Agent 架构 (Thinking LLM + Tools)

Chat Tab 采用完整的 Agent 架构，由 Thinking LLM 作为推理核心，通过 Tool Calling 执行具体操作。

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Chat Agent Architecture                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Agent Orchestrator                           │   │
│  │                                                                      │   │
│  │   User Input ──► Context Builder ──► Agent Loop ──► Response         │   │
│  │                        │                  │                          │   │
│  │                        ▼                  ▼                          │   │
│  │              ┌─────────────────┐  ┌─────────────────┐               │   │
│  │              │  Conversation   │  │   Tool Router   │               │   │
│  │              │    Context      │  │   & Executor    │               │   │
│  │              └─────────────────┘  └─────────────────┘               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Thinking LLM (Gemini 2.0)                       │   │
│  │                                                                      │   │
│  │   ┌─────────────────────────────────────────────────────────────┐   │   │
│  │   │                    System Prompt                             │   │   │
│  │   │  - Role: Fashion content creation assistant                  │   │   │
│  │   │  - Capabilities: Analyze images, generate content            │   │   │
│  │   │  - Tools: Available tool definitions                         │   │   │
│  │   │  - Guidelines: Brand-aware, quality-focused                  │   │   │
│  │   └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                      │   │
│  │   Input: User message + Images + Conversation history                │   │
│  │   Output: Thinking process + Tool calls / Final response             │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                          Tool Registry                               │   │
│  │                                                                      │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │   │  stylist    │  │change_outfit│  │change_model │                 │   │
│  │   │  (搭配师)   │  │             │  │             │                 │   │
│  │   └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  │                                                                      │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │   │  replicate  │  │  generate   │  │    edit     │                 │   │
│  │   │  _reference │  │   _image    │  │   _image    │                 │   │
│  │   └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  │                                                                      │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │   │  analyze    │  │   search    │  │    get      │                 │   │
│  │   │   _image    │  │   _assets   │  │   _presets  │                 │   │
│  │   └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  │                                                                      │   │
│  │   ┌─────────────┐  ┌─────────────┐                                  │   │
│  │   │   save      │  │ request_gui │                                  │   │
│  │   │   _to_asset │  │   _input    │                                  │   │
│  │   └─────────────┘  └─────────────┘                                  │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                      │                                      │
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Tool Implementations                          │   │
│  │                                                                      │   │
│  │   ┌───────────────────────────────────────────────────────────────┐ │   │
│  │   │                    Image Generation Tools                      │ │   │
│  │   │  - Vertex AI Gemini (Image Generation)                         │ │   │
│  │   │  - Prompt construction based on tool parameters                │ │   │
│  │   └───────────────────────────────────────────────────────────────┘ │   │
│  │                                                                      │   │
│  │   ┌───────────────────────────────────────────────────────────────┐ │   │
│  │   │                    Asset Management Tools                      │ │   │
│  │   │  - Supabase Storage & Database operations                      │ │   │
│  │   └───────────────────────────────────────────────────────────────┘ │   │
│  │                                                                      │   │
│  │   ┌───────────────────────────────────────────────────────────────┐ │   │
│  │   │                    Analysis Tools                              │ │   │
│  │   │  - Gemini VLM for image understanding                          │ │   │
│  │   └───────────────────────────────────────────────────────────────┘ │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 3.2.1 Agent Loop 流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Agent Loop Flow                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────┐                                                               │
│   │  Start  │                                                               │
│   └────┬────┘                                                               │
│        │                                                                    │
│        ▼                                                                    │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  1. Build Context                                                    │  │
│   │     - User message + uploaded images                                 │  │
│   │     - Conversation history (last N turns)                            │  │
│   │     - User's asset library summary                                   │  │
│   │     - Current session state                                          │  │
│   └────────────────────────────┬────────────────────────────────────────┘  │
│                                │                                            │
│                                ▼                                            │
│   ┌─────────────────────────────────────────────────────────────────────┐  │
│   │  2. Call Thinking LLM                                                │  │
│   │     - Send context + tool definitions                                │  │
│   │     - LLM reasons about user intent                                  │  │
│   │     - LLM decides: respond directly OR call tool(s)                  │  │
│   └────────────────────────────┬────────────────────────────────────────┘  │
│                                │                                            │
│                    ┌───────────┴───────────┐                               │
│                    │                       │                               │
│                    ▼                       ▼                               │
│   ┌────────────────────────┐  ┌────────────────────────────────────────┐  │
│   │  3a. Direct Response   │  │  3b. Tool Call(s)                       │  │
│   │      (No tool needed)  │  │      - Parse tool name & arguments      │  │
│   │                        │  │      - Execute tool                      │  │
│   │      Return response   │  │      - Get tool result                   │  │
│   │      to user           │  │                                          │  │
│   └────────────────────────┘  └───────────────────┬────────────────────┘  │
│                                                   │                        │
│                                                   ▼                        │
│                                ┌─────────────────────────────────────────┐ │
│                                │  4. Append Tool Result to Context       │ │
│                                │     - Tool output (images, data, etc.)  │ │
│                                │     - Any errors or status              │ │
│                                └───────────────────┬─────────────────────┘ │
│                                                    │                       │
│                                                    ▼                       │
│                                ┌─────────────────────────────────────────┐ │
│                                │  5. Continue Loop?                      │ │
│                                │     - If LLM wants more tools: Go to 2  │ │
│                                │     - If done: Generate final response  │ │
│                                └───────────────────┬─────────────────────┘ │
│                                                    │                       │
│                                                    ▼                       │
│                                             ┌───────────┐                  │
│                                             │    End    │                  │
│                                             └───────────┘                  │
│                                                                             │
│   Max iterations: 5 (防止无限循环)                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### 3.2.2 Stylist Tool 使用流程示例

```
用户: "帮我用这件衬衫搭配一套 Look"
     ↓ 上传 [image_1: 衬衫商品图]
     
Agent Thinking:
  "用户上传了一件衬衫，想要搭配建议。
   我应该先调用 stylist tool 分析这件衬衫并生成搭配方案。"
     ↓
     
Tool Call: stylist
  args: {
    product_image: "image_1",
    style_preference: null  // 用户没有指定
  }
     ↓
     
Stylist Tool 执行:
  1. 调用 Gemini 2.5 Flash 分析衬衫图片
  2. 生成中英文双语搭配描述
     ↓
     
Tool Result:
  {
    success: true,
    outfit_instruct_zh: "模特身穿浅蓝色法式方领衬衫，面料呈现轻薄的棉麻质感，
                         领口设计优雅大方。搭配一条米白色高腰直筒牛仔裤，
                         做旧水洗工艺带来复古感，裤脚微微卷边增添随性气息。
                         外搭一件卡其色轻薄针织开衫，敞开穿着露出核心单品，
                         营造层次感。脚踩一双白色帆布鞋，简约干净，
                         与整体的清新基调相呼应。佩戴细链条金属项链和小巧的耳钉，
                         整体呈现出一种清新自然的法式休闲风格，
                         适合春夏季节的日常穿搭或轻松的社交场合。",
    
    outfit_instruct_en: "The model wears a light blue French square-neck blouse 
                         in lightweight cotton-linen blend with an elegantly cut neckline.
                         Paired with off-white high-waisted straight-leg jeans featuring
                         vintage distressed wash and slightly rolled hems for a casual touch.
                         Layered with a khaki lightweight knit cardigan worn open to showcase
                         the core piece. White canvas sneakers complete the look with clean
                         minimalism. Accessorized with a delicate chain necklace and small
                         stud earrings, creating a fresh, natural French casual aesthetic
                         perfect for spring-summer daily wear or relaxed social occasions.",
    
    shouldContinue: true
  }
     ↓
     
Agent Thinking:
  "搭配方案已生成（中英双语）。
   - 中文版本展示给用户确认
   - 英文版本后续用于图像生成 prompt
   我应该先展示中文版本，询问用户下一步意图。"
     ↓
     
Agent Response:
  "我为这件衬衫设计了一套搭配方案：
   
   [展示 outfit_instruct_zh 中文内容]
   
   你觉得这个搭配怎么样？我可以：
   - 直接生成模特穿搭图
   - 调整搭配风格（如改成更正式/更休闲）
   - 换一套完全不同的搭配"
     
---

用户后续选择 "直接生成模特穿搭图"
     ↓
     
Agent Thinking:
  "用户确认了搭配方案，现在需要生成图片。
   我将使用 outfit_instruct_en 作为图像生成的 prompt。"
     ↓
     
Tool Call: generate_model_image
  args: {
    product_image: "image_1",
    outfit_instruct: "[outfit_instruct_en 内容]",  // 使用英文版本
    model_style: "auto",
    scene_type: "studio"
  }
```

#### 3.2.3 Stylist Tool 输出规格

| 字段 | 类型 | 说明 |
|------|------|------|
| `outfit_instruct_zh` | string | 中文搭配描述，约 500 字，给用户展示 |
| `outfit_instruct_en` | string | 英文搭配描述，约 300 词，用于图像生成 |
| `outfit_instruct` | string | 兼容字段，默认等于 `outfit_instruct_en` |
| `shouldContinue` | boolean | `true` - 让 Agent 决定后续动作 |

### 3.3 Tool 管理架构

```
后端项目结构:
├── src/
│   ├── agent/
│   │   ├── tools/
│   │   │   ├── index.ts              # Tool 注册表，导出所有 tools
│   │   │   ├── definitions.ts        # Tool 定义（给 LLM 看的 schema）
│   │   │   ├── executor.ts           # Tool 执行器
│   │   │   │
│   │   │   ├── stylist.ts            # 搭配师 Tool
│   │   │   ├── change-outfit.ts      # 换搭配 Tool
│   │   │   ├── change-model.ts       # 换模特 Tool
│   │   │   ├── replicate-reference.ts # 复刻参考图 Tool
│   │   │   ├── generate-model.ts     # 生成模特图 Tool
│   │   │   ├── edit-image.ts         # 编辑图片 Tool
│   │   │   ├── analyze-image.ts      # 分析图片 Tool
│   │   │   ├── search-assets.ts      # 搜索资产 Tool
│   │   │   ├── get-presets.ts        # 获取预设 Tool
│   │   │   ├── save-asset.ts         # 保存资产 Tool
│   │   │   └── request-gui.ts        # 请求GUI输入 Tool
│   │   │
│   │   ├── orchestrator.ts           # Agent 主循环
│   │   ├── context-builder.ts        # 上下文构建器
│   │   └── prompts/
│   │       ├── system.ts             # Agent 系统 prompt
│   │       └── stylist.ts            # 搭配师专用 prompt
│   │
│   └── lib/
│       └── genai.ts                  # Gemini API 封装
```

### 3.4 Tool Definitions

```typescript
// agent/tools/definitions.ts

export const AGENT_TOOLS = [
  // ============================================
  // 搭配师 Tool - 分析图像并生成搭配建议（双语输出）
  // ============================================
  {
    name: "stylist",
    description: `时尚搭配师工具。分析核心单品、模特和场景，生成专业的服装搭配建议。
返回中英文双语版本：
- outfit_instruct_zh: 中文搭配描述（给用户展示，约500字）
- outfit_instruct_en: 英文搭配描述（用于图像生成 prompt，约300词）
这个搭配建议可以直接用于后续的图像生成，或返回给用户确认后再使用。`,
    parameters: {
      type: "object",
      properties: {
        product_image: {
          type: "string",
          description: "核心单品图片引用（必须），如 'image_1'"
        },
        model_image: {
          type: "string",
          description: "模特图片引用（可选），用于分析模特特征以匹配搭配风格"
        },
        scene_image: {
          type: "string",
          description: "场景/背景图片引用（可选），用于让搭配与环境协调"
        },
        style_preference: {
          type: "string",
          description: "用户偏好的风格方向（可选），如 '简约高级'、'街头潮流'、'法式优雅'"
        }
      },
      required: ["product_image"]
    }
  },

  // ============================================
  // 图像分析 Tool
  // ============================================
  {
    name: "analyze_image",
    description: "分析图片内容，识别服装、模特、场景等元素。用于理解用户上传的图片。",
    parameters: {
      type: "object",
      properties: {
        image_ref: {
          type: "string",
          description: "图片引用，如 'image_1', 'image_2'"
        },
        analysis_type: {
          type: "string",
          enum: ["clothing", "model", "scene", "full"],
          description: "分析类型：clothing=服装细节, model=模特特征, scene=场景背景, full=完整分析"
        }
      },
      required: ["image_ref"]
    }
  },
  
  {
    name: "change_outfit",
    description: "保持原图的模特和场景不变，替换服装搭配。需要原图和新服装图片。",
    parameters: {
      type: "object",
      properties: {
        original_image: {
          type: "string",
          description: "原图引用，如 'image_1'"
        },
        outfit_images: {
          type: "array",
          items: { type: "string" },
          description: "新服装图片引用列表，如 ['image_2', 'image_3']"
        },
        style_notes: {
          type: "string",
          description: "风格说明，如 '休闲风格'、'保持颜色协调'"
        }
      },
      required: ["original_image", "outfit_images"]
    }
  },
  
  {
    name: "change_model",
    description: "保持原图的服装和场景不变，替换模特。可以使用参考模特图或指定模特风格。",
    parameters: {
      type: "object",
      properties: {
        original_image: {
          type: "string",
          description: "原图引用"
        },
        model_reference: {
          type: "string",
          description: "模特参考图引用（可选）"
        },
        model_style: {
          type: "string",
          enum: ["korean", "japanese", "western", "chinese", "auto"],
          description: "模特风格（当没有参考图时使用）"
        },
        model_gender: {
          type: "string",
          enum: ["female", "male"],
          description: "模特性别"
        }
      },
      required: ["original_image"]
    }
  },
  
  {
    name: "replicate_reference",
    description: "参考目标图的构图、氛围、姿势等元素，用指定商品生成类似风格的图片。",
    parameters: {
      type: "object",
      properties: {
        product_image: {
          type: "string",
          description: "商品图引用"
        },
        reference_image: {
          type: "string",
          description: "参考图引用"
        },
        elements_to_replicate: {
          type: "array",
          items: {
            type: "string",
            enum: ["composition", "vibe", "pose", "lighting", "color_tone"]
          },
          description: "要复刻的元素"
        }
      },
      required: ["product_image", "reference_image"]
    }
  },
  
  {
    name: "generate_model_image",
    description: "为商品生成模特展示图。可以指定模特、场景、风格等参数。",
    parameters: {
      type: "object",
      properties: {
        product_image: {
          type: "string",
          description: "商品图引用"
        },
        model_reference: {
          type: "string",
          description: "模特参考图引用（可选）"
        },
        model_style: {
          type: "string",
          enum: ["korean", "japanese", "western", "chinese", "auto"],
          description: "模特风格"
        },
        scene_type: {
          type: "string",
          enum: ["studio", "outdoor", "indoor", "street", "lifestyle"],
          description: "场景类型"
        },
        scene_reference: {
          type: "string",
          description: "场景参考图引用（可选）"
        },
        vibe: {
          type: "string",
          description: "整体氛围描述，如 '清新自然'、'高级感'、'街头潮流'"
        },
        count: {
          type: "number",
          description: "生成数量，默认2张"
        }
      },
      required: ["product_image"]
    }
  },
  
  {
    name: "edit_image",
    description: "对图片进行局部编辑，如修改细节、调整颜色、添加/移除元素等。",
    parameters: {
      type: "object",
      properties: {
        image_ref: {
          type: "string",
          description: "要编辑的图片引用"
        },
        edit_instruction: {
          type: "string",
          description: "编辑指令，如 '把袖子改成短袖'、'背景换成白色'"
        },
        edit_region: {
          type: "string",
          enum: ["full", "clothing", "background", "model", "specific"],
          description: "编辑区域"
        }
      },
      required: ["image_ref", "edit_instruction"]
    }
  },
  
  {
    name: "search_assets",
    description: "搜索用户的资产库，包括模特、商品、场景等素材。",
    parameters: {
      type: "object",
      properties: {
        asset_type: {
          type: "string",
          enum: ["model", "product", "scene", "all"],
          description: "资产类型"
        },
        query: {
          type: "string",
          description: "搜索关键词"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "标签筛选"
        },
        limit: {
          type: "number",
          description: "返回数量限制"
        }
      },
      required: ["asset_type"]
    }
  },
  
  {
    name: "get_presets",
    description: "获取系统预设素材，如预设模特、预设场景等。",
    parameters: {
      type: "object",
      properties: {
        preset_type: {
          type: "string",
          enum: ["model", "scene", "vibe"],
          description: "预设类型"
        },
        style: {
          type: "string",
          description: "风格筛选，如 'korean', 'japanese'"
        },
        category: {
          type: "string",
          description: "分类筛选，如 'indoor', 'outdoor'"
        }
      },
      required: ["preset_type"]
    }
  },
  
  {
    name: "save_to_assets",
    description: "将生成的图片保存到用户的资产库。",
    parameters: {
      type: "object",
      properties: {
        image_ref: {
          type: "string",
          description: "要保存的图片引用"
        },
        asset_type: {
          type: "string",
          enum: ["model", "product", "scene", "generation"],
          description: "保存为什么类型的资产"
        },
        name: {
          type: "string",
          description: "资产名称"
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "标签"
        }
      },
      required: ["image_ref", "asset_type"]
    }
  },
  
  {
    name: "request_gui_input",
    description: "当需要用户提供更多结构化输入时，请求显示 GUI 输入界面。",
    parameters: {
      type: "object",
      properties: {
        gui_type: {
          type: "string",
          enum: ["change_outfit", "change_model", "replicate_reference", "select_model", "select_scene"],
          description: "GUI 类型"
        },
        prefill_data: {
          type: "object",
          description: "预填充数据"
        },
        message: {
          type: "string",
          description: "显示给用户的提示信息"
        }
      },
      required: ["gui_type"]
    }
  }
];
```

### 3.4 AI 服务架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AI Service Layer                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        AI Router / Orchestrator                      │   │
│  │                                                                      │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │   │ Chat Agent  │  │  Generator  │  │   Editor    │                 │   │
│  │   │  Pipeline   │  │  Pipeline   │  │  Pipeline   │                 │   │
│  │   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │   │
│  └──────────┼────────────────┼────────────────┼────────────────────────┘   │
│             │                │                │                             │
│  ┌──────────┴────────────────┴────────────────┴────────────────────────┐   │
│  │                        Prompt Engineering Layer                      │   │
│  │                                                                      │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │   │ Chat Prompt │  │Model Prompt │  │ Edit Prompt │                 │   │
│  │   │  Templates  │  │  Templates  │  │  Templates  │                 │   │
│  │   └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        Model Adapter Layer                           │   │
│  │                                                                      │   │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │   │
│  │   │   Vertex    │  │  Stability  │  │   Runway    │                 │   │
│  │   │  AI Adapter │  │  AI Adapter │  │   Adapter   │                 │   │
│  │   │  (Primary)  │  │  (Backup)   │  │  (Future)   │                 │   │
│  │   └─────────────┘  └─────────────┘  └─────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. iOS 客户端架构

### 4.1 项目结构

```
Onstage/
├── App/
│   ├── OnstageApp.swift              # App 入口
│   ├── AppDelegate.swift             # UIKit 生命周期
│   └── SceneDelegate.swift
│
├── Core/
│   ├── DI/                           # 依赖注入
│   │   ├── Container.swift
│   │   └── Resolver.swift
│   ├── Extensions/                   # 扩展
│   │   ├── View+Extensions.swift
│   │   ├── Image+Extensions.swift
│   │   └── Color+Extensions.swift
│   ├── Utilities/                    # 工具类
│   │   ├── ImageCompressor.swift
│   │   ├── HapticManager.swift
│   │   └── Logger.swift
│   └── Constants/                    # 常量
│       ├── APIConstants.swift
│       └── DesignConstants.swift
│
├── Domain/
│   ├── Entities/                     # 领域实体
│   │   ├── Message.swift
│   │   ├── Generation.swift
│   │   ├── Asset.swift
│   │   └── User.swift
│   ├── UseCases/                     # 用例
│   │   ├── Chat/
│   │   │   ├── SendMessageUseCase.swift
│   │   │   └── GetChatHistoryUseCase.swift
│   │   ├── Generate/
│   │   │   ├── GenerateImageUseCase.swift
│   │   │   └── ShootRoomGenerateUseCase.swift
│   │   ├── Asset/
│   │   │   ├── UploadAssetUseCase.swift
│   │   │   └── GetAssetsUseCase.swift
│   │   └── Auth/
│   │       ├── LoginUseCase.swift
│   │       └── RegisterUseCase.swift
│   └── Repositories/                 # Repository 接口
│       ├── ChatRepositoryProtocol.swift
│       ├── GenerationRepositoryProtocol.swift
│       ├── AssetRepositoryProtocol.swift
│       └── AuthRepositoryProtocol.swift
│
├── Data/
│   ├── Network/                      # 网络层
│   │   ├── APIClient.swift
│   │   ├── APIEndpoints.swift
│   │   ├── APIError.swift
│   │   └── Requests/
│   │       ├── ChatRequest.swift
│   │       ├── GenerateRequest.swift
│   │       └── AssetRequest.swift
│   ├── Repositories/                 # Repository 实现
│   │   ├── ChatRepository.swift
│   │   ├── GenerationRepository.swift
│   │   ├── AssetRepository.swift
│   │   └── AuthRepository.swift
│   ├── Local/                        # 本地存储
│   │   ├── CoreDataManager.swift
│   │   ├── KeychainManager.swift
│   │   └── UserDefaultsManager.swift
│   └── DTOs/                         # 数据传输对象
│       ├── MessageDTO.swift
│       ├── GenerationDTO.swift
│       └── AssetDTO.swift
│
├── Presentation/
│   ├── Chat/                         # Chat Tab
│   │   ├── Views/
│   │   │   ├── ChatView.swift
│   │   │   ├── MessageBubbleView.swift
│   │   │   ├── InputBarView.swift
│   │   │   ├── ActionBarView.swift
│   │   │   └── ActionSheets/
│   │   │       ├── ChangeOutfitSheet.swift
│   │   │       ├── ChangeModelSheet.swift
│   │   │       └── ReplicateReferenceSheet.swift
│   │   └── ViewModels/
│   │       └── ChatViewModel.swift
│   │
│   ├── ShootRoom/                    # Shoot Room Tab
│   │   ├── Views/
│   │   │   ├── ShootRoomView.swift
│   │   │   ├── SceneCanvasView.swift
│   │   │   ├── LightControlView.swift
│   │   │   ├── CameraControlView.swift
│   │   │   ├── CameraSettingsSheet.swift
│   │   │   └── AssetPickerSheet.swift
│   │   └── ViewModels/
│   │       └── ShootRoomViewModel.swift
│   │
│   ├── Assets/                       # 资产管理
│   │   ├── Views/
│   │   │   ├── AssetsView.swift
│   │   │   ├── AssetGridView.swift
│   │   │   └── AssetDetailView.swift
│   │   └── ViewModels/
│   │       └── AssetsViewModel.swift
│   │
│   ├── Profile/                      # 用户中心
│   │   ├── Views/
│   │   │   ├── ProfileView.swift
│   │   │   ├── SettingsView.swift
│   │   │   └── QuotaView.swift
│   │   └── ViewModels/
│   │       └── ProfileViewModel.swift
│   │
│   ├── Auth/                         # 认证
│   │   ├── Views/
│   │   │   ├── LoginView.swift
│   │   │   └── RegisterView.swift
│   │   └── ViewModels/
│   │       └── AuthViewModel.swift
│   │
│   └── Shared/                       # 共享组件
│       ├── Components/
│       │   ├── PrimaryButton.swift
│       │   ├── SecondaryButton.swift
│       │   ├── ImagePicker.swift
│       │   ├── LoadingView.swift
│       │   ├── EmptyStateView.swift
│       │   └── ToastView.swift
│       └── Modifiers/
│           ├── SheetModifier.swift
│           └── LoadingModifier.swift
│
├── Resources/
│   ├── Assets.xcassets/              # 图片资源
│   ├── Colors.xcassets/              # 颜色资源
│   ├── Localizable.strings           # 国际化
│   └── Fonts/                        # 字体文件
│
└── Supporting Files/
    ├── Info.plist
    └── Onstage.entitlements
```

### 4.2 核心模块设计

#### 4.2.1 Chat 模块

```swift
// Domain/Entities/Message.swift
struct Message: Identifiable, Codable {
    let id: UUID
    let role: MessageRole
    let content: MessageContent
    let timestamp: Date
    let status: MessageStatus
    
    enum MessageRole: String, Codable {
        case user
        case assistant
        case system
    }
    
    enum MessageStatus: String, Codable {
        case sending
        case sent
        case failed
        case generating
    }
}

struct MessageContent: Codable {
    let text: String?
    let images: [MessageImage]?
    let generatedImages: [GeneratedImage]?
    let action: ActionType?
}

struct MessageImage: Identifiable, Codable {
    let id: UUID
    let url: String
    let label: String  // "图1", "图2"
    let thumbnailUrl: String?
}

struct GeneratedImage: Identifiable, Codable {
    let id: UUID
    let url: String
    let thumbnailUrl: String
    let generationId: String
}

enum ActionType: String, Codable {
    case changeOutfit
    case changeModel
    case replicateReference
    case regenerate
    case refine
    case changeBackground
    case download
    case favorite
}
```

```swift
// Presentation/Chat/ViewModels/ChatViewModel.swift
@MainActor
class ChatViewModel: ObservableObject {
    // MARK: - Published Properties
    @Published var messages: [Message] = []
    @Published var inputText: String = ""
    @Published var selectedImages: [UIImage] = []
    @Published var isLoading: Bool = false
    @Published var showActionSheet: ActionType? = nil
    @Published var error: AppError? = nil
    
    // MARK: - Dependencies
    private let sendMessageUseCase: SendMessageUseCase
    private let getChatHistoryUseCase: GetChatHistoryUseCase
    
    // MARK: - Public Methods
    func sendMessage() async {
        guard !inputText.isEmpty || !selectedImages.isEmpty else { return }
        
        isLoading = true
        defer { isLoading = false }
        
        do {
            let message = try await sendMessageUseCase.execute(
                text: inputText,
                images: selectedImages
            )
            messages.append(message)
            clearInput()
        } catch {
            self.error = AppError(error)
        }
    }
    
    func executeAction(_ action: ActionType, params: ActionParams) async {
        isLoading = true
        defer { isLoading = false }
        
        do {
            let message = try await sendMessageUseCase.executeAction(
                action: action,
                params: params
            )
            messages.append(message)
        } catch {
            self.error = AppError(error)
        }
    }
    
    func addImage(_ image: UIImage) {
        guard selectedImages.count < 4 else { return }
        selectedImages.append(image)
    }
    
    func removeImage(at index: Int) {
        selectedImages.remove(at: index)
    }
    
    // MARK: - Private Methods
    private func clearInput() {
        inputText = ""
        selectedImages = []
    }
}
```

#### 4.2.2 Shoot Room 模块

```swift
// Domain/Entities/ShootRoomConfig.swift
struct ShootRoomConfig: Codable {
    var model: ModelAsset?
    var product: ProductAsset?
    var scene: SceneAsset?
    var sceneElements: [SceneElement]
    var lighting: LightingConfig
    var camera: CameraConfig
}

struct LightingConfig: Codable {
    var position: CGPoint      // 相对位置 (0-1)
    var direction: Double      // 角度 (0-360)
    var intensity: Double      // 强度 (0-1)
}

struct CameraConfig: Codable {
    var position: CGPoint      // 相对位置 (0-1)
    var angle: CameraAngle     // 视角
    var focalLength: Int       // 焦距 (16-55mm)
    
    enum CameraAngle: String, Codable {
        case high = "high"     // 俯拍
        case eye = "eye"       // 平拍
        case low = "low"       // 仰拍
    }
}

struct SceneElement: Identifiable, Codable {
    let id: UUID
    let type: ElementType
    var position: CGPoint
    var scale: Double
    var rotation: Double
    
    enum ElementType: String, Codable {
        case chair, sofa, table, bed, cabinet
        case bag, hat, glasses, shoes, drink
        case plant, flower, potted, driedFlower
    }
}
```

```swift
// Presentation/ShootRoom/ViewModels/ShootRoomViewModel.swift
@MainActor
class ShootRoomViewModel: ObservableObject {
    // MARK: - Published Properties
    @Published var config: ShootRoomConfig = .default
    @Published var previewImage: UIImage? = nil
    @Published var isGenerating: Bool = false
    @Published var showAssetPicker: AssetType? = nil
    @Published var showCameraSettings: Bool = false
    @Published var generatedImages: [GeneratedImage] = []
    @Published var error: AppError? = nil
    
    // MARK: - Dependencies
    private let generateUseCase: ShootRoomGenerateUseCase
    private let assetUseCase: GetAssetsUseCase
    
    // MARK: - Computed Properties
    var canShoot: Bool {
        config.product != nil
    }
    
    // MARK: - Asset Selection
    func selectModel(_ model: ModelAsset) {
        config.model = model
        updatePreview()
    }
    
    func selectProduct(_ product: ProductAsset) {
        config.product = product
        updatePreview()
    }
    
    func selectScene(_ scene: SceneAsset) {
        config.scene = scene
        updatePreview()
    }
    
    // MARK: - Lighting Control
    func updateLightPosition(_ position: CGPoint) {
        config.lighting.position = position
        updatePreview()
    }
    
    func updateLightDirection(_ direction: Double) {
        config.lighting.direction = direction
        updatePreview()
    }
    
    func updateLightIntensity(_ intensity: Double) {
        config.lighting.intensity = intensity
        updatePreview()
    }
    
    // MARK: - Camera Control
    func updateCameraPosition(_ position: CGPoint) {
        config.camera.position = position
        updatePreview()
    }
    
    func updateCameraAngle(_ angle: CameraConfig.CameraAngle) {
        config.camera.angle = angle
        updatePreview()
    }
    
    func updateFocalLength(_ focalLength: Int) {
        config.camera.focalLength = focalLength
        updatePreview()
    }
    
    // MARK: - Scene Elements
    func addSceneElement(_ type: SceneElement.ElementType) {
        let element = SceneElement(
            id: UUID(),
            type: type,
            position: CGPoint(x: 0.5, y: 0.5),
            scale: 1.0,
            rotation: 0
        )
        config.sceneElements.append(element)
    }
    
    func updateSceneElement(_ id: UUID, position: CGPoint) {
        if let index = config.sceneElements.firstIndex(where: { $0.id == id }) {
            config.sceneElements[index].position = position
        }
    }
    
    func removeSceneElement(_ id: UUID) {
        config.sceneElements.removeAll { $0.id == id }
    }
    
    // MARK: - Generation
    func shoot() async {
        guard canShoot else { return }
        
        isGenerating = true
        defer { isGenerating = false }
        
        do {
            let images = try await generateUseCase.execute(config: config)
            generatedImages = images
        } catch {
            self.error = AppError(error)
        }
    }
    
    // MARK: - Preview
    private func updatePreview() {
        // 生成低分辨率预览图
        // 使用本地渲染或简化的 AI 预览
    }
}
```

### 4.3 网络层设计

```swift
// Data/Network/APIClient.swift
actor APIClient {
    private let session: URLSession
    private let baseURL: URL
    private let authManager: AuthManager
    
    init(baseURL: URL, authManager: AuthManager) {
        self.baseURL = baseURL
        self.authManager = authManager
        
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = 120  // AI 生成可能需要较长时间
        self.session = URLSession(configuration: config)
    }
    
    func request<T: Decodable>(_ endpoint: APIEndpoint) async throws -> T {
        var request = try endpoint.urlRequest(baseURL: baseURL)
        
        // 添加认证头
        if let token = await authManager.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
        switch httpResponse.statusCode {
        case 200...299:
            return try JSONDecoder().decode(T.self, from: data)
        case 401:
            // Token 过期，尝试刷新
            try await authManager.refreshToken()
            return try await self.request(endpoint)
        case 429:
            throw APIError.rateLimited
        default:
            let errorResponse = try? JSONDecoder().decode(APIErrorResponse.self, from: data)
            throw APIError.serverError(
                statusCode: httpResponse.statusCode,
                message: errorResponse?.message
            )
        }
    }
    
    func upload(
        _ endpoint: APIEndpoint,
        images: [UIImage],
        progressHandler: ((Double) -> Void)? = nil
    ) async throws -> GenerationResponse {
        var request = try endpoint.urlRequest(baseURL: baseURL)
        
        // 构建 multipart form data
        let boundary = UUID().uuidString
        request.setValue(
            "multipart/form-data; boundary=\(boundary)",
            forHTTPHeaderField: "Content-Type"
        )
        
        var body = Data()
        
        for (index, image) in images.enumerated() {
            guard let imageData = image.jpegData(compressionQuality: 0.8) else {
                throw APIError.invalidImageData
            }
            
            body.append("--\(boundary)\r\n".data(using: .utf8)!)
            body.append("Content-Disposition: form-data; name=\"images\"; filename=\"image\(index).jpg\"\r\n".data(using: .utf8)!)
            body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
            body.append(imageData)
            body.append("\r\n".data(using: .utf8)!)
        }
        
        body.append("--\(boundary)--\r\n".data(using: .utf8)!)
        request.httpBody = body
        
        // 添加认证头
        if let token = await authManager.accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let (data, response) = try await session.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            throw APIError.uploadFailed
        }
        
        return try JSONDecoder().decode(GenerationResponse.self, from: data)
    }
}
```

```swift
// Data/Network/APIEndpoints.swift
enum APIEndpoint {
    // Chat
    case sendMessage(ChatRequest)
    case getChatHistory(conversationId: String)
    
    // Generation
    case generateImage(GenerateRequest)
    case shootRoom(ShootRoomRequest)
    case getGenerationStatus(taskId: String)
    
    // Assets
    case getAssets(type: AssetType, page: Int, limit: Int)
    case uploadAsset(type: AssetType)
    case deleteAsset(id: String)
    
    // Auth
    case login(LoginRequest)
    case register(RegisterRequest)
    case refreshToken(refreshToken: String)
    case logout
    
    // User
    case getProfile
    case updateProfile(UpdateProfileRequest)
    case getQuota
    
    var path: String {
        switch self {
        case .sendMessage:
            return "/api/v1/chat/message"
        case .getChatHistory(let id):
            return "/api/v1/chat/history/\(id)"
        case .generateImage:
            return "/api/v1/generate/image"
        case .shootRoom:
            return "/api/v1/generate/shoot-room"
        case .getGenerationStatus(let taskId):
            return "/api/v1/generate/status/\(taskId)"
        case .getAssets:
            return "/api/v1/assets"
        case .uploadAsset:
            return "/api/v1/assets/upload"
        case .deleteAsset(let id):
            return "/api/v1/assets/\(id)"
        case .login:
            return "/api/v1/auth/login"
        case .register:
            return "/api/v1/auth/register"
        case .refreshToken:
            return "/api/v1/auth/refresh"
        case .logout:
            return "/api/v1/auth/logout"
        case .getProfile:
            return "/api/v1/user/profile"
        case .updateProfile:
            return "/api/v1/user/profile"
        case .getQuota:
            return "/api/v1/user/quota"
        }
    }
    
    var method: HTTPMethod {
        switch self {
        case .sendMessage, .generateImage, .shootRoom, .uploadAsset,
             .login, .register, .refreshToken, .logout:
            return .post
        case .getChatHistory, .getGenerationStatus, .getAssets,
             .getProfile, .getQuota:
            return .get
        case .updateProfile:
            return .put
        case .deleteAsset:
            return .delete
        }
    }
    
    func urlRequest(baseURL: URL) throws -> URLRequest {
        var url = baseURL.appendingPathComponent(path)
        
        // 添加 query parameters
        if case .getAssets(let type, let page, let limit) = self {
            var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
            components.queryItems = [
                URLQueryItem(name: "type", value: type.rawValue),
                URLQueryItem(name: "page", value: String(page)),
                URLQueryItem(name: "limit", value: String(limit))
            ]
            url = components.url!
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        // 添加 body
        switch self {
        case .sendMessage(let body):
            request.httpBody = try JSONEncoder().encode(body)
        case .generateImage(let body):
            request.httpBody = try JSONEncoder().encode(body)
        case .shootRoom(let body):
            request.httpBody = try JSONEncoder().encode(body)
        case .login(let body):
            request.httpBody = try JSONEncoder().encode(body)
        case .register(let body):
            request.httpBody = try JSONEncoder().encode(body)
        case .refreshToken(let token):
            request.httpBody = try JSONEncoder().encode(["refreshToken": token])
        case .updateProfile(let body):
            request.httpBody = try JSONEncoder().encode(body)
        default:
            break
        }
        
        return request
    }
}
```

---

## 5. Chat Agent 后端实现

### 5.1 Agent System Prompt

```typescript
// prompts/agent-system.ts

export const AGENT_SYSTEM_PROMPT = `你是 Onstage 的 AI 助手，专门帮助服饰品牌的运营/设计/美工团队生成高质量的营销内容图像。

## 你的身份
- 你是一个专业的时尚内容创作助手
- 你擅长理解服装、模特、场景的视觉元素
- 你能够根据用户需求，调用合适的工具来完成图像生成和编辑任务

## 你的能力
1. **图像分析**: 理解用户上传的图片内容（服装细节、模特特征、场景环境）
2. **内容生成**: 生成模特展示图、商品图、营销素材
3. **图像编辑**: 换搭配、换模特、复刻参考图、局部编辑
4. **资产管理**: 搜索和使用用户的素材库、系统预设素材

## 交互规则

### 图像引用
- 用户上传的图片会自动标记为 "image_1", "image_2" 等
- 在调用工具时，使用这些标记来引用图片
- 生成的图片会标记为 "generated_1", "generated_2" 等

### 工具调用原则
1. **先理解，后行动**: 如果用户意图不明确，先使用 analyze_image 理解图片内容，或直接询问用户
2. **选择合适的工具**: 根据用户需求选择最匹配的工具
3. **参数完整性**: 确保工具调用的参数完整且正确
4. **结果解释**: 工具执行后，向用户解释结果

### 需要 GUI 输入的场景
当用户的需求需要上传多张特定类型的图片时，调用 request_gui_input 工具：
- 换搭配：需要原图 + 新服装图
- 换模特：需要原图 + 模特参考图（可选）
- 复刻参考：需要商品图 + 参考图

### 回复风格
- 简洁专业，不啰嗦
- 适当使用 emoji 增加亲和力
- 生成图片后，主动询问是否满意或需要调整
- 提供有价值的优化建议

## 约束
- 只能使用提供的工具，不要编造不存在的能力
- 不要生成不适当的内容
- 保护用户隐私，不要在回复中暴露敏感信息
- 如果无法完成任务，诚实告知用户

## 示例对话

用户: "帮我把图1的衣服换成图2"
思考: 用户想要换搭配，图1是原图，图2是新服装。我需要调用 change_outfit 工具。
工具调用: change_outfit(original_image="image_1", outfit_images=["image_2"])

用户: "给这件衣服配个韩系模特"
思考: 用户想要生成模特展示图，指定韩系风格。我需要调用 generate_model_image 工具。
工具调用: generate_model_image(product_image="image_1", model_style="korean")

用户: "这张图的氛围很好，用我的商品也拍一张类似的"
思考: 用户想要复刻参考图的风格。我需要确认哪张是商品图，哪张是参考图。
回复: "好的！请确认一下：图1 是你的商品，图2 是你想复刻的参考图，对吗？"
`;
```

### 5.2 Agent Orchestrator 实现

```typescript
// services/agent/orchestrator.ts

import { getGenAIClient, extractText } from '../../lib/genai';
import { AGENT_SYSTEM_PROMPT } from '../../prompts/agent-system';
import { AGENT_TOOLS } from '../../tools/definitions';
import { executeToolCall } from './tool-executor';
import { buildContext, formatToolResult } from './context-builder';

const THINKING_MODEL = 'gemini-2.5-pro-preview-05-06';  // Thinking model (Gemini 2.5 Pro)
const MAX_ITERATIONS = 5;

interface AgentInput {
  userId: string;
  conversationId: string;
  message: {
    text?: string;
    images?: { id: string; data: string; mimeType: string }[];
  };
  conversationHistory: ConversationMessage[];
}

interface AgentOutput {
  response: {
    text: string;
    generatedImages?: GeneratedImage[];
    guiRequest?: GuiRequest;
  };
  toolCalls: ToolCallRecord[];
  thinking?: string;  // Agent 的思考过程（可选返回给前端调试）
}

interface ToolCallRecord {
  tool: string;
  arguments: Record<string, any>;
  result: any;
  timestamp: Date;
}

export async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const client = getGenAIClient();
  const toolCalls: ToolCallRecord[] = [];
  let thinking = '';
  
  // 构建初始上下文
  let context = await buildContext({
    userId: input.userId,
    message: input.message,
    conversationHistory: input.conversationHistory,
  });
  
  // Agent Loop
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    // 调用 Thinking LLM
    const response = await client.models.generateContent({
      model: THINKING_MODEL,
      contents: [
        { role: 'user', parts: [{ text: AGENT_SYSTEM_PROMPT }] },
        ...context.messages,
      ],
      config: {
        tools: [{ functionDeclarations: AGENT_TOOLS }],
      },
    });
    
    const candidate = response.candidates?.[0];
    if (!candidate) {
      throw new Error('No response from agent');
    }
    
    // 提取思考过程（如果模型支持）
    if (candidate.content?.parts) {
      for (const part of candidate.content.parts) {
        if (part.thought) {
          thinking += part.thought + '\n';
        }
      }
    }
    
    // 检查是否有 tool call
    const functionCall = candidate.content?.parts?.find(
      (part: any) => part.functionCall
    )?.functionCall;
    
    if (functionCall) {
      // 执行 tool call
      const toolResult = await executeToolCall({
        userId: input.userId,
        conversationId: input.conversationId,
        toolName: functionCall.name,
        arguments: functionCall.args,
        imageContext: context.imageContext,
      });
      
      // 记录 tool call
      toolCalls.push({
        tool: functionCall.name,
        arguments: functionCall.args,
        result: toolResult,
        timestamp: new Date(),
      });
      
      // 检查是否是 GUI 请求
      if (functionCall.name === 'request_gui_input') {
        return {
          response: {
            text: toolResult.message || '请在下方完成操作',
            guiRequest: {
              type: functionCall.args.gui_type,
              prefillData: functionCall.args.prefill_data,
            },
          },
          toolCalls,
          thinking,
        };
      }
      
      // 将 tool 结果添加到上下文
      context = appendToolResult(context, functionCall.name, toolResult);
      
      // 如果 tool 返回了生成的图片，可能需要继续处理
      if (toolResult.images && toolResult.shouldContinue === false) {
        // Tool 已经完成，直接返回结果
        return {
          response: {
            text: toolResult.message || '图片已生成完成 ✨',
            generatedImages: toolResult.images,
          },
          toolCalls,
          thinking,
        };
      }
      
      // 继续循环，让 LLM 决定下一步
      continue;
    }
    
    // 没有 tool call，提取最终回复
    const textResponse = extractText(response);
    
    // 检查是否有生成的图片需要返回
    const generatedImages = toolCalls
      .filter(tc => tc.result?.images)
      .flatMap(tc => tc.result.images);
    
    return {
      response: {
        text: textResponse || '我理解了你的需求，但暂时无法处理。请换一种方式描述？',
        generatedImages: generatedImages.length > 0 ? generatedImages : undefined,
      },
      toolCalls,
      thinking,
    };
  }
  
  // 达到最大迭代次数
  throw new Error('Agent reached maximum iterations without completing');
}

function appendToolResult(
  context: AgentContext,
  toolName: string,
  result: any
): AgentContext {
  const formattedResult = formatToolResult(toolName, result);
  
  return {
    ...context,
    messages: [
      ...context.messages,
      {
        role: 'function',
        parts: [
          {
            functionResponse: {
              name: toolName,
              response: formattedResult,
            },
          },
        ],
      },
    ],
    imageContext: {
      ...context.imageContext,
      ...(result.images ? {
        [`generated_${Object.keys(context.imageContext).length + 1}`]: result.images[0],
      } : {}),
    },
  };
}
```

### 5.3 Tool Executor 实现

```typescript
// services/agent/tool-executor.ts

import * as generateService from '../generate';
import * as assetService from '../assets';
import * as analysisService from '../analysis';
import * as stylistService from './tools/stylist';

interface ToolExecutionContext {
  userId: string;
  conversationId: string;
  toolName: string;
  arguments: Record<string, any>;
  imageContext: Record<string, string>;  // image_id -> image_data
}

export async function executeToolCall(context: ToolExecutionContext): Promise<any> {
  const { toolName, arguments: args, imageContext, userId } = context;
  
  // 解析图片引用
  const resolveImageRef = (ref: string): string => {
    if (!ref) return '';
    if (imageContext[ref]) return imageContext[ref];
    // 如果是 URL，直接返回
    if (ref.startsWith('http') || ref.startsWith('data:')) return ref;
    throw new Error(`Unknown image reference: ${ref}`);
  };
  
  switch (toolName) {
    // ============================================
    // 搭配师 Tool
    // ============================================
    case 'stylist': {
      const productImage = resolveImageRef(args.product_image);
      const modelImage = args.model_image ? resolveImageRef(args.model_image) : undefined;
      const sceneImage = args.scene_image ? resolveImageRef(args.scene_image) : undefined;
      
      const outfitInstruct = await stylistService.generateOutfitInstruct({
        productImage,
        modelImage,
        sceneImage,
        stylePreference: args.style_preference,
      });
      
      return {
        success: true,
        outfit_instruct: outfitInstruct,
        message: '搭配方案已生成！',
        shouldContinue: true,  // 让 Agent 决定是否继续使用这个搭配方案生成图片
      };
    }
    
    case 'analyze_image': {
      const imageData = resolveImageRef(args.image_ref);
      return await analysisService.analyzeImage({
        image: imageData,
        analysisType: args.analysis_type || 'full',
      });
    }
    
    case 'change_outfit': {
      const originalImage = resolveImageRef(args.original_image);
      const outfitImages = args.outfit_images.map(resolveImageRef);
      
      const images = await generateService.changeOutfit({
        originalImage,
        outfitImages,
        additionalNotes: args.style_notes,
      });
      
      return {
        success: true,
        images: images.map((url, i) => ({
          id: `gen_${Date.now()}_${i}`,
          url,
          thumbnailUrl: url,
        })),
        message: '换搭配完成！',
        shouldContinue: false,
      };
    }
    
    case 'change_model': {
      const originalImage = resolveImageRef(args.original_image);
      const modelImage = args.model_reference ? resolveImageRef(args.model_reference) : undefined;
      
      const images = await generateService.changeModel({
        originalImage,
        modelImage,
        modelStyle: args.model_style,
        modelGender: args.model_gender,
      });
      
      return {
        success: true,
        images: images.map((url, i) => ({
          id: `gen_${Date.now()}_${i}`,
          url,
          thumbnailUrl: url,
        })),
        message: '换模特完成！',
        shouldContinue: false,
      };
    }
    
    case 'replicate_reference': {
      const productImage = resolveImageRef(args.product_image);
      const referenceImage = resolveImageRef(args.reference_image);
      
      const images = await generateService.replicateReference({
        productImage,
        referenceImage,
        elements: args.elements_to_replicate || ['composition', 'vibe'],
      });
      
      return {
        success: true,
        images: images.map((url, i) => ({
          id: `gen_${Date.now()}_${i}`,
          url,
          thumbnailUrl: url,
        })),
        message: '参考图复刻完成！',
        shouldContinue: false,
      };
    }
    
    case 'generate_model_image': {
      const productImage = resolveImageRef(args.product_image);
      const modelImage = args.model_reference ? resolveImageRef(args.model_reference) : undefined;
      const sceneImage = args.scene_reference ? resolveImageRef(args.scene_reference) : undefined;
      
      const images = await generateService.generateModelImage({
        productImage,
        modelImage,
        modelStyle: args.model_style,
        sceneType: args.scene_type,
        sceneImage,
        vibe: args.vibe,
        count: args.count || 2,
      });
      
      return {
        success: true,
        images: images.map((url, i) => ({
          id: `gen_${Date.now()}_${i}`,
          url,
          thumbnailUrl: url,
        })),
        message: '模特图生成完成！',
        shouldContinue: false,
      };
    }
    
    case 'edit_image': {
      const image = resolveImageRef(args.image_ref);
      
      const editedImages = await generateService.editImage({
        image,
        instruction: args.edit_instruction,
        region: args.edit_region,
      });
      
      return {
        success: true,
        images: editedImages.map((url, i) => ({
          id: `gen_${Date.now()}_${i}`,
          url,
          thumbnailUrl: url,
        })),
        message: '图片编辑完成！',
        shouldContinue: false,
      };
    }
    
    case 'search_assets': {
      const assets = await assetService.searchAssets({
        userId,
        type: args.asset_type,
        query: args.query,
        tags: args.tags,
        limit: args.limit || 10,
      });
      
      return {
        success: true,
        assets,
        message: `找到 ${assets.length} 个相关素材`,
        shouldContinue: true,  // 让 LLM 决定如何使用这些素材
      };
    }
    
    case 'get_presets': {
      const presets = await assetService.getPresets({
        type: args.preset_type,
        style: args.style,
        category: args.category,
      });
      
      return {
        success: true,
        presets,
        message: `找到 ${presets.length} 个预设素材`,
        shouldContinue: true,
      };
    }
    
    case 'save_to_assets': {
      const image = resolveImageRef(args.image_ref);
      
      const savedAsset = await assetService.saveAsset({
        userId,
        image,
        type: args.asset_type,
        name: args.name,
        tags: args.tags,
      });
      
      return {
        success: true,
        asset: savedAsset,
        message: '已保存到资产库！',
        shouldContinue: true,
      };
    }
    
    case 'request_gui_input': {
      // 这个 tool 不执行实际操作，只是返回 GUI 请求
      return {
        success: true,
        guiType: args.gui_type,
        prefillData: args.prefill_data,
        message: args.message || '请在下方完成输入',
        shouldContinue: false,
      };
    }
    
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}
```

### 5.4 Stylist Tool 实现

```typescript
// agent/tools/stylist.ts
// 搭配师 Tool - 分析图像并生成专业的搭配建议

import { getGenAIClient, extractText, safetySettings } from '../../lib/genai';

const STYLIST_MODEL = 'gemini-2.5-flash-preview-05-20';  // 使用 Gemini 2.5 Flash 进行搭配分析

interface StylistInput {
  productImage: string;      // 核心单品图（必须）
  modelImage?: string;       // 模特图（可选）
  sceneImage?: string;       // 场景图（可选）
  stylePreference?: string;  // 风格偏好（可选）
}

interface StylistOutput {
  outfit_instruct: string;   // 搭配描述
  analysis?: {
    product: string;         // 单品分析
    model?: string;          // 模特分析
    scene?: string;          // 场景分析
  };
}

/**
 * 生成搭配建议
 * 调用 Gemini Flash 模型，分析图像并输出专业的搭配描述
 */
export async function generateOutfitInstruct(input: StylistInput): Promise<string> {
  const client = getGenAIClient();
  
  // 构建 prompt
  const prompt = buildStylistPrompt(input);
  
  // 构建 parts（图片 + 文本）
  const parts: any[] = [];
  
  // 添加核心单品图（必须）
  parts.push({
    inlineData: {
      mimeType: 'image/jpeg',
      data: input.productImage.replace(/^data:image\/\w+;base64,/, ''),
    },
  });
  
  // 添加模特图（可选）
  if (input.modelImage) {
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: input.modelImage.replace(/^data:image\/\w+;base64,/, ''),
      },
    });
  }
  
  // 添加场景图（可选）
  if (input.sceneImage) {
    parts.push({
      inlineData: {
        mimeType: 'image/jpeg',
        data: input.sceneImage.replace(/^data:image\/\w+;base64,/, ''),
      },
    });
  }
  
  // 添加 prompt
  parts.push({ text: prompt });
  
  // 调用模型
  const response = await client.models.generateContent({
    model: STYLIST_MODEL,
    contents: [{ role: 'user', parts }],
    config: {
      safetySettings,
      temperature: 0.7,  // 适度创意
      maxOutputTokens: 1024,
    },
  });
  
  const outfitInstruct = extractText(response);
  
  if (!outfitInstruct) {
    throw new Error('Failed to generate outfit instruction');
  }
  
  return outfitInstruct;
}

/**
 * 构建搭配师 Prompt
 */
function buildStylistPrompt(input: StylistInput): string {
  // 确定图片顺序说明
  let imageDescription = '第一张图是核心单品';
  if (input.modelImage && input.sceneImage) {
    imageDescription = '第一张图是核心单品，第二张图是模特参考，第三张图是拍摄环境';
  } else if (input.modelImage) {
    imageDescription = '第一张图是核心单品，第二张图是模特参考';
  } else if (input.sceneImage) {
    imageDescription = '第一张图是核心单品，第二张图是拍摄环境';
  }
  
  let prompt = `你是由《Vogue》和《GQ》特聘的资深时尚造型总监。你的任务是基于核心单品，为电商拍摄设计一套极具高级感、符合当下流行趋势的服装搭配（Look）。

# Inputs
${imageDescription}
`;

  // 添加风格偏好
  if (input.stylePreference) {
    prompt += `- 用户偏好风格: ${input.stylePreference}\n`;
  }

  prompt += `
# Styling Logic (Think step-by-step)
1. 分析核心单品: 识别核心单品的主色调、材质（如丹宁、丝绸、皮革）和版型。
2. ${input.sceneImage ? '环境融合: 搭配的色系必须与环境图形成和谐（同色系高级感）或撞色（视觉冲击）的关系。' : '色彩搭配: 选择与核心单品和谐或形成高级撞色的色系。'}
3. 材质互补: 如果核心单品是哑光，搭配光泽感配饰；如果是重工面料，搭配简约基础款。
4. 主次分明: 所有搭配单品（上装/下装/鞋/配饰）都是为了烘托核心单品，严禁在色彩或设计上喧宾夺主。
${input.modelImage ? '5. 模特适配: 搭配风格需要与模特的气质相匹配。' : ''}

# Task
基于上述要求，生成一段新的详细的搭配描述，要包含上装、下装、配饰和风格氛围的描述。

# Constraints & Formatting
请不要输出任何推理过程，直接输出一段连贯的、侧重于视觉描述的文本。
描述必须包含以下细节：
1. 具体款式与剪裁 (如: 宽松落肩西装、高腰直筒裤、法式方领衬衫)。
2. 精确的面料与质感 (如: 粗棒针织、光面漆皮、做旧水洗牛仔、垂坠感醋酸)。
3. 准确的色彩术语 (如: 莫兰迪灰、克莱因蓝、大地色系、荧光绿)。
4. 配饰细节 (可选，如: 极简金属耳环、复古墨镜、腋下包)

示例风格（仅供参考）：
'模特身穿[核心单品]，搭配一条米白色高腰羊毛阔腿裤，面料呈现细腻的绒感。外搭一件深驼色大廓形风衣，敞开穿着以露出核心单品。脚踩一双方头切尔西靴，皮革光泽感强。佩戴金色粗链条项链，整体呈现出一种慵懒而高级的风格，色调与背景的暖光完美呼应。'

现在，请开始搭配：`;

  return prompt;
}

// ============================================
// Prompt 模板（独立文件版本）
// ============================================

// agent/prompts/stylist.ts
export const STYLIST_PROMPT_TEMPLATE = `你是由《Vogue》和《GQ》特聘的资深时尚造型总监。你的任务是基于核心单品，为电商拍摄设计一套极具高级感、符合当下流行趋势的服装搭配（Look）。

# Inputs
- 核心单品：{{product_img}}
- 模特特征: {{model_img}}
- 拍摄环境: {{scene_img}}

# Styling Logic (Think step-by-step)
1. 分析核心单品: 识别商品图{{product_img}}的主色调、材质（如丹宁、丝绸、皮革）和版型。
2. 环境融合: 搭配的色系必须与环境图{{scene_img}}形成和谐（同色系高级感）或 撞色（视觉冲击）的关系。
3. 材质互补: 如果核心单品是哑光，搭配光泽感配饰；如果是重工面料，搭配简约基础款。
4. 主次分明: 所有搭配单品（上装/下装/鞋/配饰）都是为了烘托核心单品，严禁在色彩或设计上喧宾夺主。

# Task
基于上述要求，生成一段新的详细的搭配描述 \`{{outfit_instruct}}\`，要包含上装、下装、配饰和风格氛围的描述。

# Constraints & Formatting
请不要输出任何推理过程，直接输出一段连贯的、侧重于视觉描述的文本。
描述必须包含以下细节：
1. 具体款式与剪裁 (如: 宽松落肩西装、高腰直筒裤、法式方领衬衫)。
2. 精确的面料与质感 (如: 粗棒针织、光面漆皮、做旧水洗牛仔、垂坠感醋酸)。
3. 准确的色彩术语 (如: 莫兰迪灰、克莱因蓝、大地色系、荧光绿)。
4. 配饰细节 (可选，如: 极简金属耳环、复古墨镜、腋下包)

示例风格（仅供参考）：
'模特身穿[核心单品]，搭配一条米白色高腰羊毛阔腿裤，面料呈现细腻的绒感。外搭一件深驼色大廓形风衣，敞开穿着以露出核心单品。脚踩一双方头切尔西靴，皮革光泽感强。佩戴金色粗链条项链，整体呈现出一种慵懒而高级的 {{product_style}} 风格，色调与背景的暖光完美呼应。'

现在，请开始搭配`;
```

### 5.5 Context Builder 实现

```typescript
// services/agent/context-builder.ts

interface BuildContextInput {
  userId: string;
  message: {
    text?: string;
    images?: { id: string; data: string; mimeType: string }[];
  };
  conversationHistory: ConversationMessage[];
}

interface AgentContext {
  messages: any[];
  imageContext: Record<string, string>;
}

export async function buildContext(input: BuildContextInput): Promise<AgentContext> {
  const { message, conversationHistory } = input;
  
  const messages: any[] = [];
  const imageContext: Record<string, string> = {};
  
  // 添加对话历史（最近 10 轮）
  const recentHistory = conversationHistory.slice(-10);
  for (const msg of recentHistory) {
    if (msg.role === 'user') {
      const parts: any[] = [];
      
      if (msg.content.text) {
        parts.push({ text: msg.content.text });
      }
      
      if (msg.content.images) {
        for (const img of msg.content.images) {
          parts.push({
            inlineData: {
              mimeType: img.mimeType || 'image/jpeg',
              data: img.data.replace(/^data:image\/\w+;base64,/, ''),
            },
          });
        }
      }
      
      messages.push({ role: 'user', parts });
    } else if (msg.role === 'assistant') {
      messages.push({
        role: 'model',
        parts: [{ text: msg.content.text || '' }],
      });
    }
  }
  
  // 添加当前消息
  const currentParts: any[] = [];
  
  // 处理上传的图片
  if (message.images && message.images.length > 0) {
    for (let i = 0; i < message.images.length; i++) {
      const img = message.images[i];
      const imageId = `image_${i + 1}`;
      
      // 存储到 imageContext
      imageContext[imageId] = img.data;
      
      // 添加图片到消息
      currentParts.push({
        inlineData: {
          mimeType: img.mimeType || 'image/jpeg',
          data: img.data.replace(/^data:image\/\w+;base64,/, ''),
        },
      });
    }
    
    // 添加图片标记说明
    const imageLabels = message.images.map((_, i) => `image_${i + 1}`).join(', ');
    currentParts.push({
      text: `[上传了 ${message.images.length} 张图片，分别标记为: ${imageLabels}]\n\n${message.text || ''}`,
    });
  } else if (message.text) {
    currentParts.push({ text: message.text });
  }
  
  if (currentParts.length > 0) {
    messages.push({ role: 'user', parts: currentParts });
  }
  
  return { messages, imageContext };
}

export function formatToolResult(toolName: string, result: any): any {
  // 格式化 tool 结果，使其更适合 LLM 理解
  if (result.images) {
    return {
      status: 'success',
      message: result.message,
      generated_images: result.images.map((img: any, i: number) => ({
        reference: `generated_${i + 1}`,
        url: img.url,
      })),
    };
  }
  
  if (result.assets) {
    return {
      status: 'success',
      message: result.message,
      assets: result.assets.map((asset: any) => ({
        id: asset.id,
        name: asset.name,
        type: asset.type,
        thumbnail: asset.thumbnailUrl,
        tags: asset.tags,
      })),
    };
  }
  
  if (result.presets) {
    return {
      status: 'success',
      message: result.message,
      presets: result.presets.map((preset: any) => ({
        id: preset.id,
        name: preset.name,
        category: preset.category,
        thumbnail: preset.thumbnailUrl,
      })),
    };
  }
  
  return result;
}
```

### 5.5 Streaming 支持（可选）

```typescript
// services/agent/streaming.ts

import { EventEmitter } from 'events';

interface StreamEvent {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'text' | 'image' | 'done' | 'error';
  data: any;
}

export class AgentStreamEmitter extends EventEmitter {
  emitThinking(thought: string) {
    this.emit('event', { type: 'thinking', data: { thought } });
  }
  
  emitToolCall(toolName: string, args: any) {
    this.emit('event', { type: 'tool_call', data: { tool: toolName, arguments: args } });
  }
  
  emitToolResult(toolName: string, result: any) {
    this.emit('event', { type: 'tool_result', data: { tool: toolName, result } });
  }
  
  emitText(text: string, isPartial: boolean = false) {
    this.emit('event', { type: 'text', data: { text, partial: isPartial } });
  }
  
  emitImage(image: GeneratedImage) {
    this.emit('event', { type: 'image', data: image });
  }
  
  emitDone() {
    this.emit('event', { type: 'done', data: {} });
  }
  
  emitError(error: Error) {
    this.emit('event', { type: 'error', data: { message: error.message } });
  }
}

// 使用 Server-Sent Events 推送到客户端
export function createSSEResponse(emitter: AgentStreamEmitter): Response {
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      emitter.on('event', (event: StreamEvent) => {
        const data = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(data));
        
        if (event.type === 'done' || event.type === 'error') {
          controller.close();
        }
      });
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

---

## 6. 后端 API 设计

### 6.1 API 概览

| 模块 | 端点 | 方法 | 描述 |
|------|------|------|------|
| Chat | `/api/v1/chat/message` | POST | 发送消息 |
| Chat | `/api/v1/chat/history/:id` | GET | 获取对话历史 |
| Generate | `/api/v1/generate/image` | POST | 生成图像 |
| Generate | `/api/v1/generate/shoot-room` | POST | Shoot Room 生成 |
| Generate | `/api/v1/generate/status/:taskId` | GET | 获取生成状态 |
| Assets | `/api/v1/assets` | GET | 获取资产列表 |
| Assets | `/api/v1/assets/upload` | POST | 上传资产 |
| Assets | `/api/v1/assets/:id` | DELETE | 删除资产 |
| Auth | `/api/v1/auth/login` | POST | 登录 |
| Auth | `/api/v1/auth/register` | POST | 注册 |
| Auth | `/api/v1/auth/refresh` | POST | 刷新 Token |
| User | `/api/v1/user/profile` | GET/PUT | 用户资料 |
| User | `/api/v1/user/quota` | GET | 配额信息 |

### 5.2 Chat API

#### 5.2.1 发送消息

```typescript
// POST /api/v1/chat/message
interface ChatMessageRequest {
  conversationId?: string;  // 可选，新对话不传
  content: {
    text?: string;
    images?: string[];  // base64 或 URL
  };
  action?: {
    type: 'changeOutfit' | 'changeModel' | 'replicateReference' | 
          'regenerate' | 'refine' | 'changeBackground';
    params: ActionParams;
  };
}

interface ChatMessageResponse {
  success: boolean;
  data: {
    messageId: string;
    conversationId: string;
    response: {
      text?: string;
      generatedImages?: GeneratedImage[];
      suggestedActions?: ActionType[];
    };
    usage: {
      creditsUsed: number;
      creditsRemaining: number;
    };
  };
}

interface GeneratedImage {
  id: string;
  url: string;
  thumbnailUrl: string;
  generationId: string;
}
```

### 5.3 Generate API

#### 5.3.1 图像生成

```typescript
// POST /api/v1/generate/image
interface GenerateImageRequest {
  type: 'changeOutfit' | 'changeModel' | 'replicateReference' | 'freeform';
  inputs: {
    originalImage?: string;      // base64 或 URL
    productImages?: string[];    // 商品图
    modelImage?: string;         // 模特参考图
    referenceImage?: string;     // 风格参考图
    prompt?: string;             // 自由文本描述
  };
  options?: {
    count?: number;              // 生成数量，默认 2
    aspectRatio?: string;        // 宽高比
    style?: string;              // 风格偏好
  };
}

interface GenerateImageResponse {
  success: boolean;
  data: {
    taskId: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    images?: GeneratedImage[];
    estimatedTime?: number;      // 预计完成时间（秒）
  };
}
```

#### 5.3.2 Shoot Room 生成

```typescript
// POST /api/v1/generate/shoot-room
interface ShootRoomRequest {
  model?: {
    type: 'preset' | 'custom';
    id?: string;                 // 预设模特 ID
    image?: string;              // 自定义模特图
  };
  product: {
    image: string;               // 商品图（必须）
  };
  scene?: {
    type: 'preset' | 'custom';
    id?: string;                 // 预设场景 ID
    image?: string;              // 自定义场景图
  };
  sceneElements?: SceneElement[];
  lighting: {
    position: { x: number; y: number };
    direction: number;
    intensity: number;
  };
  camera: {
    position: { x: number; y: number };
    angle: 'high' | 'eye' | 'low';
    focalLength: number;
  };
  options?: {
    count?: number;
  };
}

interface ShootRoomResponse {
  success: boolean;
  data: {
    taskId: string;
    status: 'queued' | 'processing' | 'completed' | 'failed';
    images?: GeneratedImage[];
    estimatedTime?: number;
  };
}
```

---

## 6. 数据库设计

### 6.1 ER 图

```
┌──────────────────┐       ┌──────────────────┐
│      users       │       │   conversations  │
├──────────────────┤       ├──────────────────┤
│ id (PK)          │──┐    │ id (PK)          │
│ email            │  │    │ user_id (FK)     │◄──┐
│ phone            │  │    │ title            │   │
│ password_hash    │  │    │ created_at       │   │
│ avatar_url       │  │    │ updated_at       │   │
│ display_name     │  │    └──────────────────┘   │
│ subscription     │  │                           │
│ credits          │  │    ┌──────────────────┐   │
│ created_at       │  │    │     messages     │   │
│ updated_at       │  │    ├──────────────────┤   │
└──────────────────┘  │    │ id (PK)          │   │
                      │    │ conversation_id   │───┘
                      │    │ role             │
                      │    │ content          │
                      │    │ images           │
                      │    │ generated_images │
                      │    │ action           │
                      │    │ created_at       │
                      │    └──────────────────┘
                      │
                      │    ┌──────────────────┐
                      │    │   generations    │
                      │    ├──────────────────┤
                      └───►│ id (PK)          │
                           │ user_id (FK)     │
                           │ type             │
                           │ input_params     │
                           │ output_urls      │
                           │ prompt           │
                           │ model_version    │
                           │ status           │
                           │ credits_used     │
                           │ processing_time  │
                           │ created_at       │
                           └──────────────────┘

┌──────────────────┐       ┌──────────────────┐
│      assets      │       │     presets      │
├──────────────────┤       ├──────────────────┤
│ id (PK)          │       │ id (PK)          │
│ user_id (FK)     │       │ type             │
│ type             │       │ name             │
│ name             │       │ image_url        │
│ image_url        │       │ thumbnail_url    │
│ thumbnail_url    │       │ tags             │
│ tags             │       │ category         │
│ metadata         │       │ is_active        │
│ source           │       │ sort_order       │
│ created_at       │       │ created_at       │
└──────────────────┘       └──────────────────┘

┌──────────────────┐
│    favorites     │
├──────────────────┤
│ id (PK)          │
│ user_id (FK)     │
│ generation_id(FK)│
│ image_index      │
│ created_at       │
└──────────────────┘
```

### 6.2 表结构定义

```sql
-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE,
    phone TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    avatar_url TEXT,
    display_name TEXT,
    subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
    credits_remaining INTEGER DEFAULT 50,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 对话表
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 消息表
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content JSONB NOT NULL,
    -- content 结构: { text?: string, images?: [{id, url, label}], generatedImages?: [{id, url}] }
    action JSONB,
    -- action 结构: { type: string, params: object }
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 生成记录表
CREATE TABLE generations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('chat', 'shootRoom', 'changeOutfit', 'changeModel', 'replicateReference')),
    input_params JSONB NOT NULL,
    output_urls TEXT[] NOT NULL,
    prompt TEXT,
    model_version TEXT DEFAULT 'gemini-2.0-flash-preview-image-generation',
    status TEXT DEFAULT 'completed' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
    credits_used INTEGER DEFAULT 1,
    processing_time_ms INTEGER,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 资产表
CREATE TABLE assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('model', 'product', 'scene', 'element')),
    name TEXT,
    image_url TEXT NOT NULL,
    thumbnail_url TEXT,
    tags TEXT[],
    metadata JSONB,
    source TEXT DEFAULT 'upload' CHECK (source IN ('upload', 'generation', 'preset')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 系统预设表
CREATE TABLE presets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT NOT NULL CHECK (type IN ('model', 'scene', 'element')),
    name TEXT NOT NULL,
    image_url TEXT NOT NULL,
    thumbnail_url TEXT,
    tags TEXT[],
    category TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 收藏表
CREATE TABLE favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    generation_id UUID REFERENCES generations(id) ON DELETE CASCADE,
    image_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, generation_id, image_index)
);

-- 索引
CREATE INDEX idx_conversations_user ON conversations(user_id);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_created ON messages(created_at DESC);
CREATE INDEX idx_generations_user ON generations(user_id);
CREATE INDEX idx_generations_created ON generations(created_at DESC);
CREATE INDEX idx_assets_user_type ON assets(user_id, type);
CREATE INDEX idx_presets_type ON presets(type, is_active);
CREATE INDEX idx_favorites_user ON favorites(user_id);
```

---

## 7. AI 服务集成

### 7.1 Vertex AI 配置

```typescript
// lib/genai.ts
import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

// 设置 Vertex AI 模式
if (typeof process !== 'undefined' && !process.env.GOOGLE_GENAI_USE_VERTEXAI) {
    process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
}

let genAIClient: GoogleGenAI | null = null;

export function getGenAIClient(): GoogleGenAI {
    if (!genAIClient) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("GEMINI_API_KEY environment variable is required");
        }
        genAIClient = new GoogleGenAI({ apiKey });
    }
    return genAIClient;
}

// 安全设置 - 适应服装展示需求
export const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// 从响应中提取图片
export function extractImage(response: any): string | null {
    const candidate = response.candidates?.[0];
    if (candidate?.finishReason === "SAFETY") {
        throw new Error("内容被安全过滤阻止");
    }
    
    if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
            if ((part as any).inlineData?.data) {
                return (part as any).inlineData.data;
            }
        }
    }
    return null;
}

// 从响应中提取文本
export function extractText(response: any): string | null {
    const candidate = response.candidates?.[0];
    if (candidate?.content?.parts) {
        const textParts: string[] = [];
        for (const part of candidate.content.parts) {
            if (typeof part.text === 'string') {
                textParts.push(part.text);
            }
        }
        if (textParts.length > 0) {
            return textParts.join('\n');
        }
    }
    return null;
}
```

### 7.2 Prompt 模板

```typescript
// prompts/chat.ts

// Chat Agent 系统提示词
export const CHAT_SYSTEM_PROMPT = `你是 Onstage 的 AI 助手，专门帮助服饰品牌生成营销内容图像。

你的能力包括：
1. 理解用户的图像编辑需求
2. 分析上传的图像内容
3. 生成符合品牌调性的模特展示图
4. 执行换搭配、换模特、复刻参考图等操作

交互规则：
- 用户上传的图像会标记为"图1"、"图2"等，你需要理解这些引用
- 当用户需求不明确时，主动询问澄清
- 生成图像后，提供合适的后续操作建议

输出要求：
- 回复简洁专业
- 提供清晰的操作指引
- 适时给出优化建议`;

// 换搭配 Prompt
export const buildChangeOutfitPrompt = (params: {
    originalDescription?: string;
    outfitDescriptions?: string[];
    additionalNotes?: string;
}) => {
    let prompt = `Keep the model and background exactly the same as the original image.
Replace the outfit with the new clothing items shown in the reference images.

Requirements:
- Maintain the model's pose, expression, and position
- Keep the background and lighting consistent
- The new outfit should fit naturally on the model
- Preserve the overall composition and style`;

    if (params.additionalNotes) {
        prompt += `\n\nAdditional notes: ${params.additionalNotes}`;
    }

    prompt += `\n\nNegatives: distorted anatomy, unnatural clothing fit, inconsistent lighting, background changes.`;

    return prompt;
};

// 换模特 Prompt
export const buildChangeModelPrompt = (params: {
    modelStyle?: string;
    keepOutfit: boolean;
    keepBackground: boolean;
}) => {
    let prompt = `Generate a new model photo that maintains the exact same outfit and background.

The new model should:
- Have a similar body type to ensure the outfit fits naturally
- Match the style and vibe of the original image`;

    if (params.modelStyle) {
        const styleMap: Record<string, string> = {
            korean: 'Korean idol aesthetic with soft features',
            japanese: 'Japanese model aesthetic with natural look',
            western: 'Western editorial model style',
            chinese: 'Chinese contemporary model aesthetic'
        };
        prompt += `\n- Follow ${styleMap[params.modelStyle] || params.modelStyle} style`;
    }

    prompt += `

Requirements:
- The outfit color, design, and details must be exactly the same
- Maintain the same background and lighting
- Natural pose that highlights the clothing

Negatives: outfit changes, background changes, distorted anatomy, unnatural pose.`;

    return prompt;
};

// 复刻参考图 Prompt
export const buildReplicateReferencePrompt = (params: {
    elements: ('composition' | 'vibe' | 'pose' | 'scene')[];
}) => {
    const elementDescriptions: Record<string, string> = {
        composition: 'the overall composition and framing',
        vibe: 'the mood, atmosphere, and color tone',
        pose: 'the model pose and body language',
        scene: 'the background scene and setting'
    };

    const selectedElements = params.elements
        .map(e => elementDescriptions[e])
        .join(', ');

    return `Create a new image that replicates ${selectedElements} from the reference image.

The product shown must be exactly as provided in the product image - maintain all details, colors, and design elements.

Requirements:
- Product accuracy is the top priority
- Reference image is only for style/composition guidance
- Create a natural, authentic look suitable for social media
- Professional lighting and quality

Negatives: product modifications, distorted anatomy, unnatural merge of elements.`;
};

// Shoot Room Prompt
export const buildShootRoomPrompt = (params: {
    hasModel: boolean;
    hasScene: boolean;
    lightingDescription: string;
    cameraDescription: string;
    sceneElements?: string[];
}) => {
    let prompt = `Professional fashion photography shot with the following setup:

Lighting: ${params.lightingDescription}
Camera: ${params.cameraDescription}`;

    if (params.hasModel) {
        prompt += `\n\nThe model should wear the product naturally and pose in a way that highlights the clothing.`;
    } else {
        prompt += `\n\nDesign a suitable model for this product with a natural, authentic look.`;
    }

    if (params.hasScene) {
        prompt += `\n\nUse the provided scene as the background.`;
    }

    if (params.sceneElements && params.sceneElements.length > 0) {
        prompt += `\n\nInclude these scene elements: ${params.sceneElements.join(', ')}`;
    }

    prompt += `

Requirements:
- Product details must be 100% accurate
- Natural, Instagram-ready composition
- Professional but authentic feel
- Suitable for social media marketing

Negatives: distorted anatomy, unnatural pose, product modifications, CGI look.`;

    return prompt;
};
```

### 7.3 图像生成服务

```typescript
// services/generateService.ts
import { getGenAIClient, extractImage, safetySettings } from '../lib/genai';
import * as prompts from '../prompts/chat';

const MODEL_NAME = 'gemini-2.0-flash-preview-image-generation';

interface GenerateOptions {
    count?: number;
}

// 通用图像生成函数
async function generateImages(
    prompt: string,
    inputImages: { data: string; mimeType: string }[],
    options: GenerateOptions = {}
): Promise<string[]> {
    const client = getGenAIClient();
    const count = options.count || 2;
    const results: string[] = [];

    for (let i = 0; i < count; i++) {
        const parts: any[] = [];

        // 添加输入图像
        for (const image of inputImages) {
            parts.push({
                inlineData: {
                    mimeType: image.mimeType,
                    data: image.data.replace(/^data:image\/\w+;base64,/, ''),
                },
            });
        }

        // 添加 prompt
        parts.push({ text: prompt });

        const response = await client.models.generateContent({
            model: MODEL_NAME,
            contents: [{ role: 'user', parts }],
            config: {
                responseModalities: ['IMAGE'],
                safetySettings,
            },
        });

        const generatedImage = extractImage(response);
        if (generatedImage) {
            results.push(`data:image/png;base64,${generatedImage}`);
        }
    }

    return results;
}

// 换搭配
export async function changeOutfit(params: {
    originalImage: string;
    outfitImages: string[];
    additionalNotes?: string;
}): Promise<string[]> {
    const prompt = prompts.buildChangeOutfitPrompt({
        additionalNotes: params.additionalNotes,
    });

    const inputImages = [
        { data: params.originalImage, mimeType: 'image/jpeg' },
        ...params.outfitImages.map(img => ({ data: img, mimeType: 'image/jpeg' })),
    ];

    return generateImages(prompt, inputImages);
}

// 换模特
export async function changeModel(params: {
    originalImage: string;
    modelImage?: string;
    modelStyle?: string;
}): Promise<string[]> {
    const prompt = prompts.buildChangeModelPrompt({
        modelStyle: params.modelStyle,
        keepOutfit: true,
        keepBackground: true,
    });

    const inputImages = [
        { data: params.originalImage, mimeType: 'image/jpeg' },
    ];

    if (params.modelImage) {
        inputImages.push({ data: params.modelImage, mimeType: 'image/jpeg' });
    }

    return generateImages(prompt, inputImages);
}

// 复刻参考图
export async function replicateReference(params: {
    productImage: string;
    referenceImage: string;
    elements: ('composition' | 'vibe' | 'pose' | 'scene')[];
}): Promise<string[]> {
    const prompt = prompts.buildReplicateReferencePrompt({
        elements: params.elements,
    });

    const inputImages = [
        { data: params.productImage, mimeType: 'image/jpeg' },
        { data: params.referenceImage, mimeType: 'image/jpeg' },
    ];

    return generateImages(prompt, inputImages);
}

// Shoot Room 生成
export async function shootRoom(params: {
    productImage: string;
    modelImage?: string;
    sceneImage?: string;
    lighting: { position: { x: number; y: number }; direction: number; intensity: number };
    camera: { position: { x: number; y: number }; angle: string; focalLength: number };
    sceneElements?: string[];
}): Promise<string[]> {
    // 将参数转换为描述性文本
    const lightingDescription = describeLighting(params.lighting);
    const cameraDescription = describeCamera(params.camera);

    const prompt = prompts.buildShootRoomPrompt({
        hasModel: !!params.modelImage,
        hasScene: !!params.sceneImage,
        lightingDescription,
        cameraDescription,
        sceneElements: params.sceneElements,
    });

    const inputImages = [
        { data: params.productImage, mimeType: 'image/jpeg' },
    ];

    if (params.modelImage) {
        inputImages.push({ data: params.modelImage, mimeType: 'image/jpeg' });
    }

    if (params.sceneImage) {
        inputImages.push({ data: params.sceneImage, mimeType: 'image/jpeg' });
    }

    return generateImages(prompt, inputImages);
}

// 辅助函数：描述光线设置
function describeLighting(lighting: { position: { x: number; y: number }; direction: number; intensity: number }): string {
    const positionDesc = lighting.position.x < 0.3 ? 'left side' :
                        lighting.position.x > 0.7 ? 'right side' : 'front';
    const heightDesc = lighting.position.y < 0.3 ? 'high angle' :
                      lighting.position.y > 0.7 ? 'low angle' : 'eye level';
    const intensityDesc = lighting.intensity < 0.3 ? 'soft' :
                         lighting.intensity > 0.7 ? 'strong' : 'medium';

    return `${intensityDesc} ${positionDesc} light from ${heightDesc}`;
}

// 辅助函数：描述相机设置
function describeCamera(camera: { position: { x: number; y: number }; angle: string; focalLength: number }): string {
    const angleDesc = camera.angle === 'high' ? 'high angle (looking down)' :
                     camera.angle === 'low' ? 'low angle (looking up)' : 'eye level';
    const focalDesc = camera.focalLength < 24 ? 'wide angle' :
                     camera.focalLength > 50 ? 'telephoto close-up' : 'standard';

    return `${focalDesc} lens (${camera.focalLength}mm) at ${angleDesc}`;
}
```

---

## 8. 存储架构

### 8.1 Supabase Storage 结构

```
storage/
├── avatars/                    # 用户头像
│   └── {user_id}/
│       └── avatar.jpg
│
├── assets/                     # 用户资产
│   └── {user_id}/
│       ├── models/             # 模特图
│       ├── products/           # 商品图
│       ├── scenes/             # 场景图
│       └── elements/           # 场景元素
│
├── generations/                # 生成结果
│   └── {user_id}/
│       └── {generation_id}/
│           ├── input_0.jpg
│           ├── output_0.jpg
│           ├── output_1.jpg
│           └── metadata.json
│
├── presets/                    # 系统预设
│   ├── models/
│   │   ├── korean/
│   │   ├── japanese/
│   │   ├── western/
│   │   └── chinese/
│   ├── scenes/
│   │   ├── studio/
│   │   ├── outdoor/
│   │   ├── indoor/
│   │   └── street/
│   └── elements/
│       ├── furniture/
│       ├── props/
│       └── plants/
│
└── temp/                       # 临时文件
    └── {session_id}/
```

### 8.2 存储策略

```sql
-- RLS 策略

-- 用户只能访问自己的资产
CREATE POLICY "Users can access own assets"
ON storage.objects FOR ALL
USING (
    bucket_id IN ('assets', 'generations', 'avatars')
    AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 所有用户可以读取预设素材
CREATE POLICY "Anyone can read presets"
ON storage.objects FOR SELECT
USING (bucket_id = 'presets');

-- 临时文件策略
CREATE POLICY "Users can manage temp files"
ON storage.objects FOR ALL
USING (
    bucket_id = 'temp'
    AND (storage.foldername(name))[1] = auth.uid()::text
);
```

---

## 9. 性能优化

### 9.1 iOS 客户端优化

```swift
// 图片压缩
func compressImage(_ image: UIImage, maxSizeMB: Double = 1.0) -> Data? {
    var compression: CGFloat = 1.0
    let maxBytes = Int(maxSizeMB * 1024 * 1024)
    
    guard var imageData = image.jpegData(compressionQuality: compression) else {
        return nil
    }
    
    while imageData.count > maxBytes && compression > 0.1 {
        compression -= 0.1
        if let newData = image.jpegData(compressionQuality: compression) {
            imageData = newData
        }
    }
    
    return imageData
}

// 图片缓存
class ImageCacheManager {
    static let shared = ImageCacheManager()
    
    private let memoryCache = NSCache<NSString, UIImage>()
    private let diskCacheURL: URL
    
    init() {
        let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
        diskCacheURL = cacheDir.appendingPathComponent("ImageCache")
        
        try? FileManager.default.createDirectory(at: diskCacheURL, withIntermediateDirectories: true)
        
        memoryCache.countLimit = 100
        memoryCache.totalCostLimit = 100 * 1024 * 1024 // 100MB
    }
    
    func image(for key: String) async -> UIImage? {
        // 先查内存缓存
        if let cached = memoryCache.object(forKey: key as NSString) {
            return cached
        }
        
        // 再查磁盘缓存
        let fileURL = diskCacheURL.appendingPathComponent(key.md5)
        if let data = try? Data(contentsOf: fileURL),
           let image = UIImage(data: data) {
            memoryCache.setObject(image, forKey: key as NSString)
            return image
        }
        
        return nil
    }
    
    func cache(_ image: UIImage, for key: String) {
        memoryCache.setObject(image, forKey: key as NSString)
        
        // 异步写入磁盘
        Task.detached(priority: .background) {
            let fileURL = self.diskCacheURL.appendingPathComponent(key.md5)
            try? image.jpegData(compressionQuality: 0.8)?.write(to: fileURL)
        }
    }
}
```

### 9.2 API 优化

```typescript
// 请求去重
const pendingRequests = new Map<string, Promise<any>>();

async function deduplicatedRequest<T>(key: string, request: () => Promise<T>): Promise<T> {
    if (pendingRequests.has(key)) {
        return pendingRequests.get(key) as Promise<T>;
    }
    
    const promise = request().finally(() => {
        pendingRequests.delete(key);
    });
    
    pendingRequests.set(key, promise);
    return promise;
}

// 生成任务队列
import { Queue } from 'bullmq';

const generationQueue = new Queue('generation', {
    connection: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
    },
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
    },
});

// 添加生成任务
async function queueGeneration(params: GenerateParams): Promise<string> {
    const job = await generationQueue.add('generate', params, {
        priority: params.priority || 5,
    });
    return job.id!;
}
```

---

## 10. 安全策略

### 10.1 认证与授权

```swift
// iOS Keychain 存储
class KeychainManager {
    static let shared = KeychainManager()
    
    private let service = "com.onstage.app"
    
    func save(_ value: String, for key: String) throws {
        let data = value.data(using: .utf8)!
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
        ]
        
        SecItemDelete(query as CFDictionary)
        
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.saveFailed
        }
    }
    
    func get(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        guard status == errSecSuccess,
              let data = result as? Data,
              let value = String(data: data, encoding: .utf8) else {
            return nil
        }
        
        return value
    }
    
    func delete(_ key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
        ]
        
        SecItemDelete(query as CFDictionary)
    }
}
```

### 10.2 API 安全

```typescript
// Rate Limiting
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
    redis: Redis.fromEnv(),
    limiter: Ratelimit.slidingWindow(20, '1 m'), // 每分钟 20 次
    analytics: true,
});

// 中间件
async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const userId = req.user?.id || req.ip;
    const { success, limit, remaining, reset } = await ratelimit.limit(userId);
    
    res.setHeader('X-RateLimit-Limit', limit);
    res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', reset);
    
    if (!success) {
        return res.status(429).json({ error: 'Too many requests' });
    }
    
    next();
}

// 输入验证
import { z } from 'zod';

const GenerateRequestSchema = z.object({
    type: z.enum(['changeOutfit', 'changeModel', 'replicateReference', 'shootRoom']),
    inputs: z.object({
        originalImage: z.string().optional(),
        productImages: z.array(z.string()).max(3).optional(),
        modelImage: z.string().optional(),
        referenceImage: z.string().optional(),
    }),
    options: z.object({
        count: z.number().min(1).max(4).default(2),
    }).optional(),
});
```

---

## 11. 监控与运维

### 11.1 日志记录

```typescript
// 结构化日志
interface GenerationLog {
    userId: string;
    type: string;
    inputParams: object;
    outputCount: number;
    processingTimeMs: number;
    status: 'success' | 'error';
    errorMessage?: string;
    modelVersion: string;
    creditsUsed: number;
    timestamp: Date;
}

// 记录生成日志
async function logGeneration(log: GenerationLog) {
    console.log(JSON.stringify({
        level: log.status === 'error' ? 'error' : 'info',
        message: 'Generation completed',
        ...log,
    }));
    
    // 写入数据库
    await db.insert(generationLogs).values(log);
}
```

### 11.2 监控指标

| 指标 | 描述 | 告警阈值 |
|-----|------|---------|
| generation_success_rate | 生成成功率 | < 95% |
| generation_latency_p99 | P99 延迟 | > 60s |
| api_error_rate | API 错误率 | > 5% |
| active_users_daily | 日活用户 | - |
| credits_consumed_daily | 日消耗配额 | - |

---

## 12. 部署架构

### 12.1 环境配置

```bash
# .env.production

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Vertex AI
GEMINI_API_KEY=xxx
GOOGLE_GENAI_USE_VERTEXAI=true

# Redis
REDIS_HOST=xxx
REDIS_PORT=6379
REDIS_PASSWORD=xxx

# Sentry
SENTRY_DSN=xxx

# App Config
API_BASE_URL=https://api.onstage.app
```

### 12.2 CI/CD 流程

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests
        run: npm test
        
      - name: Deploy to Vercel
        uses: vercel/action@v1
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}

  build-ios:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Xcode
        uses: maxim-lobanov/setup-xcode@v1
        with:
          xcode-version: '15.0'
          
      - name: Build
        run: |
          xcodebuild -scheme Onstage -configuration Release -archivePath build/Onstage.xcarchive archive
          
      - name: Upload to TestFlight
        run: |
          xcrun altool --upload-app -f build/Onstage.ipa -t ios -u ${{ secrets.APPLE_ID }} -p ${{ secrets.APPLE_APP_PASSWORD }}
```

---

## 13. 扩展规划

### 13.1 Phase 2 技术规划

| 功能 | 技术方案 |
|-----|---------|
| 视频生成 | 集成 Runway / Pika API |
| 批量生成 | 任务队列 + 并行处理 |
| 实时预览 | WebSocket + 渐进式渲染 |
| 团队协作 | 多租户架构 + RBAC |

### 13.2 模型扩展

```typescript
// 模型适配器接口
interface ModelAdapter {
    name: string;
    generateImage(params: GenerateParams): Promise<string[]>;
    estimateCredits(params: GenerateParams): number;
    isAvailable(): Promise<boolean>;
}

// Vertex AI 适配器
class VertexAIAdapter implements ModelAdapter {
    name = 'vertex-ai';
    // ...
}

// Stability AI 适配器 (备选)
class StabilityAIAdapter implements ModelAdapter {
    name = 'stability-ai';
    // ...
}

// 模型路由器
class ModelRouter {
    private adapters: Map<string, ModelAdapter> = new Map();
    
    register(adapter: ModelAdapter) {
        this.adapters.set(adapter.name, adapter);
    }
    
    async route(params: GenerateParams): Promise<ModelAdapter> {
        // 根据任务类型、负载、可用性选择最佳模型
        const primary = this.adapters.get('vertex-ai')!;
        if (await primary.isAvailable()) {
            return primary;
        }
        return this.adapters.get('stability-ai')!;
    }
}
```

---

*文档版本: 1.0.0 | 最后更新: 2025-01-01*

