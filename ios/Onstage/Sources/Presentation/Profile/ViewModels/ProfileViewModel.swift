import SwiftUI

/// Profile view model
@MainActor
final class ProfileViewModel: ObservableObject {
    @Published var user: User?
    @Published var isLoading = false
    @Published var error: String?
    
    private let authRepository = AuthRepository.shared
    
    func loadUser() async {
        isLoading = true
        
        do {
            user = try await authRepository.getCurrentUser()
        } catch {
            self.error = error.localizedDescription
        }
        
        isLoading = false
    }
}



