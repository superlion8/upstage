import Foundation

/// Chat message entity
struct Message: Identifiable, Codable, Equatable {
  let id: UUID
  let role: MessageRole
  var content: MessageContent
  let createdAt: Date
  var status: MessageStatus

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

/// Message content
struct MessageContent: Codable, Equatable {
  var text: String?
  var images: [MessageImage]?
  var generatedImages: [GeneratedImage]?
  var guiRequest: GuiRequest?
  var agentSteps: [AgentStep]?  // Agent 执行步骤
  var thinking: String?  // Agent 思考过程
}

/// Agent execution step
struct AgentStep: Identifiable, Codable, Equatable {
  let id: UUID
  let type: StepType
  var tool: String?
  var arguments: [String: AnyCodable]?
  var result: StepResult?
  let timestamp: Date

  enum StepType: String, Codable {
    case thinking
    case toolCall = "tool_call"
    case toolResult = "tool_result"
    case plan
  }

  enum StepStatus: String, Codable {
    case pending
    case running
    case success
    case failed
  }

  var status: StepStatus
  var description: String?  // "What I'm doing"
  var input: String?  // JSON or text input
  var output: String?  // Streaming logs
  var isExpanded: Bool? = false  // UI state

  init(
    id: UUID = UUID(),
    type: StepType,
    tool: String? = nil,
    arguments: [String: AnyCodable]? = nil,
    result: StepResult? = nil,
    timestamp: Date = Date(),
    status: StepStatus = .success
  ) {
    self.id = id
    self.type = type
    self.tool = tool
    self.arguments = arguments
    self.result = result
    self.timestamp = timestamp
    self.status = status
    self.isExpanded = false
  }
}

/// Step result
struct StepResult: Codable, Equatable {
  let success: Bool
  let message: String?
  let hasImages: Bool?
  var images: [GeneratedImage]?  // Added to support tool images
}

/// User uploaded image
struct MessageImage: Identifiable, Codable, Equatable {
  let id: UUID
  let data: Data
  let mimeType: String
  var label: String  // "图1", "图2"
  var url: String? = nil  // Added for history loading

  var base64String: String {
    data.base64EncodedString()
  }

  var dataUrl: String {
    "data:\(mimeType);base64,\(base64String)"
  }

  init(id: UUID = UUID(), data: Data, mimeType: String, label: String, url: String? = nil) {
    self.id = id
    self.data = data
    self.mimeType = mimeType
    self.label = label
    self.url = url
  }
}

/// AI generated image
struct GeneratedImage: Identifiable, Codable, Equatable {
  let id: String
  let url: String
  var thumbnailUrl: String?

  var fullURL: String {
    if url.hasPrefix("/") {
      // Remove /api from baseURL if it exists to avoid duplication with /api in url
      // url is like "/api/chat/assets/..."
      // baseURL is like "https://upstage-production.up.railway.app/api"
      let base = "https://upstage-production.up.railway.app"
      return base + url
    }
    return url
  }
}

/// GUI request from agent
struct GuiRequest: Codable, Equatable {
  let type: GuiType
  var message: String?
  var prefillData: [String: AnyCodable]?

  enum GuiType: String, Codable {
    case changeOutfit = "change_outfit"
    case changeModel = "change_model"
    case replicateReference = "replicate_reference"
    case selectModel = "select_model"
    case selectScene = "select_scene"
  }
}

/// Conversation entity
struct Conversation: Identifiable, Codable, Equatable {
  let id: UUID
  var title: String?
  let createdAt: Date
  var updatedAt: Date
}

/// Helper for encoding/decoding arbitrary JSON
struct AnyCodable: Codable, Equatable {
  let value: Any

  init(_ value: Any) {
    self.value = value
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.singleValueContainer()
    if let string = try? container.decode(String.self) {
      value = string
    } else if let int = try? container.decode(Int.self) {
      value = int
    } else if let double = try? container.decode(Double.self) {
      value = double
    } else if let bool = try? container.decode(Bool.self) {
      value = bool
    } else if let array = try? container.decode([AnyCodable].self) {
      value = array.map { $0.value }
    } else if let dict = try? container.decode([String: AnyCodable].self) {
      value = dict.mapValues { $0.value }
    } else {
      value = NSNull()
    }
  }

  func encode(to encoder: Encoder) throws {
    var container = encoder.singleValueContainer()
    switch value {
    case let string as String:
      try container.encode(string)
    case let int as Int:
      try container.encode(int)
    case let double as Double:
      try container.encode(double)
    case let bool as Bool:
      try container.encode(bool)
    case let array as [Any]:
      try container.encode(array.map { AnyCodable($0) })
    case let dict as [String: Any]:
      try container.encode(dict.mapValues { AnyCodable($0) })
    default:
      try container.encodeNil()
    }
  }

  static func == (lhs: AnyCodable, rhs: AnyCodable) -> Bool {
    // Simple equality check
    String(describing: lhs.value) == String(describing: rhs.value)
  }
}

// MARK: - Block Status

enum BlockStatus: String, Codable {
  case running
  case done
  case failed
}

// MARK: - Chat Block (Render Unit for Block-Based Chat)

enum ChatBlock: Identifiable, Equatable {
  case userMessage(UserMessageBlock)
  case assistantMessage(AssistantMessageBlock)
  case thinking(ThinkingBlock)
  case tool(ToolBlock)

  var id: UUID {
    switch self {
    case .userMessage(let block): return block.id
    case .assistantMessage(let block): return block.id
    case .thinking(let block): return block.id
    case .tool(let block): return block.id
    }
  }

  var createdAt: Date {
    switch self {
    case .userMessage(let block): return block.createdAt
    case .assistantMessage(let block): return block.createdAt
    case .thinking(let block): return block.createdAt
    case .tool(let block): return block.createdAt
    }
  }
}

// MARK: - User Message Block

struct UserMessageBlock: Identifiable, Equatable {
  let id: UUID
  var text: String?
  var images: [MessageImage]?
  let createdAt: Date

  init(
    id: UUID = UUID(), text: String? = nil, images: [MessageImage]? = nil, createdAt: Date = Date()
  ) {
    self.id = id
    self.text = text
    self.images = images
    self.createdAt = createdAt
  }
}

// MARK: - Assistant Message Block

struct AssistantMessageBlock: Identifiable, Equatable {
  let id: UUID
  var text: String
  var status: BlockStatus
  var generatedImages: [GeneratedImage]?
  let createdAt: Date

  init(
    id: UUID = UUID(), text: String = "", status: BlockStatus = .running,
    generatedImages: [GeneratedImage]? = nil, createdAt: Date = Date()
  ) {
    self.id = id
    self.text = text
    self.status = status
    self.generatedImages = generatedImages
    self.createdAt = createdAt
  }
}

// MARK: - Thinking Block (DeepSeek Style)

struct ThinkingBlock: Identifiable, Equatable {
  let id: UUID
  var status: BlockStatus
  var content: String
  var duration: TimeInterval?
  var isExpanded: Bool
  var pinnedOpen: Bool
  let createdAt: Date

  init(
    id: UUID = UUID(), status: BlockStatus = .running, content: String = "",
    duration: TimeInterval? = nil, isExpanded: Bool = true, pinnedOpen: Bool = false,
    createdAt: Date = Date()
  ) {
    self.id = id
    self.status = status
    self.content = content
    self.duration = duration
    self.isExpanded = isExpanded
    self.pinnedOpen = pinnedOpen
    self.createdAt = createdAt
  }
}

// MARK: - Tool Block (Cursor Style)

struct ToolBlock: Identifiable, Equatable {
  let id: UUID
  var toolName: String
  var displayName: String
  var status: BlockStatus
  var inputs: String?
  var logs: [String]
  var outputs: [GeneratedImage]
  var summary: String?
  var duration: TimeInterval?
  var isExpanded: Bool
  var pinnedOpen: Bool
  let createdAt: Date

  init(
    id: UUID = UUID(),
    toolName: String,
    displayName: String? = nil,
    status: BlockStatus = .running,
    inputs: String? = nil,
    logs: [String] = [],
    outputs: [GeneratedImage] = [],
    summary: String? = nil,
    duration: TimeInterval? = nil,
    isExpanded: Bool = true,
    pinnedOpen: Bool = false,
    createdAt: Date = Date()
  ) {
    self.id = id
    self.toolName = toolName
    self.displayName = displayName ?? Self.humanReadableName(from: toolName)
    self.status = status
    self.inputs = inputs
    self.logs = logs
    self.outputs = outputs
    self.summary = summary
    self.duration = duration
    self.isExpanded = isExpanded
    self.pinnedOpen = pinnedOpen
    self.createdAt = createdAt
  }

  static func humanReadableName(from tool: String) -> String {
    if tool.lowercased().contains("image") { return "Generate Image" }
    if tool.lowercased().contains("search") { return "Search Web" }
    if tool.lowercased().contains("scrape") { return "Read Website" }
    return tool.replacingOccurrences(of: "_", with: " ").capitalized
  }

  mutating func appendLog(_ line: String) {
    logs.append(line)
    if logs.count > 20 { logs.removeFirst(logs.count - 20) }
  }
}
