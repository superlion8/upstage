import Foundation

/// API Error types
enum APIError: LocalizedError {
    case unauthorized
    case forbidden
    case notFound
    case validationError(details: [String])
    case serverError(message: String)
    case networkError(underlying: Error)
    case decodingError(underlying: Error)
    case unknown
    
    var errorDescription: String? {
        switch self {
        case .unauthorized:
            return "请先登录"
        case .forbidden:
            return "没有权限执行此操作"
        case .notFound:
            return "请求的资源不存在"
        case .validationError(let details):
            return details.joined(separator: "\n")
        case .serverError(let message):
            return message
        case .networkError:
            return "网络连接失败，请检查网络设置"
        case .decodingError:
            return "数据解析失败"
        case .unknown:
            return "发生未知错误"
        }
    }
    
    static func from(statusCode: Int) -> APIError {
        switch statusCode {
        case 401:
            return .unauthorized
        case 403:
            return .forbidden
        case 404:
            return .notFound
        case 400...499:
            return .validationError(details: ["请求参数错误"])
        case 500...599:
            return .serverError(message: "服务器错误 (\(statusCode))")
        default:
            return .unknown
        }
    }
}

/// API Response wrapper
struct APIResponse<T: Decodable>: Decodable {
    let success: Bool
    let data: T?
    let error: String?
    let details: [String]?
}
