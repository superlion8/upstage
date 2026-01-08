import SwiftUI

struct ProcessCard: View {
  let steps: [AgentStep]
  let isGenerating: Bool

  @State private var isExpanded: Bool = false

  var body: some View {
    GlassCard(padding: 0) {
      VStack(spacing: 0) {
        // Header (Always visible)
        Button {
          withAnimation {
            isExpanded.toggle()
          }
        } label: {
          HStack(spacing: 12) {
            // Icon State
            Group {
              if isGenerating {
                ProgressView()
                  .scaleEffect(0.8)
              } else {
                Image(systemName: "checkmark.circle.fill")
                  .foregroundColor(Theme.Colors.success)
              }
            }
            .frame(width: 20)

            // Summary Text
            Text(statusText)
              .font(Theme.Typography.caption)
              .foregroundColor(Theme.Colors.textSecondary)

            Spacer()

            // Expand Icon
            Image(systemName: "chevron.right")
              .font(.caption)
              .foregroundColor(Theme.Colors.textTertiary)
              .rotationEffect(.degrees(isExpanded ? 90 : 0))
          }
          .padding(12)
        }

        // Details (Collapsible)
        if isExpanded {
          Divider()
            .background(Theme.Colors.border)

          VStack(alignment: .leading, spacing: 12) {
            ForEach(steps) { step in
              StepRow(step: step)
            }
          }
          .padding(12)
          .transition(.opacity.combined(with: .move(edge: .top)))
        }
      }
    }
  }

  private var statusText: String {
    if isGenerating {
      return "Thinking & Generating · Step \(steps.count)"
    } else {
      return "Process Completed · \(steps.count) Steps"
    }
  }
}

private struct StepRow: View {
  let step: AgentStep

  var body: some View {
    HStack(alignment: .top, spacing: 8) {
      Image(systemName: iconName)
        .font(.caption)
        .foregroundColor(iconColor)
        .frame(width: 16, height: 16)
        .padding(.top, 2)

      VStack(alignment: .leading, spacing: 4) {
        Text(stepTitle)
          .font(Theme.Typography.caption)
          .foregroundColor(Theme.Colors.textPrimary)

        if let message = step.result?.message {
          Text(message)
            .font(Theme.Typography.caption)
            .foregroundColor(Theme.Colors.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
    }
  }

  var iconName: String {
    switch step.type {
    case .thinking: return "brain"
    case .toolCall: return "wrench.and.screwdriver.fill"
    case .toolResult: return "arrow.turn.down.right"
    }
  }

  var iconColor: Color {
    switch step.type {
    case .thinking: return Theme.Colors.accent
    case .toolCall: return Theme.Colors.textTertiary
    case .toolResult: return Theme.Colors.success
    }
  }

  var stepTitle: String {
    switch step.type {
    case .thinking: return "Thinking"
    case .toolCall: return "Call: \(step.tool ?? "Tool")"
    case .toolResult: return "Result"
    }
  }
}
