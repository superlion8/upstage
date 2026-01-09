# UpStage Project Architecture

## Overview
UpStage is an AI Agent Chat application designed for fashion content generation. It features a robust bidirectional communication flow between an iOS client and a Node.js backend. The system supports text, image upload, voice input, and rich agent capabilities including tool execution, "thinking" process visualization, and image generation.

## Technology Stack

### Backend
- **Framework**: Node.js + Fastify
- **Language**: TypeScript
- **Database**: PostgreSQL (via Drizzle ORM)
- **AI Engine**: Anthropic Claude 3.5 Sonnet (via `@anthropic-ai/sdk`)
- **API Style**: REST + SSE (Server-Sent Events) for streaming

### iOS Client
- **Framework**: SwiftUI
- **Architecture**: MVVM (Model-View-ViewModel) + Repository Pattern
- **Networking**: URLSession + Custom SSE Client
- **Minimum OS**: iOS 17+

---

## Backend Architecture (`backend/src`)

### 1. API Layer (`src/api`)
- **`chat.ts`**: Handles standard message sending and history retrieval.
- **`chat-stream.ts`**: Implements SSE endpoint `/api/chat/stream` for real-time streaming of agent thoughts and tool outputs.
- **`assets.ts`**: Manages static assets and generated images.

### 2. Agent Core (`src/agent`)
- **Orchestrator (`orchestrator-claude.ts`)**: The brain of the system.
    - Manages the conversation loop with Claude.
    - Maintains `ToolContext` and `ConversationHistory`.
    - Integrates `ImageStore` for strict image reference management.
- **Image Store (`image-store.ts`)**: **[Critical Component]**
    - A centralized service that registers ALL images (User Uploads, Generated, History).
    - Provides a unified ID system (e.g., `img_xxx`, `gen_xxx`) to solving "Unknown reference" errors.
    - Automatically attempts to resolve aliases (e.g., `/api/chat/assets/...` -> `gen_ID`).
- **Tools (`tools/`)**:
    - Modular tool definitions (e.g., `generate_image`, `web_search`).
    - Each tool receives a restricted `ToolContext` containing `ImageStore` and User info.

### 3. Data Layer (`src/db`)
- **Schema (`schema.ts`)**: Defines `users`, `conversations`, `messages`.
- **Message Structure**:
    - `content`: Stores JSON structure including `agentSteps` (Tools/Thinking) and `generatedImages`.
    - `thinking`: Separate field for the agent's internal reasoning process.

---

## iOS Architecture (`ios/Onstage`)

### 1. Data Flow
`View` -> `ViewModel` -> `Repository` -> `APIClient/SSEClient`

### 2. Core Components

#### `ChatViewModel` (`ViewModels/ChatViewModel.swift`)
The central state manager for the chat screen.
- **State**: Manages `blocks` (UI units), `inputText`, `currentStreamingMessage`.
- **Streaming**: Handles incoming SSE events (`tool_start`, `text_delta`, `image`) and updates the active block in real-time.
- **Persistence**: Reconciles streaming state with Backend data on reload.

#### `MessageBlockFactory` (`ViewModels/ChatViewModel.swift` extension)
**[Critical Component]**
A static factory responsible for converting raw `Message` entities into UI `ChatBlocks`.
- **Purpose**: Ensures consistency between "Streaming" view and "History" view.
- **Rules**:
    1.  **Thinking**: Always first (if present).
    2.  **Tools**: Rendered sequentially based on `agentSteps`. Uses **Persistent IDs** (`step.id`) to prevent UI resets.
    3.  **Answer**: Final text and images rendered last.

#### `ChatRepository` (`Repositories/ChatRepository.swift`)
- Handles API calls (`getMessages`, `sendMessage`).
- Decodes complex JSON using `AgentStepDTO` to parse Tool calls and Thinking blocks from the backend.

#### `Message` Entity (`Domain/Entities/Message.swift`)
- Defines the complete structure of a chat message, including `AgentStep` enum (`tool_call`, `thinking`, `plan`).

---

## Key Implementation Details

### Image Reference Flow
1.  **User Upload**: iOS sends Base64/Multipart -> Backend registers to `ImageStore` -> Returns ID.
2.  **Agent Context**: Orchestrator injects `Available Images: [ID: Description]` into System Prompt.
3.  **Tool Usage**: Tool calls `resolveImage(ref)` -> Checks `ImageStore` -> Returns raw data/URL.
4.  **Generation**: Tool generates image -> Registers to `ImageStore` -> iOS renders it.

### Block Rendering Stability
To prevent message blocks (tools/thoughts) from disappearing or reordering:
1.  **Backend**: Returns full `agentSteps` list in history API.
2.  **iOS**: `MessageBlockFactory` strictly enforces rendering order.
3.  **IDs**: Tools must use `step.id` from backend, NOT `UUID()` generated locally, to ensure SwiftUI identity stability.

---

## Directory Structure Highlights

```
backend/
├── src/
│   ├── api/          # Route handlers
│   ├── agent/        # AI Logic
│   │   ├── tools/    # Tool definitions
│   │   ├── image-store.ts # Image Registry
│   │   └── orchestrator-claude.ts # Agent Loop
│   ├── db/           # Drizzle Schema
│   └── lib/          # Utilities (Logger, etc.)

ios/Onstage/Sources/
├── App/              # Entry point
├── Data/             # Repositories & Network
├── Domain/           # Entities (Message, User)
├── Presentation/     # UI Layer
│   └── Chat/
│       ├── ViewModels/ # ChatViewModel + BlockFactory
│       ├── Views/      # SwiftUI Views
└── DesignSystem/     # Reusable Components
```
