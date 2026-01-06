import Foundation

/// Chat repository for conversation and message operations
final class ChatRepository {
    static let shared = ChatRepository()
    
    private let apiClient = APIClient.shared
    
    private init() {}
    
    // MARK: - Conversations
    
    func getConversations(limit: Int = 20, offset: Int = 0) async throws -> [Conversation] {
        struct Response: Decodable {
            let success: Bool
            let conversations: [Conversation]
        }
        
        let response = try await apiClient.request(
            .getConversations(limit: limit, offset: offset),
            responseType: Response.self
        )
        
        return response.conversations
    }
    
    func deleteConversation(id: UUID) async throws {
        struct Response: Decodable {
            let success: Bool
        }
        
        _ = try await apiClient.request(
            .deleteConversation(id: id),
            responseType: Response.self
        )
    }
    
    // MARK: - Messages
    
    func getMessages(conversationId: UUID, limit: Int = 50, offset: Int = 0) async throws -> [Message] {
        struct Response: Decodable {
            let success: Bool
            let messages: [MessageDTO]
        }
        
        struct MessageDTO: Decodable {
            let id: UUID
            let role: Message.MessageRole
            let text: String?
            let images: [String]?
            let generatedImages: [String]?
            let createdAt: Date
        }
        
        let response = try await apiClient.request(
            .getMessages(conversationId: conversationId, limit: limit, offset: offset),
            responseType: Response.self
        )
        
        return response.messages.map { dto in
            Message(
                id: dto.id,
                role: dto.role,
                content: MessageContent(
                    text: dto.text,
                    images: nil, // Images are stored as URLs, not data
                    generatedImages: dto.generatedImages?.enumerated().map { i, url in
                        GeneratedImage(id: "gen_\(i)", url: url)
                    }
                ),
                createdAt: dto.createdAt,
                status: .sent
            )
        }
    }
    
    // MARK: - Send Message
    
    func sendMessage(
        conversationId: UUID?,
        text: String?,
        images: [MessageImage]?
    ) async throws -> SendMessageResponse {
        struct Response: Decodable {
            let success: Bool
            let conversationId: UUID
            let message: MessageDTO
            let agentSteps: [AgentStepDTO]?
            let thinking: String?
        }
        
        struct MessageDTO: Decodable {
            let id: UUID
            let role: Message.MessageRole
            let text: String
            let generatedImages: [GeneratedImageDTO]?
            let guiRequest: GuiRequestDTO?
            let createdAt: Date
        }
        
        struct GeneratedImageDTO: Decodable {
            let id: String
            let url: String
            let thumbnailUrl: String?
        }
        
        struct GuiRequestDTO: Decodable {
            let type: GuiRequest.GuiType
            let message: String?
            let prefillData: [String: AnyCodable]?
        }
        
        struct AgentStepDTO: Decodable {
            let type: String
            let tool: String?
            let arguments: [String: AnyCodable]?
            let result: StepResultDTO?
            let timestamp: Date
        }
        
        struct StepResultDTO: Decodable {
            let success: Bool?
            let message: String?
            let hasImages: Bool?
        }
        
        let response = try await apiClient.request(
            .sendMessage(conversationId: conversationId, text: text, images: images),
            responseType: Response.self
        )
        
        // 解析 agent steps
        let agentSteps: [AgentStep]? = response.agentSteps?.compactMap { dto in
            guard let stepType = AgentStep.StepType(rawValue: dto.type) else { return nil }
            return AgentStep(
                id: UUID(),
                type: stepType,
                tool: dto.tool,
                arguments: dto.arguments,
                result: dto.result.map { StepResult(success: $0.success ?? true, message: $0.message, hasImages: $0.hasImages) },
                timestamp: dto.timestamp
            )
        }
        
        let message = Message(
            id: response.message.id,
            role: response.message.role,
            content: MessageContent(
                text: response.message.text,
                images: nil,
                generatedImages: response.message.generatedImages?.map {
                    GeneratedImage(id: $0.id, url: $0.url, thumbnailUrl: $0.thumbnailUrl)
                },
                guiRequest: response.message.guiRequest.map {
                    GuiRequest(type: $0.type, message: $0.message, prefillData: $0.prefillData)
                },
                agentSteps: agentSteps,
                thinking: response.thinking
            ),
            createdAt: response.message.createdAt,
            status: .sent
        )
        
        return SendMessageResponse(
            conversationId: response.conversationId,
            message: message
        )
    }
}

/// Response from sending a message
struct SendMessageResponse {
    let conversationId: UUID
    let message: Message
}



