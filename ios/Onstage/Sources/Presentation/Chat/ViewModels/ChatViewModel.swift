import PhotosUI
import SwiftUI

/// Chat view model - Demo mode (no server required)
@MainActor
final class ChatViewModel: ObservableObject {
  // MARK: - Published Properties

  @Published var blocks: [ChatBlock] = []  // Block-based rendering
  @Published var inputText: String = ""
  @Published var selectedImages: [MessageImage] = []
  @Published var isLoading: Bool = false
  @Published var error: String?
  @Published var currentConversationId: UUID?
  @Published var conversations: [Conversation] = []
  @Published var showActionSheet: ActionSheetType?
  @Published var showImagePicker: Bool = false
  @Published var showCameraPicker: Bool = false

  // MARK: - Demo Mode Flag

  private let isDemoMode = false  // Backend is ready

  // MARK: - Action Sheet Types

  enum ActionSheetType: Identifiable {
    case changeOutfit
    case changeModel
    case replicateReference

    var id: String { String(describing: self) }

    var title: String {
      switch self {
      case .changeOutfit: return "换搭配"
      case .changeModel: return "换模特"
      case .replicateReference: return "复刻参考图"
      }
    }
  }

  // MARK: - Streaming State (Block IDs for tracking)

  private var currentThinkingBlockId: UUID?
  private var currentToolBlockId: UUID?
  private var currentAssistantBlockId: UUID?
  private var thinkingStartTime: Date?

  // MARK: - Private Properties

  private let chatRepository = ChatRepository.shared
  private let sseClient = SSEClient()
  let audioRecorder = AudioRecorderManager()  // Public for View access
  private var useStreaming = true  // Use streaming by default
  private var backgroundObserver: NSObjectProtocol?
  private var foregroundObserver: NSObjectProtocol?
  private var currentStreamingMessageId: UUID?

  // MARK: - Init

  init() {
    // Add welcome message in demo mode
    if isDemoMode {
      addWelcomeMessage()
    } else {
      Task {
        await loadConversations()
      }
    }

    // Setup lifecycle observers
    setupLifecycleObservers()
  }

  deinit {
    if let observer = backgroundObserver {
      NotificationCenter.default.removeObserver(observer)
    }
    if let observer = foregroundObserver {
      NotificationCenter.default.removeObserver(observer)
    }
  }

  private func setupLifecycleObservers() {
    // Cancel SSE when app goes to background to prevent network lost errors
    backgroundObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.willResignActiveNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.handleAppWillResignActive()
    }

    foregroundObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.didBecomeActiveNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      Task { @MainActor [weak self] in
        self?.handleAppDidBecomeActive()
      }
    }
  }

  private func handleAppWillResignActive() {
    // Cancel any active SSE connection to prevent "network connection was lost" errors
    if isLoading {
      sseClient.cancel()
      // Add interrupted message block
      let interruptedBlock = AssistantMessageBlock(
        text: "⚠️ 回复因后台暂停而中断，请重新发送消息",
        status: .failed
      )
      blocks.append(.assistantMessage(interruptedBlock))
      isLoading = false
    }
  }

  private func handleAppDidBecomeActive() {
    // App came back to foreground - reload conversations in case they were updated
    Task {
      await loadConversations()
      if currentConversationId != nil {
        await loadMessages()
      }
    }
  }

  private func addWelcomeMessage() {
    let welcomeBlock = AssistantMessageBlock(
      text:
        "👋 你好！我是 Onstage AI 助手。\n\n你可以：\n• 发送商品图片，我帮你生成模特穿搭图\n• 使用下方的快捷按钮换搭配、换模特\n• 上传参考图，复刻类似风格\n\n现在是演示模式，快来试试吧！",
      status: .done
    )
    blocks.append(.assistantMessage(welcomeBlock))
  }

  // MARK: - Conversations

  func loadConversations() async {
    guard !isDemoMode else { return }
    do {
      conversations = try await chatRepository.getConversations()
    } catch {
      self.error = error.localizedDescription
    }
  }

  func selectConversation(_ conversation: Conversation) async {
    currentConversationId = conversation.id
    await loadMessages()
  }

  func startNewConversation() {
    currentConversationId = nil
    blocks = []
    inputText = ""
    selectedImages = []
    if isDemoMode {
      addWelcomeMessage()
    }
  }

  func deleteConversation(_ conversation: Conversation) async {
    guard !isDemoMode else { return }
    do {
      try await chatRepository.deleteConversation(id: conversation.id)
      conversations.removeAll { $0.id == conversation.id }

      if currentConversationId == conversation.id {
        startNewConversation()
      }
    } catch {
      self.error = error.localizedDescription
    }
  }

  func loadMessages() async {
    guard !isDemoMode else { return }
    guard let conversationId = currentConversationId else { return }

    do {
      let messages = try await chatRepository.getMessages(conversationId: conversationId)
      // Convert Message array to ChatBlock array, including agentSteps
      var newBlocks: [ChatBlock] = []

      for message in messages {
        let messageBlocks = MessageBlockFactory.createBlocks(from: message)
        newBlocks.append(contentsOf: messageBlocks)
      }

      blocks = newBlocks
    } catch {
      self.error = error.localizedDescription
    }
  }

  // MARK: - Send Message

  func sendMessage() async {
    let text = inputText.trimmingCharacters(in: .whitespacesAndNewlines)
    let images = selectedImages

    guard !text.isEmpty || !images.isEmpty else { return }

    // Clear input
    inputText = ""
    selectedImages = []

    // Create user message block
    let userBlock = UserMessageBlock(
      text: text.isEmpty ? nil : text,
      images: images.isEmpty ? nil : images
    )
    blocks.append(.userMessage(userBlock))

    // Demo mode: simulate AI response
    if isDemoMode {
      await simulateAIResponse(userText: text, hasImages: !images.isEmpty)
      return
    }

    // Use streaming or regular API
    if useStreaming {
      await sendMessageStream(
        text: text.isEmpty ? nil : text, images: images.isEmpty ? nil : images)
    } else {
      await sendMessageRegular(
        text: text.isEmpty ? nil : text, images: images.isEmpty ? nil : images)
    }
  }

  // MARK: - Streaming Send

  private func sendMessageStream(text: String?, images: [MessageImage]?) async {
    // Reset block tracking state
    currentThinkingBlockId = nil
    currentToolBlockId = nil
    currentAssistantBlockId = nil
    thinkingStartTime = nil

    isLoading = true

    // Get token
    guard let token = KeychainManager.shared.getAuthToken() else {
      let errorBlock = AssistantMessageBlock(text: "认证失败，请重新登录", status: .failed)
      blocks.append(.assistantMessage(errorBlock))
      isLoading = false
      return
    }

    // Start SSE stream
    sseClient.stream(
      text: text,
      images: images,
      conversationId: currentConversationId,
      token: token,
      onEvent: { [weak self] event in
        self?.handleSSEEvent(event, messageId: UUID())  // messageId not used in new logic
      },
      onComplete: { [weak self] in
        self?.finalizeStream()
      },
      onError: { [weak self] error in
        self?.handleStreamError(message: error.localizedDescription)
      }
    )
  }

  private func handleSSEEvent(_ event: SSEEvent, messageId: UUID) {
    switch event.type {
    case .conversation:
      if let idString = event.conversationId, let id = UUID(uuidString: idString) {
        currentConversationId = id
        Task { await loadConversations() }
      }

    case .thinking:
      if let content = event.thinkingContent {
        handleThinkingDelta(content)
      }

    case .toolStart:
      handleToolStart(
        tool: event.toolName ?? "Unknown Tool",
        args: event.arguments
      )

    case .toolResult:
      handleToolResult(result: event.toolResult)

    case .textDelta:
      if let delta = event.textDelta {
        handleTextDelta(delta)
      }

    case .image:
      if let url = event.imageUrl {
        let image = GeneratedImage(
          id: event.data["id"] as? String ?? UUID().uuidString,
          url: url,
          thumbnailUrl: event.data["thumbnailUrl"] as? String
        )
        handleImageOutput(image)
      }

    case .done:
      finalizeStream()

    case .error:
      handleStreamError(message: event.errorMessage ?? "Unknown error")
    }
  }

  // MARK: - Block Management Helpers

  private func handleThinkingDelta(_ content: String) {
    // If already have a thinking block, update it
    if let id = currentThinkingBlockId,
      let index = blocks.firstIndex(where: { $0.id == id }),
      case .thinking(var block) = blocks[index]
    {
      block.content += content
      blocks[index] = .thinking(block)
    } else {
      // Close any running assistant block first
      closeCurrentAssistantBlock()

      // Create new thinking block
      thinkingStartTime = Date()
      let block = ThinkingBlock(content: content)
      currentThinkingBlockId = block.id
      blocks.append(.thinking(block))
    }
  }

  private func handleToolStart(tool: String, args: [String: Any]?) {
    // Finalize thinking block if running
    finalizeThinkingBlock()

    // CRITICAL: Freeze pre-tool assistant message
    // Any text_delta after this must go to a NEW post-tool message
    currentAssistantBlockId = nil

    // Create tool block
    var toolBlock = ToolBlock(toolName: tool)
    if let args = args {
      toolBlock.inputs = formatJSON(args)
    }
    currentToolBlockId = toolBlock.id
    blocks.append(.tool(toolBlock))
  }

  private func handleToolResult(result: [String: Any]?) {
    guard let id = currentToolBlockId,
      let index = blocks.firstIndex(where: { $0.id == id }),
      case .tool(var block) = blocks[index]
    else { return }

    let success = result?["success"] as? Bool ?? true
    let message = result?["message"] as? String

    block.status = success ? .done : .failed
    block.summary = message ?? (success ? "Completed" : "Failed")
    block.duration = Date().timeIntervalSince(block.createdAt)

    blocks[index] = .tool(block)
    currentToolBlockId = nil

    // CRITICAL: Force post-tool text to create a NEW message block
    // Do NOT reuse pre-tool message
    currentAssistantBlockId = nil

    // Auto-collapse after delay
    let blockId = block.id
    Task {
      try? await Task.sleep(nanoseconds: 700_000_000)
      await MainActor.run {
        if let idx = self.blocks.firstIndex(where: { $0.id == blockId }),
          case .tool(var b) = self.blocks[idx],
          !b.pinnedOpen
        {
          b.isExpanded = false
          self.blocks[idx] = .tool(b)
        }
      }
    }
  }

  private func handleImageOutput(_ image: GeneratedImage) {
    // Images should go in a NEW assistant block after the tool completes
    // NOT in a previous assistant block that was created before the tool

    // Priority 1: If there's a current assistant block (created after tool), use it
    if let id = currentAssistantBlockId,
      let index = blocks.firstIndex(where: { $0.id == id }),
      case .assistantMessage(var block) = blocks[index]
    {
      var images = block.generatedImages ?? []
      images.append(image)
      block.generatedImages = images
      blocks[index] = .assistantMessage(block)
      return
    }

    // Priority 2: Create a NEW assistant block for the image
    // Don't search for old assistant blocks - that causes the wrong placement bug
    var newBlock = AssistantMessageBlock(text: "", status: .running)
    newBlock.generatedImages = [image]
    blocks.append(.assistantMessage(newBlock))
    currentAssistantBlockId = newBlock.id
  }

  private func handleTextDelta(_ text: String) {
    // Finalize thinking block if running
    finalizeThinkingBlock()

    // If already have an assistant block, update it
    if let id = currentAssistantBlockId,
      let index = blocks.firstIndex(where: { $0.id == id }),
      case .assistantMessage(var block) = blocks[index]
    {
      block.text += text
      blocks[index] = .assistantMessage(block)
    } else {
      // Create new assistant message block
      let block = AssistantMessageBlock(text: text)
      currentAssistantBlockId = block.id
      blocks.append(.assistantMessage(block))
    }
  }

  private func finalizeThinkingBlock() {
    guard let id = currentThinkingBlockId,
      let index = blocks.firstIndex(where: { $0.id == id }),
      case .thinking(var block) = blocks[index]
    else { return }

    block.status = .done
    block.duration = thinkingStartTime.map { Date().timeIntervalSince($0) }
    blocks[index] = .thinking(block)
    currentThinkingBlockId = nil

    // Auto-collapse
    let blockId = block.id
    Task {
      try? await Task.sleep(nanoseconds: 700_000_000)
      await MainActor.run {
        if let idx = self.blocks.firstIndex(where: { $0.id == blockId }),
          case .thinking(var b) = self.blocks[idx],
          !b.pinnedOpen
        {
          b.isExpanded = false
          self.blocks[idx] = .thinking(b)
        }
      }
    }
  }

  private func closeCurrentAssistantBlock() {
    guard let id = currentAssistantBlockId,
      let index = blocks.firstIndex(where: { $0.id == id }),
      case .assistantMessage(var block) = blocks[index]
    else { return }

    block.status = .done
    blocks[index] = .assistantMessage(block)
    currentAssistantBlockId = nil
  }

  private func finalizeStream() {
    finalizeThinkingBlock()
    closeCurrentAssistantBlock()

    // Finalize any running tool block
    if let id = currentToolBlockId,
      let index = blocks.firstIndex(where: { $0.id == id }),
      case .tool(var block) = blocks[index]
    {
      if block.status == .running {
        block.status = .done
        block.duration = Date().timeIntervalSince(block.createdAt)
        blocks[index] = .tool(block)
      }
    }

    currentThinkingBlockId = nil
    currentToolBlockId = nil
    currentAssistantBlockId = nil
    isLoading = false
  }

  private func handleStreamError(message: String) {
    // Add error as assistant message
    let block = AssistantMessageBlock(text: "Error: \(message)", status: .failed)
    blocks.append(.assistantMessage(block))
    isLoading = false
  }

  private func formatJSON(_ dict: [String: Any]) -> String {
    if let data = try? JSONSerialization.data(withJSONObject: dict, options: .prettyPrinted),
      let str = String(data: data, encoding: .utf8)
    {
      return str
    }
    return dict.description
  }

  // MARK: - Regular Send (non-streaming fallback)

  private func sendMessageRegular(text: String?, images: [MessageImage]?) async {
    // Add loading block
    var loadingBlock = AssistantMessageBlock(text: "思考中...", status: .running)
    blocks.append(.assistantMessage(loadingBlock))
    let loadingBlockId = loadingBlock.id

    isLoading = true

    do {
      let response = try await chatRepository.sendMessage(
        conversationId: currentConversationId,
        text: text,
        images: images
      )

      // Update conversation ID if new
      if currentConversationId == nil {
        currentConversationId = response.conversationId
        await loadConversations()
      }

      // Replace loading block with actual response
      if let index = blocks.firstIndex(where: { $0.id == loadingBlockId }) {
        let responseBlock = AssistantMessageBlock(
          id: response.message.id,
          text: response.message.content.text ?? "",
          status: .done,
          generatedImages: response.message.content.generatedImages
        )
        blocks[index] = .assistantMessage(responseBlock)
      }

    } catch {
      // Update loading block to error
      if let index = blocks.firstIndex(where: { $0.id == loadingBlockId }),
        case .assistantMessage(var block) = blocks[index]
      {
        block.text = "发送失败: \(error.localizedDescription)"
        block.status = .failed
        blocks[index] = .assistantMessage(block)
      }
      self.error = error.localizedDescription
    }

    isLoading = false
  }

  // MARK: - Demo Mode AI Response

  private func simulateAIResponse(userText: String, hasImages: Bool) async {
    // Add thinking block
    let thinkingBlock = ThinkingBlock(content: "分析用户请求...")
    let thinkingBlockId = thinkingBlock.id
    blocks.append(.thinking(thinkingBlock))

    // Simulate delay
    try? await Task.sleep(nanoseconds: 1_500_000_000)

    // Finalize thinking block
    if let index = blocks.firstIndex(where: { $0.id == thinkingBlockId }),
      case .thinking(var block) = blocks[index]
    {
      block.status = .done
      block.isExpanded = false
      block.duration = 1.5
      blocks[index] = .thinking(block)
    }

    // Generate response based on input
    let responseText: String

    if hasImages {
      responseText = """
        ✨ 收到你的图片了！

        在实际使用中，我会：
        1. 分析图片中的商品特征
        2. 理解你的需求
        3. 生成高质量的模特穿搭图

        目前是演示模式，连接后端后即可体验完整功能。

        💡 提示：你可以尝试使用下方的「换搭配」「换模特」「复刻参考图」按钮！
        """
    } else if userText.contains("换") || userText.contains("模特") {
      responseText = """
        🎨 好的，我理解你想要更换模特/服装。

        在实际使用中，我会：
        1. 分析原图的构图和光线
        2. 保持商品的准确呈现
        3. 生成自然的模特穿搭效果

        请上传图片，我来帮你处理！
        """
    } else if userText.contains("生成") || userText.contains("图片") || userText.contains("图") {
      responseText = """
        📸 明白！你想生成营销图片。

        我可以帮你：
        • 生成模特穿搭图
        • 更换不同风格的模特
        • 调整场景和氛围
        • 复刻参考图的风格

        请上传你的商品图片，开始创作吧！
        """
    } else {
      responseText = """
        👋 收到你的消息：「\(userText)」

        我是 Onstage AI 助手，专注于帮助品牌生成高质量的营销图片。

        你可以：
        1. 📷 上传商品图片
        2. 🎨 使用快捷功能（换搭配/换模特/复刻参考图）
        3. 💬 用自然语言描述你的需求

        有什么我可以帮你的吗？
        """
    }

    // Add response block
    let responseBlock = AssistantMessageBlock(text: responseText, status: .done)
    blocks.append(.assistantMessage(responseBlock))
  }

  // MARK: - Image Selection

  func addImage(_ data: Data, mimeType: String = "image/jpeg") {
    let index = selectedImages.count + 1
    let image = MessageImage(
      id: UUID(),
      data: data,
      mimeType: mimeType,
      label: "图\(index)"
    )
    selectedImages.append(image)
  }

  func removeImage(at index: Int) {
    guard index < selectedImages.count else { return }
    selectedImages.remove(at: index)

    // Update labels
    for i in 0..<selectedImages.count {
      selectedImages[i].label = "图\(i + 1)"
    }
  }

  // MARK: - Action Bar

  func handleAction(_ action: ActionSheetType) {
    showActionSheet = action
  }

  func submitActionSheet(
    action: ActionSheetType,
    originalImage: MessageImage?,
    additionalImages: [MessageImage],
    notes: String?
  ) async {
    var text: String
    var images: [MessageImage] = []

    switch action {
    case .changeOutfit:
      guard let original = originalImage else { return }
      images = [original] + additionalImages
      text = "请把图1的模特换上图\(additionalImages.count > 1 ? "2-\(additionalImages.count + 1)" : "2")的服装"
      if let notes = notes, !notes.isEmpty {
        text += "，\(notes)"
      }

    case .changeModel:
      guard let original = originalImage else { return }
      images = [original]
      if let modelRef = additionalImages.first {
        images.append(modelRef)
        text = "请把图1的模特换成图2的模特风格"
      } else {
        text = "请帮我换一个模特"
      }
      if let notes = notes, !notes.isEmpty {
        text += "，\(notes)"
      }

    case .replicateReference:
      guard let product = originalImage, let reference = additionalImages.first else { return }
      images = [product, reference]
      text = "请参考图2的构图和氛围，用图1的商品生成类似风格的图片"
      if let notes = notes, !notes.isEmpty {
        text += "，\(notes)"
      }
    }

    // Add images and text
    selectedImages = images
    inputText = text
    showActionSheet = nil

    // Send
    await sendMessage()
  }
}

/// Factory for creating consistent ChatBlocks from Messages
struct MessageBlockFactory {
  static func createBlocks(from message: Message) -> [ChatBlock] {
    var blocks: [ChatBlock] = []

    // 1. User Message
    if message.role == .user {
      return [
        .userMessage(
          UserMessageBlock(
            id: message.id,
            text: message.content.text,
            images: message.content.images,
            createdAt: message.createdAt
          ))
      ]
    }

    // 2. Assistant Message

    // A. Top-Level Thinking
    if let thinkingText = message.content.thinking, !thinkingText.isEmpty {
      var thinkingBlock = ThinkingBlock(content: thinkingText)
      thinkingBlock.status = .done
      thinkingBlock.isExpanded = false
      blocks.append(.thinking(thinkingBlock))
    }

    // B. Agent Steps (Tools & Nested Thinking)
    if let steps = message.content.agentSteps {
      for step in steps {
        if step.type == .toolCall || step.type == .toolResult {
          let toolName = step.tool ?? "Unknown Tool"
          var toolBlock = ToolBlock(
            id: step.id,
            toolName: toolName,
            status: step.status == .failed ? .failed : .done,
            inputs: formatArguments(step.arguments),
            logs: step.output != nil ? [step.output!] : [],
            outputs: [],
            summary: step.description ?? step.result?.message ?? "Completed",
            createdAt: step.timestamp
          )
          toolBlock.isExpanded = false
          blocks.append(.tool(toolBlock))
        } else if step.type == .thinking {
          let content = step.result?.message ?? step.description ?? ""
          if !content.isEmpty {
            var thinkingBlock = ThinkingBlock(
              id: step.id,
              status: .done,
              content: content,
              createdAt: step.timestamp
            )
            thinkingBlock.isExpanded = false
            blocks.append(.thinking(thinkingBlock))
          }
        }
      }
    }

    // C. Text Content & Generated Images
    let hasText = message.content.text != nil && !message.content.text!.isEmpty
    let hasImages =
      message.content.generatedImages != nil && !message.content.generatedImages!.isEmpty

    if hasText || hasImages {
      blocks.append(
        .assistantMessage(
          AssistantMessageBlock(
            id: message.id,
            text: message.content.text ?? "",
            status: .done,
            generatedImages: message.content.generatedImages,
            createdAt: message.createdAt
          )))
    }

    return blocks
  }

  private static func formatArguments(_ args: [String: AnyCodable]?) -> String? {
    guard let args = args else { return nil }
    return args.map { key, value in
      "\(key): \(value.value)"
    }.joined(separator: "\n")
  }
}
