import SwiftUI

/// Agent 步骤展示视图 - 类似 Cursor 风格
struct AgentStepsView: View {
    let steps: [AgentStep]
    let thinking: String?
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // 思考过程
            if let thinking = thinking, !thinking.isEmpty {
                AgentStepCard(
                    icon: "brain.head.profile",
                    iconColor: .purple,
                    title: "思考中",
                    isExpandedByDefault: false
                ) {
                    Text(thinking)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            
            // 工具调用步骤
            ForEach(steps) { step in
                AgentStepCard(
                    icon: iconForStep(step),
                    iconColor: colorForStep(step),
                    title: titleForStep(step),
                    subtitle: subtitleForStep(step),
                    isExpandedByDefault: false
                ) {
                    stepDetailView(step)
                }
            }
        }
    }
    
    private func iconForStep(_ step: AgentStep) -> String {
        switch step.type {
        case .thinking:
            return "brain.head.profile"
        case .toolCall:
            return "wrench.and.screwdriver"
        case .toolResult:
            return step.result?.success == true ? "checkmark.circle" : "xmark.circle"
        }
    }
    
    private func colorForStep(_ step: AgentStep) -> Color {
        switch step.type {
        case .thinking:
            return .purple
        case .toolCall:
            return .blue
        case .toolResult:
            return step.result?.success == true ? .green : .red
        }
    }
    
    private func titleForStep(_ step: AgentStep) -> String {
        switch step.type {
        case .thinking:
            return "思考"
        case .toolCall:
            // 显示中文名称 + 原始工具名
            let displayName = toolDisplayName(step.tool ?? "unknown")
            let originalName = step.tool ?? "unknown"
            return "\(displayName) (\(originalName))"
        case .toolResult:
            let success = step.result?.success == true
            return "\(toolDisplayName(step.tool ?? "")) \(success ? "完成" : "失败")"
        }
    }
    
    private func subtitleForStep(_ step: AgentStep) -> String? {
        // 显示工具执行结果消息
        return step.result?.message
    }
    
    private func toolDisplayName(_ tool: String) -> String {
        switch tool {
        case "stylist":
            return "搭配师"
        case "analyze_image":
            return "图像分析"
        case "generate_model_image":
            return "生成模特图"
        case "change_outfit":
            return "换搭配"
        case "change_model":
            return "换模特"
        case "replicate_reference":
            return "复刻参考"
        case "edit_image":
            return "编辑图片"
        default:
            return tool
        }
    }
    
    @ViewBuilder
    private func stepDetailView(_ step: AgentStep) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            // 参数
            if let args = step.arguments, !args.isEmpty {
                ForEach(Array(args.keys.sorted()), id: \.self) { key in
                    HStack(alignment: .top, spacing: 4) {
                        Text("\(formatArgKey(key)):")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                        Text(formatArgValue(args[key]))
                            .font(.caption2)
                            .foregroundColor(.primary)
                            .lineLimit(2)
                    }
                }
            }
            
            // 结果
            if let result = step.result {
                if let message = result.message {
                    Text(message)
                        .font(.caption)
                        .foregroundColor(result.success ? .green : .red)
                }
                if result.hasImages == true {
                    HStack(spacing: 4) {
                        Image(systemName: "photo.fill")
                        Text("已生成图片")
                    }
                    .font(.caption)
                    .foregroundColor(.green)
                }
            }
        }
    }
    
    private func formatArgKey(_ key: String) -> String {
        switch key {
        case "product_image": return "商品图"
        case "model_image": return "模特图"
        case "scene_image": return "场景图"
        case "style_preference": return "风格偏好"
        case "image_ref": return "图片"
        case "analysis_type": return "分析类型"
        default: return key
        }
    }
    
    private func formatArgValue(_ value: AnyCodable?) -> String {
        guard let value = value else { return "-" }
        return String(describing: value.value)
    }
}

/// 可展开/收起的步骤卡片
struct AgentStepCard<Content: View>: View {
    let icon: String
    let iconColor: Color
    let title: String
    var subtitle: String? = nil
    var isExpandedByDefault: Bool = false
    @ViewBuilder let content: () -> Content
    
    @State private var isExpanded: Bool = false
    
    init(
        icon: String,
        iconColor: Color,
        title: String,
        subtitle: String? = nil,
        isExpandedByDefault: Bool = false,
        @ViewBuilder content: @escaping () -> Content
    ) {
        self.icon = icon
        self.iconColor = iconColor
        self.title = title
        self.subtitle = subtitle
        self.isExpandedByDefault = isExpandedByDefault
        self.content = content
        self._isExpanded = State(initialValue: isExpandedByDefault)
    }
    
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isExpanded.toggle()
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: icon)
                        .font(.caption)
                        .foregroundColor(iconColor)
                        .frame(width: 16)
                    
                    Text(title)
                        .font(.caption)
                        .fontWeight(.medium)
                        .foregroundColor(.primary)
                    
                    if let subtitle = subtitle {
                        Text("· \(subtitle)")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                            .lineLimit(1)
                    }
                    
                    Spacer()
                    
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }
            .buttonStyle(.plain)
            
            // Content
            if isExpanded {
                Divider()
                    .padding(.horizontal, 12)
                
                content()
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .background(Color(.systemGray6).opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color(.systemGray4).opacity(0.5), lineWidth: 0.5)
        )
    }
}

#Preview {
    VStack(spacing: 16) {
        AgentStepsView(
            steps: [
                AgentStep(
                    type: .toolCall,
                    tool: "stylist",
                    arguments: [
                        "product_image": AnyCodable("image_1"),
                        "style_preference": AnyCodable("简约高级")
                    ],
                    result: StepResult(success: true, message: "搭配方案已生成", hasImages: false)
                ),
                AgentStep(
                    type: .toolCall,
                    tool: "generate_model_image",
                    arguments: [
                        "product_image": AnyCodable("image_1")
                    ],
                    result: StepResult(success: true, message: "模特图生成完成", hasImages: true)
                )
            ],
            thinking: "用户上传了一张商品图，我需要先分析图片内容，然后生成搭配建议..."
        )
    }
    .padding()
}

