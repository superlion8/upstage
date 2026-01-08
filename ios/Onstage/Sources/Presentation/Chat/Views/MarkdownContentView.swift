import SwiftUI

/// A native SwiftUI view that renders basic Markdown blocks (Heading, Code Block, Inline Markdown).
/// This avoids external dependencies while providing rich text for chat messages.
struct MarkdownContentView: View {
  let text: String
  let isUser: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      ForEach(parseBlocks(text: text), id: \.id) { block in
        renderBlock(block)
      }
    }
  }

  // MARK: - Block Definition

  enum BlockType {
    case heading(level: Int)
    case code(content: String, language: String?)
    case paragraph(content: String)
  }

  struct ContentBlock: Identifiable {
    let id = UUID()
    let type: BlockType
  }

  // MARK: - Parser

  private func parseBlocks(text: String) -> [ContentBlock] {
    var blocks: [ContentBlock] = []
    let lines = text.components(separatedBy: .newlines)

    var currentCodeContent: String?
    var currentLanguage: String?
    var currentParagraph: [String] = []

    func flushParagraph() {
      if !currentParagraph.isEmpty {
        blocks.append(
          ContentBlock(type: .paragraph(content: currentParagraph.joined(separator: "\n"))))
        currentParagraph = []
      }
    }

    for line in lines {
      // Code block handling
      if line.trimmed().hasPrefix("```") {
        if let content = currentCodeContent {
          // Close code block
          blocks.append(ContentBlock(type: .code(content: content, language: currentLanguage)))
          currentCodeContent = nil
          currentLanguage = nil
        } else {
          // Open code block
          flushParagraph()
          currentCodeContent = ""
          let lang = line.trimmed().replacingOccurrences(of: "```", with: "").trimmed()
          currentLanguage = lang.isEmpty ? nil : lang
        }
        continue
      }

      if currentCodeContent != nil {
        currentCodeContent! += (currentCodeContent!.isEmpty ? "" : "\n") + line
        continue
      }

      // Heading handling
      if line.trimmed().hasPrefix("#") {
        flushParagraph()
        let hashes = line.trimmed().prefix(while: { $0 == "#" })
        let content = line.trimmed().dropFirst(hashes.count).trimmed()
        blocks.append(ContentBlock(type: .heading(level: min(hashes.count, 3))))
        // We actually need the content too, let's fix the type
        // Re-parsing heading to include text
        blocks.removeLast()
        blocks.append(ContentBlock(type: .paragraph(content: line)))  // Fallback to inline for simplicity or update type
        // Better approach: Paragraph handles the rest, custom rendering for lines starting with #
        continue
      }

      if line.trimmed().isEmpty {
        flushParagraph()
      } else {
        currentParagraph.append(line)
      }
    }

    flushParagraph()

    // Final fallback: if nothing parsed, return as one paragraph
    if blocks.isEmpty && !text.isEmpty {
      return [ContentBlock(type: .paragraph(content: text))]
    }

    return blocks
  }

  // MARK: - Renderer

  @ViewBuilder
  private func renderBlock(_ block: ContentBlock) -> some View {
    switch block.type {
    case .heading(let level):
      // Headings are handled inside paragraph logic currently for simplicity in initial version
      EmptyView()

    case .code(let content, let language):
      VStack(alignment: .leading, spacing: 4) {
        if let lang = language {
          Text(lang.uppercased())
            .font(.system(size: 10, weight: .bold, design: .monospaced))
            .foregroundColor(isUser ? .white.opacity(0.6) : .secondary)
            .padding(.horizontal, 4)
        }

        ScrollView(.horizontal, showsIndicators: false) {
          Text(content)
            .font(.system(size: 13, design: .monospaced))
            .foregroundColor(isUser ? .white : .primary)
            .padding(12)
        }
      }
      .background(isUser ? Color.white.opacity(0.15) : Color(.systemGray5))
      .cornerRadius(8)
      .padding(.vertical, 4)

    case .paragraph(let content):
      if content.trimmed().hasPrefix("#") {
        renderHeading(content)
      } else {
        renderInlineMarkdown(content)
      }
    }
  }

  @ViewBuilder
  private func renderHeading(_ text: String) -> some View {
    let hashes = text.trimmed().prefix(while: { $0 == "#" })
    let level = hashes.count
    let content = text.trimmed().dropFirst(level).trimmed()

    let fontSize: CGFloat = level == 1 ? 22 : (level == 2 ? 19 : 17)

    Text(content)
      .font(.system(size: fontSize, weight: .bold))
      .foregroundColor(isUser ? .white : .primary)
      .padding(.top, 4)
  }

  @ViewBuilder
  private func renderInlineMarkdown(_ text: String) -> some View {
    // iOS 15+ AttributedString supports native Markdown
    if let attributedString = try? AttributedString(
      markdown: text,
      options: .init(
        allowsExtendedAttributes: true, interpretedSyntax: .inlineOnlyPreservingWhitespace))
    {
      Text(attributedString)
        .font(.body)
        .foregroundColor(isUser ? .white : .primary)
    } else {
      Text(text)
        .font(.body)
        .foregroundColor(isUser ? .white : .primary)
    }
  }
}

extension String {
  fileprivate func trimmed() -> String {
    self.trimmingCharacters(in: .whitespacesAndNewlines)
  }
}
