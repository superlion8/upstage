import MarkdownUI
import SwiftUI

extension Theme {
  static func messageTheme(isUser: Bool) -> Theme {
    Theme()
      .text {
        ForegroundColor(isUser ? .white : .primary)
        FontSize(16)
      }
      .link {
        ForegroundColor(isUser ? .white.opacity(0.8) : .accentColor)
        UnderlineStyle(.single)
      }
      .strong {
        FontWeight(.bold)
      }
      .emphasis {
        FontStyle(.italic)
      }
      .heading1 {
        FontSize(24)
        FontWeight(.bold)
        Padding(.vertical, 8)
      }
      .heading2 {
        FontSize(20)
        FontWeight(.bold)
        Padding(.vertical, 6)
      }
      .heading3 {
        FontSize(18)
        FontWeight(.bold)
        Padding(.vertical, 4)
      }
      .code {
        FontFamilyVariant(.monospaced)
        FontSize(14)
        BackgroundColor(isUser ? .white.opacity(0.2) : .gray.opacity(0.1))
      }
      .codeBlock { configuration in
        ScrollView(.horizontal) {
          configuration.label
            .fixedSize(horizontal: false, vertical: true)
            .relativeLineSpacing(.em(0.25))
            .markdownTextStyle {
              FontFamilyVariant(.monospaced)
              FontSize(13)
            }
            .padding(12)
        }
        .background(isUser ? Color.white.opacity(0.1) : Color(.systemGray5))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .markdownMargin(top: .em(0.8), bottom: .em(0.8))
      }
      .listItem { configuration in
        configuration.label
          .markdownMargin(top: .em(0.2))
      }
  }
}
