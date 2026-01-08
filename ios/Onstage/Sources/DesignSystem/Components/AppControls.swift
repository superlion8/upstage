import SwiftUI

struct Chip: View {
  let title: String
  let isSelected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(Theme.Typography.caption)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)  // Compact
        .background(
          isSelected
            ? Theme.Colors.accent.opacity(0.20)
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
          .font(.system(size: 20))  // Icon size
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
    .frame(height: Theme.Layout.inputHeight)  // 48-56
    .background(Theme.Colors.surface2)
    .overlay(
      RoundedRectangle(cornerRadius: Theme.Layout.radiusPanel)  // 24 for inputs usually
        .stroke(Theme.Colors.border, lineWidth: 1)
    )
    .cornerRadius(Theme.Layout.radiusPanel)
  }
}
