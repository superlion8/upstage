import SwiftUI

// MARK: - Design System Theme

struct Theme {

  // MARK: - Colors

  struct Colors {
    // Backgrounds
    static let bg0 = Color(hex: "0B0B0D")
    static let bg1 = Color(hex: "101014")

    // Surfaces (White with Alpha)
    static let surface1 = Color.white.opacity(0.06)
    static let surface2 = Color.white.opacity(0.10)
    static let border = Color.white.opacity(0.08)

    // Text
    static let textPrimary = Color.white
    static let textSecondary = Color.white.opacity(0.65)
    static let textTertiary = Color.white.opacity(0.45)

    // Accent
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

// MARK: - Extensions

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
