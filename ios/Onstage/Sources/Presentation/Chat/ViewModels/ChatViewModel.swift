import SwiftUI
import PhotosUI

/// Chat view model - Demo mode (no server required)
@MainActor
final class ChatViewModel: ObservableObject {
    // MARK: - Published Properties
    
    @Published var messages: [Message] = []
    @Published var inputText: String = ""
    @Published var selectedImages: [MessageImage] = []
    @Published var isLoading: Bool = false
    @Published var error: String?
    @Published var currentConversationId: UUID?
    @Published var conversations: [Conversation] = []
    @Published var showActionSheet: ActionSheetType?
    @Published var showImagePicker: Bool = false
    
    // MARK: - Demo Mode Flag
    
    private let isDemoMode = true  // Set to false when backend is ready
    
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
    
    // MARK: - Private Properties
    
    private let chatRepository = ChatRepository.shared
    
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
    }
    
    private func addWelcomeMessage() {
        let welcomeMessage = Message(
            id: UUID(),
            role: .assistant,
            content: MessageContent(text: "👋 你好！我是 Onstage AI 助手。\n\n你可以：\n• 发送商品图片，我帮你生成模特穿搭图\n• 使用下方的快捷按钮换搭配、换模特\n• 上传参考图，复刻类似风格\n\n现在是演示模式，快来试试吧！"),
            createdAt: Date(),
            status: .sent
        )
        messages.append(welcomeMessage)
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
        messages = []
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
    
    // MARK: - Messages
    
    func loadMessages() async {
        guard !isDemoMode else { return }
        guard let conversationId = currentConversationId else { return }
        
        do {
            messages = try await chatRepository.getMessages(conversationId: conversationId)
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
        
        // Create optimistic user message
        let userMessage = Message(
            id: UUID(),
            role: .user,
            content: MessageContent(
                text: text.isEmpty ? nil : text,
                images: images.isEmpty ? nil : images
            ),
            createdAt: Date(),
            status: .sent
        )
        messages.append(userMessage)
        
        // Demo mode: simulate AI response
        if isDemoMode {
            await simulateAIResponse(userText: text, hasImages: !images.isEmpty)
            return
        }
        
        // Create loading assistant message
        let loadingMessage = Message(
            id: UUID(),
            role: .assistant,
            content: MessageContent(text: "思考中..."),
            createdAt: Date(),
            status: .generating
        )
        messages.append(loadingMessage)
        
        isLoading = true
        
        do {
            let response = try await chatRepository.sendMessage(
                conversationId: currentConversationId,
                text: text.isEmpty ? nil : text,
                images: images.isEmpty ? nil : images
            )
            
            // Update conversation ID if new
            if currentConversationId == nil {
                currentConversationId = response.conversationId
                await loadConversations()
            }
            
            // Replace loading message with actual response
            if let index = messages.firstIndex(where: { $0.id == loadingMessage.id }) {
                messages[index] = response.message
            }
            
        } catch {
            // Update loading message to error
            if let index = messages.firstIndex(where: { $0.id == loadingMessage.id }) {
                messages[index].content.text = "发送失败: \(error.localizedDescription)"
                messages[index].status = .failed
            }
            
            self.error = error.localizedDescription
        }
        
        isLoading = false
    }
    
    // MARK: - Demo Mode AI Response
    
    private func simulateAIResponse(userText: String, hasImages: Bool) async {
        // Add thinking message
        let thinkingMessage = Message(
            id: UUID(),
            role: .assistant,
            content: MessageContent(text: "🤔 思考中..."),
            createdAt: Date(),
            status: .generating
        )
        messages.append(thinkingMessage)
        
        // Simulate delay
        try? await Task.sleep(nanoseconds: 1_500_000_000)
        
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
        
        // Update message
        if let index = messages.firstIndex(where: { $0.id == thinkingMessage.id }) {
            messages[index].content.text = responseText
            messages[index].status = .sent
        }
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
