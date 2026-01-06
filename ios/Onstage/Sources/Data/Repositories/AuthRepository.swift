import Foundation

/// Auth repository for authentication operations
final class AuthRepository {
    static let shared = AuthRepository()
    
    private let apiClient = APIClient.shared
    private let keychainManager = KeychainManager.shared
    
    private init() {}
    
    // MARK: - Register
    
    func register(email: String, password: String, name: String?) async throws -> User {
        let response = try await apiClient.request(
            .register(email: email, password: password, name: name),
            responseType: AuthResponse.self
        )
        
        guard response.success, let user = response.user, let token = response.token else {
            throw APIError.serverError(message: response.error ?? "注册失败")
        }
        
        // Save token
        keychainManager.saveAuthToken(token)
        keychainManager.saveUserId(user.id.uuidString)
        
        return user
    }
    
    // MARK: - Login
    
    func login(email: String, password: String) async throws -> User {
        let response = try await apiClient.request(
            .login(email: email, password: password),
            responseType: AuthResponse.self
        )
        
        guard response.success, let user = response.user, let token = response.token else {
            throw APIError.serverError(message: response.error ?? "登录失败")
        }
        
        // Save token
        keychainManager.saveAuthToken(token)
        keychainManager.saveUserId(user.id.uuidString)
        
        return user
    }
    
    // MARK: - Get Current User
    
    func getCurrentUser() async throws -> User {
        struct Response: Decodable {
            let success: Bool
            let user: User
        }
        
        let response = try await apiClient.request(
            .getMe,
            responseType: Response.self
        )
        
        return response.user
    }
    
    // MARK: - Update Profile
    
    func updateProfile(name: String?, avatarUrl: String?) async throws -> User {
        struct Response: Decodable {
            let success: Bool
            let user: User
        }
        
        let response = try await apiClient.request(
            .updateProfile(name: name, avatarUrl: avatarUrl),
            responseType: Response.self
        )
        
        return response.user
    }
    
    // MARK: - Refresh Token
    
    func refreshToken() async throws -> String {
        struct Response: Decodable {
            let success: Bool
            let token: String
        }
        
        let response = try await apiClient.request(
            .refreshToken,
            responseType: Response.self
        )
        
        keychainManager.saveAuthToken(response.token)
        
        return response.token
    }
    
    // MARK: - Logout
    
    func logout() {
        keychainManager.clearAll()
    }
    
    // MARK: - Check Auth Status
    
    var isAuthenticated: Bool {
        keychainManager.getAuthToken() != nil
    }
}



