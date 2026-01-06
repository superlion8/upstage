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
}

/// User uploaded image
struct MessageImage: Identifiable, Codable, Equatable {
    let id: UUID
    let data: Data
    let mimeType: String
    var label: String  // "图1", "图2"
    
    var base64String: String {
        data.base64EncodedString()
    }
    
    var dataUrl: String {
        "data:\(mimeType);base64,\(base64String)"
    }
}

/// AI generated image
struct GeneratedImage: Identifiable, Codable, Equatable {
    let id: String
    let url: String
    var thumbnailUrl: String?
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



