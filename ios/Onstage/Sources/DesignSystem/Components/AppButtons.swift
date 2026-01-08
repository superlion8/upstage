import SwiftUI

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
      .background(Theme.Colors.accent)  // Or accentGradient
      // .background(Theme.Colors.accentGradient) // Optional Gradient
      .cornerRadius(16)  // Doc says 12/16, using 16 to match card radius for consistency? Or 12 for distinct button feel. Let's use 16.
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
          .font(Theme.Typography.body)  // Smaller than main buttons
      }
      .foregroundColor(Theme.Colors.textSecondary)
    }
  }
}
