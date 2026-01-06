import Foundation

/// User entity
struct User: Identifiable, Codable, Equatable {
    let id: UUID
    let email: String
    var name: String?
    var avatarUrl: String?
    let role: UserRole
    var quotaTotal: Int
    var quotaUsed: Int
    var quotaResetAt: Date?
    let createdAt: Date
    
    enum UserRole: String, Codable {
        case user
        case admin
    }
    
    var quotaRemaining: Int {
        max(0, quotaTotal - quotaUsed)
    }
    
    var quotaPercentUsed: Double {
        guard quotaTotal > 0 else { return 0 }
        return Double(quotaUsed) / Double(quotaTotal)
    }
}

/// Auth response from server
struct AuthResponse: Codable {
    let success: Bool
    let user: User?
    let token: String?
    let error: String?
}



