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

    disableFileProtectionForDownloads()
    BackgroundDownloadKeeper.shared.startKeepAlive()

    return true
  }

  func applicationDidEnterBackground(_ application: UIApplication) {
    disableFileProtectionForDownloads()
    BackgroundDownloadKeeper.shared.handleDidEnterBackground()
  }

  func applicationDidBecomeActive(_ application: UIApplication) {
    BackgroundDownloadKeeper.shared.handleDidBecomeActive()
  }

  private func disableFileProtectionForDownloads() {
    guard let docDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
    let tdDir = docDir.appendingPathComponent("TurboDownloader")
    try? FileManager.default.createDirectory(at: tdDir, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.none])
    try? FileManager.default.setAttributes([.protectionKey: FileProtectionType.none], ofItemAtPath: tdDir.path)
  }
}

class BackgroundDownloadKeeper: NSObject, AVAudioPlayerDelegate {
  static let shared = BackgroundDownloadKeeper()
  private var audioPlayer: AVAudioPlayer?
  private var bgTask: UIBackgroundTaskIdentifier = .invalid
  private var isRunning = false

  func startKeepAlive() {
    guard !isRunning else { return }
    isRunning = true

    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
      try session.setActive(true)

      let soundData = generateSilentAudioWav()
      audioPlayer = try AVAudioPlayer(data: soundData)
      audioPlayer?.delegate = self
      audioPlayer?.numberOfLoops = -1 // Infinite loop
      audioPlayer?.volume = 0.001     // Inaudible
      audioPlayer?.prepareToPlay()
      audioPlayer?.play()
      NotificationCenter.default.addObserver(
        self,
        selector: #selector(handleAudioInterruption(_:)),
        name: AVAudioSession.interruptionNotification,
        object: nil
      )

      print("[TurboDownloader] Background download keep-alive ACTIVE (silent audio loop)")
    } catch {
      print("[TurboDownloader] Background session error: \(error)")
    }
  }

  @objc private func handleAudioInterruption(_ notification: Notification) {
    guard let userInfo = notification.userInfo,
          let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }

    if type == .ended {
      if let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt {
        let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
        if options.contains(.shouldResume) {
          audioPlayer?.play()
        }
      } else {
        audioPlayer?.play()
      }
    }
  }

  func handleDidEnterBackground() {
    // Assert background task to give extra runway
    if bgTask == .invalid {
      bgTask = UIApplication.shared.beginBackgroundTask(withName: "TurboDownloaderBG") { [weak self] in
        self?.endBackgroundTask()
      }
    }

    // Ensure audio player is actively playing
    if audioPlayer == nil || audioPlayer?.isPlaying == false {
      startKeepAlive()
    }
  }

  func handleDidBecomeActive() {
    endBackgroundTask()
    // Keep audio player active to avoid failure when re-entering background
    if audioPlayer == nil || audioPlayer?.isPlaying == false {
      startKeepAlive()
    }
  }

  private func endBackgroundTask() {
    if bgTask != .invalid {
      let task = bgTask
      bgTask = .invalid
      UIApplication.shared.endBackgroundTask(task)
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
