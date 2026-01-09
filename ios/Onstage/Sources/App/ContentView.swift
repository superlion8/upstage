import SwiftUI

struct ContentView: View {
  @EnvironmentObject var appState: AppState
  @State private var showHome = false

  var body: some View {
    Group {
      if appState.isAuthenticated {
        // Chat is the default landing page
        ChatView(onShowHome: { showHome = true })
          .fullScreenCover(isPresented: $showHome) {
            HomeView()
              .environmentObject(appState)
          }
      } else {
        AuthView()
      }
    }
  }
}

// MARK: - Home View (Menu Page with Tab Features)

struct HomeView: View {
  @Environment(\.dismiss) private var dismiss
  @EnvironmentObject var appState: AppState

  let menuItems: [MenuItem] = [
    MenuItem(
      title: "拍摄室", subtitle: "AI 模特拍摄", icon: "camera.viewfinder", color: .purple, tab: .shootRoom),
    MenuItem(title: "品牌引导", subtitle: "打造品牌形象", icon: "sparkles", color: .orange, tab: .onboarding),
    MenuItem(
      title: "素材库", subtitle: "管理所有素材", icon: "photo.on.rectangle.angled", color: .blue,
      tab: .assets),
    MenuItem(title: "我的", subtitle: "账户与设置", icon: "person.circle", color: .gray, tab: .profile),
  ]

  var body: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 24) {
          // Header
          VStack(spacing: 8) {
            Text("UpStage")
              .font(.largeTitle.bold())
            Text("AI 时尚工作室")
              .font(Theme.Typography.body)
              .foregroundColor(Theme.Colors.textSecondary)
          }
          .padding(.top, 40)

          // Menu Grid
          LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 16) {
            ForEach(menuItems) { item in
              NavigationLink(destination: destinationView(for: item.tab)) {
                MenuCard(item: item)
              }
            }
          }
          .padding(.horizontal, 20)

          Spacer(minLength: 100)
        }
      }
      .background(Theme.Colors.bg0)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarLeading) {
          Button {
            dismiss()
          } label: {
            HStack(spacing: 4) {
              Image(systemName: "bubble.left.and.bubble.right.fill")
              Text("对话")
            }
            .font(.headline)
            .foregroundColor(Theme.Colors.accent)
          }
        }
      }
    }
  }

  @ViewBuilder
  private func destinationView(for tab: AppState.Tab) -> some View {
    switch tab {
    case .shootRoom:
      ShootRoomView()
    case .onboarding:
      BrandOnboardingView()
    case .assets:
      AssetsView()
    case .profile:
      ProfileView()
    default:
      EmptyView()
    }
  }
}

// MARK: - Menu Item Model

struct MenuItem: Identifiable {
  let id = UUID()
  let title: String
  let subtitle: String
  let icon: String
  let color: Color
  let tab: AppState.Tab
}

// MARK: - Menu Card View

struct MenuCard: View {
  let item: MenuItem

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      // Icon
      ZStack {
        Circle()
          .fill(item.color.opacity(0.15))
          .frame(width: 48, height: 48)
        Image(systemName: item.icon)
          .font(.system(size: 22))
          .foregroundColor(item.color)
      }

      // Text
      VStack(alignment: .leading, spacing: 4) {
        Text(item.title)
          .font(.headline)
          .foregroundColor(Theme.Colors.textPrimary)
        Text(item.subtitle)
          .font(.caption)
          .foregroundColor(Theme.Colors.textSecondary)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(16)
    .background(Theme.Colors.surface1)
    .clipShape(RoundedRectangle(cornerRadius: 16))
  }
}

#Preview {
  ContentView()
    .environmentObject(AppState())
}
