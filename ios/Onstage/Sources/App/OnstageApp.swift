import SwiftUI
import UIKit  // Added for semantic colors

@main
struct OnstageApp: App {
  @StateObject private var appState = AppState()

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(appState)
      // .preferredColorScheme(.dark) // Removed to follow system appearance
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
    case onboarding
    case assets
    case profile
  }

  init() {
    checkAuthStatus()
  }

  private func checkAuthStatus() {
    if KeychainManager.shared.getAuthToken() != nil {
      isAuthenticated = true
    }
  }

  func logout() {
    KeychainManager.shared.deleteAuthToken()
    isAuthenticated = false
    currentUser = nil
  }
}

// ============================================
// DESIGN SYSTEM
// ============================================

// MARK: - Theme

struct Theme {

  // MARK: - Colors

  struct Colors {
    // Backgrounds (Semantic)
    static let bg0 = Color(UIColor.systemBackground)
    static let bg1 = Color(UIColor.secondarySystemBackground)

    // Surfaces (Adaptive Transparent)
    static let surface1 = Color.primary.opacity(0.05)
    static let surface2 = Color.primary.opacity(0.08)
    static let border = Color.primary.opacity(0.12)

    // Text (Semantic)
    static let textPrimary = Color.primary
    static let textSecondary = Color.secondary
    static let textTertiary = Color(UIColor.tertiaryLabel)

    // Accent (Keep branding)
    static let accent = Color(hex: "8B5CF6")
    static let accentGradient = LinearGradient(
      colors: [Color(hex: "8B5CF6"), Color(hex: "EC4899")],
      startPoint: .leading,
      endPoint: .trailing
    )

    // Status
    static let success = Color(hex: "34D399")
    static let warning = Color(hex: "FBBF24")
    static let error = Color(hex: "F87171")
  }

  // MARK: - Typography

  struct Typography {
    static let title = Font.system(size: 24, weight: .semibold)
    static let section = Font.system(size: 18, weight: .semibold)
    static let body = Font.system(size: 16, weight: .regular)
    static let caption = Font.system(size: 12, weight: .medium)
  }

  // MARK: - Layout & Spacing

  struct Layout {
    // Spacing
    static let spacing: CGFloat = 8
    static let padding: CGFloat = 16
    static let sidePadding: CGFloat = 24

    // Heights
    static let buttonHeight: CGFloat = 48
    static let inputHeight: CGFloat = 48

    // Radius
    static let radiusCard: CGFloat = 16
    static let radiusPanel: CGFloat = 24
  }
}

extension Color {
  init(hex: String) {
    let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    var int: UInt64 = 0
    Scanner(string: hex).scanHexInt64(&int)
    let a: UInt64
    let r: UInt64
    let g: UInt64
    let b: UInt64
    switch hex.count {
    case 3:  // RGB (12-bit)
      (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
    case 6:  // RGB (24-bit)
      (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
    case 8:  // ARGB (32-bit)
      (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
    default:
      (a, r, g, b) = (1, 1, 1, 0)
    }

    self.init(
      .sRGB,
      red: Double(r) / 255,
      green: Double(g) / 255,
      blue: Double(b) / 255,
      opacity: Double(a) / 255
    )
  }
}

// MARK: - Components

struct GlassCard<Content: View>: View {
  let padding: CGFloat
  let content: Content

  init(padding: CGFloat = 16, @ViewBuilder content: () -> Content) {
    self.padding = padding
    self.content = content()
  }

  var body: some View {
    content
      .padding(padding)
      .background(Theme.Colors.surface1)  // Consider Material for true Glass?
      .overlay(
        RoundedRectangle(cornerRadius: Theme.Layout.radiusCard)
          .stroke(Theme.Colors.border, lineWidth: 1)
      )
      .cornerRadius(Theme.Layout.radiusCard)
  }
}

struct PrimaryButton: View {
  let title: String
  let icon: String?
  let action: () -> Void

  init(_ title: String, icon: String? = nil, action: @escaping () -> Void) {
    self.title = title
    self.icon = icon
    self.action = action
  }

  var body: some View {
    Button(action: action) {
      HStack(spacing: 8) {
        if let icon = icon {
          Image(systemName: icon)
        }
        Text(title)
          .font(Theme.Typography.section)
      }
      .foregroundColor(.white)
      .frame(maxWidth: .infinity)
      .frame(height: Theme.Layout.buttonHeight)
      .background(Theme.Colors.accent)
      .cornerRadius(16)
    }
  }
}

struct SecondaryButton: View {
  let title: String
  let icon: String?
  let action: () -> Void

  init(_ title: String, icon: String? = nil, action: @escaping () -> Void) {
    self.title = title
    self.icon = icon
    self.action = action
  }

  var body: some View {
    Button(action: action) {
      HStack(spacing: 8) {
        if let icon = icon {
          Image(systemName: icon)
        }
        Text(title)
          .font(Theme.Typography.section)
      }
      .foregroundColor(Theme.Colors.textPrimary)
      .frame(maxWidth: .infinity)
      .frame(height: Theme.Layout.buttonHeight)
      .background(Theme.Colors.surface2)
      .overlay(
        RoundedRectangle(cornerRadius: 16)
          .stroke(Theme.Colors.border, lineWidth: 1)
      )
      .cornerRadius(16)
    }
  }
}

struct GhostButton: View {
  let title: String
  let icon: String?
  let action: () -> Void

  init(_ title: String, icon: String? = nil, action: @escaping () -> Void) {
    self.title = title
    self.icon = icon
    self.action = action
  }

  var body: some View {
    Button(action: action) {
      HStack(spacing: 4) {
        if let icon = icon {
          Image(systemName: icon)
        }
        Text(title)
          .font(Theme.Typography.body)
      }
      .foregroundColor(Theme.Colors.textSecondary)
    }
  }
}

struct Chip: View {
  let title: String
  let isSelected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(Theme.Typography.caption)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(
          isSelected
            ? Theme.Colors.accent.opacity(0.15)
            : Theme.Colors.surface2
        )
        .overlay(
          Capsule()
            .stroke(
              isSelected ? Theme.Colors.accent.opacity(0.5) : Theme.Colors.border,
              lineWidth: 1
            )
        )
        .foregroundColor(isSelected ? Theme.Colors.accent : Theme.Colors.textSecondary)
        .clipShape(Capsule())
    }
  }
}

struct AppInput: View {
  @Binding var text: String
  let placeholder: String
  let icon: String?
  var onCommit: (() -> Void)? = nil

  var body: some View {
    HStack(spacing: 12) {
      if let icon = icon {
        Image(systemName: icon)
          .foregroundColor(Theme.Colors.textTertiary)
          .font(.system(size: 20))
      }

      TextField(text: $text) {
        Text(placeholder)
          .foregroundColor(Theme.Colors.textTertiary)
      }
      .font(Theme.Typography.body)
      .foregroundColor(Theme.Colors.textPrimary)
      .submitLabel(.send)
      .onSubmit {
        onCommit?()
      }
    }
    .padding(.horizontal, 16)
    .frame(height: Theme.Layout.inputHeight)
    .background(Theme.Colors.surface2)
    .overlay(
      RoundedRectangle(cornerRadius: Theme.Layout.radiusPanel)
        .stroke(Theme.Colors.border, lineWidth: 1)
    )
    .cornerRadius(Theme.Layout.radiusPanel)
  }
}
