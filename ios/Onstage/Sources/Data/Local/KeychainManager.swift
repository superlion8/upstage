import Foundation
import Security

/// Keychain manager for secure storage using iOS Security framework
final class KeychainManager {
    static let shared = KeychainManager()
    
    private let service = "app.onstage.ios"
    
    private enum Keys {
        static let authToken = "auth_token"
        static let refreshToken = "refresh_token"
        static let userId = "user_id"
    }
    
    private init() {}
    
    // MARK: - Generic Keychain Operations
    
    private func save(_ value: String, forKey key: String) {
        guard let data = value.data(using: .utf8) else { return }
        
        // Delete existing item first
        delete(forKey: key)
        
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
        
        SecItemAdd(query as CFDictionary, nil)
    }
    
    private func get(forKey key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        
        guard status == errSecSuccess,
              let data = result as? Data,
              let string = String(data: data, encoding: .utf8) else {
            return nil
        }
        
        return string
    }
    
    private func delete(forKey key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        
        SecItemDelete(query as CFDictionary)
    }
    
    // MARK: - Auth Token
    
    func saveAuthToken(_ token: String) {
        save(token, forKey: Keys.authToken)
    }
    
    func getAuthToken() -> String? {
        get(forKey: Keys.authToken)
    }
    
    func deleteAuthToken() {
        delete(forKey: Keys.authToken)
    }
    
    // MARK: - Refresh Token
    
    func saveRefreshToken(_ token: String) {
        save(token, forKey: Keys.refreshToken)
    }
    
    func getRefreshToken() -> String? {
        get(forKey: Keys.refreshToken)
    }
    
    func deleteRefreshToken() {
        delete(forKey: Keys.refreshToken)
    }
    
    // MARK: - User ID
    
    func saveUserId(_ id: String) {
        save(id, forKey: Keys.userId)
    }
    
    func getUserId() -> String? {
        get(forKey: Keys.userId)
    }
    
    func deleteUserId() {
        delete(forKey: Keys.userId)
    }
    
    // MARK: - Clear All
    
    func clearAll() {
        deleteAuthToken()
        deleteRefreshToken()
        deleteUserId()
    }
}
