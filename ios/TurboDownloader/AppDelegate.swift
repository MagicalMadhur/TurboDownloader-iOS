import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import AVFoundation

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "TurboDownloader",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  func applicationDidEnterBackground(_ application: UIApplication) {
    // If active downloads exist, start background keep-alive to prevent iOS 180s deep-sleep kill
    if hasActiveDownloads() {
      BackgroundDownloadKeeper.shared.startKeepAlive()
    }
  }

  func applicationDidBecomeActive(_ application: UIApplication) {
    BackgroundDownloadKeeper.shared.stopKeepAlive()
  }

  private func hasActiveDownloads() -> Bool {
    guard let docDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
      return false
    }
    let lockFile = docDir.appendingPathComponent("TurboDownloader/.active_download_lock")
    return FileManager.default.fileExists(atPath: lockFile.path)
  }
}

class BackgroundDownloadKeeper: NSObject {
  static let shared = BackgroundDownloadKeeper()
  private var audioPlayer: AVAudioPlayer?
  private var bgTask: UIBackgroundTaskIdentifier = .invalid

  func startKeepAlive() {
    if bgTask == .invalid {
      bgTask = UIApplication.shared.beginBackgroundTask(withName: "TurboDownloaderNightBG") { [weak self] in
        self?.endBackgroundTask()
      }
    }

    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
      try session.setActive(true)

      if audioPlayer == nil {
        let soundData = generateSilentAudioWav()
        audioPlayer = try AVAudioPlayer(data: soundData)
        audioPlayer?.numberOfLoops = -1
        audioPlayer?.volume = 0.01
        audioPlayer?.prepareToPlay()
      }
      audioPlayer?.play()
      print("[TurboDownloader] Background download keep-alive ACTIVE")
    } catch {
      print("[TurboDownloader] Background session error: \(error)")
    }
  }

  func stopKeepAlive() {
    audioPlayer?.stop()
    audioPlayer = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    endBackgroundTask()
    print("[TurboDownloader] Background download keep-alive STOPPED")
  }

  private func endBackgroundTask() {
    if bgTask != .invalid {
      UIApplication.shared.endBackgroundTask(bgTask)
      bgTask = .invalid
    }
  }

  // Generates 1-second 8kHz silent PCM WAV in memory
  private func generateSilentAudioWav() -> Data {
    let sampleRate: Int32 = 8000
    let numChannels: Int16 = 1
    let bitsPerSample: Int16 = 16
    let numSamples: Int32 = sampleRate * 1
    let subChunk2Size: Int32 = numSamples * Int32(numChannels) * Int32(bitsPerSample / 8)
    let chunkSize: Int32 = 36 + subChunk2Size

    var data = Data()
    data.append(contentsOf: "RIFF".utf8)
    data.append(withUnsafeBytes(of: chunkSize.littleEndian) { Data($0) })
    data.append(contentsOf: "WAVE".utf8)
    data.append(contentsOf: "fmt ".utf8)
    let subChunk1Size: Int32 = 16
    let audioFormat: Int16 = 1
    let byteRate: Int32 = sampleRate * Int32(numChannels) * Int32(bitsPerSample / 8)
    let blockAlign: Int16 = numChannels * (bitsPerSample / 8)
    data.append(withUnsafeBytes(of: subChunk1Size.littleEndian) { Data($0) })
    data.append(withUnsafeBytes(of: audioFormat.littleEndian) { Data($0) })
    data.append(withUnsafeBytes(of: numChannels.littleEndian) { Data($0) })
    data.append(withUnsafeBytes(of: sampleRate.littleEndian) { Data($0) })
    data.append(withUnsafeBytes(of: byteRate.littleEndian) { Data($0) })
    data.append(withUnsafeBytes(of: blockAlign.littleEndian) { Data($0) })
    data.append(withUnsafeBytes(of: bitsPerSample.littleEndian) { Data($0) })
    data.append(contentsOf: "data".utf8)
    data.append(withUnsafeBytes(of: subChunk2Size.littleEndian) { Data($0) })
    data.append(Data(repeating: 0, count: Int(subChunk2Size)))
    return data
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
