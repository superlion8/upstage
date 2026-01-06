import SwiftUI

struct ContentView: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        Group {
            if appState.isAuthenticated {
                MainTabView()
            } else {
                AuthView()
            }
        }
    }
}

struct MainTabView: View {
    @EnvironmentObject var appState: AppState
    
    var body: some View {
        TabView(selection: $appState.selectedTab) {
            ChatView()
                .tabItem {
                    Label("对话", systemImage: "bubble.left.and.bubble.right")
                }
                .tag(AppState.Tab.chat)
            
            ShootRoomView()
                .tabItem {
                    Label("拍摄室", systemImage: "camera.viewfinder")
                }
                .tag(AppState.Tab.shootRoom)
            
            AssetsView()
                .tabItem {
                    Label("素材库", systemImage: "photo.on.rectangle.angled")
                }
                .tag(AppState.Tab.assets)
            
            ProfileView()
                .tabItem {
                    Label("我的", systemImage: "person.circle")
                }
                .tag(AppState.Tab.profile)
        }
        .tint(Color.accentColor)
    }
}

#Preview {
    ContentView()
        .environmentObject(AppState())
}


