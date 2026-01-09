import SwiftUI

// MARK: - Thinking Block View (DeepSeek Style)

struct ThinkingBlockView: View {
  @Binding var block: ThinkingBlock

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      // Header Row (Always visible)
      Button {
        if block.status != .running {
          withAnimation(.spring(response: 0.3)) {
            block.isExpanded.toggle()
            if block.isExpanded { block.pinnedOpen = true }
          }
        }
      } label: {
        HStack(spacing: 8) {
          // Left indicator dot
          Circle()
            .fill(block.status == .running ? Theme.Colors.accent : Theme.Colors.textTertiary)
            .frame(width: 6, height: 6)

          // Title
          if block.status == .running {
            Text("Thinking...")
              .font(Theme.Typography.caption)
              .foregroundColor(Theme.Colors.textSecondary)

            ProgressView()
              .scaleEffect(0.6)
          } else {
            Text("Thought for \(formatDuration(block.duration))")
              .font(Theme.Typography.caption)
              .foregroundColor(Theme.Colors.textTertiary)
          }

          Spacer()

          // Chevron (only when done)
          if block.status != .running {
            Image(systemName: "chevron.right")
              .font(.caption2)
              .foregroundColor(Theme.Colors.textTertiary)
              .rotationEffect(.degrees(block.isExpanded ? 90 : 0))
          }
        }
        .padding(.vertical, 8)
      }
      .buttonStyle(.plain)

      // Content (Expandable)
      if block.isExpanded && !block.content.isEmpty {
        VStack(alignment: .leading, spacing: 4) {
          // Render as bullet list
          ForEach(block.content.components(separatedBy: "\n").filter { !$0.isEmpty }, id: \.self) {
            line in
            HStack(alignment: .top, spacing: 8) {
              Text("•")
                .foregroundColor(Theme.Colors.textTertiary)
              Text(line.trimmingCharacters(in: .whitespaces))
                .font(Theme.Typography.body)
                .foregroundColor(Theme.Colors.textSecondary)
            }
          }
        }
        .padding(.leading, 14)  // Align with dot
        .padding(.bottom, 8)
        .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
    .padding(.horizontal, 12)
    .background(
      // Left border (DeepSeek style)
      HStack {
        Rectangle()
          .fill(Theme.Colors.accent.opacity(0.3))
          .frame(width: 2)
        Spacer()
      }
    )
    .background(Theme.Colors.surface1.opacity(0.5))
    .cornerRadius(8)
  }

  private func formatDuration(_ duration: TimeInterval?) -> String {
    guard let d = duration else { return "0s" }
    if d < 1 { return String(format: "%.1fs", d) }
    return "\(Int(d))s"
  }
}

// MARK: - Tool Block View (Cursor Style)

struct ToolBlockView: View {
  @Binding var block: ToolBlock
  @State private var showInputs = false

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      // Header Row
      Button {
        if block.status != .running {
          withAnimation(.spring(response: 0.3)) {
            block.isExpanded.toggle()
            if block.isExpanded { block.pinnedOpen = true }
          }
        }
      } label: {
        HStack(spacing: 8) {
          // Status Icon
          statusIcon

          // Title
          Text("Tool · \(block.displayName)")
            .font(Theme.Typography.body)
            .foregroundColor(Theme.Colors.textPrimary)

          Spacer()

          // Status Badge
          statusBadge

          // Chevron (only when done)
          if block.status != .running {
            Image(systemName: "chevron.right")
              .font(.caption)
              .foregroundColor(Theme.Colors.textTertiary)
              .rotationEffect(.degrees(block.isExpanded ? 90 : 0))
          }
        }
        .padding(12)
      }
      .buttonStyle(.plain)

      // Summary (Collapsed only)
      if !block.isExpanded, let summary = block.summary {
        Text(summary)
          .font(Theme.Typography.caption)
          .foregroundColor(Theme.Colors.textSecondary)
          .padding(.horizontal, 12)
          .padding(.bottom, 8)
      }

      // Expanded Content
      if block.isExpanded {
        VStack(alignment: .leading, spacing: 12) {
          Divider()
            .overlay(Theme.Colors.border)

          // Inputs Section (Collapsible)
          if let inputs = block.inputs, !inputs.isEmpty {
            DisclosureGroup("Inputs", isExpanded: $showInputs) {
              Text(inputs)
                .font(.system(.caption, design: .monospaced))
                .foregroundColor(Theme.Colors.textSecondary)
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.Colors.bg1)
                .cornerRadius(6)
            }
            .font(Theme.Typography.caption)
            .foregroundColor(Theme.Colors.textTertiary)
          }

          // Logs Section
          if !block.logs.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
              HStack {
                Label("Logs", systemImage: "terminal")
                  .font(Theme.Typography.caption)
                  .foregroundColor(Theme.Colors.textTertiary)
                Spacer()
                Text("Last \(block.logs.count) lines")
                  .font(.caption2)
                  .foregroundColor(Theme.Colors.textTertiary)
              }

              ScrollView {
                VStack(alignment: .leading, spacing: 2) {
                  ForEach(block.logs.indices, id: \.self) { i in
                    Text(block.logs[i])
                      .font(.system(.caption2, design: .monospaced))
                      .foregroundColor(Theme.Colors.textSecondary)
                  }
                }
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
              }
              .frame(maxHeight: 120)
              .background(Theme.Colors.bg0)
              .cornerRadius(6)
            }
          }

          // Outputs Section (Images)
          if !block.outputs.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
              Label("Outputs", systemImage: "photo.stack")
                .font(Theme.Typography.caption)
                .foregroundColor(Theme.Colors.textTertiary)

              ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                  ForEach(block.outputs) { image in
                    AsyncImage(url: URL(string: image.thumbnailUrl ?? image.fullURL)) { phase in
                      switch phase {
                      case .success(let img):
                        img
                          .resizable()
                          .aspectRatio(contentMode: .fill)
                          .frame(width: 80, height: 80)
                          .clipShape(RoundedRectangle(cornerRadius: 8))
                      default:
                        RoundedRectangle(cornerRadius: 8)
                          .fill(Theme.Colors.surface2)
                          .frame(width: 80, height: 80)
                          .overlay(ProgressView())
                      }
                    }
                  }
                }
              }
            }
          }
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 12)
        .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
    .background(Theme.Colors.surface1)
    .cornerRadius(Theme.Layout.radiusCard)
    .overlay(
      RoundedRectangle(cornerRadius: Theme.Layout.radiusCard)
        .stroke(Theme.Colors.border, lineWidth: 1)
    )
  }

  @ViewBuilder
  private var statusIcon: some View {
    switch block.status {
    case .running:
      ProgressView()
        .scaleEffect(0.7)
    case .done:
      Image(systemName: "checkmark.circle.fill")
        .foregroundColor(Theme.Colors.success)
    case .failed:
      Image(systemName: "xmark.circle.fill")
        .foregroundColor(Theme.Colors.error)
    }
  }

  @ViewBuilder
  private var statusBadge: some View {
    switch block.status {
    case .running:
      Text("Running...")
        .font(.caption2)
        .foregroundColor(Theme.Colors.accent)
    case .done:
      if let d = block.duration {
        Text("\(Int(d))s")
          .font(.caption2)
          .foregroundColor(Theme.Colors.success)
      }
    case .failed:
      Text("Failed")
        .font(.caption2)
        .foregroundColor(Theme.Colors.error)
    }
  }
}

// MARK: - Block Renderer (Dispatches to correct view)

struct BlockRenderer: View {
  @Binding var block: ChatBlock

  var body: some View {
    switch block {
    case .userMessage(let userBlock):
      UserMessageBubble(block: userBlock)
    case .assistantMessage(let assistantBlock):
      AssistantMessageBubble(
        block: Binding(
          get: { assistantBlock },
          set: {
            if case .assistantMessage = block {
              block = .assistantMessage($0)
            }
          }
        ))
    case .thinking(var thinkingBlock):
      ThinkingBlockView(
        block: Binding(
          get: { thinkingBlock },
          set: {
            thinkingBlock = $0
            block = .thinking($0)
          }
        ))
    case .tool(var toolBlock):
      ToolBlockView(
        block: Binding(
          get: { toolBlock },
          set: {
            toolBlock = $0
            block = .tool($0)
          }
        ))
    }
  }
}

// MARK: - User Message Bubble

struct UserMessageBubble: View {
  let block: UserMessageBlock

  var body: some View {
    HStack {
      Spacer()
      VStack(alignment: .trailing, spacing: 8) {
        // Images
        if let images = block.images, !images.isEmpty {
          HStack(spacing: 8) {
            ForEach(images) { image in
              if let uiImage = UIImage(data: image.data) {
                Image(uiImage: uiImage)
                  .resizable()
                  .aspectRatio(contentMode: .fill)
                  .frame(width: 80, height: 80)
                  .clipShape(RoundedRectangle(cornerRadius: 12))
              }
            }
          }
        }

        // Text
        if let text = block.text, !text.isEmpty {
          Text(text)
            .font(Theme.Typography.body)
            .foregroundColor(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Theme.Colors.accent)
            .cornerRadius(20)
        }
      }
    }
  }
}

// MARK: - Assistant Message Bubble

struct AssistantMessageBubble: View {
  @Binding var block: AssistantMessageBlock

  var body: some View {
    HStack {
      VStack(alignment: .leading, spacing: 8) {
        // Text content
        if !block.text.isEmpty {
          Text(block.text)
            .font(Theme.Typography.body)
            .foregroundColor(Theme.Colors.textPrimary)
            .textSelection(.enabled)
        }

        // Generated images
        if let images = block.generatedImages, !images.isEmpty {
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
              ForEach(images) { image in
                AsyncImage(url: URL(string: image.thumbnailUrl ?? image.fullURL)) { phase in
                  switch phase {
                  case .success(let img):
                    img
                      .resizable()
                      .aspectRatio(contentMode: .fill)
                      .frame(width: 120, height: 120)
                      .clipShape(RoundedRectangle(cornerRadius: 12))
                  default:
                    RoundedRectangle(cornerRadius: 12)
                      .fill(Theme.Colors.surface2)
                      .frame(width: 120, height: 120)
                      .overlay(ProgressView())
                  }
                }
              }
            }
          }
        }

        // Loading indicator for running state
        if block.status == .running && block.text.isEmpty {
          HStack(spacing: 4) {
            ProgressView()
              .scaleEffect(0.7)
            Text("Generating...")
              .font(Theme.Typography.caption)
              .foregroundColor(Theme.Colors.textTertiary)
          }
        }
      }
      Spacer()
    }
  }
}
