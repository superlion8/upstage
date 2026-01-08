import SwiftUI

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
      .background(Theme.Colors.surface1)
      .overlay(
        RoundedRectangle(cornerRadius: Theme.Layout.radiusCard)
          .stroke(Theme.Colors.border, lineWidth: 1)
      )
      .cornerRadius(Theme.Layout.radiusCard)
  }
}
