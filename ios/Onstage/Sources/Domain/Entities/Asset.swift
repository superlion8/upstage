import Foundation

/// Asset entity for models, products, scenes, etc.
struct Asset: Identifiable, Codable, Equatable {
    let id: UUID
    let type: AssetType
    var name: String?
    let url: String
    var thumbnailUrl: String?
    var mimeType: String?
    var fileSize: Int?
    var tags: [String]?
    var metadata: [String: AnyCodable]?
    let createdAt: Date
    var updatedAt: Date
    
    enum AssetType: String, Codable {
        case model
        case product
        case scene
        case generated
        case reference
    }
}

/// System preset asset
struct Preset: Identifiable, Codable, Equatable {
    let id: UUID
    let type: Asset.AssetType
    let name: String
    var description: String?
    let url: String
    var thumbnailUrl: String?
    var category: String?
    var style: String?
    var tags: [String]?
}

/// Shoot Room session configuration
struct ShootRoomConfig: Codable, Equatable {
    var model: AssetReference?
    var product: AssetReference?
    var scene: AssetReference?
    var sceneObjects: [SceneObject]?
    var lighting: LightingConfig?
    var camera: CameraConfig?
    
    struct AssetReference: Codable, Equatable {
        let id: String
        let url: String
    }
    
    struct SceneObject: Identifiable, Codable, Equatable {
        let id: String
        let type: String
        var position: Position
    }
    
    struct Position: Codable, Equatable {
        var x: CGFloat
        var y: CGFloat
    }
    
    struct LightingConfig: Codable, Equatable {
        var position: Position
        var direction: CGFloat  // degrees
        var intensity: CGFloat  // 0-100
    }
    
    struct CameraConfig: Codable, Equatable {
        var position: Position
        var angle: CameraAngle
        var focalLength: CGFloat  // mm
        
        enum CameraAngle: String, Codable {
            case high
            case eye
            case low
        }
    }
}

/// Shoot Room session
struct ShootRoomSession: Identifiable, Codable, Equatable {
    let id: UUID
    var name: String?
    var config: ShootRoomConfig?
    let createdAt: Date
    var updatedAt: Date
}



