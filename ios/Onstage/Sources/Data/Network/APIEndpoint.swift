import Foundation

/// Type alias for parameters
typealias Parameters = [String: Any]

/// API Endpoint definitions
enum APIEndpoint {
  // Auth
  case register(email: String, password: String, name: String?)
  case login(email: String, password: String)
  case guestLogin(deviceId: String, deviceName: String?)
  case getMe
  case updateProfile(name: String?, avatarUrl: String?)
  case refreshToken

  // Chat
  case sendMessage(conversationId: UUID?, text: String?, images: [MessageImage]?)
  case uploadImages(images: [MessageImage])
  case getConversations(limit: Int, offset: Int)
  case getMessages(conversationId: UUID, limit: Int, offset: Int)
  case deleteConversation(id: UUID)

  // Assets
  case listAssets(type: Asset.AssetType?, tags: [String]?, search: String?, limit: Int, offset: Int)
  case getAsset(id: UUID)
  case createAsset(type: Asset.AssetType, name: String?, url: String, tags: [String]?)
  case updateAsset(id: UUID, name: String?, tags: [String]?)
  case deleteAsset(id: UUID)
  case listPresets(
    type: Asset.AssetType, category: String?, style: String?, limit: Int, offset: Int)

  // Shoot Room
  case listSessions
  case getSession(id: UUID)
  case createSession(name: String?, config: ShootRoomConfig?)
  case updateSession(id: UUID, name: String?, config: ShootRoomConfig?)
  case deleteSession(id: UUID)
  case generateFromShootRoom(sessionId: UUID?, config: ShootRoomConfig, count: Int)

  // Onboarding
  case onboardBrand(webUrl: String, insUrl: String, videoUrl: String)

  // MARK: - Properties

  var path: String {
    switch self {
    // Auth
    case .register: return "/auth/register"
    case .login: return "/auth/login"
    case .guestLogin: return "/auth/guest-login"
    case .getMe: return "/auth/me"
    case .updateProfile: return "/auth/me"
    case .refreshToken: return "/auth/refresh"

    // Chat
    case .sendMessage: return "/chat/send"
    case .uploadImages: return "/images/upload"
    case .getConversations: return "/chat/conversations"
    case .getMessages: return "/chat/messages"
    case .deleteConversation(let id): return "/chat/conversations/\(id)"

    // Assets
    case .listAssets: return "/assets"
    case .getAsset(let id): return "/assets/\(id)"
    case .createAsset: return "/assets"
    case .updateAsset(let id, _, _): return "/assets/\(id)"
    case .deleteAsset(let id): return "/assets/\(id)"
    case .listPresets: return "/assets/presets"

    // Shoot Room
    case .listSessions: return "/shoot-room/sessions"
    case .getSession(let id): return "/shoot-room/sessions/\(id)"
    case .createSession: return "/shoot-room/sessions"
    case .updateSession(let id, _, _): return "/shoot-room/sessions/\(id)"
    case .deleteSession(let id): return "/shoot-room/sessions/\(id)"
    case .generateFromShootRoom: return "/shoot-room/generate"

    // Onboarding
    case .onboardBrand: return "/onboarding"
    }
  }

  var method: String {
    switch self {
    case .register, .login, .guestLogin, .refreshToken, .sendMessage, .uploadImages, .createAsset,
      .createSession,
      .generateFromShootRoom, .onboardBrand:
      return "POST"
    case .getMe, .getConversations, .getMessages, .listAssets, .getAsset, .listPresets,
      .listSessions, .getSession:
      return "GET"
    case .updateProfile, .updateAsset, .updateSession:
      return "PATCH"
    case .deleteConversation, .deleteAsset, .deleteSession:
      return "DELETE"
    }
  }

  var parameters: Parameters? {
    switch self {
    // Auth
    case .register(let email, let password, let name):
      var params: Parameters = ["email": email, "password": password]
      if let name = name { params["name"] = name }
      return params

    case .login(let email, let password):
      return ["email": email, "password": password]

    case .guestLogin(let deviceId, let deviceName):
      var params: Parameters = ["deviceId": deviceId]
      if let deviceName = deviceName { params["deviceName"] = deviceName }
      return params

    case .updateProfile(let name, let avatarUrl):
      var params: Parameters = [:]
      if let name = name { params["name"] = name }
      if let avatarUrl = avatarUrl { params["avatar_url"] = avatarUrl }
      return params

    // Chat
    case .sendMessage(let conversationId, let text, let images):
      var params: Parameters = [:]
      if let id = conversationId { params["conversation_id"] = id.uuidString }
      if let text = text { params["text"] = text }
      if let images = images {
        params["images"] = images.map {
          [
            "id": $0.id.uuidString,
            "data": $0.base64String,
            "mime_type": $0.mimeType,
          ]
        }
      }
      return params

    case .getConversations(let limit, let offset):
      return ["limit": limit, "offset": offset]

    case .getMessages(let conversationId, let limit, let offset):
      return ["conversation_id": conversationId.uuidString, "limit": limit, "offset": offset]

    // Assets
    case .listAssets(let type, let tags, let search, let limit, let offset):
      var params: Parameters = ["limit": limit, "offset": offset]
      if let type = type { params["type"] = type.rawValue }
      if let tags = tags { params["tags"] = tags.joined(separator: ",") }
      if let search = search { params["search"] = search }
      return params

    case .createAsset(let type, let name, let url, let tags):
      var params: Parameters = ["type": type.rawValue, "url": url]
      if let name = name { params["name"] = name }
      if let tags = tags { params["tags"] = tags }
      return params

    case .updateAsset(_, let name, let tags):
      var params: Parameters = [:]
      if let name = name { params["name"] = name }
      if let tags = tags { params["tags"] = tags }
      return params

    case .listPresets(let type, let category, let style, let limit, let offset):
      var params: Parameters = ["type": type.rawValue, "limit": limit, "offset": offset]
      if let category = category { params["category"] = category }
      if let style = style { params["style"] = style }
      return params

    // Shoot Room
    case .createSession(let name, let config):
      var params: Parameters = [:]
      if let name = name { params["name"] = name }
      if let config = config {
        if let data = try? JSONEncoder.api.encode(config),
          let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        {
          params["config"] = dict
        }
      }
      return params

    case .updateSession(_, let name, let config):
      var params: Parameters = [:]
      if let name = name { params["name"] = name }
      if let config = config {
        if let data = try? JSONEncoder.api.encode(config),
          let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        {
          params["config"] = dict
        }
      }
      return params

    case .generateFromShootRoom(let sessionId, let config, let count):
      var params: Parameters = ["count": count]
      if let sessionId = sessionId { params["session_id"] = sessionId.uuidString }
      if let data = try? JSONEncoder.api.encode(config),
        let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
      {
        params["config"] = dict
      }
      return params

    case .onboardBrand(let web, let ins, let video):
      return ["webLink": web, "insLink": ins, "videoUrl": video]

    default:
      return nil
    }
  }
}
