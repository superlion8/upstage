import SwiftUI

// MARK: - Main Timeline Container

struct AgentTimelineView: View {
  @Binding var steps: [AgentStep]
  @State private var isExpanded: Bool = true  // Global expansion for the timeline strip

  // Computed properties for summary
  private var toolCount: Int { steps.filter { $0.type == .toolCall }.count }
  private var imageCount: Int {
    steps.reduce(0) { count, step in
      count + (step.result?.hasImages == true ? 1 : 0)
    }
  }

  var body: some View {
    VStack(spacing: 0) {
      // Global Header (Always visible)
      TimelineHeader(
        stepCount: steps.count,
        toolCount: toolCount,
        imageCount: imageCount,
        isExpanded: $isExpanded
      )

      // List of Steps (Collapsible)
      if isExpanded {
        VStack(spacing: 8) {
          ForEach($steps) { $step in
            StepCard(step: $step)
          }
        }
        .padding(.top, 8)
      }
    }
    .padding(Theme.Layout.padding)
    .background(Theme.Colors.surface1)
    .cornerRadius(Theme.Layout.radiusCard)
    .overlay(
      RoundedRectangle(cornerRadius: Theme.Layout.radiusCard)
        .stroke(Theme.Colors.border, lineWidth: 1)
    )
  }
}

// MARK: - Timeline Header

struct TimelineHeader: View {
  let stepCount: Int
  let toolCount: Int
  let imageCount: Int
  @Binding var isExpanded: Bool

  var body: some View {
    Button {
      withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
        isExpanded.toggle()
      }
    } label: {
      HStack(spacing: 6) {
        // Icon (Animated if running)
        Image(systemName: "list.bullet.rectangle.portrait")
          .foregroundColor(Theme.Colors.textSecondary)

        // Summary Text
        Text("Steps · \(stepCount) steps")
          .font(Theme.Typography.caption)
          .foregroundColor(Theme.Colors.textSecondary)

        if toolCount > 0 {
          Text("· \(toolCount) tools")
            .font(Theme.Typography.caption)
            .foregroundColor(Theme.Colors.textSecondary)
        }

        if imageCount > 0 {
          Text("· \(imageCount) images")
            .font(Theme.Typography.caption)
            .foregroundColor(Theme.Colors.textSecondary)
        }

        Spacer()

        // Chevron
        Image(systemName: "chevron.right")
          .font(.caption)
          .foregroundColor(Theme.Colors.textTertiary)
          .rotationEffect(.degrees(isExpanded ? 90 : 0))
      }
      .contentShape(Rectangle())  // Hit test entire row
    }
  }
}

// MARK: - Step Card

struct StepCard: View {
  @Binding var step: AgentStep

  var body: some View {
    VStack(spacing: 0) {
      // 1. Header Row (Always visible)
      Button {
        withAnimation(.spring(response: 0.3)) {
          step.isExpanded?.toggle()
        }
      } label: {
        HStack(spacing: 12) {
          // Status Icon
          StatusIcon(status: step.status)

          // Title
          Text(formatTitle(step))
            .font(Theme.Typography.body)
            .foregroundColor(Theme.Colors.textPrimary)
            .lineLimit(1)

          Spacer()

          // Summary (Collapsed only)
          if !(step.isExpanded ?? false), let result = step.result?.message {
            Text(result)
              .font(Theme.Typography.caption)
              .foregroundColor(Theme.Colors.textTertiary)
              .lineLimit(1)
          }

          // Duration or Chevron
          if step.status == .running {
            ProgressView()
              .scaleEffect(0.7)
          } else {
            Image(systemName: "chevron.right")
              .font(.caption)
              .foregroundColor(Theme.Colors.textTertiary)
              .rotationEffect(.degrees((step.isExpanded ?? false) ? 90 : 0))
          }
        }
        .padding(12)
        .background(
          (step.isExpanded ?? false) ? Theme.Colors.surface2 : Color.clear
        )
        .cornerRadius(8)
      }

      // 2. Expanded Detail
      if step.isExpanded ?? false {
        StepDetailView(step: step)
          .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
    .background(Theme.Colors.bg0.opacity(0.3))  // Slight tint for card
    .cornerRadius(8)
    .overlay(
      RoundedRectangle(cornerRadius: 8)
        .stroke(Theme.Colors.border, lineWidth: 1)
    )
  }

  private func formatTitle(_ step: AgentStep) -> String {
    if let tool = step.tool {
      // Human readable titles
      if tool.contains("image") { return "Generate Image" }
      if tool.contains("search") { return "Search Web" }
      if tool.contains("scrape") { return "Read Website" }
      return tool.replacingOccurrences(of: "_", with: " ").capitalized
    }
    return step.type == .thinking ? "Thinking" : "Processing"
  }
}

// MARK: - Step Detail

struct StepDetailView: View {
  let step: AgentStep

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Divider()
        .overlay(Theme.Colors.border)

      // 1. Description ("What I'm doing")
      if let desc = step.description {
        Text(desc)
          .font(Theme.Typography.body)
          .foregroundColor(Theme.Colors.textSecondary)
      }

      // 2. Input (Arguments)
      if let args = step.arguments, !args.isEmpty {
        VStack(alignment: .leading, spacing: 4) {
          Label("Input", systemImage: "arrow.right.circle")
            .font(Theme.Typography.caption)
            .foregroundColor(Theme.Colors.textTertiary)

          CodeBlock(content: formatJSON(args))
        }
      }

      // 3. Live Logs / Output
      if let output = step.output, !output.isEmpty {
        VStack(alignment: .leading, spacing: 4) {
          Label("Logs", systemImage: "terminal")
            .font(Theme.Typography.caption)
            .foregroundColor(Theme.Colors.textTertiary)

          ScrollView {
            Text(output)
              .font(.system(.caption, design: .monospaced))
              .foregroundColor(Theme.Colors.textSecondary)
              .padding(8)
              .frame(maxWidth: .infinity, alignment: .leading)
          }
          .frame(maxHeight: 150)
          .background(Theme.Colors.bg0)
          .cornerRadius(6)
        }
      }

      // 4. Result
      if let result = step.result {
        VStack(alignment: .leading, spacing: 4) {
          Label("Result", systemImage: "arrow.left.circle")
            .font(Theme.Typography.caption)
            .foregroundColor(result.success ? Theme.Colors.success : Theme.Colors.error)

          if let message = result.message {
            Text(message)
              .font(Theme.Typography.caption)
              .foregroundColor(Theme.Colors.textSecondary)
          }
        }
      }
    }
    .padding(12)
  }

  private func formatJSON(_ args: [String: AnyCodable]) -> String {
    // Simple conversion for display
    let dict = args.mapValues { "\($0.value)" }
    return dict.description
  }
}

// MARK: - Helpers

struct StatusIcon: View {
  let status: AgentStep.StepStatus

  var body: some View {
    Group {
      switch status {
      case .pending:
        Circle().stroke(Theme.Colors.textTertiary, lineWidth: 1.5)
      case .running:
        Image(systemName: "gearshape.2.fill")
          .renderingMode(.template)
          .foregroundColor(Theme.Colors.accent)
      case .success:
        Image(systemName: "checkmark.circle.fill")
          .foregroundColor(Theme.Colors.success)
      case .failed:
        Image(systemName: "xmark.circle.fill")
          .foregroundColor(Theme.Colors.error)
      }
    }
    .frame(width: 16, height: 16)
  }
}

struct CodeBlock: View {
  let content: String

  var body: some View {
    Text(content)
      .font(.system(.caption, design: .monospaced))
      .foregroundColor(Theme.Colors.textSecondary)
      .padding(8)
      .background(Theme.Colors.bg1)
      .cornerRadius(6)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}
