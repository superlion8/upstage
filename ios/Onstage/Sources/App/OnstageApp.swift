import SwiftUI

@main
struct OnstageApp: App {
    @StateObject private var appState = AppState()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(appState)
        }
    }
}

/// Global application state
class AppState: ObservableObject {
    @Published var isAuthenticated: Bool = false
    @Published var currentUser: User?
    @Published var selectedTab: Tab = .chat
    
    enum Tab {
        case chat
        case shootRoom
        case assets
        case profile
    }
    
    init() {
        // Check for existing auth token
        checkAuthStatus()
    }
    
    private func checkAuthStatus() {
        if KeychainManager.shared.getAuthToken() != nil {
            isAuthenticated = true
            // TODO: Validate token and fetch user
        }
    }
    
    func logout() {
        KeychainManager.shared.deleteAuthToken()
        isAuthenticated = false
        currentUser = nil
    }
}


