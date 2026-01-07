import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct OnboardingResult: Codable {
  let brandKeywords: String
  let webAnalysis: WebAnalysis
  let insAnalysis: InsAnalysis
  let videoAnalysis: VideoAnalysis
  let generatedAssets: GeneratedAssets

  struct WebAnalysis: Codable {
    let modelImageRef: String
    let productImageRef: String
  }
  struct InsAnalysis: Codable {
    let finalImageRef: String
  }
  struct VideoAnalysis: Codable {
    let videoPrompt: String
  }
  struct GeneratedAssets: Codable {
    let webStyleImages: [OnboardingAsset]
    let insStyleImages: [OnboardingAsset]
    let productDisplayImages: [OnboardingAsset]
  }
}

struct OnboardingAsset: Codable, Identifiable {
  let id: String
  let url: String
}

struct BrandOnboardingView: View {
  @State private var webLink: String = ""
  @State private var insLink: String = ""
  @State private var videoUrl: String = ""
  @State private var productImage: UIImage? = nil
  @State private var showingImagePicker = false

  @State private var isAnalyzing = false
  @State private var analysisProgress: Double = 0.0
  @State private var statusMessage: String = ""

  @State private var currentStep: OnboardingStep = .input
  @State private var result: OnboardingResult? = nil

  enum OnboardingStep {
    case input
    case analyzing
    case intermediate
    case results
  }

  var body: some View {
    NavigationView {
      VStack {
        switch currentStep {
        case .input:
          inputForm
        case .analyzing:
          analysisView
        case .intermediate:
          intermediateView
        case .results:
          resultsView
        }
      }
      .navigationTitle("品牌引导流程")
      .navigationBarTitleDisplayMode(.inline)
    }
    .sheet(isPresented: $showingImagePicker) {
      OnboardingImagePicker(image: $productImage)
    }
  }

  // MARK: - Step 1: Input Form
  private var inputForm: some View {
    Form {
      Section(header: Text("品牌资产链接")) {
        TextField("官网商品详情页链接", text: $webLink)
          .autocapitalization(.none)
        TextField("Instagram 内容链接", text: $insLink)
          .autocapitalization(.none)
        TextField("UGC 讲解视频链接", text: $videoUrl)
          .autocapitalization(.none)
      }

      Section(header: Text("商品图")) {
        Button(action: { showingImagePicker = true }) {
          if let image = productImage {
            Image(uiImage: image)
              .resizable()
              .scaledToFit()
              .frame(height: 200)
          } else {
            HStack {
              Image(systemName: "photo.badge.plus")
              Text("点击上传需要模特拍摄的商品图")
            }
            .foregroundColor(.accentColor)
          }
        }
      }

      Button(action: startAnalysis) {
        Text("开始品牌分析")
          .frame(maxWidth: .infinity)
          .padding()
          .background(canStart ? Color.accentColor : Color.gray)
          .foregroundColor(.white)
          .cornerRadius(10)
      }
      .disabled(!canStart)
      .listRowBackground(Color.clear)
    }
  }

  // MARK: - Step 2: Analysis View
  private var analysisView: some View {
    VStack(spacing: 30) {
      Spacer()
      ProgressView(value: analysisProgress, total: 1.0)
        .progressViewStyle(LinearProgressViewStyle())
        .padding()

      Text(statusMessage)
        .font(.headline)

      Text("正在使用 Gemini-3-Flash 分析品牌 DNA...")
        .font(.subheadline)
        .foregroundColor(.secondary)

      Spacer()
    }
    .padding()
  }

  // MARK: - Step 3: Intermediate View
  private var intermediateView: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        Text("分析完成！")
          .font(.title2).bold()

        VStack(alignment: .leading, spacing: 10) {
          Text("品牌风格关键词：").bold()
          Text(result?.brandKeywords ?? "正在分析...")
            .padding()
            .background(Color.secondary.opacity(0.1))
            .cornerRadius(8)
        }

        VStack(alignment: .leading, spacing: 10) {
          Text("反退短视频提示词：").bold()
          Text(result?.videoAnalysis.videoPrompt ?? "正在生成...")
            .italic()
            .padding()
            .background(Color.secondary.opacity(0.1))
            .cornerRadius(8)
        }

        Spacer()

        Button(action: { currentStep = .results }) {
          Text("进入资产生成预览")
            .frame(maxWidth: .infinity)
            .padding()
            .background(Color.accentColor)
            .foregroundColor(.white)
            .cornerRadius(10)
        }
      }
      .padding()
    }
  }

  // MARK: - Step 4: Results View
  private var resultsView: some View {
    List {
      if let assets = result?.generatedAssets {
        Section(header: Text("官网风格图 (2张)")) {
          AssetGrid(assets: assets.webStyleImages)
        }

        Section(header: Text("INS 风格图 (2张)")) {
          AssetGrid(assets: assets.insStyleImages)
        }

        if !assets.productDisplayImages.isEmpty {
          Section(header: Text("商品展示图")) {
            AssetGrid(assets: assets.productDisplayImages)
          }
        }
      }
    }
  }

  // MARK: - Logic
  private var canStart: Bool {
    !webLink.isEmpty && !insLink.isEmpty && productImage != nil
  }

  private func startAnalysis() {
    currentStep = .analyzing
    statusMessage = "正在抓取网页资产..."

    // 模拟进度
    withAnimation { analysisProgress = 0.2 }

    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
      statusMessage = "正在分析 INS 视觉风格..."
      withAnimation { analysisProgress = 0.5 }

      DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
        statusMessage = "正在反推视频提示词..."
        withAnimation { analysisProgress = 0.8 }

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
          statusMessage = "准备就绪"
          withAnimation { analysisProgress = 1.0 }
          currentStep = .intermediate
          // 此处通常会发起 API 请求并获取 result
          mockResult()
        }
      }
    }
  }

  private func mockResult() {
    // Mock data matching the PRD
    self.result = OnboardingResult(
      brandKeywords: "时尚, 前卫, 自由, 复古 Y2K",
      webAnalysis: .init(modelImageRef: "web_1", productImageRef: "web_2"),
      insAnalysis: .init(finalImageRef: "ins_1"),
      videoAnalysis: .init(videoPrompt: "A model walking on the street with vintage film grain."),
      generatedAssets: .init(
        webStyleImages: [.init(id: "1", url: ""), .init(id: "2", url: "")],
        insStyleImages: [.init(id: "3", url: ""), .init(id: "4", url: "")],
        productDisplayImages: [.init(id: "5", url: "")]
      )
    )
  }
}

struct AssetGrid: View {
  let assets: [OnboardingAsset]
  var body: some View {
    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
      ForEach(assets) { asset in
        if let image = decodeBase64(asset.url) {
          Image(uiImage: image)
            .resizable()
            .aspectRatio(9.0 / 16.0, contentMode: .fill)
            .cornerRadius(8)
            .clipped()
        } else {
          Rectangle()
            .fill(Color.secondary.opacity(0.2))
            .aspectRatio(9.0 / 16.0, contentMode: .fill)
            .overlay(Text("AI 生成图").font(.caption))
            .cornerRadius(8)
        }
      }
    }
    .padding(.vertical, 10)
  }

  private func decodeBase64(_ url: String) -> UIImage? {
    guard url.hasPrefix("data:image"),
      let base64String = url.components(separatedBy: ",").last,
      let data = Data(base64Encoded: base64String, options: .ignoreUnknownCharacters)
    else {
      return nil
    }
    return UIImage(data: data)
  }
}

struct OnboardingImagePicker: UIViewControllerRepresentable {
  @Binding var image: UIImage?

  func makeUIViewController(context: Context) -> PHPickerViewController {
    var config = PHPickerConfiguration()
    config.filter = .images
    let picker = PHPickerViewController(configuration: config)
    picker.delegate = context.coordinator
    return picker
  }

  func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}

  func makeCoordinator() -> Coordinator {
    Coordinator(self)
  }

  class Coordinator: NSObject, PHPickerViewControllerDelegate {
    let parent: OnboardingImagePicker

    init(_ parent: OnboardingImagePicker) {
      self.parent = parent
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
      picker.dismiss(animated: true)

      guard let provider = results.first?.itemProvider,
        provider.canLoadObject(ofClass: UIImage.self)
      else { return }

      provider.loadObject(ofClass: UIImage.self) { image, _ in
        DispatchQueue.main.async {
          self.parent.image = image as? UIImage
        }
      }
    }
  }
}
